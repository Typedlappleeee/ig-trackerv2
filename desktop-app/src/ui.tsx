import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { C, F, R, GLOW_PRIMARY } from './theme'

/* ─── Icônes — tracés SVG séparés par « | » ─────────────────────────────── */
export const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8|M5 10v10h5v-6h4v6h5V10',
  phone: 'M6 2h12v20H6z|M10 18h4',
  send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4z',
  calendar: 'M4 5h16v16H4z|M4 9h16|M8 3v4|M16 3v4',
  flame: 'M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1 .5-2 1.5-3C9 10 12 7 12 3z',
  video: 'M4 5h16v14H4z|M4 9h16|M9 13l3 2-3 2z',
  bank: 'M3 8l9-5 9 5|M5 8v11h14V8|M9 19v-6h6v6',
  library: 'M4 4h4v16H4z|M10 4h4v16h-4z|M17 5l3 1-4 15-3-1z',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  cloud: 'M6 18a4 4 0 0 1 0-8 5 5 0 0 1 10 1 3 3 0 0 1 0 6z',
  proxy: 'M12 2v4|M12 18v4|M2 12h4|M18 12h4|M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  flow: 'M5 4h6v6H5z|M13 14h6v6h-6z|M8 10v4h8',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M19 12l2-1-2-1M5 12l-2-1 2-1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M20 20l-4.3-4.3',
  plus: 'M12 5v14|M5 12h14',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6|M20 4v4h-4',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18|M6 6l12 12',
  chevron: 'M6 9l6 6 6-6',
  dots: 'M5 12h.01|M12 12h.01|M19 12h.01',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8|M10 21h4',
}

export function Icon({ paths, size = 16, w = 1.8, color = 'currentColor' }: { paths: string; size?: number; w?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.split('|').map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

/* ─── Bouton — 4 tons ────────────────────────────────────────────────────── */
type Tone = 'primary' | 'ghost' | 'quiet' | 'danger'
export function Btn({ label, tone = 'ghost', sm, icon, onClick, disabled, style }: { label?: ReactNode; tone?: Tone; sm?: boolean; icon?: string; onClick?: () => void; disabled?: boolean; style?: CSSProperties }) {
  const [h, setH] = useState(false)
  const tones: Record<Tone, CSSProperties> = {
    primary: { background: C.accent, border: '1px solid ' + C.accent, color: '#fff', boxShadow: h && !disabled ? GLOW_PRIMARY : 'none' },
    ghost: { background: h ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (h ? C.b3 : C.b2), color: C.t1 },
    quiet: { background: 'transparent', border: '1px solid transparent', color: h ? C.t1 : C.t2 },
    danger: { background: h ? 'rgba(248,113,113,0.14)' : 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: C.bad },
  }
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: sm ? 28 : 34, padding: sm ? '0 12px' : '0 16px', borderRadius: R.btn, fontFamily: F.sans, fontSize: sm ? 12 : 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap', transition: 'background .16s, border-color .16s, box-shadow .16s', ...tones[tone], ...style }}>
      {icon && <Icon paths={icon} size={sm ? 14 : 15} w={2} />}{label}
    </button>
  )
}

/* ─── Panneau ────────────────────────────────────────────────────────────── */
export function Panel({ children, style, pad = 18 }: { children: ReactNode; style?: CSSProperties; pad?: number }) {
  return <div style={{ background: C.panel, border: '1px solid ' + C.b1, borderRadius: R.panel, padding: pad, ...style }}>{children}</div>
}
export function PanelHead({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: F.display, fontSize: 14, fontWeight: 700, color: C.t1, letterSpacing: '-0.01em' }}>{title}</span>
        {sub && <span style={{ fontSize: 11.5, color: C.t3 }}>{sub}</span>}
      </div>
      {right}
    </div>
  )
}

/* ─── KPI ────────────────────────────────────────────────────────────────── */
export function Kpi({ label, value, color, hint, hintColor, icon }: { label: string; value: ReactNode; color?: string; hint?: string; hintColor?: string; icon?: string }) {
  return (
    <Panel pad={16} style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.t3 }}>{label}</span>
        {icon && <Icon paths={icon} size={14} color={C.t4} />}
      </div>
      <div style={{ marginTop: 12, fontFamily: F.display, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: color || C.t1, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: hintColor || C.t3 }}>{hint}</div>}
    </Panel>
  )
}

/* ─── Chip / statut ──────────────────────────────────────────────────────── */
type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'mute'
export function Chip({ text, tone = 'mute' }: { text: ReactNode; tone?: ChipTone }) {
  const m: Record<ChipTone, [string, string]> = {
    ok: ['rgba(52,211,153,0.12)', C.ok], warn: ['rgba(251,191,36,0.12)', C.warn], bad: ['rgba(248,113,113,0.12)', C.bad],
    info: ['rgba(56,189,248,0.12)', C.info], violet: [C.accentDim, C.accentLt], mute: ['rgba(255,255,255,0.05)', C.t2],
  }
  const [bg, fg] = m[tone]
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: R.badge, background: bg, color: fg, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>
}

export function StatusDot({ kind }: { kind: 'ok' | 'warn' | 'bad' | 'off' | 'boot' }) {
  const col = { ok: C.ok, warn: C.warn, bad: C.bad, off: C.t4, boot: C.cyan }[kind]
  return <span style={{ width: 7, height: 7, borderRadius: 99, background: col, boxShadow: kind === 'off' ? 'none' : `0 0 8px -1px ${col}`, flexShrink: 0, display: 'inline-block' }} />
}

/* ─── État vide ──────────────────────────────────────────────────────────── */
export function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid ' + C.b1, display: 'grid', placeItems: 'center', color: C.t3, marginBottom: 4 }}><Icon paths={icon} size={20} /></div>
      <div style={{ fontFamily: F.display, fontSize: 15, fontWeight: 700, color: C.t1 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: C.t3, maxWidth: 320 }}>{text}</div>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}

/* ─── En-tête de page ────────────────────────────────────────────────────── */
export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: F.display, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: C.t1 }}>{title}</h1>
        {sub && <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: C.t3, maxWidth: 560 }}>{sub}</p>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{right}</div>}
    </div>
  )
}

export function Mono({ children, color, size = 12 }: { children: ReactNode; color?: string; size?: number }) {
  return <span style={{ fontFamily: F.mono, fontSize: size, color: color || C.t2, fontWeight: 600 }}>{children}</span>
}
