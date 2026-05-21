const TELEGRAM_URL = 'https://t.me/justquentin'

const PLANS = [
  {
    name:    'Standard',
    price:   '49,99$',
    period:  '/mois',
    accent:  '#60a5fa',
    cta:     'Choisir Standard',
    features: [
      '2 500 crédits / mois',
      '50 téléphones max',
      'Accès à toutes les fonctionnalités',
      'Mass Posting — 10 comptes max',
      'Support 24/7',
    ],
  },
  {
    name:    'Pro',
    price:   '99,99$',
    period:  '/mois',
    accent:  '#c084fc',
    popular: true,
    cta:     'Choisir Pro',
    features: [
      '5 500 crédits / mois',
      '200 téléphones max',
      'Accès à toutes les fonctionnalités',
      'Mass Posting illimité',
      'Support 24/7',
    ],
  },
  {
    name:    'Organisation',
    price:   '149,99$',
    period:  '/mois',
    accent:  '#34d399',
    cta:     'Choisir Organisation',
    features: [
      '11 000 crédits / mois',
      'Téléphones illimités',
      'Accès à toutes les fonctionnalités',
      'Mass Posting illimité',
      'Support 24/7 prioritaire',
      'Proposition d\'ajouts avec les devs',
    ],
  },
]

const PACKS = [
  { credits: '500',    price: '19,99$' },
  { credits: '1 200',  price: '39,99$' },
  { credits: '2 500',  price: '74,99$' },
  { credits: '6 000',  price: '164,99$' },
  { credits: '15 000', price: '374,99$' },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[11px] text-accent uppercase tracking-widest mb-3 font-semibold">Tarifs</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Choisis ton <span className="gradient-text">plan.</span>
          </h2>
          <p className="text-text2 max-w-2xl mx-auto">
            Tout est inclus dès le Standard. Abonnement via Telegram — activation immédiate.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
          {PLANS.map(p => (
            <div key={p.name} className={`relative glass rounded-2xl p-7 flex flex-col ${p.popular ? 'ring-2 ring-purple-500/40' : ''}`}>
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black text-white tracking-widest"
                     style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>
                  POPULAIRE
                </div>
              )}
              <div className="mb-6">
                <div className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: p.accent }}>{p.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white">{p.price}</span>
                  <span className="text-sm text-text2">{p.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-7 flex-1">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-text">
                    <span className="mt-0.5" style={{ color: p.accent }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                 className="block w-full text-center py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] no-underline"
                 style={p.popular
                   ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }
                   : { background: 'rgba(255,255,255,0.05)', border: `1px solid ${p.accent}40`, color: '#fff' }}>
                {p.cta} →
              </a>
            </div>
          ))}
        </div>

        {/* Credit packs */}
        <div className="glass rounded-2xl p-7">
          <p className="text-sm font-bold uppercase tracking-wider text-text2 mb-1">Packs de crédits</p>
          <p className="text-xs text-text2/60 mb-5">
            Pour compléter ton solde. Les abonnements restent plus avantageux par crédit.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PACKS.map(pk => (
              <a key={pk.credits} href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                 className="rounded-xl p-4 text-center transition-all hover:scale-[1.02] no-underline"
                 style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <div className="text-lg font-black text-white">{pk.credits}</div>
                <div className="text-[10px] text-text2 mb-2">crédits</div>
                <div className="text-sm font-bold" style={{ color: '#a78bfa' }}>{pk.price}</div>
              </a>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted mt-8">
          Paiement via Telegram · Crypto ou virement · Clé activable immédiatement
        </p>
      </div>
    </section>
  )
}
