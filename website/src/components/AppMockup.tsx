import {
  IconLayers,
  IconCalendar,
  IconSparkles,
  IconFlame,
  IconSmartphone,
  IconTrendingUp,
} from './Icons'

const NAV = [
  { icon: IconLayers, label: 'Dashboard', active: true },
  { icon: IconSmartphone, label: 'Comptes' },
  { icon: IconCalendar, label: 'Programmation' },
  { icon: IconSparkles, label: 'Studio IA' },
  { icon: IconFlame, label: 'Warmup' },
]

const STATS = [
  { label: 'Followers', value: '84,1K', accent: '#818CF8' },
  { label: 'Vues', value: '5,2M', accent: '#22D3EE' },
  { label: 'Vidéos', value: '247', accent: '#A855F7' },
  { label: 'Engagement', value: '4,7%', accent: '#34D399' },
]

const ROWS = [
  { name: 'iPhone-01', followers: '12,4K', views: '847K', status: 'online' as const },
  { name: 'iPhone-02', followers: '8,9K', views: '512K', status: 'online' as const },
  { name: 'iPhone-03', followers: '23,1K', views: '1,2M', status: 'busy' as const },
  { name: 'iPhone-04', followers: '5,7K', views: '301K', status: 'online' as const },
  { name: 'iPhone-05', followers: '14,2K', views: '923K', status: 'offline' as const },
]

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  online: { dot: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-400/10', label: 'en ligne' },
  busy: { dot: 'bg-amber-400', text: 'text-amber-300', bg: 'bg-amber-400/10', label: 'occupé' },
  offline: { dot: 'bg-slate-400', text: 'text-slate-300', bg: 'bg-slate-400/10', label: 'hors ligne' },
}

export function AppMockup() {
  return (
    <div
      className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl glass-strong"
      style={{ boxShadow: '0 40px 90px -30px rgba(124,58,237,0.55)' }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/60" />
        <span className="h-3 w-3 rounded-full bg-amber-500/60" />
        <span className="h-3 w-3 rounded-full bg-emerald-500/60" />
        <span className="ml-3 font-mono text-[10px] text-text2">ScaleFlow — Dashboard</span>
      </div>

      <div className="flex" style={{ background: '#080812' }}>
        {/* Sidebar */}
        <aside className="hidden w-44 shrink-0 flex-col gap-1 border-r border-border p-3 sm:flex">
          <div className="mb-3 flex items-center gap-2 px-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-extrabold text-[#0a0a16]"
              style={{ background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)' }}
            >
              SF
            </span>
            <span className="text-xs font-bold text-text">ScaleFlow</span>
          </div>
          {NAV.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs ${
                item.active ? 'bg-white/[0.07] text-text' : 'text-text2'
              }`}
            >
              <item.icon width={16} height={16} className={item.active ? 'text-cyan' : ''} />
              {item.label}
            </div>
          ))}
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-text">Vue d'ensemble</h3>
              <p className="text-[10px] text-text2">5 comptes actifs · synchronisé il y a 12 s</p>
            </div>
            <span
              className="rounded-lg px-3 py-1.5 text-[10px] font-bold text-[#0a0a16]"
              style={{ background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)' }}
            >
              + Mass Post
            </span>
          </div>

          {/* Stat cards */}
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-white/[0.03] p-3">
                <div className="text-[9px] uppercase tracking-wider text-text2">{s.label}</div>
                <div className="mt-1 text-lg font-extrabold" style={{ color: s.accent }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Mini chart */}
          <div className="mb-4 rounded-xl border border-border bg-white/[0.03] p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] text-text2">
                <IconTrendingUp width={13} height={13} className="text-cyan" />
                Followers · 30 derniers jours
              </span>
              <span className="text-[10px] font-bold text-emerald-400">+34,2K</span>
            </div>
            <svg viewBox="0 0 300 60" className="h-12 w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="mk-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#818CF8" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="mk-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22D3EE" />
                  <stop offset="100%" stopColor="#A855F7" />
                </linearGradient>
              </defs>
              <path
                d="M0,50 L30,42 L60,44 L90,34 L120,30 L150,22 L180,24 L210,14 L240,16 L270,8 L300,10 L300,60 L0,60 Z"
                fill="url(#mk-area)"
              />
              <path
                d="M0,50 L30,42 L60,44 L90,34 L120,30 L150,22 L180,24 L210,14 L240,16 L270,8 L300,10"
                fill="none"
                stroke="url(#mk-line)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Accounts table */}
          <div className="overflow-hidden rounded-xl border border-border bg-white/[0.03]">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-text2">
                  <th className="px-3 py-2 font-medium">Compte</th>
                  <th className="px-3 py-2 font-medium">Followers</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Vues</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const st = STATUS_STYLES[r.status]
                  return (
                    <tr key={r.name} className="border-t border-border/60 text-[11px]">
                      <td className="px-3 py-2 font-mono text-text">{r.name}</td>
                      <td className="px-3 py-2 text-text2">{r.followers}</td>
                      <td className="hidden px-3 py-2 text-text2 sm:table-cell">{r.views}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.bg} ${st.text}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
