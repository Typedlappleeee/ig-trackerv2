import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Empty, Icon, Panel, Modal } from '@/lib/ui'
import type { OrgState } from '@/lib/data'

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

// ── Case à cocher de vignette (portée du prototype _tile) ──────────────────────
function TileCheck({ on }: { on: boolean }) {
  return (
    <span style={{
      position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 17, height: 17, borderRadius: 5,
      background: on ? '#7C3AED' : 'rgba(11,11,15,0.72)',
      border: on ? 'none' : '1px solid rgba(255,255,255,0.16)',
      color: '#fff', fontSize: 9, fontWeight: 900,
    }}>{on ? '✓' : ''}</span>
  )
}

// ── Vignette 9/16 (vidéo) ou 4/5 (image). Vraie miniature si dispo, sinon un
//    placeholder à rayures diagonales CSS teinté (aucune image inventée). ────────
function Tile({ item, type, thumb, media, on, theme, onToggle, onDragStart }: {
  item: ContentItem; type: MediaType; thumb: string | null; media: string | null; on: boolean; theme: Theme; onToggle: () => void; onDragStart?: (e: React.DragEvent) => void
}) {
  const h = hueFor(item.id)
  const fresh = (item.used_count ?? 0) === 0
  const dur = type === 'video' ? fmtDuration(item.duration) : ''
  const placeholder: CSSProperties = {
    position: 'absolute', inset: 0,
    background: `repeating-linear-gradient(135deg, rgba(${h},0.20), rgba(${h},0.20) 7px, rgba(${h},0.05) 7px, rgba(${h},0.05) 14px)`,
  }
  return (
    <button
      onClick={onToggle}
      draggable
      onDragStart={onDragStart}
      title="Glisse vers un dossier pour ranger"
      style={{
        position: 'relative', aspectRatio: type === 'image' ? '4 / 5' : '9 / 16', borderRadius: 9, padding: 0,
        cursor: 'grab', overflow: 'hidden', transition: 'all .14s ease',
        border: `1.5px solid ${on ? theme.accentBtnEdge : 'rgba(255,255,255,0.07)'}`,
        background: `linear-gradient(160deg, rgba(${h},0.17), rgba(${h},0.035))`,
      }}
    >
      {thumb
        ? <img src={thumb} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : media
          ? (type === 'video'
              // Vraie vidéo : on affiche sa 1re image (metadata + #t=0.1) — plus de placeholder chelou.
              ? <video src={`${media}#t=0.1`} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src={media} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)
          : <span style={placeholder} />}

      <TileCheck on={on} />

      {fresh && (
        <span style={{
          position: 'absolute', top: 6, left: 6, padding: '2px 6px', borderRadius: 4,
          background: 'rgba(16,185,129,0.9)', color: '#04140C', fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
        }}>NEUF</span>
      )}

      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 7px 6px',
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'linear-gradient(180deg, transparent, rgba(8,8,12,0.9))',
      }}>
        <span style={{
          flex: 1, minWidth: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5,
          color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.title}</span>
        {dur && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'rgba(255,255,255,0.42)' }}>{dur}</span>}
      </span>
    </button>
  )
}

const el = '…'

export default function Bank({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg } = org
  const [items, setItems] = useState<ContentItem[]>([])
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
    setItems(rows.filter(r => !isSentinel(r)))
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
  const [notice, setNotice] = useState<string | null>(null)
  const moveFolders = useMemo(() => folders.filter(f => f.n !== 'Tous' && !f.special).map(f => f.n), [folders])

  async function doMove(target: string) {
    const dest = target.trim(); if (!dest || sel.size === 0) return
    setMoving(true)
    const { error: err } = await supabase.from('content_bank').update({ folder: dest }).in('id', [...sel])
    setMoving(false)
    if (err) { setNotice(`Échec du déplacement : ${err.message}`); return }
    setMoveOpen(false); setNewFolder(''); setNotice(`${sel.size} média(s) déplacé(s) vers « ${dest} ».`); setSel(new Set())
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

  const toggle = (id: string) => setSel(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

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

  // Segments réutilisables (portés du prototype _bank → seg()).
  function Seg({ children }: { children: React.ReactNode }) {
    return (
      <span style={{
        display: 'flex', gap: 2, padding: 2, borderRadius: 8,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      }}>{children}</span>
    )
  }
  function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button onClick={onClick} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px',
        border: 'none', borderRadius: 6, cursor: 'pointer',
        background: on ? `rgba(${theme.tone},0.16)` : 'transparent',
        color: on ? theme.accentText : '#71717A', fontSize: 11, fontWeight: 700, transition: 'all .14s ease',
      }}>{children}</button>
    )
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 22,
            fontWeight: 700, letterSpacing: '-0.025em', color: '#F4F4F6',
          }}>Banque de contenu</h1>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#71717A', maxWidth: 620 }}>
            {loading
              ? 'Toutes tes vidéos et images, organisées par dossier.'
              : total === 0
                ? 'Toutes tes vidéos et images, organisées par dossier.'
                : `Toutes tes vidéos et images, organisées par dossier. ${neverPublished} média${neverPublished > 1 ? 's' : ''} n’${neverPublished > 1 ? 'ont' : 'a'} jamais été publié${neverPublished > 1 ? 's' : ''}.`}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Btn label="Sync Drive" theme={theme} icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16" onClick={load} />
          <Btn label={uploading ? uploading : "Importer"} theme={theme} tone="primary" icon="M12 5v14|M5 12h14" disabled={!!uploading} onClick={() => fileRef.current?.click()} />
        </div>
      </div>

      {/* Corps : colonne Dossiers + grille */}
      <div style={{ display: 'grid', gridTemplateColumns: '196px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
        {/* Dossiers */}
        <Panel theme={theme}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F6' }}>Dossiers</span>
            <span style={{ marginLeft: 'auto' }}>
              <Btn theme={theme} sm tone="quiet" icon="M12 5v14|M5 12h14" label="Nouveau dossier" />
            </span>
          </div>
          <div>
            {folders.map(f => {
              const on = folder === f.n
              return (
                <button
                  key={f.n}
                  onClick={() => setFolder(f.n)}
                  onDragOver={e => { if (f.n !== 'Tous' && f.n !== 'Jamais publiées') { e.preventDefault(); setDragOver(f.n) } }}
                  onDragLeave={() => setDragOver(d => d === f.n ? null : d)}
                  onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setDragOver(null); if (id) dropOnFolder(f.n, id) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 13px',
                    border: 'none', cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                    borderLeft: `2px solid ${dragOver === f.n ? theme.accent : on ? theme.accentBtnEdge : 'transparent'}`,
                    background: dragOver === f.n ? `rgba(${theme.tone},0.16)` : on ? `rgba(${theme.tone},0.07)` : 'transparent', transition: 'all .14s ease',
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                  onMouseLeave={e => { if (dragOver !== f.n) e.currentTarget.style.background = on ? `rgba(${theme.tone},0.07)` : 'transparent' }}
                >
                  <span style={{ display: 'flex', color: f.special ? '#34D399' : on ? theme.accentSoft : '#52525B' }}>
                    <Icon d={f.special ? 'M12 2v20|M2 12h20' : 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z'} size={13} />
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: on ? 700 : 600,
                    color: on ? '#F4F4F6' : f.special ? '#A7F3D0' : '#A1A1AA',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{f.n}</span>
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                    color: on ? 'rgba(196,181,253,0.7)' : '#3F3F46',
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
            display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px',
            borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap',
          }}>
            <Seg>
              {TABS.map(t => (
                <SegBtn key={t.k} on={tab === t.k} onClick={() => { setTab(t.k); setFolder('Tous') }}>
                  {t.l}
                  <span style={{ opacity: 0.55, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{loading ? '' : t.n}</span>
                </SegBtn>
              ))}
            </Seg>

            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />

            <span style={{
              display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 11px', borderRadius: 8,
              flex: '0 1 200px', minWidth: 132,
              border: `1px solid ${q ? theme.selEdge : 'rgba(255,255,255,0.07)'}`,
              background: 'rgba(255,255,255,0.02)', transition: 'border-color .16s ease',
            }}>
              <span style={{ display: 'flex', color: q ? theme.accentSoft : '#52525B', flexShrink: 0 }}>
                <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M20 20l-4.35-4.35" size={12} sw={2} />
              </span>
              <input
                type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', color: '#F4F4F6', fontSize: 11.5 }}
              />
            </span>

            <Seg>
              {SORTS.map(s => (
                <SegBtn key={s.k} on={sort === s.k} onClick={() => setSort(s.k)}>{s.l}</SegBtn>
              ))}
            </Seg>

            <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#52525B' }}>
              {loading ? el : sel.size ? `${sel.size} sélectionnée${sel.size > 1 ? 's' : ''}` : `${folder} · ${shown.length} affichée${shown.length > 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Contenu */}
          {tab === 'caption' ? (
            <div style={{ padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#71717A' }}>Des légendes réutilisables pour tes posts et stories.</span>
                <span style={{ marginLeft: 'auto' }}><Btn label="Nouvelle légende" theme={theme} sm tone="primary" icon="M12 5v14|M5 12h14" onClick={() => { setCapTitle(''); setCapContent(''); setCapOpen(true) }} /></span>
              </div>
              {captions.length === 0 ? (
                <Empty icon="M4 7V4h16v3|M9 20h6|M12 4v16" title="Aucune légende" text="Crée des légendes prêtes à coller dans tes publications." action={<Btn label="Nouvelle légende" theme={theme} sm tone="primary" onClick={() => setCapOpen(true)} />} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
                  {captions.map(c => (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 10, background: theme.panelBg, border: `1px solid ${theme.panelEdge}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F4F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Légende'}</span>
                        <button onClick={() => deleteCaption(c.id)} title="Supprimer" style={{ marginLeft: 'auto', display: 'flex', width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: '#71717A', cursor: 'pointer' }}><Icon d="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" size={13} /></button>
                      </div>
                      <div style={{ fontSize: 11.5, lineHeight: 1.6, color: '#A1A1AA', whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'hidden' }}>{c.content}</div>
                      <button onClick={() => { navigator.clipboard?.writeText(c.content); setNotice('Légende copiée.') }} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', color: '#A1A1AA', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Copier</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading ? (
            <div style={{ padding: '48px 15px', textAlign: 'center', fontSize: 13, color: '#52525B' }}>{el}</div>
          ) : error ? (
            <div style={{ padding: '40px 15px', textAlign: 'center', fontSize: 12.5, color: '#F87171' }}>{error}</div>
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
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(112px,132px))',
              gap: 9, padding: 13,
            }}>
              {shown.map(i => (
                <Tile
                  key={i.id} item={i} type={tab} thumb={thumbFor(i)} media={mediaFor(i)}
                  on={sel.has(i.id)} theme={theme} onToggle={() => toggle(i.id)}
                  onDragStart={e => e.dataTransfer.setData('text/plain', i.id)}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Barre d'actions groupées (sticky) */}
      {sel.size > 0 && (
        <div style={{
          position: 'sticky', bottom: 14, marginTop: 14, display: 'flex',
          alignItems: 'center', gap: 10, padding: '9px 10px 9px 14px', borderRadius: 10,
          background: '#16161C', border: `1px solid rgba(${theme.tone},0.3)`,
          boxShadow: '0 18px 44px -16px rgba(0,0,0,0.9)', flexWrap: 'wrap',
          animation: 'aPop .22s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: theme.accentText }}>{sel.size}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#A1A1AA' }}>sélectionnée{sel.size > 1 ? 's' : ''}</span>
          </span>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          <Btn label={isCloud ? 'Publier' : 'Mass Posting'} theme={theme} sm tone="primary" icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" />
          {sel.size === 1 && <Btn label="Description" theme={theme} sm icon="M4 7V4h16v3|M9 20h6|M12 4v16" onClick={openDesc} />}
          <Btn label="Remixer" theme={theme} sm icon="M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6" onClick={() => setNotice('Remix : ouvre le Studio vidéo (Production) pour générer des variantes de tes vidéos.')} />
          <Btn label="Déplacer" theme={theme} sm icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" onClick={() => setMoveOpen(true)} />
          <span style={{ marginLeft: 'auto' }}>
            <Btn label="Désélectionner" theme={theme} sm tone="quiet" onClick={() => setSel(new Set())} />
          </span>
        </div>
      )}

      {notice && (
        <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: 8, background: `rgba(${theme.tone},0.08)`, border: `1px solid rgba(${theme.tone},0.22)`, fontSize: 12, color: '#E4E4E7' }}>{notice}</div>
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
              <button key={f} onClick={() => doMove(f)} disabled={moving} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', color: '#E4E4E7', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ color: theme.accentText, display: 'flex' }}><Icon d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" size={15} /></span>{f}
              </button>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="Nouveau dossier…" style={{ flex: 1, height: 34, padding: '0 11px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12.5, outline: 'none' }} />
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
            <input value={capTitle} onChange={e => setCapTitle(e.target.value)} placeholder="Titre (optionnel)" style={{ height: 34, padding: '0 11px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12.5, outline: 'none' }} />
            <textarea value={capContent} onChange={e => setCapContent(e.target.value)} rows={6} placeholder="Ta légende…" style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'inherit', outline: 'none' }} />
          </div>
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
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>Cette description pré-remplira la légende quand tu publieras ce média.</p>
          <textarea value={descVal} onChange={e => setDescVal(e.target.value)} rows={6} placeholder="Écris la légende / description…"
            style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'inherit', outline: 'none' }} />
        </Modal>
      )}
    </div>
  )
}
