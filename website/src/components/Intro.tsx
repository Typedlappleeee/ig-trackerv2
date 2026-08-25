/** Rideau d'ouverture : se fend en deux, logo avec anneau en rotation. */
export function Intro() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90] animate-sf-intro-off">
      <div className="animate-sf-curtain-l absolute inset-y-0 left-0 right-1/2 border-r border-violet/35 bg-[#07070F]" />
      <div className="animate-sf-curtain-r absolute inset-y-0 left-1/2 right-0 bg-[#07070F]" />
      <div className="animate-sf-intro-mark absolute inset-0 flex flex-col items-center justify-center gap-5">
        <span className="relative flex h-[74px] w-[74px] items-center justify-center">
          <span className="animate-sf-spin absolute inset-0 rounded-[22px] border-2 border-violet/25 border-t-indigo" />
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[15px] bg-brand-gradient font-display text-[26px] font-bold text-[#0A0A16]">
            S
          </span>
        </span>
        <span className="font-display text-[12.5px] font-semibold uppercase tracking-[0.42em] text-text2">
          ScaleFlow
        </span>
      </div>
    </div>
  )
}
