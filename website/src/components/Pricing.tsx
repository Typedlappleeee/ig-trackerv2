import { IconCheck, IconArrowRight } from './Icons'

const TELEGRAM_URL = 'https://t.me/justquentin'

type Plan = {
  name: string
  price: string
  period: string
  accent: string
  cta: string
  popular?: boolean
  features: string[]
}

const PLANS: Plan[] = [
  {
    name: 'Standard',
    price: '49,99$',
    period: '/mois',
    accent: '#60A5FA',
    cta: 'Choisir Standard',
    features: [
      '2 500 crédits / mois',
      '50 téléphones max',
      'Accès à toutes les fonctionnalités',
      'Mass Posting — 10 comptes max',
      'Support 24/7',
    ],
  },
  {
    name: 'Pro',
    price: '99,99$',
    period: '/mois',
    accent: '#A855F7',
    popular: true,
    cta: 'Choisir Pro',
    features: [
      '5 500 crédits / mois',
      '200 téléphones max',
      'Accès à toutes les fonctionnalités',
      'Mass Posting illimité',
      'Support 24/7',
    ],
  },
  {
    name: 'Organisation',
    price: '149,99$',
    period: '/mois',
    accent: '#34D399',
    cta: 'Choisir Organisation',
    features: [
      '11 000 crédits / mois',
      'Téléphones illimités',
      'Accès à toutes les fonctionnalités',
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

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`group rounded-3xl transition-transform duration-200 hover:-translate-y-1 ${
        plan.popular ? 'gradient-ring shadow-glow-soft' : 'glass'
      }`}
    >
      <div className="relative flex flex-col rounded-3xl p-7">
        {plan.popular && (
          <span
            className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#0a0a16]"
            style={{ background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)' }}
          >
            Populaire
          </span>
        )}

        <div className="mb-6">
          <div
            className="mb-2 text-xs font-bold uppercase tracking-[0.16em]"
            style={{ color: plan.accent }}
          >
            {plan.name}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold text-text">{plan.price}</span>
            <span className="text-sm text-text2">{plan.period}</span>
          </div>
        </div>

        <ul className="mb-7 flex-1 space-y-3">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-text2">
              <IconCheck
                width={18}
                height={18}
                className="mt-0.5 shrink-0"
                style={{ color: plan.accent }}
              />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className={
            plan.popular
              ? 'btn-primary w-full'
              : 'btn-secondary w-full'
          }
        >
          {plan.cta}
          <IconArrowRight width={17} height={17} />
        </a>
      </div>
    </div>
  )
}

export function Pricing() {
  return (
    <section id="pricing" className="relative px-5 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-label">Tarifs</p>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-5xl">
            Choisis ton <span className="gradient-text">plan.</span>
          </h2>
          <p className="mt-4 text-text2">
            Tout est inclus dès le Standard. Abonnement via Telegram — activation immédiate.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard key={p.name} plan={p} />
          ))}
        </div>

        {/* Credit packs */}
        <div className="glass mt-12 rounded-3xl p-7">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-text2">
            Packs de crédits
          </p>
          <p className="mb-5 mt-1 text-xs text-muted">
            Pour compléter ton solde. Les abonnements restent plus avantageux au crédit.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PACKS.map((pk) => (
              <a
                key={pk.credits}
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer rounded-2xl border border-border bg-white/[0.03] p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-violet/40 hover:bg-white/[0.06]"
              >
                <div className="text-lg font-extrabold text-text">{pk.credits}</div>
                <div className="mb-2 text-[10px] text-text2">crédits</div>
                <div className="text-sm font-bold text-indigo">{pk.price}</div>
              </a>
            ))}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          Paiement via Telegram · Crypto ou virement · Clé activable immédiatement
        </p>
      </div>
    </section>
  )
}
