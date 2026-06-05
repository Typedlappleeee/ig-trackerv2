import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useOrg } from '@/lib/orgContext'
import { getSignedUrl } from '@/lib/storage'
import { Button } from '@/components/ui/Button'
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

// ── Bank video thumbnail ─────────────────────────────────────────────────────
function VideoThumb({ item }: { item: ContentItem }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    getSignedUrl(item.thumbnail_path ?? item.storage_path).then(setUrl)
  }, [item.thumbnail_path, item.storage_path])
  return (
    <div className="relative aspect-[9/16] bg-surface2 rounded-lg overflow-hidden w-full">
      {url
        ? <img src={url} alt={item.title} className="w-full h-full object-cover" />
        : <div className="flex items-center justify-center h-full text-muted text-xl">🎬</div>
      }
    </div>
  )
}

// ── Folder mini sidebar ───────────────────────────────────────────────────────
function FolderSidebar({
  folders, active, onSelect, allCount,
}: {
  folders: string[]
  active: string | null
  onSelect: (f: string | null) => void
  allCount: number
}) {
  return (
    <div style={{
      width: 88, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)',
      padding: '6px 5px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <button
        onClick={() => onSelect(null)}
        style={{
          width: '100%', padding: '5px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
          textAlign: 'left', fontSize: 10, fontWeight: active === null ? 600 : 400,
          background: active === null ? 'rgba(139,92,246,0.18)' : 'transparent',
          color: active === null ? '#c4b5fd' : 'rgba(148,163,184,0.5)',
          transition: 'all 0.12s', lineHeight: 1.3,
        }}
      >
        Tout<br /><span style={{ fontSize: 9, opacity: 0.7 }}>({allCount})</span>
      </button>
      {folders.map(f => (
        <button
          key={f}
          onClick={() => onSelect(f)}
          title={f}
          style={{
            width: '100%', padding: '5px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
            textAlign: 'left', fontSize: 10, fontWeight: active === f ? 600 : 400,
            background: active === f ? 'rgba(139,92,246,0.18)' : 'transparent',
            color: active === f ? '#c4b5fd' : 'rgba(148,163,184,0.5)',
            transition: 'all 0.12s', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          📁 {f}
        </button>
      ))}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 className="text-xs font-semibold text-text uppercase tracking-wide">{children}</h3>
      {count !== undefined && count > 0 && <span className="text-xs text-muted">{count} sél.</span>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Mixer({ user }: MixerProps) {
  const t = useT()
  const { currentOrg } = useOrg()

  // ── Bank data ──
  const [videos,   setVideos]   = useState<ContentItem[]>([])
  const [captions, setCaptions] = useState<CaptionItem[]>([])
  const [loadingV, setLoadingV] = useState(true)
  const [loadingC, setLoadingC] = useState(true)

  // ── Folder navigation ──
  const [videoFolder,   setVideoFolder]   = useState<string | null>(null)
  const [captionFolder, setCaptionFolder] = useState<string | null>(null)

  // ── Selection ──
  const [selVideos,   setSelVideos]   = useState<Set<string>>(new Set())
  const [selCaptions, setSelCaptions] = useState<Set<string>>(new Set())

  // ── Config ──
  const [position,  setPosition]  = useState<MixPosition>('bottom')
  const [fontSize,  setFontSize]  = useState(36)
  const [fontColor, setFontColor] = useState('#ffffff')
  const [mode,      setMode]      = useState<'random' | 'all'>('random')

  // ── Jobs ──
  const [jobs,    setJobs]    = useState<MixJob[]>([])
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState('')

  const loadVideos = useCallback(async () => {
    setLoadingV(true)
    let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
    if (currentOrg) q = q.eq('org_id', currentOrg.id)
    else q = q.eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    setVideos((data ?? []).filter(i => i.storage_path?.endsWith('.mp4') || i.storage_path?.endsWith('.mov')))
    setLoadingV(false)
  }, [currentOrg, user.id])

  const loadCaptions = useCallback(async () => {
    setLoadingC(true)
    let q = supabase.from('caption_bank').select('*').order('created_at', { ascending: false })
    if (currentOrg) q = q.eq('org_id', currentOrg.id)
    else q = q.eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    setCaptions(data ?? [])
    setLoadingC(false)
  }, [currentOrg, user.id])

  useEffect(() => { loadVideos() }, [loadVideos])
  useEffect(() => { loadCaptions() }, [loadCaptions])

  // Derived folders
  const videoFolders   = [...new Set(videos.map(v => v.folder).filter(Boolean))] as string[]
  const captionFolders = [...new Set(captions.map(c => c.folder).filter(Boolean))] as string[]

  // Filtered views
  const visibleVideos   = videoFolder   ? videos.filter(v => v.folder === videoFolder)   : videos
  const visibleCaptions = captionFolder ? captions.filter(c => c.folder === captionFolder) : captions

  const toggleVideo   = (id: string) => setSelVideos(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleCaption = (id: string) => setSelCaptions(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const canStart = selVideos.size > 0 && selCaptions.size > 0 && !running

  const buildJobs = (): MixJob[] => {
    const vids = videos.filter(v => selVideos.has(v.id))
    const caps = captions.filter(c => selCaptions.has(c.id))
    if (mode === 'all') {
      return vids.flatMap(v => caps.map(c => ({ id: `${v.id}-${c.id}`, videoItem: v, caption: c, status: 'pending' as const })))
    }
    return vids.map((v, i) => ({
      id: `${v.id}-${caps[i % caps.length].id}-${i}`,
      videoItem: v,
      caption: caps[i % caps.length],
      status: 'pending' as const,
    }))
  }

  const updateJob = (id: string, patch: Partial<MixJob>) =>
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))

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
      } catch (e: any) {
        updateJob(job.id, { status: 'error', error: String(e?.message ?? e) })
      }
    }

    for (let i = 0; i < newJobs.length; i += CONCURRENCY) {
      await Promise.all(newJobs.slice(i, i + CONCURRENCY).map(processJob))
    }

    setRunning(false)
    loadCaptions()
  }

  const doneJobs  = jobs.filter(j => j.status === 'done')
  const errorJobs = jobs.filter(j => j.status === 'error')

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top 3-column selector ── */}
      <div className="flex flex-1 min-h-0 divide-x divide-border border-b border-border">

        {/* ── Videos column ── */}
        <div className="flex flex-col w-1/3 min-w-0 overflow-hidden">
          <div className="p-3 pb-2 flex-shrink-0">
            <SectionHeader count={selVideos.size}>{t('mixerPickVideos')}</SectionHeader>
          </div>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {videoFolders.length > 0 && (
              <FolderSidebar
                folders={videoFolders}
                active={videoFolder}
                onSelect={setVideoFolder}
                allCount={videos.length}
              />
            )}
            <div className="flex-1 overflow-y-auto p-2 pt-0">
              {loadingV ? (
                <div className="flex justify-center pt-8"><Spinner size="sm" /></div>
              ) : visibleVideos.length === 0 ? (
                <p className="text-xs text-muted text-center pt-8">{t('mixerNoVideos')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {visibleVideos.map(v => (
                    <div
                      key={v.id}
                      onClick={() => toggleVideo(v.id)}
                      className={`cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${selVideos.has(v.id) ? 'border-accent' : 'border-transparent hover:border-accent/30'}`}
                    >
                      <VideoThumb item={v} />
                      <p className="text-[10px] text-muted truncate px-1 py-0.5">{v.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Captions column ── */}
        <div className="flex flex-col w-1/3 min-w-0 overflow-hidden">
          <div className="p-3 pb-2 flex-shrink-0">
            <SectionHeader count={selCaptions.size}>{t('mixerPickCaptions')}</SectionHeader>
          </div>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {captionFolders.length > 0 && (
              <FolderSidebar
                folders={captionFolders}
                active={captionFolder}
                onSelect={setCaptionFolder}
                allCount={captions.length}
              />
            )}
            <div className="flex-1 overflow-y-auto p-2 pt-0">
              {loadingC ? (
                <div className="flex justify-center pt-8"><Spinner size="sm" /></div>
              ) : visibleCaptions.length === 0 ? (
                <p className="text-xs text-muted text-center pt-8">{t('mixerNoCaptions')}</p>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  {visibleCaptions.map(c => (
                    <div
                      key={c.id}
                      onClick={() => toggleCaption(c.id)}
                      className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${selCaptions.has(c.id) ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30 bg-surface'}`}
                    >
                      {c.title && <p className="text-[10px] font-semibold text-text mb-1 truncate">{c.title}</p>}
                      <p className="text-xs text-muted line-clamp-3 whitespace-pre-wrap">{c.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Config column ── */}
        <div className="flex flex-col w-1/3 min-w-0 p-4 gap-4 overflow-y-auto">
          <SectionHeader>{t('mixerConfig')}</SectionHeader>

          <div className="space-y-1">
            <label className="text-xs text-muted">{t('mixerMode')}</label>
            <div className="flex gap-2">
              {(['random', 'all'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === m ? 'bg-accent text-white' : 'bg-surface2 text-muted hover:text-text'}`}
                >
                  {m === 'random' ? t('mixerModeRandom') : t('mixerModeAll')}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted">
              {mode === 'random' ? t('mixerModeRandomHint') : t('mixerModeAllHint')}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted">{t('mixerPosition')}</label>
            <div className="flex gap-2">
              {(['top', 'center', 'bottom'] as MixPosition[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPosition(p)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${position === p ? 'bg-accent text-white' : 'bg-surface2 text-muted hover:text-text'}`}
                >
                  {p === 'top' ? '⬆' : p === 'center' ? '◉' : '⬇'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted">{t('mixerFontSize')} — {fontSize}px</label>
            <input
              type="range" min={18} max={72} step={2}
              value={fontSize}
              onChange={e => setFontSize(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted">{t('mixerFontColor')}</label>
            <div className="flex gap-2 items-center">
              <input
                type="color" value={fontColor}
                onChange={e => setFontColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
              />
              {['#ffffff', '#000000', '#ffff00', '#ff4444', '#44aaff'].map(c => (
                <button
                  key={c}
                  onClick={() => setFontColor(c)}
                  style={{ background: c }}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${fontColor === c ? 'border-accent scale-110' : 'border-border'}`}
                />
              ))}
            </div>
          </div>

          {canStart && (
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-xs text-accent">
              {mode === 'random'
                ? `${selVideos.size} vidéo${selVideos.size > 1 ? 's' : ''} × 1 caption = ${selVideos.size} résultat${selVideos.size > 1 ? 's' : ''}`
                : `${selVideos.size} × ${selCaptions.size} = ${selVideos.size * selCaptions.size} résultats`
              }
            </div>
          )}

          <Button onClick={startMix} disabled={!canStart} className="w-full mt-auto">
            {running ? <><Spinner size="sm" className="mr-2" />{t('mixerRunning')}</> : t('mixerStart')}
          </Button>
        </div>
      </div>

      {/* ── Results ── */}
      {jobs.length > 0 && (
        <div className="flex-shrink-0 h-56 border-t border-border p-3 overflow-x-auto">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xs font-semibold text-text uppercase tracking-wide">{t('mixerResults')}</h3>
            {running && <Spinner size="sm" />}
            {!running && doneJobs.length > 0 && (
              <span className="text-xs text-green-400">{doneJobs.length}/{jobs.length} {t('done')}</span>
            )}
            {errorJobs.length > 0 && (
              <span className="text-xs text-red-400">{errorJobs.length} {t('error')}</span>
            )}
          </div>
          <div className="flex gap-3 h-36">
            {jobs.map(job => (
              <div key={job.id} className="flex-shrink-0 w-20 flex flex-col items-center gap-1">
                <div className="relative w-20 h-28 bg-surface2 rounded-lg overflow-hidden flex items-center justify-center">
                  {job.status === 'done' && job.outputUrl ? (
                    <video
                      src={job.outputUrl} className="w-full h-full object-cover" muted
                      onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                      onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                    />
                  ) : job.status === 'error' ? (
                    <span className="text-red-400 text-xs text-center px-1">{t('error')}</span>
                  ) : (
                    <Spinner size="sm" />
                  )}
                  {job.status === 'done' && job.outputUrl && (
                    <a
                      href={job.outputUrl} download onClick={e => e.stopPropagation()}
                      className="absolute bottom-1 right-1 bg-black/60 rounded p-0.5 hover:bg-black/80 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </a>
                  )}
                </div>
                <p className="text-[9px] text-muted text-center truncate w-full">{job.videoItem.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-900/90 text-red-200 text-xs px-4 py-2 rounded-xl z-50">
          {error}
        </div>
      )}
    </div>
  )
}
