import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'

export type VisionToolId = 'vision-score' | 'vision-structure' | 'vision-thumb'

// ── SVG icon library ───────────────────────────────────────────────────────────
type IconName = 'flame' | 'dna' | 'image' | 'video' | 'folder-open' | 'eye' | 'brain' | 'arrow-left' | 'lightbulb' | 'check' | 'wrench' | 'film'

function Icon({ name, size = 20, className = '', style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  const paths: Record<IconName, React.ReactNode> = {
    flame:        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
    dna:          <><path d="M2 15c6.667-6 13.333 0 20-6" /><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" /><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" /><path d="m17 6-2.5-2.5M14 8l-1-1M7 18l2.5 2.5M10 16l1 1M5 14l-3-3M22 13l-3-3" /></>,
    image:        <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
    video:        <><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></>,
    'folder-open':<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />,
    eye:          <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>,
    brain:        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />,
    'arrow-left': <><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></>,
    lightbulb:    <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></>,
    check:        <path d="M20 6 9 17l-5-5"/>,
    wrench:       <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>,
    film:         <><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m10 0h4M3 16h4m10 0h4"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}>
      {paths[name]}
    </svg>
  )
}

interface Props {
  user: User
  tool: VisionToolId
  anthropicKey: string
  onBack: () => void
}

function fileName(p: string) { return p.split(/[\\/]/).pop() ?? p }

function ScoreBar({ score, label, comment }: { score: number; label: string; comment: string }) {
  const color = score >= 7 ? 'var(--ok)' : score >= 5 ? 'var(--warn)' : 'var(--danger)'
  const bgColor = score >= 7 ? 'rgba(34,197,94,0.12)' : score >= 5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-text2">{label}</span>
        <span className="text-[13px] font-black rounded-md px-2 py-0.5" style={{ color, background: bgColor }}>{score}/10</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score * 10}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)` }} />
      </div>
      <p className="text-[12px] text-text3">{comment}</p>
    </div>
  )
}

// ── Tool Shell with premium header ────────────────────────────────────────────
function ToolShell({ title, subtitle, headerIcon, children, onBack }: {
  title: string
  subtitle: string
  headerIcon: React.ReactNode
  children: React.ReactNode
  onBack: () => void
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden anim-page">
      {/* Premium header */}
      <div className="flex-shrink-0 px-8 pt-7 pb-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4 mb-4 sf-anim-slide-up sf-d50">
          <button
            onClick={onBack}
            className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
          >
            <Icon name="arrow-left" size={15} />
            Back
          </button>
        </div>
        <div className="flex items-center gap-4 sf-anim-slide-up sf-d100">
          {/* Icon with glow */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center sf-anim-scale-spring sf-d150"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(233,234,240,0.12))',
                border: '1px solid rgba(99,102,241,0.3)',
                boxShadow: '0 0 20px -4px rgba(99,102,241,0.4)',
              }}>
              <span style={{ color: '#818CF8' }}>{headerIcon}</span>
            </div>
          </div>
          <div>
            <h1 className="text-[22px] font-black leading-none sf-text-gradient">{title}</h1>
            <p className="text-[13px] text-text3 mt-1">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-10 pt-7">
        <div className="max-w-2xl">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Score Viral ───────────────────────────────────────────────────────────────
function ViralScore({ anthropicKey, onBack }: { anthropicKey: string; onBack: () => void }) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [result, setResult]     = useState<null | {
    scores: Record<string, { score: number; comment: string }>
    overall: number
    verdict: string
    topRecommendation: string
  }>(null)

  const SCORE_LABELS: Record<string, string> = {
    hook:      'Visual hook (0–3s)',
    retention: 'Estimated retention',
    text:      'Text readability',
    thumbnail: 'Thumbnail quality',
    dynamism:  'Visual dynamism',
  }

  async function analyze() {
    if (!filePath || !anthropicKey) return
    setLoading(true); setError(null); setResult(null)
    try {
      const fr = await window.electronAPI!.extractFrames!({ filePath, endTime: 999, fps: 0.5 })
      if (!fr.ok || !fr.frames?.length) throw new Error('Unable to extract frames')
      const imageBlocks = fr.frames.map(f => ({
        type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data },
      }))
      const prompt = `These are ${fr.frames.length} frames from an Instagram Reel (9:16 vertical format).
Evaluate viral potential for each category on a scale of 1-10.
Return ONLY valid JSON, no explanation outside the JSON:
{
  "scores": {
    "hook": { "score": 8, "comment": "brief comment in French" },
    "retention": { "score": 7, "comment": "..." },
    "text": { "score": 6, "comment": "..." },
    "thumbnail": { "score": 9, "comment": "..." },
    "dynamism": { "score": 7, "comment": "..." }
  },
  "overall": 7.4,
  "verdict": "one sentence verdict in French",
  "topRecommendation": "top actionable tip in French"
}`
      const res = await window.electronAPI!.anthropicVisionRequest!({
        apiKey: anthropicKey, model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
        maxTokens: 1000,
      })
      if (!res.ok) throw new Error(res.error ?? 'Anthropic error')
      const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? ''
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Invalid response from Claude')
      setResult(JSON.parse(m[0]))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  const overallColor = result
    ? (result.overall >= 7 ? 'var(--ok)' : result.overall >= 5 ? 'var(--warn)' : 'var(--danger)')
    : 'var(--accent-glow)'

  return (
    <ToolShell
      title="Viral Score"
      subtitle="AI analysis of your video’s viral potential across 5 key criteria"
      headerIcon={<Icon name="flame" size={24} />}
      onBack={onBack}
    >
      <div className="space-y-5 anim-stagger">
        {/* File picker */}
        <div className="sf-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Icon name="film" size={16} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              {filePath
                ? <p className="text-[13px] font-mono text-text2 truncate">{fileName(filePath)}</p>
                : <p className="text-[13px] text-text3">No video selected</p>
              }
            </div>
          </div>
          <button
            className="sf-btn sf-btn-secondary w-full cursor-pointer"
            onClick={async () => {
              const p = await window.electronAPI!.pickVideoFile()
              if (p) { setFilePath(p); setResult(null); setError(null) }
            }}
          >
            <Icon name="folder-open" size={15} />
            Choose a video
          </button>
        </div>

        {!anthropicKey && (
          <div className="sf-card p-4 flex items-start gap-3" style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)' }}>
            <Icon name="lightbulb" size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warn)' } as React.CSSProperties} />
            <p className="text-[13px]" style={{ color: 'var(--warn)' }}>Missing Anthropic key — configure it in Settings → Connections</p>
          </div>
        )}

        {error && (
          <div className="sf-card p-4 flex items-start gap-3" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' }}>
            <p className="text-[13px] text-danger">{error}</p>
          </div>
        )}

        <button
          className="sf-btn sf-btn-primary sf-btn-lg w-full cursor-pointer"
          disabled={!filePath || !anthropicKey || loading}
          onClick={analyze}
        >
          {loading ? <span className="sf-spinner" /> : <Icon name="flame" size={16} />}
          {loading ? 'Analyzing…' : 'Analyze viral potential'}
        </button>

        {result && (
          <div className="space-y-4 anim-scale-in anim-stagger">
            {/* Overall score */}
            <div className="sf-card sf-spotlight p-6 text-center space-y-2" style={{ borderColor: `${overallColor}30` }}>
              <p className="text-[11px] uppercase tracking-widest font-bold text-text3">Overall Score</p>
              <p className="text-[56px] font-black leading-none" style={{ color: overallColor }}>{result.overall.toFixed(1)}</p>
              <p className="text-[12px] text-text3">/ 10</p>
              <p className="text-[13px] text-text2 mt-2">{result.verdict}</p>
            </div>

            {/* Category scores */}
            <div className="sf-card p-5 space-y-5">
              <p className="text-[14px] font-bold text-text">Detailed criteria</p>
              {Object.entries(result.scores).map(([key, val]) => (
                <ScoreBar key={key} score={val.score} label={SCORE_LABELS[key] ?? key} comment={val.comment} />
              ))}
            </div>

            {/* Top recommendation */}
            <div className="sf-card p-5 space-y-2" style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.03)' }}>
              <div className="flex items-center gap-2">
                <Icon name="lightbulb" size={14} style={{ color: 'var(--warn)' } as React.CSSProperties} />
                <p className="text-[11px] uppercase tracking-wider font-bold" style={{ color: 'var(--warn)' }}>Top recommendation</p>
              </div>
              <p className="text-[13px] text-text2">{result.topRecommendation}</p>
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  )
}

// ── Structure Virale ──────────────────────────────────────────────────────────
function ViralStructure({ anthropicKey, onBack }: { anthropicKey: string; onBack: () => void }) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [result, setResult]     = useState<null | {
    segments: Array<{ from: number; to: number; type: string; label: string; effectiveness: string; notes: string }>
    summary: string
    strengths: string[]
    improvements: string[]
  }>(null)

  const TYPE_COLOR: Record<string, string> = {
    hook:       '#818CF8', context:    '#6366F1', value:      '#34d399',
    proof:      '#fbbf24', cta:        '#f87171', transition: '#06b6d4',
  }
  const TYPE_LABEL: Record<string, string> = {
    hook: 'Hook', context: 'Context', value: 'Value',
    proof: 'Proof', cta: 'CTA', transition: 'Transition',
  }

  async function analyze() {
    if (!filePath || !anthropicKey) return
    setLoading(true); setError(null); setResult(null)
    try {
      const fr = await window.electronAPI!.extractFrames!({ filePath, endTime: 999, fps: 0.5 })
      if (!fr.ok || !fr.frames?.length) throw new Error('Unable to extract frames')
      const imageBlocks = fr.frames.map(f => ({
        type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data },
      }))
      const prompt = `These are ${fr.frames.length} frames from an Instagram Reel. Decompose its narrative/content structure.
For each segment identify its timestamp range and content type (hook/context/value/proof/cta/transition).
Return ONLY valid JSON:
{
  "segments": [
    { "from": 0, "to": 3, "type": "hook", "label": "Hook visuel choc", "effectiveness": "high", "notes": "brief French note" }
  ],
  "summary": "overall structure description in French",
  "strengths": ["strength1 in French", "strength2"],
  "improvements": ["improvement1 in French", "improvement2"]
}`
      const res = await window.electronAPI!.anthropicVisionRequest!({
        apiKey: anthropicKey, model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
        maxTokens: 1500,
      })
      if (!res.ok) throw new Error(res.error ?? 'Anthropic error')
      const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? ''
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Invalid response from Claude')
      setResult(JSON.parse(m[0]))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell
      title="Viral Structure"
      subtitle="Deconstruct your video’s narrative — hook, value, CTA — to understand why it works"
      headerIcon={<Icon name="dna" size={24} />}
      onBack={onBack}
    >
      <div className="space-y-5 anim-stagger">
        {/* File picker */}
        <div className="sf-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Icon name="film" size={16} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              {filePath
                ? <p className="text-[13px] font-mono text-text2 truncate">{fileName(filePath)}</p>
                : <p className="text-[13px] text-text3">No video selected</p>
              }
            </div>
          </div>
          <button
            className="sf-btn sf-btn-secondary w-full cursor-pointer"
            onClick={async () => {
              const p = await window.electronAPI!.pickVideoFile()
              if (p) { setFilePath(p); setResult(null); setError(null) }
            }}
          >
            <Icon name="folder-open" size={15} />
            Choose a video
          </button>
        </div>

        {!anthropicKey && (
          <div className="sf-card p-4 flex items-start gap-3" style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.03)' }}>
            <p className="text-[13px]" style={{ color: 'var(--warn)' }}>Missing Anthropic key — configure it in Settings → Connections</p>
          </div>
        )}

        {error && (
          <div className="sf-card p-4" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.03)' }}>
            <p className="text-[13px] text-danger">{error}</p>
          </div>
        )}

        <button
          className="sf-btn sf-btn-primary sf-btn-lg w-full cursor-pointer"
          disabled={!filePath || !anthropicKey || loading}
          onClick={analyze}
        >
          {loading ? <span className="sf-spinner" /> : <Icon name="dna" size={16} />}
          {loading ? 'Analyzing…' : 'Analyze structure'}
        </button>

        {result && (
          <div className="space-y-4 anim-scale-in anim-stagger">
            {/* Timeline */}
            <div className="sf-card p-5 space-y-4">
              <p className="text-[14px] font-bold text-text">Timeline</p>
              {result.segments.map((seg, i) => {
                const color = TYPE_COLOR[seg.type] ?? '#6366F1'
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-14 text-right">
                      <span className="text-[11px] font-mono text-text3">{seg.from}s–{seg.to}s</span>
                    </div>
                    <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ background: color }} />
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider"
                          style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                          {TYPE_LABEL[seg.type] ?? seg.type}
                        </span>
                        <span className="text-[13px] font-semibold text-text">{seg.label}</span>
                      </div>
                      {seg.notes && <p className="text-[12px] mt-1 text-text3">{seg.notes}</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            <div className="sf-card p-5">
              <p className="text-[13px] text-text2 leading-relaxed">{result.summary}</p>
            </div>

            {/* Strengths + improvements */}
            <div className="grid grid-cols-2 gap-4">
              <div className="sf-card p-4 space-y-2.5" style={{ borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.03)' }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <Icon name="check" size={13} style={{ color: 'var(--ok)' } as React.CSSProperties} />
                  <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--ok)' }}>Strengths</p>
                </div>
                {result.strengths.map((s, i) => <p key={i} className="text-[12px] text-text2">• {s}</p>)}
              </div>
              <div className="sf-card p-4 space-y-2.5" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.03)' }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <Icon name="lightbulb" size={13} style={{ color: 'var(--warn)' } as React.CSSProperties} />
                  <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--warn)' }}>Improvements</p>
                </div>
                {result.improvements.map((s, i) => <p key={i} className="text-[12px] text-text2">• {s}</p>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  )
}

// ── Audit Thumbnail ───────────────────────────────────────────────────────────
function ThumbnailAudit({ anthropicKey, onBack }: { anthropicKey: string; onBack: () => void }) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [isVideo, setIsVideo]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [result, setResult]     = useState<null | {
    scores: Record<string, { score: number; comment: string }>
    overall: number
    verdict: string
    topFixes: string[]
  }>(null)

  const SCORE_LABELS: Record<string, string> = {
    contrast:       'Contrast & visibility',
    textReadability:'Text readability',
    emotion:        'Emotion / Expression',
    colors:         'Eye-catching colors',
    composition:    'Composition',
  }

  async function analyze() {
    if (!filePath || !anthropicKey) return
    setLoading(true); setError(null); setResult(null)
    try {
      let imageData: string
      let mediaType = 'image/jpeg'

      if (isVideo) {
        const fr = await window.electronAPI!.extractFrames!({ filePath, endTime: 0.5, fps: 2 })
        if (!fr.ok || !fr.frames?.length) throw new Error('Unable to extract thumbnail')
        imageData = fr.frames[0].data
      } else {
        const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
        mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        const bytes = await window.electronAPI!.readFileBytes(filePath)
        if (!bytes.ok || !bytes.bytes) throw new Error('Unable to read image')
        const arr = new Uint8Array(bytes.bytes)
        let b64 = ''
        for (let i = 0; i < arr.length; i += 8192) {
          b64 += String.fromCharCode(...arr.subarray(i, i + 8192))
        }
        imageData = btoa(b64)
      }

      const prompt = `Analyze this Instagram thumbnail/cover image for scroll-stopping effectiveness.
Rate each category 1-10. Return ONLY valid JSON:
{
  "scores": {
    "contrast": { "score": 8, "comment": "brief French comment" },
    "textReadability": { "score": 6, "comment": "..." },
    "emotion": { "score": 9, "comment": "..." },
    "colors": { "score": 7, "comment": "..." },
    "composition": { "score": 8, "comment": "..." }
  },
  "overall": 7.6,
  "verdict": "one sentence in French",
  "topFixes": ["actionable fix 1 in French", "fix 2", "fix 3"]
}`
      const res = await window.electronAPI!.anthropicVisionRequest!({
        apiKey: anthropicKey, model: 'claude-haiku-4-5-20251001',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
            { type: 'text', text: prompt },
          ],
        }],
        maxTokens: 800,
      })
      if (!res.ok) throw new Error(res.error ?? 'Anthropic error')
      const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? ''
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Invalid response from Claude')
      setResult(JSON.parse(m[0]))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  const overallColor = result
    ? (result.overall >= 7 ? 'var(--ok)' : result.overall >= 5 ? 'var(--warn)' : 'var(--danger)')
    : 'var(--accent-glow)'

  return (
    <ToolShell
      title="Thumbnail Audit"
      subtitle="Analyze your thumbnail or video cover on 5 scroll-stopping performance criteria"
      headerIcon={<Icon name="eye" size={24} />}
      onBack={onBack}
    >
      <div className="space-y-5 anim-stagger">
        {/* File type toggle */}
        <div className="sf-tabs">
          {[
            { label: 'Image', icon: 'image' as IconName, v: false },
            { label: 'Video', icon: 'video' as IconName, v: true  },
          ].map(({ label, icon, v }) => (
            <button
              key={String(v)}
              onClick={() => { setIsVideo(v); setFilePath(null); setResult(null) }}
              className={`sf-tab flex-1 cursor-pointer inline-flex items-center justify-center gap-2${isVideo === v ? ' sf-tab-active' : ''}`}
              style={isVideo === v
                ? { background: 'rgba(99,102,241,0.15)', color: 'var(--accent-glow)', border: '1px solid rgba(99,102,241,0.3)' }
                : {}}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* File picker */}
        <div className="sf-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Icon name={isVideo ? 'video' : 'image'} size={16} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              {filePath
                ? <p className="text-[13px] font-mono text-text2 truncate">{fileName(filePath)}</p>
                : <p className="text-[13px] text-text3">No file selected</p>
              }
            </div>
          </div>
          <button
            className="sf-btn sf-btn-secondary w-full cursor-pointer"
            onClick={async () => {
              const p = isVideo
                ? await window.electronAPI!.pickVideoFile()
                : await window.electronAPI!.pickAnyFile!({ filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }] })
              if (p) { setFilePath(p); setResult(null); setError(null) }
            }}
          >
            <Icon name="folder-open" size={15} />
            {isVideo ? 'Choose a video' : 'Choose an image'}
          </button>
        </div>

        {!anthropicKey && (
          <div className="sf-card p-4 flex items-start gap-3" style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.03)' }}>
            <p className="text-[13px]" style={{ color: 'var(--warn)' }}>Missing Anthropic key — configure it in Settings → Connections</p>
          </div>
        )}

        {error && (
          <div className="sf-card p-4" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.03)' }}>
            <p className="text-[13px] text-danger">{error}</p>
          </div>
        )}

        <button
          className="sf-btn sf-btn-primary sf-btn-lg w-full cursor-pointer"
          disabled={!filePath || !anthropicKey || loading}
          onClick={analyze}
        >
          {loading ? <span className="sf-spinner" /> : <Icon name="eye" size={16} />}
          {loading ? 'Analyzing…' : 'Audit thumbnail'}
        </button>

        {result && (
          <div className="space-y-4 anim-scale-in anim-stagger">
            {/* Overall score */}
            <div className="sf-card sf-spotlight p-6 text-center space-y-2" style={{ borderColor: `${overallColor}30` }}>
              <p className="text-[11px] uppercase tracking-widest font-bold text-text3">Overall Score</p>
              <p className="text-[56px] font-black leading-none" style={{ color: overallColor }}>{result.overall.toFixed(1)}</p>
              <p className="text-[12px] text-text3">/ 10</p>
              <p className="text-[13px] text-text2 mt-2">{result.verdict}</p>
            </div>

            {/* Detailed criteria */}
            <div className="sf-card p-5 space-y-5">
              <p className="text-[14px] font-bold text-text">Detailed criteria</p>
              {Object.entries(result.scores).map(([key, val]) => (
                <ScoreBar key={key} score={val.score} label={SCORE_LABELS[key] ?? key} comment={val.comment} />
              ))}
            </div>

            {/* Priority fixes */}
            <div className="sf-card p-5 space-y-3" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.03)' }}>
              <div className="flex items-center gap-2">
                <Icon name="wrench" size={13} style={{ color: 'var(--warn)' } as React.CSSProperties} />
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--warn)' }}>Priority fixes</p>
              </div>
              {result.topFixes.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--warn)' }}>{i + 1}.</span>
                  <p className="text-[13px] text-text2">{f}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  )
}

// ── Router ────────────────────────────────────────────────────────────────────
export function VisionTools({ user: _user, tool, anthropicKey, onBack }: Props) {
  if (tool === 'vision-score')     return <ViralScore     anthropicKey={anthropicKey} onBack={onBack} />
  if (tool === 'vision-structure') return <ViralStructure anthropicKey={anthropicKey} onBack={onBack} />
  if (tool === 'vision-thumb')     return <ThumbnailAudit anthropicKey={anthropicKey} onBack={onBack} />
  return null
}
