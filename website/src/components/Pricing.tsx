import { useReveal } from '../hooks/useReveal'
import { CreditsGrid } from './CreditsGrid'
import { IconCheck, IconArrowRight } from './Icons'
import { TELEGRAM_URL } from '../lib/links'

interface Plan {
  name: string; price: string; desc: string; accent: string; popular?: boolean; features: string[]
}

const PLANS: Plan[] = [
  {
    name: 'Standard', price: '49,99$', accent: '#5EEAD4',
    desc: 'Pour démarrer sérieusement ta première ferme de comptes.',
    features: ['2 500 crédits / mois', '50 phones max', 'Toutes les fonctionnalités', 'Mass Posting 10 comptes max', 'Support 24/7'],
  },
  {
    name: 'Pro', price: '99,99$', accent: '#818CF8', popular: true,
    desc: 'Le sweet spot des agences et growth hackers qui scalent.',
    features: ['5 500 crédits / mois', '200 phones max', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7'],
  },
  {
    name: 'Organisation', price: '149,99$', accent: '#C084FC',
    desc: 'Pour les structures qui pilotent des centaines de comptes.',
    features: ['11 000 crédits / mois', 'Phones illimités', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7 prioritaire', "Proposition d'ajouts avec les devs"],
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
  const body = (
    <div className="flex flex-1 flex-col p-7.5">
      {plan.popular && (
        <span
          className="absolute right-5.5 top-5.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#08060F]"
          style={{ background: 'linear-gradient(120deg,#67E8F9,#A5B4FC,#D8B4FE)' }}
        >
          Populaire
        </span>
      )}
      <div className="text-[11px] font-extrabold uppercase tracking-[0.26em]" style={{ color: plan.accent }}>{plan.name}</div>
      <div className="mt-4.5 flex items-baseline gap-1.5">
        <span className="stat-value font-display text-[42px] font-bold leading-none tracking-[-0.02em] text-text">{plan.price}</span>
        <span className="text-sm font-semibold text-text2">/mois</span>
      </div>
      <p className="mt-3.5 text-sm leading-relaxed text-text2">{plan.desc}</p>
      <div className="my-5.5 h-px bg-white/[0.08]" />
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0 text-sm font-semibold text-text">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-2.5">
            <IconCheck width={14} height={14} strokeWidth={3} className="mt-0.5 shrink-0" style={{ color: plan.accent }} />
            <span className="leading-snug">{f}</span>
          </li>
        ))}
      </ul>
      <a
        href={TELEGRAM_URL} target="_blank" rel="noreferrer"
        className={`mt-auto pt-7 ${plan.popular ? '' : ''}`}
      >
        <span
          className="flex items-center justify-center gap-2 rounded-full py-3.5 text-sm font-extrabold transition-shadow duration-200"
          style={plan.popular
            ? { background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)', color: '#0A0A16', boxShadow: '0 0 32px -8px rgba(129,140,248,0.8)' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.16)', color: '#F2F0FF' }}
        >
          Choisir {plan.name} <IconArrowRight width={16} height={16} strokeWidth={2.4} />
        </span>
      </a>
    </div>
  )

  if (plan.popular) {
    return (
      <article
        className="reveal reveal-delay-2 relative flex flex-col rounded-[22px] p-0.5 transition-transform duration-300 hover:-translate-y-1.5"
        style={{ background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)', boxShadow: '0 30px 80px -20px rgba(124,58,237,0.55)' }}
      >
        <div className="flex flex-1 flex-col rounded-[20px]" style={{ background: '#0A0A1C' }}>{body}</div>
      </article>
    )
  }

  return (
    <article className="reveal relative flex flex-col rounded-[22px] border border-white/[0.09] bg-white/[0.03] transition-transform duration-300 hover:-translate-y-1">
      {body}
    </article>
  )
}

export function Pricing() {
  const ref = useReveal<HTMLElement>()

  return (
    <section id="pricing" className="relative z-[1] mx-auto max-w-[1140px] px-6 py-[110px]" ref={ref}>
      <div className="reveal mx-auto max-w-[640px] text-center">
        <span className="section-label">Tarifs</span>
        <h2 className="font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-[46px]">
          Un prix, <span className="gradient-text-warm">zéro friction.</span>
        </h2>
        <p className="mx-auto mt-4.5 text-base leading-relaxed text-text2">
          Trois plans qui grandissent avec ton volume. Crédits inclus chaque mois pour Instagram &amp; TikTok,
          recharge à la demande quand tu pousses fort.
        </p>
      </div>

      <div className="mt-15 grid grid-cols-1 items-stretch gap-4.5 md:grid-cols-3">
        {PLANS.map(plan => <PlanCard key={plan.name} plan={plan} />)}
      </div>

      <div className="reveal mt-9 flex flex-col gap-5 rounded-[22px] border border-white/[0.09] bg-white/[0.03] p-7">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-[17px] font-bold text-[#FDE68A]">Packs de crédits</h3>
          <p className="text-[13px] font-semibold text-text2">Recharge ton solde à la demande, sans changer de plan.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PACKS.map(pack => (
            <a
              key={pack.credits} href={TELEGRAM_URL} target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-1 rounded-2xl border border-white/[0.09] bg-white/[0.02] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-indigo/50"
            >
              <span className="stat-value font-display text-lg font-bold text-text">
                {pack.credits}<span className="ml-1 align-middle text-[10px] font-semibold uppercase text-muted">cr</span>
              </span>
              <span className="gradient-text text-[13px] font-extrabold">{pack.price}</span>
            </a>
          ))}
        </div>
      </div>

      <CreditsGrid />

      <p className="reveal mt-7.5 text-center text-[13px] font-semibold text-muted">
        Paiement via Telegram · Crypto ou virement · Activation immédiate
      </p>
    </section>
  )
}
