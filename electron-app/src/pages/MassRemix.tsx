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

// Run tasks with at most `concurrency` running at the same time
async function pLimit<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

interface MassRemixProps { user: User }

type Preset = '9:16' | '1:1' | '16:9'
type ExportMode = 'bank' | 'folder'

interface PlannedPair {
  id:            number
  originalPath:  string
  secondaryPath: string
  cutSec?:       number
}

interface MassJob extends PlannedPair {
  status: 'pending' | 'detecting' | 'analyzing' | 'generating' | 'uploading' | 'done' | 'error'
  splitTime?: number
  error?:     string
  outputPath?: string
  logs:       string[]
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
// localvideo:// custom protocol registered in Electron main (supports byte-range / seeking).
// If the path is already an HTTP/blob URL (e.g. Supabase signed URL), use it directly.
function toFileUrl(p: string) {
  if (/^(https?|blob):/.test(p)) return p
  return 'localvideo://' + (p.startsWith('/') ? '' : '/') + p.replace(/\\/g, '/')
}
function formatSec(s: number) { const m = Math.floor(s / 60); return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}` }

function xAlignToExpr(align: string): string {
  if (align === 'right') return 'w*0.96-text_w'
  if (align === 'left')  return 'w*0.04'
  return '(w-text_w)/2'
}

// Split text into lines that fit within frameW at the given fontSize.
// Returns at least one element.
function wrapText(text: string, fontSize: number, frameW = 1080): string[] {
  // Use 80% of frame width with a conservative char-width multiplier (bold fonts are wide)
  const charsPerLine = Math.max(1, Math.floor((frameW * 0.80) / (fontSize * 0.62)))
  if (text.length <= charsPerLine) return [text]
  const words = text.split(' ')
  if (words.length === 1) {
    // Single long word: force-split at character limit
    const out: string[] = []
    for (let i = 0; i < text.length; i += charsPerLine) out.push(text.slice(i, i + charsPerLine))
    return out
  }
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= charsPerLine) { cur = next }
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text]
}

function VideoListPanel({
  label, paths, accent, loading, onAddBank, onAddPC, onAddFolder, onRemove,
}: {
  label: string; paths: string[]; accent: string; loading?: boolean
  onAddBank: () => void; onAddPC: () => void; onAddFolder: () => void; onRemove: (i: number) => void
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
        <button onClick={onAddFolder}
          className="flex-1 rounded-xl py-2 text-[12px] font-semibold transition-all hover:brightness-110"
          style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
          📁 Dossier
        </button>
        <button onClick={onAddPC}
          className="flex-1 rounded-xl py-2 text-[12px] font-semibold transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>
          💾 PC
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-2 flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <svg className="animate-spin w-4 h-4 flex-shrink-0" style={{ color: '#a78bfa' }} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
          </svg>
          <p className="text-[12px] font-semibold" style={{ color: '#a78bfa' }}>Ajout du dossier en cours…</p>
        </div>
      )}
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

  // Folder quick-pick for originals/secondaries
  const [folderTarget,   setFolderTarget]  = useState<'orig' | 'sec' | null>(null)
  const [folderList,     setFolderList]    = useState<{ name: string; count: number }[]>([])
  const [folderLoading,  setFolderLoading] = useState(false)
  const [addingFolder,   setAddingFolder]  = useState<string | null>(null)
  const [addingTarget,   setAddingTarget]  = useState<'orig' | 'sec' | null>(null)

  const [splitMode,      setSplitMode]      = useState<'auto' | 'manual'>('auto')
  const [manualSplitSec, setManualSplitSec] = useState<string>('3')

  // Preview plan state
  const [plannedPairs,   setPlannedPairs]   = useState<PlannedPair[]>([])
  const [previewOpen,    setPreviewOpen]    = useState(false)
  const [selectedPairId, setSelectedPairId] = useState<number | null>(null)
  const [vidCurrentTime, setVidCurrentTime] = useState(0)
  const [vidDuration,    setVidDuration]    = useState(0)
  const vidRef       = useRef<HTMLVideoElement>(null)
  const timelineRef  = useRef<HTMLDivElement>(null)
  const draggingRef2 = useRef(false)

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

  async function openFolderPick(target: 'orig' | 'sec') {
    setFolderLoading(true)
    setFolderTarget(target)
    let q = supabase.from('content_bank').select('folder')
    q = currentOrg ? (q as any).eq('org_id', currentOrg.id) : (q as any).eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const f = (row as { folder?: string | null }).folder
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1)
    }
    setFolderList([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })))
    setFolderLoading(false)
  }

  async function addFolderVideos(folderName: string) {
    const target = folderTarget
    setFolderTarget(null)
    setAddingFolder(folderName)
    setAddingTarget(target)
    try {
      let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
      q = currentOrg
        ? (q as any).eq('org_id', currentOrg.id).eq('folder', folderName)
        : (q as any).eq('user_id', user.id).is('org_id', null).eq('folder', folderName)
      const { data } = await q
      const items = (data ?? []) as Array<{ storage_path: string | null; file_url: string | null }>
      if (!items.length) return
      const { resolveContentToLocalPath } = await import('@/lib/storage')
      const paths: string[] = []
      for (const item of items) {
        if (!item.storage_path && !item.file_url) continue
        try { paths.push(await resolveContentToLocalPath(item)) } catch { /* skip */ }
      }
      if (!paths.length) return
      if (target === 'orig') setOriginals(prev => [...prev, ...paths.filter(p => !prev.includes(p))])
      else                   setSecondaries(prev => [...prev, ...paths.filter(p => !prev.includes(p))])
    } finally {
      setAddingFolder(null)
      setAddingTarget(null)
    }
  }

  function openPreview() {
    const n = Math.max(1, copies)
    const pairs: PlannedPair[] = Array.from({ length: n }, (_, i) => ({
      id: i,
      originalPath:  originals[Math.floor(Math.random() * originals.length)],
      secondaryPath: secondaries[Math.floor(Math.random() * secondaries.length)],
    }))
    setPlannedPairs(pairs)
    setSelectedPairId(pairs.length > 0 ? 0 : null)
    setVidCurrentTime(0)
    setVidDuration(0)
    setPreviewOpen(true)
  }

  function setCutForPair(id: number, sec: number | undefined) {
    setPlannedPairs(prev => prev.map(p => p.id === id ? { ...p, cutSec: sec } : p))
  }

  async function launch(prePlanned?: PlannedPair[]) {
    if (!originals.length || !secondaries.length) return
    if (exportMode === 'folder' && !outputFolder) {
      const f = await window.electronAPI?.pickOutputFolder?.()
      if (!f) return
      setOutputFolder(f)
    }

    const folder = exportMode === 'folder' ? outputFolder : null
    const n = Math.max(1, copies)
    const basePairs = prePlanned ?? Array.from({ length: n }, (_, i) => ({
      id: i,
      originalPath:  originals[Math.floor(Math.random() * originals.length)],
      secondaryPath: secondaries[Math.floor(Math.random() * secondaries.length)],
    } as PlannedPair))
    const pairs: MassJob[] = basePairs.map((p, i) => ({
      id: i,
      originalPath:  p.originalPath,
      secondaryPath: p.secondaryPath,
      cutSec:        p.cutSec,
      status: 'pending' as const,
      logs: [],
    }))
    setJobs(pairs)
    setRunning(true)
    abortRef.current = false

    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }

    await pLimit(pairs.map(job => async () => {
      if (abortRef.current) return

      try {
        updateJob(job.id, { status: 'detecting' })
        addLog(job.id, `▶ Vidéo originale : ${fileName(job.originalPath)}`)
        addLog(job.id, `▶ Vidéo secondaire: ${fileName(job.secondaryPath)}`)

        // ── 1. Detect / set split time ───────────────────────────────────────
        let splitTime: number | undefined
        let detDuration: number | undefined

        if (job.cutSec != null) {
          splitTime = job.cutSec
          addLog(job.id, `✂️ Coupe personnalisée (aperçu): ${splitTime}s`)
        } else if (splitMode === 'manual') {
          const manualSt = parseFloat(manualSplitSec)
          splitTime = (!isNaN(manualSt) && manualSt > 0) ? manualSt : undefined
          addLog(job.id, `✂️ Coupe manuelle: ${splitTime != null ? splitTime + 's' : 'désactivée'}`)
        } else {
          addLog(job.id, '🔍 Détection scène…')
          const det = await withTimeout(
            window.electronAPI!.detectSceneChange!({ filePath: job.originalPath }),
            60_000, 'détection scène'
          )
          if (!det.ok) addLog(job.id, `❌ Détection échouée: ${det.error ?? 'inconnu'}`)

          detDuration = det.duration
          splitTime = det.ok && det.splitTime != null
            ? Math.min((det.duration ?? 60) - 0.1, Math.round(det.splitTime * 1000) / 1000)
            : undefined

          addLog(job.id, det.ok
            ? `✅ Scène: splitTime=${splitTime != null ? splitTime + 's' : 'non trouvé'}, durée=${det.duration ?? '?'}s`
            : `⚠️ Pas de scène détectée — concat désactivé`)

          // Vérif. personne + décor — BLOQUANT : si même personne ET même décor → annuler le cut
          if (splitTime != null && anthropicKey.trim()) {
            try {
              const totalDur = det.duration ?? 60
              const phase2Start = Math.min(splitTime + 0.5, totalDur - 0.5)
              addLog(job.id, `🤖 Vérif. personne/décor (cut à ${splitTime}s)…`)
              const [fr1, fr2] = await Promise.all([
                withTimeout(
                  window.electronAPI!.extractFrames!({ filePath: job.originalPath, startTime: 0.5, endTime: 1.5 }),
                  20_000, 'frame debut'
                ),
                withTimeout(
                  window.electronAPI!.extractFrames!({ filePath: job.originalPath, startTime: phase2Start, endTime: Math.min(phase2Start + 1, totalDur) }),
                  20_000, 'frame phase2'
                ),
              ])
              if (fr1.ok && fr1.frames?.[0] && fr2.ok && fr2.frames?.[0]) {
                const res = await withTimeout(
                  window.electronAPI!.anthropicVisionRequest!({
                    apiKey: anthropicKey.trim(), model: 'claude-haiku-4-5-20251001',
                    messages: [{ role: 'user', content: [
                      { type: 'text', text: 'These are two frames from a video: frame 1 (before cut) and frame 2 (after cut).' },
                      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fr1.frames[0].data } },
                      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fr2.frames[0].data } },
                      { type: 'text', text: 'Are the SAME person AND the SAME background/location/decor present in both frames (even with a slightly different angle or quick cut)? Answer ONLY "yes" or "no".' },
                    ]}],
                    maxTokens: 5,
                  }),
                  20_000, 'AI décor'
                )
                if (res.ok) {
                  const answer = ((res.data as any)?.content?.[0]?.text ?? '').toLowerCase().trim()
                  if (answer.startsWith('yes')) {
                    addLog(job.id, '⚠️ Même personne/décor détecté → coupe annulée')
                    splitTime = undefined
                  } else {
                    addLog(job.id, '✅ Changement de scène confirmé → coupe maintenue')
                  }
                }
              }
            } catch (e) {
              addLog(job.id, `⚠️ Vérif. décor ignorée: ${String(e).slice(0, 60)}`)
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
          const analyzeEnd = splitTime ?? detDuration ?? 30
          const fr = await withTimeout(
            window.electronAPI!.extractFrames!({ filePath: job.originalPath, endTime: analyzeEnd }),
            180_000, 'extraction frames'
          )
          if (fr.ok && fr.frames?.length) {
            addLog(job.id, `   ${fr.frames.length} frames extraites (jusqu'à ${analyzeEnd.toFixed(1)}s)`)
            const interval = analyzeEnd / fr.frames.length
            const imageBlocks = fr.frames.flatMap((f, fi) => [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } },
              { type: 'text', text: `[Frame ${fi} — t=${f.timestamp}s]` },
            ])
            const prompt = `These are ${fr.frames.length} frames from a ${analyzeEnd.toFixed(1)}s vertical video (1080×1920).
Your job: identify EVERY burned-in text overlay visible anywhere in the frames (titles, captions, subtitles, watermarks, stickers, any readable text). Do NOT skip any text, even partial.

For EACH text overlay return a JSON object:
{"text":"exact string","xAlign":"left"|"center"|"right","yPercent":0-100,"fontSizePx":number,"fontColor":"white"|"black"|"#rrggbb","bold":true|false,"startFrame":0,"endFrame":${fr.frames.length - 1}}

Position (yPercent): 0=top edge, 100=bottom edge. Be precise — match where text actually appears.
- Text clearly in top area → 5-25
- Text clearly in bottom area → 70-92
- Text in middle → 40-60 (only if it truly is centered)

Font size (fontSizePx): size of the text AS IT APPEARS in a 1080px wide frame.
- Very large heading → 80-150px
- Normal caption → 50-80px
- Small subtitle → 36-55px

startFrame/endFrame: first and last frame index where this text is visible.

Return ONLY a valid JSON array, no explanation. Empty array [] if truly no text.`

            const res = await withTimeout(
              window.electronAPI!.anthropicVisionRequest!({
                apiKey: anthropicKey.trim(), model: 'claude-haiku-4-5-20251001',
                messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
                maxTokens: 2000,
              }),
              90_000, 'AI analyse texte'
            )
            if (res.ok) {
              const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? '[]'
              const m = txt.match(/\[[\s\S]*\]/)
              if (m) {
                const parsed = JSON.parse(m[0]) as Array<{ text: string; xAlign: string; yPercent: number; fontSizePx: number; fontColor: string; bold?: boolean; startFrame: number; endFrame: number }>
                const frameCount = fr.frames!.length
                const outH = preset === '9:16' ? 1920 : 1080
                const outW = preset === '16:9' ? 1920 : 1080

                parsed.forEach(item => {
                  // Font size: slightly larger than AI suggests, capped reasonably
                  const fontSize = Math.round(Math.max(44, Math.min(160, (item.fontSizePx ?? 64) * 1.15)))

                  // Position: top (5-12%) or bottom (72-82%) to avoid face zone (15-70%)
                  const rawY = (item.yPercent ?? 50) / 100
                  let yFrac: number
                  if (rawY < 0.20)      yFrac = Math.max(0.05, Math.min(0.12, rawY))        // top zone
                  else if (rawY > 0.70) yFrac = Math.min(0.82, Math.max(0.72, rawY))        // bottom zone
                  else                  yFrac = 0.76                                          // center → snap to bottom

                  // Timing
                  const sf = item.startFrame ?? 0
                  const ef = item.endFrame   ?? frameCount - 1
                  const coversAll = (ef - sf + 1) >= frameCount * 0.8
                  const startTime = coversAll ? 0 : Math.round(sf * interval * 10) / 10
                  const endTime   = coversAll
                    ? analyzeEnd
                    : Math.min(analyzeEnd, Math.max(startTime + interval * 2, Math.round((ef + 1) * interval * 10) / 10))

                  // Word-wrap: split into lines, create one overlay per line
                  const lines = wrapText(item.text, fontSize, outW)
                  const lineStepFrac = (fontSize * 1.45) / outH

                  lines.forEach((line, li) => {
                    const lineYFrac = Math.min(0.95, yFrac + li * lineStepFrac)
                    textOverlays.push({
                      text: line,
                      x: xAlignToExpr(item.xAlign ?? 'center'),
                      y: `h*${lineYFrac.toFixed(4)}-${Math.round(fontSize / 2)}`,
                      fontSize,
                      fontColor: item.fontColor ?? 'white',
                      bold: item.bold ?? true,
                      shadow: true,
                      startTime,
                      endTime,
                    })
                  })
                })
                addLog(job.id, `   ${parsed.length} texte(s) → ${textOverlays.length} overlay(s): ${textOverlays.map(o => `"${o.text}"@${o.fontSize}px`).join(', ')}`)
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

        // Trim output to original video duration so secondary doesn't run long
        const targetDuration = detDuration ?? undefined

        const gen = await withTimeout(
          window.electronAPI!.runFfmpegRemixAI!({
            newPhase1Path: job.secondaryPath,
            originalPath:  job.originalPath,
            splitTime, outputPath, preset,
            textOverlays,
            targetDuration,
          }),
          360_000, 'FFmpeg'
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
    }), 2)

    setRunning(false)
  }

  const doneCount  = jobs.filter(j => j.status === 'done').length
  const errorCount = jobs.filter(j => j.status === 'error').length
  const canLaunch  = originals.length > 0 && secondaries.length > 0 && !running
  const progress   = jobs.length > 0 ? Math.round((doneCount + errorCount) / jobs.length * 100) : 0

  const runningCount = jobs.filter(j => j.status !== 'pending' && j.status !== 'done' && j.status !== 'error').length
  const selectedPair = plannedPairs.find(p => p.id === selectedPairId) ?? null

  return (
    <>
      {/* ── Preview plan modal ── */}
      {previewOpen && !running && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(3,1,8,0.97)' }}>
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-8 py-4"
            style={{ borderBottom: '1px solid rgba(139,92,246,0.2)', background: 'rgba(12,8,28,0.9)' }}>
            <div>
              <p className="text-[18px] font-black text-white">Plan des remixes</p>
              <p className="text-[12px]" style={{ color: 'rgba(148,163,184,0.6)' }}>{plannedPairs.length} paires · Cliquez pour prévisualiser et régler le point de coupe</p>
            </div>
            {/* Global default cut (used for pairs with no per-pair override when mode=manual) */}
            {splitMode === 'manual' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <span className="text-[12px]" style={{ color: '#eab308' }}>✂ Défaut</span>
                <input type="number" min={0.1} step={0.1} value={manualSplitSec}
                  onChange={e => setManualSplitSec(e.target.value)}
                  className="w-16 rounded-lg px-2 py-1 text-[13px] font-bold text-center focus:outline-none"
                  style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', color: '#eab308' }} />
                <span className="text-[11px]" style={{ color: 'rgba(234,179,8,0.6)' }}>sec (paires sans coupe)</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={() => setPreviewOpen(false)}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
                ✕ Fermer
              </button>
              <button
                onClick={() => { setPreviewOpen(false); launch(plannedPairs) }}
                className="px-6 py-2.5 rounded-xl text-[14px] font-bold transition-all"
                style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}>
                ⚡ Lancer {plannedPairs.length} remix
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Left: pair list */}
            <div className="w-64 flex-shrink-0 overflow-y-auto" style={{ borderRight: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.7)' }}>
              {plannedPairs.map(pair => (
                <button key={pair.id}
                  onClick={() => { setSelectedPairId(pair.id); setVidCurrentTime(0); setVidDuration(0) }}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 transition-all"
                  style={{
                    borderBottom: '1px solid rgba(139,92,246,0.07)',
                    borderLeft: selectedPairId === pair.id ? '3px solid #7c3aed' : '3px solid transparent',
                    background: selectedPairId === pair.id ? 'rgba(139,92,246,0.12)' : 'transparent',
                  }}>
                  <span className="text-[11px] font-black pt-0.5 flex-shrink-0" style={{ color: 'rgba(139,92,246,0.55)' }}>#{pair.id + 1}</span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-[11px] font-mono truncate" style={{ color: 'rgba(226,217,243,0.75)' }}>{fileName(pair.originalPath)}</p>
                    <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(236,72,153,0.6)' }}>{fileName(pair.secondaryPath)}</p>
                    {pair.cutSec != null
                      ? <p className="text-[10px] font-semibold" style={{ color: '#eab308' }}>✂ {pair.cutSec.toFixed(1)}s</p>
                      : <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.3)' }}>{splitMode === 'manual' ? `✂ ${manualSplitSec}s (global)` : '🤖 auto'}</p>
                    }
                  </div>
                </button>
              ))}
            </div>

            {/* Right: video player */}
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-5 p-8 overflow-y-auto">
              {selectedPair ? (
                <>
                  {/* Video */}
                  <div className="relative rounded-2xl overflow-hidden flex-shrink-0"
                    style={{
                      background: '#000',
                      maxHeight: 'calc(100vh - 300px)',
                      aspectRatio: preset === '9:16' ? '9/16' : preset === '1:1' ? '1/1' : '16/9',
                      maxWidth: preset === '9:16' ? 280 : '100%',
                    }}>
                    <video
                      ref={vidRef}
                      key={selectedPair.originalPath}
                      src={toFileUrl(selectedPair.originalPath)}
                      className="w-full h-full object-contain"
                      preload="auto"
                      muted
                      onTimeUpdate={() => setVidCurrentTime(vidRef.current?.currentTime ?? 0)}
                      onLoadedMetadata={() => setVidDuration(vidRef.current?.duration ?? 0)}
                      onClick={() => { const v = vidRef.current; if (v) v.paused ? v.play() : v.pause() }}
                      style={{ cursor: 'pointer', display: 'block' }}
                    />
                    {/* Cut line overlay on video */}
                    {selectedPair.cutSec != null && vidDuration > 0 && (
                      <div className="absolute top-0 bottom-0 pointer-events-none"
                        style={{ left: `${(selectedPair.cutSec / vidDuration) * 100}%`, width: 2, background: 'rgba(234,179,8,0.9)', boxShadow: '0 0 8px rgba(234,179,8,0.6)' }} />
                    )}
                    {/* Play hint */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                        <span className="text-white text-xl ml-1">▶</span>
                      </div>
                    </div>
                  </div>

                  {/* Timeline controls */}
                  <div className="w-full max-w-lg space-y-3 flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <button onClick={() => { const v = vidRef.current; if (v) v.paused ? v.play() : v.pause() }}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-[15px] flex-shrink-0"
                        style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
                        ▶
                      </button>
                      <span className="text-[12px] font-mono" style={{ color: 'rgba(148,163,184,0.6)' }}>
                        {formatSec(vidCurrentTime)} / {formatSec(vidDuration)}
                      </span>
                      {vidDuration > 0 && (
                        <button
                          onClick={() => {
                            const sec = Math.round(vidCurrentTime * 10) / 10
                            setCutForPair(selectedPair.id, sec)
                            vidRef.current?.pause()
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all hover:brightness-110"
                          style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' }}>
                          ✂ Couper ici
                        </button>
                      )}
                      {selectedPair.cutSec != null && (
                        <>
                          <span className="text-[12px] font-bold ml-auto" style={{ color: '#eab308' }}>✂ {selectedPair.cutSec.toFixed(1)}s</span>
                          <button onClick={() => setCutForPair(selectedPair.id, undefined)}
                            className="text-[11px] px-2 py-1 rounded-lg"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                            ✕ Effacer
                          </button>
                        </>
                      )}
                    </div>

                    <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.45)' }}>
                      Cliquez (ou glissez) sur la barre pour définir le point de coupe ✂
                    </p>

                    {/* Timeline bar */}
                    <div
                      ref={timelineRef}
                      className="relative h-10 rounded-xl select-none"
                      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', cursor: vidDuration > 0 ? 'crosshair' : 'default' }}
                      onMouseDown={e => {
                        if (!timelineRef.current || vidDuration <= 0) return
                        draggingRef2.current = true
                        const rect = timelineRef.current.getBoundingClientRect()
                        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        const sec = Math.round(frac * vidDuration * 10) / 10
                        setCutForPair(selectedPair.id, sec)
                        if (vidRef.current) vidRef.current.currentTime = sec
                      }}
                      onMouseMove={e => {
                        if (!draggingRef2.current || !timelineRef.current || vidDuration <= 0) return
                        const rect = timelineRef.current.getBoundingClientRect()
                        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        const sec = Math.round(frac * vidDuration * 10) / 10
                        setCutForPair(selectedPair.id, sec)
                        if (vidRef.current) vidRef.current.currentTime = sec
                      }}
                      onMouseUp={() => { draggingRef2.current = false }}
                      onMouseLeave={() => { draggingRef2.current = false }}>
                      {/* Playback fill */}
                      {vidDuration > 0 && (
                        <div className="absolute top-0 bottom-0 left-0 rounded-xl pointer-events-none"
                          style={{ width: `${(vidCurrentTime / vidDuration) * 100}%`, background: 'rgba(139,92,246,0.3)' }} />
                      )}
                      {/* Cut marker */}
                      {selectedPair.cutSec != null && vidDuration > 0 && (
                        <div className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                          style={{ left: `${(selectedPair.cutSec / vidDuration) * 100}%`, transform: 'translateX(-1px)' }}>
                          <div style={{ width: 3, height: '100%', background: '#eab308', borderRadius: 2, boxShadow: '0 0 8px rgba(234,179,8,0.6)' }} />
                          <div className="absolute -top-7 whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ color: '#000', background: '#eab308', transform: 'translateX(-50%)' }}>
                            ✂ {selectedPair.cutSec.toFixed(1)}s
                          </div>
                        </div>
                      )}
                      {/* Time labels */}
                      {vidDuration > 0 && (
                        <div className="absolute inset-x-2 inset-y-0 flex items-center justify-between pointer-events-none">
                          {[0, 0.25, 0.5, 0.75, 1].map(f => (
                            <span key={f} className="text-[9px]" style={{ color: 'rgba(148,163,184,0.35)' }}>
                              {formatSec(f * vidDuration)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {!vidDuration && (
                      <p className="text-[11px] text-center" style={{ color: 'rgba(148,163,184,0.3)' }}>
                        Chargement de la vidéo…
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center space-y-3 opacity-40">
                  <div className="text-6xl">🎬</div>
                  <p className="text-[14px]" style={{ color: 'rgba(196,181,253,0.6)' }}>Sélectionnez un remix pour le prévisualiser</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Folder quick-pick modal */}
      {folderTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setFolderTarget(null)}>
          <div className="rounded-2xl overflow-hidden w-80" onClick={e => e.stopPropagation()}
            style={{ background: '#0d0a1e', border: '1px solid rgba(139,92,246,0.25)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
              <p className="text-[14px] font-bold text-white">
                📁 {folderTarget === 'orig' ? 'Dossier — Originales' : 'Dossier — Phase 1'}
              </p>
              <button onClick={() => setFolderTarget(null)} className="text-text2 hover:text-white text-lg leading-none">✕</button>
            </div>
            {folderLoading ? (
              <div className="py-10 text-center text-text2 text-[13px]">Chargement…</div>
            ) : folderList.length === 0 ? (
              <div className="py-10 text-center text-text2 text-[13px]">Aucun dossier dans la banque</div>
            ) : (
              <div className="max-h-80 overflow-y-auto py-2">
                {folderList.map(f => (
                  <button key={f.name} onClick={() => addFolderVideos(f.name)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-white/[0.03]"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[18px]">📂</span>
                    <span className="flex-1 text-[13px] font-semibold text-white truncate">{f.name}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                      {f.count} vid.
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="h-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-10 pt-9 pb-6 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-[28px] font-black text-white leading-none">Mass Remix</h1>
            <p className="text-[13px] text-text2 mt-1">Génère des remixes vidéo en masse avec FFmpeg + IA</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openPreview} disabled={!canLaunch}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-bold transition-all disabled:opacity-40"
              style={{ background: canLaunch ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: canLaunch ? '#a78bfa' : 'rgba(255,255,255,0.2)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <span>👁</span>
              <span>Plan</span>
            </button>
            <button
              onClick={() => launch()} disabled={!canLaunch}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-[14px] font-bold transition-all disabled:opacity-40"
              style={{ background: canLaunch ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.06)', color: '#fff', boxShadow: canLaunch ? '0 4px 20px rgba(124,58,237,0.4)' : 'none' }}>
              <span>⚡</span>
              <span>Lancer {copies} remix</span>
            </button>
          </div>
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
                loading={addingTarget === 'orig'}
                onAddBank={() => setShowBankOrig(true)}
                onAddFolder={() => openFolderPick('orig')}
                onAddPC={async () => { const p = await pickPC(false); setOriginals(prev => [...prev, ...p]) }}
                onRemove={i => setOriginals(prev => prev.filter((_, j) => j !== i))}
              />
            </div>
            <div className="flex-1 min-h-0 rounded-2xl p-6" style={{ background: 'rgba(236,72,153,0.04)', border: '1px solid rgba(236,72,153,0.15)' }}>
              <VideoListPanel
                label="Nouvelles Phase 1"
                paths={secondaries}
                accent="#ec4899"
                loading={addingTarget === 'sec'}
                onAddBank={() => setShowBankSec(true)}
                onAddFolder={() => openFolderPick('sec')}
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

            {/* Split mode */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.5)' }}>Point de coupe Phase 2</p>
              <div className="flex gap-2">
                <button onClick={() => setSplitMode('auto')}
                  className="flex-1 py-2 rounded-xl text-[13px] font-bold transition-all"
                  style={splitMode === 'auto'
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 10px rgba(124,58,237,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }
                  }>🤖 Auto</button>
                <button
                  onClick={() => { setSplitMode('manual'); if (canLaunch) openPreview() }}
                  className="flex-1 py-2 rounded-xl text-[13px] font-bold transition-all"
                  style={splitMode === 'manual'
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 10px rgba(124,58,237,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }
                  }>✂️ Manuel</button>
              </div>
              {splitMode === 'manual'
                ? <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.45)' }}>
                    Définissez le point de coupe par vidéo dans l'aperçu.
                  </p>
                : <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.45)' }}>
                    Détecte automatiquement la scène de changement.
                  </p>
              }
            </div>

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
