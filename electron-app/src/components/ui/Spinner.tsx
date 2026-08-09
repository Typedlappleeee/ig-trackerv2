interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// Dimensions & épaisseurs de trait par taille (px). Le rendu s'appuie sur la
// classe canonique `.sf-spinner` (anneau accent indigo + halo doux) d'index.css ;
// on ne surcharge que la géométrie pour rester on-brand.
const DIM    = { sm: 16, md: 28, lg: 40 } as const
const STROKE = { sm: 2,  md: 2,  lg: 3  } as const

/**
 * Spinner v2 — réservé au chargement inline (bouton « Sync… ») et aux petits
 * indicateurs d'activité. Pour un contenu de page/liste, préférer un squelette
 * (`Skeleton` / `SkeletonGrid` d'ui/Page). API inchangée (`size`, `className`).
 */
export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`sf-spinner ${className}`.trim()}
      role="status"
      aria-label="Chargement"
      style={{ width: DIM[size], height: DIM[size], borderWidth: STROKE[size] }}
    />
  )
}

/**
 * Loader plein écran pour le bootstrap de l'app / fallback Suspense de route
 * (layout inconnu → un anneau accent branché est acceptable ici). Habillage v2 :
 * fond de base, halo accent discret, libellé text-2.
 */
export function FullPageLoader() {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--base, #07070B)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <Spinner size="lg" />
        <p style={{ fontSize: 13, color: 'var(--text-2)', letterSpacing: '0.01em', margin: 0 }}>
          Chargement…
        </p>
      </div>
    </div>
  )
}
