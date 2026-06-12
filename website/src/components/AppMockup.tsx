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
  { label: 'Followers', value: '84,1K', delta: '+2,4K', accent: '#818CF8' },
  { label: 'Vues', value: '5,2M', delta: '+312K', accent: '#22D3EE' },
  { label: 'Vidéos', value: '247', delta: '+18', accent: '#A855F7' },
  { label: 'Engagement', value: '4,7%', delta: '+0,3', accent: '#34D399' },
]

const ROWS = [
  { name: 'iPhone-01', followers: '12,4K', views: '847K', status: 'posting' as const },
  { name: 'iPhone-02', followers: '8,9K', views: '512K', status: 'online' as const },
  { name: 'iPhone-03', followers: '23,1K', views: '1,2M', status: 'posting' as const },
  { name: 'iPhone-04', followers: '5,7K', views: '301K', status: 'online' as const },
  { name: 'iPhone-05', followers: '14,2K', views: '923K', status: 'done' as const },
]

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string; label: string; pulse?: boolean }> = {
  online: { dot: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-400/10', label: 'en ligne' },
  posting: { dot: 'bg-amber-400', text: 'text-amber-300', bg: 'bg-amber-400/10', label: 'publication…', pulse: true },
  done: { dot: 'bg-cyan-400', text: 'text-cyan-300', bg: 'bg-cyan-400/10', label: 'publié' },
}

export function AppMockup() {
  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Floating "Mass Posting en cours" badge */}
      <div
        className="absolute -top-4 right-4 z-20 flex items-center gap-2.5 rounded-2xl px-4 py-2.5 glass-strong animate-float-slow sm:right-8"
        style={{ boxShadow: '0 16px 40px -12px rgba(124,58,237,0.6)', border: '1px solid rgba(139,92,246,0.35)' }}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald opacity-60 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald" />
        </span>
        <div>
          <div className="text-[11px] font-bold leading-tight text-text">Mass Posting en cours</div>
          <div className="font-mono text-[9px] leading-tight text-text2">42/47 comptes · ~3 min restantes</div>
        </div>
      </div>

      {/* Floating credits badge */}
      <div
        className="absolute -left-3 bottom-10 z-20 hidden items-center gap-2 rounded-xl px-3.5 py-2 glass-strong animate-float-slow2 md:flex"
        style={{ boxShadow: '0 14px 36px -12px rgba(34,211,238,0.5)', border: '1px solid rgba(34,211,238,0.3)' }}
      >
        <span className="gradient-text text-sm font-black">+18</span>
        <span className="text-[10px] leading-tight text-text2">
          reels publiés
          <br />
          cette heure
        </span>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl glass-strong"
        style={{ boxShadow: '0 40px 90px -30px rgba(124,58,237,0.55), 0 0 0 1px rgba(255,255,255,0.06)' }}
      >
        {/* Top glow line */}
        <div
          className="pointer-events-none absolute inset-x-10 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(129,140,248,0.7), transparent)' }}
          aria-hidden="true"
        />

        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <span className="h-3 w-3 rounded-full bg-red-500/60" />
          <span className="h-3 w-3 rounded-full bg-amber-500/60" />
          <span className="h-3 w-3 rounded-full bg-emerald-500/60" />
          <span className="ml-3 font-mono text-[10px] text-text2">ScaleFlow — Dashboard</span>
          <span
            className="ml-auto hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold text-emerald sm:inline-flex"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse-dot" />
            GeeLark connecté
          </span>
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
                  item.active ? 'text-text' : 'text-text2'
                }`}
                style={
                  item.active
                    ? { background: 'linear-gradient(90deg, rgba(129,140,248,0.16), rgba(255,255,255,0.04))', borderLeft: '2px solid #818CF8' }
                    : undefined
                }
              >
                <item.icon width={16} height={16} className={item.active ? 'text-cyan' : ''} />
                {item.label}
              </div>
            ))}

            {/* Credits widget */}
            <div className="mt-auto rounded-xl border border-border bg-white/[0.03] p-3">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-text2">
                Crédits
                <span className="font-mono font-bold text-amber-300">3 870</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: '70%', background: 'linear-gradient(90deg,#FBBF24,#FB923C)' }} />
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-text">Vue d'ensemble</h3>
                <p className="flex items-center gap-1.5 text-[10px] text-text2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse-dot" />
                  47 comptes actifs · synchronisé il y a 12 s
                </p>
              </div>
              <span
                className="cursor-pointer rounded-lg px-3 py-1.5 text-[10px] font-bold text-[#0a0a16]"
                style={{ background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)', boxShadow: '0 6px 20px -6px rgba(124,58,237,0.7)' }}
              >
                + Mass Post
              </span>
            </div>

            {/* Stat cards */}
            <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="relative overflow-hidden rounded-xl border border-border bg-white/[0.03] p-3"
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
                    style={{ background: `linear-gradient(90deg, ${s.accent}, transparent)` }}
                    aria-hidden="true"
                  />
                  <div className="text-[9px] uppercase tracking-wider text-text2">{s.label}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="stat-value text-lg font-extrabold" style={{ color: s.accent }}>
                      {s.value}
                    </span>
                    <span className="text-[9px] font-bold text-emerald-400">{s.delta}</span>
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
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">+34,2K</span>
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
                <circle cx="300" cy="10" r="3" fill="#A855F7" />
                <circle cx="300" cy="10" r="6" fill="#A855F7" opacity="0.25" />
              </svg>
            </div>

            {/* Accounts table */}
            <div className="overflow-hidden rounded-xl border border-border bg-white/[0.03]">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                <span className="text-[9px] uppercase tracking-wider text-text2">Cloud phones</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse-dot" />
                  Mass Post actif
                </span>
              </div>
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
                      <tr key={r.name} className="border-t border-border/60 text-[11px] transition-colors hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono text-text">{r.name}</td>
                        <td className="px-3 py-2 text-text2">{r.followers}</td>
                        <td className="hidden px-3 py-2 text-text2 sm:table-cell">{r.views}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.bg} ${st.text}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${st.pulse ? 'animate-pulse-dot' : ''}`} />
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
    </div>
  )
}
