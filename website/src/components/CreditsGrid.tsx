const COSTS = [
  { icon: '🎬', label: 'Publication',        unit: 'par téléphone',            cost: '2 cr',   rgb: '129,140,248', color: '#A5B4FC' },
  { icon: '⚡', label: 'Mass Posting',       unit: 'par téléphone',            cost: '2 cr',   rgb: '168,85,247',  color: '#D8B4FE' },
  { icon: '🔗', label: 'Story',              unit: 'par téléphone',            cost: '1 cr',   rgb: '34,211,238',  color: '#67E8F9' },
  { icon: '🎞', label: 'Remix & Spoof',      unit: 'par vidéo',                cost: 'Gratuit', rgb: '52,211,153', color: '#34D399' },
  { icon: '🤖', label: 'Tâche automatique',  unit: 'par jour, tâche active',   cost: '50 cr',  rgb: '251,191,36',  color: '#FCD34D' },
  { icon: '↻', label: 'Exécution de tâche', unit: 'par téléphone',            cost: '2 cr',   rgb: '251,146,60',  color: '#FED7AA' },
]

/** Grille de consommation des crédits — reprise des règles métier réelles. */
export function CreditsGrid() {
  return (
    <div data-reveal className="mt-4.5 rounded-[22px] border border-border bg-white/[0.03] p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 font-display text-[17px] font-bold text-text">Les crédits, c'est basé sur quoi ?</h3>
          <p className="m-0 text-[13px] font-semibold text-text2">
            Tu paies à la publication, pas à l'outil. Le studio vidéo est entièrement gratuit.
          </p>
        </div>
        <span className="rounded-full border border-emerald/30 bg-emerald/[0.12] px-3.5 py-1.5 text-[11px] font-extrabold text-emerald">
          Même tarif en direct, en masse ou programmé
        </span>
      </div>

      <div data-stagger className="mt-5.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COSTS.map(c => (
          <div
            key={c.label}
            data-reveal
            className="flex items-center gap-3.5 rounded-[14px] p-4"
            style={{
              background: `linear-gradient(160deg, rgba(${c.rgb},0.08), rgba(255,255,255,0.015))`,
              border: `1px solid rgba(${c.rgb},0.25)`,
            }}
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-white/[0.05] text-[15px]">
              {c.icon}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-extrabold text-text">{c.label}</span>
              <span className="text-[11px] font-semibold text-muted">{c.unit}</span>
            </span>
            <span className="ml-auto whitespace-nowrap font-display text-base font-bold" style={{ color: c.color }}>
              {c.cost}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3.5 rounded-[14px] border border-indigo/25 bg-indigo/[0.07] p-4">
        <span className="text-[15px]">🧮</span>
        <span className="flex-1 text-[12.5px] font-semibold leading-relaxed text-[rgba(226,222,255,0.8)]">
          Concrètement : un mass posting sur <strong className="text-text">52 comptes</strong> coûte{' '}
          <strong className="text-[#A5B4FC]">104 crédits</strong>. Avec le plan Pro et ses 5 500 crédits mensuels,
          ça fait <strong className="text-text">52 diffusions complètes par mois</strong>.
        </span>
      </div>
    </div>
  )
}
