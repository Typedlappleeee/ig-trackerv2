const SHOTS = [
  {
    title: 'Mass Posting',
    subtitle: 'Lance des dizaines de posts en un clic',
    body: (
      <div className="space-y-2">
        {['iPhone-01','iPhone-02','iPhone-03','iPhone-04','iPhone-05'].map((p, i) => {
          const states = [
            { label: '✅ Posté',        color: '#34d399', bg: 'bg-green-500/10' },
            { label: '✅ Posté',        color: '#34d399', bg: 'bg-green-500/10' },
            { label: '🔄 En cours',     color: '#fbbf24', bg: 'bg-yellow-500/10' },
            { label: '🔄 En cours',     color: '#fbbf24', bg: 'bg-yellow-500/10' },
            { label: '⏳ En attente',   color: '#a89bd4', bg: 'bg-purple-500/10' },
          ]
          const s = states[i]
          return (
            <div key={p} className={`flex items-center justify-between px-3 py-2 rounded-lg ${s.bg}`}>
              <span className="text-xs font-mono text-white">{p}</span>
              <span className="text-[10px] font-semibold" style={{ color: s.color }}>{s.label}</span>
            </div>
          )
        })}
      </div>
    ),
  },
  {
    title: 'Banque de contenu',
    subtitle: 'Organisée par dossiers, prête à poster',
    body: (
      <div>
        <div className="flex gap-2 mb-3">
          {['🎬 Toute la banque','📂 Lifestyle','📂 Promo','📂 Gym'].map((f, i) => (
            <span key={f} className={`px-2.5 py-1 rounded-md text-[10px] ${i === 0 ? 'bg-purple-500/20 text-purple-300' : 'bg-white/5 text-text2'}`}>{f}</span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[9/16] rounded-lg relative overflow-hidden"
                 style={{ background: `linear-gradient(${130 + i*40}deg, #1a0d35, #2a1f48)` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold text-white">video_{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Stats temps réel',
    subtitle: 'Vois la progression de chaque compte',
    body: (
      <div>
        <div className="text-[10px] text-text2 uppercase tracking-wider mb-2">Followers — 30 derniers jours</div>
        <svg viewBox="0 0 200 80" className="w-full">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,70 L20,55 L40,50 L60,40 L80,35 L100,25 L120,28 L140,15 L160,18 L180,8 L200,12 L200,80 L0,80 Z"
                fill="url(#g1)" />
          <path d="M0,70 L20,55 L40,50 L60,40 L80,35 L100,25 L120,28 L140,15 L160,18 L180,8 L200,12"
                fill="none" stroke="#a78bfa" strokeWidth="1.5" />
        </svg>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div>
            <div className="text-[9px] text-text2 uppercase">+24h</div>
            <div className="text-sm font-bold text-green-400">+1.2K</div>
          </div>
          <div>
            <div className="text-[9px] text-text2 uppercase">+7j</div>
            <div className="text-sm font-bold text-green-400">+8.4K</div>
          </div>
          <div>
            <div className="text-[9px] text-text2 uppercase">+30j</div>
            <div className="text-sm font-bold text-green-400">+34.2K</div>
          </div>
        </div>
      </div>
    ),
  },
]

export function Showcase() {
  return (
    <section id="showcase" className="py-24 px-6 relative">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[11px] text-accent uppercase tracking-widest mb-3 font-semibold">Aperçu</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Pensée pour aller <span className="gradient-text">vite.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {SHOTS.map(s => (
            <div key={s.title} className="glass rounded-2xl p-5">
              <div className="mb-4">
                <h3 className="text-white text-sm font-bold">{s.title}</h3>
                <p className="text-[11px] text-text2">{s.subtitle}</p>
              </div>
              {s.body}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
