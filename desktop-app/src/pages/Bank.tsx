import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { takeOpenArg, openTool } from '@/lib/openTool'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Empty, Icon, Panel, Modal, confirmDialog, Skeleton, FIELD, FIELD_SM, TEXTAREA, Segmented, useNarrow, toast } from '@/lib/ui'
import { PageHeader, UnderlineTabs } from '@/components/Kit'
import type { OrgState } from '@/lib/data'
import { fetchAllRows, useBankUsage, quotaIssue, fmtBytes, videoThumb, PLAN_LABEL } from '@/lib/bankStorage'
import { cachedSigned, signPaths, signedUrl, forgetSigned } from '@/lib/signedUrls'

// File System Access API (Chrome/Edge) — type minimal pour l'écriture streaming du ZIP.
type FSHandle = { createWritable: () => Promise<WritableStream> }

// ── Type ContentItem (sous-ensemble RÉEL de la table `content_bank`, aligné sur
//    electron-app/src/lib/supabase.ts). Lecture seule pour cette passe. ──────────
interface ContentItem {
  id: string
  title: string
  folder: string | null
  file_url: string | null       // chemin local legacy (rows non migrés)
  storage_path: string | null   // objet dans le bucket "content"
  thumbnail_path: string | null // miniature dans le même bucket
  thumbnail_url: string | null  // URL directe éventuelle
  duration: number | null       // secondes
  used_count: number | null     // nb de publications
  notes: string | null
  tags: string[] | null
  description?: string | null   // légende propre au média (pré-remplit le post)
  created_at: string
  deleted_at?: string | null    // corbeille : soft-delete (restaurable 7 j)
}

// Les lignes « sentinelles » matérialisent un dossier vide (aucun média) — on les
// exclut de la grille mais on garde leur nom pour la colonne Dossiers.
const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
function isSentinel(i: ContentItem): boolean {
  return SENTINELS.includes(i.notes ?? '') && !i.storage_path && !i.file_url
}

// ── Type de média inféré de l'extension (même logique que electron Bank.tsx) ────
type MediaType = 'video' | 'image'
function inferType(i: ContentItem): MediaType {
  const src = (i.storage_path ?? i.file_url ?? '').toLowerCase().split('?')[0]
  const ext = src.split('.').pop() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif'].includes(ext)) return 'image'
  return 'video'
}

function fmtDuration(s: number | null): string {
  if (!s || s <= 0) return ''
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Teinte déterministe par item (portée du prototype _tile) — même id ⇒ même teinte.
const HUES = ['139,92,246', '6,182,212', '236,72,153', '16,185,129', '245,158,11', '99,102,241']
function hueFor(id: string): string {
  let h = 0
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0
  return HUES[h % HUES.length]
}

type TabKey = 'video' | 'image' | 'caption'
interface Caption { id: string; title: string | null; content: string; used_count: number | null; created_at: string }
type SortKey = 'recent' | 'name' | 'used'

// ── Case à cocher de vignette (portée du prototype _tile) — cliquable ──────────
function TileCheck({ on, onToggle, accent = '#8B7CF6' }: { on: boolean; onToggle: (e: React.MouseEvent) => void; accent?: string }) {
  return (
    <span
      data-tile-check=""
      onClick={e => { e.stopPropagation(); onToggle(e) }}
      title="Sélectionner · Maj+clic pour sélectionner un intervalle"
      style={{
        position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 4, cursor: 'pointer', zIndex: 3,
        background: on ? accent : 'rgba(10,10,11,0.7)',
        border: on ? 'none' : '1px solid rgba(255,255,255,0.22)',
        color: '#fff', fontSize: 11, fontWeight: 600,
      }}>{on ? '✓' : ''}</span>
  )
}

// ── Aperçu vidéo LAZY : on ne monte le <video> QUE lorsque la tuile est visible.
//    Sans ça, chaque vidéo montait un <video> en permanence ; au-delà de ~75 décodages
//    simultanés le navigateur en abandonne → miniatures blanches ET lecture noire
//    (décodeurs saturés). On NE touche PAS à crossOrigin (ça empoisonnait le cache de
//    l'URL → la lecture devenait noire). Hors écran → placeholder. ────────────────────
function useInView(ref: React.RefObject<HTMLElement | null>, rootMargin = '400px'): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(entries => setInView(!!entries[0]?.isIntersecting), { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin])
  return inView
}

// ── Vignette 9/16 (vidéo) ou 4/5 (image). Vraie miniature si dispo, sinon un
//    placeholder à rayures diagonales CSS teinté (aucune image inventée). ────────
function Tile({ item, type, thumb, media, on, theme, onToggle, onOpen, onDragStart, onContextMenu, selecting = false, idx, broken = false, onStale }: {
  item: ContentItem; type: MediaType; thumb: string | null; media: string | null; on: boolean; theme: Theme; onToggle: (e: React.MouseEvent) => void; onOpen?: () => void; onDragStart?: (e: React.DragEvent) => void; onContextMenu?: (e: React.MouseEvent) => void
  selecting?: boolean; idx?: number; broken?: boolean
  /** Le lien n'a pas chargé : on en redemande un neuf (une fois) au lieu de rester sur le repli. */
  onStale?: () => void
}) {
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  // Nouveau lien → nouvel essai ; 1er échec → lien re-signé ; 2e échec → repli lisible.
  const retried = useRef(false)
  useEffect(() => { setFailed(false); setReady(false) }, [thumb, media])
  const onErr = () => { if (!retried.current && onStale) { retried.current = true; onStale() } else setFailed(true) }
  const ext = ((item.storage_path ?? item.file_url ?? '').split('?')[0].split('.').pop() ?? '').toUpperCase().slice(0, 4)
  const fresh = (item.used_count ?? 0) === 0
  const dur = type === 'video' ? fmtDuration(item.duration) : ''
  const btnRef = useRef<HTMLButtonElement>(null)
  const inView = useInView(btnRef)
  const placeholder: CSSProperties = {
    position: 'absolute', inset: 0,
    background: '#161618',
  }
  // Vignette de repli lisible (jamais un carré vide) : format non lisible par le navigateur
  // (ex. .MOV HEVC d'iPhone), ou fichier introuvable dans le stockage.
  const fallback = (
    <span style={{ ...placeholder, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: broken ? 'repeating-linear-gradient(135deg,#1A1215,#1A1215 8px,#16101299 8px,#16101299 16px)' : `linear-gradient(160deg, rgba(${hueFor(item.id)},0.28), #161618)`, color: broken ? '#F87171' : 'rgba(255,255,255,0.7)' }}>
      <Icon d={broken ? 'M12 9v4|M12 17h.01|M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' : type === 'video' ? 'M6 4l14 8-14 8V4z' : 'M3 3h18v18H3z|M21 15l-5-5L5 21'} size={18} />
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em' }}>{broken ? 'Fichier introuvable' : ext || (type === 'video' ? 'VIDÉO' : 'IMAGE')}</span>
    </span>
  )
  return (
    <button
      ref={btnRef}
      data-tile-idx={idx}
      // Mode sélection (≥ 1 média coché) : un clic n'importe où sur la vignette la coche.
      onClick={selecting ? onToggle : onOpen}
      onContextMenu={onContextMenu}
      draggable={!selecting}
      onDragStart={onDragStart}
      title={selecting ? 'Clic pour cocher / décocher · glisse pour en cocher plusieurs' : 'Clic pour lire · reste appuyé pour sélectionner · clic droit pour les actions'}
      style={{
        position: 'relative', aspectRatio: type === 'image' ? '4 / 5' : '9 / 16', borderRadius: 14, padding: 0,
        cursor: 'pointer', overflow: 'hidden', transition: 'border-color .15s ease, transform .15s ease, box-shadow .15s ease',
        border: `1px solid ${on ? '#A78BFA' : 'rgba(255,255,255,0.07)'}`,
        boxShadow: on ? '0 0 0 2px #A78BFA' : 'none', transform: on ? 'scale(0.97)' : 'none',
        WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
        background: '#161618',
      }}
    >
      {broken || failed ? fallback : thumb
        ? <img src={thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={onErr} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : type === 'video'
          // Vidéo : aperçu (1re image) monté SEULEMENT si la tuile est visible → limite
          // le nombre de <video> décodés en même temps. Hors écran → placeholder.
          // Le repli (format + icône) reste dessous tant que la 1re image n'est pas peinte :
          // jamais de tuile noire vide pendant le chargement (ou si le navigateur ne décode pas).
          ? <>{fallback}{media && inView && <video src={`${media}#t=0.1`} muted playsInline preload="metadata" onError={onErr} onLoadedData={e => setReady(e.currentTarget.videoWidth > 0)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: ready ? 1 : 0, transition: 'opacity .25s ease' }} />}</>
          : media && inView
            ? <img src={media} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={onErr} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={placeholder} />}

      <TileCheck on={on} onToggle={onToggle} accent={theme.accent} />

      {fresh && (
        <span style={{
          position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', boxSizing: 'border-box', borderRadius: 99,
          background: 'rgba(10,10,11,0.7)', backdropFilter: 'blur(6px)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ADE80', fontSize: 10.5, fontWeight: 750, letterSpacing: '.04em',
        }}>NEUF</span>
      )}

      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '24px 10px 8px',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'linear-gradient(180deg, transparent, rgba(10,10,11,0.88))',
      }}>
        <span data-no-tr style={{
          flex: 1, minWidth: 0, fontSize: 12, fontWeight: 650, textAlign: 'left',
          color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.title}</span>
        {dur && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{dur}</span>}
      </span>
    </button>
  )
}


export default function Bank({ theme, infra, user, org, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onNavigate?: (p: string) => void
}) {
  const { currentOrg } = org
  const [items, setItems] = useState<ContentItem[]>([])
  const [trash, setTrash] = useState<ContentItem[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [folderNames, setFolderNames] = useState<string[]>([]) // dossiers vides (sentinelles)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<TabKey>(() => (takeOpenArg<{ tab?: TabKey }>('bank')?.tab) ?? 'video')
  const [captions, setCaptions] = useState<Caption[]>([])
  const [capOpen, setCapOpen] = useState(false)
  const [capTitle, setCapTitle] = useState('')
  const [capContent, setCapContent] = useState('')
  const [savingCap, setSavingCap] = useState(false)
  const [folder, setFolder] = useState<string>('Tous')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [sel, setSel] = useState<Set<string>>(new Set())

  // ── Chargement (requête IDENTIQUE à electron Bank.tsx : select * scoping org/user) ──
  // Paginé (au-delà de 1000 lignes Supabase coupait en silence → des médias « disparaissaient »),
  // et seule la DERNIÈRE requête compte (changement d'espace perso / organisation en cours).
  const loadSeq = useRef(0)
  // Squelette SEULEMENT au premier chargement d'un espace : après une action (suppression,
  // déplacement, import, Actualiser) la grille reste affichée, sans saut ni rechargement.
  const loadedFor = useRef<string | null>(null)
  const load = useCallback(async () => {
    if (org.loading) return
    const seq = ++loadSeq.current
    const scopeKey = currentOrg?.id ?? `u:${user.id}`
    if (loadedFor.current !== scopeKey) setLoading(true)
    setError(null)
    const make = () => {
      const q = supabase.from('content_bank').select('*').order('created_at', { ascending: false }).order('id')
      return currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    }
    const { data, error: err } = await fetchAllRows<ContentItem>(make)
    if (seq !== loadSeq.current) return
    if (err) { setError('Erreur lors du chargement de la banque.'); setLoading(false); return }
    const rows = data
    setFolderNames(rows.filter(isSentinel).map(r => r.folder ?? r.title).filter((f): f is string => Boolean(f)))
    // Médias en corbeille (deleted_at) exclus de la banque, listés à part (restaurable 7 j).
    setItems(rows.filter(r => !isSentinel(r) && !r.deleted_at))
    setTrash(rows.filter(r => !isSentinel(r) && !!r.deleted_at).sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')))
    loadedFor.current = scopeKey
    setLoading(false)
  }, [currentOrg?.id, user.id, org.loading])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSel(new Set()) }, [tab, folder])

  // ── Légendes (caption_bank) ──────────────────────────────────────────────────
  const loadCaptions = useCallback(async () => {
    const q = currentOrg
      ? supabase.from('caption_bank').select('id,title,content,used_count,created_at').eq('org_id', currentOrg.id)
      : supabase.from('caption_bank').select('id,title,content,used_count,created_at').eq('user_id', user.id).is('org_id', null)
    const { data } = await q.order('created_at', { ascending: false })
    setCaptions((data ?? []) as Caption[])
  }, [currentOrg?.id, user.id])
  useEffect(() => { loadCaptions() }, [loadCaptions])

  async function addCaption() {
    if (!capContent.trim()) return
    setSavingCap(true)
    const { error: err } = await supabase.from('caption_bank').insert({
      user_id: user.id, org_id: currentOrg?.id ?? null,
      title: capTitle.trim() || capContent.trim().slice(0, 40), content: capContent.trim(), used_count: 0,
    })
    setSavingCap(false)
    if (!err) { setCapOpen(false); setCapTitle(''); setCapContent(''); loadCaptions() }
  }
  async function deleteCaption(id: string) {
    await supabase.from('caption_bank').delete().eq('id', id)
    setCaptions(c => c.filter(x => x.id !== id))
  }

  // ── Signatures : bucket privé. On signe les thumbnail_path ET les storage_path
  //    (média source) — mais PAR LOTS de 100 (createSignedUrls échoue si on lui passe
  //    des centaines de chemins d'un coup → c'était la régression des vignettes). On
  //    fusionne les résultats au fur et à mesure. ─────────────────────────────────────
  // URLs valables 6 h et RE-signées toutes les 5 h (avant : 1 h jamais renouvelée → vignettes
  // et lecture vides si l'app restait ouverte). Lot en échec → nouvel essai. Les chemins que
  // le stockage ne connaît pas sont notés « introuvables » (fichier réellement disparu).
  // Liens PARTAGÉS et gardés 6 h (lib/signedUrls) : un fichier déjà signé garde son lien → le
  // navigateur réutilise son cache, rien ne se recharge après une action. Seules les vignettes
  // AFFICHÉES (onglet et dossier ouverts, au fil du défilement) sont signées — voir plus bas.
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [signTick, setSignTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setSignTick(t => t + 1), 30 * 60_000); return () => clearInterval(id) }, [])

  // Lien qui n'a pas chargé (expiré, coupure) : oublié puis re-signé → la tuile réessaie.
  async function refreshLinks(i: ContentItem) {
    const paths = [i.thumbnail_path, i.storage_path].filter((p): p is string => !!p)
    paths.forEach(forgetSigned)
    await signPaths(paths, fresh => setThumbs(prev => ({ ...prev, ...fresh })))
  }

  function thumbFor(i: ContentItem): string | null {
    if (i.thumbnail_url) return i.thumbnail_url
    if (i.thumbnail_path && thumbs[i.thumbnail_path]) return thumbs[i.thumbnail_path]
    return null
  }
  // URL signée du média source (pour afficher la vidéo/image quand pas de miniature).
  function mediaFor(i: ContentItem): string | null {
    if (i.storage_path && thumbs[i.storage_path]) return thumbs[i.storage_path]
    return i.file_url && /^https?:/i.test(i.file_url) ? i.file_url : null
  }
  // Média VIDE : fichier absent du stockage, ou ancien chemin local (C:\…) jamais migré.
  const isBroken = (i: ContentItem) => (!!i.storage_path && missing.has(i.storage_path)) || (!i.storage_path && !(i.file_url && /^https?:/i.test(i.file_url)))
  const broken = useMemo(() => items.filter(isBroken), [items, missing])
  async function cleanBroken() {
    if (!broken.length) return
    if (!await confirmDialog({ title: `Retirer ${broken.length} fichier(s) vide(s) ?`, text: 'Leur fichier n’existe plus (envoi interrompu ou supprimé). On retire juste ces lignes vides de ta banque.', confirmLabel: 'Nettoyer' })) return
    const ids = broken.map(b => b.id)
    let removed = 0
    for (let k = 0; k < ids.length; k += 200) {
      const part = ids.slice(k, k + 200)
      const r = await scopeQ(supabase.from('content_bank').delete().in('id', part).select('id'))
      if (!r.error) removed += (r.data?.length ?? 0)
      else { const rpc = await supabase.rpc('delete_bank_items', { p_ids: part }); if (!rpc.error) removed += part.length }
    }
    toast(removed ? `${removed} fichier(s) vide(s) retiré(s).` : 'Impossible de retirer ces fichiers (droits insuffisants).', removed ? 'ok' : 'bad')
    load()
  }

  // Compteurs par type (réels).
  const counts = useMemo(() => {
    let v = 0, im = 0
    items.forEach(i => { inferType(i) === 'image' ? im++ : v++ })
    return { video: v, image: im }
  }, [items])

  // Items du type actif.
  const typed = useMemo(() => items.filter(i => inferType(i) === tab), [items, tab])

  // Dossiers dérivés des vrais dossiers (+ dossiers vides sentinelles), avec compte.
  const folders = useMemo(() => {
    const names = new Set<string>()
    typed.forEach(i => { if (i.folder) names.add(i.folder) })
    folderNames.forEach(n => names.add(n))
    const list = [...names].sort((a, b) => a.localeCompare(b))
    const countIn = (f: string) => typed.filter(i => i.folder === f).length
    return [
      { n: 'Tous', c: typed.length, special: false },
      ...list.map(n => ({ n, c: countIn(n), special: false })),
      { n: 'Jamais publiées', c: typed.filter(i => (i.used_count ?? 0) === 0).length, special: true },
    ]
  }, [typed, folderNames])

  // ── Import RÉEL (upload → bucket content → insert content_bank) ──────────────
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const scopeFolder = currentOrg ? `orgs/${currentOrg.id}` : `users/${user.id}`
  const { usage, reload: reloadUsage } = useBankUsage(currentOrg?.id ?? null)
  const IMG = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']

  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    // Limite d'espace de l'abonnement (le stockage la vérifie aussi côté serveur).
    const u = await reloadUsage()
    const over = quotaIssue(u, list.reduce((s, f) => s + f.size, 0))
    if (over) { toast(over, 'bad', 9000); return }
    let done = 0, ok = 0
    const fails: string[] = []
    for (const file of list) {
      setUploading(`${file.name} (${++done}/${list.length})`)
      try {
        let ext = (file.name.split('.').pop() ?? '').toLowerCase()
        if (!ext) ext = file.type.startsWith('image') ? 'jpg' : 'mp4'
        const id = crypto.randomUUID()
        const storagePath = `videos/${scopeFolder}/${id}.${ext}`
        const up = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
        if (up.error) { fails.push(`${file.name} : ${/row-level security|policy/i.test(up.error.message) ? 'espace plein ou accès refusé' : up.error.message}`); continue }
        // Miniature + durée générées tout de suite (avant : aucune miniature → vignettes vides).
        let thumbPath: string | null = null, duration: number | null = null
        if (!file.type.startsWith('image') && !IMG.includes(ext)) {
          const th = await videoThumb(file)
          if (th) {
            duration = th.duration || null
            const tp = `videos/${scopeFolder}/${id}_thumb.jpg`
            const tu = await supabase.storage.from('content').upload(tp, th.blob, { contentType: 'image/jpeg', upsert: false })
            if (!tu.error) thumbPath = tp
          }
        }
        const dest = (folder !== 'Tous' && folder !== 'Jamais publiées') ? folder : null
        const ins = await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          title: file.name.replace(/\.[a-z0-9]+$/i, ''), storage_path: storagePath, thumbnail_path: thumbPath,
          file_url: null, folder: dest, duration, tags: [], notes: null, used_count: 0,
        })
        if (ins.error) {   // ligne refusée → on ne laisse pas un fichier orphelin dans le stockage
          await supabase.storage.from('content').remove([storagePath, ...(thumbPath ? [thumbPath] : [])]).catch(() => {})
          fails.push(`${file.name} : ${ins.error.message}`); continue
        }
        ok++
      } catch (e) { fails.push(`${file.name} : ${e instanceof Error ? e.message : 'erreur'}`) }
    }
    setUploading(null)
    if (fails.length) toast(`${ok}/${list.length} importé(s). Échec : ${fails.slice(0, 3).join(' · ')}${fails.length > 3 ? '…' : ''}`, ok ? 'info' : 'bad', 9000)
    else toast(`${ok} fichier(s) importé(s).`, 'ok')
    void reloadUsage()
    load()
  }

  // Glisser-déposer de fichiers depuis le PC → import direct dans la banque.
  const [dragFiles, setDragFiles] = useState(false)

  // ── Suppression (média unitaire ou sélection) + nettoyage du storage ─────────
  const [confirmDel, setConfirmDel] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Télécharge les médias sélectionnés. 1 seul → fichier direct ; plusieurs → un ZIP.
  // Les VIDÉOS sortent en .mov (les images gardent leur extension réelle).
  async function urlForItem(it: ContentItem): Promise<string | null> {
    if (it.storage_path) {
      const u = await signedUrl(it.storage_path)
      if (u) return u
    }
    return it.file_url ?? null
  }
  // Nom de fichier : vidéos → .mov, images → extension réelle. `taken` évite les doublons.
  function fileNameFor(it: ContentItem, taken: Set<string>): string {
    const isImg = inferType(it) === 'image'
    const realExt = ((it.storage_path ?? it.file_url ?? '').split('?')[0].split('.').pop() || (isImg ? 'jpg' : 'mp4')).toLowerCase()
    const ext = isImg ? realExt : 'mov'
    const base = (it.title || 'media').replace(/[^\w.-]+/g, '_')
    let name = `${base}.${ext}`; let n = 2
    while (taken.has(name)) name = `${base}_${n++}.${ext}`
    taken.add(name); return name
  }
  async function downloadMedia(ids: string[]) {
    if (ids.length === 0) return
    const targets = ids.map(id => items.find(x => x.id === id)).filter((x): x is ContentItem => !!x)
    if (targets.length === 0) return

    // Un seul média → téléchargement direct.
    if (targets.length === 1) {
      const it = targets[0]
      const url = await urlForItem(it); if (!url) return
      try {
        const blob = await (await fetch(url)).blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fileNameFor(it, new Set())
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      } catch { setNotice('Échec du téléchargement.') }
      return
    }

    // Plusieurs médias → un seul .zip.
    const zipName = `scaleflow-medias-${new Date().toISOString().slice(0, 10)}.zip`

    // Chrome/Edge : ÉCRITURE STREAMING sur le disque (client-zip → pipeTo). Chaque
    // vidéo est téléchargée puis écrite au fil de l'eau — RIEN n'est gardé en mémoire,
    // donc ça marche pour des CENTAINES de vidéos (le blob en mémoire plantait avant).
    const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FSHandle> }).showSaveFilePicker
    if (picker) {
      let handle: FSHandle | null = null
      try { handle = await picker({ suggestedName: zipName, types: [{ description: 'Archive ZIP', accept: { 'application/zip': ['.zip'] } }] }) }
      catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; handle = null }
      if (handle) {
        try {
          const { downloadZip } = await import('client-zip')
          const taken = new Set<string>()
          let done = 0, ok = 0
          async function* gen() {
            for (const it of targets) {
              setNotice(`ZIP : ${++done}/${targets.length}…`)
              const url = await urlForItem(it); if (!url) continue
              let resp: Response
              try { resp = await fetch(url) } catch { continue }
              if (!resp.ok || !resp.body) continue
              ok++
              yield { name: fileNameFor(it, taken), input: resp }
            }
          }
          const zipResp = downloadZip(gen())
          const writable = await handle.createWritable()
          await zipResp.body!.pipeTo(writable as unknown as WritableStream)
          setNotice(ok > 0 ? `ZIP enregistré — ${ok} fichier(s).` : 'Aucun fichier récupéré (réseau/CORS ?).')
        } catch (e) { setNotice(`Échec du ZIP : ${e instanceof Error ? e.message : String(e)}`) }
        return
      }
    }

    // Repli (Firefox/Safari, pas de File System Access) : ZIP en mémoire (STORE),
    // récupération à concurrence limitée. Convient aux lots modérés.
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const taken = new Set<string>()
      const CONC = 12
      let next = 0, ok = 0, done = 0
      const worker = async () => {
        for (;;) {
          const my = next++; if (my >= targets.length) break
          const it = targets[my]
          try {
            const url = await urlForItem(it)
            if (url) { const resp = await fetch(url); if (resp.ok) { zip.file(fileNameFor(it, taken), await resp.blob()); ok++ } }
          } catch { /* ignore */ }
          setNotice(`ZIP : récupération ${++done}/${targets.length}…`)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, worker))
      if (ok === 0) { setNotice('Aucun fichier récupéré (réseau/CORS ?).'); return }
      setNotice(`ZIP : assemblage de ${ok} fichier(s)…`)
      const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, m => setNotice(`ZIP : ${Math.round(m.percent)}%…`))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(out); a.download = zipName
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 20000)
      setNotice(`ZIP téléchargé — ${ok} fichier(s).`)
    } catch (e) { setNotice(`Échec du ZIP : ${e instanceof Error ? e.message : String(e)}`) }
  }

  async function deleteMedia(ids: string[]) {
    if (ids.length === 0) return
    setDeleting(true)
    const chunk = <T,>(a: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

    // SOFT-DELETE : on met en CORBEILLE (deleted_at) au lieu de supprimer définitivement —
    // restaurable 7 jours, le fichier storage est conservé.
    let deleted = 0; let firstErr: string | null = null
    const nowIso = new Date().toISOString()
    for (const part of chunk(ids, 200)) {
      // Pas de filtre d'espace ici : les droits (RLS) décident déjà qui peut supprimer quoi.
      // Le filtre d'espace faisait échouer en silence les médias rangés dans l'autre espace.
      const { data, error } = await supabase.from('content_bank').update({ deleted_at: nowIso }).in('id', part).select('id')
      if (error) { if (!firstErr) firstErr = error.message } else { deleted += (data?.length ?? 0) }
    }

    setDeleting(false); setConfirmDel(null)
    if (deleted === 0) {
      toast(firstErr
        ? `Suppression impossible : ${firstErr}`
        : "Suppression impossible : ces médias appartiennent à un autre membre (seuls owner / admin peuvent les supprimer).", 'bad', 9000)
      setSel(new Set()); load(); return
    }
    // Retrait immédiat de l'écran, sans attendre le rechargement.
    setItems(cur => cur.filter(i => !ids.includes(i.id)))
    toast(deleted < ids.length
      ? `${deleted}/${ids.length} média(s) → corbeille. Les autres appartiennent à un autre membre.`
      : `${deleted} média(s) → corbeille (restaurable 7 j).`, deleted < ids.length ? 'info' : 'ok')
    setSel(new Set()); load()
  }

  // Corbeille : restaurer (deleted_at = null) ou supprimer DÉFINITIVEMENT (row + fichier).
  // Par lots de 200 (une seule requête avec des milliers d'ids dépasse la taille d'URL et échoue).
  const [trashBusy, setTrashBusy] = useState<string | null>(null)
  const chunkOf = <T,>(a: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
  async function restoreMedia(ids: string[]) {
    if (!ids.length) return
    let done = 0; let firstErr: string | null = null
    for (const part of chunkOf(ids, 200)) {
      if (ids.length > 200) setTrashBusy(`Restauration… ${done}/${ids.length}`)
      const { data, error } = await supabase.from('content_bank').update({ deleted_at: null }).in('id', part).select('id')
      if (error) { firstErr ??= error.message } else done += data?.length ?? 0
    }
    setTrashBusy(null)
    if (!done) toast(`Restauration impossible${firstErr ? ` : ${firstErr}` : ''}`, 'bad')
    else if (ids.length > 1) toast(`${done} média(s) restauré(s).`, 'ok')
    load()
  }
  async function purgeMedia(list: ContentItem[]) {
    if (!list.length) return
    const goneIds = new Set<string>(); let firstErr: string | null = null
    for (const part of chunkOf(list.map(i => i.id), 200)) {
      if (list.length > 200) setTrashBusy(`Suppression… ${goneIds.size}/${list.length}`)
      const { data, error } = await supabase.from('content_bank').delete().in('id', part).select('id')
      if (error) firstErr ??= error.message
      else ((data ?? []) as { id: string }[]).forEach(r => goneIds.add(r.id))
    }
    // Ne supprime JAMAIS un fichier encore utilisé par un autre média (copie, doublon) :
    // vérifié sur les médias chargés puis en base (même règle que la purge serveur).
    const keep = new Set([...items, ...trash.filter(t => !goneIds.has(t.id))].flatMap(i => [i.storage_path, i.thumbnail_path]).filter(Boolean) as string[])
    const candidates = [...new Set(list.filter(i => goneIds.has(i.id)).flatMap(i => [i.storage_path, i.thumbnail_path]).filter((x): x is string => !!x && !keep.has(x)))]
    for (const part of chunkOf(candidates, 100)) {
      setTrashBusy(`Nettoyage des fichiers… ${goneIds.size}/${list.length}`)
      const [a, b] = await Promise.all([
        supabase.from('content_bank').select('storage_path').in('storage_path', part),
        supabase.from('content_bank').select('thumbnail_path').in('thumbnail_path', part),
      ])
      if (a.error || b.error) continue // doute → on garde les fichiers
      const used = new Set([...(a.data ?? []).map(r => r.storage_path), ...(b.data ?? []).map(r => r.thumbnail_path)])
      const free = part.filter(x => !used.has(x))
      try { if (free.length) await supabase.storage.from('content').remove(free) } catch { /* best-effort */ }
    }
    setTrashBusy(null)
    if (!goneIds.size) toast(`Suppression impossible${firstErr ? ` : ${firstErr}` : ''}`, 'bad')
    else if (list.length > 1) toast(`${goneIds.size} média(s) supprimé(s) définitivement.`, 'ok')
    void reloadUsage()
    load()
  }

  // ── Renommer un média + éditer les tags ──────────────────────────────────────
  const [renameItem, setRenameItem] = useState<ContentItem | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [tagsVal, setTagsVal] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  function openRename(i: ContentItem) { setRenameItem(i); setRenameVal(i.title); setTagsVal((i.tags ?? []).join(', ')) }
  async function saveRename() {
    if (!renameItem) return
    setSavingRename(true)
    const tags = tagsVal.split(',').map(t => t.trim()).filter(Boolean)
    const { error: err } = await supabase.from('content_bank').update({ title: renameVal.trim() || renameItem.title, tags }).eq('id', renameItem.id)
    setSavingRename(false)
    if (!err) { setRenameItem(null); load() }
    else setNotice(`Échec : ${err.message}`)
  }

  // ── Renommer / supprimer un dossier ──────────────────────────────────────────
  const [folderMenu, setFolderMenu] = useState<string | null>(null)
  const [folderCtx, setFolderCtx] = useState<{ x: number; y: number; name: string } | null>(null)
  const [renameFolderOf, setRenameFolderOf] = useState<string | null>(null)
  const [renameFolderVal, setRenameFolderVal] = useState('')
  const [confirmDelFolder, setConfirmDelFolder] = useState<string | null>(null)
  const scopeQ = (qq: any) => currentOrg ? qq.eq('org_id', currentOrg.id) : qq.eq('user_id', user.id).is('org_id', null)
  async function renameFolder(oldName: string, newName: string) {
    const n = newName.trim(); if (!n || n === oldName) { setFolderMenu(null); return }
    await scopeQ(supabase.from('content_bank').update({ folder: n }).eq('folder', oldName))
    setFolderMenu(null); if (folder === oldName) setFolder(n); load()
  }
  async function deleteFolder(name: string) {
    // Dégroupe les médias (folder → null). Nécessite le droit d'update sur ces lignes.
    const { error: upErr } = await scopeQ(supabase.from('content_bank').update({ folder: null }).eq('folder', name).or('notes.is.null,notes.not.in.("__sf_folder__","__sf_drive_folder__")'))
    // Supprime la/les ligne(s) sentinelle(s) du dossier via la RPC fiable (RLS-proof),
    // fallback DELETE direct si la RPC n'est pas déployée.
    const { data: sentinels } = await scopeQ(supabase.from('content_bank').select('id').eq('folder', name).in('notes', ['__sf_folder__', '__sf_drive_folder__']))
    const sentIds = ((sentinels ?? []) as { id: string }[]).map(r => r.id)
    if (sentIds.length) {
      const { error } = await supabase.rpc('delete_bank_items', { p_ids: sentIds })
      if (error && /PGRST202|not find|schema cache/i.test(error.message)) {
        await scopeQ(supabase.from('content_bank').delete().in('id', sentIds))
      }
    }
    setFolderMenu(null); if (folder === name) setFolder('Tous')
    if (upErr) setNotice(`Le dossier n'a pas pu être vidé : ${upErr.message} — ces médias appartiennent peut-être à un autre compte.`)
    load()
  }

  // ── Lecteur vidéo (double-clic) + menu contextuel (clic droit) ───────────────
  const [player, setPlayer] = useState<{ url: string; title: string; type: MediaType } | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; item: ContentItem } | null>(null)
  async function openPlayer(i: ContentItem) {
    const url = (i.storage_path && (thumbs[i.storage_path] || await signedUrl(i.storage_path))) || i.file_url
    if (url) setPlayer({ url, title: i.title, type: inferType(i) })
  }

  // ── Glisser-déposer un média (ou la sélection) dans un dossier ───────────────
  const [dragOver, setDragOver] = useState<string | null>(null)
  async function dropOnFolder(target: string, draggedId: string) {
    const dest = (target === 'Tous' || target === 'Jamais publiées') ? null : target
    if (dest === null) return
    const ids = sel.has(draggedId) ? [...sel] : [draggedId]
    const { error: err } = await supabase.from('content_bank').update({ folder: dest }).in('id', ids)
    setNotice(err ? `Échec : ${err.message}` : `${ids.length} média(s) déplacé(s) vers « ${dest} ».`)
    if (!err) { setSel(new Set()); load() }
  }

  // ── Description (légende propre au média, pré-remplit le post) ────────────────
  const [descItem, setDescItem] = useState<ContentItem | null>(null)
  const [descVal, setDescVal] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  function openDesc() {
    const one = items.find(i => sel.has(i.id)); if (!one) return
    setDescItem(one); setDescVal((one as any).description ?? '')
  }
  async function saveDesc() {
    if (!descItem) return
    setSavingDesc(true)
    const { error: err } = await supabase.from('content_bank').update({ description: descVal }).eq('id', descItem.id)
    setSavingDesc(false)
    setNotice(err ? `Échec : ${err.message}` : 'Description enregistrée.')
    if (!err) { setDescItem(null); load() }
  }

  // ── Déplacer (réel) + Remixer (renvoi) ──────────────────────────────────────
  const [moveOpen, setMoveOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [folderModal, setFolderModal] = useState(false)
  const [folderName, setFolderName] = useState('')
  async function createFolder() {
    const name = folderName.trim(); if (!name) return
    await supabase.from('content_bank').insert({
      user_id: user.id, org_id: currentOrg?.id ?? null,
      title: name, folder: name, file_url: null, storage_path: null, thumbnail_path: null,
      duration: null, tags: [], notes: '__sf_folder__',
    })
    setFolderModal(false); setFolderName(''); setFolder(name); load()
  }
  const [notice, setNotice] = useState<string | null>(null)
  const narrow = useNarrow()
  const moveFolders = useMemo(() => folders.filter(f => f.n !== 'Tous' && !f.special).map(f => f.n), [folders])

  async function doMove(target: string) {
    const dest = target.trim(); if (!dest || sel.size === 0) return
    setMoving(true)
    const { error: err } = await supabase.from('content_bank').update({ folder: dest }).in('id', [...sel])
    setMoving(false)
    if (err) { toast(`Échec du déplacement : ${err.message}`, 'bad'); return }
    setMoveOpen(false); setNewFolder(''); toast(`${sel.size} média(s) déplacé(s) vers « ${dest} ».`, 'ok'); setSel(new Set())
    load()
  }

  // Filtrage + tri.
  const ql = q.trim().toLowerCase()
  const shown = useMemo(() => {
    let a = typed.filter(i => {
      const fMatch = folder === 'Tous'
        ? true
        : folder === 'Jamais publiées'
          ? (i.used_count ?? 0) === 0
          : i.folder === folder
      if (!fMatch) return false
      if (!ql) return true
      return i.title.toLowerCase().includes(ql)
        || (i.tags ?? []).some(t => t.toLowerCase().includes(ql))
    })
    a = [...a].sort((x, y) => {
      if (sort === 'name') return (x.title ?? '').localeCompare(y.title ?? '')
      if (sort === 'used') return (x.used_count ?? 0) - (y.used_count ?? 0)
      return new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
    })
    return a
  }, [typed, folder, ql, sort])

  // Affichage PROGRESSIF : 60 vignettes, puis les suivantes en arrivant en bas (avant : les
  // 1 600 d'un coup → défilement saccadé). Uniquement l'onglet / le dossier / la recherche en cours.
  const PAGE = 60
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => { setLimit(PAGE) }, [tab, folder, ql, sort])
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = moreRef.current; if (!el) return
    const io = new IntersectionObserver(es => { if (es[0]?.isIntersecting) setLimit(l => l + PAGE) }, { rootMargin: '600px' })
    io.observe(el); return () => io.disconnect()
  }, [limit, shown.length])
  const rendered = useMemo(() => shown.slice(0, limit), [shown, limit])

  // Liens des SEULES vignettes affichées : déjà connus → tout de suite ; sinon signés par lots,
  // miniatures d'abord, puis la vidéo des tuiles sans miniature (pour leur 1re image).
  useEffect(() => {
    const thumbPaths = rendered.filter(i => !i.thumbnail_url && i.thumbnail_path).map(i => i.thumbnail_path as string)
    const mediaPaths = rendered.filter(i => i.storage_path && !i.thumbnail_url && !i.thumbnail_path).map(i => i.storage_path as string)
    const all = [...thumbPaths, ...mediaPaths]
    if (all.length === 0) return
    const known: Record<string, string> = {}
    for (const p of all) { const u = cachedSigned(p); if (u) known[p] = u }
    setThumbs(prev => { let changed = false; const m = { ...prev }; for (const [p, u] of Object.entries(known)) if (m[p] !== u) { m[p] = u; changed = true } return changed ? m : prev })
    let cancelled = false
    ;(async () => {
      const merge = (fresh: Record<string, string>) => { if (!cancelled && Object.keys(fresh).length) setThumbs(prev => ({ ...prev, ...fresh })) }
      const r1 = await signPaths(thumbPaths, merge, () => cancelled)
      const r2 = await signPaths(mediaPaths, merge, () => cancelled)
      if (cancelled) return
      const lost = [...r1.lost, ...r2.lost], ok = [...r1.ok, ...r2.ok]
      if (lost.length || ok.length) setMissing(prev => { if (lost.every(p => prev.has(p)) && ok.every(p => !prev.has(p))) return prev; const n = new Set(prev); lost.forEach(p => n.add(p)); ok.forEach(p => n.delete(p)); return n })
    })()
    return () => { cancelled = true }
  }, [rendered, signTick])

  // Ancre du dernier clic (index dans `shown`) pour la sélection par intervalle (Maj+clic).
  const lastIdxRef = useRef<number | null>(null)
  // Clic simple = bascule 1 vignette. Maj+clic = sélectionne TOUT l'intervalle entre
  // l'ancre (dernière vignette cliquée) et celle-ci (comme sur la plupart des SaaS).
  const toggleAt = (idx: number, id: string, shift: boolean) => {
    setSel(prev => {
      const n = new Set(prev)
      if (shift && lastIdxRef.current !== null) {
        const lo = Math.min(lastIdxRef.current, idx), hi = Math.max(lastIdxRef.current, idx)
        for (let k = lo; k <= hi; k++) { const it = shown[k]; if (it) n.add(it.id) }
      } else {
        if (n.has(id)) n.delete(id); else n.add(id)
      }
      return n
    })
    lastIdxRef.current = idx
  }

  // ── Sélection rapide : appui long, glisser pour cocher, rectangle, raccourcis ──
  const selecting = sel.size > 0
  const gridRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ kind: 'press' | 'paint' | 'band'; id?: number; x: number; y: number; mode?: boolean; base?: Set<string>; timer?: number } | null>(null)
  const suppressClick = useRef(false)
  const [band, setBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const tileAt = (x: number, y: number): number | null => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-tile-idx]') as HTMLElement | null
    return el && gridRef.current?.contains(el) ? Number(el.dataset.tileIdx) : null
  }
  const paint = (idx: number, add: boolean) => {
    const it = shown[idx]; if (!it) return
    setSel(prev => { if (prev.has(it.id) === add) return prev; const n = new Set(prev); if (add) n.add(it.id); else n.delete(it.id); return n })
    lastIdxRef.current = idx
  }
  const endGesture = () => {
    const g = gesture.current
    if (g?.timer) window.clearTimeout(g.timer)
    gesture.current = null
    setBand(null)
    // Le « click » natif suit immédiatement le relâchement : on lève le blocage juste après.
    if (suppressClick.current) window.setTimeout(() => { suppressClick.current = false }, 0)
  }
  const onGridPointerDown = (e: React.PointerEvent) => {
    // Case à cocher et Maj+clic (intervalle) gardent leur comportement habituel.
    if (e.button !== 0 || e.shiftKey && !!(e.target as HTMLElement).closest('[data-tile-idx]') || (e.target as HTMLElement).closest('[data-tile-check]')) return
    const idx = tileAt(e.clientX, e.clientY)
    if (idx === null) {
      // Espace vide de la grille, à la souris : rectangle de sélection.
      if (e.pointerType !== 'mouse') return
      gesture.current = { kind: 'band', x: e.clientX, y: e.clientY, base: e.shiftKey || e.ctrlKey || e.metaKey ? new Set(sel) : new Set() }
      e.preventDefault()
      return
    }
    const id = shown[idx]?.id; if (!id) return
    if (selecting && e.pointerType === 'mouse') {
      // Mode sélection, souris : on coche/décoche tout de suite et on « peint » en glissant.
      const add = !sel.has(id)
      gesture.current = { kind: 'paint', x: e.clientX, y: e.clientY, mode: add, id: idx }
      paint(idx, add); suppressClick.current = true
      e.preventDefault()
      return
    }
    // Appui long (~0,45 s) : sélectionne la vignette puis on peut glisser sur les autres.
    const timer = window.setTimeout(() => {
      const g = gesture.current; if (!g || g.kind !== 'press') return
      const add = !sel.has(id)
      gesture.current = { ...g, kind: 'paint', mode: add }
      paint(idx, add); suppressClick.current = true
      try { navigator.vibrate?.(15) } catch { /* ignore */ }
    }, 450)
    gesture.current = { kind: 'press', x: e.clientX, y: e.clientY, id: idx, timer }
  }
  useEffect(() => {
    const mv = (e: PointerEvent) => { if (gesture.current?.kind === 'band') onGridPointerMove(e as unknown as React.PointerEvent) }
    window.addEventListener('pointermove', mv)
    return () => window.removeEventListener('pointermove', mv)
  })
  const onGridPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current; if (!g) return
    if (g.kind === 'press') {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) endGesture()   // c'est un défilement ou un glisser-déposer
      return
    }
    if (g.kind === 'paint') {
      const idx = tileAt(e.clientX, e.clientY)
      if (idx !== null && idx !== g.id) { g.id = idx; paint(idx, !!g.mode) }
      return
    }
    // Rectangle de sélection
    const x = Math.min(g.x, e.clientX), y = Math.min(g.y, e.clientY), w = Math.abs(e.clientX - g.x), h = Math.abs(e.clientY - g.y)
    if (w < 4 && h < 4) return
    setBand({ x, y, w, h })
    const hit = new Set(g.base)
    gridRef.current?.querySelectorAll<HTMLElement>('[data-tile-idx]').forEach(el => {
      const r = el.getBoundingClientRect()
      if (r.right > x && r.left < x + w && r.bottom > y && r.top < y + h) { const it = shown[Number(el.dataset.tileIdx)]; if (it) hit.add(it.id) }
    })
    setSel(hit)
    suppressClick.current = true
  }
  useEffect(() => {
    const up = () => { if (gesture.current) endGesture() }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  })
  // Pendant un « glisser pour cocher » au doigt, on bloque le défilement de la page.
  useEffect(() => {
    const el = gridRef.current; if (!el) return
    const block = (ev: TouchEvent) => { if (gesture.current?.kind === 'paint') ev.preventDefault() }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  })
  // Le clic qui suit un appui long / un glisser ne doit pas re-basculer la vignette.
  const onGridClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false }
  }
  // Raccourcis clavier : Ctrl/⌘+A, Suppr, Échap (hors champs de saisie et fenêtres).
  useEffect(() => {
    if (tab === 'caption') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input,textarea,select,[contenteditable]') || document.querySelector('[role=dialog]'))) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(new Set(shown.map(m => m.id))) }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); setConfirmDel([...sel]) }
      else if (e.key === 'Escape' && sel.size) setSel(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, shown, sel])

  const isCloud = infra === 'cloud'
  const TABS: { k: TabKey; l: string; n: number }[] = [
    { k: 'video', l: 'Vidéos', n: counts.video },
    { k: 'image', l: 'Images', n: counts.image },
    { k: 'caption', l: 'Légendes', n: captions.length },
  ]
  const SORTS: { k: SortKey; l: string }[] = [
    { k: 'recent', l: 'Récentes' },
    { k: 'name', l: 'A → Z' },
    { k: 'used', l: 'Moins publiées' },
  ]
  const total = items.length
  const neverPublished = items.filter(i => (i.used_count ?? 0) === 0).length

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  return (
    <div style={{ position: 'relative', animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}
      onDragOver={e => { if (hasFiles(e)) { e.preventDefault(); if (!dragFiles) setDragFiles(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragFiles(false) }}
      onDrop={e => {
        if (!hasFiles(e)) return
        e.preventDefault(); setDragFiles(false)
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video') || f.type.startsWith('image'))
        if (files.length) importFiles(files)
        else toast('Dépose des vidéos ou des images.', 'info')
      }}>
      {/* Portail vers <body> : le conteneur de la page est animé (transform), un « fixed » rendu
          dedans se plaçait au milieu de la page entière au lieu de l'écran. Fenêtre en haut de
          l'écran ; titre + actions + progression fixes, seule la liste défile. */}
      {showTrash && createPortal(
        <div onClick={() => setShowTrash(false)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 20px 20px', boxSizing: 'border-box' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(680px,96vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column', borderRadius: 20, background: '#101012', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 100px -24px rgba(0,0,0,0.85)', padding: 20, boxSizing: 'border-box', animation: 'aIn .2s cubic-bezier(0.16,1,0.3,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#FCA5A5' }}><Icon d="M3 6h18|M8 6V4h8v2|M6 6l1 14h10l1-14" size={16} /></span>
              <span style={{ fontSize: 16.5, fontWeight: 750, color: '#F4F4F5', letterSpacing: '-0.025em' }}>Corbeille <span style={{ color: '#71717A', fontWeight: 600 }}>{trash.length}</span></span>
              <button onClick={() => setShowTrash(false)} aria-label="Fermer" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 99, background: 'rgba(255,255,255,0.04)', border: 'none', color: '#A1A1AA', cursor: 'pointer' }}><Icon d="M18 6L6 18|M6 6l12 12" size={14} /></button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#8B8B94' }}>Médias supprimés — restaurables 7 jours puis purgés définitivement.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Btn theme={theme} sm tone="primary" label="Tout restaurer" disabled={!!trashBusy || !trash.length} onClick={async () => { await restoreMedia(trash.map(t => t.id)); setShowTrash(false) }} />
              <Btn theme={theme} sm tone="quiet" label="Vider définitivement" disabled={!!trashBusy || !trash.length} onClick={async () => { if (await confirmDialog({ title: `Supprimer DÉFINITIVEMENT les ${trash.length} médias de la corbeille ?`, confirmLabel: 'Vider définitivement', danger: true })) { await purgeMedia(trash); setShowTrash(false) } }} />
              {trashBusy && <span style={{ alignSelf: 'center', fontSize: 12.5, color: '#A78BFA', fontVariantNumeric: 'tabular-nums' }}>{trashBusy}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', minHeight: 0, margin: '0 -6px', padding: '0 6px' }}>
              {trash.slice(0, 200).map(t => {
                const days = t.deleted_at ? Math.max(0, 7 - Math.floor((Date.now() - new Date(t.deleted_at).getTime()) / 86400000)) : 7
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px 7px 14px', borderRadius: 12, background: '#151517', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span data-no-tr style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <span style={{ fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>purge dans {days}j</span>
                    <Btn theme={theme} sm tone="quiet" label="Restaurer" onClick={() => restoreMedia([t.id])} />
                    <button onClick={async () => { if (await confirmDialog({ title: 'Supprimer définitivement ce média ?', confirmLabel: 'Supprimer', danger: true })) purgeMedia([t]) }} title="Supprimer définitivement" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'none', border: 'none', color: '#F87171', fontWeight: 500, fontSize: 16, cursor: 'pointer' }}>×</button>
                  </div>
                )
              })}
              {trash.length > 200 && <span style={{ padding: '8px 4px', fontSize: 12.5, color: '#71717A' }}>{`+ ${trash.length - 200} autre(s) — utilise « Tout restaurer » ou « Vider définitivement ».`}</span>}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {dragFiles && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: `1px dashed rgba(${theme.tone},0.6)`, background: 'rgba(10,10,11,0.85)', pointerEvents: 'none',
        }}>
          <div style={{ textAlign: 'center', color: '#EDEDEF' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: theme.accentText }}><Icon d="M12 3v12|M7 10l5 5 5-5|M4 21h16" size={24} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>Dépose pour importer</div>
            <div style={{ fontSize: 13, color: '#8B8B94', marginTop: 4 }}>Vidéos et images{folder !== 'Tous' && folder !== 'Jamais publiées' ? ` → dossier « ${folder} »` : ''}</div>
          </div>
        </div>
      )}
      {/* En-tête */}
      <PageHeader title="Banque"
        kicker={loading || total === 0 ? 'Ton contenu' : <>{`${counts.video} vidéo(s) · ${counts.image} image(s) · ${captions.length} légende(s)`}{neverPublished > 0 && <span style={{ color: '#A78BFA' }}>{` · ${neverPublished} jamais publié(s)`}</span>}</>}
        sub="Toutes tes vidéos, images et légendes, rangées par dossier. Glisse des fichiers n’importe où sur la page pour les importer."

        actions={<>
          {trash.length > 0 && <Btn label={`Corbeille (${trash.length})`} theme={theme} icon="M3 6h18|M8 6V4h8v2|M6 6l1 14h10l1-14" onClick={() => setShowTrash(true)} />}
          <Btn label="Actualiser" theme={theme} icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16" onClick={load} />
          <Btn label={uploading ? uploading : "Importer"} theme={theme} tone="primary" icon="M12 5v14|M5 12h14" disabled={!!uploading} onClick={() => fileRef.current?.click()} />
        </>} />

      {/* Espace utilisé (limite de l'abonnement) + fichiers vides à nettoyer */}
      {(usage || broken.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {usage && (() => {
            const pct = usage.quota ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0
            const col = pct >= 100 ? '#F87171' : pct >= 80 ? '#FBBF24' : theme.accent
            return (
              <div title={usage.quota ? `Abonnement ${PLAN_LABEL[usage.plan] ?? usage.plan} · corbeille comprise` : 'Espace illimité'} style={{ flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, background: '#0F0F11', border: `1px solid ${pct >= 80 ? col + '66' : 'rgba(255,255,255,0.07)'}` }}>
                <span style={{ display: 'flex', color: col }}><Icon d="M21 5c0 1.7-4 3-9 3S3 6.7 3 5s4-3 9-3 9 1.3 9 3z|M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5|M3 12c0 1.7 4 3 9 3s9-1.3 9-3" size={15} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#EDEDEF', fontWeight: 600 }}>{usage.quota ? `${fmtBytes(usage.used)} / ${fmtBytes(usage.quota)}` : `${fmtBytes(usage.used)} · illimité`}</span>
                    <span style={{ color: pct >= 80 ? col : '#71717A' }}>{usage.quota ? (pct >= 100 ? 'Espace plein — envois bloqués' : pct >= 80 ? `${pct} % · bientôt plein` : `${pct} %`) : ''}</span>
                  </span>
                  {usage.quota !== null && <span style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.max(2, pct)}%`, background: pct >= 80 ? col : 'linear-gradient(90deg,#8B5CF6,#EC4899)', borderRadius: 99, transition: 'width .4s ease' }} /></span>}
                </span>
              </div>
            )
          })()}
          {broken.length > 0 && (
            <div style={{ flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 16, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.3)' }}>
              <span style={{ flex: 1, fontSize: 12.5, color: '#FCA5A5' }}>{broken.length} fichier(s) vide(s) : leur fichier n’existe plus.</span>
              <Btn theme={theme} sm tone="danger" label="Nettoyer" onClick={() => void cleanBroken()} />
            </div>
          )}
        </div>
      )}

      <UnderlineTabs<TabKey> value={tab} onChange={k => { setTab(k); setFolder('Tous') }}
        items={TABS.map(t => ({ k: t.k, l: t.l, n: loading ? undefined : t.n, icon: t.k === 'video' ? 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z' : t.k === 'image' ? 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' : 'M4 7V4h16v3|M9 20h6|M12 4v16' }))} />

      {/* Corps : colonne Dossiers + grille */}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : '240px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
        {/* Dossiers */}
        <Panel theme={theme}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 10px 18px', minHeight: 56, boxSizing: 'border-box',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#F4F4F5', letterSpacing: '-0.02em' }}>Dossiers</span>
            <span style={{ marginLeft: 'auto' }}>
              <Btn theme={theme} sm tone="quiet" icon="M12 5v14|M5 12h14" label="Nouveau dossier" onClick={() => { setFolderName(''); setFolderModal(true) }} />
            </span>
          </div>
          <div style={{ padding: 6 }}>
            {folders.map(f => {
              const on = folder === f.n
              return (
                <button
                  key={f.n}
                  onClick={() => setFolder(f.n)}
                  onContextMenu={e => { if (f.n !== 'Tous' && f.n !== 'Jamais publiées') { e.preventDefault(); setFolderCtx({ x: e.clientX, y: e.clientY, name: f.n }) } }}
                  onDragOver={e => { if (f.n !== 'Tous' && f.n !== 'Jamais publiées') { e.preventDefault(); setDragOver(f.n) } }}
                  onDragLeave={() => setDragOver(d => d === f.n ? null : d)}
                  onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setDragOver(null); if (id) dropOnFolder(f.n, id) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 38, padding: '0 12px', borderRadius: 10,
                    border: 'none', cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                    outline: dragOver === f.n ? `1px dashed ${theme.selEdge}` : 'none', outlineOffset: -3,
                    background: dragOver === f.n ? theme.selBg : on ? 'rgba(255,255,255,0.08)' : 'transparent', transition: 'background .12s ease',
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (dragOver !== f.n) e.currentTarget.style.background = on ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                >
                  <span style={{ display: 'flex', color: f.special ? '#4ADE80' : on ? theme.accentText : '#71717A' }}>
                    <Icon d={f.special ? 'M12 2v20|M2 12h20' : 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z'} size={13} />
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: on ? 650 : 550,
                    color: on ? '#F4F4F5' : '#A1A1AA',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{f.n}</span>
                  <span style={{
                    fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
                    color: on ? '#A1A1AA' : '#5A5A63',
                  }}>{f.c}</span>
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Grille */}
        <Panel theme={theme}>
          {/* Barre d'outils : onglets de type + recherche + tri */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', minHeight: 56, boxSizing: 'border-box',
            borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap',
          }}>
            <span style={{
              ...FIELD_SM, width: 'auto', display: 'flex', alignItems: 'center', gap: 8, height: 34,
              flex: '0 1 240px', minWidth: 150,
              border: `1px solid ${q ? theme.selEdge : 'rgba(255,255,255,0.09)'}`,
              transition: 'border-color .12s ease',
            }}>
              <span style={{ display: 'flex', color: q ? theme.accentText : '#71717A', flexShrink: 0 }}>
                <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M20 20l-4.35-4.35" size={12} sw={2} />
              </span>
              <input
                type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', color: '#EDEDEF', fontSize: 12.5 }}
              />
            </span>

            <Segmented<SortKey> value={sort} onChange={setSort} options={SORTS.map(s => ({ v: s.k, l: s.l }))} />

            {tab !== 'caption' && shown.length > 0 && (() => {
              const allSel = shown.every(m => sel.has(m.id))
              return (
                <button onClick={() => setSel(allSel ? new Set() : new Set(shown.map(m => m.id)))}
                  style={{ marginLeft: 'auto', height: 32, padding: '0 12px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${allSel ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.09)'}`, background: allSel ? 'rgba(255,255,255,0.08)' : '#151517', color: allSel ? '#F4F4F5' : '#A1A1AA', fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap' }}>
                  {allSel ? 'Tout désélectionner' : `Tout sélectionner (${shown.length})`}
                </button>
              )
            })()}

            <span style={{ marginLeft: (tab !== 'caption' && shown.length > 0) ? 12 : 'auto', fontSize: 12, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? <Skeleton w={72} h={10} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> : sel.size ? `${sel.size} sélectionnée${sel.size > 1 ? 's' : ''}` : `${folder} · ${shown.length} affichée${shown.length > 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Contenu */}
          {tab === 'caption' ? (
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: '#8B8B94' }}>Des légendes réutilisables pour tes posts et stories.</span>
                <span style={{ marginLeft: 'auto' }}><Btn label="Nouvelle légende" theme={theme} sm tone="primary" icon="M12 5v14|M5 12h14" onClick={() => { setCapTitle(''); setCapContent(''); setCapOpen(true) }} /></span>
              </div>
              {captions.length === 0 ? (
                <Empty icon="M4 7V4h16v3|M9 20h6|M12 4v16" title="Aucune légende" text="Crée des légendes prêtes à coller dans tes publications." action={<Btn label="Nouvelle légende" theme={theme} sm tone="primary" onClick={() => setCapOpen(true)} />} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(280px,100%),1fr))', gap: 12 }}>
                  {captions.map(c => (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 16, background: '#141416', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Légende'}</span>
                        <button onClick={() => deleteCaption(c.id)} title="Supprimer" style={{ marginLeft: 'auto', display: 'flex', width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: '#71717A', cursor: 'pointer' }}><Icon d="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" size={13} /></button>
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#A1A1AA', whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'hidden' }}>{c.content}</div>
                      <button onClick={() => { navigator.clipboard?.writeText(c.content); toast('Légende copiée.', 'ok') }} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: '#1A1A1D', color: '#F4F4F5', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}><Icon d="M9 9h11v11H9z|M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" size={12} />Copier</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading ? (
            <div aria-busy="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, padding: 16 }}>
              {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} h={240} r={14} />)}
            </div>
          ) : error ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#F87171' }}>{error}</div>
          ) : total === 0 ? (
            <Empty
              icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z"
              title="Importe tes vidéos"
              text="Ta banque est vide. Importe des vidéos et des images pour les réutiliser dans tes posts et tes stories."
              action={<Btn label={uploading ? uploading : "Importer"} theme={theme} tone="primary" icon="M12 5v14|M5 12h14" disabled={!!uploading} onClick={() => fileRef.current?.click()} />}
            />
          ) : shown.length === 0 ? (
            <Empty
              icon="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M8 12h8"
              title="Aucun résultat"
              text="Rien ne correspond à cette recherche."
              action={<Btn label="Réinitialiser" theme={theme} sm onClick={() => { setQ(''); setFolder('Tous') }} />}
            />
          ) : (
            <div ref={gridRef}
              onPointerDown={onGridPointerDown} onPointerMove={onGridPointerMove} onPointerUp={endGesture} onPointerCancel={endGesture} onPointerLeave={e => { if (gesture.current?.kind !== 'band') return; if (e.buttons === 0) endGesture() }}
              onClickCapture={onGridClickCapture}
              onContextMenuCapture={e => { if (suppressClick.current || gesture.current?.kind === 'paint') { e.preventDefault(); e.stopPropagation() } }}
              style={{
              display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${narrow ? 110 : 140}px,1fr))`,
              gap: 12, padding: 16, WebkitUserSelect: 'none', userSelect: 'none',
            }}>
              {rendered.map((i, idx) => (
                <Tile
                  key={i.id} idx={idx} selecting={selecting} item={i} type={tab} thumb={thumbFor(i)} media={mediaFor(i)} broken={isBroken(i)}
                  on={sel.has(i.id)} theme={theme} onToggle={(e) => toggleAt(idx, i.id, e.shiftKey)}
                  onDragStart={e => e.dataTransfer.setData('text/plain', i.id)}
                  onOpen={() => openPlayer(i)}
                  onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item: i }) }}
                  onStale={() => void refreshLinks(i)}
                />
              ))}
              {limit < shown.length && <div ref={moreRef} style={{ gridColumn: '1 / -1', height: 1 }} />}
            </div>
          )}
        </Panel>
      </div>
      {band && createPortal(<div aria-hidden style={{ position: 'fixed', left: band.x, top: band.y, width: band.w, height: band.h, zIndex: 80, pointerEvents: 'none', borderRadius: 4, border: `1px solid ${theme.accent}`, background: `rgba(${theme.tone},0.12)` }} />, document.body)}

      {/* Barre d'actions groupées (sticky) */}
      {sel.size > 0 && (
        <div style={{
          position: 'sticky', bottom: 14, marginTop: 14, zIndex: 40, display: 'flex',
          alignItems: 'center', gap: 8, padding: '9px 9px 9px 18px', borderRadius: 16,
          background: 'rgba(22,22,24,0.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 60px -16px rgba(0,0,0,0.8)', flexWrap: 'wrap',
          animation: 'aPop .22s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{sel.size}</span>
            <span style={{ fontSize: 12.5, fontWeight: 400, color: '#8B8B94' }}>sélectionnée{sel.size > 1 ? 's' : ''}</span>
          </span>
          <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
          <Btn label={isCloud ? 'Publier' : 'Mass Posting'} theme={theme} sm tone="primary" icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" onClick={() => onNavigate?.('publish')} />
          {sel.size === 1 && <Btn label="Description" theme={theme} sm icon="M4 7V4h16v3|M9 20h6|M12 4v16" onClick={openDesc} />}
          <Btn label="Remixer" theme={theme} sm icon="M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6" onClick={() => { if (onNavigate) openTool(onNavigate, 'studio', { tool: tab === 'image' ? 'imgspoof' : 'remix', ids: [...sel] }) }} />
          <Btn label="Déplacer" theme={theme} sm icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" onClick={() => setMoveOpen(true)} />
          <Btn label="Télécharger" theme={theme} sm icon="M12 3v12|M7 10l5 5 5-5|M4 21h16" onClick={() => downloadMedia([...sel])} />
          <Btn label="Supprimer" theme={theme} sm tone="danger" icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" onClick={() => setConfirmDel([...sel])} />
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {sel.size < shown.length && <Btn label={`Tout sélectionner (${shown.length})`} theme={theme} sm tone="ghost" onClick={() => setSel(new Set(shown.map(m => m.id)))} />}
            <Btn label="Désélectionner" theme={theme} sm tone="quiet" onClick={() => setSel(new Set())} />
          </span>
          <span style={{ flexBasis: '100%', fontSize: 11.5, color: '#71717A' }}>Astuce : clique ou glisse sur les vignettes pour en cocher plusieurs · rectangle sur un espace vide · Ctrl+A tout · Suppr supprime · Échap annule</span>
        </div>
      )}

      {notice && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', fontSize: 12.5, color: '#EDEDEF' }}>{notice}</div>
      )}

      {moveOpen && (
        <Modal theme={theme} title={`Déplacer ${sel.size} média(s)`} sub="Choisis un dossier ou crée-en un." icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z"
          onClose={() => setMoveOpen(false)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setMoveOpen(false)} />
            <Btn theme={theme} tone="primary" label={moving ? 'Déplacement…' : 'Déplacer ici'} disabled={moving || !newFolder.trim()} onClick={() => doMove(newFolder)} />
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {moveFolders.map(f => (
              <button key={f} onClick={() => doMove(f)} disabled={moving} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 36, padding: '0 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: '#161618', color: '#EDEDEF', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ color: '#8B8B94', display: 'flex' }}><Icon d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" size={14} /></span>{f}
              </button>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="Nouveau dossier…" style={{ ...FIELD, flex: 1, minWidth: 0 }} />
            </div>
          </div>
        </Modal>
      )}

      {capOpen && (
        <Modal theme={theme} title="Nouvelle légende" icon="M4 7V4h16v3|M9 20h6|M12 4v16" onClose={() => setCapOpen(false)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setCapOpen(false)} />
            <Btn theme={theme} tone="primary" label={savingCap ? 'Enregistrement…' : 'Enregistrer'} disabled={savingCap || !capContent.trim()} onClick={addCaption} />
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={capTitle} onChange={e => setCapTitle(e.target.value)} placeholder="Titre (optionnel)" style={FIELD} />
            <textarea value={capContent} onChange={e => setCapContent(e.target.value)} rows={6} placeholder="Ta légende…" style={{ ...TEXTAREA, lineHeight: 1.6 }} />
          </div>
        </Modal>
      )}

      {/* Menu contextuel (clic droit sur une vignette) — portal pour échapper au transform de page */}
      {ctx && createPortal(
        <>
          <div onClick={() => setCtx(null)} onContextMenu={e => { e.preventDefault(); setCtx(null) }} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div style={{ position: 'fixed', top: Math.min(ctx.y, window.innerHeight - 230), left: Math.min(ctx.x, window.innerWidth - 190), zIndex: 61, width: 180, borderRadius: 8, overflow: 'hidden', padding: 4, boxSizing: 'border-box', background: '#161618', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)' }}>
            {[
              { l: 'Lire', d: 'M5 3l14 9-14 9z', fn: () => openPlayer(ctx.item) },
              { l: 'Renommer', d: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z', fn: () => openRename(ctx.item) },
              { l: 'Description', d: 'M4 7V4h16v3|M9 20h6|M12 4v16', fn: () => { setDescItem(ctx.item); setDescVal((ctx.item as any).description ?? '') } },
              { l: 'Déplacer', d: 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z', fn: () => { setSel(new Set([ctx.item.id])); setMoveOpen(true) } },
              { l: 'Télécharger', d: 'M12 3v12|M7 10l5 5 5-5|M4 21h16', fn: () => downloadMedia([ctx.item.id]) },
            ].map(o => (
              <button key={o.l} onClick={() => { o.fn(); setCtx(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 32, padding: '0 10px', borderRadius: 5, border: 'none', background: 'transparent', color: '#EDEDEF', fontSize: 13, fontWeight: 400, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: '#71717A', display: 'flex' }}><Icon d={o.d} size={14} /></span>{o.l}
              </button>
            ))}
            <button onClick={() => { setConfirmDel([ctx.item.id]); setCtx(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 32, padding: '0 10px', marginTop: 4, borderRadius: 5, border: 'none', boxShadow: '0 -1px 0 rgba(255,255,255,0.06)', background: 'transparent', color: '#F87171', fontSize: 13, fontWeight: 400, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ display: 'flex' }}><Icon d="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" size={14} /></span>Supprimer
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* Menu contextuel dossier (clic droit) — portal aussi */}
      {folderCtx && createPortal(
        <>
          <div onClick={() => setFolderCtx(null)} onContextMenu={e => { e.preventDefault(); setFolderCtx(null) }} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div style={{ position: 'fixed', top: Math.min(folderCtx.y, window.innerHeight - 110), left: Math.min(folderCtx.x, window.innerWidth - 180), zIndex: 61, width: 170, borderRadius: 8, overflow: 'hidden', padding: 4, boxSizing: 'border-box', background: '#161618', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)' }}>
            <button onClick={() => { setRenameFolderOf(folderCtx.name); setRenameFolderVal(folderCtx.name); setFolderCtx(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 32, padding: '0 10px', borderRadius: 5, border: 'none', background: 'transparent', color: '#EDEDEF', fontSize: 13, fontWeight: 400, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ color: '#71717A', display: 'flex' }}><Icon d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" size={14} /></span>Renommer
            </button>
            <button onClick={() => { setConfirmDelFolder(folderCtx.name); setFolderCtx(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 32, padding: '0 10px', marginTop: 4, borderRadius: 5, border: 'none', boxShadow: '0 -1px 0 rgba(255,255,255,0.06)', background: 'transparent', color: '#F87171', fontSize: 13, fontWeight: 400, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ display: 'flex' }}><Icon d="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" size={14} /></span>Supprimer le dossier
            </button>
          </div>
        </>,
        document.body,
      )}

      {confirmDelFolder && (
        <Modal theme={theme} title="Supprimer ce dossier ?" icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" onClose={() => setConfirmDelFolder(null)}
          footer={<><Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setConfirmDelFolder(null)} /><Btn theme={theme} tone="danger" label="Supprimer le dossier" onClick={() => { deleteFolder(confirmDelFolder); setConfirmDelFolder(null) }} /></>}>
          <p style={{ margin: 0, fontSize: 13, color: '#A1A1AA', lineHeight: 1.6 }}>
            Le dossier <b style={{ color: '#EDEDEF', fontWeight: 600 }}>{confirmDelFolder}</b> sera supprimé, mais <b style={{ color: '#4ADE80', fontWeight: 600 }}>tes vidéos ne sont PAS supprimées</b> : elles sont simplement retirées du dossier et restent dans « Tous ». Tu pourras les regrouper dans un nouveau dossier.
          </p>
        </Modal>
      )}

      {renameFolderOf && (
        <Modal theme={theme} title="Renommer le dossier" onClose={() => setRenameFolderOf(null)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setRenameFolderOf(null)} />
            <Btn theme={theme} tone="primary" label="Renommer" disabled={!renameFolderVal.trim()} onClick={() => { renameFolder(renameFolderOf, renameFolderVal); setRenameFolderOf(null) }} />
          </>}>
          <input autoFocus value={renameFolderVal} onChange={e => setRenameFolderVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && renameFolderVal.trim()) { renameFolder(renameFolderOf, renameFolderVal); setRenameFolderOf(null) } }}
            style={FIELD} />
        </Modal>
      )}

      {/* Lecteur vidéo / image */}
      {player && (
        <Modal theme={theme} title={player.title} onClose={() => setPlayer(null)} width={420}>
          {player.type === 'video'
            ? <video src={player.url} controls autoPlay style={{ display: 'block', width: '100%', maxHeight: '70vh', borderRadius: 6, background: '#000' }} />
            : <img src={player.url} alt="" style={{ display: 'block', width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 6 }} />}
        </Modal>
      )}

      {/* Confirmation de suppression */}
      {confirmDel && (
        <Modal theme={theme} title={`Supprimer ${confirmDel.length} média(s) ?`} sub="Ils vont dans la corbeille : restaurables pendant 7 jours, puis effacés." icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6"
          onClose={() => setConfirmDel(null)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setConfirmDel(null)} />
            <Btn theme={theme} tone="danger" label={deleting ? 'Suppression…' : 'Supprimer'} disabled={deleting} onClick={() => deleteMedia(confirmDel)} />
          </>}>
          <p style={{ margin: 0, fontSize: 13, color: '#A1A1AA', lineHeight: 1.6 }}>Les médias sélectionnés partent dans la corbeille. Tu peux les restaurer pendant 7 jours depuis le bouton « Corbeille ».</p>
        </Modal>
      )}

      {/* Renommer + tags */}
      {renameItem && (
        <Modal theme={theme} title="Renommer" sub={renameItem.title} icon="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" onClose={() => setRenameItem(null)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setRenameItem(null)} />
            <Btn theme={theme} tone="primary" label={savingRename ? '…' : 'Enregistrer'} disabled={savingRename} onClick={saveRename} />
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Nom</span>
              <input value={renameVal} onChange={e => setRenameVal(e.target.value)} style={FIELD} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Tags (séparés par des virgules)</span>
              <input value={tagsVal} onChange={e => setTagsVal(e.target.value)} placeholder="motivation, produit…" style={FIELD} />
            </label>
          </div>
        </Modal>
      )}

      {folderModal && (
        <Modal theme={theme} title="Nouveau dossier" icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" onClose={() => setFolderModal(false)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setFolderModal(false)} />
            <Btn theme={theme} tone="primary" label="Créer" disabled={!folderName.trim()} onClick={createFolder} />
          </>}>
          <input autoFocus value={folderName} onChange={e => setFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && folderName.trim()) createFolder() }} placeholder="Nom du dossier"
            style={FIELD} />
        </Modal>
      )}

      {/* Input fichier caché (import réel) */}
      <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display: 'none' }}
        onChange={e => { if (e.target.files) importFiles(e.target.files); e.target.value = '' }} />

      {/* Description (légende du média pour le posting) */}
      {descItem && (
        <Modal theme={theme} title="Description du média" sub={descItem.title} icon="M4 7V4h16v3|M9 20h6|M12 4v16"
          onClose={() => setDescItem(null)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setDescItem(null)} />
            <Btn theme={theme} tone="primary" label={savingDesc ? 'Enregistrement…' : 'Enregistrer'} disabled={savingDesc} onClick={saveDesc} />
          </>}>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#8B8B94', lineHeight: 1.55 }}>Cette description pré-remplira la légende quand tu publieras ce média.</p>
          <textarea value={descVal} onChange={e => setDescVal(e.target.value)} rows={6} placeholder="Écris la légende / description…"
            style={{ ...TEXTAREA, lineHeight: 1.6 }} />
        </Modal>
      )}
    </div>
  )
}
