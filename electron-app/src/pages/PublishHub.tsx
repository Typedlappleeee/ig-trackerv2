import { useState, useContext } from 'react'
import type { Page } from '@/components/Layout'
import { LicenseContext } from '@/lib/license'

// ── Publication — hub des types de publication (Reels · Story · Photo) ────────
// Refonte premium : icônes SVG + mini-aperçu vivant de chaque type.

type IconFn = (p: { size?: number }) => JSX.Element
const S = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })
const IconReels: IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 8h18"/><path d="M8 3l2.5 5"/><path d="M14 3l2.5 5"/><path d="M11 12.5v4l3.5-2z" fill="currentColor" stroke="none"/></svg>)
const IconStory: IconFn = ({ size }) => (<svg {...S(size)}><circle cx="12" cy="12" r="9" strokeDasharray="3.6 3.2"/><path d="M9.5 12a2 2 0 0 1 2-2h1"/><path d="M14.5 12a2 2 0 0 1-2 2h-1"/><path d="M10.5 12h3"/></svg>)
const IconPhoto: IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.6"/><path d="M4 17l4.5-4.5a2 2 0 0 1 2.8 0L20 21"/></svg>)

type PreviewKind = 'reels' | 'story' | 'photo'

interface Kind {
  id: Page; Icon: IconFn; title: string; tag: string; desc: string
  grad: string; glow: string; accent: string; preview: PreviewKind
  soon?: boolean; admin?: boolean
}

const KINDS: Kind[] = [
  { id: 'posting', Icon: IconReels, title: 'Reels', tag: 'Vidéo', preview: 'reels',
    desc: 'Publie un Reels sur tous tes comptes Instagram & TikTok, en parallèle et sans surveillance.',
    grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.45)', accent: '#818CF8' },
  { id: 'storylink', Icon: IconStory, title: 'Story', tag: 'Sticker lien', preview: 'story',
    desc: 'Publie une story avec un sticker lien propre à chaque compte, en masse.',
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.42)', accent: '#FBBF24' },
  { id: 'photoposting', Icon: IconPhoto, title: 'Photo', tag: 'Feed', preview: 'photo', soon: true,
    desc: 'Publie une photo dans le feed sur tes comptes.',
    grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.4)', accent: '#34D399' },
]

function Preview({ kind, accent }: { kind: PreviewKind; accent: string }) {
  const box: React.CSSProperties = {
    position: 'relative', height: 96, borderRadius: 12, overflow: 'hidden',
    background: 'radial-gradient(120% 120% at 20% 0%, rgba(255,255,255,0.04), rgba(0,0,0,0.25))',
    border: '1px solid rgba(255,255,255,0.06)', padding: 12,
  }
  if (kind === 'reels') {
    const rows = [['iPhone-01', 'ok'], ['iPhone-02', 'ok'], ['iPhone-03', 'run']] as const
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        {rows.map(([n, st], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9.5 }}>
            <span style={{ fontFamily: 'ui-monospace,monospace', color: 'rgba(233,234,240,0.7)', flex: 1 }}>{n}</span>
            {st === 'ok' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#34D399', fontWeight: 800 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> publié
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#FBBF24', fontWeight: 800 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FBBF24' }} /> en cours
              </span>
            )}
          </div>
        ))}
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '89%', borderRadius: 99, background: `linear-gradient(90deg,${accent},#34D399)` }} />
          </div>
          <span style={{ fontSize: 9, fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums' }}>42/47</span>
        </div>
      </div>
    )
  }
  if (kind === 'story') {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#3a2a12,#160f08)' }}>
        <div style={{ width: 52, height: 74, borderRadius: 9, background: 'linear-gradient(160deg,#5b4020,#241606)', border: '1px solid rgba(255,255,255,0.12)', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 7.5, fontWeight: 800, color: '#0a0a0d', background: '#fff', borderRadius: 5, padding: '3px 6px' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
            LIEN
          </span>
        </div>
        <span style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.4)' }}>sticker par compte</span>
      </div>
    )
  }
  // photo (soon)
  return (
    <div style={{ ...box, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, alignItems: 'center' }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} style={{ aspectRatio: '1', borderRadius: 6, background: `linear-gradient(160deg, rgba(16,185,129,${0.14 - i * 0.012}), rgba(0,0,0,0.25))`, border: '1px solid rgba(255,255,255,0.06)' }} />
      ))}
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, background: 'rgba(8,8,12,0.35)', backdropFilter: 'blur(1px)' }}>Bientôt</span>
    </div>
  )
}

function KindCard({ kind, onOpen, disabled, badge }: { kind: Kind; onOpen: () => void; disabled?: boolean; badge?: string }) {
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const active = hover && !disabled
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
        position: 'relative', textAlign: 'left', overflow: 'hidden',
        padding: 22, borderRadius: 22,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))',
        border: `1px solid ${active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
        transform: active ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: active
          ? `0 30px 64px -24px ${kind.glow}, inset 0 1px 0 0 rgba(255,255,255,0.1)`
          : 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 8px 30px -18px rgba(0,0,0,0.6)',
        transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s, border-color 0.3s',
        display: 'flex', flexDirection: 'column', gap: 16, isolation: 'isolate',
        opacity: disabled ? 0.62 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(460px circle at ${pos.x}% ${pos.y}%, ${kind.glow}, transparent 62%)`, opacity: active ? 0.4 : 0, transition: 'opacity 0.3s' }} />
      <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: kind.grad, opacity: active ? 1 : 0.7, transition: 'opacity 0.3s', zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 50, height: 50, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', background: kind.grad,
          boxShadow: `0 10px 24px -8px ${kind.glow}, inset 0 1px 0 0 rgba(255,255,255,0.35)`,
          transform: active ? 'scale(1.06) rotate(-3deg)' : 'scale(1)', transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}><kind.Icon size={24} /></div>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: badge ? '#fbbf24' : kind.accent, background: badge ? 'rgba(251,191,36,0.1)' : `${kind.accent}12`, border: `1px solid ${badge ? 'rgba(251,191,36,0.4)' : `${kind.accent}30`}`, borderRadius: 20, padding: '4px 11px' }}>{badge ?? kind.tag}</span>
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{kind.title}</h3>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'rgba(233,234,240,0.52)' }}>{kind.desc}</p>
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
        <Preview kind={kind.preview} accent={kind.accent} />
      </div>

      <div style={{ position: 'relative', zIndex: 2, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: active ? '#fff' : 'rgba(233,234,240,0.68)', transition: 'color 0.2s, gap 0.2s', gap: active ? 10 : 7 }}>
        {disabled ? (badge === 'Bientôt' ? 'Bientôt disponible' : 'Indisponible') : 'Publier'}
        {!disabled && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        )}
      </div>
    </button>
  )
}

export function PublishHub({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const isSuperAdmin = useContext(LicenseContext)?.isSuperAdmin === true
  const visibleKinds = KINDS.filter(k => !k.admin || isSuperAdmin)
  return (
    <div style={{ minHeight: '100%', background: 'var(--base)', padding: '32px 32px 90px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -120, left: '8%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)', filter: 'blur(44px)', animation: 'ph-float-a 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 30, right: '4%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.11), transparent 70%)', filter: 'blur(44px)', animation: 'ph-float-b 22s ease-in-out infinite' }} />
        <style>{`
          @keyframes ph-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,30px)} }
          @keyframes ph-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,40px)} }
        `}</style>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 14, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
            Publication
          </div>
          <h1 style={{ margin: '0 0 10px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, background: 'linear-gradient(120deg,#fff 20%,#a5b4fc 55%,#6ee7b7 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Publie partout, en un clic
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(233,234,240,0.5)', maxWidth: 580, lineHeight: 1.6 }}>
            Choisis ton type de publication — Reels, Story ou Photo — et diffuse sur tous tes comptes Instagram & TikTok automatiquement.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
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
