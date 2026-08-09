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
 * État vide unifié v2 (icône flottante + halo + titre + description + CTA).
 * Repose sur les classes canoniques `.sf-empty*` d'index.css (tuile flottante,
 * halo radial, titre 14/700, description discrète) plutôt que sur des styles
 * inline. API inchangée — aucun appelant impacté.
 */
export function EmptyState({ icon, title, description, action, secondary, compact }: EmptyStateProps) {
  return (
    <div
      className="sf-empty sf-anim-slide-up"
      style={compact ? { padding: 'var(--sp-7) var(--sp-5)', gap: 'var(--sp-3)' } : undefined}
    >
      {icon && (
        <div className="sf-empty-icon" style={{ color: 'var(--accent-lt)' }}>
          {icon}
        </div>
      )}
      <p className="sf-empty-title" style={{ margin: 0 }}>{title}</p>
      {description && (
        <p className="sf-empty-desc" style={{ margin: 0 }}>{description}</p>
      )}
      {(action || secondary) && (
        <div className="sf-cluster" style={{ marginTop: 'var(--sp-1)', justifyContent: 'center' }}>
          {action && (
            <button
              onClick={action.onClick}
              disabled={action.disabled}
              className="sf-btn sf-btn-primary"
            >
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              onClick={secondary.onClick}
              className="sf-btn sf-btn-secondary"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
