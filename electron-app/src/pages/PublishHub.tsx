import { useState, useContext } from 'react'
import type { Page } from '@/components/Layout'
import { LicenseContext } from '@/lib/license'

// ── Publication — hub des types de publication (Reels · Story · Photo) ────────

interface Kind {
  id:   Page
  icon: string
  title: string
  tag:  string
  desc: string
  grad: string
  glow: string
  soon?: boolean
  admin?: boolean
}

const KINDS: Kind[] = [
  {
    id: 'posting', icon: '🎬', title: 'Reels', tag: 'Vidéo',
    desc: 'Publie un Reels.',
    grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.45)',
  },
  {
    id: 'storylink', icon: '🔗', title: 'Story', tag: 'Sticker lien', admin: true,
    desc: 'Publie une story avec un lien.',
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.42)',
  },
  {
    id: 'photoposting', icon: '🖼️', title: 'Photo', tag: 'Feed', soon: true,
    desc: 'Publie une photo.',
    grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.4)',
  },
]

function KindCard({ kind, onOpen, disabled, badge }: { kind: Kind; onOpen: () => void; disabled?: boolean; badge?: string }) {
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  return (
    <button
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
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
        transform: (hover && !disabled) ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: (hover && !disabled) ? `0 24px 60px -20px ${kind.glow}, 0 0 0 1px rgba(255,255,255,0.06)` : '0 8px 30px -18px rgba(0,0,0,0.6)',
        transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s',
        display: 'flex', flexDirection: 'column', gap: 14, isolation: 'isolate',
        opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(380px circle at ${pos.x}% ${pos.y}%, ${kind.glow}, transparent 60%)`,
        opacity: hover ? 0.5 : 0, transition: 'opacity 0.3s',
      }} />
      <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: kind.grad, opacity: 0.9, zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 54, height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, background: kind.grad, boxShadow: `0 8px 22px -6px ${kind.glow}`,
        }}>{kind.icon}</div>
        <span style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: badge ? '#fbbf24' : 'rgba(233,234,240,0.55)',
          border: `1px solid ${badge ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 20, padding: '4px 10px',
        }}>{badge ?? kind.tag}</span>
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{kind.title}</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'rgba(233,234,240,0.5)' }}>{kind.desc}</p>
      </div>

      <div style={{
        position: 'relative', zIndex: 2, marginTop: 'auto', display: 'inline-flex', alignItems: 'center',
        fontSize: 12.5, fontWeight: 700, color: hover ? '#fff' : 'rgba(233,234,240,0.7)',
        transition: 'color 0.2s, gap 0.2s', gap: hover ? 10 : 7,
      }}>
        {disabled ? (badge === 'Bientôt' ? 'Bientôt disponible' : 'Indisponible') : 'Publier'}
        {!disabled && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        )}
      </div>
    </button>
  )
}

export function PublishHub({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const isSuperAdmin = useContext(LicenseContext)?.isSuperAdmin === true
  // Story réservé aux admins pour l'instant → masqué pour les autres.
  const visibleKinds = KINDS.filter(k => !k.admin || isSuperAdmin)
  return (
    <div style={{ minHeight: '100%', background: 'var(--base)', padding: '32px 32px 90px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -120, left: '8%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)', filter: 'blur(40px)', animation: 'ph-float-a 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 30, right: '4%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.12), transparent 70%)', filter: 'blur(40px)', animation: 'ph-float-b 22s ease-in-out infinite' }} />
        <style>{`
          @keyframes ph-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,30px)} }
          @keyframes ph-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,40px)} }
        `}</style>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.4)' }}>
            <span style={{ fontSize: 15 }}>🚀</span> Publication
          </div>
          <h1 style={{
            margin: '0 0 10px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.02,
            background: 'linear-gradient(120deg,#fff 20%,#a5b4fc 55%,#6ee7b7 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Publie partout, en un clic
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(233,234,240,0.5)', maxWidth: 560, lineHeight: 1.6 }}>
            Choisis ton type de publication — Reels, Story ou Photo — et diffuse sur tous tes comptes automatiquement.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {visibleKinds.map(kind => (
            <KindCard
              key={kind.id}
              kind={kind}
              disabled={kind.soon}
              badge={kind.soon ? 'Bientôt' : kind.admin ? 'Admin' : undefined}
              onOpen={() => onNavigate(kind.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
