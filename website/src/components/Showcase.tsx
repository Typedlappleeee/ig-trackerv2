const STATS = [
  { value: '500+', label: 'créateurs & agences' },
  { value: '100+', label: 'comptes par utilisateur' },
  { value: '1M+', label: 'posts publiés' },
  { value: '4,7%', label: 'engagement moyen' },
]

export function Showcase() {
  return (
    <section id="showcase" className="relative px-5 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="glass-strong overflow-hidden rounded-3xl px-6 py-10 sm:px-10 sm:py-12">
          <p className="mx-auto mb-8 max-w-xl text-center text-sm text-text2">
            Adopté par les créateurs et agences qui font tourner des dizaines de comptes au
            quotidien.
          </p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-extrabold sm:text-4xl">
                  <span className="gradient-text">{s.value}</span>
                </div>
                <div className="mt-1.5 text-xs text-text2 sm:text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
