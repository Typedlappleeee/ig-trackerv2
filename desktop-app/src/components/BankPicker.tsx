import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { useBankThumbs } from '@/lib/data'
import { Modal, Btn } from '@/lib/ui'

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
const HUES = ['139,92,246', '6,182,212', '236,72,153', '16,185,129', '245,158,11', '99,102,241']

// Tuile LAZY : ne monte l'aperçu (vidéo/image) que quand elle est visible à l'écran
// (IntersectionObserver) et le décharge hors écran. Évite de monter 600 <video> d'un
// coup → la banque ne rame/bug plus.
function MediaTile({ m, prev, on, hue, accent, accentBtn, onToggle }: {
  m: Media; prev: string | null; on: boolean; hue: string; accent: string; accentBtn: string; onToggle: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(es => setVis(es[0]?.isIntersecting ?? false), { rootMargin: '300px' })
    io.observe(el); return () => io.disconnect()
  }, [])
  const isVid = !isImg(m) && !m.thumbnail_url && !m.thumbnail_path
  return (
    <button ref={ref} onClick={onToggle} title={m.title} style={{
      position: 'relative', aspectRatio: '9 / 16', borderRadius: 6, padding: 0, cursor: 'pointer', overflow: 'hidden',
      border: '1px solid ' + (on ? accent : 'rgba(255,255,255,0.08)'),
      background: '#161618',
    }}>
      {vis && prev && (isVid
        ? <video src={prev + '#t=0.1'} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <img src={prev} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
      <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box', background: on ? accentBtn : 'rgba(10,10,11,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 600 }}>{on ? '✓' : ''}</span>
    </button>
  )
}


export default function BankPicker({ theme, user, org, kind, multi = true, initialIds = [], title, onClose, onApply }: {
  theme: Theme; user: User; org: OrgState
  kind: PickerKind; multi?: boolean; initialIds?: string[]
  title?: string; onClose: () => void; onApply: (r: PickerResult) => void
}) {
  const { currentOrg } = org
  const [media, setMedia] = useState<Media[]>([])
  const [caps, setCaps] = useState<Cap[]>([])
  const [sel, setSel] = useState<string[]>(initialIds)
  const [q, setQ] = useState('')
  const [folder, setFolder] = useState<string>('Tous')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const IMG = IMG_EXT

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (x: any) => currentOrg ? x.eq('org_id', currentOrg.id) : x.eq('user_id', user.id).is('org_id', null)
    if (kind === 'captions') {
      const { data } = await scope(supabase.from('caption_bank').select('id,title,content')).order('created_at', { ascending: false })
      setCaps((data ?? []) as Cap[])
    } else {
      const { data } = await scope(supabase.from('content_bank').select('*')).is('deleted_at', null).order('created_at', { ascending: false })
      const all = ((data ?? []) as Media[]).filter(m => !(SENTINELS.includes(m.notes ?? '') && !m.storage_path && !m.file_url))
      const typed = kind === 'images' ? all.filter(isImg) : all.filter(m => !isImg(m))
      setMedia(typed.length > 0 ? typed : all)
    }
    setLoading(false)
  }, [currentOrg?.id, user.id, kind])
  useEffect(() => { load() }, [load])

  const { thumbFor } = useBankThumbs(media)

  const folders = useMemo(() => {
    const s = new Set<string>(); media.forEach(m => { if (m.folder) s.add(m.folder) }); return [...s].sort((a, b) => a.localeCompare(b))
  }, [media])
  const filteredMedia = useMemo(() => {
    const s = q.trim().toLowerCase()
    return media
      .filter(m => folder === 'Tous' || m.folder === folder)
      .filter(m => !s || (m.title ?? '').toLowerCase().includes(s))
  }, [media, q, folder])
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
    const scopeFolder = currentOrg ? `orgs/${currentOrg.id}` : `users/${user.id}`
    const newIds: string[] = []
    let done = 0
    for (const file of list) {
      setUploading(`${file.name} (${++done}/${list.length})`)
      try {
        let ext = (file.name.split('.').pop() ?? '').toLowerCase()
        if (!ext) ext = file.type.startsWith('image') ? 'jpg' : 'mp4'
        const id = crypto.randomUUID()
        const storagePath = `videos/${scopeFolder}/${id}.${ext}`
        const up = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
        if (up.error) continue
        const ins = await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          title: file.name.replace(/\.[a-z0-9]+$/i, ''), storage_path: storagePath,
          file_url: null, folder: null, duration: null, tags: [], notes: null, used_count: 0,
        }).select('id').single()
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
          style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', height: 32, padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 13, outline: 'none' }} />
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
          <div style={{ padding: 32, textAlign: 'center', color: '#71717A', fontSize: 12.5 }}>Chargement…</div>
        ) : kind === 'captions' ? (
          filteredCaps.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#71717A', fontSize: 12.5 }}>Aucune légende.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredCaps.map(c => {
                const on = sel.includes(c.id)
                return (
                  <button key={c.id} onClick={() => toggle(c.id)} style={{
                    display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: on ? 'rgba(255,255,255,0.05)' : '#141416', border: '1px solid ' + (on ? theme.selEdge : 'rgba(255,255,255,0.07)'),
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
              {filteredMedia.map((m, i) => (
                <MediaTile key={m.id} m={m} prev={thumbFor(m)} on={sel.includes(m.id)} hue={HUES[i % 6]}
                  accent={theme.accent} accentBtn={theme.accentBtn} onToggle={() => toggle(m.id)} />
              ))}
            </div>
          )
        )}
      </div>
    </Modal>
  )
}
