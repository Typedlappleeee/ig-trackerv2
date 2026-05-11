import { useId } from 'react'

/** S + arrow icon only — use in splash screen, favicon areas, etc. */
export function ScaleFlowIcon({ size = 108 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  const gId = `sfg-${id}`
  return (
    <svg width={size} height={size} viewBox="-5 -22 110 122" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gId} x1="50" y1="100" x2="85" y2="-22" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#38B2FF" />
          <stop offset="50%"  stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      {/* S center-line → ribbon via thick stroke */}
      <path
        d="M25,92 C82,92 82,55 50,50 C18,45 18,8 72,8 L92,-16"
        stroke={`url(#${gId})`}
        strokeWidth="19"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow head */}
      <path d="M92,-16 L75,-7 L80,8 Z" fill="#EC4899" />
    </svg>
  )
}

/** Full mark: icon + "ScaleFlow" wordmark side-by-side (sidebar use) */
export function ScaleFlowMark({ iconSize = 32 }: { iconSize?: number }) {
  const id = useId().replace(/:/g, '')
  const gId  = `sfm-${id}`
  const tId  = `sft-${id}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={iconSize} height={iconSize} viewBox="-5 -22 110 122" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gId} x1="50" y1="100" x2="85" y2="-22" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#38B2FF" />
            <stop offset="50%"  stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        <path
          d="M25,92 C82,92 82,55 50,50 C18,45 18,8 72,8 L92,-16"
          stroke={`url(#${gId})`}
          strokeWidth="19"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M92,-16 L75,-7 L80,8 Z" fill="#EC4899" />
      </svg>
      <svg width={90} height={iconSize} viewBox="0 0 200 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={tId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor="#FFFFFF" />
            <stop offset="55%"  stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#38B2FF" />
          </linearGradient>
        </defs>
        <text y="34" fontFamily="Inter, system-ui, sans-serif" fontSize="36" fontWeight="800" letterSpacing="-1">
          <tspan fill="white">Scale</tspan>
          <tspan fill={`url(#${tId})`}>Flow</tspan>
        </text>
      </svg>
    </div>
  )
}

/** Badge icon for auth page / small accent squares */
export function ScaleFlowBadge({ size = 64 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  const gId = `sfb-${id}`
  return (
    <div style={{
      width: size, height: size,
      borderRadius: size * 0.25,
      background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(236,72,153,0.12) 100%)',
      border: '1px solid rgba(124,58,237,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="-5 -22 110 122" fill="none">
        <defs>
          <linearGradient id={gId} x1="50" y1="100" x2="85" y2="-22" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#38B2FF" />
            <stop offset="50%"  stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        <path
          d="M25,92 C82,92 82,55 50,50 C18,45 18,8 72,8 L92,-16"
          stroke={`url(#${gId})`}
          strokeWidth="19"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M92,-16 L75,-7 L80,8 Z" fill="#EC4899" />
      </svg>
    </div>
  )
}
