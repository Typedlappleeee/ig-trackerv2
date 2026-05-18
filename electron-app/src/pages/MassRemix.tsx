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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${label} (${ms / 1000}s)`)), ms)
    ),
  ])
}

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
  logs:         string[]
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
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-5 rounded-full flex-shrink-0" style={{ background: accent }} />
          <p className="text-[14px] font-bold text-white">{label}</p>
        </div>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${accent}20`, color: accent }}>
          {paths.length} vidéo{paths.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex gap-2 mb-3 flex-shrink-0">
        <button onClick={onAddBank}
          className="flex-1 rounded-xl py-2 text-[12px] font-semibold transition-all hover:brightness-110"
          style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}28` }}>
          🗂 Banque
        </button>
        <button onClick={onAddPC}
          className="flex-1 rounded-xl py-2 text-[12px] font-semibold transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>
          💾 PC
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {paths.length === 0 ? (
          <div className="h-full flex items-center justify-center rounded-xl text-[12px]"
            style={{ border: `1px dashed ${accent}20`, color: 'rgba(196,181,253,0.3)', minHeight: 72 }}>
            Aucune vidéo ajoutée
          </div>
        ) : paths.map((p, i) => (
          <div key={i} className="group flex items-center gap-2.5 rounded-xl px-3 py-2"
            style={{ background: `${accent}07`, border: `1px solid ${accent}15` }}>
            <span className="text-[11px] font-black w-4 text-center flex-shrink-0 opacity-50"
              style={{ color: accent }}>{i + 1}</span>
            <span className="text-[12px] font-mono truncate flex-1" style={{ color: 'rgba(226,217,243,0.6)' }}>{fileName(p)}</span>
            <button onClick={() => onRemove(i)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-danger/60 hover:text-danger">✕</button>
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
  const [bankFolder,   setBankFolder]   = useState<string>('')
  const [bankFolders,  setBankFolders]  = useState<string[]>([])
  const [copies,       setCopies]       = useState(1)

  const [showBankOrig, setShowBankOrig] = useState(false)
  const [showBankSec,  setShowBankSec]  = useState(false)

  // anthropic key from DB (connections), fallback to localStorage
  const anthropicKey = conns.anthropic || localStorage.getItem('sf_anthropic_key') || ''

  const [jobs,        setJobs]        = useState<MassJob[]>([])
  const [running,     setRunning]     = useState(false)
  const abortRef = useRef(false)

  // Load existing bank folders for the folder selector
  useEffect(() => {
    let q = supabase.from('content_bank').select('folder')
    q = currentOrg ? (q as any).eq('org_id', currentOrg.id) : (q as any).eq('user_id', user.id).is('org_id', null)
    q.then(({ data }: { data: Array<{ folder?: string | null }> | null }) => {
      const folders = [...new Set((data ?? []).map(r => r.folder).filter((f): f is string => Boolean(f)))].sort()
      setBankFolders(folders)
    })
  }, [currentOrg?.id])

  // Abort generation when component unmounts (user navigates away)
  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  function updateJob(id: number, patch: Partial<MassJob>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }
  function addLog(id: number, line: string) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, logs: [...j.logs, line] } : j))
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
    const n = Math.max(1, copies)
    const pairs: MassJob[] = Array.from({ length: n }, (_, i) => ({
      id: i,
      originalPath:  originals[Math.floor(Math.random() * originals.length)],
      secondaryPath: secondaries[Math.floor(Math.random() * secondaries.length)],
      status: 'pending' as const,
      logs: [],
    }))
    setJobs(pairs)
    setRunning(true)
    abortRef.current = false

    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }

    await Promise.all(pairs.map(async (job) => {
      if (abortRef.current) return

      try {
        // ── 1. Detect split ──────────────────────────────────────────────────
        updateJob(job.id, { status: 'detecting' })
        addLog(job.id, `▶ Vidéo originale : ${fileName(job.originalPath)}`)
        addLog(job.id, `▶ Vidéo secondaire: ${fileName(job.secondaryPath)}`)
        addLog(job.id, '🔍 Détection scène…')

        const det = await withTimeout(
          window.electronAPI!.detectSceneChange!({ filePath: job.originalPath }),
          30_000, 'détection scène'
        )

        if (!det.ok) {
          addLog(job.id, `❌ Détection échouée: ${det.error ?? 'inconnu'}`)
        }

        let splitTime = det.ok && det.splitTime != null
          ? Math.min((det.duration ?? 60) - 0.1, Math.round(det.splitTime * 1000) / 1000)
          : undefined

        addLog(job.id, det.ok
          ? `✅ Scène: splitTime=${splitTime != null ? splitTime + 's' : 'non trouvé'}, durée=${det.duration ?? '?'}s`
          : `⚠️ Pas de scène détectée — concat désactivé`)

        // Check phase 2 isn't still a person
        if (splitTime != null && anthropicKey.trim()) {
          const totalDur = det.duration ?? 60
          const phase2Mid = Math.min(splitTime + 2, totalDur - 0.5)
          addLog(job.id, `🤖 Vérif. phase2 (t=${phase2Mid.toFixed(1)}s)…`)
          const fr2 = await withTimeout(
            window.electronAPI!.extractFrames!({
              filePath: job.originalPath,
              startTime: phase2Mid,
              endTime: Math.min(phase2Mid + 1, totalDur),
            }),
            15_000, 'frames phase2'
          )
          if (fr2.ok && fr2.frames?.[0]) {
            const res = await withTimeout(
              window.electronAPI!.anthropicVisionRequest!({
                apiKey: anthropicKey.trim(),
                model: 'claude-haiku-4-5-20251001',
                messages: [{ role: 'user', content: [
                  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fr2.frames[0].data } },
                  { type: 'text', text: 'Is there a person or human face clearly visible in this frame? Answer only "yes" or "no".' },
                ]}],
                maxTokens: 5,
              }),
              20_000, 'AI phase2'
            )
            if (res.ok) {
              const answer = ((res.data as any)?.content?.[0]?.text ?? '').toLowerCase()
              if (answer.includes('yes')) {
                addLog(job.id, '⚠️ Phase2 contient une personne → concat désactivé')
                splitTime = undefined
              } else {
                addLog(job.id, '✅ Phase2 OK (pas de personne)')
              }
            }
          }
        }

        updateJob(job.id, { splitTime: splitTime ?? 0 })

        // ── 2. AI text detection ─────────────────────────────────────────────
        type Overlay = { text: string; x: string; y: string; fontSize: number; fontColor: string; bold: boolean; shadow: boolean; startTime: number; endTime: number }
        let textOverlays: Overlay[] = []

        if (aiEnabled && anthropicKey.trim()) {
          updateJob(job.id, { status: 'analyzing' })
          addLog(job.id, '✨ Analyse texte IA…')
          const analyzeEnd = splitTime ?? (det.duration ?? 60)
          const fr = await withTimeout(
            window.electronAPI!.extractFrames!({ filePath: job.originalPath, endTime: analyzeEnd }),
            15_000, 'extraction frames'
          )
          if (fr.ok && fr.frames?.length) {
            addLog(job.id, `   ${fr.frames.length} frames extraites (jusqu'à ${analyzeEnd.toFixed(1)}s)`)
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
            const res = await withTimeout(
              window.electronAPI!.anthropicVisionRequest!({
                apiKey: anthropicKey.trim(), model: 'claude-haiku-4-5-20251001',
                messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
                maxTokens: 2000,
              }),
              30_000, 'AI analyse texte'
            )
            if (res.ok) {
              const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? '[]'
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
                addLog(job.id, `   ${textOverlays.length} overlay(s) détecté(s)`)
              }
            } else {
              addLog(job.id, `   Analyse IA échouée: ${(res as any).error ?? 'inconnu'}`)
            }
          } else {
            addLog(job.id, `   Extraction frames échouée: ${fr.ok ? 'aucune frame' : (fr as any).error ?? 'inconnu'}`)
          }
        }

        // ── 3. Generate ──────────────────────────────────────────────────────
        updateJob(job.id, { status: 'generating' })
        addLog(job.id, `⚙️ FFmpeg — splitTime=${splitTime != null ? splitTime + 's' : 'null'}, preset=${preset}, overlays=${textOverlays.length}`)

        const outName = `remix_${String(job.id + 1).padStart(3, '0')}.mp4`
        let outputPath: string
        if (folder) {
          outputPath = folder.replace(/\\/g, '/') + '/' + outName
        } else {
          const tmp = await window.electronAPI!.writeTempFile!({ name: outName, bytes: new ArrayBuffer(0) })
          if (!tmp.ok || !tmp.path) {
            addLog(job.id, '❌ Impossible de créer le fichier temporaire')
            updateJob(job.id, { status: 'error', error: 'Impossible de créer le fichier temp' })
            return
          }
          outputPath = tmp.path
        }

        const gen = await withTimeout(
          window.electronAPI!.runFfmpegRemixAI!({
            newPhase1Path: job.secondaryPath,
            originalPath:  job.originalPath,
            splitTime, outputPath, preset,
            textOverlays,
          }),
          40_000, 'FFmpeg'
        )

        if (gen.command) addLog(job.id, `   cmd: ${gen.command}`)

        if (!gen.ok) {
          addLog(job.id, `❌ FFmpeg: ${gen.error ?? 'erreur inconnue'}`)
          updateJob(job.id, { status: 'error', error: gen.error ?? 'Erreur FFmpeg' })
          playError()
          return
        }
        addLog(job.id, '✅ FFmpeg OK')
        updateJob(job.id, { outputPath: gen.outputPath ?? outputPath })

        // ── 4. Upload to bank if needed ──────────────────────────────────────
        if (exportMode === 'bank') {
          updateJob(job.id, { status: 'uploading' })
          addLog(job.id, '☁️ Upload banque…')
          const up = await withTimeout(
            uploadVideoFromPath(gen.outputPath ?? outputPath, scope),
            90_000, 'upload'
          )
          await supabase.from('content_bank').insert({
            user_id: user.id, org_id: currentOrg?.id ?? null,
            title: `Remix ${String(job.id + 1).padStart(3, '0')} — ${fileName(job.originalPath)}`,
            file_url: null, storage_path: up.storagePath, thumbnail_path: up.thumbnailPath,
            folder: bankFolder.trim() || null,
            tags: [], notes: '',
          })
          addLog(job.id, '✅ Upload OK')
        }

        updateJob(job.id, { status: 'done' })
        playSuccess()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addLog(job.id, `❌ Erreur fatale: ${msg}`)
        updateJob(job.id, { status: 'error', error: msg })
        playError()
      }
    }))

    setRunning(false)
  }

  const doneCount  = jobs.filter(j => j.status === 'done').length
  const errorCount = jobs.filter(j => j.status === 'error').length
  const canLaunch  = originals.length > 0 && secondaries.length > 0 && !running
  const progress   = jobs.length > 0 ? Math.round((doneCount + errorCount) / jobs.length * 100) : 0

  const runningCount = jobs.filter(j => j.status !== 'pending' && j.status !== 'done' && j.status !== 'error').length

  return (
    <>
      {/* ── Progress modal ── */}
      {running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(3,1,8,0.92)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'rgba(12,8,28,0.98)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 0 60px rgba(124,58,237,0.25)' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(139,92,246,0.15)', background: 'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(236,72,153,0.06))' }}>
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 flex-shrink-0">
                  <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                    <Spinner size="sm" />
                  </div>
                </div>
                <div>
                  <p className="text-[15px] font-black text-white">Génération en parallèle…</p>
                  <p className="text-[13px] text-text2">
                    {runningCount} en cours · {doneCount} terminée(s) · {errorCount} erreur(s)
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between text-[13px] mb-1">
                <span className="text-text2">{doneCount + errorCount} / {jobs.length}</span>
                <span className="font-bold" style={{ color: '#a78bfa' }}>{progress}%</span>
                <span className="text-text2">{runningCount} actives</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.12)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
              </div>

              <div className="space-y-1.5 max-h-52 overflow-auto">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                    style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.06)' : job.status === 'error' ? 'rgba(239,68,68,0.06)' : job.status === 'pending' ? 'transparent' : 'rgba(139,92,246,0.06)' }}>
                    <span className="w-5 text-[12px] font-bold flex-shrink-0 text-center text-text2">#{job.id + 1}</span>
                    <span className="flex-1 text-[12px] font-mono truncate text-text2">{fileName(job.originalPath)}</span>
                    <span className="text-[11px] font-semibold flex-shrink-0"
                      style={{ color: job.status === 'done' ? '#34d399' : job.status === 'error' ? '#f87171' : job.status === 'pending' ? 'rgba(196,181,253,0.3)' : '#a78bfa' }}>
                      {STATUS_LABEL[job.status]}
                    </span>
                  </div>
                ))}
              </div>

              <button onClick={() => { abortRef.current = true; setRunning(false) }}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold"
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
            <div className="px-6 py-6 space-y-5">
              <div className="text-center space-y-2">
                <div className="text-5xl">{errorCount === 0 ? '✅' : '⚠️'}</div>
                <p className="text-[20px] font-black text-white">
                  {errorCount === 0 ? 'Tous les remixes générés !' : `${doneCount} / ${jobs.length} terminés`}
                </p>
                {errorCount > 0 && <p className="text-[13px]" style={{ color: '#fbbf24' }}>{errorCount} erreur(s)</p>}
              </div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {jobs.map(job => (
                  <details key={job.id} className="rounded-xl overflow-hidden"
                    style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${job.status === 'done' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.2)'}` }}
                    open={job.status === 'error'}>
                    <summary className="flex items-center gap-3 px-4 py-2.5 cursor-pointer list-none">
                      <span className="text-base flex-shrink-0">{job.status === 'done' ? '✅' : '❌'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-mono truncate text-white/70">{fileName(job.originalPath)}</p>
                        {job.error && <p className="text-[11px] font-semibold" style={{ color: '#f87171' }}>{job.error}</p>}
                      </div>
                      {job.logs.length > 0 && (
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(196,181,253,0.4)' }}>▼ logs</span>
                      )}
                    </summary>
                    {job.logs.length > 0 && (
                      <div className="px-4 pb-3 space-y-0.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        {job.logs.map((line, i) => (
                          <p key={i} className="text-[10px] font-mono break-all leading-snug"
                            style={{ color: line.startsWith('❌') ? '#f87171' : line.startsWith('✅') ? '#34d399' : line.startsWith('⚠️') ? '#fbbf24' : 'rgba(196,181,253,0.55)' }}>
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </details>
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

      <div className="h-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-10 pt-9 pb-6 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-[28px] font-black text-white leading-none">Mass Remix</h1>
            <p className="text-[13px] text-text2 mt-1">Génère des remixes vidéo en masse avec FFmpeg + IA</p>
          </div>
          <button
            onClick={launch} disabled={!canLaunch}
            className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-[14px] font-bold transition-all disabled:opacity-40"
            style={{ background: canLaunch ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.06)', color: '#fff', boxShadow: canLaunch ? '0 4px 20px rgba(124,58,237,0.4)' : 'none' }}>
            <span>⚡</span>
            <span>Lancer {copies} remix</span>
          </button>
        </div>

        {/* Body — 2 columns */}
        <div className="flex-1 min-h-0 flex gap-6 px-10 py-8">

          {/* LEFT — video pickers */}
          <div className="flex-1 min-w-0 flex flex-col gap-5">
            <div className="flex-1 min-h-0 rounded-2xl p-6" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <VideoListPanel
                label="Vidéos originales"
                paths={originals}
                accent="#8b5cf6"
                onAddBank={() => setShowBankOrig(true)}
                onAddPC={async () => { const p = await pickPC(false); setOriginals(prev => [...prev, ...p]) }}
                onRemove={i => setOriginals(prev => prev.filter((_, j) => j !== i))}
              />
            </div>
            <div className="flex-1 min-h-0 rounded-2xl p-6" style={{ background: 'rgba(236,72,153,0.04)', border: '1px solid rgba(236,72,153,0.15)' }}>
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

          {/* RIGHT — settings panel */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-3">

            {/* Copies */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(148,163,184,0.5)' }}>Nombre de copies</p>
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => setCopies(c => Math.max(1, c - 1))}
                  className="w-8 h-8 rounded-xl text-[16px] font-black flex items-center justify-center transition-all hover:bg-white/[0.07]"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(196,181,253,0.7)' }}>−</button>
                <input type="number" min={1} max={200} value={copies}
                  onChange={e => setCopies(Math.max(1, Math.min(200, Number(e.target.value))))}
                  className="flex-1 py-1 text-[26px] font-black text-white text-center focus:outline-none"
                  style={{ background: 'transparent', border: 'none' }} />
                <button onClick={() => setCopies(c => Math.min(200, c + 1))}
                  className="w-8 h-8 rounded-xl text-[16px] font-black flex items-center justify-center transition-all hover:bg-white/[0.07]"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(196,181,253,0.7)' }}>+</button>
              </div>
              <input type="range" min={1} max={50} value={Math.min(copies, 50)}
                onChange={e => setCopies(Number(e.target.value))} className="w-full" />
              {originals.length > 0 && secondaries.length > 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: 'rgba(148,163,184,0.45)' }}>
                  🔀 {originals.length} orig × {secondaries.length} sec → <span style={{ color: '#a78bfa' }}>{copies} vidéos</span>
                </p>
              )}
            </div>

            {/* AI Detection — prominent, before format */}
            <button
              onClick={() => setAiEnabled(v => !v)}
              className="rounded-2xl p-4 text-left transition-all w-full"
              style={{
                background: aiEnabled ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${aiEnabled ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.07)'}`,
                boxShadow: aiEnabled ? '0 0 20px rgba(124,58,237,0.12)' : 'none',
              }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[16px]">✨</span>
                  <div>
                    <p className="text-[13px] font-bold leading-tight" style={{ color: aiEnabled ? '#c4b5fd' : 'rgba(196,181,253,0.6)' }}>
                      Détection texte IA
                    </p>
                    <p className="text-[11px] leading-tight" style={{ color: 'rgba(148,163,184,0.45)' }}>Claude Vision</p>
                  </div>
                </div>
                <div className="w-10 h-[22px] rounded-full relative flex-shrink-0 transition-all"
                  style={{ background: aiEnabled ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.1)' }}>
                  <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${aiEnabled ? 'translate-x-5' : 'translate-x-[3px]'}`} />
                </div>
              </div>
              {aiEnabled && (
                <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Analyse et recopie le texte des vidéos automatiquement.
                </p>
              )}
              {aiEnabled && !anthropicKey && (
                <p className="mt-1.5 text-[11px] font-semibold" style={{ color: '#fbbf24' }}>⚠ Clé Anthropic manquante</p>
              )}
            </button>

            {/* Format */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(148,163,184,0.5)' }}>Format de sortie</p>
              <div className="flex gap-2">
                {(['9:16', '1:1', '16:9'] as Preset[]).map(p => (
                  <button key={p} onClick={() => setPreset(p)}
                    className="flex-1 py-2 rounded-xl text-[13px] font-bold transition-all"
                    style={preset === p
                      ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 10px rgba(124,58,237,0.3)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }
                    }>{p}</button>
                ))}
              </div>
            </div>

            {/* Export */}
            <div className="rounded-2xl p-4 space-y-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.5)' }}>Destination</p>
              <div className="flex gap-2">
                {(['bank', 'folder'] as ExportMode[]).map(m => (
                  <button key={m} onClick={() => setExportMode(m)}
                    className="flex-1 py-2 rounded-xl text-[12px] font-bold transition-all"
                    style={exportMode === m
                      ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }
                    }>
                    {m === 'bank' ? '☁ Banque' : '💾 Dossier'}
                  </button>
                ))}
              </div>
              {exportMode === 'bank' && (
                <div className="space-y-2">
                  {bankFolders.length > 0 && (
                    <select
                      value={bankFolders.includes(bankFolder) ? bankFolder : ''}
                      onChange={e => setBankFolder(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2d9f3' }}>
                      <option value="" style={{ background: '#0c0919', color: '#e2d9f3' }}>— Racine (sans dossier)</option>
                      {bankFolders.map(f => <option key={f} value={f} style={{ background: '#0c0919', color: '#e2d9f3' }}>{f}</option>)}
                    </select>
                  )}
                  <input type="text"
                    placeholder={bankFolders.length > 0 ? 'Ou nouveau dossier…' : 'Dossier (optionnel)'}
                    value={bankFolder} onChange={e => setBankFolder(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none placeholder:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${bankFolder.trim() ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.09)'}`, color: '#e2d9f3' }} />
                </div>
              )}
              {exportMode === 'folder' && (
                <div className="space-y-2">
                  <button onClick={async () => { const f = await window.electronAPI?.pickOutputFolder?.(); if (f) setOutputFolder(f) }}
                    className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold"
                    style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                    📁 Choisir un dossier…
                  </button>
                  {outputFolder && <p className="text-[11px] font-mono truncate" style={{ color: 'rgba(148,163,184,0.45)' }}>{outputFolder}</p>}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
