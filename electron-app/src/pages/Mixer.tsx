import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { getSignedUrl } from '@/lib/storage'
import { Spinner } from '@/components/ui/Spinner'
import type { CaptionItem } from './CaptionBank'

interface MixerProps { user: User }
type MixPosition = 'bottom' | 'middle' | 'top'

// ── Inline Lucide-style icons (no emoji UI icons) ─────────────────────────────
function SfIcon({ size = 16, children, ...rest }: { size?: number; children: React.ReactNode } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}
const IconX            = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></SfIcon>
const IconClapperboard = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></SfIcon>
const IconChevronUp    = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polyline points="18 15 12 9 6 15"/></SfIcon>
const IconChevronDown  = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><polyline points="6 9 12 15 18 9"/></SfIcon>
const IconAlignCenter  = (p: { size?: number } & React.SVGProps<SVGSVGElement>) => <SfIcon {...p}><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="19" y1="18" x2="5" y2="18"/></SfIcon>

interface MixJob {
  id:        string
  videoItem: ContentItem
  caption:   CaptionItem
  status:    'pending' | 'processing' | 'done' | 'error'
  outputUrl?:  string
  localPath?:  string
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
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(148,163,184,0.35)' }}><IconClapperboard size={18} /></div>
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
    <div style={{ width: 160, flexShrink: 0, borderRight: '1px solid rgba(99,102,241,0.08)', overflowY: 'auto', padding: '4px 0' }}>
      <button
        onClick={() => onSelect(null)}
        style={{ ...btnBase, background: active0 ? 'rgba(99,102,241,0.12)' : 'transparent', borderLeft: `2px solid ${active0 ? '#6366F1' : 'transparent'}`, color: active0 ? '#818CF8' : '#52525b', paddingLeft: active0 ? 10 : 12 }}
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
            style={{ ...btnBase, background: isA ? 'rgba(99,102,241,0.12)' : 'transparent', borderLeft: `2px solid ${isA ? '#6366F1' : 'transparent'}`, color: isA ? '#818CF8' : '#52525b', paddingLeft: isA ? 10 : 12 }}
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
    <div tabIndex={-1} ref={el => el?.focus()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', outline: 'none' }} onClick={onClose}>
      <div style={{ background: '#0E0E16', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, width: 900, maxWidth: '95vw', height: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px -12px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff', flex: 1 }}>Banque vidéo</h2>
          <input
            type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            className="sf-input" style={{ width: 160 }}
          />
          {selected.size > 0 && (
            <button onClick={confirm} className="sf-btn sf-btn-primary" style={{ cursor: 'pointer' }}>
              Confirmer ({selected.size})
            </button>
          )}
          <button onClick={onClose} aria-label="Fermer" className="sf-btn sf-btn-ghost sf-btn-icon" style={{ cursor: 'pointer' }}><IconX size={18} /></button>
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
                      className="sf-hover-lift"
                      style={{ cursor: 'pointer', borderRadius: 10, overflow: 'hidden', border: `2px solid ${sel ? '#6366F1' : 'rgba(99,102,241,0.08)'}`, background: '#07070B', transition: 'border-color 0.12s, transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease', position: 'relative' }}>
                      <VideoThumb item={item} size="md" />
                      <p style={{ fontSize: 10, color: '#94a3b8', padding: '5px 6px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                      {sel && (
                        <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 6, background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    <div tabIndex={-1} ref={el => el?.focus()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', outline: 'none' }} onClick={onClose}>
      <div style={{ background: '#0E0E16', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, width: 720, maxWidth: '95vw', height: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px -12px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff', flex: 1 }}>Banque de captions</h2>
          <input
            type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            className="sf-input" style={{ width: 160 }}
          />
          {selected.size > 0 && (
            <button onClick={confirm} className="sf-btn sf-btn-primary" style={{ cursor: 'pointer' }}>
              Confirmer ({selected.size})
            </button>
          )}
          <button onClick={onClose} aria-label="Fermer" className="sf-btn sf-btn-ghost sf-btn-icon" style={{ cursor: 'pointer' }}><IconX size={18} /></button>
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
                      className="sf-hover-lift"
                      style={{ padding: '12px 14px', borderRadius: 12, background: sel ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.025)', border: `1px solid ${sel ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`, cursor: 'pointer', transition: 'all 0.12s', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${sel ? '#6366F1' : 'rgba(255,255,255,0.15)'}`, background: sel ? '#6366F1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {item.title && <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>}
                        <p className="line-clamp-3" style={{ fontSize: 11, color: '#52525b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{item.content}</p>
                        {item.folder && (
                          <span className="sf-badge sf-badge-accent" style={{ marginTop: 6, display: 'inline-flex' }}>{item.folder}</span>
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
  const [fontSize,  setFontSize]  = useState(52)
  const [fontColor, setFontColor] = useState('#ffffff')
  const [mode,      setMode]      = useState<'random' | 'all'>('random')

  const [jobs,    setJobs]    = useState<MixJob[]>([])
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState('')
  const [devNoticeOpen, setDevNoticeOpen] = useState(true)

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
        // Resolve video URL — prefer storage_path (fresh signed URL), fall back to file_url
        const signedUrl = job.videoItem.storage_path
          ? await getSignedUrl(job.videoItem.storage_path)
          : job.videoItem.file_url ?? null
        if (!signedUrl) throw new Error('URL vidéo introuvable (storage_path et file_url sont vides)')

        const api = window.electronAPI
        if (!api?.runFfmpegMixOverlay) throw new Error('IPC runFfmpegMixOverlay manquant — rebuild l\'app Electron')

        const res = await api.runFfmpegMixOverlay({
          sourcePath: signedUrl,
          caption:    job.caption.content,
          position,
          fontSize,
          fontColor,
        })
        if (!res.ok || !res.outputPath) throw new Error(res.error ?? 'Échec ffmpeg')

        // Make the output URL playable in the renderer via localvideo://
        const localUrl = (() => {
          let n = res.outputPath.replace(/\\/g, '/')
          if (!n.startsWith('/')) n = '/' + n
          return 'localvideo://' + n.split('/').map(encodeURIComponent).join('/')
        })()

        updateJob(job.id, { status: 'done', outputUrl: localUrl, localPath: res.outputPath })
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

  return (
    <div className="anim-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--base)' }}>

      {/* ── Avertissement : en développement ── */}
      {devNoticeOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(14,14,22,0.85)', backdropFilter: 'blur(6px)' }}>
          <div className="sf-card sf-anim-slide-up" style={{ maxWidth: 440, padding: '40px 48px', textAlign: 'center', borderColor: 'rgba(245,158,11,0.22)', background: 'rgba(245,158,11,0.03)' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#F59E0B' }}>
              <IconClapperboard size={26} />
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ivory)', marginBottom: 10 }}>En développement</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>Cette fonctionnalité est encore en développement — il peut y avoir des bugs.</p>
            <button onClick={() => setDevNoticeOpen(false)} className="sf-btn sf-btn-primary cursor-pointer" style={{ marginTop: 24 }}>
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* ── Premium Header ── */}
      <header className="sf-page-header" style={{ background: 'rgba(7,7,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="sf-anim-slide-up sf-d50" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Icon badge */}
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(99,102,241,0.12))',
            border: '1px solid rgba(99,102,241,0.3)',
            boxShadow: '0 0 24px -6px rgba(99,102,241,0.5)',
          }}>
            {/* Edit + merge icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="sf-page-title" style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, rgba(233,234,240,0.9) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                fontSize: 22, fontWeight: 900,
              }}>
                Mixer
              </h1>
              {running ? (
                <span className="sf-badge sf-badge-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#818CF8', display: 'inline-block' }} />
                  En cours
                </span>
              ) : (
                <span className="sf-badge sf-badge-muted">Prêt</span>
              )}
            </div>
            <p className="sf-page-sub">
              Superpose tes captions sur tes vidéos de la banque, en lot. · {selVideos.length} vidéo{selVideos.length !== 1 ? 's' : ''} · {selCaptions.length} caption{selCaptions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Mode toggle */}
          <div className="sf-tabs">
            {([{ k: 'random' as const, label: 'Aléatoire' }, { k: 'all' as const, label: 'Tout combiner' }] as const).map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                className={`sf-tab cursor-pointer${mode === m.k ? ' active' : ''}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Launch */}
          <button onClick={startMix} disabled={!canStart}
            className="sf-btn sf-btn-primary sf-btn-lg"
            style={{ cursor: canStart ? 'pointer' : 'not-allowed', opacity: canStart ? 1 : 0.35 }}>
            {running ? (
              <><div className="sf-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />En cours…</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>Lancer le mix</>
            )}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="anim-stagger" style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

        {/* Col 1 — Videos */}
        <aside style={{ width: 275, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          {/* Panel header */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Vidéos source</span>
            </div>
            {selVideos.length > 0 && (
              <span className="sf-badge sf-badge-accent">{selVideos.length}</span>
            )}
          </div>

          {/* Add button */}
          <div style={{ padding: '12px 14px', flexShrink: 0 }}>
            <button onClick={() => setShowVideoPicker(true)}
              className="sf-btn sf-btn-primary cursor-pointer"
              style={{ width: '100%', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Depuis la Banque
            </button>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
            {selVideos.length === 0 ? (
              <div className="sf-empty" style={{ padding: '32px 16px' }}>
                <div className="sf-empty-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-glow)" strokeWidth="1.75"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
                </div>
                <p className="sf-empty-desc" style={{ fontSize: 12 }}>Aucune vidéo<br/>Ajoute depuis la banque</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {selVideos.map(v => (
                  <div key={v.id} style={{ position: 'relative' }}>
                    <VideoThumb item={v} />
                    <p style={{ fontSize: 9, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '3px 2px', textAlign: 'center' }}>{v.title}</p>
                    <button onClick={() => removeVideo(v.id)} aria-label="Retirer" className="sf-btn sf-btn-danger cursor-pointer"
                      style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, padding: 0, borderRadius: 5, minWidth: 0 }}>
                      <IconX size={10} strokeWidth={2.25} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Col 2 — Captions */}
        <aside style={{ width: 275, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          {/* Panel header */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Captions</span>
            </div>
            {selCaptions.length > 0 && (
              <span className="sf-badge sf-badge-accent">{selCaptions.length}</span>
            )}
          </div>

          {/* Add button */}
          <div style={{ padding: '12px 14px', flexShrink: 0 }}>
            <button onClick={() => setShowCaptionPicker(true)}
              className="sf-btn sf-btn-primary cursor-pointer"
              style={{ width: '100%', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Depuis la Banque
            </button>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
            {selCaptions.length === 0 ? (
              <div className="sf-empty" style={{ padding: '32px 16px' }}>
                <div className="sf-empty-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-glow)" strokeWidth="1.75" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <p className="sf-empty-desc" style={{ fontSize: 12 }}>Aucune caption<br/>Ajoute depuis la banque</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selCaptions.map(c => (
                  <div key={c.id} className="sf-card" style={{ position: 'relative', padding: '10px 12px' }}>
                    {c.title && <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 20 }}>{c.title}</p>}
                    <p className="line-clamp-2" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                    <button onClick={() => removeCaption(c.id)} aria-label="Retirer" className="sf-btn sf-btn-danger cursor-pointer"
                      style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, padding: 0, borderRadius: 4, minWidth: 0 }}>
                      <IconX size={9} strokeWidth={2.25} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Col 3 — Configuration panel */}
        <div className="anim-stagger" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--base)', padding: '24px 28px', gap: 20 }}>

          {/* Config card */}
          <div className="sf-card sf-spotlight" style={{ padding: '20px 22px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.11em', marginBottom: 18 }}>Configuration du texte</p>

            {/* Position */}
            <div style={{ marginBottom: 20 }}>
              <p className="sf-section-label" style={{ marginBottom: 8 }}>Position du texte</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['top', 'middle', 'bottom'] as MixPosition[]).map(p => (
                  <button key={p} onClick={() => setPosition(p)} className="cursor-pointer"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, transition: 'all 0.12s', border: position === p ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)', background: position === p ? 'rgba(99,102,241,0.18)' : 'var(--surface)', color: position === p ? '#818CF8' : 'var(--text-3)', cursor: 'pointer' }}>
                    {p === 'top' ? <><IconChevronUp size={14} /> Haut</> : p === 'middle' ? <><IconAlignCenter size={14} /> Centre</> : <><IconChevronDown size={14} /> Bas</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p className="sf-section-label" style={{ margin: 0 }}>Taille de police</p>
                <span className="sf-badge sf-badge-accent">{fontSize}px</span>
              </div>
              <input type="range" min={18} max={72} step={2} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1', cursor: 'pointer' }} />
            </div>

            {/* Font color */}
            <div>
              <p className="sf-section-label" style={{ marginBottom: 8 }}>Couleur du texte</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                  style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border-md)', background: 'transparent', cursor: 'pointer', padding: 2 }} />
                {['#ffffff', '#000000', '#ffff00', '#ff4444', '#44aaff'].map(c => (
                  <button key={c} onClick={() => setFontColor(c)} className="cursor-pointer"
                    style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `2px solid ${fontColor === c ? '#6366F1' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', transform: fontColor === c ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.1s' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Summary card */}
          {canStart && (
            <div className="sf-card anim-scale-in" style={{ padding: '16px 20px', borderColor: 'rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.15)', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#818CF8' }}>
                    {mode === 'random'
                      ? `${selVideos.length} vidéo${selVideos.length > 1 ? 's' : ''} × 1 caption = ${selVideos.length} résultat${selVideos.length > 1 ? 's' : ''}`
                      : `${selVideos.length} × ${selCaptions.length} = ${selVideos.length * selCaptions.length} résultat${selVideos.length * selCaptions.length > 1 ? 's' : ''}`
                    }
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Mode: {mode === 'random' ? 'Aléatoire — 1 caption par vidéo' : 'Toutes les combinaisons'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="sf-card" style={{ padding: '12px 16px', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}>
              <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Results strip ── */}
      {jobs.length > 0 && (
        <div className="sf-anim-slide-up" style={{ flexShrink: 0, height: 228, borderTop: '1px solid var(--border)', padding: '14px 20px', overflowX: 'auto', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexShrink: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Résultats</p>
            {running && <div className="sf-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />}
            {!running && doneJobs.length > 0 && <span className="sf-badge sf-badge-ok">{doneJobs.length}/{jobs.length} terminés</span>}
            {errorJobs.length > 0 && <span className="sf-badge sf-badge-danger">{errorJobs.length} erreur{errorJobs.length > 1 ? 's' : ''}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, height: 165 }}>
            {jobs.map(job => (
              <div key={job.id} style={{ flexShrink: 0, width: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div className="sf-card" style={{ position: 'relative', width: 90, height: 130, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}>
                  {job.status === 'done' && job.outputUrl ? (
                    <video src={job.outputUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted
                      onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                      onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }} />
                  ) : job.status === 'error' ? (
                    <div title={job.error} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, width: '100%', height: '100%' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.75" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span style={{ color: '#f87171', fontSize: 9, textAlign: 'center', lineHeight: 1.4, wordBreak: 'break-word' }}>{job.error ?? 'Erreur'}</span>
                    </div>
                  ) : (
                    <div className="sf-spinner" />
                  )}
                  {job.status === 'done' && job.outputUrl && (
                    <button
                      onClick={async e => {
                        e.stopPropagation()
                        if (job.localPath && window.electronAPI?.saveFileAs) {
                          const r = await window.electronAPI.saveFileAs({ sourcePath: job.localPath, defaultName: `mixer-${job.videoItem.title}.mp4` })
                          if (r.ok || r.canceled) return
                        }
                        const a = document.createElement('a'); a.href = job.outputUrl!; a.download = `mixer-${job.videoItem.title}.mp4`; a.click()
                      }}
                      className="sf-press cursor-pointer"
                      style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{job.videoItem.title}</p>
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
