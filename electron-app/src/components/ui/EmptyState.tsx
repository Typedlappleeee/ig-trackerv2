import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?:        ReactNode
  title:        string
  description?: ReactNode
  /** Bouton d'action principal */
  action?:      { label: string; onClick: () => void; disabled?: boolean }
  /** Lien secondaire (ex. « Configurer dans les Réglages ») */
  secondary?:   { label: string; onClick: () => void }
  compact?:     boolean
}

/**
 * État vide unifié (icône + titre + description + CTA). Remplace les ~10 blocs
 * « Aucun … » codés à la main, souvent sans icône ni action.
 */
export function EmptyState({ icon, title, description, action, secondary, compact }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', gap: 10, padding: compact ? '32px 20px' : '56px 24px',
    }}>
      {icon && (
        <div style={{
          width: 52, height: 52, borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent-lt)', marginBottom: 2,
        }}>
          {icon}
        </div>
      )}
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</p>
      {description && (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', maxWidth: 340, lineHeight: 1.5, margin: 0 }}>{description}</p>
      )}
      {(action || secondary) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {action && (
            <button
              onClick={action.onClick}
              disabled={action.disabled}
              className={action.disabled ? '' : 'cursor-pointer'}
              style={{
                padding: '9px 16px', borderRadius: 'var(--r-md)', fontSize: 12.5, fontWeight: 600, border: 'none',
                background: 'linear-gradient(130deg,var(--accent),var(--accent-lt))', color: '#fff',
                opacity: action.disabled ? 0.5 : 1, cursor: action.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              onClick={secondary.onClick}
              className="cursor-pointer"
              style={{
                padding: '9px 16px', borderRadius: 'var(--r-md)', fontSize: 12.5, fontWeight: 600,
                background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-md)',
              }}
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
