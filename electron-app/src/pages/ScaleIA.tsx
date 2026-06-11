import type { ReactNode } from 'react'

// ── Inline Lucide-style SVG icons (no emoji UI chrome) ─────────────────────────
type IconName = 'bot' | 'sparkles' | 'image' | 'trending-up'

function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    'bot': <><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" /></>,
    'sparkles': <path d="M9.94 14.34A2 2 0 0 0 8.66 13l-6.13-1.9a.5.5 0 0 1 0-.95l6.13-1.9a2 2 0 0 0 1.28-1.28l1.9-6.13a.5.5 0 0 1 .95 0l1.9 6.13a2 2 0 0 0 1.28 1.28l6.13 1.9a.5.5 0 0 1 0 .95l-6.13 1.9a2 2 0 0 0-1.28 1.28l-1.9 6.13a.5.5 0 0 1-.95 0z" />,
    'image': <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
    'trending-up': <><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      {paths[name]}
    </svg>
  )
}

export default function ScaleIA() {
  return (
    <div className="anim-page" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#06060e' }}>

      {/* ── Real background screenshot ───────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'url(/scaleia-bg.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        filter: 'blur(8px) brightness(0.3)',
        transform: 'scale(1.04)',
        pointerEvents: 'none',
      }} />

      {/* ── Overlay gradient ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 38%, rgba(99,102,241,0.22) 0%, rgba(6,6,14,0.75) 65%)',
        pointerEvents: 'none',
      }} />
      {/* Extra mask on top to hide any logo/branding */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 80,
        background: 'linear-gradient(to bottom, #06060e 40%, transparent)',
        pointerEvents: 'none',
      }} />

      {/* ── Glow halo ────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 500, height: 220,
        background: 'radial-gradient(ellipse, rgba(99,102,241,0.38) 0%, transparent 70%)',
        filter: 'blur(35px)',
        pointerEvents: 'none',
      }} />

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 0,
      }}>
        {/* Header icon */}
        <div className="sf-anim-scale-spring" style={{
          width: 56, height: 56, borderRadius: 16, marginBottom: 20,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(129,140,248,0.1))',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 32px rgba(99,102,241,0.3)',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.94 14.34A2 2 0 0 0 8.66 13l-6.13-1.9a.5.5 0 0 1 0-.95l6.13-1.9a2 2 0 0 0 1.28-1.28l1.9-6.13a.5.5 0 0 1 .95 0l1.9 6.13a2 2 0 0 0 1.28 1.28l6.13 1.9a.5.5 0 0 1 0 .95l-6.13 1.9a2 2 0 0 0-1.28 1.28l-1.9 6.13a.5.5 0 0 1-.95 0z"/>
          </svg>
        </div>

        {/* BIENTÔT chip */}
        <div className="sf-anim-slide-up sf-d50" style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase',
          color: '#818CF8', border: '1px solid rgba(99,102,241,0.45)',
          padding: '5px 14px', borderRadius: 100, background: 'rgba(99,102,241,0.1)',
          marginBottom: 20,
        }}>
          BIENTÔT DISPONIBLE
        </div>

        {/* Title */}
        <div className="sf-anim-slide-up sf-d100" style={{ marginBottom: 18, textAlign: 'center' }}>
          <span style={{
            fontSize: 68, fontWeight: 900, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #e2e8f0 0%, #818CF8 45%, #67e8f9 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Scale</span><span style={{
            fontSize: 68, fontWeight: 900, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg,#818CF8,#818CF8)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>IA</span>
        </div>

        {/* Subtitle */}
        <p className="sf-anim-slide-up sf-d150" style={{
          fontSize: 15, color: 'rgba(226,232,240,0.55)', textAlign: 'center',
          maxWidth: 480, lineHeight: 1.65, marginBottom: 32,
        }}>
          Crée ta modèle IA, génère du contenu illimité<br />
          et construis ton empire Instagram.
        </p>

        {/* Feature pills */}
        <div className="sf-anim-slide-up sf-d200" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 520, marginBottom: 44 }}>
          {[
            { icon: <Icon name="bot" />, label: 'Modèle IA Custom' },
            { icon: <Icon name="sparkles" />, label: 'Contenu génératif' },
            { icon: <Icon name="image" />, label: 'Photos & Vidéos IA' },
            { icon: <Icon name="trending-up" />, label: 'Empire Instagram' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 100,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              fontSize: 12, color: 'rgba(226,232,240,0.7)',
            }}>
              <span style={{ display: 'flex', color: '#818CF8' }}>{f.icon}</span>
              <span style={{ fontWeight: 500 }}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="sf-anim-slide-up sf-d250" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'rgba(129,140,248,0.7)', letterSpacing: '0.1em', fontWeight: 600 }}>EN DÉVELOPPEMENT</span>
          <div style={{ width: 240, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: '10%', height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg, #6366F1, #818CF8)',
              boxShadow: '0 0 8px rgba(99,102,241,0.8)',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>10% terminé</span>
        </div>
      </div>
    </div>
  )
}
