import { useCallback, useEffect, useMemo, useState } from 'react'
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

interface Media { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; notes: string | null }
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
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (x: any) => currentOrg ? x.eq('org_id', currentOrg.id) : x.eq('user_id', user.id).is('org_id', null)
    if (kind === 'captions') {
      const { data } = await scope(supabase.from('caption_bank').select('id,title,content')).order('created_at', { ascending: false })
      setCaps((data ?? []) as Cap[])
    } else {
      const { data } = await scope(supabase.from('content_bank').select('id,title,storage_path,file_url,thumbnail_url,thumbnail_path,notes')).order('created_at', { ascending: false })
      const all = ((data ?? []) as Media[]).filter(m => !(SENTINELS.includes(m.notes ?? '') && !m.storage_path && !m.file_url))
      const typed = kind === 'images' ? all.filter(isImg) : all.filter(m => !isImg(m))
      setMedia(typed.length > 0 ? typed : all)
    }
    setLoading(false)
  }, [currentOrg?.id, user.id, kind])
  useEffect(() => { load() }, [load])

  const { thumbFor } = useBankThumbs(media)

  const filteredMedia = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? media.filter(m => (m.title ?? '').toLowerCase().includes(s)) : media
  }, [media, q])
  const filteredCaps = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? caps.filter(c => (c.title ?? '').toLowerCase().includes(s) || c.content.toLowerCase().includes(s)) : caps
  }, [caps, q])

  const toggle = (id: string) => setSel(cur => multi
    ? (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
    : (cur[0] === id ? [] : [id]))

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
      <div style={{ padding: '12px 15px 4px' }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
          style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#D4D4D8', fontSize: 12.5, outline: 'none' }} />
      </div>
      <div style={{ padding: 15, maxHeight: 380, overflowY: 'auto' }}>
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
          filteredMedia.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun contenu dans la banque.</div> : (
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
