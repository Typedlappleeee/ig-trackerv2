import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Empty, Icon, Panel, Modal, confirmDialog, Skeleton, PageHead, FIELD, FIELD_SM, TEXTAREA, Segmented, useNarrow, toast } from '@/lib/ui'
import type { OrgState } from '@/lib/data'

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
  const src = (i.storage_path ?? i.file_url ?? '').toLowerCase()
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
function Tile({ item, type, thumb, media, on, theme, onToggle, onOpen, onDragStart, onContextMenu, selecting = false, idx }: {
  item: ContentItem; type: MediaType; thumb: string | null; media: string | null; on: boolean; theme: Theme; onToggle: (e: React.MouseEvent) => void; onOpen?: () => void; onDragStart?: (e: React.DragEvent) => void; onContextMenu?: (e: React.MouseEvent) => void
  selecting?: boolean; idx?: number
}) {
  const fresh = (item.used_count ?? 0) === 0
  const dur = type === 'video' ? fmtDuration(item.duration) : ''
  const btnRef = useRef<HTMLButtonElement>(null)
  const inView = useInView(btnRef)
  const placeholder: CSSProperties = {
    position: 'absolute', inset: 0,
    background: '#161618',
  }
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
        position: 'relative', aspectRatio: type === 'image' ? '4 / 5' : '9 / 16', borderRadius: 6, padding: 0,
        cursor: 'pointer', overflow: 'hidden', transition: 'border-color .12s ease, transform .12s ease',
        border: `1px solid ${on ? theme.accent : 'rgba(255,255,255,0.07)'}`,
        boxShadow: on ? `inset 0 0 0 1px ${theme.accent}` : 'none', transform: on ? 'scale(0.97)' : 'none',
        WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
        background: '#161618',
      }}
    >
      {thumb
        ? <img src={thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : type === 'video'
          // Vidéo : aperçu (1re image) monté SEULEMENT si la tuile est visible → limite
          // le nombre de <video> décodés en même temps. Hors écran → placeholder.
          ? (media && inView
              ? <video src={`${media}#t=0.1`} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={placeholder} />)
          : media && inView
            ? <img src={media} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={placeholder} />}

      <TileCheck on={on} onToggle={onToggle} accent={theme.accent} />

      {fresh && (
        <span style={{
          position: 'absolute', top: 6, left: 6, display: 'inline-flex', alignItems: 'center', height: 16, padding: '0 5px', boxSizing: 'border-box', borderRadius: 4,
          background: 'rgba(10,10,11,0.75)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ADE80', fontSize: 11, fontWeight: 500,
        }}>NEUF</span>
      )}

      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 8px 6px',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'linear-gradient(180deg, transparent, rgba(10,10,11,0.85))',
      }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 11, fontWeight: 500, textAlign: 'left',
          color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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

  const [tab, setTab] = useState<TabKey>('video')
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
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let query = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
    query = currentOrg
      ? query.eq('org_id', currentOrg.id)
      : query.eq('user_id', user.id).is('org_id', null)
    const { data, error: err } = await query
    if (err) { setError('Erreur lors du chargement de la banque.'); setItems([]); setFolderNames([]); setLoading(false); return }
    const rows = (data ?? []) as ContentItem[]
    setFolderNames(rows.filter(isSentinel).map(r => r.folder ?? r.title).filter((f): f is string => Boolean(f)))
    // Médias en corbeille (deleted_at) exclus de la banque, listés à part (restaurable 7 j).
    setItems(rows.filter(r => !isSentinel(r) && !r.deleted_at))
    setTrash(rows.filter(r => !isSentinel(r) && !!r.deleted_at).sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')))
    setLoading(false)
  }, [currentOrg?.id, user.id])

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
  useEffect(() => {
    const thumbPaths = items.filter(i => !i.thumbnail_url && i.thumbnail_path).map(i => i.thumbnail_path as string)
    const mediaPaths = items.filter(i => i.storage_path).map(i => i.storage_path as string)
    const paths = [...new Set([...thumbPaths, ...mediaPaths])]
    if (paths.length === 0) return
    let cancelled = false
    ;(async () => {
      const CHUNK = 100
      for (let i = 0; i < paths.length; i += CHUNK) {
        const batch = paths.slice(i, i + CHUNK)
        const { data } = await supabase.storage.from('content').createSignedUrls(batch, 3600)
        if (cancelled) return
        if (data) setThumbs(prev => {
          const map = { ...prev }
          data.forEach(d => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl })
          return map
        })
      }
    })()
    return () => { cancelled = true }
  }, [items])

  function thumbFor(i: ContentItem): string | null {
    if (i.thumbnail_url) return i.thumbnail_url
    if (i.thumbnail_path && thumbs[i.thumbnail_path]) return thumbs[i.thumbnail_path]
    return null
  }
  // URL signée du média source (pour afficher la vidéo/image quand pas de miniature).
  function mediaFor(i: ContentItem): string | null {
    if (i.storage_path && thumbs[i.storage_path]) return thumbs[i.storage_path]
    return i.file_url ?? null
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
  const IMG = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']

  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    let done = 0
    for (const file of list) {
      setUploading(`${file.name} (${++done}/${list.length})`)
      try {
        let ext = (file.name.split('.').pop() ?? '').toLowerCase()
        if (!ext) ext = file.type.startsWith('image') ? 'jpg' : 'mp4'
        const id = crypto.randomUUID()
        const storagePath = `videos/${scopeFolder}/${id}.${ext}`
        const up = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
        if (up.error) { setNotice(`Échec upload ${file.name} : ${up.error.message}`); continue }
        const dest = (folder !== 'Tous' && folder !== 'Jamais publiées') ? folder : null
        await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          title: file.name.replace(/\.[a-z0-9]+$/i, ''), storage_path: storagePath, thumbnail_path: null,
          file_url: null, folder: dest, duration: null, tags: [], notes: null, used_count: 0,
        })
      } catch (e) { setNotice(`Échec ${file.name} : ${e instanceof Error ? e.message : ''}`) }
    }
    setUploading(null)
    setNotice(`${list.length} fichier(s) importé(s).`)
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
      const u = (await supabase.storage.from('content').createSignedUrl(it.storage_path, 3600)).data?.signedUrl
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
      let q = supabase.from('content_bank').update({ deleted_at: nowIso }).in('id', part).select('id')
      q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
      const { data, error } = await q
      if (error) { if (!firstErr) firstErr = error.message } else { deleted += (data?.length ?? 0) }
    }

    setDeleting(false); setConfirmDel(null)
    if (deleted === 0) {
      setNotice(firstErr
        ? `Échec de la mise en corbeille : ${firstErr}`
        : "Aucun média mis en corbeille — ils appartiennent à un autre compte ou à une organisation où tu n'es pas admin.")
      setSel(new Set()); load(); return
    }
    setNotice(deleted < ids.length
      ? `${deleted}/${ids.length} média(s) → corbeille (restaurable 7 j) — les autres ne t'appartiennent pas.`
      : `${deleted} média(s) → corbeille (restaurable 7 j).`)
    setSel(new Set()); load()
  }

  // Corbeille : restaurer (deleted_at = null) ou supprimer DÉFINITIVEMENT (row + fichier).
  async function restoreMedia(ids: string[]) {
    if (!ids.length) return
    let q = supabase.from('content_bank').update({ deleted_at: null }).in('id', ids)
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    await q; load()
  }
  async function purgeMedia(items: ContentItem[]) {
    const ids = items.map(i => i.id)
    if (!ids.length) return
    const paths = items.flatMap(i => [i.storage_path, i.thumbnail_path].filter(Boolean) as string[])
    let q = supabase.from('content_bank').delete().in('id', ids)
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    await q
    for (const part of ((a: string[], n: number) => { const o: string[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o })(paths, 100)) {
      try { if (part.length) await supabase.storage.from('content').remove(part) } catch { /* best-effort */ }
    }
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
    const { error: upErr } = await scopeQ(supabase.from('content_bank').update({ folder: null }).eq('folder', name).not('notes', 'in', '("__sf_folder__","__sf_drive_folder__")'))
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
  function openPlayer(i: ContentItem) {
    const url = (i.storage_path && thumbs[i.storage_path]) || i.file_url
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
      {showTrash && (
        <div onClick={() => setShowTrash(false)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(680px,96vw)', maxHeight: '82vh', overflowY: 'auto', borderRadius: 10, background: '#111113', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.7)', padding: 18, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.015em' }}>🗑 Corbeille ({trash.length})</span>
              <button onClick={() => setShowTrash(false)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'none', border: 'none', color: '#8B8B94', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#8B8B94' }}>Médias supprimés — restaurables 7 jours puis purgés définitivement.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Btn theme={theme} sm tone="primary" label="Tout restaurer" onClick={() => { restoreMedia(trash.map(t => t.id)); setShowTrash(false) }} />
              <Btn theme={theme} sm tone="quiet" label="Vider définitivement" onClick={async () => { if (await confirmDialog({ title: 'Supprimer DÉFINITIVEMENT tous les médias de la corbeille ?', confirmLabel: 'Vider définitivement', danger: true })) { purgeMedia(trash); setShowTrash(false) } }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {trash.map(t => {
                const days = t.deleted_at ? Math.max(0, 7 - Math.floor((Date.now() - new Date(t.deleted_at).getTime()) / 86400000)) : 7
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 6px 12px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <span style={{ fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>purge dans {days}j</span>
                    <Btn theme={theme} sm tone="quiet" label="Restaurer" onClick={() => restoreMedia([t.id])} />
                    <button onClick={async () => { if (await confirmDialog({ title: 'Supprimer définitivement ce média ?', confirmLabel: 'Supprimer', danger: true })) purgeMedia([t]) }} title="Supprimer définitivement" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'none', border: 'none', color: '#F87171', fontWeight: 500, fontSize: 16, cursor: 'pointer' }}>×</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
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
      <PageHead
        title="Banque de contenu"
        sub={loading
          ? 'Toutes tes vidéos et images, organisées par dossier.'
          : total === 0
            ? 'Toutes tes vidéos et images, organisées par dossier.'
            : `Toutes tes vidéos et images, organisées par dossier. ${neverPublished} média${neverPublished > 1 ? 's' : ''} n’${neverPublished > 1 ? 'ont' : 'a'} jamais été publié${neverPublished > 1 ? 's' : ''}.`}
        actions={<>
          {trash.length > 0 && <Btn label={`Corbeille (${trash.length})`} theme={theme} icon="M3 6h18|M8 6V4h8v2|M6 6l1 14h10l1-14" onClick={() => setShowTrash(true)} />}
          <Btn label="Sync Drive" theme={theme} icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16" onClick={load} />
          <Btn label={uploading ? uploading : "Importer"} theme={theme} tone="primary" icon="M12 5v14|M5 12h14" disabled={!!uploading} onClick={() => fileRef.current?.click()} />
        </>}
      />

      {/* Corps : colonne Dossiers + grille */}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : '228px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
        {/* Dossiers */}
        <Panel theme={theme}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 16px', minHeight: 48, boxSizing: 'border-box',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>Dossiers</span>
            <span style={{ marginLeft: 'auto' }}>
              <Btn theme={theme} sm tone="quiet" icon="M12 5v14|M5 12h14" label="Nouveau dossier" onClick={() => { setFolderName(''); setFolderModal(true) }} />
            </span>
          </div>
          <div>
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
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 34, padding: '0 16px',
                    border: 'none', cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                    outline: dragOver === f.n ? `1px dashed ${theme.selEdge}` : 'none', outlineOffset: -3,
                    background: dragOver === f.n ? theme.selBg : on ? 'rgba(255,255,255,0.06)' : 'transparent', transition: 'background .12s ease',
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (dragOver !== f.n) e.currentTarget.style.background = on ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                >
                  <span style={{ display: 'flex', color: f.special ? '#4ADE80' : on ? theme.accentText : '#71717A' }}>
                    <Icon d={f.special ? 'M12 2v20|M2 12h20' : 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z'} size={13} />
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500,
                    color: on ? '#EDEDEF' : '#A1A1AA',
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
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', minHeight: 48, boxSizing: 'border-box',
            borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap',
          }}>
            <Segmented<TabKey> value={tab} onChange={k => { setTab(k); setFolder('Tous') }}
              options={TABS.map(t => ({ v: t.k, l: t.l, n: loading ? undefined : t.n }))} />

            <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)' }} />

            <span style={{
              ...FIELD_SM, width: 'auto', display: 'flex', alignItems: 'center', gap: 8,
              flex: '0 1 200px', minWidth: 132,
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
                  style={{ marginLeft: 'auto', height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${allSel ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.09)'}`, background: allSel ? 'rgba(255,255,255,0.07)' : '#161618', color: allSel ? '#EDEDEF' : '#A1A1AA', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
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
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 8, background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Légende'}</span>
                        <button onClick={() => deleteCaption(c.id)} title="Supprimer" style={{ marginLeft: 'auto', display: 'flex', width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: '#71717A', cursor: 'pointer' }}><Icon d="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" size={13} /></button>
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#A1A1AA', whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'hidden' }}>{c.content}</div>
                      <button onClick={() => { navigator.clipboard?.writeText(c.content); toast('Légende copiée.', 'ok') }} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: '#1C1C1F', color: '#EDEDEF', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Copier</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading ? (
            <div aria-busy="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(112px,132px))', gap: 12, padding: 16 }}>
              {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} h={196} r={8} />)}
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
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(112px,132px))',
              gap: 8, padding: 16, WebkitUserSelect: 'none', userSelect: 'none',
            }}>
              {shown.map((i, idx) => (
                <Tile
                  key={i.id} idx={idx} selecting={selecting} item={i} type={tab} thumb={thumbFor(i)} media={mediaFor(i)}
                  on={sel.has(i.id)} theme={theme} onToggle={(e) => toggleAt(idx, i.id, e.shiftKey)}
                  onDragStart={e => e.dataTransfer.setData('text/plain', i.id)}
                  onOpen={() => openPlayer(i)}
                  onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item: i }) }}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
      {band && createPortal(<div aria-hidden style={{ position: 'fixed', left: band.x, top: band.y, width: band.w, height: band.h, zIndex: 80, pointerEvents: 'none', borderRadius: 4, border: `1px solid ${theme.accent}`, background: `rgba(${theme.tone},0.12)` }} />, document.body)}

      {/* Barre d'actions groupées (sticky) */}
      {sel.size > 0 && (
        <div style={{
          position: 'sticky', bottom: 14, marginTop: 14, zIndex: 40, display: 'flex',
          alignItems: 'center', gap: 8, padding: '8px 8px 8px 16px', borderRadius: 8,
          background: '#161618', border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)', flexWrap: 'wrap',
          animation: 'aPop .22s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{sel.size}</span>
            <span style={{ fontSize: 12.5, fontWeight: 400, color: '#8B8B94' }}>sélectionnée{sel.size > 1 ? 's' : ''}</span>
          </span>
          <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
          <Btn label={isCloud ? 'Publier' : 'Mass Posting'} theme={theme} sm tone="primary" icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" onClick={() => onNavigate?.('publish')} />
          {sel.size === 1 && <Btn label="Description" theme={theme} sm icon="M4 7V4h16v3|M9 20h6|M12 4v16" onClick={openDesc} />}
          <Btn label="Remixer" theme={theme} sm icon="M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6" onClick={() => onNavigate?.('studio')} />
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
        <Modal theme={theme} title={`Supprimer ${confirmDel.length} média(s) ?`} sub="Action irréversible — les fichiers sont retirés du stockage." icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6"
          onClose={() => setConfirmDel(null)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setConfirmDel(null)} />
            <Btn theme={theme} tone="danger" label={deleting ? 'Suppression…' : 'Supprimer'} disabled={deleting} onClick={() => deleteMedia(confirmDel)} />
          </>}>
          <p style={{ margin: 0, fontSize: 13, color: '#A1A1AA', lineHeight: 1.6 }}>Les médias sélectionnés seront définitivement supprimés de ta banque.</p>
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
