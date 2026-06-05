import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { getSignedUrl } from '@/lib/storage'
import { Spinner } from '@/components/ui/Spinner'
import type { CaptionItem } from './CaptionBank'

interface MixerProps { user: User }
type MixPosition = 'bottom' | 'center' | 'top'

interface MixJob {
  id:        string
  videoItem: ContentItem
  caption:   CaptionItem
  status:    'pending' | 'processing' | 'done' | 'error'
  outputUrl?: string
  error?:    string
}

// ── Video thumbnail (lazy signed URL) ────────────────────────────────────────
function VideoThumb({ item, size = 'sm' }: { item: ContentItem; size?: 'sm' | 'md' }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    getSignedUrl(item.thumbnail_path ?? item.storage_path).then(setUrl)
  }, [item.thumbnail_path, item.storage_path])
  const h = size === 'md' ? 100 : 72
  return (
    <div style={{ width: '100%', height: h, background: '#0E0E16', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
      {url
        ? <img src={url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 18 }}>🎬</div>
      }
    </div>
  )
}

// ── Picker sidebar ────────────────────────────────────────────────────────────
function PickerSidebar({
  folders, active, onSelect, allCount, allLabel,
}: {
  folders: string[]; active: string | null
  onSelect: (f: string | null) => void
  allCount: number; allLabel: string
}) {
  const btnBase: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', textAlign: 'left', fontSize: 12,
    background: 'transparent', border: 'none', cursor: 'pointer',
    overflow: 'hidden',
  }
  const active0 = active === null
  return (
    <div style={{ width: 160, flexShrink: 0, borderRight: '1px solid rgba(139,92,246,0.08)', overflowY: 'auto', padding: '4px 0' }}>
      <button
        onClick={() => onSelect(null)}
        style={{ ...btnBase, background: active0 ? 'rgba(139,92,246,0.12)' : 'transparent', borderLeft: `2px solid ${active0 ? '#8B5CF6' : 'transparent'}`, color: active0 ? '#c4b5fd' : '#52525b', paddingLeft: active0 ? 10 : 12 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span style={{ flex: 1 }}>{allLabel}</span>
        <span style={{ fontSize: 10, opacity: 0.55 }}>{allCount}</span>
      </button>
      {folders.map(f => {
        const isA = active === f
        return (
          <button
            key={f}
            onClick={() => onSelect(f)}
            style={{ ...btnBase, background: isA ? 'rgba(139,92,246,0.12)' : 'transparent', borderLeft: `2px solid ${isA ? '#8B5CF6' : 'transparent'}`, color: isA ? '#c4b5fd' : '#52525b', paddingLeft: isA ? 10 : 12 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Video picker modal ────────────────────────────────────────────────────────
function VideoPicker({
  user, onSelect, onClose,
}: {
  user: User
  onSelect: (items: ContentItem[]) => void
  onClose: () => void
}) {
  const { currentOrg } = useOrg()
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      const rows = (data ?? []) as ContentItem[]
      setItems(rows.filter(i => i.storage_path?.match(/\.(mp4|mov)$/i) || i.file_url?.match(/\.(mp4|mov)$/i)))
      setLoading(false)
    })
  }, [currentOrg?.id, user.id])

  const folders = [...new Set(items.map(i => i.folder).filter((f): f is string => Boolean(f)))].sort()
  const visible = items.filter(i => {
    if (folder !== null && i.folder !== folder) return false
    if (!search) return true
    return i.title.toLowerCase().includes(search.toLowerCase())
  })

  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const confirm = () => onSelect(items.filter(i => selected.has(i.id)))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 20, width: 900, maxWidth: '95vw', height: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px -12px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff', flex: 1 }}>Banque vidéo</h2>
          <input
            type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 160, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '6px 12px', fontSize: 12, color: '#e2e8f0', outline: 'none' }}
          />
          {selected.size > 0 && (
            <button onClick={confirm} style={{ padding: '7px 18px', borderRadius: 10, background: 'linear-gradient(130deg,#7C3AED,#A855F7)', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 14px -4px rgba(124,58,237,0.5)' }}>
              Confirmer ({selected.size})
            </button>
          )}
          <button onClick={onClose} style={{ color: '#52525b', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <PickerSidebar folders={folders} active={folder} onSelect={setFolder} allCount={items.length} allLabel="Tout" />
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}><Spinner size="lg" /></div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 64, color: '#52525b', fontSize: 13 }}>Aucune vidéo</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                {visible.map(item => {
                  const sel = selected.has(item.id)
                  return (
                    <div key={item.id} onClick={() => toggle(item.id)}
                      style={{ cursor: 'pointer', borderRadius: 10, overflow: 'hidden', border: `2px solid ${sel ? '#8B5CF6' : 'rgba(139,92,246,0.08)'}`, background: '#07070B', transition: 'border-color 0.12s', position: 'relative' }}>
                      <VideoThumb item={item} size="md" />
                      <p style={{ fontSize: 10, color: '#94a3b8', padding: '5px 6px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                      {sel && (
                        <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 6, background: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Caption picker modal ──────────────────────────────────────────────────────
function CaptionPicker({
  user, onSelect, onClose,
}: {
  user: User
  onSelect: (items: CaptionItem[]) => void
  onClose: () => void
}) {
  const { currentOrg } = useOrg()
  const [items, setItems] = useState<CaptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let q = supabase.from('caption_bank').select('*').order('created_at', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [currentOrg?.id, user.id])

  const folders = [...new Set(items.map(i => i.folder).filter((f): f is string => Boolean(f)))].sort()
  const visible = items.filter(i => {
    if (folder !== null && i.folder !== folder) return false
    if (!search) return true
    const q = search.toLowerCase()
    return i.title?.toLowerCase().includes(q) || i.content.toLowerCase().includes(q)
  })

  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const confirm = () => onSelect(items.filter(i => selected.has(i.id)))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 20, width: 720, maxWidth: '95vw', height: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px -12px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff', flex: 1 }}>Banque de captions</h2>
          <input
            type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 160, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '6px 12px', fontSize: 12, color: '#e2e8f0', outline: 'none' }}
          />
          {selected.size > 0 && (
            <button onClick={confirm} style={{ padding: '7px 18px', borderRadius: 10, background: 'linear-gradient(130deg,#7C3AED,#A855F7)', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 14px -4px rgba(124,58,237,0.5)' }}>
              Confirmer ({selected.size})
            </button>
          )}
          <button onClick={onClose} style={{ color: '#52525b', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <PickerSidebar folders={folders} active={folder} onSelect={setFolder} allCount={items.length} allLabel="Tout" />
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}><Spinner size="lg" /></div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 64, color: '#52525b', fontSize: 13 }}>Aucune caption</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visible.map(item => {
                  const sel = selected.has(item.id)
                  return (
                    <div key={item.id} onClick={() => toggle(item.id)}
                      style={{ padding: '12px 14px', borderRadius: 12, background: sel ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.025)', border: `1px solid ${sel ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`, cursor: 'pointer', transition: 'all 0.12s', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${sel ? '#8B5CF6' : 'rgba(255,255,255,0.15)'}`, background: sel ? '#8B5CF6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {item.title && <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>}
                        <p className="line-clamp-3" style={{ fontSize: 11, color: '#52525b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{item.content}</p>
                        {item.folder && (
                          <span style={{ fontSize: 10, marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 20, background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>{item.folder}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function Mixer({ user }: MixerProps) {
  const { currentOrg } = useOrg()

  const [selVideos,   setSelVideos]   = useState<ContentItem[]>([])
  const [selCaptions, setSelCaptions] = useState<CaptionItem[]>([])

  const [showVideoPicker,   setShowVideoPicker]   = useState(false)
  const [showCaptionPicker, setShowCaptionPicker] = useState(false)

  const [position,  setPosition]  = useState<MixPosition>('bottom')
  const [fontSize,  setFontSize]  = useState(36)
  const [fontColor, setFontColor] = useState('#ffffff')
  const [mode,      setMode]      = useState<'random' | 'all'>('random')

  const [jobs,    setJobs]    = useState<MixJob[]>([])
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState('')

  const removeVideo   = (id: string) => setSelVideos(p => p.filter(v => v.id !== id))
  const removeCaption = (id: string) => setSelCaptions(p => p.filter(c => c.id !== id))

  const addVideos   = (items: ContentItem[]) => {
    setSelVideos(p => { const ids = new Set(p.map(v => v.id)); return [...p, ...items.filter(i => !ids.has(i.id))] })
    setShowVideoPicker(false)
  }
  const addCaptions = (items: CaptionItem[]) => {
    setSelCaptions(p => { const ids = new Set(p.map(c => c.id)); return [...p, ...items.filter(i => !ids.has(i.id))] })
    setShowCaptionPicker(false)
  }

  const canStart = selVideos.length > 0 && selCaptions.length > 0 && !running

  const updateJob = (id: string, patch: Partial<MixJob>) =>
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))

  const buildJobs = (): MixJob[] => {
    if (mode === 'all') {
      return selVideos.flatMap(v => selCaptions.map(c => ({ id: `${v.id}-${c.id}`, videoItem: v, caption: c, status: 'pending' as const })))
    }
    return selVideos.map((v, i) => ({
      id: `${v.id}-${selCaptions[i % selCaptions.length].id}-${i}`,
      videoItem: v,
      caption: selCaptions[i % selCaptions.length],
      status: 'pending' as const,
    }))
  }

  const startMix = async () => {
    setError('')
    const newJobs = buildJobs()
    setJobs(newJobs)
    setRunning(true)

    const CONCURRENCY = 3
    const processJob = async (job: MixJob) => {
      updateJob(job.id, { status: 'processing' })
      try {
        const signedUrl = await getSignedUrl(job.videoItem.storage_path)
        if (!signedUrl) throw new Error('Could not get video URL')
        const resp = await fetch('/api/mix-overlay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: signedUrl, caption: job.caption.content, userId: user.id, position, fontSize, fontColor }),
        })
        const data = await resp.json()
        if (!data.ok) throw new Error(data.error ?? 'Server error')
        updateJob(job.id, { status: 'done', outputUrl: data.url })
        supabase.from('caption_bank').update({ used_count: (job.caption.used_count ?? 0) + 1 }).eq('id', job.caption.id).then(() => {})
      } catch (e: unknown) {
        updateJob(job.id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }

    for (let i = 0; i < newJobs.length; i += CONCURRENCY) {
      await Promise.all(newJobs.slice(i, i + CONCURRENCY).map(processJob))
    }
    setRunning(false)
  }

  const doneJobs  = jobs.filter(j => j.status === 'done')
  const errorJobs = jobs.filter(j => j.status === 'error')

  const cardStyle: React.CSSProperties = {
    flexShrink: 0, padding: '18px 16px 14px',
    borderBottom: '1px solid rgba(139,92,246,0.08)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#07070B' }}>

      {/* ── Header ── */}
      <header style={{ flexShrink: 0, padding: '20px 28px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid rgba(139,92,246,0.08)', background: 'rgba(7,7,11,0.96)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.12))', border: '1px solid rgba(139,92,246,0.25)', boxShadow: '0 0 20px -6px rgba(139,92,246,0.5)', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1, background: 'linear-gradient(135deg,#FFFFFF 0%,rgba(196,181,253,0.85) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Mélangeur
              </h1>
              {running ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
                  <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', display: 'inline-block' }} />
                  En cours
                </span>
              ) : (
                <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#52525b' }}>Prêt</span>
              )}
            </div>
            <p style={{ fontSize: 11, marginTop: 4, color: 'rgba(148,163,184,0.45)' }}>
              {selVideos.length} vidéo{selVideos.length !== 1 ? 's' : ''} · {selCaptions.length} caption{selCaptions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', borderRadius: 12, padding: 4, gap: 2, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {([{ k: 'random' as const, label: 'Aléatoire' }, { k: 'all' as const, label: 'Tout combiner' }] as const).map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s', border: 'none', ...(mode === m.k ? { background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', outline: '1px solid rgba(139,92,246,0.28)' } : { background: 'transparent', color: 'rgba(82,82,91,0.9)' }) }}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Launch */}
          <button onClick={startMix} disabled={!canStart}
            style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, padding: '9px 22px', fontSize: 13, fontWeight: 900, color: '#fff', border: 'none', cursor: canStart ? 'pointer' : 'not-allowed', opacity: canStart ? 1 : 0.35, transition: 'all 0.15s', ...(canStart ? { background: 'linear-gradient(130deg,#6D28D9,#7C3AED,#A855F7)', boxShadow: '0 4px 24px -4px rgba(124,58,237,0.6)' } : { background: 'rgba(255,255,255,0.06)' }) }}>
            {running ? (
              <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/></svg>En cours…</>
            ) : (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>Lancer</>
            )}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

        {/* Col 1 — Videos */}
        <aside style={{ width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(139,92,246,0.08)', background: 'linear-gradient(180deg,#09090F 0%,#07070B 100%)' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Vidéos</span>
            </div>
            {selVideos.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: '#fff', background: 'linear-gradient(130deg,#7C3AED,#A855F7)', boxShadow: '0 2px 10px -2px rgba(124,58,237,0.5)' }}>{selVideos.length}</span>
            )}
          </div>
          <div style={{ flexShrink: 0, padding: '10px 14px' }}>
            <button onClick={() => setShowVideoPicker(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(130deg,#7C3AED,#A855F7)', border: 'none', cursor: 'pointer', boxShadow: '0 3px 14px -4px rgba(124,58,237,0.5)' }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="0.5" y="0.5" width="4" height="4" rx="1" fill="white" opacity=".8"/><rect x="6.5" y="0.5" width="4" height="4" rx="1" fill="white" opacity=".6"/><rect x="0.5" y="6.5" width="4" height="4" rx="1" fill="white" opacity=".6"/><rect x="6.5" y="6.5" width="4" height="4" rx="1" fill="white" opacity=".4"/></svg>
              Depuis la Banque
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
            {selVideos.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 150, gap: 10, borderRadius: 14, background: 'rgba(139,92,246,0.04)', border: '1px dashed rgba(139,92,246,0.14)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
                </div>
                <span style={{ fontSize: 11, color: '#52525b', textAlign: 'center', lineHeight: 1.6 }}>Aucune vidéo<br/>Ajoute depuis la banque</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {selVideos.map(v => (
                  <div key={v.id} style={{ position: 'relative' }}>
                    <VideoThumb item={v} />
                    <p style={{ fontSize: 9, color: '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '3px 2px', textAlign: 'center' }}>{v.title}</p>
                    <button onClick={() => removeVideo(v.id)}
                      style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 5, background: 'rgba(0,0,0,0.75)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Col 2 — Captions */}
        <aside style={{ width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(139,92,246,0.08)', background: 'linear-gradient(180deg,#09090F 0%,#07070B 100%)' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Captions</span>
            </div>
            {selCaptions.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: '#fff', background: 'linear-gradient(130deg,#7C3AED,#A855F7)', boxShadow: '0 2px 10px -2px rgba(124,58,237,0.5)' }}>{selCaptions.length}</span>
            )}
          </div>
          <div style={{ flexShrink: 0, padding: '10px 14px' }}>
            <button onClick={() => setShowCaptionPicker(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(130deg,#7C3AED,#A855F7)', border: 'none', cursor: 'pointer', boxShadow: '0 3px 14px -4px rgba(124,58,237,0.5)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Depuis la Banque
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
            {selCaptions.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 150, gap: 10, borderRadius: 14, background: 'rgba(139,92,246,0.04)', border: '1px dashed rgba(139,92,246,0.14)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <span style={{ fontSize: 11, color: '#52525b', textAlign: 'center', lineHeight: 1.6 }}>Aucune caption<br/>Ajoute depuis la banque</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selCaptions.map(c => (
                  <div key={c.id} style={{ position: 'relative', padding: '10px 12px', borderRadius: 12, background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
                    {c.title && <p style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 20 }}>{c.title}</p>}
                    <p className="line-clamp-2" style={{ fontSize: 10, color: '#52525b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                    <button onClick={() => removeCaption(c.id)}
                      style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: 4, background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Col 3 — Config */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', gap: 24, overflowY: 'auto', background: '#07070B' }}>

          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Position du texte</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['top', 'center', 'bottom'] as MixPosition[]).map(p => (
                <button key={p} onClick={() => setPosition(p)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s', border: position === p ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(255,255,255,0.06)', background: position === p ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)', color: position === p ? '#c4b5fd' : '#52525b' }}>
                  {p === 'top' ? '⬆ Haut' : p === 'center' ? '◉ Centre' : '⬇ Bas'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Taille police — {fontSize}px</p>
            <input type="range" min={18} max={72} step={2} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#8B5CF6' }} />
          </div>

          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Couleur du texte</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer' }} />
              {['#ffffff', '#000000', '#ffff00', '#ff4444', '#44aaff'].map(c => (
                <button key={c} onClick={() => setFontColor(c)}
                  style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: `2px solid ${fontColor === c ? '#8B5CF6' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', transform: fontColor === c ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.1s' }} />
              ))}
            </div>
          </div>

          {canStart && (
            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 12, color: '#a78bfa', lineHeight: 1.5 }}>
              {mode === 'random'
                ? `${selVideos.length} vidéo${selVideos.length > 1 ? 's' : ''} × 1 caption = ${selVideos.length} résultat${selVideos.length > 1 ? 's' : ''}`
                : `${selVideos.length} × ${selCaptions.length} = ${selVideos.length * selCaptions.length} résultat${selVideos.length * selCaptions.length > 1 ? 's' : ''}`
              }
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#f87171' }}>{error}</div>
          )}
        </div>
      </div>

      {/* ── Results strip ── */}
      {jobs.length > 0 && (
        <div style={{ flexShrink: 0, height: 228, borderTop: '1px solid rgba(139,92,246,0.08)', padding: '14px 20px', overflowX: 'auto', background: '#09090F' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexShrink: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>Résultats</p>
            {running && <Spinner size="sm" />}
            {!running && doneJobs.length > 0 && <span style={{ fontSize: 11, color: '#22c55e' }}>{doneJobs.length}/{jobs.length} terminés</span>}
            {errorJobs.length > 0 && <span style={{ fontSize: 11, color: '#ef4444' }}>{errorJobs.length} erreur{errorJobs.length > 1 ? 's' : ''}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, height: 165 }}>
            {jobs.map(job => (
              <div key={job.id} style={{ flexShrink: 0, width: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ position: 'relative', width: 90, height: 130, background: '#0E0E16', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(139,92,246,0.1)' }}>
                  {job.status === 'done' && job.outputUrl ? (
                    <video src={job.outputUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted
                      onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                      onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }} />
                  ) : job.status === 'error' ? (
                    <span style={{ color: '#ef4444', fontSize: 10, textAlign: 'center', padding: 6 }}>Erreur</span>
                  ) : (
                    <Spinner size="sm" />
                  )}
                  {job.status === 'done' && job.outputUrl && (
                    <a href={job.outputUrl} download onClick={e => e.stopPropagation()}
                      style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                  )}
                </div>
                <p style={{ fontSize: 9, color: '#52525b', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{job.videoItem.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showVideoPicker && (
        <VideoPicker user={user} onSelect={addVideos} onClose={() => setShowVideoPicker(false)} />
      )}
      {showCaptionPicker && (
        <CaptionPicker user={user} onSelect={addCaptions} onClose={() => setShowCaptionPicker(false)} />
      )}
    </div>
  )
}
