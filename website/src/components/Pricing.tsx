const PLANS = [
  {
    name: 'Standard',
    price: '29,99€',
    period: '/mois',
    accent: '#60a5fa',
    cta: 'Choisir Standard',
    href: 'https://buy.stripe.com/test_aFa3cu2Lw00LdymdHT5EY00',
    features: [
      '2 000 crédits / mois',
      'Téléphones illimités',
      'Mass Posting + Banque',
      'Stats temps réel',
      'Support standard',
    ],
  },
  {
    name: 'Pro',
    price: '79,99€',
    period: '/mois',
    accent: '#c084fc',
    popular: true,
    cta: 'Choisir Pro',
    href: 'https://buy.stripe.com/test_eVq7sK4TEaFp9i6cDP5EY01',
    features: [
      '5 500 crédits / mois',
      'Téléphones illimités',
      'Membres illimités (organisations)',
      'IA avancée (Claude + Groq)',
      'Auto-warmup + Auto-commentaires',
      'Support prioritaire 24/7',
    ],
  },
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
            Tout est inclus dès le plan Standard. Plus tu scales, plus le Pro devient évident.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PLANS.map(p => (
            <div key={p.name} className={`relative glass rounded-2xl p-7 ${p.popular ? 'ring-2 ring-purple-500/40' : ''}`}>
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black text-white tracking-widest"
                     style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>
                  POPULAIRE
                </div>
              )}
              <div className="mb-6">
                <div className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: p.accent }}>{p.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black text-white">{p.price}</span>
                  <span className="text-sm text-text2">{p.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-7">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-text">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a href={p.href}
                 className={`block w-full text-center py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02]
                   ${p.popular
                     ? 'text-white shadow-lg shadow-purple-500/30'
                     : 'text-white'}`}
                 style={p.popular
                   ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }
                   : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(139,92,246,0.30)' }}>
                {p.cta} →
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted mt-8">
          Paiements sécurisés par Stripe · Annulable à tout moment · TVA incluse
        </p>
      </div>
    </section>
  )
}
