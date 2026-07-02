// Bandeau défilant des capacités — touche premium entre le hero et les features.
const ITEMS = [
  'Mass Posting',
  'Instagram + TikTok',
  'Programmation',
  'Auto-Warmup',
  'Remix vidéo',
  'Captions IA',
  'Cloud Phones GeeLark',
  'Stories automatiques',
  'Multi-comptes',
  'Collaboration d\'équipe',
]

const Dot = () => (
  <span className="mx-5 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'linear-gradient(135deg,#5EEAD4,#818CF8)' }} />
)

export function Marquee() {
  const row = [...ITEMS, ...ITEMS]
  return (
    <div className="relative border-y border-border py-5" style={{ background: 'rgba(255,255,255,0.012)' }}>
      <div className="marquee-mask overflow-hidden">
        <div className="flex w-max animate-marquee items-center whitespace-nowrap">
          {row.map((item, i) => (
            <span key={i} className="flex items-center">
              <span className="font-display text-sm font-medium tracking-tight text-text2">{item}</span>
              <Dot />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
