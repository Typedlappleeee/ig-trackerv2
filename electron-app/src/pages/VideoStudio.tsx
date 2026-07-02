import { useState } from 'react'
import type { Page } from '@/components/Layout'

// ── Studio Vidéo — hub des outils vidéo ───────────────────────────────────────
// Refonte premium : icônes SVG, cartes avec mini-aperçu vivant de chaque outil.

type IconFn = (p: { size?: number }) => JSX.Element
const S = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })
const IconShuffle:  IconFn = ({ size }) => (<svg {...S(size)}><path d="M18 4l3 3-3 3"/><path d="M18 20l3-3-3-3"/><path d="M3 7h3.5a5 5 0 0 1 4 2l3 4a5 5 0 0 0 4 2H21"/><path d="M3 17h3.5a5 5 0 0 0 4-2l.5-.7"/><path d="M14.5 9.7l.5-.7a5 5 0 0 1 4-2H21"/></svg>)
const IconShield:   IconFn = ({ size }) => (<svg {...S(size)}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>)
const IconCaptions: IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 12h4"/><path d="M7 15h2"/><path d="M14 12h3"/><path d="M13 15h4"/></svg>)
const IconOverlay:  IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 14h8"/><path d="M10 10.5h4"/><path d="M8 17.5h5"/></svg>)

type PreviewKind = 'remix' | 'spoof' | 'subtitles' | 'mixer'

interface Tool {
  id: Page; Icon: IconFn; title: string; tag: string; desc: string
  grad: string; glow: string; accent: string; preview: PreviewKind
}

const TOOLS: Tool[] = [
  { id: 'remix', Icon: IconShuffle, title: 'Remix', tag: 'Uniqueness', preview: 'remix',
    desc: 'Génère plusieurs variantes uniques d\'une même vidéo — luminosité, zoom, vitesse, recadrage.',
    grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.45)', accent: '#818CF8' },
  { id: 'spoof', Icon: IconShield, title: 'Spoof', tag: 'Anti-détection', preview: 'spoof',
    desc: 'Réécrit les métadonnées (device, GPS, dates) et micro-varie l\'image pour passer les filtres de doublons.',
    grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.4)', accent: '#34D399' },
  { id: 'subtitles', Icon: IconCaptions, title: 'Sous-titres', tag: 'IA Whisper', preview: 'subtitles',
    desc: 'Transcrit l\'audio avec l\'IA (Groq Whisper) et incruste des sous-titres stylés, mot par mot.',
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.4)', accent: '#FBBF24' },
  { id: 'mixer', Icon: IconOverlay, title: 'Mixer', tag: 'Overlay', preview: 'mixer',
    desc: 'Incruste un texte / une légende accrocheuse sur la vidéo, rendu propre côté serveur.',
    grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.42)', accent: '#F472B6' },
]

// ── Mini-aperçus vivants ──────────────────────────────────────────────────────
function Preview({ kind, accent, hover }: { kind: PreviewKind; accent: string; hover: boolean }) {
  const box: React.CSSProperties = {
    position: 'relative', height: 96, borderRadius: 12, overflow: 'hidden',
    background: 'radial-gradient(120% 120% at 20% 0%, rgba(255,255,255,0.04), rgba(0,0,0,0.25))',
    border: '1px solid rgba(255,255,255,0.06)', padding: 12,
  }
  if (kind === 'remix') {
    const grads = ['linear-gradient(160deg,#3b2f6b,#1a1733)', 'linear-gradient(160deg,#22405e,#0e1c2b)', 'linear-gradient(160deg,#4a2d63,#1d1230)']
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 9 }}>
        {grads.map((g, i) => (
          <div key={i} style={{
            width: 40, height: 68, borderRadius: 7, background: g, border: '1px solid rgba(255,255,255,0.1)',
            transform: `rotate(${(i - 1) * 5}deg) translateY(${hover ? i * -2 : 0}px)`,
            transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1)', boxShadow: '0 8px 18px -8px rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 5,
          }}>
            <span style={{ fontSize: 7, fontWeight: 800, color: accent }}>#{i + 1}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>×12</div>
          <div style={{ fontSize: 8.5, color: 'rgba(233,234,240,0.45)', marginTop: 3 }}>variantes uniques</div>
        </div>
      </div>
    )
  }
  if (kind === 'spoof') {
    const rows = [['Device', 'iPhone 15 Pro'], ['GPS', '34.05, -118.2'], ['EXIF', 'nettoyé']]
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 7 }}>
        {rows.map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'ui-monospace, monospace', fontSize: 9.5 }}>
            <span style={{ width: 42, color: 'rgba(233,234,240,0.4)' }}>{k}</span>
            <span style={{ color: 'rgba(233,234,240,0.85)', flex: 1 }}>{v}</span>
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </span>
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'subtitles') {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 14, background: 'radial-gradient(120% 120% at 50% 0%, rgba(245,158,11,0.06), rgba(0,0,0,0.35))' }}>
        <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.35)' }}>Whisper · mot par mot</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['tu', 'vas', 'ADORER', 'ça'].map((w, i) => (
            <span key={i} style={{
              fontSize: 11, fontWeight: 900, letterSpacing: '-0.01em', padding: '2px 6px', borderRadius: 4,
              color: i === 2 ? '#0a0a0d' : '#fff',
              background: i === 2 ? accent : 'rgba(0,0,0,0.5)',
              textShadow: i === 2 ? 'none' : '0 1px 3px rgba(0,0,0,0.8)',
            }}>{w}</span>
          ))}
        </div>
      </div>
    )
  }
  // mixer
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#3a1f37,#150c18)' }}>
      <div style={{
        transform: hover ? 'rotate(-3deg) scale(1.04)' : 'rotate(-3deg)',
        transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1)',
        padding: '6px 16px', background: 'rgba(0,0,0,0.35)', borderRadius: 6, border: `1px solid ${accent}55`,
      }}>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '0.02em', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>HOOK</span>
      </div>
      <span style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.4)' }}>texte sur vidéo</span>
    </div>
  )
}

function ToolCard({ tool, onOpen }: { tool: Tool; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
      }}
      style={{
        position: 'relative', textAlign: 'left', cursor: 'pointer', overflow: 'hidden',
        padding: 22, borderRadius: 22,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))',
        border: `1px solid ${hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
        transform: hover ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hover
          ? `0 30px 64px -24px ${tool.glow}, inset 0 1px 0 0 rgba(255,255,255,0.1)`
          : 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 8px 30px -18px rgba(0,0,0,0.6)',
        transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s, border-color 0.3s',
        display: 'flex', flexDirection: 'column', gap: 16, isolation: 'isolate',
      }}
    >
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(460px circle at ${pos.x}% ${pos.y}%, ${tool.glow}, transparent 62%)`, opacity: hover ? 0.4 : 0, transition: 'opacity 0.3s' }} />
      <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: tool.grad, opacity: hover ? 1 : 0.7, transition: 'opacity 0.3s', zIndex: 1 }} />

      {/* Ligne icône + tag */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 50, height: 50, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', background: tool.grad,
          boxShadow: `0 10px 24px -8px ${tool.glow}, inset 0 1px 0 0 rgba(255,255,255,0.35)`,
          transform: hover ? 'scale(1.06) rotate(-3deg)' : 'scale(1)', transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}><tool.Icon size={24} /></div>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: tool.accent, background: `${tool.accent}12`, border: `1px solid ${tool.accent}30`, borderRadius: 20, padding: '4px 11px' }}>{tool.tag}</span>
      </div>

      {/* Titre + desc */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{tool.title}</h3>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'rgba(233,234,240,0.52)' }}>{tool.desc}</p>
      </div>

      {/* Aperçu vivant */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <Preview kind={tool.preview} accent={tool.accent} hover={hover} />
      </div>

      {/* CTA */}
      <div style={{ position: 'relative', zIndex: 2, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: hover ? '#fff' : 'rgba(233,234,240,0.68)', transition: 'color 0.2s, gap 0.2s', gap: hover ? 10 : 7 }}>
        Ouvrir l'outil
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </div>
    </button>
  )
}

export function VideoStudio({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <div style={{ minHeight: '100%', background: 'var(--base)', padding: '32px 32px 90px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      {/* Aurora de fond */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -120, left: '10%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)', filter: 'blur(44px)', animation: 'vs-float-a 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 40, right: '4%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.12), transparent 70%)', filter: 'blur(44px)', animation: 'vs-float-b 22s ease-in-out infinite' }} />
        <style>{`
          @keyframes vs-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,30px)} }
          @keyframes vs-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,40px)} }
        `}</style>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1040, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 14, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M7 6v12"/><path d="M17 6v12"/></svg>
            Studio Vidéo
          </div>
          <h1 style={{ margin: '0 0 10px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, background: 'linear-gradient(120deg,#fff 20%,#a5b4fc 55%,#f0abfc 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Ton usine à contenu unique
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(233,234,240,0.5)', maxWidth: 580, lineHeight: 1.6 }}>
            Rends chaque post unique, ajoute des sous-titres et des hooks — puis balance-les dans le posting.
          </p>
        </div>

        {/* Grille 2 colonnes des outils */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {TOOLS.map(tool => (
            <ToolCard key={tool.id} tool={tool} onOpen={() => onNavigate(tool.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
