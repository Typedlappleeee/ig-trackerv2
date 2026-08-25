const ITEMS = [
  'Mass Posting', 'Instagram + TikTok', 'Programmation', 'Auto-Warmup', 'Remix vidéo',
  'Captions IA', 'Cloud Phones GeeLark', 'Stories automatiques', 'Multi-comptes', "Collaboration d'équipe",
]

export function Marquee() {
  const row = [...ITEMS, ...ITEMS]
  return (
    <div className="relative z-[1] overflow-hidden border-y border-white/[0.07] bg-white/[0.015] py-4.5">
      <div className="marquee-mask overflow-hidden">
        <div className="animate-marquee flex w-max items-center whitespace-nowrap">
          {row.map((item, i) => (
            <span key={i} className="flex items-center">
              <span className="font-display text-sm font-semibold tracking-tight text-text2">{item}</span>
              <span
                className="mx-[22px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: 'linear-gradient(135deg,#5EEAD4,#818CF8)' }}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
