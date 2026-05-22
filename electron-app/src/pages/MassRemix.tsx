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
  pending:    'En attente',
  detecting:  'Détection…',
  analyzing:  'IA texte…',
  generating: 'FFmpeg…',
  uploading:  'Upload…',
  done:       'Terminé',
  error:      'Erreur',
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
  const isPink = accent === '#EC4899' || accent === '#ec4899'
  const accentDim = isPink ? 'rgba(236,72,153,0.05)' : 'rgba(124,58,237,0.05)'
  const accentBorder = isPink ? 'rgba(236,72,153,0.12)' : 'rgba(139,92,246,0.12)'
  const accentDash = isPink ? 'rgba(236,72,153,0.18)' : 'rgba(139,92,246,0.18)'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div style={{ width: 4, height: 22, borderRadius: 3, background: accent, flexShrink: 0 }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: '#F2F0FF', letterSpacing: '-0.02em', flex: 1 }}>{label}</p>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: `${accent}1A`, color: accent, border: `1px solid ${accent}30`,
        }}>
          {paths.length} vidéo{paths.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Add buttons row */}
      <div className="flex gap-2 mb-3 flex-shrink-0">
        {/* Banque */}
        <button onClick={onAddBank} className="sf-btn sf-btn-secondary sf-btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Banque
        </button>
        {/* Dossier */}
        <button onClick={onAddFolder} className="sf-btn sf-btn-secondary sf-btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Dossier
        </button>
        {/* PC */}
        <button onClick={onAddPC} className="sf-btn sf-btn-secondary sf-btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
          </svg>
          PC
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-2 flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="sf-spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />
          <p style={{ fontSize: 12, fontWeight: 600, color: '#A78BFA' }}>Ajout du dossier en cours…</p>
        </div>
      )}

      {/* Video list */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {paths.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: `1px dashed ${accentDash}`, borderRadius: 9, minHeight: 80, gap: 8,
          }}>
            {isPink ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                <rect x="2" y="2" width="20" height="20" rx="2.18" /><line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
                <line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" />
                <line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
              </svg>
            )}
            <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.38)' }}>Aucune vidéo ajoutée</span>
          </div>
        ) : paths.map((p, i) => (
          <div key={i} className="group flex items-center gap-2.5"
            style={{ background: accentDim, border: `1px solid ${accentBorder}`, borderRadius: 9, padding: '8px 12px' }}>
            <span style={{ fontSize: 10, fontWeight: 900, width: 16, textAlign: 'center', flexShrink: 0, color: accent, opacity: 0.7 }}>{i + 1}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(226,217,243,0.62)' }}>{fileName(p)}</span>
            <button onClick={() => onRemove(i)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'rgba(239,68,68,0.55)', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
              aria-label="Supprimer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
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

                // ── Step 1: resolve timing + font for each item ────────────────
                type TItem = { text: string; xAlign: string; rawY: number; fontSize: number; fontColor: string; bold: boolean; startTime: number; endTime: number }
                const items: TItem[] = parsed.map(item => {
                  const fontSize = Math.round(Math.max(44, Math.min(160, (item.fontSizePx ?? 64) * 1.15)))
                  const sf = item.startFrame ?? 0
                  const ef = item.endFrame   ?? frameCount - 1
                  const coversAll = (ef - sf + 1) >= frameCount * 0.8
                  const startTime = coversAll ? 0 : Math.round(sf * interval * 10) / 10
                  const endTime   = coversAll
                    ? analyzeEnd
                    : Math.min(analyzeEnd, Math.max(startTime + interval * 2, Math.round((ef + 1) * interval * 10) / 10))
                  return { text: item.text, xAlign: item.xAlign ?? 'center', rawY: (item.yPercent ?? 50) / 100, fontSize, fontColor: item.fontColor ?? 'white', bold: item.bold ?? true, startTime, endTime }
                })

                // ── Step 2: assign zones (top / bottom) to avoid face + overlaps ─
                // Base zone from original position: top if rawY < 0.35, else bottom
                type Zone = 'top' | 'bottom'
                const zones: Zone[] = items.map(it => it.rawY < 0.35 ? 'top' : 'bottom')
                // Conflict resolution: if two temporally-concurrent items share a zone → flip the later one
                for (let i = 1; i < items.length; i++) {
                  for (let j = 0; j < i; j++) {
                    const overlap = items[j].endTime > items[i].startTime && items[j].startTime < items[i].endTime
                    if (overlap && zones[j] === zones[i]) zones[i] = zones[i] === 'bottom' ? 'top' : 'bottom'
                  }
                }

                // ── Step 3: generate per-line overlays inside their zone ──────────
                // Track the lowest used yFrac per zone per concurrent group to avoid line overlap
                items.forEach((item, idx) => {
                  const zone   = zones[idx]
                  const lines  = wrapText(item.text, item.fontSize, outW)
                  const stepFr = (item.fontSize * 1.3) / outH

                  // Find the lowest yFrac already used by concurrent items in the same zone
                  let baseY: number
                  if (zone === 'top') {
                    baseY = 0.07
                  } else {
                    // Start just below any concurrent bottom items
                    const concurrentBottomMax = items
                      .slice(0, idx)
                      .filter((_, j) => zones[j] === 'bottom' && items[j].endTime > item.startTime && items[j].startTime < item.endTime)
                      .reduce((max, it) => {
                        const n = wrapText(it.text, it.fontSize, outW).length
                        const st = (it.fontSize * 1.3) / outH
                        return Math.max(max, 0.76 + (n - 1) * st)
                      }, 0.76)
                    baseY = concurrentBottomMax
                  }

                  lines.forEach((line, li) => {
                    const lineYFrac = zone === 'top'
                      ? Math.min(0.13, baseY + li * stepFr)
                      : Math.min(0.87, baseY + li * stepFr)
                    textOverlays.push({
                      text: line,
                      x: xAlignToExpr(item.xAlign),
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
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(2,2,5,0.96)', backdropFilter: 'blur(20px)' }}>
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between"
            style={{ background: 'rgba(10,10,18,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '16px 28px' }}>
            <div>
              <p style={{ fontSize: 17, fontWeight: 700, color: '#F2F0FF', letterSpacing: '-0.03em' }}>Plan des remixes</p>
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.52)', marginTop: 2 }}>
                {plannedPairs.length} paires — cliquez pour prévisualiser et régler le point de coupe
              </p>
            </div>
            {splitMode === 'manual' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" />
                  <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
                  <line x1="8.12" y1="8.12" x2="12" y2="12" />
                </svg>
                <span style={{ fontSize: 12, color: '#eab308' }}>Défaut</span>
                <input type="number" min={0.1} step={0.1} value={manualSplitSec}
                  onChange={e => setManualSplitSec(e.target.value)}
                  className="sf-input"
                  style={{ width: 60, padding: '3px 8px', fontSize: 13, fontWeight: 700, textAlign: 'center', color: '#eab308', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }} />
                <span style={{ fontSize: 11, color: 'rgba(234,179,8,0.6)' }}>sec</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={() => setPreviewOpen(false)} className="sf-btn sf-btn-ghost sf-btn-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Fermer
              </button>
              <button
                onClick={() => { setPreviewOpen(false); launch(plannedPairs) }}
                className="sf-btn sf-btn-primary"
                style={{ padding: '9px 20px', fontSize: 14, fontWeight: 700 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Lancer {plannedPairs.length} remix
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Left: pair list */}
            <div style={{ width: 260, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid rgba(139,92,246,0.12)', background: 'rgba(7,7,12,0.8)' }}>
              {plannedPairs.map(pair => (
                <button key={pair.id}
                  onClick={() => { setSelectedPairId(pair.id); setVidCurrentTime(0); setVidDuration(0) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 16px',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    borderBottom: '1px solid rgba(139,92,246,0.07)',
                    borderLeft: selectedPairId === pair.id ? '3px solid #7C3AED' : '3px solid transparent',
                    background: selectedPairId === pair.id ? 'rgba(139,92,246,0.1)' : 'transparent',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}>
                  <span style={{
                    fontSize: 10, fontWeight: 900, flexShrink: 0, paddingTop: 2,
                    background: 'rgba(139,92,246,0.15)', color: '#A78BFA',
                    border: '1px solid rgba(139,92,246,0.25)', borderRadius: 5,
                    padding: '1px 5px',
                  }}>{pair.id + 1}</span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <p style={{ fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(196,181,253,0.75)' }}>{fileName(pair.originalPath)}</p>
                    <p style={{ fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(236,72,153,0.6)' }}>{fileName(pair.secondaryPath)}</p>
                    {pair.cutSec != null ? (
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" />
                          <line x1="20" y1="4" x2="8.12" y2="15.88" />
                        </svg>
                        {pair.cutSec.toFixed(1)}s
                      </p>
                    ) : (
                      <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)' }}>
                        {splitMode === 'manual' ? `${manualSplitSec}s (global)` : 'auto'}
                      </p>
                    )}
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
                      border: '1px solid rgba(255,255,255,0.07)',
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
                        style={{ left: `${(selectedPair.cutSec / vidDuration) * 100}%`, width: 2, background: 'rgba(245,158,11,0.9)', boxShadow: '0 0 8px rgba(245,158,11,0.6)' }} />
                    )}
                    {/* Play hint overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 3 }}>
                          <polygon points="5,3 19,12 5,21" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Timeline controls */}
                  <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
                    <div className="flex items-center gap-3">
                      {/* Play/pause */}
                      <button onClick={() => { const v = vidRef.current; if (v) v.paused ? v.play() : v.pause() }}
                        style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', cursor: 'pointer' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5,3 19,12 5,21" />
                        </svg>
                      </button>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(148,163,184,0.6)' }}>
                        {formatSec(vidCurrentTime)} / {formatSec(vidDuration)}
                      </span>
                      {vidDuration > 0 && (
                        <button
                          onClick={() => {
                            const sec = Math.round(vidCurrentTime * 10) / 10
                            setCutForPair(selectedPair.id, sec)
                            vidRef.current?.pause()
                          }}
                          className="flex items-center gap-1.5"
                          style={{ padding: '5px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: 'rgba(245,158,11,0.13)', border: '1px solid rgba(245,158,11,0.28)', color: '#F59E0B', cursor: 'pointer', transition: 'filter 0.15s' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" />
                            <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
                            <line x1="8.12" y1="8.12" x2="12" y2="12" />
                          </svg>
                          Couper ici
                        </button>
                      )}
                      {selectedPair.cutSec != null && (
                        <>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginLeft: 'auto' }}>{selectedPair.cutSec.toFixed(1)}s</span>
                          <button onClick={() => setCutForPair(selectedPair.id, undefined)}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 7, background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Effacer
                          </button>
                        </>
                      )}
                    </div>

                    <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.42)' }}>
                      Cliquez ou glissez sur la barre pour définir le point de coupe
                    </p>

                    {/* Timeline bar */}
                    <div
                      ref={timelineRef}
                      className="relative select-none"
                      style={{
                        height: 44, borderRadius: 12,
                        background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)',
                        cursor: vidDuration > 0 ? 'crosshair' : 'default',
                      }}
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
                          style={{ width: `${(vidCurrentTime / vidDuration) * 100}%`, background: 'rgba(139,92,246,0.25)' }} />
                      )}
                      {/* Cut marker */}
                      {selectedPair.cutSec != null && vidDuration > 0 && (
                        <div className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                          style={{ left: `${(selectedPair.cutSec / vidDuration) * 100}%`, transform: 'translateX(-1px)' }}>
                          <div style={{ width: 3, height: '100%', background: '#F59E0B', borderRadius: 2, boxShadow: '0 0 8px rgba(245,158,11,0.6)' }} />
                          <div style={{
                            position: 'absolute', top: -28, whiteSpace: 'nowrap', fontSize: 9, fontWeight: 700,
                            padding: '2px 6px', borderRadius: 5, color: '#000', background: '#F59E0B', transform: 'translateX(-50%)',
                            fontFamily: 'monospace',
                          }}>
                            {selectedPair.cutSec.toFixed(1)}s
                          </div>
                        </div>
                      )}
                      {/* Time labels */}
                      {vidDuration > 0 && (
                        <div className="absolute inset-x-2 inset-y-0 flex items-center justify-between pointer-events-none">
                          {[0, 0.25, 0.5, 0.75, 1].map(f => (
                            <span key={f} style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(148,163,184,0.35)' }}>
                              {formatSec(f * vidDuration)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {!vidDuration && (
                      <p style={{ fontSize: 11, textAlign: 'center', color: 'rgba(148,163,184,0.3)' }}>
                        Chargement de la vidéo…
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: 0.38 }}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(196,181,253,0.6)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" /><line x1="7" y1="2" x2="7" y2="22" />
                    <line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
                    <line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" />
                    <line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
                  </svg>
                  <p style={{ fontSize: 14, color: 'rgba(196,181,253,0.6)' }}>Sélectionnez un remix pour le prévisualiser</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Progress modal ── */}
      {running && (
        <div className="sf-modal-bg fixed inset-0 z-50 flex items-center justify-center p-6">
          <div style={{
            width: '100%', maxWidth: 440, borderRadius: 20, overflow: 'hidden',
            background: '#0C0C15', border: '1px solid rgba(139,92,246,0.25)',
            boxShadow: '0 0 60px rgba(124,58,237,0.2)',
          }}>
            {/* Modal header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(139,92,246,0.13)', background: 'linear-gradient(135deg,rgba(124,58,237,0.1),rgba(236,72,153,0.05))' }}>
              <div className="flex items-center gap-3">
                <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                  <span className="sf-ping-dot" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#EC4899)', opacity: 0.3 }} />
                  <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                    <Spinner size="sm" />
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.02em' }}>Génération en cours…</p>
                  <p style={{ fontSize: 12, color: 'rgba(196,181,253,0.52)', marginTop: 2 }}>
                    {runningCount} en cours · {doneCount} terminée(s) · {errorCount} erreur(s)
                  </p>
                </div>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Progress stats */}
              <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
                <span style={{ color: 'rgba(196,181,253,0.52)' }}>{doneCount + errorCount} / {jobs.length}</span>
                <span style={{ fontWeight: 700, color: '#A78BFA' }}>{progress}%</span>
                <span style={{ color: 'rgba(196,181,253,0.52)' }}>{runningCount} actives</span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(139,92,246,0.12)' }}>
                <div style={{ height: '100%', borderRadius: 999, transition: 'width 0.5s', width: `${progress}%`, background: 'linear-gradient(90deg,#7C3AED,#EC4899)' }} />
              </div>

              {/* Job list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 208, overflowY: 'auto' }}>
                {jobs.map(job => {
                  const statusColor = job.status === 'done' ? '#22C55E' : job.status === 'error' ? '#EF4444' : job.status === 'pending' ? 'rgba(196,181,253,0.28)' : '#A78BFA'
                  const rowBg = job.status === 'done' ? 'rgba(34,197,94,0.05)' : job.status === 'error' ? 'rgba(239,68,68,0.05)' : job.status === 'pending' ? 'transparent' : 'rgba(139,92,246,0.05)'
                  const leftBorder = job.status === 'done' ? '#22C55E' : job.status === 'error' ? '#EF4444' : job.status === 'pending' ? 'rgba(255,255,255,0.07)' : '#7C3AED'
                  return (
                    <div key={job.id} className="flex items-center gap-3"
                      style={{ background: rowBg, borderRadius: 9, padding: '7px 10px', borderLeft: `3px solid ${leftBorder}` }}>
                      <span style={{ width: 20, fontSize: 10, fontWeight: 700, textAlign: 'center', flexShrink: 0, color: 'rgba(196,181,253,0.5)', fontFamily: 'monospace' }}>#{job.id + 1}</span>
                      <span style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(196,181,253,0.52)' }}>{fileName(job.originalPath)}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, flexShrink: 0, color: statusColor }}>
                        {STATUS_LABEL[job.status]}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Cancel */}
              <button onClick={() => { abortRef.current = true; setRunning(false) }}
                className="sf-btn sf-btn-danger sf-btn-sm"
                style={{ width: '100%', justifyContent: 'center', padding: '9px 16px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Annuler la génération
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Done summary modal ── */}
      {!running && jobs.length > 0 && (doneCount + errorCount) === jobs.length && (
        <div className="sf-modal-bg fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="sf-modal sf-anim-scale-spring" style={{ maxWidth: 440, width: '100%', border: `1px solid ${errorCount === 0 ? 'rgba(34,197,94,0.28)' : 'rgba(245,158,11,0.28)'}` }}>
            <div className="sf-modal-body" style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Status icon */}
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                {errorCount === 0 ? (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                )}
                <p style={{ fontSize: 19, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.03em' }}>
                  {errorCount === 0 ? 'Tous les remixes générés !' : `${doneCount} / ${jobs.length} terminés`}
                </p>
                {errorCount > 0 && <p style={{ fontSize: 13, color: '#F59E0B' }}>{errorCount} erreur(s)</p>}
              </div>

              {/* Job details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 288, overflowY: 'auto' }}>
                {jobs.map(job => (
                  <details key={job.id}
                    style={{ borderRadius: 11, overflow: 'hidden', background: job.status === 'done' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${job.status === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.18)'}` }}
                    open={job.status === 'error'}>
                    <summary className="flex items-center gap-3 cursor-pointer list-none" style={{ padding: '9px 14px' }}>
                      {job.status === 'done' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.68)' }}>{fileName(job.originalPath)}</p>
                        {job.error && <p style={{ fontSize: 11, fontWeight: 600, color: '#f87171', marginTop: 1 }}>{job.error}</p>}
                      </div>
                      {job.logs.length > 0 && (
                        <span style={{ fontSize: 9, color: 'rgba(196,181,253,0.38)', flexShrink: 0 }}>logs</span>
                      )}
                    </summary>
                    {job.logs.length > 0 && (
                      <div style={{ padding: '0 14px 10px', borderTop: '1px solid rgba(255,255,255,0.055)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {job.logs.map((line, i) => (
                          <p key={i} style={{ fontSize: 10, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.4, color: line.startsWith('❌') ? '#f87171' : line.startsWith('✅') ? '#34d399' : line.startsWith('⚠️') ? '#fbbf24' : 'rgba(196,181,253,0.52)' }}>
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </details>
                ))}
              </div>

              <button onClick={() => { setJobs([]); setRunning(false) }} className="sf-btn sf-btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                Fermer
              </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(2,2,5,0.82)', backdropFilter: 'blur(12px)' }}
          onClick={() => setFolderTarget(null)}>
          <div style={{ borderRadius: 15, overflow: 'hidden', width: 320, background: '#0C0C15', border: '1px solid rgba(139,92,246,0.22)' }}
            onClick={e => e.stopPropagation()}>
            {/* Folder modal header */}
            <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
              <div className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#F2F0FF' }}>
                  {folderTarget === 'orig' ? 'Dossier — Originales' : 'Dossier — Phase 1'}
                </p>
              </div>
              <button onClick={() => setFolderTarget(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(196,181,253,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {folderLoading ? (
              <div style={{ padding: '36px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div className="sf-spinner" style={{ width: 22, height: 22 }} />
                <span style={{ fontSize: 13, color: 'rgba(196,181,253,0.45)' }}>Chargement…</span>
              </div>
            ) : folderList.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', fontSize: 13, color: 'rgba(196,181,253,0.38)' }}>Aucun dossier dans la banque</div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
                {folderList.map(f => (
                  <button key={f.name} onClick={() => addFolderVideos(f.name)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
                      textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: 'transparent', border: 'none', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'rgba(255,255,255,0.04)',
                      cursor: 'pointer', transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(196,181,253,0.45)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#F2F0FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12, background: 'rgba(139,92,246,0.12)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.2)' }}>
                      {f.count} vid.
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main page ── */}
      <div className="h-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between"
          style={{ padding: '18px 28px 14px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="flex items-center gap-3">
              {/* Page icon */}
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(124,58,237,0.14)', border: '1px solid rgba(139,92,246,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F2F0FF', letterSpacing: '-0.04em', lineHeight: 1 }}>Remix Vidéo</h1>
            </div>
            {/* Workflow pills */}
            <div className="flex items-center gap-1.5">
              {[
                { label: 'Vidéo originale' },
                { arrow: true },
                { label: 'IA texte' },
                { arrow: true },
                { label: 'Phase 1' },
              ].map((item, i) =>
                'arrow' in item ? (
                  <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                ) : (
                  <span key={i} style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(196,181,253,0.6)',
                  }}>{item.label}</span>
                )
              )}
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={openPreview} disabled={!canLaunch}
              className="sf-btn sf-btn-ghost sf-btn-sm"
              style={{ opacity: canLaunch ? 1 : 0.4, pointerEvents: canLaunch ? 'auto' : 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
              Aperçu Plan
            </button>
            <button
              onClick={() => launch()} disabled={!canLaunch}
              className="sf-btn sf-btn-primary"
              style={{
                opacity: canLaunch ? 1 : 0.4, pointerEvents: canLaunch ? 'auto' : 'none',
                boxShadow: canLaunch ? '0 4px 20px rgba(124,58,237,0.38)' : 'none',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Lancer {copies} remix{copies !== 1 ? 's' : ''}
            </button>
          </div>
        </div>

        {/* Body — 2 columns */}
        <div className="flex-1 min-h-0 flex gap-5" style={{ padding: '20px 24px' }}>

          {/* LEFT — video pickers */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Originals panel */}
            <div className="flex-1 min-h-0" style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '18px 20px' }}>
              <VideoListPanel
                label="Vidéos originales"
                paths={originals}
                accent="#8B5CF6"
                loading={addingTarget === 'orig'}
                onAddBank={() => setShowBankOrig(true)}
                onAddFolder={() => openFolderPick('orig')}
                onAddPC={async () => { const p = await pickPC(false); setOriginals(prev => [...prev, ...p]) }}
                onRemove={i => setOriginals(prev => prev.filter((_, j) => j !== i))}
              />
            </div>
            {/* Phase 1 panel */}
            <div className="flex-1 min-h-0" style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '18px 20px' }}>
              <VideoListPanel
                label="Nouvelles Phase 1"
                paths={secondaries}
                accent="#EC4899"
                loading={addingTarget === 'sec'}
                onAddBank={() => setShowBankSec(true)}
                onAddFolder={() => openFolderPick('sec')}
                onAddPC={async () => { const p = await pickPC(false); setSecondaries(prev => [...prev, ...p]) }}
                onRemove={i => setSecondaries(prev => prev.filter((_, j) => j !== i))}
              />
            </div>
          </div>

          {/* RIGHT — settings panel */}
          <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Card 1 — Copies counter */}
            <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(148,163,184,0.45)', marginBottom: 12 }}>Copies</p>
              <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                <button onClick={() => setCopies(c => Math.max(1, c - 1))}
                  style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(196,181,253,0.7)', fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <input type="number" min={1} max={200} value={copies}
                  onChange={e => setCopies(Math.max(1, Math.min(200, Number(e.target.value))))}
                  style={{ flex: 1, padding: '2px 0', fontSize: 26, fontWeight: 900, color: '#F2F0FF', textAlign: 'center', background: 'transparent', border: 'none', outline: 'none' }} />
                <button onClick={() => setCopies(c => Math.min(200, c + 1))}
                  style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(196,181,253,0.7)', fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
              <input type="range" min={1} max={50} value={Math.min(copies, 50)}
                onChange={e => setCopies(Number(e.target.value))} style={{ width: '100%' }} />
              {originals.length > 0 && secondaries.length > 0 && (
                <p style={{ fontSize: 11, marginTop: 8, color: 'rgba(148,163,184,0.45)' }}>
                  {originals.length} orig × {secondaries.length} sec{' '}
                  <span style={{ color: '#A78BFA', fontWeight: 600 }}>→ {copies} vidéo{copies !== 1 ? 's' : ''}</span>
                </p>
              )}
            </div>

            {/* Card 2 — IA Detection toggle */}
            <button
              onClick={() => setAiEnabled(v => !v)}
              style={{
                background: aiEnabled ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${aiEnabled ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.07)'}`,
                boxShadow: aiEnabled ? '0 0 20px rgba(124,58,237,0.1)' : 'none',
                borderRadius: 15, padding: '14px 18px', textAlign: 'left', width: '100%', cursor: 'pointer',
                transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
              }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {/* Sparkles SVG */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={aiEnabled ? '#A78BFA' : 'rgba(196,181,253,0.4)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
                    <path d="M5 5l1 2 1-2-1-2z" /><path d="M19 19l1 2 1-2-1-2z" />
                  </svg>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: aiEnabled ? '#C4B5FD' : 'rgba(196,181,253,0.55)', lineHeight: 1.2 }}>
                      Détection texte IA
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)', marginTop: 1 }}>Claude Vision</p>
                  </div>
                </div>
                {/* Toggle */}
                <div className={`sf-toggle-track ${aiEnabled ? 'on' : 'off'}`} style={{ flexShrink: 0 }}>
                  <span className="sf-toggle-thumb" />
                </div>
              </div>
              {aiEnabled && (
                <p className="sf-anim-slide-up" style={{ marginTop: 10, fontSize: 11, lineHeight: 1.55, color: 'rgba(148,163,184,0.5)' }}>
                  Analyse et recopie le texte des vidéos automatiquement.
                </p>
              )}
              {aiEnabled && !anthropicKey && (
                <div className="flex items-center gap-1.5" style={{ marginTop: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#F59E0B' }}>Clé Anthropic manquante</p>
                </div>
              )}
            </button>

            {/* Card 3 — Point de coupe */}
            <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(148,163,184,0.45)' }}>Coupe Phase 2</p>
              <div className="flex gap-2">
                {/* Auto */}
                <button onClick={() => setSplitMode('auto')}
                  className="flex items-center justify-center gap-1.5 flex-1"
                  style={{
                    padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    ...(splitMode === 'auto'
                      ? { background: 'linear-gradient(135deg,#7C3AED,#6D28D9)', color: '#fff', border: '1px solid transparent' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.45)', border: '1px solid rgba(255,255,255,0.07)' })
                  }}>
                  {/* Brain/chip icon */}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="8" /><line x1="12" y1="16" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="8" y2="12" /><line x1="16" y1="12" x2="22" y2="12" />
                  </svg>
                  Auto
                </button>
                {/* Manuel */}
                <button
                  onClick={() => { setSplitMode('manual'); if (canLaunch) openPreview() }}
                  className="flex items-center justify-center gap-1.5 flex-1"
                  style={{
                    padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    ...(splitMode === 'manual'
                      ? { background: 'linear-gradient(135deg,#7C3AED,#6D28D9)', color: '#fff', border: '1px solid transparent' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.45)', border: '1px solid rgba(255,255,255,0.07)' })
                  }}>
                  {/* Scissors icon */}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" />
                    <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
                    <line x1="8.12" y1="8.12" x2="12" y2="12" />
                  </svg>
                  Manuel
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)', lineHeight: 1.5 }}>
                {splitMode === 'manual'
                  ? 'Définissez le point de coupe par vidéo dans l\'aperçu.'
                  : 'Détecte automatiquement la scène de changement.'}
              </p>
            </div>

            {/* Card 4 — Format de sortie */}
            <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '14px 18px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(148,163,184,0.45)', marginBottom: 10 }}>Format</p>
              <div className="flex gap-2">
                {(['9:16', '1:1', '16:9'] as Preset[]).map(p => (
                  <button key={p} onClick={() => setPreset(p)}
                    style={{
                      flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
                      ...(preset === p
                        ? { background: 'rgba(139,92,246,0.15)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' }
                        : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.38)', border: '1px solid rgba(255,255,255,0.07)' })
                    }}>{p}</button>
                ))}
              </div>
            </div>

            {/* Card 5 — Destination */}
            <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(148,163,184,0.45)' }}>Destination</p>
              <div className="flex gap-2">
                {/* Banque */}
                <button onClick={() => setExportMode('bank')}
                  className="flex items-center justify-center gap-1.5 flex-1"
                  style={{
                    padding: '8px 6px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    ...(exportMode === 'bank'
                      ? { background: 'rgba(124,58,237,0.12)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.42)', border: '1px solid rgba(255,255,255,0.07)' })
                  }}>
                  {/* Cloud icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                  </svg>
                  Banque
                </button>
                {/* Dossier local */}
                <button onClick={() => setExportMode('folder')}
                  className="flex items-center justify-center gap-1.5 flex-1"
                  style={{
                    padding: '8px 6px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    ...(exportMode === 'folder'
                      ? { background: 'rgba(124,58,237,0.12)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.42)', border: '1px solid rgba(255,255,255,0.07)' })
                  }}>
                  {/* Folder icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  Dossier local
                </button>
              </div>

              {exportMode === 'bank' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {bankFolders.length > 0 && (
                    <select
                      value={bankFolders.includes(bankFolder) ? bankFolder : ''}
                      onChange={e => setBankFolder(e.target.value)}
                      style={{ width: '100%', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2d9f3', outline: 'none' }}>
                      <option value="" style={{ background: '#0c0919', color: '#e2d9f3' }}>— Racine (sans dossier)</option>
                      {bankFolders.map(f => <option key={f} value={f} style={{ background: '#0c0919', color: '#e2d9f3' }}>{f}</option>)}
                    </select>
                  )}
                  <input type="text"
                    placeholder={bankFolders.length > 0 ? 'Ou nouveau dossier…' : 'Dossier (optionnel)'}
                    value={bankFolder} onChange={e => setBankFolder(e.target.value)}
                    className="sf-input"
                    style={{ borderColor: bankFolder.trim() ? 'rgba(139,92,246,0.5)' : undefined }} />
                </div>
              )}
              {exportMode === 'folder' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <button onClick={async () => { const f = await window.electronAPI?.pickOutputFolder?.(); if (f) setOutputFolder(f) }}
                    className="flex items-center justify-center gap-2"
                    style={{ width: '100%', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, background: 'rgba(139,92,246,0.08)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.18)', cursor: 'pointer' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    Choisir un dossier…
                  </button>
                  {outputFolder && <p style={{ fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(148,163,184,0.42)' }}>{outputFolder}</p>}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
