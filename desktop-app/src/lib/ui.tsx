// Fabriques d'éléments portées à l'identique du prototype ScaleFlow.dc.html.
// _icon / _statusDot / _chip / _btn / _panel / _panelHead / _pageHead / _kpi / _empty
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
// Style « SaaS épuré » : pastilles discrètes, fond à peine teinté, texte coloré.
type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'mute'
const CHIP_T: Record<ChipTone, [string, string, string]> = {
  ok: ['rgba(16,185,129,0.08)', 'rgba(16,185,129,0.18)', '#4ADE80'],
  warn: ['rgba(245,158,11,0.08)', 'rgba(245,158,11,0.18)', '#FBBF24'],
  bad: ['rgba(239,68,68,0.08)', 'rgba(239,68,68,0.18)', '#F87171'],
  info: ['rgba(6,182,212,0.08)', 'rgba(6,182,212,0.18)', '#67E8F9'],
  violet: ['rgba(139,124,246,0.1)', 'rgba(139,124,246,0.22)', '#C4BBFB'],
  mute: ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.08)', '#A1A1AA'],
}
export function Chip({ text, tone = 'mute' }: { text: ReactNode; tone?: ChipTone }) {
  const T = CHIP_T[tone] || CHIP_T.mute
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', boxSizing: 'border-box',
      borderRadius: 5, background: T[0], border: `1px solid ${T[1]}`, color: T[2],
      fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1,
    }}>{text}</span>
  )
}

// ── _btn ──────────────────────────────────────────────────────────────────────
// primary = bouton plein clair (façon Vercel) ; ghost = bordé ; quiet = texte ; danger.
type BtnTone = 'primary' | 'ghost' | 'quiet' | 'danger'
export function Btn({ label, theme, tone = 'ghost', sm, icon, onClick, disabled }: {
  label?: string; theme: Theme; tone?: BtnTone; sm?: boolean; icon?: string
  onClick?: () => void; disabled?: boolean
}) {
  void theme
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: sm ? 28 : 32,
    padding: icon && !label ? '0' : `0 ${sm ? 10 : 12}px`,
    width: icon && !label ? (sm ? 28 : 32) : 'auto',
    justifyContent: 'center', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: sm ? 12 : 13, fontWeight: 500, whiteSpace: 'nowrap', letterSpacing: '-0.005em',
    transition: 'background .12s ease, border-color .12s ease, color .12s ease', opacity: disabled ? 0.4 : 1, boxSizing: 'border-box',
  }
  const TONES: Record<BtnTone, CSSProperties> = {
    primary: { background: '#EDEDEF', border: '1px solid #EDEDEF', color: '#0A0A0B' },
    ghost: { background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#E4E4E7' },
    quiet: { background: 'transparent', border: '1px solid transparent', color: '#A1A1AA' },
    danger: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' },
  }
  const HOVER: Record<BtnTone, CSSProperties> = {
    primary: { background: '#FFFFFF', borderColor: '#FFFFFF' },
    ghost: { background: '#1C1C1F', borderColor: 'rgba(255,255,255,0.14)' },
    quiet: { background: 'rgba(255,255,255,0.05)', color: '#E4E4E7' },
    danger: { background: 'rgba(239,68,68,0.14)' },
  }
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={label}
      style={{ ...base, ...TONES[tone] }}
      onMouseEnter={e => { if (!disabled) Object.assign(e.currentTarget.style, HOVER[tone]) }}
      onMouseLeave={e => { Object.assign(e.currentTarget.style, TONES[tone]) }}
    >
      {icon ? <span style={{ display: 'flex', opacity: tone === 'primary' ? 0.85 : 1 }}><Icon d={icon} size={sm ? 13 : 14} /></span> : null}
      {label}
    </button>
  )
}

// ── _panel ──────────────────────────────────────────────────────────────────────
export function Panel({ theme, style, children }: { theme: Theme; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{
      borderRadius: 8, background: theme.panelBg,
      border: `1px solid ${theme.panelEdge}`, overflow: 'hidden',
      ...style,
    }}>{children}</div>
  )
}

export function PanelHead({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', minHeight: 48, boxSizing: 'border-box',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>{title}</span>
        {sub ? <span style={{ fontSize: 12, color: '#8B8B94', lineHeight: 1.45 }}>{sub}</span> : null}
      </span>
      {right ? <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{right}</span> : null}
    </div>
  )
}

// ── _pageHead ────────────────────────────────────────────────────────────────
export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.2, color: '#EDEDEF' }}>{title}</h1>
        {sub ? <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: '#8B8B94', maxWidth: 620 }}>{sub}</p> : null}
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
    <Panel theme={theme} style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{label}</div>
      <div style={{
        marginTop: 8, fontSize: 24, fontWeight: 600, letterSpacing: '-0.03em', color: color || '#EDEDEF',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{value}</div>
      {hint ? (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: hintColor || '#71717A' }}>{hint}</div>
      ) : null}
    </Panel>
  )
}

// ── _modal — fenêtre modale générique (portée du prototype _modal()) ──────────
export function Modal({ title, sub, icon, theme, onClose, footer, width, children }: {
  title: string; sub?: string; icon?: string; theme: Theme; onClose: () => void
  footer?: ReactNode; width?: number; children: ReactNode
}) {
  void theme
  // Portal vers <body> : une modale doit être relative à l'écran, pas au conteneur
  // de page (qui a un transform d'animation → il piégeait le position:fixed).
  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 90, display: 'flex', justifyContent: 'center', padding: 24, overflowY: 'auto',
      background: 'rgba(0,0,0,0.6)', animation: 'aFade .14s ease both',
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} style={{
        display: 'flex', flexDirection: 'column', width: width ?? 560, maxWidth: '100%', maxHeight: 'calc(100vh - 48px)', margin: 'auto', borderRadius: 10, overflow: 'hidden',
        background: '#111113', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.7)',
        animation: 'aPop .18s cubic-bezier(0.16,1,0.3,1) both',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {icon && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, flexShrink: 0, background: '#1A1A1D', border: '1px solid rgba(255,255,255,0.08)', color: '#D4D4D8' }}><Icon d={icon} size={15} /></span>}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.015em' }}>{title}</span>
            {sub && <span style={{ fontSize: 12.5, color: '#8B8B94' }}>{sub}</span>}
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', color: '#8B8B94', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#EDEDEF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8B8B94' }}>
            <Icon d="M18 6L6 18|M6 6l12 12" size={14} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>{children}</div>
        {footer && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0E0E10', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ── Bannière « Connecter tes comptes » (stats officielles Metricool) ──────────
// Introduit la connexion IG en haut de Performances / Santé (plutôt qu'un onglet).
export function ConnectBanner({ theme, onConnect }: { theme: Theme; onConnect: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px', marginBottom: 16, borderRadius: 8,
      background: '#111113', border: '1px solid rgba(255,255,255,0.07)', boxShadow: `inset 2px 0 0 ${theme.accent}`,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: theme.accentText }}>
        <Icon d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" size={16} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>Connecte tes comptes pour des stats officielles</span>
        <span style={{ fontSize: 11.5, color: '#71717A' }}>Vues, abonnés et engagement natifs via l'API Meta — remplit ces écrans automatiquement.</span>
      </span>
      <Btn theme={theme} tone="primary" sm icon="M12 5v14|M5 12h14" label="Connecter" onClick={onConnect} />
    </div>
  )
}

// ── _empty ──────────────────────────────────────────────────────────────────────
export function Empty({ icon, title, text, action }: { icon: string; title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '52px 24px', textAlign: 'center' }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 8,
        background: '#161618', border: '1px solid rgba(255,255,255,0.08)', color: '#8B8B94',
      }}><Icon d={icon} size={18} /></span>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: '#8B8B94', maxWidth: 340 }}>{text}</div>
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  )
}
