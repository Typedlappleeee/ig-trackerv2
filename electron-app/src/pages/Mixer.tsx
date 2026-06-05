import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useOrg } from '@/lib/orgContext'
import { getSignedUrl, uploadVideoFromBlob } from '@/lib/storage'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { CaptionItem } from './CaptionBank'

interface MixerProps { user: User }
type MixPosition = 'bottom' | 'center' | 'top'

interface LocalVideoFile {
  id: string
  name: string
  file: File
  previewUrl: string
  uploadedPath: string | null
}

interface ManualCaption {
  id: string
  content: string
}

interface MixJob {
  id: string
  videoKind: 'bank' | 'local'
  videoItem?: ContentItem
  localFile?: LocalVideoFile
  captionContent: string
  captionId?: string
  captionUsedCount?: number
  status: 'pending' | 'processing' | 'done' | 'error'
  outputUrl?: string
  error?: string
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

// ── Source tab ───────────────────────────────────────────────────────────────
function SourceTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: active ? 'rgba(139,92,246,0.18)' : 'transparent',
        color: active ? '#c4b5fd' : 'rgba(148,163,184,0.45)',
        fontSize: 11, fontWeight: active ? 600 : 400,
        transition: 'all 0.15s',
      }}
    >{children}</button>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <h3 className="text-xs font-semibold text-text uppercase tracking-wide">{children}</h3>
      {count !== undefined && count > 0 && <span className="text-xs text-muted">{count} sél.</span>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Mixer({ user }: MixerProps) {
  const t = useT()
  const { currentOrg } = useOrg()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Bank data ──
  const [videos,   setVideos]   = useState<ContentItem[]>([])
  const [captions, setCaptions] = useState<CaptionItem[]>([])
  const [loadingV, setLoadingV] = useState(true)
  const [loadingC, setLoadingC] = useState(true)

  // ── Source tabs ──
  const [videoTab,   setVideoTab]   = useState<'bank' | 'local'>('bank')
  const [captionTab, setCaptionTab] = useState<'bank' | 'manual'>('bank')

  // ── Bank selection ──
  const [selVideos,   setSelVideos]   = useState<Set<string>>(new Set())
  const [selCaptions, setSelCaptions] = useState<Set<string>>(new Set())

  // ── Local files ──
  const [localFiles,    setLocalFiles]    = useState<LocalVideoFile[]>([])
  const [selLocalFiles, setSelLocalFiles] = useState<Set<string>>(new Set())

  // ── Manual captions ──
  const [manualCaptions, setManualCaptions] = useState<ManualCaption[]>([])
  const [selManualCaps,  setSelManualCaps]  = useState<Set<string>>(new Set())
  const [manualInput,    setManualInput]    = useState('')

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

  useEffect(() => {
    const urls = localFiles.map(f => f.previewUrl)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [])

  const toggleVideo     = (id: string) => setSelVideos(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleCaption   = (id: string) => setSelCaptions(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleLocalFile = (id: string) => setSelLocalFiles(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleManualCap = (id: string) => setSelManualCaps(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleFilesPicked = (files: FileList | null) => {
    if (!files) return
    const newFiles: LocalVideoFile[] = Array.from(files)
      .filter(f => f.type.startsWith('video/') || f.name.endsWith('.mp4') || f.name.endsWith('.mov'))
      .map(f => ({ id: crypto.randomUUID(), name: f.name, file: f, previewUrl: URL.createObjectURL(f), uploadedPath: null }))
    if (!newFiles.length) return
    setLocalFiles(prev => [...prev, ...newFiles])
    setSelLocalFiles(prev => { const n = new Set(prev); newFiles.forEach(f => n.add(f.id)); return n })
  }

  const removeLocalFile = (id: string) => {
    const f = localFiles.find(f => f.id === id)
    if (f) URL.revokeObjectURL(f.previewUrl)
    setLocalFiles(prev => prev.filter(f => f.id !== id))
    setSelLocalFiles(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const addManualCaption = () => {
    const text = manualInput.trim()
    if (!text) return
    const mc: ManualCaption = { id: crypto.randomUUID(), content: text }
    setManualCaptions(prev => [...prev, mc])
    setSelManualCaps(prev => new Set([...prev, mc.id]))
    setManualInput('')
  }

  const removeManualCap = (id: string) => {
    setManualCaptions(prev => prev.filter(m => m.id !== id))
    setSelManualCaps(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const videoCount   = videoTab === 'bank' ? selVideos.size : selLocalFiles.size
  const captionCount = captionTab === 'bank' ? selCaptions.size : selManualCaps.size
  const canStart     = videoCount > 0 && captionCount > 0 && !running

  const buildJobs = (uploadedPaths: Map<string, string>): MixJob[] => {
    const vids = videoTab === 'bank'
      ? videos.filter(v => selVideos.has(v.id)).map(v => ({
          videoKind: 'bank' as const, videoItem: v, localFile: undefined as LocalVideoFile | undefined,
        }))
      : localFiles.filter(f => selLocalFiles.has(f.id)).map(f => ({
          videoKind: 'local' as const, videoItem: undefined as ContentItem | undefined,
          localFile: { ...f, uploadedPath: uploadedPaths.get(f.id) ?? f.uploadedPath },
        }))

    const caps = captionTab === 'bank'
      ? captions.filter(c => selCaptions.has(c.id)).map(c => ({
          captionContent: c.content, captionId: c.id, captionUsedCount: c.used_count ?? 0,
        }))
      : manualCaptions.filter(m => selManualCaps.has(m.id)).map(m => ({
          captionContent: m.content, captionId: undefined, captionUsedCount: undefined,
        }))

    const pairs: MixJob[] = []
    if (mode === 'all') {
      vids.forEach((v, vi) => caps.forEach((c, ci) => {
        pairs.push({ id: `${vi}-${ci}-${Math.random()}`, ...v, ...c, status: 'pending' })
      }))
    } else {
      vids.forEach((v, i) => {
        const c = caps[i % caps.length]
        pairs.push({ id: `${i}-${Math.random()}`, ...v, ...c, status: 'pending' })
      })
    }
    return pairs
  }

  const updateJob = (id: string, patch: Partial<MixJob>) =>
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))

  const startMix = async () => {
    setError('')
    setRunning(true)

    // Upload any local files that haven't been persisted yet
    const uploadedPaths = new Map<string, string>()
    if (videoTab === 'local') {
      const scope = currentOrg
        ? { mode: 'org' as const, id: currentOrg.id }
        : { mode: 'user' as const, id: user.id }
      const toUpload = localFiles.filter(f => selLocalFiles.has(f.id) && !f.uploadedPath)
      try {
        await Promise.all(toUpload.map(async lf => {
          const result = await uploadVideoFromBlob(lf.file, lf.name, scope)
          uploadedPaths.set(lf.id, result.storagePath)
          setLocalFiles(prev => prev.map(f => f.id === lf.id ? { ...f, uploadedPath: result.storagePath } : f))
        }))
      } catch (e: any) {
        setError('Erreur upload : ' + (e?.message ?? String(e)))
        setRunning(false)
        return
      }
    }

    const newJobs = buildJobs(uploadedPaths)
    setJobs(newJobs)

    const CONCURRENCY = 3

    const processJob = async (job: MixJob) => {
      updateJob(job.id, { status: 'processing' })
      try {
        let videoUrl: string | null = null
        if (job.videoKind === 'bank') {
          videoUrl = await getSignedUrl(job.videoItem!.storage_path)
        } else {
          const p = job.localFile?.uploadedPath ?? uploadedPaths.get(job.localFile?.id ?? '')
          if (p) videoUrl = await getSignedUrl(p)
        }
        if (!videoUrl) throw new Error('Could not get video URL')

        const resp = await fetch('/api/mix-overlay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl, caption: job.captionContent, userId: user.id, position, fontSize, fontColor }),
        })
        const data = await resp.json()
        if (!data.ok) throw new Error(data.error ?? 'Server error')
        updateJob(job.id, { status: 'done', outputUrl: data.url })

        if (job.captionId) {
          supabase.from('caption_bank')
            .update({ used_count: (job.captionUsedCount ?? 0) + 1 })
            .eq('id', job.captionId)
            .then(() => {})
        }
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        multiple
        style={{ display: 'none' }}
        onChange={e => { handleFilesPicked(e.target.files); e.target.value = '' }}
      />

      {/* ── Top 3-column selector ── */}
      <div className="flex flex-1 min-h-0 gap-0 divide-x divide-border border-b border-border">

        {/* ── Videos ── */}
        <div className="flex flex-col w-1/3 min-w-0 p-3 overflow-y-auto">
          <SectionHeader count={videoCount}>{t('mixerPickVideos')}</SectionHeader>

          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, marginBottom: 10 }}>
            <SourceTab active={videoTab === 'bank'}  onClick={() => setVideoTab('bank')}>🗂 Banque</SourceTab>
            <SourceTab active={videoTab === 'local'} onClick={() => setVideoTab('local')}>📁 Fichier local</SourceTab>
          </div>

          {videoTab === 'bank' ? (
            loadingV ? (
              <div className="flex justify-center pt-8"><Spinner size="sm" /></div>
            ) : videos.length === 0 ? (
              <p className="text-xs text-muted text-center pt-8">{t('mixerNoVideos')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {videos.map(v => (
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
            )
          ) : (
            <div className="flex flex-col gap-2">
              {/* Drop / pick zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={e => { e.preventDefault(); handleFilesPicked(e.dataTransfer.files) }}
                onDragOver={e => e.preventDefault()}
                style={{
                  border: '2px dashed rgba(139,92,246,0.3)', borderRadius: 12,
                  padding: '18px 8px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)')}
              >
                <div style={{ fontSize: 24, marginBottom: 6 }}>📁</div>
                <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.65)', lineHeight: 1.5 }}>
                  Clique ou glisse tes vidéos<br/>
                  <span style={{ color: 'rgba(139,92,246,0.8)', fontWeight: 500 }}>.mp4 / .mov</span>
                </p>
              </div>

              {localFiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {localFiles.map(lf => (
                    <div
                      key={lf.id}
                      onClick={() => toggleLocalFile(lf.id)}
                      style={{ position: 'relative', cursor: 'pointer' }}
                      className={`rounded-xl overflow-hidden border-2 transition-all ${selLocalFiles.has(lf.id) ? 'border-accent' : 'border-transparent hover:border-accent/30'}`}
                    >
                      <div style={{ aspectRatio: '9/16', background: '#0D0B1F', overflow: 'hidden' }}>
                        <video src={lf.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                      </div>
                      {lf.uploadedPath && (
                        <div style={{
                          position: 'absolute', top: 4, left: 4,
                          background: 'rgba(16,185,129,0.9)', borderRadius: 4,
                          padding: '1px 5px', fontSize: 8, fontWeight: 700, color: '#fff',
                        }}>✓</div>
                      )}
                      <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.55)', padding: '2px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lf.name}
                      </p>
                      <button
                        onClick={e => { e.stopPropagation(); removeLocalFile(lf.id) }}
                        style={{
                          position: 'absolute', top: 4, right: 4,
                          background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '50%',
                          width: 18, height: 18, cursor: 'pointer', color: '#fff', fontSize: 11,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Captions ── */}
        <div className="flex flex-col w-1/3 min-w-0 p-3 overflow-y-auto">
          <SectionHeader count={captionCount}>{t('mixerPickCaptions')}</SectionHeader>

          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, marginBottom: 10 }}>
            <SourceTab active={captionTab === 'bank'}   onClick={() => setCaptionTab('bank')}>💬 Banque</SourceTab>
            <SourceTab active={captionTab === 'manual'} onClick={() => setCaptionTab('manual')}>✏️ Manuelle</SourceTab>
          </div>

          {captionTab === 'bank' ? (
            loadingC ? (
              <div className="flex justify-center pt-8"><Spinner size="sm" /></div>
            ) : captions.length === 0 ? (
              <p className="text-xs text-muted text-center pt-8">{t('mixerNoCaptions')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {captions.map(c => (
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
            )
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addManualCaption() }}
                placeholder={'Tape ta caption ici…\nCtrl+Entrée pour ajouter'}
                style={{
                  width: '100%', minHeight: 84, padding: '8px 10px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.2)',
                  borderRadius: 10, color: '#e2e8f0', fontSize: 12, resize: 'vertical',
                  fontFamily: 'inherit', outline: 'none', lineHeight: 1.55, boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(139,92,246,0.55)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(139,92,246,0.2)')}
              />
              <button
                onClick={addManualCaption}
                disabled={!manualInput.trim()}
                style={{
                  padding: '7px 12px', borderRadius: 9, border: 'none',
                  cursor: manualInput.trim() ? 'pointer' : 'default',
                  background: manualInput.trim() ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)',
                  color: manualInput.trim() ? '#c4b5fd' : 'rgba(148,163,184,0.3)',
                  fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                }}
              >+ Ajouter la caption</button>

              {manualCaptions.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1">
                  {manualCaptions.map(mc => (
                    <div
                      key={mc.id}
                      onClick={() => toggleManualCap(mc.id)}
                      style={{
                        cursor: 'pointer', borderRadius: 10, padding: '8px 32px 8px 10px',
                        border: `2px solid ${selManualCaps.has(mc.id) ? 'rgba(139,92,246,0.65)' : 'rgba(255,255,255,0.07)'}`,
                        background: selManualCaps.has(mc.id) ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
                        position: 'relative', transition: 'all 0.12s',
                      }}
                    >
                      <p style={{ fontSize: 11, color: 'rgba(203,213,225,0.8)', lineHeight: 1.45, margin: 0 }}
                        className="line-clamp-3 whitespace-pre-wrap">
                        {mc.content}
                      </p>
                      <button
                        onClick={e => { e.stopPropagation(); removeManualCap(mc.id) }}
                        style={{
                          position: 'absolute', top: 7, right: 7,
                          background: 'none', border: 'none', color: 'rgba(148,163,184,0.35)',
                          cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2,
                        }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Config ── */}
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
                ? `${videoCount} vidéo${videoCount > 1 ? 's' : ''} × 1 caption = ${videoCount} résultat${videoCount > 1 ? 's' : ''}`
                : `${videoCount} × ${captionCount} = ${videoCount * captionCount} résultats`
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
                <p className="text-[9px] text-muted text-center truncate w-full">
                  {job.videoItem?.title ?? job.localFile?.name ?? ''}
                </p>
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
