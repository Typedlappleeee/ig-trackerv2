import { useEffect, useRef } from 'react'

const IStar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
)
const IQuote = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 21c3.5-1.2 6-4.2 6-8V5H3v8h4c0 2.5-1.5 4.5-4 5.5V21zm12 0c3.5-1.2 6-4.2 6-8V5h-6v8h4c0 2.5-1.5 4.5-4 5.5V21z" />
  </svg>
)

const TESTIMONIALS = [
  {
    quote:
      "Avant ScaleFlow je passais mes journées à copier-coller des reels téléphone par téléphone. Maintenant je programme 120 comptes le lundi matin et c'est plié pour la semaine. Le mass posting parallèle est juste irréel.",
    name: 'Quentin M.',
    role: 'Agence Growth · 120 comptes',
    handle: '@quentin.growth',
    initials: 'QM',
    gradient: 'linear-gradient(135deg, #22D3EE, #818CF8)',
    stars: 5,
    stat: '+340%',
    statLabel: 'de reach en 2 mois',
  },
  {
    quote:
      "L'auto-warmup m'a sauvé. Je montais 30 nouveaux comptes par mois et j'en perdais la moitié. Depuis que ScaleFlow gère les routines de chauffe, mon taux de survie est passé au-dessus de 90%. Rien que ça vaut l'abonnement.",
    name: 'Sarah L.',
    role: 'Créatrice UGC · 45 comptes',
    handle: '@sarah.ugc',
    initials: 'SL',
    gradient: 'linear-gradient(135deg, #A855F7, #EC4899)',
    stars: 5,
    stat: '90%+',
    statLabel: 'de comptes conservés',
  },
  {
    quote:
      "On gère les comptes de 12 clients sur GeeLark et le dashboard ScaleFlow est devenu notre tour de contrôle. Les rôles d'équipe, les stats par compte, le studio remix... tout est pensé pour bosser à plusieurs sans se marcher dessus.",
    name: 'Mehdi K.',
    role: 'Co-fondateur SMMA · 300+ comptes',
    handle: '@mehdi.smma',
    initials: 'MK',
    gradient: 'linear-gradient(135deg, #818CF8, #34D399)',
    stars: 5,
    stat: '15h',
    statLabel: 'gagnées par semaine',
  },
]

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    el.querySelectorAll('.reveal').forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [])
  return ref
}

export function Testimonials() {
  const ref = useReveal()

  return (
    <section id="testimonials" className="relative overflow-hidden px-5 py-28" ref={ref} style={{ background: 'rgba(124,58,237,0.035)' }}>
      {/* Séparateurs fins haut / bas */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.3), transparent)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.3), transparent)' }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute right-1/4 top-1/2 h-[480px] w-[480px] -translate-y-1/2 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #A855F7, transparent)', filter: 'blur(90px)' }}
        />
      </div>

      <div className="mx-auto max-w-6xl">
        {/* En-tête centré */}
        <div className="mx-auto max-w-2xl text-center reveal">
          <span className="section-label">Social proof</span>
          <h2 className="font-display h-section">
            Ils font tourner <span className="gradient-text">ScaleFlow.</span>
          </h2>
          <p className="mt-4 text-text2">
            Agences &amp; créateurs Instagram/TikTok qui scalent leurs fermes de comptes tous les jours avec nous.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <figure
              key={t.name}
              className={`reveal glass-card flex flex-col rounded-2xl p-6 reveal-delay-${i + 1}`}
            >
              {/* Guillemet élégant + étoiles */}
              <div className="mb-3 flex items-start justify-between">
                <span
                  className="gradient-text -ml-0.5 leading-none opacity-90"
                  aria-hidden="true"
                >
                  <IQuote />
                </span>
                <span className="mt-1 flex gap-0.5 text-amber-400" aria-label={`${t.stars} étoiles sur 5`}>
                  {Array.from({ length: t.stars }, (_, s) => (
                    <IStar key={s} />
                  ))}
                </span>
              </div>

              <blockquote className="flex-1 text-[15px] leading-relaxed text-text2">
                <span className="text-text/90">« {t.quote} »</span>
              </blockquote>

              {/* Badge de stat — gros chiffre gradient mis en valeur */}
              <div className="gradient-ring my-5 flex items-baseline gap-2.5 rounded-xl px-4 py-3">
                <span className="gradient-text font-display text-3xl font-bold leading-none tracking-tight">{t.stat}</span>
                <span className="text-xs leading-tight text-text2">{t.statLabel}</span>
              </div>

              {/* Auteur : avatar dégradé + nom + rôle + handle discret */}
              <figcaption className="flex items-center gap-3 border-t border-white/[0.06] pt-4">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-[#0a0a16] shadow-[0_6px_18px_-6px_rgba(129,140,248,0.6)] ring-1 ring-white/20"
                  style={{ background: t.gradient }}
                  aria-hidden="true"
                >
                  {t.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-text">{t.name}</span>
                  <span className="block truncate text-xs text-text2">{t.role}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-muted">{t.handle}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
