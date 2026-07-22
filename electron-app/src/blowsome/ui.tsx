// Blowsome — kit UI VIP partagé (design system de la sous-application).
// Volontairement autonome (pas de dépendance au thème ScaleFlow) pour une identité
// distincte : verre dépoli, dégradés rose→violet→indigo, or champagne, grand type.
import { useEffect, type CSSProperties, type ReactNode } from 'react'

export const GRAD = 'linear-gradient(100deg,#EC4899,#A855F7,#6366F1)'
export const GOLD = '#E9C46A'
export const INK = '#ECE9F5'
export const MUTED = 'rgba(236,233,245,0.62)'
export const FAINT = 'rgba(236,233,245,0.4)'
export const HAIR = 'rgba(255,255,255,0.08)'

export const BLOW_CSS = `
@keyframes blow-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes blow-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes blow-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes blow-orb{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,30px) scale(1.12)}}
@keyframes blow-glow{0%,100%{opacity:.45}50%{opacity:.9}}
@keyframes blow-spin{to{transform:rotate(360deg)}}
.blow-scroll::-webkit-scrollbar{width:9px;height:9px}
.blow-scroll::-webkit-scrollbar-thumb{background:rgba(168,85,247,0.28);border-radius:9px}
.blow-scroll::-webkit-scrollbar-thumb:hover{background:rgba(168,85,247,0.45)}
.blow-card{transition:transform .28s cubic-bezier(.16,1,.3,1),box-shadow .28s,border-color .28s}
.blow-tap{transition:transform .12s ease, background .18s ease, color .18s ease}
.blow-tap:active{transform:scale(.97)}
`

export function useBlowCSS() {
  useEffect(() => {
    const id = 'sf-blowsome-ui-css'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id; el.textContent = BLOW_CSS
      document.head.appendChild(el)
    }
  }, [])
}

// Gradient text helper
export function Grad({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ backgroundImage: GRAD, backgroundSize: '200% auto', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', ...style }}>
      {children}
    </span>
  )
}

// Glass card
export function BlowCard({ children, style, hover, onClick, className }: {
  children: ReactNode; style?: CSSProperties; hover?: boolean; onClick?: () => void; className?: string
}) {
  return (
    <div
      onClick={onClick}
      className={`blow-card blow-scroll ${className ?? ''}`}
      style={{
        background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))',
        border: `1px solid ${HAIR}`,
        borderRadius: 18,
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 10px 30px -20px rgba(0,0,0,0.7)',
        cursor: onClick ? 'pointer' : undefined,
        ...(hover ? {} : {}),
        ...style,
      }}
      onMouseEnter={hover ? (e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)' } : undefined}
      onMouseLeave={hover ? (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = HAIR } : undefined}
    >
      {children}
    </div>
  )
}

// KPI / stat tile
export function BlowStat({ label, value, delta, icon, accent = '#A855F7', delay = 0 }: {
  label: string; value: string | number; delta?: string; icon?: ReactNode; accent?: string; delay?: number
}) {
  return (
    <BlowCard hover style={{ flex: 1, minWidth: 180, padding: 20, position: 'relative', overflow: 'hidden', animation: `blow-rise .5s cubic-bezier(.16,1,.3,1) ${delay}s both` }}>
      <div aria-hidden style={{ position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${accent}44, transparent 68%)`, opacity: .5 }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED }}>{label}</span>
        {icon && <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#fff', background: `linear-gradient(135deg, ${accent}, #6366F1)`, boxShadow: `0 8px 20px -8px ${accent}` }}>{icon}</span>}
      </div>
      <p style={{ position: 'relative', margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-.03em', color: INK, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {delta && <p style={{ position: 'relative', margin: '8px 0 0', fontSize: 12, fontWeight: 600, color: delta.startsWith('-') ? '#F87171' : '#34D399' }}>{delta}</p>}
    </BlowCard>
  )
}

export function BlowPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24, animation: 'blow-rise .5s cubic-bezier(.16,1,.3,1) both' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-.035em', color: INK }}>{title}</h1>
        {subtitle && <p style={{ margin: '6px 0 0', fontSize: 14, color: MUTED }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function BlowBadge({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'gold' | 'ok' | 'muted' }) {
  const map: Record<string, CSSProperties> = {
    accent: { background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.4)', color: '#D8B4FE' },
    gold:   { background: 'rgba(233,196,106,0.14)', border: '1px solid rgba(233,196,106,0.4)', color: GOLD },
    ok:     { background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.4)', color: '#6EE7B7' },
    muted:  { background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIR}`, color: MUTED },
  }
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, ...map[tone] }}>{children}</span>
}

export function BlowButton({ children, onClick, variant = 'primary', style }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost'; style?: CSSProperties
}) {
  const base: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', border: 'none' }
  const v: CSSProperties = variant === 'primary'
    ? { color: '#fff', background: GRAD, backgroundSize: '160% auto', boxShadow: '0 12px 28px -12px rgba(168,85,247,0.7)' }
    : { color: INK, background: 'rgba(255,255,255,0.05)', border: `1px solid ${HAIR}` }
  return <button className="blow-tap" onClick={onClick} style={{ ...base, ...v, ...style }}>{children}</button>
}

export function BlowEmpty({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: '54px 20px', gap: 10 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', color: '#D8B4FE', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)' }}>{icon ?? '✦'}</div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK }}>{title}</p>
      {hint && <p style={{ margin: 0, fontSize: 13, color: MUTED, maxWidth: 360 }}>{hint}</p>}
    </div>
  )
}

// Simple inline SVG icon
export function Ico({ d, size = 18, sw = 1.8 }: { d: string; size?: number; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>
}

export const ICON = {
  grid: 'M4 5a1 1 0 0 1 1-1h5v6H4V5z|M14 4h5a1 1 0 0 1 1 1v5h-6V4z|M4 14h6v6H5a1 1 0 0 1-1-1v-5z|M14 14h6v5a1 1 0 0 1-1 1h-5v-6z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 7a4 4 0 1 0 0 0.01|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  rocket: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z|M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z',
  chart: 'M3 3v18h18|M18.7 8l-5.1 5.2-2.8-2.7L7 14.3',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  back: 'M19 12H5|M11 6l-6 6 6 6',
  spark: 'M12 2l1.9 5.9L20 10l-6.1 2.1L12 18l-1.9-5.9L4 10l6.1-2.1z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z',
  bolt: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
} as const
