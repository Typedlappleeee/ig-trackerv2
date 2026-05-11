import { useState, useRef, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { BankPicker } from './Bank'
import { playSuccess, playWhoosh, playError } from '@/lib/sounds'

interface RemixProps { user: User }

type Step = 1 | 2 | 3 | 4
type BlendMode = 'screen' | 'multiply'
type Preset = '9:16' | '1:1' | '16:9'
type OverlayMode = 'blend' | 'ai'

interface TextOverlayUI {
  id:        number
  text:      string
  position:  string
  x:         string
  y:         string
  fontSize:  number
  fontColor: string
  bold:      boolean
  shadow:    boolean
  startTime: number
  endTime:   number
}

const POS_MAP: Record<string, { x: string; y: string }> = {
  'top-left':      { x: 'w*0.03',          y: 'h*0.04'            },
  'top-center':    { x: '(w-text_w)/2',    y: 'h*0.04'            },
  'top-right':     { x: 'w*0.97-text_w',   y: 'h*0.04'            },
  'middle-left':   { x: 'w*0.03',          y: '(h-text_h)/2'      },
  'middle-center': { x: '(w-text_w)/2',    y: '(h-text_h)/2'      },
  'middle-right':  { x: 'w*0.97-text_w',   y: '(h-text_h)/2'      },
  'bottom-left':   { x: 'w*0.03',          y: 'h*0.88'            },
  'bottom-center': { x: '(w-text_w)/2',    y: 'h*0.88'            },
  'bottom-right':  { x: 'w*0.97-text_w',   y: 'h*0.88'            },
}
const SIZE_MAP: Record<string, number> = { small: 28, medium: 42, large: 60, xlarge: 80 }

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function localVideoUrl(filePath: string): string {
  let n = filePath.replace(/\\/g, '/')
  if (!n.startsWith('/')) n = '/' + n
  return 'localvideo://' + n
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDot({ n, current, label }: { n: number; current: number; label: string }) {
  const done   = current > n
  const active = current === n
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 transition-all duration-300"
        style={done
          ? { background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: '#fff' }
          : active
            ? { background: 'rgba(139,92,246,0.2)', border: '2px solid #8b5cf6', color: '#a78bfa' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(196,181,253,0.3)' }
        }
      >
        {done ? '✓' : n}
      </div>
      <span className="text-xs font-medium" style={{ color: active ? '#c4b5fd' : done ? '#a78bfa' : 'rgba(196,181,253,0.3)' }}>
        {label}
      </span>
    </div>
  )
}

// ── Split-point scrubber ──────────────────────────────────────────────────────
function SplitScrubber({
  duration, splitTime, onChange,
}: { duration: number; splitTime: number; onChange: (t: number) => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function fromEvent(e: MouseEvent | React.MouseEvent) {
    if (!barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onChange(Math.round(ratio * duration * 10) / 10)
  }

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true
    fromEvent(e)
    e.preventDefault()
  }

  useEffect(() => {
    function onMove(e: MouseEvent) { if (dragging.current) fromEvent(e) }
    function onUp()  { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [duration])

  const pct = duration > 0 ? (splitTime / duration) * 100 : 0

  return (
    <div className="space-y-2">
      {/* Labels */}
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: 'rgba(196,181,253,0.5)' }}>0:00</span>
        <span className="font-semibold" style={{ color: '#a78bfa' }}>
          ✂ {fmtTime(splitTime)}
        </span>
        <span style={{ color: 'rgba(196,181,253,0.5)' }}>{fmtTime(duration)}</span>
      </div>

      {/* Bar */}
      <div
        ref={barRef}
        onMouseDown={onMouseDown}
        className="relative h-8 rounded-xl cursor-pointer select-none"
        style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        {/* Phase 1 fill */}
        <div
          className="absolute top-0 left-0 h-full rounded-l-xl transition-none"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, rgba(124,58,237,0.35), rgba(139,92,246,0.2))',
          }}
        />
        {/* Phase 2 fill */}
        <div
          className="absolute top-0 h-full rounded-r-xl"
          style={{
            left: `${pct}%`, right: 0,
            background: 'rgba(236,72,153,0.10)',
          }}
        />

        {/* Handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          style={{ left: `${pct}%` }}
        >
          <div
            className="w-5 h-8 rounded-full shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing"
            style={{
              background: 'linear-gradient(135deg,#7c3aed,#ec4899)',
              boxShadow: '0 0 12px rgba(124,58,237,0.6)',
              width: 4, height: 32, borderRadius: 4,
            }}
          />
        </div>

        {/* Phase labels inside bar */}
        <div className="absolute inset-0 flex items-center pointer-events-none px-3">
          {pct > 18 && (
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(196,181,253,0.5)', width: `${pct}%` }}>
              Phase 1
            </span>
          )}
          {pct < 82 && (
            <span className="text-[9px] font-bold uppercase tracking-wider ml-auto" style={{ color: 'rgba(236,72,153,0.5)' }}>
              Phase 2
            </span>
          )}
        </div>
      </div>

      {/* Duration summary */}
      <div className="flex gap-3">
        <div className="flex-1 rounded-lg px-3 py-2 text-center"
          style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
          <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: '#8b5cf6' }}>Phase 1</p>
          <p className="text-sm font-black text-white">{fmtTime(splitTime)}</p>
        </div>
        <div className="flex-1 rounded-lg px-3 py-2 text-center"
          style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.15)' }}>
          <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: '#ec4899' }}>Phase 2</p>
          <p className="text-sm font-black text-white">{fmtTime(Math.max(0, duration - splitTime))}</p>
        </div>
      </div>
    </div>
  )
}

// ── Video preview card ────────────────────────────────────────────────────────
function VideoCard({
  label, filePath, accent = '#8b5cf6', badge,
  onDurationLoad,
}: {
  label: string; filePath: string | null; accent?: string; badge?: string;
  onDurationLoad?: (d: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && filePath) {
      videoRef.current.src = localVideoUrl(filePath)
      videoRef.current.load()
    }
  }, [filePath])

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'rgba(8,5,20,0.8)', border: `1px solid ${accent}30` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: `1px solid ${accent}18`, background: `${accent}08` }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>{label}</span>
        {badge && (
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: `${accent}22`, color: accent }}>
            {badge}
          </span>
        )}
      </div>

      {/* Video or placeholder */}
      <div className="relative" style={{ aspectRatio: '9/16', background: '#000' }}>
        {filePath ? (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            onLoadedMetadata={() => {
              if (videoRef.current && onDurationLoad)
                onDurationLoad(videoRef.current.duration)
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: `${accent}12`, border: `1px solid ${accent}20` }}>
              🎬
            </div>
            <p className="text-xs text-center px-4" style={{ color: 'rgba(196,181,253,0.35)' }}>
              Aucune vidéo sélectionnée
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Remix({ user }: RemixProps) {
  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [originalPath, setOriginalPath] = useState<string | null>(null)
  const [originalDur,  setOriginalDur]  = useState(0)
  const [splitTime,    setSplitTime]    = useState(0)
  const [showBankOrig, setShowBankOrig] = useState(false)

  // Step 2
  const [newPhase1Path, setNewPhase1Path] = useState<string | null>(null)
  const [showBankNew,   setShowBankNew]   = useState(false)
  const [textOverlay,   setTextOverlay]   = useState(true)
  const [textBlend,     setTextBlend]     = useState(0.35)
  const [blendMode,     setBlendMode]     = useState<BlendMode>('screen')
  const [preset,        setPreset]        = useState<Preset>('9:16')

  // AI mode
  const [overlayMode,    setOverlayMode]   = useState<OverlayMode>('blend')
  const [anthropicKey,   setAnthropicKey]  = useState(() => localStorage.getItem('sf_anthropic_key') ?? '')
  const [analyzing,      setAnalyzing]     = useState(false)
  const [analyzeStep,    setAnalyzeStep]   = useState<{ ok: boolean; text: string } | null>(null)
  const [detectedOverlays, setDetectedOverlays] = useState<TextOverlayUI[]>([])

  // Step 4
  const [generating,     setGenerating]    = useState(false)
  const [result,         setResult]        = useState<{ ok: boolean; outputPath?: string; error?: string; command?: string } | null>(null)
  const [showCommand,    setShowCommand]   = useState(false)
  const [detecting,      setDetecting]     = useState(false)
  const [detectMsg,      setDetectMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  const handleOrigDur = useCallback((d: number) => {
    setOriginalDur(d)
    setSplitTime(prev => prev === 0 ? Math.round(d * 0.5 * 10) / 10 : prev)
  }, [])

  async function pickOrigFromPC() {
    const p = await window.electronAPI?.pickVideoFile?.()
    if (p) { setOriginalPath(p); setDetectMsg(null); playWhoosh() }
  }

  async function pickNewFromPC() {
    const p = await window.electronAPI?.pickVideoFile?.()
    if (p) { setNewPhase1Path(p); playWhoosh() }
  }

  async function autoDetectSplit() {
    if (!originalPath) return
    setDetecting(true); setDetectMsg(null)
    const r = await window.electronAPI!.detectSceneChange!({ filePath: originalPath, threshold: 0.28 })
    setDetecting(false)
    if (r.ok && r.splitTime != null) {
      setSplitTime(Math.round(r.splitTime * 10) / 10)
      const allTimes = r.times.map(t => fmtTime(t)).join(', ')
      setDetectMsg({ ok: true, text: `Coupure détectée à ${fmtTime(r.splitTime)}${r.times.length > 1 ? ` (autres : ${allTimes})` : ''}` })
      playSuccess()
    } else {
      setDetectMsg({ ok: false, text: r.error ?? 'Aucune coupure détectée — ajuste manuellement.' })
      playError()
    }
  }

  async function analyzeWithAI() {
    if (!originalPath || !anthropicKey.trim()) return
    setAnalyzing(true)
    setAnalyzeStep({ ok: true, text: 'Extraction des frames vidéo…' })
    setDetectedOverlays([])

    try {
      const framesResult = await window.electronAPI!.extractFrames!({ filePath: originalPath, endTime: splitTime })
      if (!framesResult.ok || !framesResult.frames?.length) {
        throw new Error(framesResult.error ?? 'Impossible d\'extraire les frames')
      }

      setAnalyzeStep({ ok: true, text: `${framesResult.frames.length} frames extraites — Analyse Claude Vision…` })

      // Build multi-image message
      const imageBlocks = framesResult.frames.flatMap((f, i) => [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } },
        { type: 'text', text: `[Frame ${i} — t=${f.timestamp}s]` },
      ])

      const interval = splitTime / (framesResult.frames.length || 1)
      const prompt = `These are ${framesResult.frames.length} video frames from a ${splitTime.toFixed(1)}-second clip, sampled at regular intervals.\n\nIdentify ALL burned-in text overlays (captions, subtitles, titles, text graphics). For each unique text element return a JSON array:\n[\n  {\n    "text": "exact text",\n    "position": "top-center",\n    "fontSize": "medium",\n    "fontColor": "white",\n    "bold": true,\n    "startFrame": 0,\n    "endFrame": 3\n  }\n]\nposition: top-left | top-center | top-right | middle-center | bottom-left | bottom-center | bottom-right\nfontSize: small | medium | large | xlarge\nDo NOT include background scene text. Return ONLY the JSON array.`

      const result = await window.electronAPI!.anthropicVisionRequest!({
        apiKey: anthropicKey.trim(),
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
        maxTokens: 2000,
      })

      if (!result.ok) throw new Error(result.error ?? 'Erreur API Anthropic')

      const rawText = (result.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? '[]'
      let parsed: Array<{ text: string; position: string; fontSize: string; fontColor: string; bold?: boolean; startFrame: number; endFrame: number }> = []
      try {
        const m = rawText.match(/\[[\s\S]*\]/)
        if (m) parsed = JSON.parse(m[0])
      } catch { throw new Error('Réponse IA invalide — réessaie') }

      const overlays: TextOverlayUI[] = parsed.map((item, idx) => {
        const pos = POS_MAP[item.position] ?? POS_MAP['bottom-center']
        return {
          id:        idx,
          text:      item.text,
          position:  item.position,
          x:         pos.x,
          y:         pos.y,
          fontSize:  SIZE_MAP[item.fontSize] ?? 42,
          fontColor: item.fontColor ?? 'white',
          bold:      item.bold ?? false,
          shadow:    true,
          startTime: Math.round(item.startFrame * interval * 10) / 10,
          endTime:   Math.min(splitTime, Math.round((item.endFrame + 1) * interval * 10) / 10),
        }
      })

      setDetectedOverlays(overlays)
      if (overlays.length > 0) {
        setAnalyzeStep({ ok: true, text: `✓ ${overlays.length} élément(s) détecté(s)` })
        playSuccess()
      } else {
        setAnalyzeStep({ ok: false, text: 'Aucun texte détecté dans cette phase — essaie le mode Blend' })
        playError()
      }
    } catch (err: unknown) {
      setAnalyzeStep({ ok: false, text: err instanceof Error ? err.message : String(err) })
      playError()
    } finally {
      setAnalyzing(false)
    }
  }

  async function generate() {
    if (!originalPath || !newPhase1Path) return
    const outputPath = await window.electronAPI?.pickOutputFile?.({ defaultName: 'remix_output.mp4' })
    if (!outputPath) return

    setGenerating(true)
    setResult(null)

    let r: { ok: boolean; outputPath?: string; error?: string; command?: string }

    if (overlayMode === 'ai' && detectedOverlays.length > 0) {
      r = await window.electronAPI!.runFfmpegRemixAI!({
        newPhase1Path,
        originalPath,
        splitTime,
        outputPath,
        preset,
        textOverlays: detectedOverlays.map(o => ({
          text: o.text, x: o.x, y: o.y,
          fontSize: o.fontSize, fontColor: o.fontColor,
          startTime: o.startTime, endTime: o.endTime,
          bold: o.bold, shadow: o.shadow,
        })),
      })
    } else {
      r = await window.electronAPI!.runFfmpegRemix!({
        originalPath,
        newPhase1Path,
        splitTime,
        outputPath,
        textBlend: textOverlay ? textBlend : 0,
        blendMode,
        preset,
      })
    }

    setGenerating(false)
    setResult(r)
    if (r.ok) playSuccess()
    else playError()
  }

  const canGoStep2 = !!originalPath && originalDur > 0 && splitTime > 0 && splitTime < originalDur
  const canGoStep3 = !!newPhase1Path

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  function renderStep1() {
    return (
      <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
        {/* Left: controls */}
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-black text-white mb-1">Vidéo originale</h2>
            <p className="text-xs" style={{ color: 'rgba(196,181,253,0.5)' }}>
              Sélectionne la vidéo source contenant les 2 phases, puis définis le point de séparation.
            </p>
          </div>

          {/* Pick buttons */}
          <div className="flex gap-3">
            <Button onClick={() => { setShowBankOrig(true); playWhoosh() }}>
              🗂 Depuis la banque
            </Button>
            <Button variant="secondary" onClick={pickOrigFromPC}>
              💾 Depuis le PC
            </Button>
            {originalPath && (
              <Button variant="secondary" onClick={() => { setOriginalPath(null); setOriginalDur(0) }}>
                ✕
              </Button>
            )}
          </div>

          {originalPath && (
            <div className="rounded-xl px-3 py-2 text-xs font-mono truncate"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', color: '#a78bfa' }}>
              {originalPath.split(/[\\/]/).pop()}
            </div>
          )}

          {/* Auto-detect button */}
          {originalPath && (
            <div className="space-y-2">
              <button
                onClick={autoDetectSplit}
                disabled={detecting || !originalDur}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(130deg,#7c3aed,#ec4899)',
                  color: '#fff',
                  boxShadow: '0 2px 16px -4px rgba(124,58,237,0.5)',
                }}
              >
                {detecting ? (
                  <><Spinner size="sm" /> Analyse en cours…</>
                ) : (
                  <>✨ Détecter automatiquement la coupure</>
                )}
              </button>

              {detectMsg && (
                <div
                  className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                  style={detectMsg.ok
                    ? { background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }
                    : { background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }
                  }
                >
                  <span>{detectMsg.ok ? '✓' : '⚠'}</span>
                  <span>{detectMsg.text}</span>
                </div>
              )}
            </div>
          )}

          {/* Split scrubber */}
          {originalDur > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold" style={{ color: 'rgba(196,181,253,0.6)' }}>
                Ajuste manuellement si nécessaire
              </p>
              <SplitScrubber
                duration={originalDur}
                splitTime={splitTime}
                onChange={t => setSplitTime(t)}
              />
              <input
                type="range" min={0.5} max={originalDur - 0.5} step={0.1}
                value={splitTime}
                onChange={e => setSplitTime(parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>
          )}

          {!originalPath && (
            <div className="rounded-2xl p-8 text-center"
              style={{ background: 'rgba(139,92,246,0.04)', border: '1px dashed rgba(139,92,246,0.2)' }}>
              <p className="text-4xl mb-3 opacity-40">🎬</p>
              <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                Sélectionne une vidéo pour commencer
              </p>
            </div>
          )}
        </div>

        {/* Right: video preview */}
        <div>
          <VideoCard
            label="Vidéo originale"
            filePath={originalPath}
            accent="#8b5cf6"
            badge={originalDur > 0 ? fmtTime(originalDur) : undefined}
            onDurationLoad={handleOrigDur}
          />
        </div>
      </div>
    )
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  function renderStep2() {
    return (
      <div className="grid grid-cols-[1fr_1fr] gap-6 items-start">
        {/* Left: new phase 1 + overlay config */}
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-black text-white mb-1">Nouvelle Phase 1</h2>
            <p className="text-xs" style={{ color: 'rgba(196,181,253,0.5)' }}>
              Cette vidéo remplacera la Phase 1 originale.
            </p>
          </div>

          {/* Pick buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => { setShowBankNew(true); playWhoosh() }}>
              🗂 Depuis la banque
            </Button>
            <Button variant="secondary" onClick={pickNewFromPC}>
              💾 Depuis le PC
            </Button>
            {newPhase1Path && (
              <Button variant="secondary" onClick={() => setNewPhase1Path(null)}>✕</Button>
            )}
          </div>

          {newPhase1Path && (
            <div className="rounded-xl px-3 py-2 text-xs font-mono truncate"
              style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.15)', color: '#f472b6' }}>
              {newPhase1Path.split(/[\\/]/).pop()}
            </div>
          )}

          {/* Overlay mode tabs */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.15)' }}>

            {/* Tab bar */}
            <div className="flex" style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
              {([['blend', '🎞 Blend vidéo'], ['ai', '✨ Détection IA']] as [OverlayMode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setOverlayMode(m)}
                  className="flex-1 py-2.5 text-xs font-bold transition-all"
                  style={overlayMode === m
                    ? { background: 'linear-gradient(130deg,#7c3aed20,#ec489914)', color: '#c4b5fd', borderBottom: '2px solid #8b5cf6' }
                    : { color: 'rgba(196,181,253,0.35)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Blend mode panel */}
            {overlayMode === 'blend' && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Superposition de texte</p>
                    <p className="text-[11px]" style={{ color: 'rgba(196,181,253,0.45)' }}>
                      Fusionne la Phase 1 originale sur la nouvelle pour faire ressortir le texte
                    </p>
                  </div>
                  <button
                    onClick={() => setTextOverlay(v => !v)}
                    className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
                    style={{ background: textOverlay ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.1)' }}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${textOverlay ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {textOverlay && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(196,181,253,0.45)' }}>
                        Mode de fusion
                      </p>
                      <div className="flex gap-2">
                        {(['screen', 'multiply'] as BlendMode[]).map(m => (
                          <button
                            key={m}
                            onClick={() => setBlendMode(m)}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={blendMode === m
                              ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                              : { background: 'rgba(139,92,246,0.08)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.15)' }
                            }
                          >
                            {m === 'screen' ? '☀ Screen' : '✦ Multiply'}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] mt-1.5" style={{ color: 'rgba(196,181,253,0.35)' }}>
                        {blendMode === 'screen' ? 'Idéal pour texte blanc sur fond sombre' : 'Idéal pour texte sombre sur fond clair'}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(196,181,253,0.45)' }}>
                          Intensité
                        </p>
                        <span className="text-xs font-mono font-bold" style={{ color: '#a78bfa' }}>
                          {Math.round(textBlend * 100)}%
                        </span>
                      </div>
                      <input
                        type="range" min={0.1} max={1} step={0.05}
                        value={textBlend}
                        onChange={e => setTextBlend(parseFloat(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI mode panel */}
            {overlayMode === 'ai' && (
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-white mb-1">Détection IA des textes</p>
                  <p className="text-[11px]" style={{ color: 'rgba(196,181,253,0.45)' }}>
                    Claude Vision analyse la Phase 1 originale, détecte les textes et les réapplique proprement sur ta nouvelle vidéo via FFmpeg.
                  </p>
                </div>

                {/* API key input */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold block mb-1.5" style={{ color: 'rgba(196,181,253,0.45)' }}>
                    Clé API Anthropic
                  </label>
                  <input
                    type="password"
                    placeholder="sk-ant-…"
                    value={anthropicKey}
                    onChange={e => {
                      setAnthropicKey(e.target.value)
                      localStorage.setItem('sf_anthropic_key', e.target.value)
                    }}
                    className="w-full rounded-lg px-3 py-2 text-xs font-mono outline-none"
                    style={{
                      background: 'rgba(139,92,246,0.08)',
                      border: '1px solid rgba(139,92,246,0.2)',
                      color: '#c4b5fd',
                    }}
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(196,181,253,0.3)' }}>
                    console.anthropic.com — modèle Haiku (économique)
                  </p>
                </div>

                {/* Analyse button */}
                <button
                  onClick={analyzeWithAI}
                  disabled={analyzing || !originalPath || !anthropicKey.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(130deg,#7c3aed,#ec4899)',
                    color: '#fff',
                    boxShadow: '0 2px 16px -4px rgba(124,58,237,0.5)',
                  }}
                >
                  {analyzing ? <><Spinner size="sm" /> Analyse en cours…</> : <>✨ Analyser la Phase 1</>}
                </button>

                {analyzeStep && (
                  <div
                    className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                    style={analyzeStep.ok
                      ? { background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }
                      : { background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }
                    }
                  >
                    <span>{analyzeStep.ok ? '✓' : '⚠'}</span>
                    <span>{analyzeStep.text}</span>
                  </div>
                )}

                {/* Detected overlays list */}
                {detectedOverlays.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(196,181,253,0.45)' }}>
                      Textes détectés ({detectedOverlays.length})
                    </p>
                    {detectedOverlays.map(ov => (
                      <div
                        key={ov.id}
                        className="rounded-xl px-3 py-2.5 flex items-start gap-3"
                        style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">"{ov.text}"</p>
                          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.45)' }}>
                            {ov.position} · {ov.fontColor} · {ov.fontSize}px · {fmtTime(ov.startTime)}→{fmtTime(ov.endTime)}
                          </p>
                        </div>
                        <button
                          onClick={() => setDetectedOverlays(prev => prev.filter(o => o.id !== ov.id))}
                          className="text-[11px] px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ color: 'rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.08)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Output format */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(196,181,253,0.45)' }}>
              Format de sortie
            </p>
            <div className="flex gap-2">
              {(['9:16', '1:1', '16:9'] as Preset[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  style={preset === p
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                    : { background: 'rgba(139,92,246,0.06)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: preview both videos */}
        <div className="space-y-4">
          <VideoCard label="Référence (Phase 1 originale)" filePath={originalPath} accent="#8b5cf6" />
          <VideoCard label="Nouvelle Phase 1" filePath={newPhase1Path} accent="#ec4899" />
        </div>
      </div>
    )
  }

  // ── Step 3 — Summary ─────────────────────────────────────────────────────────
  function renderStep3() {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-black text-white">Récapitulatif</h2>
          <p className="text-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>
            Vérifie les paramètres avant de générer la vidéo finale
          </p>
        </div>

        {/* Summary cards */}
        <div className="space-y-3">
          {/* Phase 1 */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>1</div>
              <span className="text-sm font-bold text-white">Phase 1 — Remplacée</span>
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }}>
                {fmtTime(splitTime)}
              </span>
            </div>
            <div className="space-y-1.5 text-xs" style={{ color: 'rgba(196,181,253,0.6)' }}>
              <div className="flex gap-2">
                <span className="opacity-50">Vidéo</span>
                <span className="font-mono truncate text-white/80">
                  {newPhase1Path?.split(/[\\/]/).pop()}
                </span>
              </div>
              {overlayMode === 'ai' ? (
                <div className="flex gap-2">
                  <span className="opacity-50">Texte</span>
                  <span style={{ color: '#a78bfa' }}>
                    IA · {detectedOverlays.length} élément(s)
                  </span>
                </div>
              ) : textOverlay ? (
                <div className="flex gap-2">
                  <span className="opacity-50">Texte</span>
                  <span style={{ color: '#a78bfa' }}>
                    Blend {blendMode === 'screen' ? 'Screen' : 'Multiply'} · {Math.round(textBlend * 100)}%
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <span className="opacity-50">Texte</span>
                  <span style={{ color: 'rgba(196,181,253,0.4)' }}>Désactivé</span>
                </div>
              )}
            </div>
          </div>

          {/* Phase 2 */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: 'linear-gradient(135deg,#ec4899,#f472b6)' }}>2</div>
              <span className="text-sm font-bold text-white">Phase 2 — Inchangée</span>
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(236,72,153,0.15)', color: '#f472b6' }}>
                {fmtTime(Math.max(0, originalDur - splitTime))}
              </span>
            </div>
            <div className="text-xs" style={{ color: 'rgba(196,181,253,0.6)' }}>
              <div className="flex gap-2">
                <span className="opacity-50">Source</span>
                <span className="font-mono truncate text-white/80">
                  {originalPath?.split(/[\\/]/).pop()}
                </span>
              </div>
            </div>
          </div>

          {/* Output info */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between text-xs" style={{ color: 'rgba(196,181,253,0.5)' }}>
              <span>Durée totale</span>
              <span className="font-bold text-white">≈ {fmtTime(originalDur)}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-2" style={{ color: 'rgba(196,181,253,0.5)' }}>
              <span>Format de sortie</span>
              <span className="font-bold" style={{ color: '#a78bfa' }}>{preset}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-2" style={{ color: 'rgba(196,181,253,0.5)' }}>
              <span>Encodage</span>
              <span className="font-mono" style={{ color: 'rgba(196,181,253,0.4)' }}>H.264 CRF23 · AAC 128k</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 4 — Generation ──────────────────────────────────────────────────────
  function renderStep4() {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        {generating ? (
          <div className="text-center space-y-5 py-8">
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.3)' }}>
                <Spinner size="lg" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-white">Génération en cours…</p>
              <p className="text-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>
                FFmpeg fusionne les phases et applique le texte
              </p>
            </div>
            <div className="rounded-xl px-4 py-2 text-xs font-mono space-y-0.5"
              style={{ background: 'rgba(8,5,20,0.6)', border: '1px solid rgba(139,92,246,0.1)', color: 'rgba(196,181,253,0.4)', textAlign: 'left' }}>
              <div>• Split Phase 1 : {fmtTime(splitTime)}</div>
              <div>• Nouvelle Phase 1 : {newPhase1Path?.split(/[\\/]/).pop()}</div>
              {overlayMode === 'ai' && detectedOverlays.length > 0
                ? <div>• Texte IA : {detectedOverlays.length} élément(s) détecté(s)</div>
                : textOverlay && <div>• Blend texte ({blendMode}, {Math.round(textBlend * 100)}%)</div>
              }
              <div>• Concat Phase 2 : {fmtTime(Math.max(0, originalDur - splitTime))}</div>
            </div>
          </div>
        ) : result ? (
          result.ok ? (
            <div className="space-y-5">
              {/* Success */}
              <div className="text-center space-y-3">
                <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>
                  ✅
                </div>
                <div>
                  <p className="text-lg font-black text-white">Vidéo générée !</p>
                  <p className="text-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>
                    La vidéo remix a été enregistrée avec succès
                  </p>
                </div>
              </div>
              <div className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: '#34d399' }}>
                  Fichier de sortie
                </p>
                <p className="text-xs font-mono text-white/80 break-all">{result.outputPath}</p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => { setStep(1); setResult(null); setOriginalPath(null); setNewPhase1Path(null); setOriginalDur(0); setSplitTime(0) }}
                  variant="secondary"
                >
                  ↺ Nouveau remix
                </Button>
                <Button onClick={() => { setStep(3); setResult(null) }}>
                  ⚙ Modifier et regénérer
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Error */}
              <div className="text-center space-y-3">
                <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  ❌
                </div>
                <div>
                  <p className="text-base font-black text-white">Erreur de génération</p>
                  <p className="text-sm mt-1 px-4" style={{ color: '#f87171' }}>{result.error}</p>
                </div>
              </div>
              <div className="rounded-xl p-4 space-y-2"
                style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#f87171' }}>
                  Cause possible
                </p>
                <p className="text-xs" style={{ color: 'rgba(196,181,253,0.5)' }}>
                  Vérifie que FFmpeg est installé sur ton système et accessible dans le PATH.
                  Sur Windows : installe FFmpeg et relance l'app.
                </p>
              </div>
              {result.command && (
                <div>
                  <button
                    onClick={() => setShowCommand(v => !v)}
                    className="text-xs font-semibold transition-colors"
                    style={{ color: 'rgba(139,92,246,0.7)' }}
                  >
                    {showCommand ? '▼' : '▶'} Voir la commande FFmpeg
                  </button>
                  {showCommand && (
                    <div className="mt-2 rounded-xl p-3 text-[10px] font-mono break-all leading-relaxed"
                      style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.1)' }}>
                      {result.command}
                    </div>
                  )}
                </div>
              )}
              <Button onClick={() => { setResult(null); generate() }}>
                ↺ Réessayer
              </Button>
            </div>
          )
        ) : (
          /* Ready to generate */
          <div className="text-center space-y-5 py-4">
            <div className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
              style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>
              🚀
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black text-white">Prêt à générer</p>
              <p className="text-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>
                Clique sur Générer pour lancer FFmpeg et créer ta vidéo finale
              </p>
            </div>
            <Button onClick={generate} size="lg">
              ⚡ Générer la vidéo finale
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ── BankPicker portals ───────────────────────────────────────────────────────
  const STEPS: { label: string }[] = [
    { label: 'Vidéo originale' },
    { label: 'Nouvelle Phase 1' },
    { label: 'Récapitulatif' },
    { label: 'Génération' },
  ]

  return (
    <>
      {showBankOrig && (
        <BankPicker
          user={user}
          mode="single"
          onSelect={paths => { setShowBankOrig(false); if (paths[0]) { setOriginalPath(paths[0]); playWhoosh() } }}
          onClose={() => setShowBankOrig(false)}
        />
      )}
      {showBankNew && (
        <BankPicker
          user={user}
          mode="single"
          onSelect={paths => { setShowBankNew(false); if (paths[0]) { setNewPhase1Path(paths[0]); playWhoosh() } }}
          onClose={() => setShowBankNew(false)}
        />
      )}

      <div className="flex flex-col h-full" style={{ background: '#06040f' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-6 py-4"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.6)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>
              🔀
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">Remix Vidéo</h1>
              <p className="text-[11px]" style={{ color: 'rgba(196,181,253,0.4)' }}>
                Remplace la Phase 1 d'une vidéo en conservant textes et Phase 2 originale
              </p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <StepDot n={i + 1} current={step} label={s.label} />
                {i < STEPS.length - 1 && (
                  <div className="w-8 h-px" style={{ background: 'rgba(139,92,246,0.2)' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto p-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* ── Footer nav ─────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-6 py-4 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(139,92,246,0.1)', background: 'rgba(6,4,15,0.8)' }}
        >
          <Button
            variant="secondary"
            onClick={() => setStep(s => Math.max(1, s - 1) as Step)}
            disabled={step === 1}
          >
            ← Retour
          </Button>

          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map(n => (
              <div
                key={n}
                className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                style={step === n
                  ? { background: '#8b5cf6', width: 24, borderRadius: 4 }
                  : step > n
                    ? { background: 'rgba(139,92,246,0.5)' }
                    : { background: 'rgba(139,92,246,0.15)' }
                }
              />
            ))}
          </div>

          {step < 4 ? (
            <Button
              onClick={() => {
                if (step === 3) { setStep(4); generate() }
                else setStep(s => Math.min(4, s + 1) as Step)
              }}
              disabled={
                (step === 1 && !canGoStep2) ||
                (step === 2 && !canGoStep3)
              }
            >
              {step === 3 ? '⚡ Générer →' : 'Suivant →'}
            </Button>
          ) : (
            <div style={{ width: 80 }} />
          )}
        </div>
      </div>
    </>
  )
}
