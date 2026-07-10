import { useState } from 'react'
import type { Page } from '@/components/Layout'
import { useTr } from '@/lib/i18n'

// ── Studio Vidéo — hub premium (grille uniforme + liseré dégradé animé) ───────

type IconFn = (p: { size?: number }) => JSX.Element
const S = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })
const IconShuffle:  IconFn = ({ size }) => (<svg {...S(size)}><path d="M18 4l3 3-3 3"/><path d="M18 20l3-3-3-3"/><path d="M3 7h3.5a5 5 0 0 1 4 2l3 4a5 5 0 0 0 4 2H21"/><path d="M3 17h3.5a5 5 0 0 0 4-2l.5-.7"/><path d="M14.5 9.7l.5-.7a5 5 0 0 1 4-2H21"/></svg>)
const IconShield:   IconFn = ({ size }) => (<svg {...S(size)}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>)
const IconCaptions: IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 12h4"/><path d="M7 15h2"/><path d="M14 12h3"/><path d="M13 15h4"/></svg>)
const IconOverlay:  IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 14h8"/><path d="M10 10.5h4"/><path d="M8 17.5h5"/></svg>)

const CSS = `
@property --hub-a { syntax:'<angle>'; inherits:false; initial-value:0deg }
@keyframes hub-spin { to { --hub-a: 360deg } }
@keyframes vs-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,30px)} }
@keyframes vs-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,40px)} }
@keyframes vs-flow { 0%{left:0;opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{left:calc(100% - 16px);opacity:0} }
@keyframes hub-shimmer { 0%{background-position:-160% 0} 100%{background-position:260% 0} }
@keyframes hub-rise { 0%{opacity:0;transform:translateY(8px) scale(.94)} 14%,78%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-8px) scale(.94)} }
@keyframes hub-word { 0%,16%{opacity:0;transform:translateY(6px)} 28%,72%{opacity:1;transform:translateY(0)} 88%,100%{opacity:0} }
@keyframes hub-check { 0%,22%{stroke-dashoffset:20;opacity:.3} 42%,100%{stroke-dashoffset:0;opacity:1} }
@keyframes hub-tilt { 0%,100%{transform:rotate(-3deg) translateY(0)} 50%{transform:rotate(-3deg) translateY(-4px)} }
@keyframes hub-scan { 0%{transform:translateY(-3px)} 100%{transform:translateY(58px)} }
.hubcard { position: relative; }
.hubcard::before {
  content:''; position:absolute; inset:-1px; border-radius:23px; padding:1.4px;
  background: conic-gradient(from var(--hub-a), transparent 0%, var(--ring) 14%, transparent 32%, transparent 66%, var(--ring) 84%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity .35s ease; animation: hub-spin 5s linear infinite; pointer-events:none; z-index:3;
}
.hubcard:hover::before { opacity: .95 }
`

type PreviewKind = 'remix' | 'spoof' | 'subtitles' | 'mixer'
interface Tool { id: Page; Icon: IconFn; title: string; titleEn: string; tag: string; tagEn: string; desc: string; descEn: string; grad: string; glow: string; accent: string; preview: PreviewKind }

const TOOLS: Tool[] = [
  { id: 'remix', Icon: IconShuffle, title: 'Remix', titleEn: 'Remix', tag: 'Uniqueness', tagEn: 'Uniqueness', preview: 'remix',
    desc: 'Une vidéo → des dizaines de variantes uniques (luminosité, zoom, vitesse, recadrage) pour éviter les doublons.',
    descEn: 'One video → dozens of unique variants (brightness, zoom, speed, cropping) to avoid duplicates.',
    grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.5)', accent: '#818CF8' },
  { id: 'spoof', Icon: IconShield, title: 'Spoof', titleEn: 'Spoof', tag: 'Anti-détection', tagEn: 'Anti-detection', preview: 'spoof',
    desc: 'Réécrit device, GPS et EXIF et micro-varie l\'image — invisible aux filtres de doublons.',
    descEn: 'Rewrites device, GPS and EXIF and micro-varies the image — invisible to duplicate filters.',
    grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.45)', accent: '#34D399' },
  { id: 'subtitles', Icon: IconCaptions, title: 'Sous-titres', titleEn: 'Subtitles', tag: 'IA Whisper', tagEn: 'Whisper AI', preview: 'subtitles',
    desc: 'Transcription IA (Groq Whisper) et incrustation stylée, mot par mot, en un clic.',
    descEn: 'AI transcription (Groq Whisper) and styled word-by-word burn-in, in one click.',
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.45)', accent: '#FBBF24' },
  { id: 'mixer', Icon: IconOverlay, title: 'Mixer', titleEn: 'Mixer', tag: 'Overlay', tagEn: 'Overlay', preview: 'mixer',
    desc: 'Incruste un hook accrocheur sur la vidéo, avec un rendu propre côté serveur.',
    descEn: 'Burns a catchy hook onto the video, with clean server-side rendering.',
    grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.45)', accent: '#F472B6' },
]

function Preview({ kind, accent }: { kind: PreviewKind; accent: string }) {
  const tr = useTr()
  const box: React.CSSProperties = {
    position: 'relative', height: 120, borderRadius: 14, overflow: 'hidden',
    background: 'radial-gradient(130% 130% at 15% 0%, rgba(255,255,255,0.05), rgba(0,0,0,0.3))',
    border: '1px solid rgba(255,255,255,0.07)', padding: 14,
  }
  if (kind === 'remix') {
    const grads = ['linear-gradient(160deg,#3b2f6b,#1a1733)', 'linear-gradient(160deg,#22405e,#0e1c2b)', 'linear-gradient(160deg,#4a2d63,#1d1230)', 'linear-gradient(160deg,#5b2350,#231024)']
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 52, height: 88, borderRadius: 9, background: grads[0], border: `1px solid ${accent}66`, boxShadow: `0 0 0 3px ${accent}22`, flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6 }}>
          <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.7)' }}>SOURCE</span>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <div style={{ display: 'flex', gap: 7, flex: 1, overflow: 'hidden' }}>
          {grads.slice(1).map((g, i) => (
            <div key={i} style={{ width: 40, height: 78, borderRadius: 7, background: g, border: '1px solid rgba(255,255,255,0.1)', animation: `hub-rise 4.5s ease-in-out ${i * 0.5}s infinite`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 5, flexShrink: 0 }}>
              <span style={{ fontSize: 7, fontWeight: 800, color: accent }}>#{i + 1}</span>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>×24</div>
          <div style={{ fontSize: 8.5, color: 'rgba(233,234,240,0.45)', marginTop: 3 }}>uniques</div>
        </div>
      </div>
    )
  }
  if (kind === 'spoof') {
    const rows = [['Device', 'iPhone 15 Pro'], ['GPS', '34.05, -118.2'], ['EXIF', tr('nettoyé', 'cleaned')]]
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 9 }}>
        {rows.map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'ui-monospace,monospace', fontSize: 10.5 }}>
            <span style={{ width: 46, color: 'rgba(233,234,240,0.4)' }}>{k}</span>
            <span style={{ color: 'rgba(233,234,240,0.85)', flex: 1 }}>{v}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 20 }}><path d="M20 6 9 17l-5-5" style={{ animation: `hub-check 3.5s ease-in-out ${i * 0.4}s infinite` }} /></svg>
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'subtitles') {
    const words = [tr('tu', 'you'), tr('vas', 'will'), tr('ADORER', 'LOVE'), tr('ça', 'it')]
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 18, background: 'radial-gradient(130% 130% at 50% 0%, rgba(245,158,11,0.08), rgba(0,0,0,0.42))' }}>
        <span style={{ position: 'absolute', top: 13, left: 14, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.35)' }}>Whisper · live</span>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 8, height: 1, background: `linear-gradient(90deg,transparent,${accent},transparent)`, opacity: 0.5, animation: 'hub-scan 3s ease-in-out infinite alternate' }} />
        <div style={{ display: 'flex', gap: 5 }}>
          {words.map((w, i) => (
            <span key={i} style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.01em', padding: '3px 7px', borderRadius: 5, color: i === 2 ? '#0a0a0d' : '#fff', background: i === 2 ? accent : 'rgba(0,0,0,0.5)', animation: `hub-word 4s ease-in-out ${i * 0.28}s infinite` }}>{w}</span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#3a1f37,#150c18)' }}>
      <div style={{ padding: '8px 20px', background: 'rgba(0,0,0,0.4)', borderRadius: 7, border: `1px solid ${accent}66`, animation: 'hub-tilt 4s ease-in-out infinite' }}>
        <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '0.02em', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>HOOK</span>
      </div>
      <span style={{ position: 'absolute', bottom: 10, right: 13, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.4)' }}>{tr('texte sur vidéo', 'text on video')}</span>
    </div>
  )
}

function ToolCard({ tool, onOpen }: { tool: Tool; onOpen: () => void }) {
  const tr = useTr()
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  return (
    <button
      className="hubcard"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }}
      style={{
        ['--ring' as any]: tool.accent,
        position: 'relative', textAlign: 'left', cursor: 'pointer', overflow: 'hidden',
        padding: 22, borderRadius: 22,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.014))',
        border: '1px solid rgba(255,255,255,0.08)',
        transform: hover ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hover ? `0 34px 70px -26px ${tool.glow}, inset 0 1px 0 0 rgba(255,255,255,0.1)` : 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 8px 30px -18px rgba(0,0,0,0.6)',
        transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s',
        display: 'flex', flexDirection: 'column', gap: 15, isolation: 'isolate', minHeight: 268,
      }}
    >
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(480px circle at ${pos.x}% ${pos.y}%, ${tool.glow}, transparent 60%)`, opacity: hover ? 0.42 : 0, transition: 'opacity 0.3s' }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: tool.grad, boxShadow: `0 10px 24px -8px ${tool.glow}, inset 0 1px 0 0 rgba(255,255,255,0.35)`, transform: hover ? 'scale(1.06) rotate(-3deg)' : 'scale(1)', transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)' }}><tool.Icon size={22} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{tr(tool.title, tool.titleEn)}</h3>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase', color: tool.accent }}>{tr(tool.tag, tool.tagEn)}</span>
          </div>
        </div>
        <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: '50%', border: `1px solid ${hover ? tool.accent : 'rgba(255,255,255,0.12)'}`, color: hover ? tool.accent : 'rgba(233,234,240,0.5)', alignItems: 'center', justifyContent: 'center', transform: hover ? 'translateX(2px)' : 'none', transition: 'all 0.25s' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </span>
      </div>

      <p style={{ position: 'relative', zIndex: 2, margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'rgba(233,234,240,0.55)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 39 }}>{tr(tool.desc, tool.descEn)}</p>

      <div style={{ position: 'relative', zIndex: 2, marginTop: 'auto' }}><Preview kind={tool.preview} accent={tool.accent} /></div>
    </button>
  )
}

export function VideoStudio({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const tr = useTr()
  return (
    <div style={{ minHeight: '100%', background: 'var(--base)', padding: '32px 32px 90px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      <style>{CSS}</style>
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -140, left: '8%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)', filter: 'blur(46px)', animation: 'vs-float-a 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 20, right: '2%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.13), transparent 70%)', filter: 'blur(46px)', animation: 'vs-float-b 22s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 980, margin: '0 auto' }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 16, fontSize: 11, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M7 6v12"/><path d="M17 6v12"/></svg>
            {tr('Studio Vidéo', 'Video Studio')}
          </div>
          <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.0, background: 'linear-gradient(100deg,#fff 15%,#a5b4fc 50%,#f0abfc 85%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'hub-shimmer 7s linear infinite' }}>
            {tr('Ton usine à contenu unique', 'Your unique-content factory')}
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: 'rgba(233,234,240,0.55)', maxWidth: 600, lineHeight: 1.65 }}>
            {tr('Quatre outils pour transformer une vidéo en dizaines de posts uniques — puis les balancer dans le posting.', 'Four tools to turn one video into dozens of unique posts — then push them straight to posting.')}
          </p>
          {/* Mini-flux : 1 vidéo → 4 outils → ∞ variantes → export */}
          <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap', alignItems: 'center' }}>
            {([['1', tr('vidéo source', 'source video'), '#818CF8'], ['4', tr('outils', 'tools'), '#F472B6'], ['∞', tr('variantes uniques', 'unique variants'), '#34D399'], [tr('1 clic', '1 click'), 'export', '#FBBF24']] as const).map(([v, l, c], i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '7px 13px', borderRadius: 99, background: 'rgba(255,255,255,0.035)', border: `1px solid ${c}33` }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: c, letterSpacing: '-0.02em' }}>{v}</span>
                  <span style={{ fontSize: 11.5, color: 'rgba(233,234,240,0.5)' }}>{l}</span>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ position: 'relative', width: 34, height: 2, flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: `linear-gradient(90deg, ${c}59, ${arr[i + 1][2]}59)` }} />
                    <div style={{ position: 'absolute', top: -2, left: 0, width: 16, height: 6, animation: 'vs-flow 2.4s cubic-bezier(.45,0,.55,1) infinite', animationDelay: `${i * 0.5}s` }}>
                      <div style={{ position: 'absolute', right: 5, top: 2, width: 11, height: 2, borderRadius: 2, background: 'linear-gradient(90deg, transparent, rgba(199,210,254,0.9))' }} />
                      <div style={{ position: 'absolute', right: 0, top: 0, width: 6, height: 6, borderRadius: 99, background: '#E0E7FF', boxShadow: '0 0 10px 3px rgba(165,180,252,0.85)' }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Grille uniforme 2 colonnes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
          {TOOLS.map(tool => <ToolCard key={tool.id} tool={tool} onOpen={() => onNavigate(tool.id)} />)}
        </div>
      </div>
    </div>
  )
}
