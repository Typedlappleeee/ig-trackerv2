import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'

export type VisionToolId = 'vision-score' | 'vision-structure' | 'vision-thumb'

interface Props {
  user: User
  tool: VisionToolId
  anthropicKey: string
  onBack: () => void
}

function fileName(p: string) { return p.split(/[\\/]/).pop() ?? p }

function ScoreBar({ score, label, comment }: { score: number; label: string; comment: string }) {
  const color = score >= 7 ? '#34d399' : score >= 5 ? '#fbbf24' : '#f87171'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-text2">{label}</span>
        <span className="text-[13px] font-black" style={{ color }}>{score}/10</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score * 10}%`, background: color }} />
      </div>
      <p className="text-[12px] text-text2">{comment}</p>
    </div>
  )
}

function ToolShell({ title, icon, children, onBack }: { title: string; icon: string; children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onBack}
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
          ← Retour
        </button>
        <span className="text-2xl">{icon}</span>
        <h1 className="text-[22px] font-black text-white leading-none">{title}</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-10 pb-10 pt-8">
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<null | {
    scores: Record<string, { score: number; comment: string }>
    overall: number
    verdict: string
    topRecommendation: string
  }>(null)

  const SCORE_LABELS: Record<string, string> = {
    hook: '🎣 Hook visuel (0–3s)',
    retention: '📈 Rétention estimée',
    text: '✍️ Lisibilité du texte',
    thumbnail: '🖼 Qualité thumbnail',
    dynamism: '⚡ Dynamisme visuel',
  }

  async function analyze() {
    if (!filePath || !anthropicKey) return
    setLoading(true); setError(null); setResult(null)
    try {
      const fr = await window.electronAPI!.extractFrames!({ filePath, endTime: 999, fps: 0.5 })
      if (!fr.ok || !fr.frames?.length) throw new Error('Impossible d\'extraire les frames')
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
      if (!res.ok) throw new Error(res.error ?? 'Erreur Anthropic')
      const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? ''
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Réponse invalide de Claude')
      setResult(JSON.parse(m[0]))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  const overallColor = result ? (result.overall >= 7 ? '#34d399' : result.overall >= 5 ? '#fbbf24' : '#f87171') : '#a78bfa'

  return (
    <ToolShell title="Score Viral" icon="🔥" onBack={onBack}>
      <div className="space-y-5">
        <p className="text-[13px] text-text2">
          Upload une vidéo, Claude analyse les frames et note son potentiel viral sur 5 critères.
        </p>

        <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {filePath
            ? <p className="text-[13px] font-mono text-white/70 truncate">📹 {fileName(filePath)}</p>
            : <p className="text-[13px] text-text2">Aucune vidéo sélectionnée</p>
          }
          <Button variant="secondary" onClick={async () => {
            const p = await window.electronAPI!.pickVideoFile()
            if (p) { setFilePath(p); setResult(null); setError(null) }
          }}>
            📂 Choisir une vidéo
          </Button>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <p className="text-[13px]">{error}</p>
          </div>
        )}

        <Button className="w-full" disabled={!filePath || !anthropicKey} loading={loading} onClick={analyze}>
          🔥 Analyser le potentiel viral
        </Button>

        {!anthropicKey && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
            <p className="text-[13px]">⚠ Clé Anthropic manquante — configure-la dans Paramètres → Connexions</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Overall score */}
            <div className="rounded-2xl p-6 text-center space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${overallColor}40` }}>
              <p className="text-[12px] uppercase tracking-widest font-bold text-text2">Score Global</p>
              <p className="text-[52px] font-black leading-none" style={{ color: overallColor }}>{result.overall.toFixed(1)}</p>
              <p className="text-[12px] text-text2">/ 10</p>
              <p className="text-[13px] text-white/70 mt-2">{result.verdict}</p>
            </div>

            {/* Category scores */}
            <div className="rounded-2xl p-5 space-y-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[15px] font-bold text-white mb-4">Critères détaillés</p>
              {Object.entries(result.scores).map(([key, val]) => (
                <ScoreBar key={key} score={val.score} label={SCORE_LABELS[key] ?? key} comment={val.comment} />
              ))}
            </div>

            {/* Top recommendation */}
            <div className="rounded-xl px-5 py-4 space-y-1.5" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <p className="text-[12px] uppercase tracking-wider font-bold" style={{ color: '#fbbf24' }}>💡 Top recommandation</p>
              <p className="text-[13px] text-white/80">{result.topRecommendation}</p>
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<null | {
    segments: Array<{ from: number; to: number; type: string; label: string; effectiveness: string; notes: string }>
    summary: string
    strengths: string[]
    improvements: string[]
  }>(null)

  const TYPE_COLOR: Record<string, string> = {
    hook: '#ec4899', context: '#8b5cf6', value: '#34d399',
    proof: '#fbbf24', cta: '#f87171', transition: '#06b6d4',
  }
  const TYPE_LABEL: Record<string, string> = {
    hook: 'Hook', context: 'Contexte', value: 'Valeur',
    proof: 'Preuve', cta: 'CTA', transition: 'Transition',
  }

  async function analyze() {
    if (!filePath || !anthropicKey) return
    setLoading(true); setError(null); setResult(null)
    try {
      const fr = await window.electronAPI!.extractFrames!({ filePath, endTime: 999, fps: 0.5 })
      if (!fr.ok || !fr.frames?.length) throw new Error('Impossible d\'extraire les frames')
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
      if (!res.ok) throw new Error(res.error ?? 'Erreur Anthropic')
      const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? ''
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Réponse invalide de Claude')
      setResult(JSON.parse(m[0]))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Structure Virale" icon="🧬" onBack={onBack}>
      <div className="space-y-5">
        <p className="text-[13px] text-text2">
          Décompose la structure narrative d'une vidéo — hook, valeur, CTA — pour comprendre pourquoi ça marche.
        </p>

        <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {filePath
            ? <p className="text-[13px] font-mono text-white/70 truncate">📹 {fileName(filePath)}</p>
            : <p className="text-[13px] text-text2">Aucune vidéo sélectionnée</p>
          }
          <Button variant="secondary" onClick={async () => {
            const p = await window.electronAPI!.pickVideoFile()
            if (p) { setFilePath(p); setResult(null); setError(null) }
          }}>
            📂 Choisir une vidéo
          </Button>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <p className="text-[13px]">{error}</p>
          </div>
        )}

        <Button className="w-full" disabled={!filePath || !anthropicKey} loading={loading} onClick={analyze}>
          🧬 Analyser la structure
        </Button>

        {!anthropicKey && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
            <p className="text-[13px]">⚠ Clé Anthropic manquante — configure-la dans Paramètres → Connexions</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Timeline */}
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[15px] font-bold text-white">Timeline</p>
              {result.segments.map((seg, i) => {
                const color = TYPE_COLOR[seg.type] ?? '#a78bfa'
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-16 text-right">
                      <span className="text-[12px] font-mono text-text2">
                        {seg.from}s–{seg.to}s
                      </span>
                    </div>
                    <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: color }} />
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded font-bold uppercase tracking-wider"
                          style={{ background: `${color}18`, color }}>
                          {TYPE_LABEL[seg.type] ?? seg.type}
                        </span>
                        <span className="text-[13px] font-semibold text-white">{seg.label}</span>
                      </div>
                      {seg.notes && <p className="text-[12px] mt-0.5 text-text2">{seg.notes}</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            <div className="rounded-xl px-5 py-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[13px] text-white/70">{result.summary}</p>
            </div>

            {/* Strengths + improvements */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4 space-y-2.5" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#34d399' }}>✅ Points forts</p>
                {result.strengths.map((s, i) => <p key={i} className="text-[13px] text-white/60">• {s}</p>)}
              </div>
              <div className="rounded-xl p-4 space-y-2.5" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#fbbf24' }}>💡 Améliorations</p>
                {result.improvements.map((s, i) => <p key={i} className="text-[13px] text-white/60">• {s}</p>)}
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
  const [isVideo, setIsVideo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<null | {
    scores: Record<string, { score: number; comment: string }>
    overall: number
    verdict: string
    topFixes: string[]
  }>(null)

  const SCORE_LABELS: Record<string, string> = {
    contrast: '🎨 Contraste & visibilité',
    textReadability: '✍️ Lisibilité du texte',
    emotion: '😮 Émotion / Expression',
    colors: '🌈 Couleurs accrocheuses',
    composition: '📐 Composition',
  }

  async function analyze() {
    if (!filePath || !anthropicKey) return
    setLoading(true); setError(null); setResult(null)
    try {
      let imageData: string
      let mediaType = 'image/jpeg'

      if (isVideo) {
        const fr = await window.electronAPI!.extractFrames!({ filePath, endTime: 0.5, fps: 2 })
        if (!fr.ok || !fr.frames?.length) throw new Error('Impossible d\'extraire le thumbnail')
        imageData = fr.frames[0].data
      } else {
        const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
        mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        const bytes = await window.electronAPI!.readFileBytes(filePath)
        if (!bytes.ok || !bytes.bytes) throw new Error('Impossible de lire l\'image')
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
      if (!res.ok) throw new Error(res.error ?? 'Erreur Anthropic')
      const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? ''
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Réponse invalide de Claude')
      setResult(JSON.parse(m[0]))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  const overallColor = result ? (result.overall >= 7 ? '#34d399' : result.overall >= 5 ? '#fbbf24' : '#f87171') : '#a78bfa'

  return (
    <ToolShell title="Audit Thumbnail" icon="🖼" onBack={onBack}>
      <div className="space-y-5">
        <p className="text-[13px] text-text2">
          Analyse ta miniature sur 5 critères de performance. Accepte une image ou une vidéo (prend le premier frame).
        </p>

        <div className="flex gap-2">
          {[{ label: '🖼 Image', v: false }, { label: '🎬 Vidéo', v: true }].map(({ label, v }) => (
            <button key={String(v)} onClick={() => { setIsVideo(v); setFilePath(null); setResult(null) }}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold"
              style={isVideo === v
                ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }
              }>{label}</button>
          ))}
        </div>

        <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {filePath
            ? <p className="text-[13px] font-mono text-white/70 truncate">{isVideo ? '📹' : '🖼'} {fileName(filePath)}</p>
            : <p className="text-[13px] text-text2">Aucun fichier sélectionné</p>
          }
          <Button variant="secondary" onClick={async () => {
            const p = isVideo
              ? await window.electronAPI!.pickVideoFile()
              : await window.electronAPI!.pickAnyFile!({ filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }] })
            if (p) { setFilePath(p); setResult(null); setError(null) }
          }}>
            📂 {isVideo ? 'Choisir une vidéo' : 'Choisir une image'}
          </Button>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <p className="text-[13px]">{error}</p>
          </div>
        )}

        <Button className="w-full" disabled={!filePath || !anthropicKey} loading={loading} onClick={analyze}>
          🖼 Auditer le thumbnail
        </Button>

        {!anthropicKey && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
            <p className="text-[13px]">⚠ Clé Anthropic manquante — configure-la dans Paramètres → Connexions</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-2xl p-6 text-center space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${overallColor}40` }}>
              <p className="text-[12px] uppercase tracking-widest font-bold text-text2">Score Global</p>
              <p className="text-[52px] font-black leading-none" style={{ color: overallColor }}>{result.overall.toFixed(1)}</p>
              <p className="text-[12px] text-text2">/ 10</p>
              <p className="text-[13px] text-white/70 mt-2">{result.verdict}</p>
            </div>

            <div className="rounded-2xl p-5 space-y-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[15px] font-bold text-white">Critères détaillés</p>
              {Object.entries(result.scores).map(([key, val]) => (
                <ScoreBar key={key} score={val.score} label={SCORE_LABELS[key] ?? key} comment={val.comment} />
              ))}
            </div>

            <div className="rounded-xl px-5 py-4 space-y-2.5" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#fbbf24' }}>🔧 Corrections prioritaires</p>
              {result.topFixes.map((f, i) => <p key={i} className="text-[13px] text-white/70">• {f}</p>)}
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
