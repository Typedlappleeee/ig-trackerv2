import { useState, useRef, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { BankPicker } from './Bank'
import { playSuccess, playWhoosh, playError } from '@/lib/sounds'
import { supabase } from '@/lib/supabase'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'
import { checkAndDeductCredits, CREDIT_COSTS } from '@/lib/credits'
import { useOrg } from '@/lib/orgContext'
import { logActivity } from '@/lib/activityLog'
import { MassRemix } from './MassRemix'
import { useConnections } from '@/lib/connections'

interface RemixProps { user: User }

type Step = 1 | 2 | 3 | 4
type Preset = '9:16' | '1:1' | '16:9'

interface TextOverlayUI {
  id:        number
  text:      string
  position:  string
  x:         string   // FFmpeg expression for rendering
  y:         string   // FFmpeg expression for rendering
  xPercent:  number   // 0-100 for CSS preview positioning
  yPercent:  number   // 0-100 for CSS preview positioning
  fontSize:  number
  fontColor: string
  bold:      boolean
  shadow:    boolean
  startTime: number
  endTime:   number
}


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

// ── Step indicator ─────────────────────────────────────────────────────────────
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

// ── Split scrubber ─────────────────────────────────────────────────────────────
function SplitScrubber({ duration, splitTime, onChange }: { duration: number; splitTime: number; onChange: (t: number) => void }) {
  const barRef   = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function fromEvent(e: MouseEvent | React.MouseEvent) {
    if (!barRef.current) return
    const rect  = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onChange(Math.round(ratio * duration * 10) / 10)
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
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: 'rgba(196,181,253,0.5)' }}>0:00</span>
        <span className="font-semibold" style={{ color: '#a78bfa' }}>✂ {fmtTime(splitTime)}</span>
        <span style={{ color: 'rgba(196,181,253,0.5)' }}>{fmtTime(duration)}</span>
      </div>
      <div
        ref={barRef}
        onMouseDown={e => { dragging.current = true; fromEvent(e); e.preventDefault() }}
        className="relative h-8 rounded-xl cursor-pointer select-none"
        style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <div className="absolute top-0 left-0 h-full rounded-l-xl" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,rgba(124,58,237,0.35),rgba(139,92,246,0.2))' }} />
        <div className="absolute top-0 h-full rounded-r-xl" style={{ left: `${pct}%`, right: 0, background: 'rgba(236,72,153,0.10)' }} />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10" style={{ left: `${pct}%` }}>
          <div style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', boxShadow: '0 0 12px rgba(124,58,237,0.6)', width: 4, height: 32, borderRadius: 4 }} />
        </div>
        <div className="absolute inset-0 flex items-center pointer-events-none px-3">
          {pct > 18 && <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(196,181,253,0.5)', width: `${pct}%` }}>Phase 1</span>}
          {pct < 82 && <span className="text-[9px] font-bold uppercase tracking-wider ml-auto" style={{ color: 'rgba(236,72,153,0.5)' }}>Phase 2</span>}
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1 rounded-lg px-3 py-2 text-center" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
          <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: '#8b5cf6' }}>Phase 1</p>
          <p className="text-sm font-black text-white">{fmtTime(splitTime)}</p>
        </div>
        <div className="flex-1 rounded-lg px-3 py-2 text-center" style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.15)' }}>
          <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: '#ec4899' }}>Phase 2</p>
          <p className="text-sm font-black text-white">{fmtTime(Math.max(0, duration - splitTime))}</p>
        </div>
      </div>
    </div>
  )
}

// ── Video card ─────────────────────────────────────────────────────────────────
function VideoCard({ label, filePath, accent = '#8b5cf6', badge, onDurationLoad, overlays }: {
  label: string
  filePath: string | null
  accent?: string
  badge?: string
  onDurationLoad?: (d: number) => void
  overlays?: Array<{ text: string; xPercent: number; yPercent: number; fontSize: number; fontColor: string; bold?: boolean }>
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (videoRef.current && filePath) { videoRef.current.src = localVideoUrl(filePath); videoRef.current.load() }
  }, [filePath])
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'rgba(8,5,20,0.8)', border: `1px solid ${accent}30` }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${accent}18`, background: `${accent}08` }}>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>{label}</span>
        {badge && <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: `${accent}22`, color: accent }}>{badge}</span>}
      </div>
      <div className="relative" style={{ aspectRatio: '9/16', background: '#000', containerType: 'inline-size' } as React.CSSProperties}>
        {filePath ? (
          <video ref={videoRef} className="w-full h-full object-contain" controls
            onLoadedMetadata={() => { if (videoRef.current && onDurationLoad) onDurationLoad(videoRef.current.duration) }} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: `${accent}12`, border: `1px solid ${accent}20` }}>🎬</div>
            <p className="text-xs text-center px-4" style={{ color: 'rgba(196,181,253,0.35)' }}>Aucune vidéo sélectionnée</p>
          </div>
        )}
        {overlays?.map((ov, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{
              left: `${ov.xPercent}%`,
              top: `${ov.yPercent}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `calc(${(ov.fontSize / 10.8).toFixed(2)} * 1cqw)`,
              color: ov.fontColor,
              fontWeight: ov.bold ? '900' : 'normal',
              textShadow: '0 0 8px rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,0.9), -1px -1px 0 rgba(0,0,0,0.9)',
              whiteSpace: 'nowrap',
              zIndex: 10,
              lineHeight: 1.1,
            }}
          >
            {ov.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function Remix({ user }: RemixProps) {
  const { currentOrg } = useOrg()
  const conns = useConnections(user)
  const [mode, setMode] = useState<'solo' | 'masse'>('solo')
  const [step, setStep] = useState<Step>(1)

  // Step 1 — original video
  const [originalPath, setOriginalPath]   = useState<string | null>(null)
  const [originalDur,  setOriginalDur]    = useState(0)
  const [splitTime,    setSplitTime]      = useState(0)
  const [showBankOrig, setShowBankOrig]   = useState(false)
  const [detecting,    setDetecting]      = useState(false)
  const [detectMsg,    setDetectMsg]      = useState<{ ok: boolean; text: string } | null>(null)
  const [aiDetecting,  setAiDetecting]    = useState(false)
  const [aiDetectMsg,  setAiDetectMsg]    = useState<{ ok: boolean; text: string } | null>(null)

  // Step 2 — new phase 1
  const [newPhase1Path, setNewPhase1Path] = useState<string | null>(null)
  const [showBankNew,   setShowBankNew]   = useState(false)
  const [preset,        setPreset]        = useState<Preset>('9:16')

  // AI text analysis
  // anthropic key: from DB (connections) with localStorage fallback
  const anthropicKey = conns.anthropic || localStorage.getItem('sf_anthropic_key') || ''
  const [analyzing,        setAnalyzing]         = useState(false)
  const [analyzeStep,      setAnalyzeStep]       = useState<{ ok: boolean; text: string } | null>(null)
  const [detectedOverlays, setDetectedOverlays]  = useState<TextOverlayUI[]>([])

  // Step 4 — generation
  const [generating,    setGenerating]    = useState(false)
  const [result,        setResult]        = useState<{ ok: boolean; outputPath?: string; error?: string; command?: string } | null>(null)
  const [showCommand,   setShowCommand]   = useState(false)
  const [bankUploading, setBankUploading] = useState(false)
  const [bankDone,      setBankDone]      = useState(false)

  const handleOrigDur = useCallback((d: number) => {
    setOriginalDur(d)
    setSplitTime(prev => prev === 0 ? Math.round(d * 0.5 * 10) / 10 : prev)
  }, [])

  async function pickOrigFromPC() {
    const p = await window.electronAPI?.pickVideoFile?.()
    if (p) { setOriginalPath(p); setDetectMsg(null); setAiDetectMsg(null); playWhoosh() }
  }
  async function pickNewFromPC() {
    const p = await window.electronAPI?.pickVideoFile?.()
    if (p) { setNewPhase1Path(p); playWhoosh() }
  }

  async function autoDetectSplit() {
    if (!originalPath) return
    setDetecting(true); setDetectMsg(null); setAiDetectMsg(null)
    const r = await window.electronAPI!.detectSceneChange!({ filePath: originalPath })
    setDetecting(false)
    if (r.ok && r.splitTime != null) {
      const t = Math.min(originalDur - 0.1, Math.round((r.splitTime + 0.1) * 10) / 10)
      setSplitTime(t)
      setDetectMsg({ ok: true, text: `Coupure détectée à ${fmtTime(r.splitTime)} → ${fmtTime(t)} (+0.1s)` })
      playSuccess()
    } else {
      setDetectMsg({ ok: false, text: r.error ?? 'Aucune coupure détectée' })
      playError()
    }
  }

  async function aiDetectSplit() {
    if (!originalPath || !anthropicKey.trim()) return
    setAiDetecting(true); setAiDetectMsg({ ok: true, text: 'Extraction des frames…' }); setDetectMsg(null)
    try {
      const fr = await window.electronAPI!.extractFrames!({ filePath: originalPath, endTime: originalDur || 60 })
      if (!fr.ok || !fr.frames?.length) throw new Error(fr.error ?? 'Impossible d\'extraire les frames')
      setAiDetectMsg({ ok: true, text: `${fr.frames.length} frames — analyse…` })
      const imageBlocks = fr.frames.flatMap((f, i) => [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } },
        { type: 'text', text: `[Frame ${i} — t=${f.timestamp}s]` },
      ])
      const prompt = `These are ${fr.frames.length} frames from a ${(originalDur||60).toFixed(1)}s video sampled at regular intervals.\nThis video has TWO phases separated by a clear scene change (different setting, lighting, or style).\nFind the frame where the scene change occurs and return ONLY this JSON:\n{"splitFrame":3,"splitTime":8.5,"description":"brief"}\nsplitTime = timestamp in seconds`
      const res = await window.electronAPI!.anthropicVisionRequest!({
        apiKey: anthropicKey.trim(), model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
        maxTokens: 200,
      })
      if (!res.ok) throw new Error(res.error ?? 'Erreur API')
      const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? '{}'
      let parsed: { splitTime?: number; description?: string } = {}
      try { const m = txt.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]) } catch { throw new Error('Réponse IA invalide') }
      if (parsed.splitTime != null && parsed.splitTime > 0 && parsed.splitTime < originalDur) {
        const t = Math.min(originalDur - 0.1, Math.round((parsed.splitTime + 0.1) * 10) / 10)
        setSplitTime(t)
        setAiDetectMsg({ ok: true, text: `IA : ${fmtTime(parsed.splitTime)} → ${fmtTime(t)}${parsed.description ? ` — ${parsed.description}` : ''}` })
        playSuccess()
      } else { throw new Error('Aucune coupure trouvée') }
    } catch (err: unknown) {
      setAiDetectMsg({ ok: false, text: err instanceof Error ? err.message : String(err) })
      playError()
    } finally { setAiDetecting(false) }
  }

  async function analyzeWithAI() {
    if (!originalPath || !anthropicKey.trim()) return
    setAnalyzing(true); setAnalyzeStep({ ok: true, text: 'Extraction des frames…' }); setDetectedOverlays([])
    try {
      const fr = await window.electronAPI!.extractFrames!({ filePath: originalPath, endTime: splitTime })
      if (!fr.ok || !fr.frames?.length) throw new Error(fr.error ?? 'Impossible d\'extraire les frames')
      setAnalyzeStep({ ok: true, text: `${fr.frames.length} frames — Claude Vision…` })
      const imageBlocks = fr.frames.flatMap((f, i) => [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } },
        { type: 'text', text: `[Frame ${i} — t=${f.timestamp}s]` },
      ])
      const interval = splitTime / (fr.frames.length || 1)
      const prompt = `These are ${fr.frames.length} frames from a ${splitTime.toFixed(1)}s video clip (vertical 9:16 format, output resolution 1080×1920).\nIdentify ALL burned-in text overlays (titles, captions, subtitles, watermarks). For each return:\n- text: the exact string\n- xPercent: 0-100 — horizontal center of the text block as % of frame width\n- yPercent: 0-100 — vertical center of the text block as % of frame height\n- fontSizePx: exact font size in pixels at 1080px wide × 1920px tall resolution\n- fontColor: CSS hex color (e.g. "#ffffff", "#ffff00")\n- bold: true if the text appears bold or heavy weight\n- startFrame: first frame index where this text is visible\n- endFrame: last frame index where this text is visible\n\nIMPORTANT: xPercent and yPercent must be the CENTER of the text, not the corner.\nMatch the original position as precisely as possible.\n\nReturn ONLY a valid JSON array, no explanation:\n[{"text":"...","xPercent":50,"yPercent":85,"fontSizePx":72,"fontColor":"#ffffff","bold":true,"startFrame":0,"endFrame":5}]\nIf no text overlays exist return [].`
      const res = await window.electronAPI!.anthropicVisionRequest!({
        apiKey: anthropicKey.trim(), model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
        maxTokens: 2000,
      })
      if (!res.ok) throw new Error(res.error ?? 'Erreur API Anthropic')
      const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? '[]'
      let parsed: Array<{ text: string; xPercent: number; yPercent: number; fontSizePx: number; fontColor: string; bold?: boolean; startFrame: number; endFrame: number }> = []
      try { const m = txt.match(/\[[\s\S]*\]/); if (m) parsed = JSON.parse(m[0]) } catch { throw new Error('Réponse IA invalide') }
      const overlays: TextOverlayUI[] = parsed.map((item, idx) => {
        // Center the text at xPercent/yPercent by subtracting half text dimensions
        const xExpr = `w*${(Math.max(1, Math.min(99, item.xPercent ?? 50)) / 100).toFixed(3)}-text_w/2`
        const yExpr = `h*${(Math.max(1, Math.min(97, item.yPercent ?? 85)) / 100).toFixed(3)}-text_h/2`
        return {
          id: idx,
          text: item.text,
          position: 'center',
          x: xExpr,
          y: yExpr,
          xPercent: Math.max(1, Math.min(99, item.xPercent ?? 50)),
          yPercent: Math.max(1, Math.min(97, item.yPercent ?? 85)),
          fontSize: Math.round(Math.max(16, Math.min(400, item.fontSizePx ?? 72))),
          fontColor: item.fontColor ?? '#ffffff',
          bold: item.bold ?? true,
          shadow: true,
          startTime: Math.round((item.startFrame ?? 0) * interval * 10) / 10,
          endTime: Math.min(splitTime, Math.round(((item.endFrame ?? fr.frames!.length - 1) + 1) * interval * 10) / 10),
        }
      })
      setDetectedOverlays(overlays)
      if (overlays.length > 0) {
        setAnalyzeStep({ ok: true, text: `✓ ${overlays.length} texte(s) détecté(s)` })
        playSuccess()
      } else {
        setAnalyzeStep({ ok: false, text: 'Aucun texte détecté dans cette phase' })
        playError()
      }
    } catch (err: unknown) {
      setAnalyzeStep({ ok: false, text: err instanceof Error ? err.message : String(err) })
      playError()
    } finally { setAnalyzing(false) }
  }

  async function uploadToBank() {
    if (!result?.outputPath) return
    setBankUploading(true)
    try {
      const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }
      const { storagePath, thumbnailPath } = await uploadVideoFromPath(result.outputPath, scope)
      const title = 'Remix — ' + new Date().toLocaleDateString('fr-FR')
      await supabase.from('content_bank').insert({
        user_id: user.id, org_id: currentOrg?.id ?? null,
        title, file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
        tags: [], notes: '',
      })
      logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_add', details: { title, source: 'remix' } })
      setBankDone(true)
      playSuccess()
    } catch {
      playError()
    } finally { setBankUploading(false) }
  }

  async function generate() {
    if (!originalPath || !newPhase1Path) return

    const creditRes = await checkAndDeductCredits(user.id, CREDIT_COSTS.remix)
    if (!creditRes.ok) {
      setResult({ ok: false, error: `Crédits insuffisants (solde : ${creditRes.balance ?? 0})` })
      return
    }

    const outputPath = await window.electronAPI?.pickOutputFile?.({ defaultName: 'remix_output.mp4' })
    if (!outputPath) return
    setBankDone(false)
    setGenerating(true); setResult(null)
    const r = await window.electronAPI!.runFfmpegRemixAI!({
      newPhase1Path, originalPath, splitTime, outputPath, preset,
      textOverlays: detectedOverlays.map(o => ({
        text: o.text, x: o.x, y: o.y,
        fontSize: o.fontSize, fontColor: o.fontColor,
        startTime: o.startTime, endTime: o.endTime,
        bold: o.bold, shadow: o.shadow,
      })),
    })
    setGenerating(false); setResult(r)
    if (r.ok) playSuccess(); else playError()
  }

  const canGoStep2 = !!originalPath && originalDur > 0 && splitTime > 0 && splitTime < originalDur
  const canGoStep3 = !!newPhase1Path

  // ── Step 1 ────────────────────────────────────────────────────────────────────
  function renderStep1() {
    const statusMsg = detectMsg ?? aiDetectMsg
    return (
      <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-black text-white mb-1">Vidéo originale</h2>
            <p className="text-xs" style={{ color: 'rgba(196,181,253,0.5)' }}>Sélectionne la vidéo source avec les 2 phases, puis définis le point de coupure.</p>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => { setShowBankOrig(true); playWhoosh() }}>🗂 Depuis la banque</Button>
            <Button variant="secondary" onClick={pickOrigFromPC}>💾 Depuis le PC</Button>
            {originalPath && <Button variant="secondary" onClick={() => { setOriginalPath(null); setOriginalDur(0) }}>✕</Button>}
          </div>

          {originalPath && (
            <div className="rounded-xl px-3 py-2 text-xs font-mono truncate" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', color: '#a78bfa' }}>
              {originalPath.split(/[\\/]/).pop()}
            </div>
          )}

          {/* Clé Anthropic — info */}
          {!anthropicKey && (
            <div className="rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs"
              style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
              <span>⚠</span>
              <span>Clé Anthropic manquante — configure-la dans <strong>Paramètres → Connexions</strong> pour activer la détection IA</span>
            </div>
          )}
          {anthropicKey && (
            <div className="rounded-xl px-3 py-2 text-[10px] flex items-center gap-2"
              style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', color: '#34d399' }}>
              ✓ Clé Anthropic configurée
            </div>
          )}

          {/* Détection coupure */}
          {originalPath && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={autoDetectSplit}
                  disabled={detecting || aiDetecting || !originalDur}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}
                >
                  {detecting ? <><Spinner size="sm" /> Analyse…</> : <>⚡ FFmpeg</>}
                </button>
                <button
                  onClick={aiDetectSplit}
                  disabled={detecting || aiDetecting || !originalDur || !anthropicKey.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 16px -4px rgba(124,58,237,0.4)' }}
                >
                  {aiDetecting ? <><Spinner size="sm" /> IA…</> : <>✨ Claude IA</>}
                </button>
              </div>
              {statusMsg && (
                <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                  style={statusMsg.ok
                    ? { background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }
                    : { background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }
                  }
                >
                  <span>{statusMsg.ok ? '✓' : '⚠'}</span><span>{statusMsg.text}</span>
                </div>
              )}
            </div>
          )}

          {originalDur > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold" style={{ color: 'rgba(196,181,253,0.6)' }}>Ajuste manuellement si nécessaire</p>
              <SplitScrubber duration={originalDur} splitTime={splitTime} onChange={t => setSplitTime(t)} />
              <input type="range" min={0.5} max={originalDur - 0.5} step={0.1} value={splitTime}
                onChange={e => setSplitTime(parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer" />
            </div>
          )}

          {!originalPath && (
            <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(139,92,246,0.04)', border: '1px dashed rgba(139,92,246,0.2)' }}>
              <p className="text-4xl mb-3 opacity-40">🎬</p>
              <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>Sélectionne une vidéo pour commencer</p>
            </div>
          )}
        </div>
        <VideoCard label="Vidéo originale" filePath={originalPath} accent="#8b5cf6"
          badge={originalDur > 0 ? fmtTime(originalDur) : undefined} onDurationLoad={handleOrigDur} />
      </div>
    )
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────────
  function renderStep2() {
    return (
      <div className="grid grid-cols-[1fr_1fr] gap-6 items-start">
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-black text-white mb-1">Nouvelle Phase 1</h2>
            <p className="text-xs" style={{ color: 'rgba(196,181,253,0.5)' }}>
              Cette vidéo remplace visuellement la Phase 1. Le son et le texte viennent de la vidéo originale.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => { setShowBankNew(true); playWhoosh() }}>🗂 Depuis la banque</Button>
            <Button variant="secondary" onClick={pickNewFromPC}>💾 Depuis le PC</Button>
            {newPhase1Path && <Button variant="secondary" onClick={() => setNewPhase1Path(null)}>✕</Button>}
          </div>

          {newPhase1Path && (
            <div className="rounded-xl px-3 py-2 text-xs font-mono truncate" style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.15)', color: '#f472b6' }}>
              {newPhase1Path.split(/[\\/]/).pop()}
            </div>
          )}

          {/* AI text detection */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
              <p className="text-sm font-semibold text-white">Détection du texte par IA</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(196,181,253,0.45)' }}>
                Claude Vision analyse la Phase 1 originale, détecte les textes et les réapplique sur la nouvelle vidéo
              </p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <button
                onClick={analyzeWithAI}
                disabled={analyzing || !originalPath || !anthropicKey.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 16px -4px rgba(124,58,237,0.5)' }}
              >
                {analyzing ? <><Spinner size="sm" /> Analyse…</> : <>✨ Analyser le texte de la Phase 1</>}
              </button>

              {!anthropicKey && (
                <p className="text-[10px] text-center" style={{ color: 'rgba(251,191,36,0.7)' }}>
                  ⚠ Configure ta clé Anthropic dans Paramètres → Connexions
                </p>
              )}

              {analyzeStep && (
                <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                  style={analyzeStep.ok
                    ? { background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }
                    : { background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }
                  }
                >
                  <span>{analyzeStep.ok ? '✓' : '⚠'}</span><span>{analyzeStep.text}</span>
                </div>
              )}

              {detectedOverlays.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    Textes détectés ({detectedOverlays.length})
                  </p>
                  {detectedOverlays.map(ov => (
                    <div key={ov.id} className="rounded-xl px-3 py-2 flex items-start gap-3"
                      style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">"{ov.text}"</p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.45)' }}>
                          {ov.position} · {ov.fontColor} · {ov.fontSize}px · {fmtTime(ov.startTime)}→{fmtTime(ov.endTime)}
                        </p>
                      </div>
                      <button onClick={() => setDetectedOverlays(prev => prev.filter(o => o.id !== ov.id))}
                        className="text-[11px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ color: 'rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.08)' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Format */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(196,181,253,0.45)' }}>Format de sortie</p>
            <div className="flex gap-2">
              {(['9:16', '1:1', '16:9'] as Preset[]).map(p => (
                <button key={p} onClick={() => setPreset(p)} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  style={preset === p
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                    : { background: 'rgba(139,92,246,0.06)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
                  }>{p}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <VideoCard
            label="Référence (Phase 1 originale)"
            filePath={originalPath}
            accent="#8b5cf6"
            overlays={detectedOverlays.length > 0 ? detectedOverlays : undefined}
          />
          <VideoCard label="Nouvelle Phase 1" filePath={newPhase1Path} accent="#ec4899" />
        </div>
      </div>
    )
  }

  // ── Step 3 — Summary ──────────────────────────────────────────────────────────
  function renderStep3() {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-black text-white">Récapitulatif</h2>
          <p className="text-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>Vérifie avant de générer</p>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>1</div>
              <span className="text-sm font-bold text-white">Phase 1 — Remplacée</span>
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }}>{fmtTime(splitTime)}</span>
            </div>
            <div className="space-y-1 text-xs" style={{ color: 'rgba(196,181,253,0.6)' }}>
              <div className="flex gap-2"><span className="opacity-50">Vidéo</span><span className="font-mono truncate text-white/80">{newPhase1Path?.split(/[\\/]/).pop()}</span></div>
              <div className="flex gap-2"><span className="opacity-50">Son</span><span style={{ color: '#a78bfa' }}>Vidéo originale</span></div>
              <div className="flex gap-2"><span className="opacity-50">Texte</span>
                <span style={{ color: '#a78bfa' }}>
                  {detectedOverlays.length > 0 ? `IA · ${detectedOverlays.length} élément(s)` : 'Aucun (analyser en Step 2)'}
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl p-4" style={{ background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: 'linear-gradient(135deg,#ec4899,#f472b6)' }}>2</div>
              <span className="text-sm font-bold text-white">Phase 2 — Inchangée</span>
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(236,72,153,0.15)', color: '#f472b6' }}>{fmtTime(Math.max(0, originalDur - splitTime))}</span>
            </div>
            <div className="text-xs" style={{ color: 'rgba(196,181,253,0.6)' }}>
              <div className="flex gap-2"><span className="opacity-50">Source</span><span className="font-mono truncate text-white/80">{originalPath?.split(/[\\/]/).pop()}</span></div>
            </div>
          </div>
          <div className="rounded-2xl p-4" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between text-xs" style={{ color: 'rgba(196,181,253,0.5)' }}>
              <span>Durée totale</span><span className="font-bold text-white">≈ {fmtTime(originalDur)}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-2" style={{ color: 'rgba(196,181,253,0.5)' }}>
              <span>Format</span><span className="font-bold" style={{ color: '#a78bfa' }}>{preset}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 4 — Generation ───────────────────────────────────────────────────────
  function renderStep4() {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        {generating ? (
          <div className="text-center space-y-5 py-8">
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                <Spinner size="lg" />
              </div>
            </div>
            <p className="text-base font-bold text-white">Génération en cours…</p>
            <div className="rounded-xl px-4 py-2 text-xs font-mono space-y-0.5 text-left"
              style={{ background: 'rgba(8,5,20,0.6)', border: '1px solid rgba(139,92,246,0.1)', color: 'rgba(196,181,253,0.4)' }}>
              <div>• Phase 1 → nouvelle vidéo ({fmtTime(splitTime)})</div>
              <div>• Son → vidéo originale</div>
              {detectedOverlays.length > 0 && <div>• Texte IA → {detectedOverlays.length} élément(s)</div>}
              <div>• Phase 2 → originale ({fmtTime(Math.max(0, originalDur - splitTime))})</div>
            </div>
          </div>
        ) : result ? (
          result.ok ? (
            <div className="space-y-5">
              <div className="text-center space-y-3">
                <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>✅</div>
                <div>
                  <p className="text-lg font-black text-white">Vidéo générée !</p>
                  <p className="text-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>Remix enregistré avec succès</p>
                </div>
              </div>
              <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: '#34d399' }}>Fichier local</p>
                <p className="text-xs font-mono text-white/80 break-all">{result.outputPath}</p>
              </div>
              {/* Bank upload */}
              <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)' }}>
                <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: '#a78bfa' }}>Exporter vers la banque</p>
                {bankDone ? (
                  <p className="text-sm font-semibold" style={{ color: '#34d399' }}>✓ Ajouté à la banque !</p>
                ) : (
                  <button
                    onClick={uploadToBank}
                    disabled={bankUploading}
                    className="flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}
                  >
                    {bankUploading ? <><Spinner size="sm" /> Upload…</> : <>☁ Ajouter à la banque</>}
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => { setStep(1); setResult(null); setOriginalPath(null); setNewPhase1Path(null); setOriginalDur(0); setSplitTime(0); setDetectedOverlays([]) }}>
                  ↺ Nouveau remix
                </Button>
                <Button onClick={() => { setStep(3); setResult(null) }}>⚙ Modifier</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center space-y-3">
                <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>❌</div>
                <div>
                  <p className="text-base font-black text-white">Erreur de génération</p>
                  <p className="text-sm mt-1 px-4" style={{ color: '#f87171' }}>{result.error}</p>
                </div>
              </div>
              {result.command && (
                <div>
                  <button onClick={() => setShowCommand(v => !v)} className="text-xs font-semibold" style={{ color: 'rgba(139,92,246,0.7)' }}>
                    {showCommand ? '▼' : '▶'} Voir la commande FFmpeg
                  </button>
                  {showCommand && <div className="mt-2 rounded-xl p-3 text-[10px] font-mono break-all" style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(196,181,253,0.5)' }}>{result.command}</div>}
                </div>
              )}
              <Button onClick={() => { setResult(null); generate() }}>↺ Réessayer</Button>
            </div>
          )
        ) : (
          <div className="text-center space-y-5 py-4">
            <div className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center text-4xl" style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>🚀</div>
            <div>
              <p className="text-lg font-black text-white">Prêt à générer</p>
              <p className="text-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>
                {detectedOverlays.length > 0
                  ? `${detectedOverlays.length} texte(s) IA seront appliqués sur la nouvelle vidéo`
                  : 'Aucun texte détecté — génère quand même ou retourne en Step 2 pour analyser'
                }
              </p>
            </div>
            <Button onClick={generate} size="lg">⚡ Générer la vidéo finale</Button>
          </div>
        )}
      </div>
    )
  }

  const STEPS = [{ label: 'Vidéo originale' }, { label: 'Nouvelle Phase 1' }, { label: 'Récapitulatif' }, { label: 'Génération' }]

  return (
    <>
      {showBankOrig && (
        <BankPicker user={user} mode="single"
          onSelect={paths => { setShowBankOrig(false); if (paths[0]) { setOriginalPath(paths[0]); playWhoosh() } }}
          onClose={() => setShowBankOrig(false)} />
      )}
      {showBankNew && (
        <BankPicker user={user} mode="single"
          onSelect={paths => { setShowBankNew(false); if (paths[0]) { setNewPhase1Path(paths[0]); playWhoosh() } }}
          onClose={() => setShowBankNew(false)} />
      )}

      <div className="flex flex-col h-full" style={{ background: '#06040f' }}>
        {/* Mode tabs — prominent */}
        <div className="flex-shrink-0 flex" style={{ borderBottom: '2px solid rgba(139,92,246,0.15)' }}>
          {(['solo', 'masse'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className="flex-1 py-3.5 flex items-center justify-center gap-2.5 text-sm font-black tracking-wide transition-all relative"
              style={mode === m
                ? { background: 'linear-gradient(180deg,rgba(124,58,237,0.18),rgba(124,58,237,0.06))', color: '#c4b5fd', borderBottom: '2px solid #8b5cf6', marginBottom: -2 }
                : { background: 'transparent', color: 'rgba(196,181,253,0.3)' }
              }>
              <span className="text-base">{m === 'solo' ? '🎬' : '⚡'}</span>
              <span>{m === 'solo' ? 'Solo' : 'Masse'}</span>
              {m === 'masse' && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}>BATCH</span>}
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-6 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,5,20,0.5)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>🔀</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white">Remix Vidéo{mode === 'masse' ? ' — Mode Masse' : ''}</p>
              <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                {mode === 'solo' ? "Remplace la Phase 1 · Son + texte de l'original" : 'Génère plusieurs remixes en une seule fois'}
              </p>
            </div>
          </div>
          {mode === 'solo' && <div className="flex items-center gap-2 mt-3">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <StepDot n={i + 1} current={step} label={s.label} />
                {i < STEPS.length - 1 && <div className="w-8 h-px" style={{ background: 'rgba(139,92,246,0.2)' }} />}
              </div>
            ))}
          </div>}
        </div>

        {mode === 'masse' ? (
          <MassRemix user={user} />
        ) : (
          <>
            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              {step === 4 && renderStep4()}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid rgba(139,92,246,0.1)', background: 'rgba(6,4,15,0.8)' }}>
          <Button variant="secondary" onClick={() => setStep(s => Math.max(1, s - 1) as Step)} disabled={step === 1}>← Retour</Button>
          <div className="flex items-center gap-2">
            {[1,2,3,4].map(n => (
              <div key={n} className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                style={step === n ? { background: '#8b5cf6', width: 24, borderRadius: 4 } : step > n ? { background: 'rgba(139,92,246,0.5)' } : { background: 'rgba(139,92,246,0.15)' }} />
            ))}
          </div>
          {step < 4 ? (
            <Button
              onClick={() => { if (step === 3) { setStep(4); generate() } else setStep(s => Math.min(4, s + 1) as Step) }}
              disabled={(step === 1 && !canGoStep2) || (step === 2 && !canGoStep3)}
            >
              {step === 3 ? '⚡ Générer →' : 'Suivant →'}
            </Button>
          ) : <div style={{ width: 80 }} />}
        </div>
          </>
        )}
      </div>
    </>
  )
}
