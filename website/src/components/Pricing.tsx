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
    accent: '#22D3EE',
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
    accent: '#A855F7',
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
    <section id="pricing" className="relative px-5 py-28" ref={ref}>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #818CF8, transparent)', filter: 'blur(100px)' }}
        />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center reveal">
          <span className="section-label">Tarifs</span>
          <h2 className="text-3xl font-black text-text sm:text-5xl">
            Un prix, <span className="gradient-text">zéro friction.</span>
          </h2>
          <p className="mt-4 text-text2">
            Trois plans qui grandissent avec ton volume. Crédits inclus chaque mois, recharge à la demande quand tu pousses fort.
          </p>
        </div>

        {/* Plans */}
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3 md:items-stretch">
          {PLANS.map((plan, i) => (
            <article
              key={plan.name}
              className={`reveal relative flex flex-col overflow-hidden rounded-2xl ${
                plan.popular ? 'gradient-ring md:-my-3' : 'glass-card'
              }`}
              style={{ transitionDelay: `${i * 0.12}s` }}
            >
              {/* Accent top bar */}
              <div
                className="h-1 w-full shrink-0"
                style={{ background: `linear-gradient(90deg, ${plan.accent}, ${plan.accent}33)` }}
                aria-hidden="true"
              />

              <div className={`flex flex-1 flex-col p-7 ${plan.popular ? 'md:pt-9' : ''}`}>
                {plan.popular && (
                  <span
                    className="absolute right-5 top-5 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0a0a16]"
                    style={{ background: 'linear-gradient(135deg, #22D3EE, #818CF8, #A855F7)' }}
                  >
                    Populaire
                  </span>
                )}

                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: plan.accent }}>
                  {plan.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="stat-value text-4xl font-black text-text">{plan.price}</span>
                  <span className="text-sm text-text2">/mois</span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-text2">{plan.desc}</p>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-text">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ color: plan.accent }}
                      >
                        <IconCheck width={16} height={16} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={`${plan.popular ? 'btn-primary' : 'btn-secondary'} mt-8 w-full cursor-pointer`}
                >
                  Choisir {plan.name}
                  <IconArrowRight width={18} height={18} />
                </a>
              </div>
            </article>
          ))}
        </div>

        {/* Credit packs */}
        <div className="reveal mt-12 overflow-hidden rounded-2xl glass-strong">
          <div className="flex flex-col gap-5 p-7 sm:p-8">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#FBBF24' }}
              >
                <IconCoins width={20} height={20} />
              </span>
              <div>
                <h3 className="text-base font-bold text-text">Packs de crédits</h3>
                <p className="text-xs text-text2">Recharge ton solde à la demande, sans changer de plan.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {PACKS.map((pack) => (
                <a
                  key={pack.credits}
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="group cursor-pointer rounded-xl border border-border bg-white/[0.03] px-4 py-3.5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-violet/40 hover:bg-white/[0.06]"
                >
                  <span className="stat-value block text-lg font-extrabold text-text">
                    {pack.credits}
                    <span className="ml-1 text-[10px] font-semibold uppercase text-text2">cr</span>
                  </span>
                  <span className="gradient-text mt-0.5 block text-sm font-bold">{pack.price}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Payment note */}
        <p className="reveal mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-text2">
          <IconTelegram width={14} height={14} className="text-cyan" />
          Paiement via Telegram · Crypto ou virement · Activation immédiate
        </p>
      </div>
    </section>
  )
}
