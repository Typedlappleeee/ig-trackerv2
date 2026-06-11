import type { ReactNode, CSSProperties } from 'react'

// ── Page shell ───────────────────────────────────────────────────────────────
// Consistent max-width, padding and entrance animation for every page body.
export function PageShell({
  children, maxWidth = 1180, style,
}: { children: ReactNode; maxWidth?: number; style?: CSSProperties }) {
  return (
    <div style={{ minHeight: '100%', padding: '32px 36px 72px' }}>
      <div style={{ maxWidth, margin: '0 auto', animation: 'page-fade-in 0.4s ease both', ...style }}>
        {children}
      </div>
    </div>
  )
}

// ── Page header ──────────────────────────────────────────────────────────────
export function PageHeader({
  title, subtitle, icon, accent = '139,92,246', actions, eyebrow,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  accent?: string
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <div style={{ position: 'relative', marginBottom: 28 }}>
      <div style={{
        position: 'absolute', top: -50, left: 0, width: 360, height: 150,
        background: `radial-gradient(ellipse, rgba(${accent},0.13) 0%, transparent 70%)`,
        filter: 'blur(45px)', pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {icon && (
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, rgba(${accent},0.22), rgba(${accent},0.06))`,
              border: `1px solid rgba(${accent},0.25)`,
              color: `rgb(${accent})`,
            }}>
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {eyebrow && (
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: `rgba(${accent},0.85)`, marginBottom: 5 }}>
                {eyebrow}
              </p>
            )}
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: '#F3F1EC' }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ fontSize: 13.5, color: 'rgba(148,163,184,0.62)', marginTop: 6, lineHeight: 1.5, maxWidth: 560 }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: {
  width?: number | string; height?: number | string; radius?: number; style?: CSSProperties
}) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
      ...style,
    }} />
  )
}

// A grid of skeleton cards for list/grid loading states.
export function SkeletonGrid({ count = 6, cardHeight = 160, minWidth = 260 }: {
  count?: number; cardHeight?: number; minWidth?: number
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: cardHeight, borderRadius: 16,
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)',
          padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
          animation: `hub-card-in 0.4s ease both`, animationDelay: `${i * 0.05}s`,
        }}>
          <Skeleton width={44} height={44} radius={12} />
          <Skeleton width="70%" height={14} />
          <Skeleton width="90%" height={10} />
          <Skeleton width="50%" height={10} />
        </div>
      ))}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({
  icon, title, description, action, accent = '139,92,246',
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  accent?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '72px 24px', gap: 16,
      animation: 'scale-in 0.35s cubic-bezier(0.22,1,0.36,1) both',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, rgba(${accent},0.16), rgba(${accent},0.04))`,
        border: `1px solid rgba(${accent},0.2)`,
        color: `rgb(${accent})`, fontSize: 30,
      }}>
        {icon ?? '✦'}
      </div>
      <div style={{ maxWidth: 380 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#e8e6f0', marginBottom: 8 }}>{title}</h3>
        {description && <p style={{ fontSize: 13.5, color: 'rgba(148,163,184,0.58)', lineHeight: 1.6 }}>{description}</p>}
      </div>
      {action}
    </div>
  )
}
