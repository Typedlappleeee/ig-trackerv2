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
      const { data } = await scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false })
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
      <span style={{ flex: 1, fontSize: 11.5, color: n ? '#A1A1AA' : '#52525B' }}>
        {n ? `${n} ${word}${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}` : 'Coche ce que tu veux utiliser'}
      </span>
      <Btn theme={theme} tone="quiet" sm label="Annuler" onClick={onClose} />
      <Btn theme={theme} tone="primary" sm disabled={n === 0} icon="M20 6L9 17l-5-5" label={cta} onClick={apply} />
    </>
  )

  return (
    <Modal theme={theme} title={title ?? 'Choisir dans la banque'} icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z"
      onClose={onClose} footer={footer} width={620}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 15px 4px', alignItems: 'center' }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
          style={{ flex: 1, boxSizing: 'border-box', height: 34, padding: '0 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#D4D4D8', fontSize: 12.5, outline: 'none' }} />
        {kind !== 'captions' && <>
          <Btn theme={theme} sm tone="quiet" icon="M12 3v12|M7 10l5 5 5-5|M4 21h16" label={uploading ? 'Import…' : 'Mon PC'} disabled={!!uploading} onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" multiple accept={kind === 'images' ? 'image/*' : 'video/*'} style={{ display: 'none' }}
            onChange={e => { if (e.target.files) importFiles(e.target.files); e.target.value = '' }} />
        </>}
      </div>

      {kind !== 'captions' && (folders.length > 0 || multi) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '2px 15px 8px' }}>
          {folders.length > 0 && ['Tous', ...folders].map(f => {
            const on = folder === f
            return (
              <button key={f} onClick={() => setFolder(f)} style={{
                height: 26, padding: '0 10px', borderRadius: 99, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: on ? `rgba(${theme.tone},0.16)` : 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (on ? theme.selEdge : 'rgba(255,255,255,0.08)'), color: on ? theme.accentText : '#A1A1AA',
              }}>{f === 'Tous' ? 'Tous' : `📁 ${f}`}</button>
            )
          })}
          {multi && filteredMedia.length > 0 && (
            <button onClick={() => setSel(cur => [...new Set([...cur, ...filteredMedia.map(m => m.id)])])} style={{
              marginLeft: 'auto', height: 26, padding: '0 11px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              background: theme.accentBtn, border: 'none', color: '#fff',
            }}>{folder === 'Tous' ? `Tout ajouter (${filteredMedia.length})` : `Ajouter le dossier (${filteredMedia.length})`}</button>
          )}
        </div>
      )}

      <div
        onDragOver={kind !== 'captions' ? (e) => { e.preventDefault(); setDrag(true) } : undefined}
        onDragLeave={() => setDrag(false)}
        onDrop={kind !== 'captions' ? (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) importFiles(e.dataTransfer.files) } : undefined}
        style={{ position: 'relative', padding: 15, maxHeight: 380, overflowY: 'auto', outline: drag ? `2px dashed rgba(${theme.tone},0.6)` : 'none', outlineOffset: -6, borderRadius: 8 }}>
        {drag && <div style={{ position: 'absolute', inset: 6, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: `rgba(${theme.tone},0.12)`, color: theme.accentText, fontSize: 13, fontWeight: 700, pointerEvents: 'none' }}>Dépose tes fichiers ici</div>}
        {uploading && <div style={{ marginBottom: 10, fontSize: 11.5, color: theme.accentText }}>Import en cours : {uploading}</div>}
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
        ) : kind === 'captions' ? (
          filteredCaps.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucune légende.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {filteredCaps.map(c => {
                const on = sel.includes(c.id)
                return (
                  <button key={c.id} onClick={() => toggle(c.id)} style={{
                    display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: on ? `rgba(${theme.tone},0.09)` : 'rgba(255,255,255,0.015)', border: '1px solid ' + (on ? theme.selEdge : 'rgba(255,255,255,0.06)'),
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: on ? '#F4F4F6' : '#D4D4D8' }}>{c.title || 'Légende'}</span>
                    <span style={{ fontSize: 11.5, lineHeight: 1.55, color: '#71717A', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.content}</span>
                  </button>
                )
              })}
            </div>
          )
        ) : (
          filteredMedia.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#52525B', fontSize: 12, lineHeight: 1.6 }}>Aucun contenu dans la banque.<br />Glisse-dépose tes fichiers ici ou clique « Mon PC ».</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 9 }}>
              {filteredMedia.map((m, i) => {
                const on = sel.includes(m.id); const prev = thumbFor(m); const h = HUES[i % 6]; const img = isImg(m)
                return (
                  <button key={m.id} onClick={() => toggle(m.id)} title={m.title} style={{
                    position: 'relative', aspectRatio: '9 / 16', borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden',
                    border: '1.5px solid ' + (on ? theme.accent : 'rgba(255,255,255,0.07)'),
                    background: `linear-gradient(160deg, rgba(${h},0.16), rgba(${h},0.04))`,
                  }}>
                    {prev && (!img && !m.thumbnail_url && !m.thumbnail_path
                      ? <video src={prev + '#t=0.1'} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <img src={prev} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
                    <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 5, background: on ? theme.accentBtn : 'rgba(11,11,15,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                  </button>
                )
              })}
            </div>
          )
        )}
      </div>
    </Modal>
  )
}
