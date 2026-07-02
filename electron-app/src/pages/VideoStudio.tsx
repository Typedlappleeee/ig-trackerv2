import { useState } from 'react'
import type { Page } from '@/components/Layout'

// ── Studio Vidéo — hub des outils vidéo (regroupe la sidebar) ─────────────────
// Icônes SVG nettes (plus d'emojis), cartes premium avec spotlight + lift.

type IconFn = (p: { size?: number }) => JSX.Element
const S = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })

const IconShuffle: IconFn = ({ size }) => (<svg {...S(size)}><path d="M18 4l3 3-3 3"/><path d="M18 20l3-3-3-3"/><path d="M3 7h3.5a5 5 0 0 1 4 2l3 4a5 5 0 0 0 4 2H21"/><path d="M3 17h3.5a5 5 0 0 0 4-2l.5-.7"/><path d="M14.5 9.7l.5-.7a5 5 0 0 1 4-2H21"/></svg>)
const IconShield: IconFn = ({ size }) => (<svg {...S(size)}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>)
const IconCaptions: IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 12h4"/><path d="M7 15h2"/><path d="M14 12h3"/><path d="M13 15h4"/></svg>)
const IconOverlay: IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 14h8"/><path d="M10 10.5h4"/><path d="M8 17.5h5"/></svg>)
const IconEditor: IconFn = ({ size }) => (<svg {...S(size)}><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M7 6v12"/><path d="M17 6v12"/></svg>)
const IconClone: IconFn = ({ size }) => (<svg {...S(size)}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>)

interface Tool {
  id:    Page
  Icon:  IconFn
  title: string
  tag:   string
  desc:  string
  grad:  string
  glow:  string
}

const TOOLS: Tool[] = [
  {
    id: 'remix', Icon: IconShuffle, title: 'Remix', tag: 'Uniqueness',
    desc: 'Génère plusieurs variantes uniques d\'une même vidéo — luminosité, zoom, vitesse, recadrage — pour éviter les doublons à grande échelle.',
    grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.45)',
  },
  {
    id: 'repurpose', Icon: IconClone, title: 'CloneVid', tag: 'Multi-variantes',
    desc: 'Transforme 1 vidéo en N variantes uniques anti-détection en un seul rendu — idéal pour alimenter plusieurs comptes d\'un coup.',
    grad: 'linear-gradient(135deg,#0EA5E9,#6366F1)', glow: 'rgba(14,165,233,0.42)',
  },
  {
    id: 'spoof', Icon: IconShield, title: 'Spoof', tag: 'Anti-détection',
    desc: 'Réécrit les métadonnées (device iPhone, GPS, dates) et micro-varie l\'image pour rendre chaque post invisible aux filtres de doublons.',
    grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.4)',
  },
  {
    id: 'subtitles', Icon: IconCaptions, title: 'Sous-titres', tag: 'IA Whisper',
    desc: 'Transcrit l\'audio avec l\'IA (Groq Whisper) et incruste des sous-titres stylés automatiquement, mot par mot, en un clic.',
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.4)',
  },
  {
    id: 'mixer', Icon: IconOverlay, title: 'Mixer', tag: 'Overlay',
    desc: 'Incruste un texte / une légende accrocheuse directement sur la vidéo, avec rendu propre serveur — parfait pour les hooks.',
    grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.42)',
  },
  {
    id: 'montage', Icon: IconEditor, title: 'Montage', tag: 'Éditeur',
    desc: 'Timeline multi-clips : découpe, réordonne, ajoute textes et transitions. Un mini-éditeur pour composer tes vidéos à la main.',
    grad: 'linear-gradient(135deg,#8B5CF6,#EC4899)', glow: 'rgba(139,92,246,0.42)',
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
        padding: 24, borderRadius: 20, minHeight: 214,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))',
        border: `1px solid ${hover ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'}`,
        transform: hover ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hover
          ? `0 26px 60px -22px ${tool.glow}, inset 0 1px 0 0 rgba(255,255,255,0.09)`
          : 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 8px 30px -18px rgba(0,0,0,0.6)',
        transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1), box-shadow 0.28s, border-color 0.28s',
        display: 'flex', flexDirection: 'column', gap: 15, isolation: 'isolate',
      }}
    >
      {/* Spotlight qui suit la souris */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(420px circle at ${pos.x}% ${pos.y}%, ${tool.glow}, transparent 62%)`,
        opacity: hover ? 0.4 : 0, transition: 'opacity 0.3s',
      }} />
      {/* Barre d'accent haut */}
      <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: tool.grad, opacity: hover ? 1 : 0.75, transition: 'opacity 0.3s', zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', background: tool.grad,
          boxShadow: `0 10px 24px -8px ${tool.glow}, inset 0 1px 0 0 rgba(255,255,255,0.35)`,
          transform: hover ? 'scale(1.06) rotate(-3deg)' : 'scale(1)',
          transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1)',
        }}><tool.Icon size={25} /></div>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(233,234,240,0.5)', background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: '4px 11px',
        }}>{tool.tag}</span>
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3 style={{ margin: '0 0 7px', fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{tool.title}</h3>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'rgba(233,234,240,0.52)' }}>{tool.desc}</p>
      </div>

      <div style={{
        position: 'relative', zIndex: 2, marginTop: 'auto', display: 'inline-flex', alignItems: 'center',
        fontSize: 12.5, fontWeight: 700, color: hover ? '#fff' : 'rgba(233,234,240,0.68)',
        transition: 'color 0.2s, gap 0.2s', gap: hover ? 10 : 7,
      }}>
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

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 14, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M7 6v12"/><path d="M17 6v12"/></svg>
            Studio Vidéo
          </div>
          <h1 style={{
            margin: '0 0 10px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02,
            background: 'linear-gradient(120deg,#fff 20%,#a5b4fc 55%,#f0abfc 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Ton usine à contenu unique
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(233,234,240,0.5)', maxWidth: 580, lineHeight: 1.6 }}>
            Tous tes outils vidéo réunis. Rends chaque post unique, ajoute des sous-titres et des hooks — puis balance-les dans le posting.
          </p>
        </div>

        {/* Grille des outils */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(292px, 1fr))', gap: 18 }}>
          {TOOLS.map(tool => (
            <ToolCard key={tool.id} tool={tool} onOpen={() => onNavigate(tool.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
