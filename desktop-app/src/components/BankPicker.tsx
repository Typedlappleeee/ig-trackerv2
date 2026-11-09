import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAllRows, uploadThumbFor } from '@/lib/bankStorage'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { useBankThumbs } from '@/lib/data'
import { Modal, Btn, FIELD, Skeleton, SkeletonRows } from '@/lib/ui'
import VideoFrame from './VideoFrame'
import { folderTree, isWithin, childFolders, normPath, setFolderFav } from '@/lib/bankFolders'
import { mediaKindOf, kindOfFile, extOfPath, isFav, withFav, AUDIO_MIME, type MediaKind } from '@/lib/mediaKind'
import { heicToJpeg } from '@/lib/heic'
import { niceBase } from '@/lib/niceTitle'

// Sélecteur « Banque » commun (fidèle à _openPicker du prototype ZIP) : une modale
// avec recherche + grille (vidéos/images) ou liste (légendes), sélection multi ou
// simple, et renvoi du résultat au parent. Réutilisé par Reels, Story, Cross, Studio.
export type PickerKind = 'videos' | 'images' | 'audios' | 'captions'
export type PickerResult =
  | { kind: 'videos' | 'images' | 'audios'; ids: string[] }
  | { kind: 'captions'; text: string; texts: string[] }

interface Media { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; notes: string | null; folder: string | null; tags: string[] | null }
interface Cap { id: string; title: string | null; content: string }

const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const KIND_OF_PICKER: Record<'videos' | 'images' | 'audios', MediaKind> = { videos: 'video', images: 'image', audios: 'audio' }
const HUES = ['139,92,246', '6,182,212', '236,72,153', '16,185,129', '245,158,11', '99,102,241']
const FAVS = '★ Favoris'

// Tuile LAZY : ne monte l'aperçu (vidéo/image) que quand elle est visible à l'écran
// (IntersectionObserver) et le décharge hors écran. Évite de monter 600 <video> d'un
// coup → la banque ne rame/bug plus.
function MediaTile({ m, prev, on, fav, accent, accentBtn, onToggle, onFav }: {
  m: Media; prev: string | null; on: boolean; fav: boolean; hue: string; accent: string; accentBtn: string; onToggle: () => void; onFav: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(es => setVis(es[0]?.isIntersecting ?? false), { rootMargin: '300px' })
    io.observe(el); return () => io.disconnect()
  }, [])
  const kind = mediaKindOf(m)
  const isVid = kind === 'video' && !m.thumbnail_url && !m.thumbnail_path
  return (
    <button ref={ref} onClick={onToggle} title={m.title} style={{
      position: 'relative', aspectRatio: kind === 'audio' ? '1 / 1' : '9 / 16', borderRadius: 6, padding: 0, cursor: 'pointer', overflow: 'hidden',
      border: '1px solid ' + (on ? accent : 'rgba(255,255,255,0.08)'),
      background: '#161618',
    }}>
      {kind === 'audio'
        ? <AudioFace title={m.title} src={prev} />
        : prev && (isVid
          ? <VideoFrame src={prev} load={vis} />
          : vis && <img src={prev} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
      <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box', background: on ? accentBtn : 'rgba(10,10,11,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 600 }}>{on ? '✓' : ''}</span>
      <span role="button" aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        onClick={e => { e.stopPropagation(); onFav() }}
        style={{ position: 'absolute', top: 3, left: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, background: 'rgba(10,10,11,0.6)', color: fav ? '#FBBF24' : 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1, zIndex: 2 }}>{fav ? '★' : '☆'}</span>
    </button>
  )
}

// Face d'un son : icône + titre + écoute (▶ sans cocher la tuile).
export function AudioFace({ title, src }: { title: string; src: string | null }) {
  const [playing, setPlaying] = useState(false)
  const aRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { aRef.current?.pause() }, [])
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!src) return
    if (!aRef.current) { aRef.current = new Audio(src); aRef.current.onended = () => setPlaying(false) }
    if (playing) { aRef.current.pause(); setPlaying(false) } else { void aRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
  }
  return (
    <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '22px 6px 6px', background: 'linear-gradient(160deg, rgba(16,185,129,0.22), #161618)' }}>
      <span role="button" aria-label={playing ? 'Pause' : 'Écouter'} onClick={toggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 99, background: playing ? '#10B981' : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, cursor: src ? 'pointer' : 'default' }}>{playing ? '❚❚' : '▶'}</span>
      <span data-no-tr style={{ maxWidth: '100%', fontSize: 10.5, fontWeight: 600, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>♪ {title}</span>
    </span>
  )
}

export default function BankPicker({ theme, user, org, kind, multi = true, initialIds = [], title, onClose, onApply }: {
  theme: Theme; user: User; org: OrgState
  kind: PickerKind; multi?: boolean; initialIds?: string[]
  title?: string; onClose: () => void; onApply: (r: PickerResult) => void
}) {
  const { currentOrg } = org
  const scopeArg = { orgId: currentOrg?.id ?? null, userId: user.id }
  const [media, setMedia] = useState<Media[]>([])
  const [caps, setCaps] = useState<Cap[]>([])
  const [sel, setSel] = useState<string[]>(initialIds)
  const [q, setQ] = useState('')
  // Dernier dossier ouvert, mémorisé par type de sélecteur (on retombe dedans la fois suivante).
  const lastKey = `sf-picker-folder-${kind}`
  const [folder, setFolderState] = useState<string>(() => { try { return localStorage.getItem(lastKey) || 'Tous' } catch { return 'Tous' } })
  const setFolder = (f: string) => { setFolderState(f); try { localStorage.setItem(lastKey, f) } catch { /* ignore */ } }
  const [favFolders, setFavFolders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const want: MediaKind | null = kind === 'captions' ? null : KIND_OF_PICKER[kind]

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (x: any) => currentOrg ? x.eq('org_id', currentOrg.id) : x.eq('user_id', user.id).is('org_id', null)
    if (kind === 'captions') {
      const { data } = await scope(supabase.from('caption_bank').select('id,title,content')).order('created_at', { ascending: false })
      setCaps((data ?? []) as Cap[])
    } else {
      const { data } = await fetchAllRows<any>(() => scope(supabase.from('content_bank').select('*')).is('deleted_at', null).order('created_at', { ascending: false }).order('id'))
      const rows = (data ?? []) as Media[]
      const isSent = (m: Media) => SENTINELS.includes(m.notes ?? '') && !m.storage_path && !m.file_url
      setFavFolders([...new Set(rows.filter(m => isSent(m) && m.folder && isFav(m)).map(m => normPath(m.folder as string)))])
      // STRICT : un sélecteur de vidéos ne montre QUE des vidéos (jamais d'image ni de son),
      // même si la banque n'en contient aucune (avant : repli sur « tout » → images au posting Reels).
      setMedia(rows.filter(m => !isSent(m) && mediaKindOf(m) === want))
    }
    setLoading(false)
  }, [currentOrg?.id, user.id, kind, want])
  useEffect(() => { load() }, [load])

  // Navigation par niveau : on ne montre que les sous-dossiers du dossier ouvert (+ les favoris),
  // au lieu de la liste à plat de TOUS les dossiers.
  const allPaths = useMemo(() => folderTree(media.map(m => m.folder)).map(n => n.path), [media])
  const realFolder = folder !== 'Tous' && folder !== FAVS ? folder : null
  useEffect(() => {   // dossier mémorisé disparu → racine
    if (!loading && realFolder && !allPaths.some(p => isWithin(p, realFolder)) && !favFolders.includes(realFolder)) setFolder('Tous')
  }, [loading, allPaths, realFolder])
  const children = useMemo(() => childFolders(allPaths, realFolder), [allPaths, realFolder])
  const crumbs = realFolder ? realFolder.split('/').map((_, i, a) => a.slice(0, i + 1).join('/')) : []
  const hasFavMedia = media.some(isFav)
  const filteredMedia = useMemo(() => {
    const s = q.trim().toLowerCase()
    return media
      .filter(m => folder === 'Tous' || (folder === FAVS ? isFav(m) : isWithin(m.folder, folder)))
      .filter(m => !s || (m.title ?? '').toLowerCase().includes(s))
      // favoris en premier
      .sort((a, b) => Number(isFav(b)) - Number(isFav(a)))
  }, [media, q, folder])
  // Affichage progressif (60 puis la suite en défilant) et liens des SEULES vignettes affichées.
  const [limit, setLimit] = useState(60)
  useEffect(() => { setLimit(60) }, [q, folder])
  const renderedMedia = useMemo(() => filteredMedia.slice(0, limit), [filteredMedia, limit])
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = moreRef.current; if (!el) return
    const io = new IntersectionObserver(es => { if (es[0]?.isIntersecting) setLimit(l => l + 60) }, { rootMargin: '300px' })
    io.observe(el); return () => io.disconnect()
  }, [limit, filteredMedia.length])
  const { thumbFor } = useBankThumbs(renderedMedia)
  const filteredCaps = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? caps.filter(c => (c.title ?? '').toLowerCase().includes(s) || c.content.toLowerCase().includes(s)) : caps
  }, [caps, q])

  const toggle = (id: string) => setSel(cur => multi
    ? (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
    : (cur[0] === id ? [] : [id]))

  async function toggleFav(m: Media) {
    const tags = withFav(m.tags, !isFav(m))
    setMedia(list => list.map(x => x.id === m.id ? { ...x, tags } : x))
    const { error } = await supabase.from('content_bank').update({ tags }).eq('id', m.id)
    if (error) setMedia(list => list.map(x => x.id === m.id ? { ...x, tags: m.tags } : x))
  }
  async function toggleFolderFav(path: string) {
    const on = !favFolders.includes(path)
    setFavFolders(f => on ? [...f, path] : f.filter(x => x !== path))
    await setFolderFav(scopeArg, path, on).catch(() => setFavFolders(f => on ? f.filter(x => x !== path) : [...f, path]))
  }

  // Import depuis le PC (multi-fichiers + glisser-déposer) → bucket content → banque.
  // Rangé dans le dossier ouvert ; seuls les fichiers du type du sélecteur sont pris.
  async function importFiles(files: FileList | File[]) {
    // HEIC (iPhone) → JPEG avant l'envoi
    const conv = await Promise.all(Array.from(files).map(f => heicToJpeg(f).catch(() => f)))
    const list = conv.filter(f => kindOfFile(f) === want)
    if (list.length === 0) return
    const scopeFolder = currentOrg ? `orgs/${currentOrg.id}` : `users/${user.id}`
    const newIds: string[] = []
    let done = 0
    for (const file of list) {
      setUploading(`${file.name} (${++done}/${list.length})`)
      try {
        let ext = extOfPath(file.name)
        if (!ext) ext = want === 'image' ? 'jpg' : want === 'audio' ? 'mp3' : 'mp4'
        const id = crypto.randomUUID()
        const storagePath = `videos/${scopeFolder}/${id}.${ext}`
        const up = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || AUDIO_MIME[ext] || undefined, upsert: false })
        if (up.error) continue
        const th = want === 'video' ? await uploadThumbFor(file, storagePath) : { thumbPath: null, duration: null }
        const ins = await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          title: await niceBase(scopeArg, file.name.replace(/\.[a-z0-9]+$/i, ''), realFolder), storage_path: storagePath, thumbnail_path: th.thumbPath,
          file_url: null, folder: realFolder, duration: th.duration, tags: [], notes: null, used_count: 0,
        }).select('id').single()
        if (ins.data?.id) newIds.push(ins.data.id as string)
      } catch { /* ignore */ }
    }
    setUploading(null)
    await load()
    // Auto-sélection des nouveaux imports.
    setSel(cur => multi ? [...cur, ...newIds] : (newIds[0] ? [newIds[0]] : cur))
  }

  const word = kind === 'captions' ? 'légende' : kind === 'images' ? 'image' : kind === 'audios' ? 'son' : 'vidéo'
  const n = sel.length
  const cta = n ? `Utiliser ${n} ${word}${n > 1 ? 's' : ''}` : 'Valider'

  function apply() {
    if (kind === 'captions') {
      const texts = sel.map(id => caps.find(c => c.id === id)?.content).filter((t): t is string => !!t)
      onApply({ kind: 'captions', text: texts[0] ?? '', texts })
    } else {
      onApply({ kind, ids: sel })
    }
    onClose()
  }

  const footer = (
    <>
      <span style={{ flex: 1, fontSize: 12, color: n ? '#A1A1AA' : '#71717A', fontVariantNumeric: 'tabular-nums' }}>
        {n ? `Sélection : ${n}` : 'Coche ce que tu veux utiliser'}
      </span>
      <Btn theme={theme} tone="quiet" sm label="Annuler" onClick={onClose} />
      <Btn theme={theme} tone="primary" sm disabled={n === 0} icon="M20 6L9 17l-5-5" label={cta} onClick={apply} />
    </>
  )

  const chip = (on: boolean): React.CSSProperties => ({
    height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
    background: on ? 'rgba(255,255,255,0.08)' : '#161618',
    border: '1px solid ' + (on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.09)'), color: on ? '#EDEDEF' : '#A1A1AA',
  })
  const accept = want === 'image' ? 'image/*' : want === 'audio' ? 'audio/*,.mp3,.m4a,.wav,.aac,.ogg,.opus,.flac' : 'video/*'

  return (
    <Modal theme={theme} title={title ?? 'Choisir dans la banque'} icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z"
      onClose={onClose} footer={footer} width={620}>
      <div style={{ display: 'flex', gap: 8, padding: '0 0 10px', alignItems: 'center' }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
          style={{ ...FIELD, flex: 1, minWidth: 0 }} />
        {kind !== 'captions' && <>
          <Btn theme={theme} sm tone="ghost" icon="M12 3v12|M7 10l5 5 5-5|M4 21h16" label={uploading ? 'Import…' : 'Mon PC'} disabled={!!uploading} onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" multiple accept={accept} style={{ display: 'none' }}
            onChange={e => { if (e.target.files) importFiles(e.target.files); e.target.value = '' }} />
        </>}
      </div>

      {kind !== 'captions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 0 10px' }}>
          {/* Ligne 1 : Tous · Favoris · dossiers favoris (toujours visibles) */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setFolder('Tous')} style={chip(folder === 'Tous')}>Tous</button>
            {(hasFavMedia || folder === FAVS) && <button onClick={() => setFolder(FAVS)} style={{ ...chip(folder === FAVS), color: '#FBBF24' }}>★ Favoris</button>}
            {favFolders.filter(f => allPaths.includes(f)).map(f => (
              <button key={`fav-${f}`} onClick={() => setFolder(f)} title={f} style={chip(folder === f)}>★ 📁 {f.split('/').join(' › ')}</button>
            ))}
            {multi && filteredMedia.length > 0 && (
              <button onClick={() => setSel(cur => [...new Set([...cur, ...filteredMedia.map(m => m.id)])])} style={{
                marginLeft: 'auto', height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: '#EDEDEF', border: '1px solid #EDEDEF', color: '#0A0A0B',
              }}>{folder === 'Tous' ? `Tout ajouter (${filteredMedia.length})` : `Ajouter le dossier (${filteredMedia.length})`}</button>
            )}
          </div>
          {/* Ligne 2 : chemin du dossier ouvert (cliquable) + étoile du dossier */}
          {realFolder && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#71717A' }}>
              <button onClick={() => setFolder('Tous')} style={{ background: 'none', border: 'none', color: '#A1A1AA', cursor: 'pointer', fontSize: 12, padding: 0 }}>Banque</button>
              {crumbs.map(c => (
                <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  ›<button onClick={() => setFolder(c)} style={{ background: 'none', border: 'none', color: c === realFolder ? '#EDEDEF' : '#A1A1AA', fontWeight: c === realFolder ? 600 : 400, cursor: 'pointer', fontSize: 12, padding: 0 }}>{c.split('/').pop()}</button>
                </span>
              ))}
              <button onClick={() => void toggleFolderFav(realFolder)} title={favFolders.includes(realFolder) ? 'Retirer ce dossier des favoris' : 'Épingler ce dossier en favori'}
                style={{ marginLeft: 6, height: 22, padding: '0 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5, background: 'transparent', border: '1px solid rgba(255,255,255,0.09)', color: favFolders.includes(realFolder) ? '#FBBF24' : '#A1A1AA' }}>
                {favFolders.includes(realFolder) ? '★ Favori' : '☆ Épingler'}
              </button>
            </div>
          )}
          {/* Ligne 3 : sous-dossiers DIRECTS seulement */}
          {folder !== FAVS && children.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {children.map(f => (
                <button key={f} onClick={() => setFolder(f)} title={f} style={chip(false)}>📁 {f.split('/').pop()}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        onDragOver={kind !== 'captions' ? (e) => { e.preventDefault(); setDrag(true) } : undefined}
        onDragLeave={() => setDrag(false)}
        onDrop={kind !== 'captions' ? (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) importFiles(e.dataTransfer.files) } : undefined}
        style={{ position: 'relative', padding: 2, maxHeight: 380, overflowY: 'auto', outline: drag ? '1px dashed rgba(255,255,255,0.3)' : 'none', outlineOffset: -1, borderRadius: 8 }}>
        {drag && <div style={{ position: 'absolute', inset: 6, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(10,10,11,0.85)', border: '1px dashed rgba(255,255,255,0.2)', color: '#EDEDEF', fontSize: 13, fontWeight: 500, pointerEvents: 'none' }}>Dépose tes fichiers ici</div>}
        {uploading && <div style={{ marginBottom: 10, fontSize: 12, color: '#A1A1AA' }}>Import en cours : {uploading}</div>}
        {loading ? (
          kind === 'captions' ? <SkeletonRows rows={3} /> : (
            <div aria-busy="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
              {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} r={6} style={{ height: 'auto', aspectRatio: '9 / 16' }} />)}
            </div>
          )
        ) : kind === 'captions' ? (
          filteredCaps.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#71717A', fontSize: 12.5 }}>Aucune légende.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredCaps.map(c => {
                const on = sel.includes(c.id)
                return (
                  <button key={c.id} onClick={() => toggle(c.id)} style={{
                    display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: on ? 'rgba(255,255,255,0.05)' : '#161618', border: '1px solid ' + (on ? theme.selEdge : 'rgba(255,255,255,0.07)'),
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: on ? '#EDEDEF' : '#D4D4D8' }}>{c.title || 'Légende'}</span>
                    <span style={{ fontSize: 12, lineHeight: 1.55, color: '#8B8B94', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.content}</span>
                  </button>
                )
              })}
            </div>
          )
        ) : (
          filteredMedia.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#71717A', fontSize: 12.5, lineHeight: 1.6 }}>
            {folder === FAVS ? <>Aucun favori ici.<br />Clique l’étoile ☆ d’un média pour l’ajouter.</> : media.length === 0 ? <>{kind === 'images' ? 'Aucune image dans la banque.' : kind === 'audios' ? 'Aucun son dans la banque.' : 'Aucune vidéo dans la banque.'}<br />Glisse-dépose tes fichiers ici ou clique « Mon PC ».</> : <>Rien dans ce dossier.</>}
          </div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
              {renderedMedia.map((m, i) => (
                <MediaTile key={m.id} m={m} prev={thumbFor(m)} on={sel.includes(m.id)} fav={isFav(m)} hue={HUES[i % 6]}
                  accent={theme.accent} accentBtn={theme.accentBtn} onToggle={() => toggle(m.id)} onFav={() => void toggleFav(m)} />
              ))}
              {limit < filteredMedia.length && <div ref={moreRef} style={{ gridColumn: '1 / -1', height: 1 }} />}
            </div>
          )
        )}
      </div>
    </Modal>
  )
}
