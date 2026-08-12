import { useState, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { useToast } from '@/components/Toast'
import { buildWebAPI } from '@/lib/webAPI'
import { BankPicker } from '@/pages/Bank'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'
import { useOrg } from '@/lib/orgContext'
import { supabase } from '@/lib/supabase'

const isWeb = typeof window !== 'undefined' && (window as any).__IS_WEB

const POSITIONS = [
  { label: 'Position 1', yFrac: 0.58 },
  { label: 'Position 2', yFrac: 0.64 },
  { label: 'Position 3', yFrac: 0.70 },
  { label: 'Position 4', yFrac: 0.76 },
  { label: 'Position 5', yFrac: 0.81 },
]

type ExportMode = 'download' | 'bank'

interface Job {
  id:         number
  videoPath:  string
  videoName:  string
  posIdx:     number
  status:     'pending' | 'processing' | 'uploading' | 'done' | 'error'
  outputPath?: string
  error?:     string
}

function api() {
  if (isWeb) return buildWebAPI()
  return window.electronAPI as any
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function SvgIcon({ children, size = 14 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const IcoArrowLeft  = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><path d="m15 18-6-6 6-6"/></SvgIcon>
const IcoPenLine    = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><path d="M17 12H3M3 12l4-4M3 12l4 4M7 5l10-2v14L7 19"/></SvgIcon>
const IcoVideo      = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><path d="m15 10 5 5-5 5"/><rect x="2" y="7" width="13" height="10" rx="2"/></SvgIcon>
const IcoHdd        = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><path d="M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"/></SvgIcon>
const IcoBank       = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><path d="M2 8h20M4 8V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8M10 12h4"/></SvgIcon>
const IcoText       = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></SvgIcon>
const IcoCopies     = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></SvgIcon>
const IcoDownload   = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></SvgIcon>
const IcoPlay       = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><polygon points="5 3 19 12 5 21 5 3"/></SvgIcon>
const IcoStop       = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><rect x="3" y="3" width="18" height="18" rx="2"/></SvgIcon>
const IcoActivity   = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></SvgIcon>
const IcoX          = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></SvgIcon>
const IcoSpinner    = ({ size = 10 }: { size?: number }) => <SvgIcon size={size}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></SvgIcon>
const IcoUploadCloud = ({ size = 14 }: { size?: number }) => <SvgIcon size={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></SvgIcon>

export function TextCopy({ user, onBack }: { user: User; onBack?: () => void }) {
  const toast = useToast()
  const { currentOrg } = useOrg()

  const [videos,      setVideos]      = useState<Array<{ path: string; name: string }>>([])
  const [showBankPicker, setShowBankPicker] = useState(false)

  const [text,        setText]        = useState('')
  const [copies,      setCopies]      = useState(3)
  const [fontSize,    setFontSize]    = useState(72)
  const [fontColor,   setFontColor]   = useState('#ffffff')
  const [bold,        setBold]        = useState(true)
  const [shadow,      setShadow]      = useState(true)
  const [preset,      setPreset]      = useState<'9:16' | '1:1' | '16:9'>('9:16')
  const [exportMode,  setExportMode]  = useState<ExportMode>('download')

  const [jobs,    setJobs]    = useState<Job[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef(false)

  const updateJob = (id: number, patch: Partial<Job>) =>
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))

  function pickLocal() {
    if (isWeb) {
      const input = document.createElement('input')
      input.type = 'file'; input.accept = 'video/*'; input.multiple = true
      input.onchange = () => {
        if (!input.files) return
        const w = window as any
        if (!w.__ffmpegBlobReg) w.__ffmpegBlobReg = new Map()
        setVideos(prev => [...prev, ...Array.from(input.files!).map(f => {
          const url = URL.createObjectURL(f)
          w.__ffmpegBlobReg.set(url, f)
          return { path: url, name: f.name }
        })])
      }
      input.click()
    } else {
      (window.electronAPI as any).pickVideoFile?.().then((path: string | null) => {
        if (path) setVideos(prev => [...prev, { path, name: path.split(/[\\/]/).pop() ?? path }])
      })
    }
  }

  async function generate() {
    if (!text.trim())        { toast.show({ title: 'Enter a text', kind: 'error' }); return }
    if (!videos.length)      { toast.show({ title: 'Add at least one video', kind: 'error' }); return }

    const positions = POSITIONS.slice(0, copies)
    const jobList: Job[] = []
    let idx = 0
    for (const v of videos)
      for (let pi = 0; pi < positions.length; pi++)
        jobList.push({ id: idx++, videoPath: v.path, videoName: v.name, posIdx: pi, status: 'pending' })

    setJobs(jobList)
    setRunning(true)
    abortRef.current = false

    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }

    for (const job of jobList) {
      if (abortRef.current) break
      updateJob(job.id, { status: 'processing' })
      try {
        const outName = `textcopy_${String(job.id + 1).padStart(3, '0')}.mp4`
        const tmp = await api().writeTempFile({ name: outName, bytes: new ArrayBuffer(0) })
        const outputPath = tmp?.ok ? tmp.path : `web-output-${Date.now()}.mp4`

        const res = await api().runFfmpegTextOverlay({
          inputPath: job.videoPath, outputPath, preset,
          text: text.trim(), yFrac: positions[job.posIdx].yFrac,
          fontSize, fontColor, bold, shadow,
        })

        if (!res.ok) { updateJob(job.id, { status: 'error', error: res.error ?? 'FFmpeg error' }); continue }

        const finalPath = res.outputPath ?? outputPath

        if (exportMode === 'bank') {
          updateJob(job.id, { status: 'uploading' })
          const up = await uploadVideoFromPath(finalPath, scope)
          await supabase.from('content_bank').insert({
            user_id: user.id, org_id: currentOrg?.id ?? null,
            title: `TextCopy — ${job.videoName.replace(/\.[^.]+$/, '')} — ${POSITIONS[job.posIdx].label}`,
            file_url: null, storage_path: up.storagePath, thumbnail_path: up.thumbnailPath,
            tags: [], notes: '',
          })
          updateJob(job.id, { status: 'done', outputPath: finalPath })
        } else {
          updateJob(job.id, { status: 'done', outputPath: finalPath })
        }
      } catch (e) {
        updateJob(job.id, { status: 'error', error: String(e) })
      }
    }

    setRunning(false)
    toast.show({ title: 'Generation complete', kind: 'ok' })
  }

  const done   = jobs.filter(j => j.status === 'done').length
  const errors = jobs.filter(j => j.status === 'error').length
  const total  = jobs.length
  const pct    = total > 0 ? Math.round((done + errors) / total * 100) : 0

  return (
    <div className="h-full flex flex-col overflow-y-auto anim-page">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-7 pb-5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-4 sf-anim-slide-up sf-d50">
          {onBack && (
            <>
              <button
                onClick={onBack}
                className="sf-btn sf-btn-ghost cursor-pointer flex items-center gap-1.5 text-[13px]"
              >
                <IcoArrowLeft size={14} />
                Retour
              </button>
              <div className="w-px h-6 bg-border" />
            </>
          )}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 sf-anim-scale-spring sf-d100"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.1))',
                border: '1px solid rgba(99,102,241,0.28)',
                color: 'var(--accent-l)',
                boxShadow: '0 0 16px -4px rgba(99,102,241,0.4)',
              }}
            >
              <IcoPenLine size={16} />
            </div>
            <div>
              <h1 className="text-[20px] font-black text-text leading-none">Texte IA — Dupliquer</h1>
              <p className="text-[13px] text-text2 mt-0.5">Add text at multiple positions to create unique copies.</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3 sf-anim-slide-up sf-d150">
          {!running ? (
            <button
              onClick={generate}
              disabled={!text.trim() || !videos.length}
              className="sf-btn sf-btn-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <IcoPlay size={13} />
              Generate {videos.length * copies > 0 ? `(${videos.length * copies} videos)` : ''}
            </button>
          ) : (
            <button
              onClick={() => { abortRef.current = true }}
              className="sf-btn sf-btn-danger cursor-pointer inline-flex items-center gap-2"
            >
              <IcoStop size={13} />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div className="flex-1 px-8 pb-10">
        <div className="max-w-3xl mx-auto space-y-5 pt-6 anim-stagger">

          {/* ── Videos card ── */}
          <div className="sf-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--accent-l)' }}><IcoVideo size={14} /></span>
                <span className="text-[14px] font-bold text-text">Videos ({videos.length})</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={pickLocal}
                  className="sf-btn sf-btn-secondary cursor-pointer inline-flex items-center gap-2 text-[12px]"
                >
                  <IcoHdd size={13} />
                  Local
                </button>
                <button
                  onClick={() => setShowBankPicker(true)}
                  className="sf-btn sf-btn-secondary cursor-pointer inline-flex items-center gap-2 text-[12px]"
                >
                  <IcoBank size={13} />
                  Banque
                </button>
                {videos.length > 0 && (
                  <button
                    onClick={() => setVideos([])}
                    className="sf-btn sf-btn-danger cursor-pointer text-[12px]"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {videos.length === 0 ? (
              /* Empty state with upload CTA */
              <div
                className="flex flex-col items-center justify-center gap-4 py-10 rounded-xl cursor-pointer transition-all"
                style={{
                  border: '2px dashed rgba(99,102,241,0.3)',
                  background: 'rgba(99,102,241,0.03)',
                }}
                onClick={pickLocal}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--accent-l)' }}
                >
                  <IcoVideo size={22} />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-semibold text-text">No video added</p>
                  <p className="text-[12px] text-text2 mt-0.5">Click to pick a local file, or use Banque above</p>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-2 anim-stagger">
                {videos.map((v, i) => (
                  <li key={i} className="sf-card flex items-center justify-between text-[13px] px-4 py-3 rounded-xl border border-border" style={{ background: 'rgba(99,102,241,0.03)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-text3 flex-shrink-0"><IcoVideo size={13} /></span>
                      <span className="text-text2 truncate max-w-xs">{v.name}</span>
                    </div>
                    <button
                      onClick={() => setVideos(prev => prev.filter((_, j) => j !== i))}
                      className="text-text2 hover:text-danger ml-2 cursor-pointer flex-shrink-0 transition-colors"
                      aria-label="Remove video"
                    >
                      <IcoX size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Text config card ── */}
          <div className="sf-card p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: 'var(--accent-l)' }}><IcoText size={14} /></span>
              <span className="text-[14px] font-bold text-text">Text</span>
            </div>

            {/* Textarea with char counter */}
            <div className="relative">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Enter the text to display on the video…"
                rows={3}
                className="sf-input resize-none w-full pr-16"
              />
              <span
                className="absolute bottom-3 right-3 text-[10px] font-mono pointer-events-none"
                style={{ color: text.length > 100 ? 'var(--err)' : 'var(--muted)' }}
              >
                {text.length}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-text2 uppercase tracking-wide">Font size</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={36} max={130} value={fontSize}
                    onChange={e => setFontSize(Number(e.target.value))}
                    className="flex-1 accent-accent"
                  />
                  <span className="text-[13px] text-text w-8">{fontSize}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-text2 uppercase tracking-wide">Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color" value={fontColor}
                    onChange={e => setFontColor(e.target.value)}
                    className="h-9 w-14 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                  <span className="text-[13px] text-text2">{fontColor}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBold(b => !b)}
                  className={`sf-btn cursor-pointer font-bold transition-all ${bold ? 'text-accent' : 'text-text2'}`}
                  style={bold ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  B Bold
                </button>
                <button
                  onClick={() => setShadow(s => !s)}
                  className={`sf-btn cursor-pointer transition-all ${shadow ? 'text-accent' : 'text-text2'}`}
                  style={shadow ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  Shadow
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-text2 uppercase tracking-wide">Format</label>
                <select
                  value={preset}
                  onChange={e => setPreset(e.target.value as '9:16' | '1:1' | '16:9')}
                  className="sf-input text-[13px] cursor-pointer"
                >
                  <option value="9:16" style={{ background: '#0d1120', color: '#e2d9f3' }}>9:16 (Reels)</option>
                  <option value="1:1" style={{ background: '#0d1120', color: '#e2d9f3' }}>1:1 (Square)</option>
                  <option value="16:9" style={{ background: '#0d1120', color: '#e2d9f3' }}>16:9 (Landscape)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Copies card ── */}
          <div className="sf-card p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--accent-l)' }}><IcoCopies size={14} /></span>
                <span className="text-[14px] font-bold text-text">Number of copies</span>
              </div>
              <span className="sf-badge sf-badge-violet">{copies} position{copies > 1 ? 's' : ''}</span>
            </div>
            <input
              type="range" min={1} max={5} value={copies}
              onChange={e => setCopies(Number(e.target.value))}
              className="accent-accent"
            />
            <div className="flex gap-2 flex-wrap">
              {POSITIONS.slice(0, copies).map((p, i) => (
                <span key={i} className="sf-badge sf-badge-violet sf-anim-slide-up">
                  {p.label} ({Math.round(p.yFrac * 100)}%)
                </span>
              ))}
            </div>
            <p className="text-[13px] text-text2">
              {videos.length} video{videos.length !== 1 ? 's' : ''} × {copies} position{copies !== 1 ? 's' : ''} ={' '}
              <strong className="text-text">{videos.length * copies} file{videos.length * copies !== 1 ? 's' : ''}</strong>
            </p>
          </div>

          {/* ── Export destination card ── */}
          <div className="sf-card p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: 'var(--accent-l)' }}><IcoDownload size={14} /></span>
              <span className="text-[14px] font-bold text-text">Destination of generated videos</span>
            </div>
            <div className="flex gap-3">
              {(['download', 'bank'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setExportMode(m)}
                  className={`flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all inline-flex items-center justify-center gap-2 cursor-pointer ${exportMode === m ? 'text-accent' : 'text-text2 hover:text-text'}`}
                  style={{
                    background: exportMode === m ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${exportMode === m ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: exportMode === m ? '0 0 16px -6px rgba(99,102,241,0.4)' : undefined,
                  }}
                >
                  {m === 'download' ? (
                    <><IcoDownload size={14} />Download</>
                  ) : (
                    <><IcoUploadCloud size={14} />Content bank</>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Progress card ── */}
          {jobs.length > 0 && (
            <div className="sf-card p-6 flex flex-col gap-4 sf-anim-slide-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--accent-l)' }}><IcoActivity size={14} /></span>
                  <span className="text-[14px] font-bold text-text">{done}/{total} done</span>
                </div>
                <span className="sf-badge sf-badge-violet">{pct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.12)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: errors > 0 ? 'var(--err)' : 'linear-gradient(90deg, #6366F1, #818CF8)' }}
                />
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto anim-stagger">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border" style={{ background: 'rgba(99,102,241,0.03)' }}>
                    <span className="truncate text-[13px] text-text2 flex-1">
                      {job.videoName.replace(/\.[^.]+$/, '')} — {POSITIONS[job.posIdx].label}
                    </span>
                    {job.status === 'pending'    && <span className="sf-badge sf-badge-muted">Pending</span>}
                    {job.status === 'processing' && (
                      <span className="sf-badge sf-badge-violet animate-pulse flex items-center gap-1">
                        <IcoSpinner size={10} />
                        FFmpeg…
                      </span>
                    )}
                    {job.status === 'uploading'  && (
                      <span className="sf-badge sf-badge-muted animate-pulse flex items-center gap-1">
                        <IcoSpinner size={10} />
                        Bank…
                      </span>
                    )}
                    {job.status === 'error' && (
                      <span className="sf-badge sf-badge-red sf-anim-slide-up" title={job.error}>Error</span>
                    )}
                    {job.status === 'done' && exportMode === 'download' && job.outputPath && (
                      <a
                        href={job.outputPath}
                        download={`textcopy_${String(job.id + 1).padStart(3, '0')}.mov`}
                        className="sf-badge sf-badge-green hover:opacity-80 transition-opacity sf-anim-slide-up"
                      >
                        Download
                      </a>
                    )}
                    {job.status === 'done' && exportMode === 'bank' && (
                      <span className="sf-badge sf-badge-green sf-anim-slide-up">Bank</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Bank picker modal */}
      {showBankPicker && (
        <BankPicker user={user} mode="single" resolveMode="full"
          onSelect={(paths, titles) => {
            if (!paths[0]) return
            setVideos(prev => [...prev, { path: paths[0], name: titles?.[0] ?? paths[0].split('/').pop()?.split('?')[0] ?? paths[0] }])
          }}
          onClose={() => setShowBankPicker(false)} />
      )}
    </div>
  )
}
