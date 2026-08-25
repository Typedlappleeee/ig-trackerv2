export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="flex shrink-0 items-center justify-center rounded-[9px] font-display font-bold text-[#0A0A16]"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.5,
          background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)',
        }}
        aria-hidden="true"
      >
        S
      </span>
      <span className="font-display text-[17px] font-bold tracking-tight text-text">
        Scale<span className="gradient-text">Flow</span>
      </span>
    </span>
  )
}
