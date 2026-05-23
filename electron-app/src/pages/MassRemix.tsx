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

// Word-overlap similarity: strip non-letter/digit chars (catches emoji vs ASCII variants),
// lowercase, then count shared words of length > 2 relative to the larger set.
function textSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2)
  )
  const wa = words(a), wb = words(b)
  if (wa.size === 0 && wb.size === 0) return 1
  const intersection = [...wa].filter(w => wb.has(w)).length
  return intersection / Math.max(wa.size, wb.size)
}

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
  const [aiEnabled,    setAiEnabled]    = useState(() => localStorage.getItem('sf_remix_ai') === '1')
  const [manualText,   setManualText]   = useState(() => localStorage.getItem('sf_remix_manual_text') ?? '')
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
  const [isPlaying,      setIsPlaying]      = useState(false)
  const [hoverTime,      setHoverTime]      = useState<number | null>(null)
  const [zoomHover,      setZoomHover]      = useState<number | null>(null)
  const [playbackRate,   setPlaybackRate]   = useState(1)
  const [beforeFrameUrl, setBeforeFrameUrl] = useState<string | null>(null)
  const [afterFrameUrl,  setAfterFrameUrl]  = useState<string | null>(null)
  const vidRef        = useRef<HTMLVideoElement>(null)
  const captureVidRef = useRef<HTMLVideoElement>(null)
  const timelineRef   = useRef<HTMLDivElement>(null)
  const draggingRef2  = useRef(false)
  const captureCanvas = useRef<HTMLCanvasElement | null>(null)

  // anthropic key from DB (connections), fallback to localStorage
  const anthropicKey = conns.anthropic || localStorage.getItem('sf_anthropic_key') || ''

  const [jobs,        setJobs]        = useState<MassJob[]>([])
  const [running,     setRunning]     = useState(false)
  const abortRef = useRef(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

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

  // Global mouseup so drag always ends even if cursor leaves the timeline div
  useEffect(() => {
    const up = () => { draggingRef2.current = false }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // Keyboard control for cut editor: ←→ frame step, Shift+←→ 0.1s, Space play/pause
  useEffect(() => {
    if (!previewOpen) return
    const FRAME = 1 / 30
    const onKey = (e: KeyboardEvent) => {
      const vid = vidRef.current
      if (!vid || vidDuration <= 0) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ') { e.preventDefault(); vid.paused ? vid.play() : vid.pause(); return }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      vid.pause()
      const step = e.shiftKey ? 0.1 : e.ctrlKey ? 1 : FRAME
      const newT = Math.max(0, Math.min(vidDuration, vid.currentTime + (e.key === 'ArrowRight' ? step : -step)))
      vid.currentTime = newT
      setVidCurrentTime(newT)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen, vidDuration])

  useEffect(() => {
    if (vidRef.current) vidRef.current.playbackRate = playbackRate
  }, [playbackRate])

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
    if (sec != null) captureBeforeAfter(sec)
    else { setBeforeFrameUrl(null); setAfterFrameUrl(null) }
  }

  function captureBeforeAfter(cutTime: number) {
    const vid = captureVidRef.current
    if (!vid || !vid.src) return
    if (!captureCanvas.current) captureCanvas.current = document.createElement('canvas')
    const canvas = captureCanvas.current
    const capFrame = (t: number): Promise<string> => new Promise(resolve => {
      const onSeeked = () => {
        canvas.width  = vid.videoWidth  || 360
        canvas.height = vid.videoHeight || 640
        canvas.getContext('2d')?.drawImage(vid, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      vid.addEventListener('seeked', onSeeked, { once: true })
      vid.currentTime = Math.max(0, t)
    })
    // Sequential seeks — parallel seeks race on currentTime and corrupt each other
    capFrame(Math.max(0, cutTime - 1 / 30))
      .then(url => { setBeforeFrameUrl(url); return capFrame(cutTime) })
      .then(setAfterFrameUrl)
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
          // Ignore detected splits that are too early (< 20% of duration, min 2s)
          // — those are false positives from minor brightness changes, not real scene cuts
          const minSplit = 2.0
          if (det.ok && det.splitTime != null && det.splitTime >= minSplit) {
            splitTime = Math.min((det.duration ?? 60) - 0.1, Math.round(det.splitTime * 1000) / 1000)
            addLog(job.id, `✅ Scène: splitTime=${splitTime}s, durée=${det.duration ?? '?'}s`)
          } else {
            splitTime = undefined
            addLog(job.id, det.ok && det.splitTime != null
              ? `⚠️ Scène trop tôt (${det.splitTime?.toFixed(1)}s < ${minSplit}s min) → secondaire uniquement`
              : `⚠️ Pas de scène détectée → secondaire uniquement`)
          }

          // Vérif. décor — si le BACKGROUND/LIEU est le même des 2 côtés du cut → annuler
          // On vérifie seulement le fond, pas la personne (plus fiable)
          if (splitTime != null && anthropicKey.trim()) {
            try {
              const totalDur = det.duration ?? 60
              const phase2Start = Math.min(splitTime + 0.5, totalDur - 0.5)
              addLog(job.id, `🤖 Vérif. décor (cut à ${splitTime}s)…`)
              const [fr1, fr2] = await Promise.all([
                withTimeout(window.electronAPI!.extractFrames!({ filePath: job.originalPath, startTime: 0.5, endTime: 1.5 }), 20_000, 'frame debut'),
                withTimeout(window.electronAPI!.extractFrames!({ filePath: job.originalPath, startTime: phase2Start, endTime: Math.min(phase2Start + 1, totalDur) }), 20_000, 'frame phase2'),
              ])
              if (fr1.ok && fr1.frames?.[0] && fr2.ok && fr2.frames?.[0]) {
                const res = await withTimeout(
                  window.electronAPI!.anthropicVisionRequest!({
                    apiKey: anthropicKey.trim(), model: 'claude-haiku-4-5-20251001',
                    messages: [{ role: 'user', content: [
                      { type: 'text', text: 'Frame 1 (before cut):' },
                      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fr1.frames[0].data } },
                      { type: 'text', text: 'Frame 2 (after cut):' },
                      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fr2.frames[0].data } },
                      { type: 'text', text: 'Is the BACKGROUND or LOCATION clearly DIFFERENT between these two frames? (Focus only on the environment/setting/room/outdoor scene — ignore the person.) Answer ONLY "yes" (clearly different background) or "no" (same or very similar background).' },
                    ]}],
                    maxTokens: 5,
                  }),
                  20_000, 'AI décor'
                )
                if (res.ok) {
                  const answer = ((res.data as any)?.content?.[0]?.text ?? '').toLowerCase().trim()
                  if (answer.startsWith('no')) {
                    addLog(job.id, '⚠️ Même décor → coupe annulée')
                    splitTime = undefined
                  } else {
                    addLog(job.id, '✅ Décor différent → coupe maintenue')
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
        if (aiEnabled && manualText.trim()) {
          const textEndTime = splitTime ?? (detDuration ?? 9999)
          textOverlays.push({
            text: manualText.trim(),
            x: '(w-text_w)/2',
            y: 'h*0.82-text_h/2',
            fontSize: 54,
            fontColor: 'white',
            bold: false,
            shadow: true,
            startTime: 0,
            endTime: textEndTime,
          })
          addLog(job.id, `✏️ Texte manuel: "${manualText.trim().slice(0, 60)}"`)
        } else if (aiEnabled && !manualText.trim() && anthropicKey.trim()) {
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
                const rawParsed = JSON.parse(m[0]) as Array<{ text: string; xAlign: string; yPercent: number; fontSizePx: number; fontColor: string; bold?: boolean; startFrame: number; endFrame: number }>
                const frameCount = fr.frames!.length
                const outH = preset === '9:16' ? 1920 : 1080
                const outW = preset === '16:9' ? 1920 : 1080

                // Deduplicate: merge entries whose text is ≥70% similar by word overlap
                // (catches emoji/ASCII variants like 🇺🇸 vs "us" for the same caption)
                const parsed = rawParsed.reduce((acc, item) => {
                  const existing = acc.find(e => textSimilarity(e.text, item.text) >= 0.70)
                  if (existing) {
                    existing.startFrame = Math.min(existing.startFrame ?? 0, item.startFrame ?? 0)
                    existing.endFrame   = Math.max(existing.endFrame   ?? frameCount - 1, item.endFrame ?? frameCount - 1)
                    // Keep the longer/richer text (with emoji etc.)
                    if (item.text.length > existing.text.length) existing.text = item.text
                  } else {
                    acc.push({ ...item })
                  }
                  return acc
                }, [] as typeof rawParsed)

                // ── Step 1: resolve timing + font for each item ────────────────
                type TItem = { text: string; xAlign: string; rawY: number; fontSize: number; fontColor: string; bold: boolean; startTime: number; endTime: number }
                const items: TItem[] = parsed.map(item => {
                  const fontSize = Math.round(Math.max(44, Math.min(160, (item.fontSizePx ?? 64) * 1.15)))
                  const sf = item.startFrame ?? 0
                  const ef = item.endFrame   ?? frameCount - 1
                  const coversAll = (ef - sf + 1) >= frameCount * 0.8
                  const startTime = coversAll ? 0 : Math.round(sf * interval * 10) / 10
                  const endTime   = splitTime ?? (detDuration ?? 9999)
                  return { text: item.text, xAlign: item.xAlign ?? 'center', rawY: (item.yPercent ?? 50) / 100, fontSize, fontColor: item.fontColor ?? 'white', bold: item.bold ?? true, startTime, endTime }
                })

                // ── Step 2: assign zones (top / bottom) to avoid face + overlaps ─
                // Always place text in the bottom zone regardless of its position
                // in the original — top placements on the secondary video look off.
                type Zone = 'top' | 'bottom'
                const zones: Zone[] = items.map(_ => 'bottom' as Zone)
                // Conflict resolution: if two temporally-concurrent items share a zone → flip the later one
                for (let i = 1; i < items.length; i++) {
                  for (let j = 0; j < i; j++) {
                    const overlap = items[j].endTime > items[i].startTime && items[j].startTime < items[i].endTime
                    if (overlap && zones[j] === zones[i]) zones[i] = zones[i] === 'bottom' ? 'top' : 'bottom'
                  }
                }

                // ── Step 3: generate per-line overlays inside their zone ──────────
                // Randomise position within safe bands: top [0.10–0.30], bottom [0.60–0.82]
                // Track baseY per item so concurrent stacking works correctly
                const baseYMap = new Map<number, number>()
                items.forEach((item, idx) => {
                  const zone   = zones[idx]
                  const lines  = wrapText(item.text, item.fontSize, outW)
                  const stepFr = (item.fontSize * 1.3) / outH

                  let baseY: number
                  if (zone === 'top') {
                    // Random position in top safe zone [0.10, 0.28]
                    const preferred = 0.10 + Math.random() * 0.18
                    const concurrentEnd = items
                      .slice(0, idx)
                      .filter((_, j) => zones[j] === 'top' && items[j].endTime > item.startTime && items[j].startTime < item.endTime)
                      .reduce((max, it) => {
                        const j = items.indexOf(it)
                        const b = baseYMap.get(j) ?? preferred
                        const n = wrapText(it.text, it.fontSize, outW).length
                        const s = (it.fontSize * 1.3) / outH
                        return Math.max(max, b + n * s)
                      }, preferred)
                    baseY = concurrentEnd
                  } else {
                    // Random position in bottom safe zone [0.62, 0.80]
                    const preferred = 0.72 + Math.random() * 0.10
                    const concurrentEnd = items
                      .slice(0, idx)
                      .filter((_, j) => zones[j] === 'bottom' && items[j].endTime > item.startTime && items[j].startTime < item.endTime)
                      .reduce((max, it) => {
                        const j = items.indexOf(it)
                        const b = baseYMap.get(j) ?? preferred
                        const n = wrapText(it.text, it.fontSize, outW).length
                        const s = (it.fontSize * 1.3) / outH
                        return Math.max(max, b + n * s)
                      }, preferred)
                    baseY = concurrentEnd
                  }
                  baseYMap.set(idx, baseY)

                  lines.forEach((line, li) => {
                    const lineYFrac = zone === 'top'
                      ? Math.min(0.35, baseY + li * stepFr)
                      : Math.min(0.87, baseY + li * stepFr)
                    textOverlays.push({
                      text: line,
                      x: '(w-text_w)/2',
                      y: `h*${lineYFrac.toFixed(4)}-${Math.round(item.fontSize / 2)}`,
                      fontSize: item.fontSize,
                      fontColor: item.fontColor,
                      bold: item.bold,
                      shadow: true,
                      startTime: item.startTime,
                      endTime:   item.endTime,
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
                      ? <p className="text-[10px] font-semibold" style={{ color: '#eab308' }}>{pair.cutSec.toFixed(1)}s</p>
                      : <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.3)' }}>{splitMode === 'manual' ? `${manualSplitSec}s (global)` : '🤖 auto'}</p>
                    }
                  </div>
                </button>
              ))}
            </div>

            {/* Right: video player */}
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-5 p-8 overflow-y-auto">
              {selectedPair ? (
                <>
                  {/* Hidden capture video (same source, seeks independently for frame preview) */}
                  <video
                    ref={captureVidRef}
                    key={'cap-' + selectedPair.originalPath}
                    src={toFileUrl(selectedPair.originalPath)}
                    preload="auto"
                    muted
                    style={{ display: 'none' }}
                  />

                  {/* ── Main video ── */}
                  <div className="relative rounded-2xl overflow-hidden flex-shrink-0"
                    style={{
                      background: '#000',
                      maxHeight: 'calc(100vh - 300px)',
                      aspectRatio: preset === '9:16' ? '9/16' : preset === '1:1' ? '1/1' : '16/9',
                      maxWidth: preset === '9:16' ? 220 : '100%',
                    }}>
                    <video
                      ref={vidRef}
                      key={selectedPair.originalPath}
                      src={toFileUrl(selectedPair.originalPath)}
                      className="w-full h-full object-contain"
                      preload="auto"
                      muted
                      onTimeUpdate={() => setVidCurrentTime(vidRef.current?.currentTime ?? 0)}
                      onLoadedMetadata={() => {
                        setVidDuration(vidRef.current?.duration ?? 0)
                        if (selectedPair.cutSec != null) captureBeforeAfter(selectedPair.cutSec)
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onClick={() => { const v = vidRef.current; if (v) v.paused ? v.play() : v.pause() }}
                      style={{ cursor: 'pointer', display: 'block' }}
                    />
                    {selectedPair.cutSec != null && vidDuration > 0 && (
                      <div className="absolute top-0 bottom-0 pointer-events-none"
                        style={{ left: `${(selectedPair.cutSec / vidDuration) * 100}%`, width: 2, background: '#eab308', boxShadow: '0 0 10px rgba(234,179,8,0.8)' }} />
                    )}
                  </div>

                  {/* ── Cut editor ── */}
                  <div className="w-full flex-shrink-0 space-y-2">

                    {/* ── Row 1: play controls ── */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Frame back */}
                      <button title="Reculer 1 image (←)" onClick={() => {
                        const v = vidRef.current; if (!v) return; v.pause()
                        const t = Math.max(0, v.currentTime - 1/30); v.currentTime = t; setVidCurrentTime(t)
                        if (selectedPair.cutSec != null) captureBeforeAfter(selectedPair.cutSec)
                      }} className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.7)', fontSize: 13 }}>◁</button>
                      {/* Play/pause */}
                      <button onClick={() => { const v = vidRef.current; if (v) v.paused ? v.play() : v.pause() }}
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa', fontSize: 16 }}>
                        {isPlaying ? '⏸' : '▶'}
                      </button>
                      {/* Frame forward */}
                      <button title="Avancer 1 image (→)" onClick={() => {
                        const v = vidRef.current; if (!v) return; v.pause()
                        const t = Math.min(vidDuration, v.currentTime + 1/30); v.currentTime = t; setVidCurrentTime(t)
                        if (selectedPair.cutSec != null) captureBeforeAfter(selectedPair.cutSec)
                      }} className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.7)', fontSize: 13 }}>▷</button>

                      {/* Speed control */}
                      <div className="flex items-center gap-0.5 ml-1">
                        {([0.25, 0.5, 1] as const).map(r => (
                          <button key={r} onClick={() => { setPlaybackRate(r); if (vidRef.current) vidRef.current.playbackRate = r }}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all"
                            style={playbackRate === r
                              ? { background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.6)', color: '#c4b5fd' }
                              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.45)' }}>
                            {r === 1 ? '1×' : `${r}×`}
                          </button>
                        ))}
                      </div>

                      <span className="text-[11px] font-mono tabular-nums ml-1" style={{ color: 'rgba(148,163,184,0.7)' }}>
                        {vidCurrentTime.toFixed(3)}s <span style={{ color: 'rgba(148,163,184,0.3)' }}>/ {vidDuration.toFixed(3)}s</span>
                      </span>

                      <div className="ml-auto flex items-center gap-2">
                        {vidDuration > 0 && (
                          <button
                            onClick={() => {
                              const sec = Math.round(vidCurrentTime * 1000) / 1000
                              setCutForPair(selectedPair.id, sec)
                              vidRef.current?.pause()
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all hover:brightness-110"
                            style={{ background: 'linear-gradient(130deg,rgba(234,179,8,0.25),rgba(234,179,8,0.12))', border: '1px solid rgba(234,179,8,0.5)', color: '#eab308', boxShadow: '0 0 12px rgba(234,179,8,0.15)' }}>
                            ✂ Couper ici
                          </button>
                        )}
                        {selectedPair.cutSec != null && (
                          <button onClick={() => setCutForPair(selectedPair.id, undefined)}
                            className="text-[11px] px-2 py-1 rounded-lg"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Before / After frames ── */}
                    {selectedPair.cutSec != null && (beforeFrameUrl || afterFrameUrl) && (
                      <div className="flex gap-2">
                        {/* Before frame */}
                        <div className="flex-1 rounded-xl overflow-hidden relative" style={{ background: '#000', border: '1px solid rgba(139,92,246,0.2)', aspectRatio: preset === '9:16' ? '9/16' : preset === '1:1' ? '1/1' : '16/9', maxHeight: 160 }}>
                          {beforeFrameUrl && <img src={beforeFrameUrl} alt="avant" className="w-full h-full object-contain" />}
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-center" style={{ background: 'linear-gradient(0deg,rgba(0,0,0,0.75),transparent)', fontSize: 9, color: 'rgba(196,181,253,0.8)', fontWeight: 700 }}>
                            ← AVANT &nbsp; {(selectedPair.cutSec - 1/30).toFixed(3)}s
                          </div>
                        </div>
                        {/* Cut line */}
                        <div className="flex flex-col items-center justify-center gap-1 flex-shrink-0">
                          <div style={{ width: 3, height: 60, background: 'linear-gradient(180deg,transparent,#eab308,transparent)', borderRadius: 2 }} />
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#eab308', letterSpacing: '0.05em' }}>CUT</span>
                          <div style={{ width: 3, height: 60, background: 'linear-gradient(180deg,transparent,#eab308,transparent)', borderRadius: 2 }} />
                        </div>
                        {/* After frame */}
                        <div className="flex-1 rounded-xl overflow-hidden relative" style={{ background: '#000', border: '1px solid rgba(234,179,8,0.3)', aspectRatio: preset === '9:16' ? '9/16' : preset === '1:1' ? '1/1' : '16/9', maxHeight: 160 }}>
                          {afterFrameUrl && <img src={afterFrameUrl} alt="après" className="w-full h-full object-contain" />}
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-center" style={{ background: 'linear-gradient(0deg,rgba(0,0,0,0.75),transparent)', fontSize: 9, color: '#eab308', fontWeight: 700 }}>
                            APRÈS → &nbsp; {selectedPair.cutSec.toFixed(3)}s
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Full timeline ── */}
                    <div
                      ref={timelineRef}
                      className="relative select-none"
                      style={{
                        height: 48,
                        background: 'rgba(12,8,28,0.8)',
                        border: '1px solid rgba(139,92,246,0.25)',
                        borderRadius: 10,
                        cursor: vidDuration > 0 ? 'crosshair' : 'default',
                      }}
                      onMouseDown={e => {
                        if (!timelineRef.current || vidDuration <= 0) return
                        e.preventDefault()
                        draggingRef2.current = true
                        const rect = timelineRef.current.getBoundingClientRect()
                        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        const sec  = Math.round(frac * vidDuration * 1000) / 1000
                        setCutForPair(selectedPair.id, sec)
                        if (vidRef.current) { vidRef.current.pause(); vidRef.current.currentTime = sec }
                      }}
                      onMouseMove={e => {
                        if (!timelineRef.current || vidDuration <= 0) return
                        const rect = timelineRef.current.getBoundingClientRect()
                        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        setHoverTime(frac * vidDuration)
                        if (!draggingRef2.current) return
                        const sec = Math.round(frac * vidDuration * 1000) / 1000
                        setPlannedPairs(prev => prev.map(p => p.id === selectedPair.id ? { ...p, cutSec: sec } : p))
                        if (vidRef.current) vidRef.current.currentTime = sec
                      }}
                      onMouseUp={() => { if (draggingRef2.current && selectedPair.cutSec != null) captureBeforeAfter(selectedPair.cutSec) }}
                      onMouseLeave={() => { setHoverTime(null); if (draggingRef2.current && selectedPair.cutSec != null) captureBeforeAfter(selectedPair.cutSec) }}>

                      {vidDuration > 0 && (<>
                        <div className="absolute top-0 bottom-0 left-0 rounded-xl pointer-events-none"
                          style={{ width: `${(vidCurrentTime / vidDuration) * 100}%`, background: 'rgba(139,92,246,0.18)', borderRadius: 9 }} />
                        {Array.from({ length: 9 }, (_, i) => i + 1).map(i => (
                          <div key={i} className="absolute top-2 bottom-2 w-px pointer-events-none"
                            style={{ left: `${(i / 10) * 100}%`, background: 'rgba(255,255,255,0.06)' }} />
                        ))}
                        {/* Playhead */}
                        <div className="absolute top-0 bottom-0 pointer-events-none"
                          style={{ left: `${(vidCurrentTime / vidDuration) * 100}%`, width: 2, background: 'rgba(167,139,250,0.8)', borderRadius: 2 }}>
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
                            style={{ background: '#a78bfa', boxShadow: '0 0 6px rgba(167,139,250,0.9)' }} />
                        </div>
                        {/* Hover */}
                        {hoverTime != null && (
                          <div className="absolute top-0 bottom-0 pointer-events-none"
                            style={{ left: `${(hoverTime / vidDuration) * 100}%`, width: 1, background: 'rgba(255,255,255,0.2)' }}>
                            <div className="absolute -top-6 whitespace-nowrap text-[9px] font-mono px-1 py-0.5 rounded"
                              style={{ background: 'rgba(0,0,0,0.8)', color: '#e2e8f0', transform: 'translateX(-50%)' }}>
                              {hoverTime.toFixed(3)}s
                            </div>
                          </div>
                        )}
                        {/* Cut marker */}
                        {selectedPair.cutSec != null && (
                          <div className="absolute top-0 bottom-0 pointer-events-none"
                            style={{ left: `${(selectedPair.cutSec / vidDuration) * 100}%`, transform: 'translateX(-1px)' }}>
                            <div style={{ width: 3, height: '100%', background: '#eab308', borderRadius: 2, boxShadow: '0 0 10px rgba(234,179,8,0.7)' }} />
                            <div className="absolute -bottom-5 whitespace-nowrap text-[8px] font-bold px-1 py-0.5 rounded"
                              style={{ color: '#000', background: '#eab308', transform: 'translateX(-50%)' }}>
                              {selectedPair.cutSec.toFixed(3)}s
                            </div>
                          </div>
                        )}
                        {/* Time labels */}
                        <div className="absolute inset-x-2 inset-y-0 flex items-center justify-between pointer-events-none">
                          {[0, 0.25, 0.5, 0.75, 1].map(f => (
                            <span key={f} className="text-[8px] font-mono" style={{ color: 'rgba(148,163,184,0.3)' }}>
                              {(f * vidDuration).toFixed(1)}s
                            </span>
                          ))}
                        </div>
                      </>)}
                    </div>

                    {/* ── Zoomed mini-timeline (±1.5s around cut) ── */}
                    {selectedPair.cutSec != null && vidDuration > 0 && (() => {
                      const HALF = 1.5
                      const lo = Math.max(0, selectedPair.cutSec - HALF)
                      const hi = Math.min(vidDuration, selectedPair.cutSec + HALF)
                      const win = hi - lo
                      const toFrac = (t: number) => (t - lo) / win
                      return (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(234,179,8,0.5)' }}>
                            Zoom ×{(vidDuration / win).toFixed(0)} — ±1.5s autour du cut · glisser pour ajuster
                          </p>
                          <div
                            className="relative select-none"
                            style={{
                              height: 36,
                              background: 'rgba(20,12,40,0.9)',
                              border: '1px solid rgba(234,179,8,0.35)',
                              borderRadius: 8,
                              cursor: 'crosshair',
                            }}
                            onMouseDown={e => {
                              e.preventDefault()
                              const rect = e.currentTarget.getBoundingClientRect()
                              const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                              const sec = Math.round((lo + frac * win) * 1000) / 1000
                              setCutForPair(selectedPair.id, sec)
                              if (vidRef.current) { vidRef.current.pause(); vidRef.current.currentTime = sec }
                            }}
                            onMouseMove={e => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                              setZoomHover(lo + frac * win)
                              if (e.buttons !== 1) return
                              const sec = Math.round((lo + frac * win) * 1000) / 1000
                              setPlannedPairs(prev => prev.map(p => p.id === selectedPair.id ? { ...p, cutSec: sec } : p))
                              if (vidRef.current) vidRef.current.currentTime = sec
                            }}
                            onMouseUp={() => captureBeforeAfter(selectedPair.cutSec!)}
                            onMouseLeave={() => { setZoomHover(null); captureBeforeAfter(selectedPair.cutSec!) }}>

                            {/* Tick every 0.1s */}
                            {Array.from({ length: Math.floor(win / 0.1) + 1 }, (_, i) => {
                              const t = lo + i * 0.1
                              if (t > hi) return null
                              const isSecond = Math.abs(t - Math.round(t)) < 0.01
                              return (
                                <div key={i} className="absolute top-0 bottom-0 w-px pointer-events-none"
                                  style={{ left: `${toFrac(t) * 100}%`, background: isSecond ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)' }}>
                                  {isSecond && <span className="absolute top-0.5 text-[7px] font-mono pl-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>{t.toFixed(1)}</span>}
                                </div>
                              )
                            })}

                            {/* Playhead in zoom */}
                            {vidCurrentTime >= lo && vidCurrentTime <= hi && (
                              <div className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
                                style={{ left: `${toFrac(vidCurrentTime) * 100}%`, background: 'rgba(167,139,250,0.9)' }} />
                            )}

                            {/* Hover in zoom */}
                            {zoomHover != null && (
                              <div className="absolute top-0 bottom-0 w-px pointer-events-none"
                                style={{ left: `${toFrac(zoomHover) * 100}%`, background: 'rgba(255,255,255,0.3)' }}>
                                <div className="absolute -top-6 whitespace-nowrap text-[9px] font-mono px-1 py-0.5 rounded"
                                  style={{ background: 'rgba(0,0,0,0.85)', color: '#eab308', transform: 'translateX(-50%)' }}>
                                  {zoomHover.toFixed(3)}s
                                </div>
                              </div>
                            )}

                            {/* Cut marker in zoom — always at computed position */}
                            <div className="absolute top-0 bottom-0 pointer-events-none"
                              style={{ left: `${toFrac(selectedPair.cutSec) * 100}%`, transform: 'translateX(-1px)' }}>
                              <div style={{ width: 3, height: '100%', background: '#eab308', boxShadow: '0 0 8px rgba(234,179,8,0.9)' }} />
                            </div>

                            {/* Current cut time label */}
                            <div className="absolute right-2 top-0 bottom-0 flex items-center pointer-events-none">
                              <span className="text-[10px] font-black font-mono" style={{ color: '#eab308' }}>
                                {selectedPair.cutSec.toFixed(3)}s
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    <p className="text-[9px]" style={{ color: 'rgba(148,163,184,0.25)' }}>
                      ← → image/image · Shift ±0.1s · Ctrl ±1s · Espace play/pause · glisser la timeline zoomée pour précision maximale
                    </p>
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
        <div
          className="flex-shrink-0 flex items-center justify-between"
          style={{
            padding: isMobile ? '14px 16px 12px' : '28px 32px 16px',
            borderBottom: '1px solid rgba(139,92,246,0.1)',
          }}
        >
          <div>
            <h1 style={{ fontSize: isMobile ? 17 : 20 }} className="font-black text-white leading-none">Mass Remix</h1>
            {!isMobile && <p className="text-[13px] text-text2 mt-1">Génère des remixes vidéo en masse avec FFmpeg + IA</p>}
          </div>
          <div className="flex items-center gap-2">
            {!isMobile && (
              <button
                onClick={openPreview} disabled={!canLaunch}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-bold transition-all disabled:opacity-40"
                style={{ background: canLaunch ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: canLaunch ? '#a78bfa' : 'rgba(255,255,255,0.2)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <span>👁</span>
                <span>Plan</span>
              </button>
            )}
            <button
              onClick={() => launch()} disabled={!canLaunch}
              className="flex items-center gap-2.5 rounded-xl font-bold transition-all disabled:opacity-40"
              style={{
                padding: isMobile ? '10px 16px' : '12px 24px',
                fontSize: isMobile ? 13 : 14,
                background: canLaunch ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.06)',
                color: '#fff',
                boxShadow: canLaunch ? '0 4px 20px rgba(124,58,237,0.4)' : 'none',
              }}>
              <span>⚡</span>
              <span>{isMobile ? `Lancer (${copies})` : `Lancer ${copies} remix`}</span>
            </button>
          </div>
        </div>

        {/* Body — responsive: 2 columns on desktop, stacked on mobile */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 12 : 24,
            padding: isMobile ? '14px 12px' : '32px 40px',
            overflowX: 'hidden',
          }}
        >

          {/* LEFT — video pickers */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: isMobile ? 10 : 20 }}>
            <div className="rounded-2xl" style={{ padding: isMobile ? '14px' : '24px', background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)', minHeight: isMobile ? 140 : undefined, flex: isMobile ? 'none' : 1 }}>
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
            <div className="rounded-2xl" style={{ padding: isMobile ? '14px' : '24px', background: 'rgba(236,72,153,0.04)', border: '1px solid rgba(236,72,153,0.15)', minHeight: isMobile ? 140 : undefined, flex: isMobile ? 'none' : 1 }}>
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
          <div className="flex flex-col gap-3" style={{ width: isMobile ? '100%' : 288, flexShrink: 0 }}>

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
              onClick={() => setAiEnabled(v => { const next = !v; localStorage.setItem('sf_remix_ai', next ? '1' : '0'); return next })}
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
                  {manualText.trim() ? 'Texte manuel activé (priorité sur la détection IA).' : 'Analyse et recopie le texte des vidéos automatiquement.'}
                </p>
              )}
              {aiEnabled && !anthropicKey && !manualText.trim() && (
                <p className="mt-1.5 text-[11px] font-semibold" style={{ color: '#fbbf24' }}>⚠ Clé Anthropic manquante</p>
              )}
            </button>
            {aiEnabled && (
              <div className="rounded-2xl p-3 space-y-1.5" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(139,92,246,0.7)' }}>✏️ Texte manuel (optionnel)</p>
                <textarea
                  value={manualText}
                  onChange={e => { setManualText(e.target.value); localStorage.setItem('sf_remix_manual_text', e.target.value) }}
                  placeholder="Laisse vide = détection IA auto"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-[12px] resize-none outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(139,92,246,0.25)',
                    color: '#e2e8f0',
                    lineHeight: 1.5,
                  }}
                />
              </div>
            )}

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
