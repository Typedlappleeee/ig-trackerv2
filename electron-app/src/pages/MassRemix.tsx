import { useState, useRef, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { BankPicker } from './Bank'
import { playSuccess, playError } from '@/lib/sounds'
import { useT, useLang } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { runFfmpegRemixAIWeb, detectSceneChangeWeb, extractFramesWeb } from '@/lib/ffmpeg-web'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { pushNotification } from '@/lib/notificationStore'

const isWeb = !window.electronAPI

async function anthropicVisionWeb(opts: { apiKey: string; model: string; messages: unknown[]; maxTokens: number }) {
  const r = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  return r.json() as Promise<{ ok: boolean; data?: unknown; error?: string }>
}

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

function VideoSourcePanel({
  title, phase, accent, paths, loading,
  onAddBank, onAddPC, onAddFolder, onRemove,
}: {
  title: string; phase: string; accent: string; paths: string[]; loading?: boolean
  onAddBank: () => void; onAddPC: () => void; onAddFolder: () => void; onRemove: (i: number) => void
}) {
  const t = useT()
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 14, border: `1px solid ${accent}28`, background: `${accent}06`, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
      {/* Panel header */}
      <div style={{ padding: '10px 13px', borderBottom: `1px solid ${accent}16`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 3, height: 13, borderRadius: 99, background: accent, flexShrink: 0 }} />
        <p style={{ fontSize: 12, fontWeight: 700, color: '#F1F0F7', flex: 1 }}>{title}</p>
        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 4, background: `${accent}16`, color: accent, border: `1px solid ${accent}28` }}>{phase}</span>
        {paths.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: accent, marginLeft: 2 }}>{paths.length}</span>}
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', background: 'rgba(167,139,250,0.06)', flexShrink: 0 }}>
          <svg style={{ width: 11, height: 11, color: '#a78bfa', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
          </svg>
          <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600 }}>{t('massRemixLoadingSource')}</span>
        </div>
      )}

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
        {paths.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 80 }}>
            <span style={{ fontSize: 22, opacity: 0.09 }}>🎬</span>
            <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.22)' }}>{t('massRemixNoVideo')}</p>
          </div>
        ) : paths.map((p, i) => (
          <div key={i} className="group" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 7px', borderRadius: 6, background: `${accent}08` }}>
            <span style={{ fontSize: 8, fontWeight: 900, color: accent, opacity: 0.4, width: 11, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(226,217,243,0.48)' }}>{fileName(p)}</span>
            <button onClick={() => onRemove(i)} className="opacity-0 group-hover:opacity-100"
              style={{ fontSize: 9, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'opacity 0.15s', lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        ))}
      </div>

      {/* Add buttons */}
      <div style={{ padding: '8px 9px', borderTop: `1px solid ${accent}14`, display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={onAddBank}
          style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: `${accent}13`, color: accent, border: `1px solid ${accent}24`, transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = `${accent}20`)}
          onMouseLeave={e => (e.currentTarget.style.background = `${accent}13`)}>
          🗂 {t('massRemixBankSource')}
        </button>
        <button onClick={onAddFolder}
          style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'rgba(167,139,250,0.06)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.14)', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.06)')}>
          📁 {t('massRemixFolderSource')}
        </button>
        <button onClick={onAddPC}
          style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.38)', border: '1px solid rgba(255,255,255,0.06)' }}>
          💾 {t('massRemixPCSource')}
        </button>
      </div>
    </div>
  )
}

export function MassRemix({ user }: MassRemixProps) {
  const t = useT()
  const STATUS_LABEL: Record<MassJob['status'], string> = {
    pending:    t('massRemixStatusPending'),
    detecting:  t('massRemixStatusDetecting'),
    analyzing:  t('massRemixStatusAnalyzing'),
    generating: t('massRemixStatusGenerating'),
    uploading:  `☁ ${t('uploading')}…`,
    done:       t('massRemixStatusDone'),
    error:      t('massRemixStatusError'),
  }
  const { currentOrg } = useOrg()
  const conns = useConnections(user)
  const credits = useCredits()

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
  const vidRef           = useRef<HTMLVideoElement>(null)
  const captureVidRef    = useRef<HTMLVideoElement>(null)   // original
  const captureSecVidRef = useRef<HTMLVideoElement>(null)   // secondary
  const timelineRef      = useRef<HTMLDivElement>(null)
  const draggingRef2     = useRef(false)
  const captureCanvas    = useRef<HTMLCanvasElement | null>(null)

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
    if (!captureCanvas.current) captureCanvas.current = document.createElement('canvas')
    const canvas = captureCanvas.current

    const capFrom = (vid: HTMLVideoElement | null, t: number): Promise<string | null> => {
      if (!vid || !vid.src) return Promise.resolve(null)
      return new Promise(resolve => {
        const onSeeked = () => {
          canvas.width  = vid.videoWidth  || 360
          canvas.height = vid.videoHeight || 640
          canvas.getContext('2d')?.drawImage(vid, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.9))
        }
        vid.addEventListener('seeked', onSeeked, { once: true })
        vid.currentTime = Math.max(0, t)
      })
    }

    // Before = last frame of SECONDARY (phase 1) at the cut moment
    // After  = first frame of ORIGINAL  (phase 2) at the cut moment
    // Sequential to avoid concurrent-seek corruption on the shared canvas
    capFrom(captureSecVidRef.current, cutTime)
      .then(url => { if (url) setBeforeFrameUrl(url); return capFrom(captureVidRef.current, cutTime) })
      .then(url => { if (url) setAfterFrameUrl(url) })
  }

  async function launch(prePlanned?: PlannedPair[]) {
    if (!originals.length || !secondaries.length) return
    if (exportMode === 'folder' && !outputFolder) {
      const f = await window.electronAPI?.pickOutputFolder?.()
      if (!f) return
      setOutputFolder(f)
    }

    const n = Math.max(1, copies)
    const creditCost = n * CREDIT_COSTS.remix
    const creditRes = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      alert(`${t('massRemixInsufficientCredits')} — ${creditCost} crédit(s) requis pour ${n} remix. Solde: ${creditRes.balance ?? 0}`)
      return
    }
    if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)

    const folder = exportMode === 'folder' ? outputFolder : null
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
            isWeb
              ? detectSceneChangeWeb({ filePath: job.originalPath })
              : window.electronAPI!.detectSceneChange!({ filePath: job.originalPath }),
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
              const extractFn = (args: { filePath: string; startTime: number; endTime: number }) =>
                isWeb ? extractFramesWeb(args) : window.electronAPI!.extractFrames!(args)
              const [fr1, fr2] = await Promise.all([
                withTimeout(extractFn({ filePath: job.originalPath, startTime: 0.5, endTime: 1.5 }), 20_000, 'frame debut'),
                withTimeout(extractFn({ filePath: job.originalPath, startTime: phase2Start, endTime: Math.min(phase2Start + 1, totalDur) }), 20_000, 'frame phase2'),
              ])
              if (fr1.ok && fr1.frames?.[0] && fr2.ok && fr2.frames?.[0]) {
                const visionFn = (opts: { apiKey: string; model: string; messages: unknown[]; maxTokens: number }) =>
                  isWeb ? anthropicVisionWeb(opts) : window.electronAPI!.anthropicVisionRequest!(opts)
                const res = await withTimeout(
                  visionFn({
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
          // Random position: top zone (8–22%) or bottom zone (74–90%)
          const useTop     = Math.random() < 0.5
          const randY      = useTop
            ? (0.08 + Math.random() * 0.14)
            : (0.74 + Math.random() * 0.16)
          textOverlays.push({
            text: manualText.trim(),
            x: '(w-text_w)/2',
            y: `h*${randY.toFixed(4)}`,
            fontSize: 45 + Math.floor(Math.random() * 10),
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
            isWeb
              ? extractFramesWeb({ filePath: job.originalPath, endTime: analyzeEnd })
              : window.electronAPI!.extractFrames!({ filePath: job.originalPath, endTime: analyzeEnd }),
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
Your job: identify burned-in text overlays. Group lines that belong to the SAME paragraph or caption into ONE entry — only create separate entries for text that is visually distinct (different position group, different style, or a separate sticker/watermark).

For EACH text group return a JSON object:
{"text":"full paragraph text with \\n between lines if multi-line","xAlign":"left"|"center"|"right","yPercent":0-100,"fontSizePx":number,"fontColor":"white"|"black"|"#rrggbb","bold":true|false,"startFrame":0,"endFrame":${fr.frames.length - 1}}

Position (yPercent): vertical center of the text group. 0=top edge, 100=bottom edge.
- Text in top area → 10-20
- Text in bottom area → 78-88
IMPORTANT: texts are ONLY at the top or bottom of the frame. Never use values between 25 and 70.

IMPORTANT: if two lines are part of the same sentence or caption, combine them into one entry with \\n between them. Only split into separate entries when the text blocks are clearly independent (e.g. a title at the top AND a separate sticker at the bottom). Do NOT return duplicate entries for the same text.

Font size (fontSizePx): size of the text AS IT APPEARS in a 1080px wide frame.
startFrame/endFrame: first and last frame index where this text is visible.

Return ONLY a valid JSON array, no explanation. Empty array [] if truly no text.`

            const visionFn2 = (opts: { apiKey: string; model: string; messages: unknown[]; maxTokens: number }) =>
              isWeb ? anthropicVisionWeb(opts) : window.electronAPI!.anthropicVisionRequest!(opts)
            const res = await withTimeout(
              visionFn2({
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

                // Deduplicate: merge entries whose text is ≥60% similar by word overlap
                // (catches emoji/ASCII variants, near-identical repeated captions)
                const parsed = rawParsed.reduce((acc, item) => {
                  const existing = acc.find(e => textSimilarity(e.text, item.text) >= 0.60)
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
                  const fontSize = 45 + Math.floor(Math.random() * 10)
                  const sf = item.startFrame ?? 0
                  const ef = item.endFrame   ?? frameCount - 1
                  const coversAll = (ef - sf + 1) >= frameCount * 0.8
                  const maxEnd    = splitTime ?? detDuration ?? 9999
                  const startTime = coversAll ? 0 : Math.round(sf * interval * 10) / 10
                  // Use endFrame to compute real endTime per paragraph — don't force all items
                  // to show until the video end (that's what caused simultaneous overlay overlap).
                  const endTime   = coversAll ? maxEnd : Math.min(Math.round((ef + 1) * interval * 10) / 10, maxEnd)
                  return { text: item.text, xAlign: item.xAlign ?? 'center', rawY: (item.yPercent ?? 50) / 100, fontSize, fontColor: item.fontColor ?? 'white', bold: item.bold ?? true, startTime, endTime }
                })

                // ── Step 2+3: randomise position within top/bottom zone ──────────
                // Top zone: 8–22% from top. Bottom zone: 74–90% from top.
                // Randomised per batch so each video has a slightly different layout
                // while keeping the original text zone (top → top, bottom → bottom).
                type Placed = { centerY: number; halfH: number; zone: 'top' | 'bottom' }
                const placed: Placed[] = []

                // One random offset per zone, shared across all items in that zone
                // so concurrent items nudge relative to a consistent base position.
                const topBase    = 0.08 + Math.random() * 0.14   // 8–22%
                const bottomBase = 0.74 + Math.random() * 0.16   // 74–90%

                items.forEach((item, idx) => {
                  const lines  = wrapText(item.text, item.fontSize, outW)
                  const stepFr = (item.fontSize * 1.35) / outH
                  const halfH  = (lines.length * stepFr) / 2

                  const zone: 'top' | 'bottom' = item.rawY <= 0.35 ? 'top' : 'bottom'

                  let centerY = zone === 'top'
                    ? Math.max(halfH + 0.03, topBase)
                    : Math.min(0.97 - halfH, bottomBase)

                  // Nudge to avoid overlapping concurrent items in the same zone
                  for (let j = 0; j < idx; j++) {
                    if (placed[j].zone !== zone) continue
                    const concurrent = items[j].endTime > item.startTime && items[j].startTime < item.endTime
                    if (!concurrent) continue
                    const p = placed[j]
                    if (zone === 'top') {
                      const minClear = p.centerY + p.halfH + 0.02 + halfH
                      if (centerY < minClear) centerY = minClear
                    } else {
                      const maxClear = p.centerY - p.halfH - 0.02 - halfH
                      if (centerY > maxClear) centerY = maxClear
                    }
                  }

                  centerY = Math.max(halfH + 0.03, Math.min(0.97 - halfH, centerY))
                  placed.push({ centerY, halfH, zone })

                  textOverlays.push({
                    text:      item.text,
                    x:         xAlignToExpr(item.xAlign),
                    y:         `h*${centerY.toFixed(4)}`,
                    fontSize:  item.fontSize,
                    fontColor: item.fontColor,
                    bold:      item.bold,
                    shadow:    true,
                    startTime: item.startTime,
                    endTime:   item.endTime,
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
        if (isWeb) {
          outputPath = outName  // web FFmpeg returns blob URL in gen.outputPath, this is ignored
        } else if (folder) {
          outputPath = folder.replace(/\\/g, '/') + '/' + outName
        } else {
          const tmp = await window.electronAPI!.writeTempFile!({ name: outName, bytes: new ArrayBuffer(0) })
          if (!tmp.ok || !tmp.path) {
            addLog(job.id, '❌ Impossible de créer le fichier temporaire')
            updateJob(job.id, { status: 'error', error: 'Unable to create temp file' })
            return
          }
          outputPath = tmp.path
        }

        // Trim output to original video duration so secondary doesn't run long.
        // Guard against 0 / NaN from failed detection — pass undefined so the
        // video element's own .duration is used instead (avoids immediate stop).
        const targetDuration = (detDuration != null && detDuration > 1) ? detDuration : undefined

        const gen = await withTimeout(
          isWeb
            ? runFfmpegRemixAIWeb({
                newPhase1Path: job.secondaryPath,
                originalPath:  job.originalPath,
                splitTime, outputPath, preset,
                textOverlays,
                targetDuration,
                manualCut: job.cutSec != null || splitMode === 'manual',
              })
            : window.electronAPI!.runFfmpegRemixAI!({
                newPhase1Path: job.secondaryPath,
                originalPath:  job.originalPath,
                splitTime, outputPath, preset,
                textOverlays,
                targetDuration,
              }),
          360_000, 'FFmpeg'
        )

        if ((gen as any).command) addLog(job.id, `   cmd: ${(gen as any).command}`)

        if (!gen.ok) {
          addLog(job.id, `❌ FFmpeg: ${gen.error ?? 'erreur inconnue'}`)
          updateJob(job.id, { status: 'error', error: gen.error ?? 'Erreur FFmpeg' })
          playError()
          return
        }
        addLog(job.id, '✅ FFmpeg OK')
        const finalPath = gen.outputPath ?? outputPath
        updateJob(job.id, { outputPath: finalPath })

        // ── 4. Upload to bank ────────────────────────────────────────────────
        // Always upload on web (blob URL must go to Supabase for mass posting).
        // On Electron, upload only when exportMode === 'bank'.
        if (isWeb || exportMode === 'bank') {
          updateJob(job.id, { status: 'uploading' })
          addLog(job.id, '☁️ Upload banque…')
          const up = await withTimeout(
            uploadVideoFromPath(finalPath, scope),
            90_000, 'upload'
          )
          await supabase.from('content_bank').insert({
            user_id: user.id, org_id: currentOrg?.id ?? null,
            title: `Remix ${String(job.id + 1).padStart(3, '0')} — ${fileName(job.originalPath)}`,
            file_url: null, storage_path: up.storagePath, thumbnail_path: up.thumbnailPath,
            folder: bankFolder.trim() || null,
            tags: [], notes: '',
          })
          addLog(job.id, '✅ Upload banque OK')
        }

        updateJob(job.id, { status: 'done' })
        playSuccess()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addLog(job.id, `❌ Erreur fatale: ${msg}`)
        updateJob(job.id, { status: 'error', error: msg })
        playError()
      }
    }), 1)

    setRunning(false)
  }

  const prevRunningRef = useRef(false)
  useEffect(() => {
    if (prevRunningRef.current && !running && jobs.length > 0) {
      const done   = jobs.filter(j => j.status === 'done').length
      const errors = jobs.filter(j => j.status === 'error').length
      if (done > 0 || errors > 0) {
        pushNotification({
          title: errors === 0 ? 'Mass Remix terminé ✅' : `Mass Remix: ${errors} erreur${errors > 1 ? 's' : ''}`,
          body:  `${done} succès · ${errors} erreur${errors > 1 ? 's' : ''} · ${jobs.length} vidéo${jobs.length > 1 ? 's' : ''}`,
          level: errors === 0 ? 'ok' : 'warn',
        })
      }
    }
    prevRunningRef.current = running
  }, [running, jobs])

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
              <p className="text-[18px] font-black text-white">{t('massRemixPreviewTitle')}</p>
              <p className="text-[12px]" style={{ color: 'rgba(148,163,184,0.6)' }}>{plannedPairs.length} {t('massRemixPairsHint')}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setPreviewOpen(false)}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {t('massRemixPreviewClose')}
              </button>
              <button
                onClick={() => { setPreviewOpen(false); launch(plannedPairs) }}
                className="px-6 py-2.5 rounded-xl text-[14px] font-bold transition-all"
                style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}>
                {t('massRemixLaunchBtn')} {plannedPairs.length} remix
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
                  {/* Hidden capture videos — seek independently to grab frames */}
                  <video ref={captureVidRef}    key={'cap-orig-' + selectedPair.originalPath}  src={toFileUrl(selectedPair.originalPath)}  preload="auto" muted style={{ display: 'none' }} />
                  <video ref={captureSecVidRef} key={'cap-sec-'  + selectedPair.secondaryPath} src={toFileUrl(selectedPair.secondaryPath)} preload="auto" muted style={{ display: 'none' }} />

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
                      <button title={t('massRemixFrameBack')} onClick={() => {
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
                      <button title={t('massRemixFrameForward')} onClick={() => {
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
                            {t('massRemixCutHere')}
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
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5 text-center" style={{ color: 'rgba(148,163,184,0.4)' }}>
                          {t('massRemixCutPreviewLabel')} <span style={{ color: '#eab308' }}>{selectedPair.cutSec.toFixed(3)}s</span>
                        </p>
                        <div className="flex gap-2 items-stretch">
                          {/* Phase 1 — secondary */}
                          <div className="flex-1 rounded-xl overflow-hidden relative" style={{ background: '#000', border: '2px solid rgba(236,72,153,0.45)', aspectRatio: preset === '9:16' ? '9/16' : preset === '1:1' ? '1/1' : '16/9', maxHeight: 180 }}>
                            {beforeFrameUrl
                              ? <img src={beforeFrameUrl} alt="phase1" className="w-full h-full object-contain" />
                              : <div className="w-full h-full flex items-center justify-center" style={{ color: 'rgba(148,163,184,0.3)', fontSize: 11 }}>{t('massRemixLoadingFrame')}</div>}
                            <div className="absolute top-0 left-0 right-0 px-2 py-1" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0.8),transparent)' }}>
                              <p style={{ fontSize: 8, fontWeight: 800, color: '#ec4899', letterSpacing: '0.08em' }}>PHASE 1 — SECONDAIRE</p>
                              <p style={{ fontSize: 7, color: 'rgba(236,72,153,0.7)', fontFamily: 'monospace' }}>up to {selectedPair.cutSec.toFixed(3)}s</p>
                            </div>
                          </div>

                          {/* Cut divider */}
                          <div className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0 px-0.5">
                            <div style={{ width: 2, flex: 1, background: 'linear-gradient(180deg,transparent,#eab308)', borderRadius: 2, minHeight: 30 }} />
                            <div className="rounded px-1 py-0.5" style={{ background: '#eab308' }}>
                              <span style={{ fontSize: 8, fontWeight: 900, color: '#000', letterSpacing: '0.05em' }}>✂</span>
                            </div>
                            <div style={{ width: 2, flex: 1, background: 'linear-gradient(180deg,#eab308,transparent)', borderRadius: 2, minHeight: 30 }} />
                          </div>

                          {/* Phase 2 — original */}
                          <div className="flex-1 rounded-xl overflow-hidden relative" style={{ background: '#000', border: '2px solid rgba(139,92,246,0.45)', aspectRatio: preset === '9:16' ? '9/16' : preset === '1:1' ? '1/1' : '16/9', maxHeight: 180 }}>
                            {afterFrameUrl
                              ? <img src={afterFrameUrl} alt="phase2" className="w-full h-full object-contain" />
                              : <div className="w-full h-full flex items-center justify-center" style={{ color: 'rgba(148,163,184,0.3)', fontSize: 11 }}>{t('massRemixLoadingFrame')}</div>}
                            <div className="absolute top-0 left-0 right-0 px-2 py-1" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0.8),transparent)' }}>
                              <p style={{ fontSize: 8, fontWeight: 800, color: '#a78bfa', letterSpacing: '0.08em' }}>PHASE 2 — ORIGINALE</p>
                              <p style={{ fontSize: 7, color: 'rgba(167,139,250,0.7)', fontFamily: 'monospace' }}>resumes at {selectedPair.cutSec.toFixed(3)}s</p>
                            </div>
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
                            Zoom ×{(vidDuration / win).toFixed(0)} — {t('massRemixZoomHint')}
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
                      {t('massRemixKeyHint')}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-3 opacity-40">
                  <div className="text-6xl">🎬</div>
                  <p className="text-[14px]" style={{ color: 'rgba(196,181,253,0.6)' }}>{t('massRemixSelectPreview')}</p>
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
                  <p className="text-[15px] font-black text-white">{t('massRemixGenerating')}</p>
                  <p className="text-[13px] text-text2">
                    {runningCount} running · {doneCount} done · {errorCount} error(s)
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between text-[13px] mb-1">
                <span className="text-text2">{doneCount + errorCount} / {jobs.length}</span>
                <span className="font-bold" style={{ color: '#a78bfa' }}>{progress}%</span>
                <span className="text-text2">{runningCount} {t('massRemixActive')}</span>
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
                {t('massRemixCancelBtn')}
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
                  {errorCount === 0 ? t('massRemixDoneTitle') : `${doneCount} / ${jobs.length} done`}
                </p>
                {errorCount > 0 && <p className="text-[13px]" style={{ color: '#fbbf24' }}>{errorCount} error(s)</p>}
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
                      {job.status === 'done' && job.outputPath?.startsWith('blob:') && (
                        <a href={job.outputPath}
                          download={`remix_${String(job.id + 1).padStart(3, '0')}.mp4`}
                          onClick={e => e.stopPropagation()}
                          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
                          style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)', textDecoration: 'none' }}>
                          ⬇ MP4
                        </a>
                      )}
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
              <Button onClick={() => { setJobs([]); setRunning(false) }} className="w-full">{t('massRemixCloseBtn')}</Button>
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
                📁 {folderTarget === 'orig' ? t('massRemixFolderOriginals') : t('massRemixFolderPhase1')}
              </p>
              <button onClick={() => setFolderTarget(null)} className="text-text2 hover:text-white text-lg leading-none">✕</button>
            </div>
            {folderLoading ? (
              <div className="py-10 text-center text-text2 text-[13px]">{t('massRemixLoadingSource')}</div>
            ) : folderList.length === 0 ? (
              <div className="py-10 text-center text-text2 text-[13px]">{t('massRemixNoFolders')}</div>
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

      {/* ── MAIN PAGE ── */}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{
          flexShrink: 0, padding: isMobile ? '11px 14px' : '14px 22px',
          borderBottom: '1px solid rgba(139,92,246,0.1)',
          background: 'linear-gradient(90deg,rgba(124,58,237,0.07) 0%,transparent 60%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isMobile && (
              <div style={{ width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg,#7c3aed,#ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 14px rgba(124,58,237,0.35)' }}>
                <span style={{ fontSize: 18 }}>⚡</span>
              </div>
            )}
            <div>
              <h1 style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: '#F1F0F7', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{t('massRemixTitle')}</h1>
              {!isMobile && <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)', marginTop: 2 }}>{t('massRemixSub')}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {!isMobile && (
              <button onClick={openPreview} disabled={!canLaunch}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: canLaunch ? 'pointer' : 'not-allowed', background: canLaunch ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)', color: canLaunch ? '#a78bfa' : 'rgba(255,255,255,0.18)', border: `1px solid ${canLaunch ? 'rgba(139,92,246,0.26)' : 'rgba(255,255,255,0.06)'}`, opacity: canLaunch ? 1 : 0.5, transition: 'all 0.15s' }}>
                {t('massRemixPlanBtn')}
              </button>
            )}
            <button onClick={() => launch()} disabled={!canLaunch}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '8px 14px' : '8px 18px', fontSize: isMobile ? 12 : 13, fontWeight: 800, cursor: canLaunch ? 'pointer' : 'not-allowed', borderRadius: 11, border: 'none', color: '#fff', background: canLaunch ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.06)', boxShadow: canLaunch ? '0 3px 16px rgba(124,58,237,0.38)' : 'none', opacity: canLaunch ? 1 : 0.4, transition: 'all 0.2s' }}>
              <span>⚡</span><span>{isMobile ? `${t('massRemixLaunchMobile')} (${copies})` : `${t('massRemixLaunchBtn')} ${copies} remix`}</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 0, display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 10 : 14, padding: isMobile ? '12px' : '16px 22px',
          overflow: isMobile ? 'auto' : 'hidden',
        }}>

          {/* LEFT: two source panels SIDE BY SIDE */}
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 10 }}>
            <VideoSourcePanel
              title={t('massRemixPanelOriginals')} phase="PHASE 2" accent="#8b5cf6"
              paths={originals} loading={addingTarget === 'orig'}
              onAddBank={() => setShowBankOrig(true)}
              onAddFolder={() => openFolderPick('orig')}
              onAddPC={async () => { const p = await pickPC(false); setOriginals(prev => [...prev, ...p]) }}
              onRemove={i => setOriginals(prev => prev.filter((_, j) => j !== i))}
            />
            <VideoSourcePanel
              title={t('massRemixPanelPhase1')} phase="PHASE 1" accent="#ec4899"
              paths={secondaries} loading={addingTarget === 'sec'}
              onAddBank={() => setShowBankSec(true)}
              onAddFolder={() => openFolderPick('sec')}
              onAddPC={async () => { const p = await pickPC(false); setSecondaries(prev => [...prev, ...p]) }}
              onRemove={i => setSecondaries(prev => prev.filter((_, j) => j !== i))}
            />
          </div>

          {/* RIGHT: config sidebar */}
          <div style={{ width: isMobile ? '100%' : 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 7, overflowY: isMobile ? undefined : 'auto' }}>

            {!isMobile && <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(148,163,184,0.22)', textTransform: 'uppercase', padding: '0 2px' }}>{t('massRemixConfiguration')}</p>}

            {/* Copies */}
            <div style={{ borderRadius: 12, padding: '12px 13px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.35)', marginBottom: 9 }}>{t('massRemixCopies')}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <button onClick={() => setCopies(c => Math.max(1, c - 1))} style={{ width: 28, height: 28, borderRadius: 8, fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(196,181,253,0.7)', cursor: 'pointer', flexShrink: 0 }}>−</button>
                <input type="number" min={1} max={200} value={copies} onChange={e => setCopies(Math.max(1, Math.min(200, Number(e.target.value))))} style={{ flex: 1, background: 'transparent', border: 'none', textAlign: 'center', fontSize: 26, fontWeight: 900, color: '#F1F0F7', outline: 'none' }} />
                <button onClick={() => setCopies(c => Math.min(200, c + 1))} style={{ width: 28, height: 28, borderRadius: 8, fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(196,181,253,0.7)', cursor: 'pointer', flexShrink: 0 }}>+</button>
              </div>
              <input type="range" min={1} max={50} value={Math.min(copies, 50)} onChange={e => setCopies(Number(e.target.value))} style={{ width: '100%' }} />
              {originals.length > 0 && secondaries.length > 0 && (
                <p style={{ fontSize: 10, marginTop: 5, color: 'rgba(148,163,184,0.32)' }}>🔀 {originals.length} × {secondaries.length} → <span style={{ color: '#a78bfa', fontWeight: 700 }}>{copies} {t('massRemixVideoCount')}</span></p>
              )}
            </div>

            {/* AI toggle */}
            <button onClick={() => setAiEnabled(v => { const next = !v; localStorage.setItem('sf_remix_ai', next ? '1' : '0'); return next })}
              style={{ borderRadius: 12, padding: '10px 13px', textAlign: 'left', cursor: 'pointer', width: '100%', border: 'none', background: aiEnabled ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.025)', outline: `1px solid ${aiEnabled ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.07)'}`, boxShadow: aiEnabled ? '0 0 14px rgba(124,58,237,0.1)' : 'none', transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: aiEnabled ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)' }}><span style={{ fontSize: 13 }}>✨</span></div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: aiEnabled ? '#c4b5fd' : 'rgba(196,181,253,0.45)', lineHeight: 1.2 }}>{t('massRemixAiLabel')}</p>
                    <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.3)', lineHeight: 1.2 }}>{t('massRemixAiSub')}</p>
                  </div>
                </div>
                <div style={{ width: 32, height: 18, borderRadius: 99, position: 'relative', flexShrink: 0, background: aiEnabled ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'transform 0.2s', transform: `translateX(${aiEnabled ? 16 : 2}px)`, display: 'block' }} />
                </div>
              </div>
              {aiEnabled && <p style={{ marginTop: 6, fontSize: 10, color: 'rgba(148,163,184,0.38)', lineHeight: 1.4 }}>{manualText.trim() ? t('massRemixManualActive') : t('massRemixAutoAnalyze')}</p>}
              {aiEnabled && !anthropicKey && !manualText.trim() && <p style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: '#fbbf24' }}>{t('massRemixNoAnthropicKey')}</p>}
            </button>

            {aiEnabled && (
              <div style={{ borderRadius: 10, padding: '8px 11px', background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(139,92,246,0.18)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(139,92,246,0.55)', textTransform: 'uppercase' }}>{t('massRemixManualTextLabel')}</p>
                <textarea value={manualText} onChange={e => { setManualText(e.target.value); localStorage.setItem('sf_remix_manual_text', e.target.value) }} placeholder={t('massRemixManualPlaceholder')} rows={2} style={{ width: '100%', borderRadius: 8, padding: '6px 9px', fontSize: 11, resize: 'none', outline: 'none', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(139,92,246,0.2)', color: '#e2e8f0', lineHeight: 1.4, fontFamily: 'inherit' }} />
              </div>
            )}

            {/* Point de coupe */}
            <div style={{ borderRadius: 12, padding: '12px 13px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.35)' }}>{t('massRemixCutPoint')}</p>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['auto', 'manual'] as const).map(m => (
                  <button key={m} onClick={() => { setSplitMode(m); if (m === 'manual' && canLaunch) openPreview() }}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', border: 'none', background: splitMode === m ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.05)', color: splitMode === m ? '#fff' : 'rgba(196,181,253,0.38)', boxShadow: splitMode === m ? '0 2px 10px rgba(124,58,237,0.28)' : 'none', outline: splitMode === m ? 'none' : '1px solid rgba(255,255,255,0.07)' }}>
                    {m === 'auto' ? t('massRemixAutoMode') : t('massRemixManualMode')}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.32)', lineHeight: 1.4 }}>{splitMode === 'auto' ? t('massRemixAutoDesc') : t('massRemixManualDesc')}</p>
            </div>

            {/* Format */}
            <div style={{ borderRadius: 12, padding: '12px 13px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.35)', marginBottom: 8 }}>{t('massRemixFormat')}</p>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['9:16', '1:1', '16:9'] as Preset[]).map(p => (
                  <button key={p} onClick={() => setPreset(p)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', border: 'none', background: preset === p ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.05)', color: preset === p ? '#fff' : 'rgba(196,181,253,0.38)', boxShadow: preset === p ? '0 2px 10px rgba(124,58,237,0.28)' : 'none', outline: preset === p ? 'none' : '1px solid rgba(255,255,255,0.07)' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Destination */}
            <div style={{ borderRadius: 12, padding: '12px 13px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.35)' }}>{t('massRemixDestination')}</p>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['bank', 'folder'] as ExportMode[]).map(m => (
                  <button key={m} onClick={() => setExportMode(m)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', border: 'none', background: exportMode === m ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.05)', color: exportMode === m ? '#fff' : 'rgba(196,181,253,0.38)', boxShadow: exportMode === m ? '0 2px 10px rgba(124,58,237,0.28)' : 'none', outline: exportMode === m ? 'none' : '1px solid rgba(255,255,255,0.07)' }}>
                    {m === 'bank' ? t('massRemixBankDest') : t('massRemixFolderDest')}
                  </button>
                ))}
              </div>
              {exportMode === 'bank' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {bankFolders.length > 0 && (
                    <select value={bankFolders.includes(bankFolder) ? bankFolder : ''} onChange={e => setBankFolder(e.target.value)} style={{ width: '100%', borderRadius: 8, padding: '6px 9px', fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2d9f3', outline: 'none', cursor: 'pointer' }}>
                      <option value="" style={{ background: '#0c0919', color: '#e2d9f3' }}>{t('massRemixRootFolder')}</option>
                      {bankFolders.map(f => <option key={f} value={f} style={{ background: '#0c0919', color: '#e2d9f3' }}>{f}</option>)}
                    </select>
                  )}
                  <input type="text" placeholder={bankFolders.length > 0 ? t('massRemixNewFolderPlaceholder') : t('massRemixFolderOptional')} value={bankFolder} onChange={e => setBankFolder(e.target.value)} style={{ width: '100%', borderRadius: 8, padding: '6px 9px', fontSize: 11, background: 'rgba(255,255,255,0.05)', border: `1px solid ${bankFolder.trim() ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.09)'}`, color: '#e2d9f3', outline: 'none' }} />
                </div>
              )}
              {exportMode === 'folder' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <button onClick={async () => { const f = await window.electronAPI?.pickOutputFolder?.(); if (f) setOutputFolder(f) }} style={{ width: '100%', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>{t('massRemixChooseFolder')}</button>
                  {outputFolder && <p style={{ fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(148,163,184,0.32)' }}>{outputFolder}</p>}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
