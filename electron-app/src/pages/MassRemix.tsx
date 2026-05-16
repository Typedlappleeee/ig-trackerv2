import { useState, useRef, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { BankPicker } from './Bank'
import { playSuccess, playError } from '@/lib/sounds'
import { supabase } from '@/lib/supabase'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'

interface MassRemixProps { user: User }

type Preset = '9:16' | '1:1' | '16:9'
type ExportMode = 'bank' | 'folder'

interface MassJob {
  id:           number
  originalPath: string
  secondaryPath: string
  status: 'pending' | 'detecting' | 'analyzing' | 'generating' | 'uploading' | 'done' | 'error'
  splitTime?:   number
  error?:       string
  outputPath?:  string
}

const STATUS_LABEL: Record<MassJob['status'], string> = {
  pending:    '⏳ En attente',
  detecting:  '🔍 Détection…',
  analyzing:  '✨ IA texte…',
  generating: '⚙ FFmpeg…',
  uploading:  '☁ Upload…',
  done:       '✅ Terminé',
  error:      '❌ Erreur',
}

function fileName(p: string) { return p.replace(/\\/g, '/').split('/').pop() ?? p }

function xAlignToExpr(align: string): string {
  if (align === 'right') return 'w*0.96-text_w'
  if (align === 'left')  return 'w*0.04'
  return '(w-text_w)/2'
}

function VideoListPanel({
  label, paths, accent, onAddBank, onAddPC, onRemove,
}: {
  label: string; paths: string[]; accent: string
  onAddBank: () => void; onAddPC: () => void; onRemove: (i: number) => void
}) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-white">{label}</p>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${accent}22`, color: accent }}>{paths.length}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={onAddBank}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
          🗂 Banque
        </button>
        <button onClick={onAddPC}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
          💾 PC
        </button>
      </div>
      <div className="flex-1 overflow-auto space-y-1.5 min-h-[120px] max-h-80">
        {paths.length === 0 ? (
          <div className="rounded-xl p-4 text-center text-xs" style={{ border: `1px dashed ${accent}25`, color: 'rgba(196,181,253,0.3)' }}>
            Aucune vidéo — ajoute depuis la banque ou le PC
          </div>
        ) : paths.map((p, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ background: `${accent}08`, border: `1px solid ${accent}18` }}>
            <span className="text-[10px] font-bold w-5 text-center flex-shrink-0"
              style={{ color: accent }}>{i + 1}</span>
            <span className="text-xs font-mono truncate flex-1 text-white/70">{fileName(p)}</span>
            <button onClick={() => onRemove(i)}
              className="text-[11px] flex-shrink-0"
              style={{ color: 'rgba(239,68,68,0.5)' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MassRemix({ user }: MassRemixProps) {
  const { currentOrg } = useOrg()
  const conns = useConnections(user)

  const [originals,    setOriginals]    = useState<string[]>([])
  const [secondaries,  setSecondaries]  = useState<string[]>([])
  const [preset,       setPreset]       = useState<Preset>('9:16')
  const [aiEnabled,    setAiEnabled]    = useState(false)
  const [exportMode,   setExportMode]   = useState<ExportMode>('bank')
  const [outputFolder, setOutputFolder] = useState<string | null>(null)

  const [showBankOrig, setShowBankOrig] = useState(false)
  const [showBankSec,  setShowBankSec]  = useState(false)

  // anthropic key from DB (connections), fallback to localStorage
  const anthropicKey = conns.anthropic || localStorage.getItem('sf_anthropic_key') || ''

  const [jobs,        setJobs]        = useState<MassJob[]>([])
  const [running,     setRunning]     = useState(false)
  const [currentIdx,  setCurrentIdx]  = useState(0)
  const [currentStep, setCurrentStep] = useState<MassJob['status']>('pending')
  const abortRef = useRef(false)

  // Abort generation when component unmounts (user navigates away)
  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  // Keep currentStep in sync with the active job
  useEffect(() => {
    if (!running || jobs.length === 0) return
    const active = jobs.find(j => j.status !== 'done' && j.status !== 'error' && j.status !== 'pending')
    if (active) setCurrentStep(active.status)
  }, [jobs, running])

  function updateJob(id: number, patch: Partial<MassJob>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  async function pickPC(multi: boolean): Promise<string[]> {
    const p = await window.electronAPI?.pickVideoFile?.()
    return p ? [p] : []
  }

  async function launch() {
    if (!originals.length || !secondaries.length) return
    if (exportMode === 'folder' && !outputFolder) {
      const f = await window.electronAPI?.pickOutputFolder?.()
      if (!f) return
      setOutputFolder(f)
    }

    const folder = exportMode === 'folder' ? outputFolder : null
    const pairs: MassJob[] = originals.map((orig, i) => ({
      id: i,
      originalPath:  orig,
      secondaryPath: secondaries[i % secondaries.length],
      status: 'pending',
    }))
    setJobs(pairs)
    setRunning(true)
    setCurrentIdx(0)
    setCurrentStep('detecting')
    abortRef.current = false

    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }

    for (const job of pairs) {
      if (abortRef.current) break
      setCurrentIdx(job.id)

      // 1. Detect split
      setCurrentStep('detecting')
      updateJob(job.id, { status: 'detecting' })
      const det = await window.electronAPI!.detectSceneChange!({ filePath: job.originalPath })
      let splitTime = det.ok && det.splitTime != null
        ? Math.min((det.duration ?? 60) - 0.1, Math.round(det.splitTime * 1000) / 1000)
        : undefined  // no real scene change → no phase 2

      // If a split was found, check that phase 2 isn't just more person/footage
      // (phase 2 should be a different scene — if it still shows a person, skip it)
      if (splitTime != null && anthropicKey.trim()) {
        try {
          const totalDur = det.duration ?? 60
          const phase2Mid = Math.min(splitTime + 2, totalDur - 0.5)
          const fr2 = await window.electronAPI!.extractFrames!({
            filePath: job.originalPath,
            startTime: phase2Mid,
            endTime: Math.min(phase2Mid + 1, totalDur),
          })
          if (fr2.ok && fr2.frames?.[0]) {
            const res = await window.electronAPI!.anthropicVisionRequest!({
              apiKey: anthropicKey.trim(),
              model: 'claude-haiku-4-5-20251001',
              messages: [{ role: 'user', content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fr2.frames[0].data } },
                { type: 'text', text: 'Is there a person or human face clearly visible in this frame? Answer only "yes" or "no".' },
              ]}],
              maxTokens: 5,
            })
            if (res.ok) {
              const answer = ((res.data as any)?.content?.[0]?.text ?? '').toLowerCase()
              if (answer.includes('yes')) splitTime = undefined  // still shows a person → no phase 2
            }
          }
        } catch { /* if check fails, keep splitTime as-is */ }
      }

      updateJob(job.id, { splitTime: splitTime ?? 0 })

      // 2. AI text detection (optional)
      type Overlay = { text: string; x: string; y: string; fontSize: number; fontColor: string; bold: boolean; shadow: boolean; startTime: number; endTime: number }
      let textOverlays: Overlay[] = []

      if (aiEnabled && anthropicKey.trim()) {
        setCurrentStep('analyzing')
        updateJob(job.id, { status: 'analyzing' })
        try {
          const analyzeEnd = splitTime ?? (det.duration ?? 60)
          const fr = await window.electronAPI!.extractFrames!({ filePath: job.originalPath, endTime: analyzeEnd })
          if (fr.ok && fr.frames?.length) {
            const interval = analyzeEnd / fr.frames.length
            const imageBlocks = fr.frames.flatMap((f, fi) => [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } },
              { type: 'text', text: `[Frame ${fi} — t=${f.timestamp}s]` },
            ])
            const prompt = `These are ${fr.frames.length} frames from a ${analyzeEnd.toFixed(1)}s video clip (vertical 9:16, output resolution 1080×1920).
Identify ALL burned-in text overlays (titles, captions, subtitles, watermarks). For each return:
{"text":"exact string","xAlign":"left"|"center"|"right","yPercent":0-100,"fontSizePx":number,"fontColor":"css-color","bold":true,"startFrame":0,"endFrame":5}

Rules for fontSizePx (at 1080×1920):
CRITICAL: text must fit on ONE LINE within 1080px. Use fontSizePx ≤ 900/(text.length×0.55).
Examples: 6 chars→max 272px, 10 chars→max 163px, 15 chars→max 109px, 20 chars→max 81px, 30 chars→max 54px.
Return ONLY a JSON array. If none, return [].`
            const res = await window.electronAPI!.anthropicVisionRequest!({
              apiKey: anthropicKey.trim(), model: 'claude-haiku-4-5-20251001',
              messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
              maxTokens: 2000,
            })
            if (res.ok) {
              const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? '[]'
              try {
                const m = txt.match(/\[[\s\S]*\]/)
                if (m) {
                  const parsed = JSON.parse(m[0]) as Array<{ text: string; xAlign: string; yPercent: number; fontSizePx: number; fontColor: string; bold?: boolean; startFrame: number; endFrame: number }>
                  textOverlays = parsed.map(item => ({
                    text: item.text,
                    x: xAlignToExpr(item.xAlign ?? 'center'),
                    y: `h*${Math.max(0.55, Math.min(0.82, (item.yPercent ?? 72) / 100)).toFixed(3)}`,
                    fontSize: Math.round(Math.max(36, Math.min(130, item.fontSizePx ?? 80, Math.round(950 / Math.max(item.text.length * 0.62, 1))))),
                    fontColor: item.fontColor ?? 'white',
                    bold: item.bold ?? true,
                    shadow: true,
                    startTime: Math.round((item.startFrame ?? 0) * interval * 10) / 10,
                    endTime: Math.min(analyzeEnd, Math.round(((item.endFrame ?? fr.frames!.length - 1) + 1) * interval * 10) / 10),
                  }))
                }
              } catch { /* ignore parse errors */ }
            }
          }
        } catch { /* continue without overlays */ }
      }

      // 3. Generate
      setCurrentStep('generating')
      updateJob(job.id, { status: 'generating' })
      const outName = `remix_${String(job.id + 1).padStart(3, '0')}.mp4`
      let outputPath: string
      if (folder) {
        outputPath = folder.replace(/\\/g, '/') + '/' + outName
      } else {
        // temp path for bank export
        const tmp = await window.electronAPI!.writeTempFile!({ name: outName, bytes: new ArrayBuffer(0) })
        if (!tmp.ok || !tmp.path) { updateJob(job.id, { status: 'error', error: 'Impossible de créer le fichier temp' }); continue }
        outputPath = tmp.path
      }

      const gen = await window.electronAPI!.runFfmpegRemixAI!({
        newPhase1Path: job.secondaryPath,
        originalPath:  job.originalPath,
        splitTime, outputPath, preset,
        targetDuration: det.duration ?? undefined,
        textOverlays,
      })

      if (!gen.ok) { updateJob(job.id, { status: 'error', error: gen.error ?? 'Erreur FFmpeg', outputPath }); playError(); continue }
      updateJob(job.id, { outputPath: gen.outputPath ?? outputPath })

      // 4. Upload to bank if needed
      if (exportMode === 'bank') {
        setCurrentStep('uploading')
        updateJob(job.id, { status: 'uploading' })
        try {
          const up = await uploadVideoFromPath(gen.outputPath ?? outputPath, scope)
          await supabase.from('content_bank').insert({
            user_id: user.id, org_id: currentOrg?.id ?? null,
            title: `Remix ${String(job.id + 1).padStart(3, '0')} — ${fileName(job.originalPath)}`,
            file_url: null, storage_path: up.storagePath, thumbnail_path: up.thumbnailPath,
            tags: [], notes: '',
          })
        } catch (err) {
          updateJob(job.id, { status: 'error', error: String(err) }); playError(); continue
        }
      }

      updateJob(job.id, { status: 'done' })
      playSuccess()
    }

    setRunning(false)
  }

  const doneCount  = jobs.filter(j => j.status === 'done').length
  const errorCount = jobs.filter(j => j.status === 'error').length
  const canLaunch  = originals.length > 0 && secondaries.length > 0 && !running
  const progress   = jobs.length > 0 ? Math.round((doneCount + errorCount) / jobs.length * 100) : 0

  const STEP_LABEL: Record<string, string> = {
    detecting:  '🔍 Détection scène…',
    analyzing:  '✨ Analyse texte IA…',
    generating: '⚙ Génération FFmpeg…',
    uploading:  '☁ Upload banque…',
  }

  return (
    <>
      {/* ── Progress modal ── */}
      {running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(3,1,8,0.92)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'rgba(12,8,28,0.98)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 0 60px rgba(124,58,237,0.25)' }}>
            {/* Header */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.15)', background: 'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(236,72,153,0.06))' }}>
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 flex-shrink-0">
                  <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                    <Spinner size="sm" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-black text-white">Génération en cours…</p>
                  <p className="text-[11px]" style={{ color: 'rgba(196,181,253,0.5)' }}>
                    Vidéo {currentIdx + 1} / {jobs.length} — {STEP_LABEL[currentStep] ?? currentStep}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: 'rgba(196,181,253,0.5)' }}>{doneCount} terminée(s)</span>
                <span className="font-bold" style={{ color: '#a78bfa' }}>{progress}%</span>
                <span style={{ color: 'rgba(196,181,253,0.5)' }}>{jobs.length} total</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.12)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
              </div>

              {/* Current file */}
              <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#a78bfa' }}>En cours</p>
                <p className="text-xs font-mono text-white/80 truncate">{fileName(jobs[currentIdx]?.originalPath ?? '')}</p>
                <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>→ {fileName(jobs[currentIdx]?.secondaryPath ?? '')}</p>
              </div>

              {/* Job list (last 5) */}
              <div className="space-y-1 max-h-40 overflow-auto">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                    style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.06)' : job.status === 'error' ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                    <span className="w-5 text-[10px] font-bold flex-shrink-0 text-center"
                      style={{ color: 'rgba(196,181,253,0.35)' }}>#{job.id + 1}</span>
                    <span className="flex-1 text-[10px] font-mono truncate" style={{ color: 'rgba(196,181,253,0.6)' }}>{fileName(job.originalPath)}</span>
                    <span className="text-[10px] font-semibold flex-shrink-0"
                      style={{ color: job.status === 'done' ? '#34d399' : job.status === 'error' ? '#f87171' : '#a78bfa' }}>
                      {STATUS_LABEL[job.status]}
                    </span>
                  </div>
                ))}
              </div>

              <button onClick={() => { abortRef.current = true; setRunning(false) }}
                className="w-full py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                ✕ Annuler la génération
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Done summary modal ── */}
      {!running && jobs.length > 0 && (doneCount + errorCount) === jobs.length && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(3,1,8,0.88)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'rgba(12,8,28,0.98)', border: `1px solid ${errorCount === 0 ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}` }}>
            <div className="px-6 py-5 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-4xl">{errorCount === 0 ? '✅' : '⚠️'}</div>
                <p className="text-lg font-black text-white">
                  {errorCount === 0 ? 'Tous les remixes générés !' : `${doneCount} / ${jobs.length} terminés`}
                </p>
                {errorCount > 0 && <p className="text-sm" style={{ color: '#fbbf24' }}>{errorCount} erreur(s)</p>}
              </div>
              {/* Results list */}
              <div className="space-y-1 max-h-52 overflow-auto">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${job.status === 'done' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                    <span className="text-sm">{job.status === 'done' ? '✅' : '❌'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-mono truncate text-white/70">{fileName(job.originalPath)}</p>
                      {job.error && <p className="text-[9px]" style={{ color: '#f87171' }}>{job.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={() => { setJobs([]); setRunning(false) }} className="w-full">Fermer</Button>
            </div>
          </div>
        </div>
      )}

      {showBankOrig && (
        <BankPicker user={user} mode="multi"
          onSelect={paths => { setShowBankOrig(false); setOriginals(prev => [...prev, ...paths]) }}
          onClose={() => setShowBankOrig(false)} />
      )}
      {showBankSec && (
        <BankPicker user={user} mode="multi"
          onSelect={paths => { setShowBankSec(false); setSecondaries(prev => [...prev, ...paths]) }}
          onClose={() => setShowBankSec(false)} />
      )}

      <div className="flex flex-col h-full overflow-auto p-6 gap-6" style={{ background: '#06040f' }}>

        {/* Video pickers */}
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
            <VideoListPanel
              label="Vidéos originales"
              paths={originals}
              accent="#8b5cf6"
              onAddBank={() => setShowBankOrig(true)}
              onAddPC={async () => { const p = await pickPC(false); setOriginals(prev => [...prev, ...p]) }}
              onRemove={i => setOriginals(prev => prev.filter((_, j) => j !== i))}
            />
          </div>
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(236,72,153,0.15)' }}>
            <VideoListPanel
              label="Nouvelles Phase 1"
              paths={secondaries}
              accent="#ec4899"
              onAddBank={() => setShowBankSec(true)}
              onAddPC={async () => { const p = await pickPC(false); setSecondaries(prev => [...prev, ...p]) }}
              onRemove={i => setSecondaries(prev => prev.filter((_, j) => j !== i))}
            />
          </div>
        </div>

        {/* Pairing info */}
        {originals.length > 0 && secondaries.length > 0 && (
          <div className="rounded-xl px-4 py-2.5 text-xs flex items-center gap-2"
            style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', color: 'rgba(196,181,253,0.6)' }}>
            <span>🔀</span>
            <span>
              <strong className="text-white">{originals.length}</strong> originale(s) ×{' '}
              <strong className="text-white">{secondaries.length}</strong> secondaire(s) ={' '}
              <strong className="text-white">{originals.length}</strong> remix
              {secondaries.length < originals.length && ' (secondaires en boucle)'}
            </span>
          </div>
        )}

        {/* Settings */}
        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'rgba(196,181,253,0.4)' }}>Paramètres</p>

          <div className="grid grid-cols-2 gap-4">
            {/* Preset */}
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(196,181,253,0.4)' }}>Format</p>
              <div className="flex gap-2">
                {(['9:16', '1:1', '16:9'] as Preset[]).map(p => (
                  <button key={p} onClick={() => setPreset(p)} className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                    style={preset === p
                      ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                      : { background: 'rgba(139,92,246,0.06)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
                    }>{p}</button>
                ))}
              </div>
            </div>

            {/* Export mode */}
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(196,181,253,0.4)' }}>Export</p>
              <div className="flex gap-2">
                {(['bank', 'folder'] as ExportMode[]).map(m => (
                  <button key={m} onClick={() => setExportMode(m)} className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                    style={exportMode === m
                      ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                      : { background: 'rgba(139,92,246,0.06)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
                    }>
                    {m === 'bank' ? '☁ Banque' : '💾 Dossier'}
                  </button>
                ))}
              </div>
              {exportMode === 'folder' && (
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={async () => { const f = await window.electronAPI?.pickOutputFolder?.(); if (f) setOutputFolder(f) }}
                    className="text-xs px-3 py-1 rounded-lg"
                    style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                    📁 Choisir…
                  </button>
                  {outputFolder && <span className="text-[10px] font-mono truncate" style={{ color: 'rgba(196,181,253,0.5)' }}>{outputFolder}</span>}
                </div>
              )}
            </div>
          </div>

          {/* AI text toggle */}
          <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <button onClick={() => setAiEnabled(v => !v)}
              className="flex-shrink-0 w-10 h-5 rounded-full transition-all relative"
              style={{ background: aiEnabled ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(139,92,246,0.15)' }}>
              <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                style={{ left: aiEnabled ? 'calc(100% - 18px)' : '2px' }} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">✨ Détection texte IA (Claude Vision)</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                Analyse chaque vidéo originale et recopie le texte. Plus lent mais plus précis.
              </p>
              {aiEnabled && !anthropicKey && (
                <p className="mt-1.5 text-[10px]" style={{ color: '#fbbf24' }}>
                  ⚠ Configure ta clé Anthropic dans Paramètres → Connexions
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Launch */}
        <div className="flex items-center gap-4">
          <Button onClick={launch} disabled={!canLaunch} size="lg">
            ⚡ Lancer {originals.length > 0 ? `${originals.length} remix` : 'la génération'}
          </Button>
          {!canLaunch && originals.length === 0 && (
            <p className="text-xs" style={{ color: 'rgba(196,181,253,0.35)' }}>
              Ajoute des vidéos originales et secondaires pour commencer
            </p>
          )}
        </div>
      </div>
    </>
  )
}
