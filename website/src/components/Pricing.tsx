import { useEffect, useRef } from 'react'
import { IconCheck, IconArrowRight, IconCoins, IconTelegram } from './Icons'

const TELEGRAM_URL = 'https://t.me/justquentin'

type Plan = {
  name: string
  price: string
  desc: string
  accent: string
  popular?: boolean
  features: string[]
}

const PLANS: Plan[] = [
  {
    name: 'Standard',
    price: '49,99$',
    desc: 'Pour démarrer sérieusement ta première ferme de comptes.',
    accent: '#5EEAD4',
    features: [
      '2 500 crédits / mois',
      '50 phones max',
      'Toutes les fonctionnalités',
      'Mass Posting 10 comptes max',
      'Support 24/7',
    ],
  },
  {
    name: 'Pro',
    price: '99,99$',
    desc: 'Le sweet spot des agences et growth hackers qui scalent.',
    accent: '#818CF8',
    popular: true,
    features: [
      '5 500 crédits / mois',
      '200 phones max',
      'Toutes les fonctionnalités',
      'Mass Posting illimité',
      'Support 24/7',
    ],
  },
  {
    name: 'Organisation',
    price: '149,99$',
    desc: 'Pour les structures qui pilotent des centaines de comptes.',
    accent: '#C084FC',
    features: [
      '11 000 crédits / mois',
      'Phones illimités',
      'Toutes les fonctionnalités',
      'Mass Posting illimité',
      'Support 24/7 prioritaire',
      "Proposition d'ajouts avec les devs",
    ],
  },
]

const PACKS = [
  { credits: '500', price: '19,99$' },
  { credits: '1 200', price: '39,99$' },
  { credits: '2 500', price: '74,99$' },
  { credits: '6 000', price: '164,99$' },
  { credits: '15 000', price: '374,99$' },
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

export function Pricing() {
  const ref = useReveal()

  return (
    <section id="pricing" className="relative overflow-hidden px-5 py-28" ref={ref}>
      {/* Halo de fond discret */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute left-1/2 top-1/4 h-[620px] w-[620px] -translate-x-1/2 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #818CF8, transparent 70%)', filter: 'blur(110px)' }}
        />
        <div
          className="absolute bottom-0 right-[-10%] h-[420px] w-[420px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #C084FC, transparent 70%)', filter: 'blur(110px)' }}
        />
      </div>

      <div className="mx-auto max-w-6xl">
        {/* En-tête centré */}
        <div className="mx-auto max-w-2xl text-center reveal">
          <span className="section-label">Tarifs</span>
          <h2 className="font-display h-section">
            Un prix, <span className="gradient-text">zéro friction.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-text2">
            Trois plans qui grandissent avec ton volume. Crédits inclus chaque mois pour Instagram &amp; TikTok,
            recharge à la demande quand tu pousses fort.
          </p>
        </div>

        {/* Plans */}
        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3 md:items-stretch">
          {PLANS.map((plan, i) => (
            <article
              key={plan.name}
              className={`reveal reveal-delay-${i + 1} relative flex flex-col overflow-hidden rounded-3xl ${
                plan.popular ? 'gradient-ring md:-my-3 md:shadow-glow-soft' : 'glass-card'
              }`}
            >
              {/* Halo interne pour le plan populaire */}
              {plan.popular && (
                <div
                  className="pointer-events-none absolute inset-x-0 -top-20 mx-auto h-40 w-3/4 rounded-full opacity-50 blur-3xl"
                  style={{ background: 'linear-gradient(120deg, rgba(94,234,212,0.35), rgba(129,140,248,0.4), rgba(192,132,252,0.35))' }}
                  aria-hidden="true"
                />
              )}

              <div className={`relative flex flex-1 flex-col p-7 ${plan.popular ? 'md:pt-9' : ''}`}>
                {/* Badge Populaire */}
                {plan.popular && (
                  <span
                    className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#08060F]"
                    style={{ background: 'linear-gradient(120deg, #67E8F9, #A5B4FC, #D8B4FE)', boxShadow: '0 8px 24px -8px rgba(129,140,248,0.7)' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#08060F]/70 animate-pulse-dot" />
                    Populaire
                  </span>
                )}

                <h3
                  className="text-[11px] font-bold uppercase tracking-[0.28em]"
                  style={{ color: plan.accent }}
                >
                  {plan.name}
                </h3>

                <div className="mt-3.5 flex items-baseline gap-1.5">
                  <span className="font-display stat-value text-[2.75rem] font-bold leading-none text-text">
                    {plan.price}
                  </span>
                  <span className="text-sm text-text2">/mois</span>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-text2">{plan.desc}</p>

                <div className="hairline my-6" />

                <ul className="space-y-3.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-text">
                      <span
                        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                        style={{
                          color: plan.accent,
                          background: `${plan.accent}1f`,
                          border: `1px solid ${plan.accent}44`,
                        }}
                      >
                        <IconCheck width={11} height={11} strokeWidth={3} />
                      </span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={`${plan.popular ? 'btn-primary' : 'btn-secondary'} mt-8 w-full`}
                >
                  Choisir {plan.name}
                  <IconArrowRight width={17} height={17} />
                </a>
              </div>
            </article>
          ))}
        </div>

        {/* Packs de crédits */}
        <div className="reveal mt-14 overflow-hidden rounded-3xl glass-card">
          <div className="flex flex-col gap-6 p-7 sm:p-9">
            <div className="flex items-center gap-3.5">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#FBBF24' }}
              >
                <IconCoins width={20} height={20} />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-text">Packs de crédits</h3>
                <p className="text-xs text-text2">Recharge ton solde à la demande, sans changer de plan.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {PACKS.map((pack) => (
                <a
                  key={pack.credits}
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative overflow-hidden rounded-2xl border border-border bg-white/[0.025] px-4 py-4 text-center transition-all duration-300 hover:-translate-y-1 hover:border-indigo/40 hover:bg-white/[0.06]"
                >
                  <span className="font-display stat-value block text-xl font-bold text-text">
                    {pack.credits}
                    <span className="ml-1 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted">cr</span>
                  </span>
                  <span className="gradient-text mt-1 block text-sm font-bold">{pack.price}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Note de paiement — chip discret */}
        <div className="reveal mt-8 flex justify-center">
          <span className="chip">
            <IconTelegram width={13} height={13} className="text-cyan" />
            Paiement via Telegram · Crypto ou virement · Activation immédiate
          </span>
        </div>
      </div>
    </section>
  )
}
