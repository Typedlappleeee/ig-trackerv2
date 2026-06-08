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
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="text-white/40 hover:text-white text-lg">←</button>}
          <div>
            <h1 className="text-[28px] font-black text-white leading-none">Texte IA — Dupliquer</h1>
            <p className="text-[13px] text-text2 mt-0.5">Add text at multiple positions to create unique copies.</p>
          </div>
        </div>
        <div className="flex gap-3">
          {!running ? (
            <button onClick={generate} disabled={!text.trim() || !videos.length}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>
              ▶ Generate {videos.length * copies > 0 ? `(${videos.length * copies} videos)` : ''}
            </button>
          ) : (
            <button onClick={() => { abortRef.current = true }}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
              style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
              ⏹ Stop
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-10 pb-10">
        <div className="max-w-3xl mx-auto space-y-6 pt-8">

          {/* Videos */}
          <section className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[15px] font-bold text-white">Videos ({videos.length})</span>
              <div className="flex gap-2">
                <button onClick={pickLocal}
                  className="rounded-xl px-4 py-2 text-[13px] font-semibold inline-flex items-center gap-2"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"/></svg>
                  Local
                </button>
                <button onClick={() => setShowBankPicker(true)}
                  className="rounded-xl px-4 py-2 text-[13px] font-semibold inline-flex items-center gap-2"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 8h20M4 8V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8M10 12h4"/></svg>
                  Banque
                </button>
                {videos.length > 0 && (
                  <button onClick={() => setVideos([])}
                    className="rounded-xl px-4 py-2 text-[13px] font-semibold"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                    Clear
                  </button>
                )}
              </div>
            </div>
            {videos.length === 0
              ? <p className="text-[13px] text-text2 text-center py-6">No video — local or from the bank</p>
              : (
                <ul className="flex flex-col gap-2">
                  {videos.map((v, i) => (
                    <li key={i} className="flex items-center justify-between text-[13px] px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-white/70 truncate max-w-xs">{v.name}</span>
                      <button onClick={() => setVideos(prev => prev.filter((_, j) => j !== i))}
                        className="text-white/30 hover:text-red-400 ml-2 text-[13px]">✕</button>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          {/* Text config */}
          <section className="rounded-2xl p-6 flex flex-col gap-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-[15px] font-bold text-white">Text</span>
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder="Enter the text to display on the video…" rows={3}
              className="w-full rounded-xl px-4 py-3 text-[13px] text-white resize-none outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }} />

            <div className="grid grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-text2">Font size</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={36} max={130} value={fontSize}
                    onChange={e => setFontSize(Number(e.target.value))} className="flex-1" />
                  <span className="text-[13px] text-white w-8">{fontSize}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-text2">Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                    className="h-9 w-14 rounded-lg cursor-pointer border-0 bg-transparent" />
                  <span className="text-[13px] text-white/60">{fontColor}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setBold(b => !b)}
                  className={`rounded-xl px-4 py-2.5 text-[13px] font-bold transition-all ${bold ? 'text-violet-300' : 'text-white/30'}`}
                  style={{ background: bold ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${bold ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                  Bold
                </button>
                <button onClick={() => setShadow(s => !s)}
                  className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all ${shadow ? 'text-violet-300' : 'text-white/30'}`}
                  style={{ background: shadow ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${shadow ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                  Shadow
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-text2">Format</label>
                <select value={preset} onChange={e => setPreset(e.target.value as any)}
                  className="rounded-xl px-4 py-2.5 text-[13px] text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
                  <option value="9:16" style={{ background: '#0d1120', color: '#e2d9f3' }}>9:16 (Reels)</option>
                  <option value="1:1" style={{ background: '#0d1120', color: '#e2d9f3' }}>1:1 (Square)</option>
                  <option value="16:9" style={{ background: '#0d1120', color: '#e2d9f3' }}>16:9 (Landscape)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Copies */}
          <section className="rounded-2xl p-6 flex flex-col gap-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold text-white">Number of copies</span>
              <span className="text-[13px] font-semibold text-violet-400">{copies} position{copies > 1 ? 's' : ''}</span>
            </div>
            <input type="range" min={1} max={5} value={copies} onChange={e => setCopies(Number(e.target.value))} />
            <div className="flex gap-2 flex-wrap">
              {POSITIONS.slice(0, copies).map((p, i) => (
                <span key={i} className="text-[12px] px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>
                  {p.label} ({Math.round(p.yFrac * 100)}%)
                </span>
              ))}
            </div>
            <p className="text-[13px] text-text2">
              {videos.length} video{videos.length !== 1 ? 's' : ''} × {copies} position{copies !== 1 ? 's' : ''} ={' '}
              <strong className="text-white/60">{videos.length * copies} file{videos.length * copies !== 1 ? 's' : ''}</strong>
            </p>
          </section>

          {/* Export destination */}
          <section className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-[15px] font-bold text-white">Destination of generated videos</span>
            <div className="flex gap-3">
              {(['download', 'bank'] as const).map(m => (
                <button key={m} onClick={() => setExportMode(m)}
                  className="flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all inline-flex items-center justify-center gap-2"
                  style={{
                    background: exportMode === m ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                    color: exportMode === m ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                    border: `1px solid ${exportMode === m ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  }}>
                  {m === 'download' ? (
                    <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Download</>
                  ) : (
                    <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 8h20M4 8V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8M10 12h4"/></svg> Content bank</>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Progress */}
          {jobs.length > 0 && (
            <section className="rounded-2xl p-6 flex flex-col gap-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold text-white">{done}/{total} done</span>
                <span className="text-[13px] text-text2">{pct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: errors > 0 ? '#f87171' : 'linear-gradient(130deg,#7c3aed,#ec4899)' }} />
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="truncate text-[13px] text-white/70 flex-1">
                      {job.videoName.replace(/\.[^.]+$/, '')} — {POSITIONS[job.posIdx].label}
                    </span>
                    {job.status === 'pending'    && <span className="text-text2 text-[12px]">Pending</span>}
                    {job.status === 'processing' && <span className="text-violet-400 text-[12px] animate-pulse">⚙ FFmpeg…</span>}
                    {job.status === 'uploading'  && <span className="text-blue-400 text-[12px] animate-pulse">⬆ Bank…</span>}
                    {job.status === 'error'      && <span className="text-red-400 text-[12px]" title={job.error}>❌</span>}
                    {job.status === 'done' && exportMode === 'download' && job.outputPath && (
                      <a href={job.outputPath}
                        download={`textcopy_${String(job.id + 1).padStart(3, '0')}.mp4`}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-xl"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                        ↓ Download
                      </a>
                    )}
                    {job.status === 'done' && exportMode === 'bank' && (
                      <span className="text-[12px] text-green-400">✓ Bank</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
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
