import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAllRows, addToBank } from '@/lib/bankStorage'
import { MediaThumb } from '@/components/MediaThumb'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { useBankThumbs } from '@/lib/data'
import { Modal, Btn, FIELD, Skeleton, SkeletonRows } from '@/lib/ui'

// Sélecteur « Banque » commun (fidèle à _openPicker du prototype ZIP) : une modale
// avec recherche + grille (vidéos/images) ou liste (légendes), sélection multi ou
// simple, et renvoi du résultat au parent. Réutilisé par Reels, Story, Cross, Studio.
export type PickerKind = 'videos' | 'images' | 'captions'
export type PickerResult =
  | { kind: 'videos' | 'images'; ids: string[] }
  | { kind: 'captions'; text: string; texts: string[] }

interface Media { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; notes: string | null; folder: string | null }
interface Cap { id: string; title: string | null; content: string }

const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
function extOf(m: Media): string { return (m.storage_path ?? m.file_url ?? '').toLowerCase().split('.').pop() ?? '' }
function isImg(m: Media): boolean { return IMG_EXT.includes(extOf(m)) }

// Tuile : components/MediaThumb (miniature, 1re image vidéo quand visible, sinon repli
// lisible — jamais de carré noir). Pas de création de miniature ici (seule la Banque en
// fait) : rien ne télécharge en arrière-plan pendant qu'on choisit / lit une vidéo.
function MediaTile({ m, thumb, media, on, accentBtn, onToggle }: {
  m: Media; thumb: string | null; media: string | null; on: boolean; accent: string; accentBtn: string; onToggle: () => void
}) {
  const img = isImg(m)
  return (
    <button onClick={onToggle} title={m.title} style={{
      position: 'relative', aspectRatio: '9 / 16', borderRadius: 10, padding: 0, cursor: 'pointer', overflow: 'hidden',
      border: 'none', boxShadow: on ? `0 0 0 2px ${accentBtn}` : '0 0 0 1px rgba(255,255,255,0.08)',
      background: '#161618',
    }}>
      <MediaThumb id={m.id} thumb={thumb} media={media} video={!img} small ext={extOf(m).toUpperCase().slice(0, 4)} />
      <span style={{ position: 'absolute', zIndex: 2, top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box', background: on ? accentBtn : 'rgba(10,10,11,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 600 }}>{on ? '✓' : ''}</span>
    </button>
  )
}


// Dernière liste chargée par espace + type : le sélecteur s'ouvre instantanément la fois
// suivante (rafraîchie en arrière-plan) au lieu de repasser par le chargement.
const listCache = new Map<string, { at: number; media: Media[] }>()
const PAGE = 120

export default function BankPicker({ theme, user, org, kind, multi = true, initialIds = [], title, onClose, onApply }: {
  theme: Theme; user: User; org: OrgState
  kind: PickerKind; multi?: boolean; initialIds?: string[]
  title?: string; onClose: () => void; onApply: (r: PickerResult) => void
}) {
  const { currentOrg } = org
  const [media, setMedia] = useState<Media[]>(() => listCache.get(`${org.currentOrg?.id ?? 'u:' + user.id}:${kind}`)?.media ?? [])
  const [caps, setCaps] = useState<Cap[]>([])
  const [sel, setSel] = useState<string[]>(initialIds)
  const [q, setQ] = useState('')
  const [folder, setFolder] = useState<string>('Tous')
  const cacheKey = `${currentOrg?.id ?? 'u:' + user.id}:${kind}`
  const [loading, setLoading] = useState(() => kind === 'captions' || !listCache.has(cacheKey))
  const [uploading, setUploading] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const IMG = IMG_EXT

  const load = useCallback(async () => {
    if (kind === 'captions' || !listCache.has(cacheKey)) setLoading(true)
    const scope = (x: any) => currentOrg ? x.eq('org_id', currentOrg.id) : x.eq('user_id', user.id).is('org_id', null)
    try {
      if (kind === 'captions') {
        const { data } = await scope(supabase.from('caption_bank').select('id,title,content')).order('created_at', { ascending: false })
        setCaps((data ?? []) as Cap[])
      } else {
        const { data } = await fetchAllRows<any>(() => scope(supabase.from('content_bank').select('*')).is('deleted_at', null).order('created_at', { ascending: false }).order('id'))
        const all = ((data ?? []) as Media[]).filter(m => !(SENTINELS.includes(m.notes ?? '') && !m.storage_path && !m.file_url))
        const typed = kind === 'images' ? all.filter(isImg) : all.filter(m => !isImg(m))
        const list = typed.length > 0 ? typed : all
        listCache.set(cacheKey, { at: Date.now(), media: list })
        setMedia(list)
      }
    } catch { /* réseau : on garde la liste affichée */ }
    finally { setLoading(false) }   // jamais bloqué sur le chargement
  }, [currentOrg?.id, user.id, kind, cacheKey])
  useEffect(() => { load() }, [load])

  const { imageFor, mediaFor } = useBankThumbs(media, { media: 'bare' })

  const folders = useMemo(() => {
    const s = new Set<string>(); media.forEach(m => { if (m.folder) s.add(m.folder) }); return [...s].sort((a, b) => a.localeCompare(b))
  }, [media])
  const filteredMedia = useMemo(() => {
    const s = q.trim().toLowerCase()
    return media
      .filter(m => folder === 'Tous' || m.folder === folder)
      .filter(m => !s || (m.title ?? '').toLowerCase().includes(s))
  }, [media, q, folder])
  // Rendu progressif : 120 vignettes, puis la suite en défilant (1 800 d'un coup figeaient la fenêtre).
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => { setLimit(PAGE) }, [q, folder])
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = moreRef.current; if (!el) return
    const io = new IntersectionObserver(es => { if (es[0]?.isIntersecting) setLimit(l => l + PAGE) }, { rootMargin: '400px' })
    io.observe(el); return () => io.disconnect()
  }, [limit, filteredMedia.length])
  const filteredCaps = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? caps.filter(c => (c.title ?? '').toLowerCase().includes(s) || c.content.toLowerCase().includes(s)) : caps
  }, [caps, q])

  const toggle = (id: string) => setSel(cur => multi
    ? (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
    : (cur[0] === id ? [] : [id]))

  // Import depuis le PC (multi-fichiers + glisser-déposer) → bucket content → banque.
  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => {
      const ext = (f.name.split('.').pop() ?? '').toLowerCase()
      if (kind === 'images') return IMG.includes(ext) || f.type.startsWith('image')
      if (kind === 'videos') return !IMG.includes(ext)
      return true
    })
    if (list.length === 0) return
    const newIds: string[] = []
    let done = 0
    for (const file of list) {
      setUploading(`${file.name} (${++done}/${list.length})`)
      try {
        const r = await addToBank({ userId: user.id, orgId: currentOrg?.id ?? null, file, name: file.name })
        const ins = { data: r.id ? { id: r.id } : null }
        if (ins.data?.id) newIds.push(ins.data.id as string)
      } catch { /* ignore */ }
    }
    setUploading(null)
    await load()
    // Auto-sélection des nouveaux imports.
    setSel(cur => multi ? [...cur, ...newIds] : (newIds[0] ? [newIds[0]] : cur))
  }

  const word = kind === 'captions' ? 'légende' : kind === 'images' ? 'image' : 'vidéo'
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
        {n ? `${n} ${word}${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}` : 'Coche ce que tu veux utiliser'}
      </span>
      <Btn theme={theme} tone="quiet" sm label="Annuler" onClick={onClose} />
      <Btn theme={theme} tone="primary" sm disabled={n === 0} icon="M20 6L9 17l-5-5" label={cta} onClick={apply} />
    </>
  )

  return (
    <Modal theme={theme} title={title ?? 'Choisir dans la banque'} icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z"
      onClose={onClose} footer={footer} width={620}>
      <div style={{ display: 'flex', gap: 8, padding: '0 0 10px', alignItems: 'center' }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
          style={{ ...FIELD, flex: 1, minWidth: 0 }} />
        {kind !== 'captions' && <>
          <Btn theme={theme} sm tone="ghost" icon="M12 3v12|M7 10l5 5 5-5|M4 21h16" label={uploading ? 'Import…' : 'Mon PC'} disabled={!!uploading} onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" multiple accept={kind === 'images' ? 'image/*' : 'video/*'} style={{ display: 'none' }}
            onChange={e => { if (e.target.files) importFiles(e.target.files); e.target.value = '' }} />
        </>}
      </div>

      {kind !== 'captions' && (folders.length > 0 || multi) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '0 0 10px' }}>
          {folders.length > 0 && ['Tous', ...folders].map(f => {
            const on = folder === f
            return (
              <button key={f} onClick={() => setFolder(f)} style={{
                height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: on ? 'rgba(255,255,255,0.08)' : '#161618',
                border: '1px solid ' + (on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.09)'), color: on ? '#EDEDEF' : '#A1A1AA',
              }}>{f === 'Tous' ? 'Tous' : `📁 ${f}`}</button>
            )
          })}
          {multi && filteredMedia.length > 0 && (
            <button onClick={() => setSel(cur => [...new Set([...cur, ...filteredMedia.map(m => m.id)])])} style={{
              marginLeft: 'auto', height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: '#EDEDEF', border: '1px solid #EDEDEF', color: '#0A0A0B',
            }}>{folder === 'Tous' ? `Tout ajouter (${filteredMedia.length})` : `Ajouter le dossier (${filteredMedia.length})`}</button>
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
          filteredMedia.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#71717A', fontSize: 12.5, lineHeight: 1.6 }}>Aucun contenu dans la banque.<br />Glisse-dépose tes fichiers ici ou clique « Mon PC ».</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
              {filteredMedia.slice(0, limit).map(m => (
                <MediaTile key={m.id} m={m} thumb={imageFor(m)} media={mediaFor(m)} on={sel.includes(m.id)}
                  accent={theme.accent} accentBtn={theme.accentBtn} onToggle={() => toggle(m.id)} />
              ))}
              {limit < filteredMedia.length && <div ref={moreRef} style={{ gridColumn: '1 / -1', height: 1 }} />}
            </div>
          )
        )}
      </div>
    </Modal>
  )
}
