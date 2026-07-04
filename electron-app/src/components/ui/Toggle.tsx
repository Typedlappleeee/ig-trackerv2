import type { ReactNode } from 'react'

interface ToggleProps {
  on:          boolean
  onChange:    (v: boolean) => void
  label?:      ReactNode
  hint?:       ReactNode
  /** Point rouge d'alerte à côté du label (ex. réglage non configuré) */
  warn?:       boolean
  warnTitle?:  string
  disabled?:   boolean
  size?:       'sm' | 'md'
}

/**
 * Interrupteur unifié (remplace les 5 copies inline dans les pages).
 * Utilise les tokens du design system (var(--accent), var(--text-*)…).
 */
export function Toggle({ on, onChange, label, hint, warn, warnTitle, disabled, size = 'md' }: ToggleProps) {
  const w = size === 'sm' ? 34 : 38
  const h = size === 'sm' ? 20 : 22
  const knob = h - 4
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: disabled ? 0.5 : 1 }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => !disabled && onChange(!on)}
        className={disabled ? '' : 'cursor-pointer'}
        style={{
          position: 'relative', width: w, height: h, borderRadius: 999, flexShrink: 0, border: 'none', padding: 0,
          transition: 'background .18s', outline: 'none',
          background: on ? 'linear-gradient(130deg,var(--accent),var(--accent-lt))' : 'var(--border-strong)',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: 2, width: knob, height: knob, borderRadius: '50%', background: '#fff',
          transition: 'transform .18s', transform: on ? `translateX(${w - h}px)` : 'translateX(0)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
      {(label || hint) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {label && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
              {label}
              {warn && (
                <span title={warnTitle}
                  style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 0 3px rgba(239,68,68,0.18)', flexShrink: 0 }} />
              )}
            </span>
          )}
          {hint && <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{hint}</span>}
        </div>
      )}
    </div>
  )
}
