import { useState } from 'react'
import type { Page } from '@/components/Layout'

// ── Studio Vidéo — hub des outils vidéo (regroupe la sidebar) ─────────────────

interface Tool {
  id:       Page
  icon:     string
  title:    string
  tag:      string
  desc:     string
  grad:     string   // dégradé d'accent
  glow:     string   // couleur de halo au survol
}

const TOOLS: Tool[] = [
  {
    id: 'remix', icon: '🔀', title: 'Remix', tag: 'Uniqueness',
    desc: 'Génère plusieurs variantes uniques d\'une même vidéo — luminosité, zoom, vitesse, recadrage — pour éviter les doublons à grande échelle.',
    grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.45)',
  },
  {
    id: 'spoof', icon: '🛡️', title: 'Spoof', tag: 'Anti-détection',
    desc: 'Réécrit les métadonnées (device iPhone, GPS, dates) et micro-varie l\'image pour rendre chaque post invisible aux filtres de doublons.',
    grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.4)',
  },
  {
    id: 'subtitles', icon: '💬', title: 'Sous-titres', tag: 'IA Whisper',
    desc: 'Transcrit l\'audio avec l\'IA (Groq Whisper) et incruste des sous-titres stylés automatiquement, mot par mot, en un clic.',
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.4)',
  },
  {
    id: 'mixer', icon: '🎞️', title: 'Mixer', tag: 'Overlay',
    desc: 'Incruste un texte / une légende accrocheuse directement sur la vidéo, avec rendu propre serveur — parfait pour les hooks.',
    grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.42)',
  },
]

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
        padding: 26, borderRadius: 22, minHeight: 210,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))',
        border: '1px solid rgba(255,255,255,0.09)',
        transform: hover ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hover ? `0 24px 60px -20px ${tool.glow}, 0 0 0 1px rgba(255,255,255,0.06)` : '0 8px 30px -18px rgba(0,0,0,0.6)',
        transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s',
        display: 'flex', flexDirection: 'column', gap: 14, isolation: 'isolate',
      }}
    >
      {/* Spotlight qui suit la souris */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(380px circle at ${pos.x}% ${pos.y}%, ${tool.glow}, transparent 60%)`,
        opacity: hover ? 0.5 : 0, transition: 'opacity 0.3s',
      }} />
      {/* Barre d'accent */}
      <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: tool.grad, opacity: 0.9, zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 54, height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, background: tool.grad,
          boxShadow: `0 8px 22px -6px ${tool.glow}`,
        }}>{tool.icon}</div>
        <span style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'rgba(233,234,240,0.55)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: '4px 10px',
        }}>{tool.tag}</span>
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{tool.title}</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'rgba(233,234,240,0.5)' }}>{tool.desc}</p>
      </div>

      <div style={{
        position: 'relative', zIndex: 2, marginTop: 'auto', display: 'inline-flex', alignItems: 'center',
        fontSize: 12.5, fontWeight: 700, color: hover ? '#fff' : 'rgba(233,234,240,0.7)',
        transition: 'color 0.2s, gap 0.2s', gap: hover ? 10 : 7,
      }}>
        Ouvrir l'outil
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
      </div>
    </button>
  )
}

export function VideoStudio({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <div style={{ minHeight: '100%', background: 'var(--base)', padding: '32px 32px 90px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      {/* Aurora de fond */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -120, left: '10%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)', filter: 'blur(40px)', animation: 'vs-float-a 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 40, right: '4%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.13), transparent 70%)', filter: 'blur(40px)', animation: 'vs-float-b 22s ease-in-out infinite' }} />
        <style>{`
          @keyframes vs-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,30px)} }
          @keyframes vs-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,40px)} }
        `}</style>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.4)' }}>
            <span style={{ fontSize: 15 }}>🎬</span> Studio Vidéo
          </div>
          <h1 style={{
            margin: '0 0 10px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.02,
            background: 'linear-gradient(120deg,#fff 20%,#a5b4fc 55%,#f0abfc 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Ton usine à contenu unique
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(233,234,240,0.5)', maxWidth: 560, lineHeight: 1.6 }}>
            Tous tes outils vidéo réunis. Rends chaque post unique, ajoute des sous-titres et des hooks — puis balance-les dans le posting.
          </p>
        </div>

        {/* Grille des outils */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {TOOLS.map(tool => (
            <ToolCard key={tool.id} tool={tool} onOpen={() => onNavigate(tool.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
