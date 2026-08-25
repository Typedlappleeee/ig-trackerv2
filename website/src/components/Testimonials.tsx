import { useReveal } from '../hooks/useReveal'

const TESTIMONIALS = [
  {
    stat: '+340%', statLabel: 'de reach en 2 mois', statGrad: 'linear-gradient(90deg,#22D3EE,#818CF8)',
    quote: "Avant ScaleFlow je passais mes journées à copier-coller des reels téléphone par téléphone. Maintenant je programme 120 comptes le lundi matin et c'est plié pour la semaine. Le mass posting parallèle est juste irréel.",
    agency: 'Agence GrowthPulse', role: 'Agence Growth · 120 comptes',
    initials: 'GP', avatar: 'linear-gradient(135deg,#22D3EE,#818CF8)', glow: 'rgba(34,211,238,0.3)',
  },
  {
    stat: '90%+', statLabel: 'de comptes conservés', statGrad: 'linear-gradient(90deg,#A855F7,#EC4899)',
    quote: "L'auto-warmup m'a sauvé. Je montais 30 nouveaux comptes par mois et j'en perdais la moitié. Depuis que ScaleFlow gère les routines de chauffe, mon taux de survie est passé au-dessus de 90%. Rien que ça vaut l'abonnement.",
    agency: 'Agence UGC Lab', role: 'Contenu UGC · 45 comptes',
    initials: 'UL', avatar: 'linear-gradient(135deg,#A855F7,#EC4899)', glow: 'rgba(168,85,247,0.35)',
  },
  {
    stat: '15h', statLabel: 'gagnées par semaine', statGrad: 'linear-gradient(90deg,#818CF8,#34D399)',
    quote: 'On gère les comptes de 12 clients sur GeeLark et le dashboard ScaleFlow est devenu notre tour de contrôle. Les rôles d\'équipe, les stats par compte, le studio remix... tout est pensé pour bosser à plusieurs sans se marcher dessus.',
    agency: 'Agence ScaleUp Media', role: 'SMMA · 300+ comptes',
    initials: 'SM', avatar: 'linear-gradient(135deg,#818CF8,#34D399)', glow: 'rgba(52,211,153,0.3)',
  },
]

export function Testimonials() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      id="testimonials"
      className="relative z-[1] px-6 py-25"
      style={{
        background: 'rgba(124,58,237,0.04)',
        borderTop: '1px solid rgba(139,92,246,0.18)',
        borderBottom: '1px solid rgba(139,92,246,0.18)',
      }}
      ref={ref}
    >
      <div className="mx-auto max-w-[1140px]">
        <div className="reveal mx-auto max-w-[640px] text-center">
          <span className="section-label">Social proof</span>
          <h2 className="font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-[46px]">
            Ils font tourner <span className="gradient-text-warm">ScaleFlow.</span>
          </h2>
          <p className="mt-4.5 text-base leading-relaxed text-text2">
            Agences &amp; créateurs Instagram/TikTok qui scalent leurs fermes de comptes tous les jours avec nous.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <figure
              key={t.agency}
              className="reveal m-0 flex flex-col gap-4.5 rounded-[20px] border border-white/[0.09] bg-white/[0.03] p-7"
              style={{
                transitionDelay: `${i * 0.08}s`,
                transition: 'transform 0.3s ease, box-shadow 0.3s ease, opacity 0.7s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = `0 24px 60px -20px ${t.glow}`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
              }}
            >
              <div className="flex items-baseline gap-2.5">
                <span
                  className="font-display text-[34px] font-bold leading-none"
                  style={{ background: t.statGrad, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                >
                  {t.stat}
                </span>
                <span className="text-xs font-semibold text-text2">{t.statLabel}</span>
              </div>

              <blockquote className="m-0 flex-1 text-[14.5px] leading-[1.7] text-[rgba(226,222,255,0.85)]">
                « {t.quote} »
              </blockquote>

              <figcaption className="flex items-center gap-3 border-t border-white/[0.07] pt-4">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-[#0A0A16]"
                  style={{ background: t.avatar }}
                  aria-hidden="true"
                >
                  {t.initials}
                </span>
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="truncate text-[13px] font-extrabold uppercase tracking-[0.08em] text-text">{t.agency}</span>
                  <span className="truncate text-xs font-semibold text-text2">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
