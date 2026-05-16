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
    if (!text.trim())        { toast.show({ title: 'Entre un texte', kind: 'error' }); return }
    if (!videos.length)      { toast.show({ title: 'Ajoute au moins une vidéo', kind: 'error' }); return }

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

        if (!res.ok) { updateJob(job.id, { status: 'error', error: res.error ?? 'Erreur FFmpeg' }); continue }

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
    toast.show({ title: 'Génération terminée', kind: 'ok' })
  }

  const done   = jobs.filter(j => j.status === 'done').length
  const errors = jobs.filter(j => j.status === 'error').length
  const total  = jobs.length
  const pct    = total > 0 ? Math.round((done + errors) / total * 100) : 0

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && <button onClick={onBack} className="text-white/40 hover:text-white text-lg">←</button>}
        <div>
          <h1 className="text-2xl font-black text-white">Texte IA — Dupliquer</h1>
          <p className="text-sm text-white/40">Ajoute un texte à plusieurs positions pour créer des copies uniques.</p>
        </div>
      </div>

      {/* Videos */}
      <section className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-white">Vidéos ({videos.length})</span>
          <div className="flex gap-2">
            <button onClick={pickLocal}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
              📁 Local
            </button>
            <button onClick={() => setShowBankPicker(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
              🏦 Banque
            </button>
            {videos.length > 0 && (
              <button onClick={() => setVideos([])}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                Vider
              </button>
            )}
          </div>
        </div>
        {videos.length === 0
          ? <p className="text-sm text-white/30 text-center py-4">Aucune vidéo — local ou depuis la banque</p>
          : (
            <ul className="flex flex-col gap-1">
              {videos.map((v, i) => (
                <li key={i} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <span className="text-white/70 truncate max-w-xs">{v.name}</span>
                  <button onClick={() => setVideos(prev => prev.filter((_, j) => j !== i))}
                    className="text-white/30 hover:text-red-400 ml-2 text-xs">✕</button>
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* Text config */}
      <section className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <span className="font-bold text-white">Texte</span>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="Entre le texte à afficher sur la vidéo…" rows={3}
          className="w-full rounded-xl px-4 py-3 text-white text-sm resize-none outline-none"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/50">Taille police</label>
            <div className="flex items-center gap-2">
              <input type="range" min={36} max={130} value={fontSize}
                onChange={e => setFontSize(Number(e.target.value))} className="flex-1" />
              <span className="text-sm text-white w-8">{fontSize}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/50">Couleur</label>
            <div className="flex items-center gap-2">
              <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                className="h-8 w-12 rounded cursor-pointer border-0 bg-transparent" />
              <span className="text-sm text-white/60">{fontColor}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setBold(b => !b)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${bold ? 'text-violet-300' : 'text-white/30'}`}
              style={{ background: bold ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)' }}>
              Gras
            </button>
            <button onClick={() => setShadow(s => !s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${shadow ? 'text-violet-300' : 'text-white/30'}`}
              style={{ background: shadow ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)' }}>
              Ombre
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/50">Format</label>
            <select value={preset} onChange={e => setPreset(e.target.value as any)}
              className="rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <option value="9:16">9:16 (Reels)</option>
              <option value="1:1">1:1 (Carré)</option>
              <option value="16:9">16:9 (Paysage)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Copies */}
      <section className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-white">Nombre de copies</span>
          <span className="text-sm font-semibold text-violet-400">{copies} position{copies > 1 ? 's' : ''}</span>
        </div>
        <input type="range" min={1} max={5} value={copies} onChange={e => setCopies(Number(e.target.value))} />
        <div className="flex gap-2 flex-wrap">
          {POSITIONS.slice(0, copies).map((p, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded-full"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>
              {p.label} ({Math.round(p.yFrac * 100)}%)
            </span>
          ))}
        </div>
        <p className="text-xs text-white/30">
          {videos.length} vidéo{videos.length !== 1 ? 's' : ''} × {copies} position{copies !== 1 ? 's' : ''} ={' '}
          <strong className="text-white/50">{videos.length * copies} fichier{videos.length * copies !== 1 ? 's' : ''}</strong>
        </p>
      </section>

      {/* Export destination */}
      <section className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <span className="font-bold text-white">Destination des vidéos générées</span>
        <div className="flex gap-3">
          {(['download', 'bank'] as const).map(m => (
            <button key={m} onClick={() => setExportMode(m)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: exportMode === m ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                color: exportMode === m ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                border: `1px solid ${exportMode === m ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
              }}>
              {m === 'download' ? '⬇ Téléchargement' : '🏦 Banque de contenu'}
            </button>
          ))}
        </div>
      </section>

      {/* Generate */}
      <div className="flex gap-3">
        {!running ? (
          <button onClick={generate} disabled={!text.trim() || !videos.length}
            className="flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}>
            ▶ Générer {videos.length * copies > 0 ? `(${videos.length * copies} vidéos)` : ''}
          </button>
        ) : (
          <button onClick={() => { abortRef.current = true }}
            className="flex-1 py-3 rounded-xl font-bold"
            style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
            ⏹ Arrêter
          </button>
        )}
      </div>

      {/* Progress */}
      {jobs.length > 0 && (
        <section className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">{done}/{total} terminées</span>
            <span className="text-sm text-white/50">{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: errors > 0 ? '#f87171' : '#7c3aed' }} />
          </div>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {jobs.map(job => (
              <div key={job.id} className="flex items-center justify-between gap-3 text-sm px-3 py-2 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="truncate text-white/70 flex-1">
                  {job.videoName.replace(/\.[^.]+$/, '')} — {POSITIONS[job.posIdx].label}
                </span>
                {job.status === 'pending'    && <span className="text-white/30 text-xs">En attente</span>}
                {job.status === 'processing' && <span className="text-violet-400 text-xs animate-pulse">⚙ FFmpeg…</span>}
                {job.status === 'uploading'  && <span className="text-blue-400 text-xs animate-pulse">⬆ Banque…</span>}
                {job.status === 'error'      && <span className="text-red-400 text-xs" title={job.error}>❌</span>}
                {job.status === 'done' && exportMode === 'download' && job.outputPath && (
                  <a href={job.outputPath}
                    download={`textcopy_${String(job.id + 1).padStart(3, '0')}.mp4`}
                    className="text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                    ↓ Télécharger
                  </a>
                )}
                {job.status === 'done' && exportMode === 'bank' && (
                  <span className="text-xs text-green-400">✓ Banque</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bank picker modal — mode=single keeps modal open so user can pick several */}
      {showBankPicker && (
        <BankPicker user={user} mode="single" resolveMode="full"
          onSelect={(paths, titles) => {
            if (!paths[0]) return
            setVideos(prev => [...prev, { path: paths[0], name: titles?.[0] ?? paths[0].split('/').pop()?.split('?')[0] ?? paths[0] }])
            // don't close — let user keep picking; they close via ✕
          }}
          onClose={() => setShowBankPicker(false)} />
      )}
    </div>
  )
}
