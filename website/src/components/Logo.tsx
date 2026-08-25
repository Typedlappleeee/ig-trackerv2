import type { CSSProperties } from 'react'

/**
 * Marque ScaleFlow — « Tuile ».
 * Deux barres de largeur égale, inclinées dans l'autre sens : le même contenu, dupliqué.
 * Rayon à 25 % de la taille pour rester dans la famille des icônes d'app.
 */
export function LogoMark({ size = 32, className = '', style }: {
  size?: number; className?: string; style?: CSSProperties
}) {
  const w = Math.round(size * 0.44)
  const h = Math.max(2, Math.round(size * 0.095))

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 flex-col items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        gap: Math.max(2, Math.round(size * 0.1)),
        borderRadius: Math.round(size * 0.25),
        background: 'linear-gradient(145deg,#A855F7,#7C3AED)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
        ...style,
      }}
    >
      <span style={{ width: w, height: h, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
      <span style={{ width: w, height: h, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
    </span>
  )
}

/** Marque + mot-symbole. Lettrage tout bas de casse, « flow » en violet. */
export function Logo({ size = 32, wordSize }: { size?: number; wordSize?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span
        className="whitespace-nowrap font-display font-semibold tracking-[-0.03em]"
        style={{ fontSize: wordSize ?? Math.round(size * 0.58) }}
      >
        <span className="text-white">scale</span>
        <span className="text-[#A855F7]">flow</span>
      </span>
    </span>
  )
}
