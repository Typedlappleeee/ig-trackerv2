// Fabriques d'éléments portées à l'identique du prototype ScaleFlow.dc.html.
// _icon / _statusDot / _chip / _btn / _panel / _panelHead / _pageHead / _kpi / _empty
import type { CSSProperties, ReactNode } from 'react'
import type { Theme } from './theme'

// ── _icon ──────────────────────────────────────────────────────────────────────
export function Icon({ d, size = 14, sw = 1.8 }: { d: string; size?: number; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

// ── _statusDot ───────────────────────────────────────────────────────────────
const DOT_C: Record<string, string> = {
  online: '#10B981', warmup: '#F59E0B', limited: '#FBBF24', offline: '#52525B', error: '#EF4444',
}
export function StatusDot({ kind }: { kind: string }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 99, background: DOT_C[kind] || '#52525B',
      flexShrink: 0, animation: kind === 'warmup' ? 'aPulse 2s ease-in-out infinite' : 'none',
    }} />
  )
}

// ── _chip ──────────────────────────────────────────────────────────────────────
type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'mute'
const CHIP_T: Record<ChipTone, [string, string, string]> = {
  ok: ['rgba(16,185,129,0.1)', 'rgba(16,185,129,0.22)', '#34D399'],
  warn: ['rgba(245,158,11,0.1)', 'rgba(245,158,11,0.22)', '#FBBF24'],
  bad: ['rgba(239,68,68,0.1)', 'rgba(239,68,68,0.22)', '#F87171'],
  info: ['rgba(6,182,212,0.1)', 'rgba(6,182,212,0.22)', '#22D3EE'],
  violet: ['rgba(139,92,246,0.12)', 'rgba(139,92,246,0.26)', '#C4B5FD'],
  mute: ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.08)', '#A1A1AA'],
}
export function Chip({ text, tone = 'mute' }: { text: ReactNode; tone?: ChipTone }) {
  const T = CHIP_T[tone] || CHIP_T.mute
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px',
      borderRadius: 6, background: T[0], border: `1px solid ${T[1]}`, color: T[2],
      fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

// ── _btn ──────────────────────────────────────────────────────────────────────
type BtnTone = 'primary' | 'ghost' | 'quiet' | 'danger'
export function Btn({ label, theme, tone = 'ghost', sm, icon, onClick, disabled }: {
  label?: string; theme: Theme; tone?: BtnTone; sm?: boolean; icon?: string
  onClick?: () => void; disabled?: boolean
}) {
  const T = theme
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7, height: sm ? 28 : 32,
    padding: icon && !label ? '0' : `0 ${sm ? 11 : 13}px`,
    width: icon && !label ? (sm ? 28 : 32) : 'auto',
    justifyContent: 'center', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: sm ? 11.5 : 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    transition: 'all .16s ease', opacity: disabled ? 0.45 : 1, boxSizing: 'border-box',
  }
  const TONES: Record<BtnTone, CSSProperties> = {
    primary: { background: T.accentBtn, border: `1px solid ${T.accentBtnEdge}`, color: '#fff', boxShadow: `0 6px 16px -8px rgba(${T.tone},0.9)` },
    ghost: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#D4D4D8' },
    quiet: { background: 'transparent', border: '1px solid transparent', color: '#A1A1AA' },
    danger: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#F87171' },
  }
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      style={{ ...base, ...TONES[tone] }}
      onMouseEnter={e => {
        if (disabled) return
        if (tone === 'ghost') e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
        if (tone === 'quiet') e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
        if (tone === 'primary') e.currentTarget.style.background = T.accent
      }}
      onMouseLeave={e => {
        if (tone === 'ghost') e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
        if (tone === 'quiet') e.currentTarget.style.background = 'transparent'
        if (tone === 'primary') e.currentTarget.style.background = T.accentBtn
      }}
    >
      {icon ? <span style={{ display: 'flex' }}><Icon d={icon} size={sm ? 12 : 13} /></span> : null}
      {label}
    </button>
  )
}

// ── _panel ──────────────────────────────────────────────────────────────────────
export function Panel({ theme, style, children }: { theme: Theme; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{
      borderRadius: 10, background: theme.panelBg,
      border: `1px solid ${theme.panelEdge}`, overflow: 'hidden',
      boxShadow: theme.cloud ? '0 1px 0 rgba(255,255,255,0.03) inset' : 'none',
      ...style,
    }}>{children}</div>
  )
}

export function PanelHead({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F6' }}>{title}</span>
        {sub ? <span style={{ fontSize: 11, color: '#71717A' }}>{sub}</span> : null}
      </span>
      {right ? <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>{right}</span> : null}
    </div>
  )
}

// ── _pageHead ────────────────────────────────────────────────────────────────
export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 22,
          fontWeight: 700, letterSpacing: '-0.025em', color: '#F4F4F6',
        }}>{title}</h1>
        {sub ? <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#71717A', maxWidth: 560 }}>{sub}</p> : null}
      </div>
      {actions ? <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
    </div>
  )
}

// ── _kpi ──────────────────────────────────────────────────────────────────────
export function Kpi({ theme, label, value, color, hint, hintColor }: {
  theme: Theme; label: string; value: ReactNode; color?: string; hint?: ReactNode; hintColor?: string
}) {
  return (
    <Panel theme={theme} style={{ padding: 15 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#52525B' }}>{label}</div>
      <div style={{
        marginTop: 9, fontFamily: "'Space Grotesk',sans-serif", fontSize: 25,
        fontWeight: 700, letterSpacing: '-0.03em', color: color || '#F4F4F6',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{value}</div>
      {hint ? (
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: hintColor || '#71717A' }}>{hint}</div>
      ) : null}
    </Panel>
  )
}

// ── Bannière « Connecter tes comptes » (stats officielles Metricool) ──────────
// Introduit la connexion IG en haut de Performances / Santé (plutôt qu'un onglet).
export function ConnectBanner({ theme, onConnect }: { theme: Theme; onConnect: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 13, padding: '12px 15px', marginBottom: 14, borderRadius: 10,
      background: `rgba(${theme.tone},0.06)`, border: `1px solid rgba(${theme.tone},0.22)`,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: `rgba(${theme.tone},0.12)`, border: `1px solid rgba(${theme.tone},0.28)`, color: theme.accentText }}>
        <Icon d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" size={16} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F4F4F6' }}>Connecte tes comptes pour des stats officielles</span>
        <span style={{ fontSize: 11.5, color: '#71717A' }}>Vues, abonnés et engagement natifs via l'API Meta — remplit ces écrans automatiquement.</span>
      </span>
      <Btn theme={theme} tone="primary" sm icon="M12 5v14|M5 12h14" label="Connecter" onClick={onConnect} />
    </div>
  )
}

// ── _empty ──────────────────────────────────────────────────────────────────────
export function Empty({ icon, title, text, action }: { icon: string; title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '56px 24px', textAlign: 'center' }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 11,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#52525B',
      }}><Icon d={icon} size={19} /></span>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#E4E4E7' }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: '#71717A', maxWidth: 320 }}>{text}</div>
      {action ? <div style={{ marginTop: 4 }}>{action}</div> : null}
    </div>
  )
}
