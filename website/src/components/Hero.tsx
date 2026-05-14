export function Hero() {
  return (
    <section className="relative pt-24 pb-16 px-6">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full text-[11px] font-medium text-text2"
             style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.20)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Nouvelle version 2.0 disponible
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-white tracking-tight leading-[1.05] mb-6">
          Automatise ton Instagram<br/>
          <span className="gradient-text">à grande échelle.</span>
        </h1>

        <p className="text-lg md:text-xl text-text2 max-w-2xl mx-auto mb-10 leading-relaxed">
          Mass posting, banque de contenu, IA, statistiques temps réel.
          La seule app conçue pour gérer <span className="text-white font-semibold">100+ comptes</span> sans se prendre la tête.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <a
            href="https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe"
            className="btn-primary"
          >
            ⬇ Télécharger pour Windows
          </a>
          <a href="https://scaleflow-fvtu.vercel.app/" target="_blank" rel="noreferrer" className="btn-secondary">
            🌐 Ouvrir dans le navigateur
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-12 text-[11px] text-text2">
          <a href="https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow.dmg"
             className="underline hover:text-text transition-colors">
            Version Mac (.dmg)
          </a>
          <span className="text-muted">·</span>
          <a href="https://github.com/typedlappleeee/ig-trackerv2/releases" target="_blank" rel="noreferrer"
             className="underline hover:text-text transition-colors">
            Toutes les versions
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-text2">
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span> Téléchargement Mac / Windows
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span> Version web sans installation
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span> Aucune carte requise pour tester
          </div>
        </div>

        {/* App mockup */}
        <div className="relative mt-20">
          <div className="absolute inset-x-0 -top-20 h-40 bg-brand-gradient opacity-20 blur-3xl rounded-full" />
          <div className="relative mx-auto rounded-2xl overflow-hidden glass" style={{ boxShadow: '0 30px 80px -20px rgba(139,92,246,0.4)' }}>
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-3 text-[10px] text-text2 font-mono">scaleflow.app — Dashboard</span>
            </div>
            <MockDashboard />
          </div>
        </div>
      </div>
    </section>
  )
}

function MockDashboard() {
  const phones = [
    { name: 'iPhone-01', followers: '12.4K', views: '847K', status: 'online' },
    { name: 'iPhone-02', followers: '8.9K',  views: '512K', status: 'online' },
    { name: 'iPhone-03', followers: '23.1K', views: '1.2M', status: 'busy' },
    { name: 'iPhone-04', followers: '5.7K',  views: '301K', status: 'online' },
    { name: 'iPhone-05', followers: '14.2K', views: '923K', status: 'offline' },
    { name: 'iPhone-06', followers: '19.8K', views: '1.4M', status: 'online' },
  ]
  return (
    <div className="bg-bg p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-white">📊 Dashboard</h3>
          <span className="text-[10px] text-text2">6 téléphones · synced il y a 12s</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 rounded-md text-[10px] font-semibold text-white" style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>
            + Mass Post
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Followers', value: '84.1K',  color: '#a78bfa' },
          { label: 'Views',     value: '5.2M',   color: '#ec4899' },
          { label: 'Videos',    value: '247',    color: '#34d399' },
          { label: 'Engagement',value: '4.7%',   color: '#fbbf24' },
        ].map(s => (
          <div key={s.label} className="rounded-lg p-3 glass">
            <div className="text-[10px] text-text2 uppercase tracking-wider">{s.label}</div>
            <div className="text-lg font-black text-white mt-0.5" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Phones table */}
      <div className="rounded-lg overflow-hidden glass">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-text2">
              <th className="px-3 py-2 font-medium">Compte</th>
              <th className="px-3 py-2 font-medium">Followers</th>
              <th className="px-3 py-2 font-medium">Views</th>
              <th className="px-3 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {phones.map(p => (
              <tr key={p.name} className="border-t border-border/40">
                <td className="px-3 py-2 font-mono text-white">{p.name}</td>
                <td className="px-3 py-2 text-text">{p.followers}</td>
                <td className="px-3 py-2 text-text">{p.views}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    p.status === 'online'  ? 'bg-green-500/15 text-green-400'  :
                    p.status === 'busy'    ? 'bg-yellow-500/15 text-yellow-400' :
                    'bg-zinc-500/15 text-zinc-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      p.status === 'online' ? 'bg-green-400' :
                      p.status === 'busy'   ? 'bg-yellow-400' : 'bg-zinc-400'
                    }`} />
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
