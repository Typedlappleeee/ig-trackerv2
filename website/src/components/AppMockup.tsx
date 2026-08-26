const NAV = ['Tableau de bord', 'Comptes', 'Mass Posting', 'Programmation', 'Calendrier', 'Statistiques']

const ROWS: { name: string; account: string; status: 'published' | 'running' | 'queued' }[] = [
  { name: 'iPhone-01', account: '@brand.paris · Instagram',   status: 'published' },
  { name: 'iPhone-02', account: '@studio.creatif · TikTok',   status: 'running' },
  { name: 'iPhone-03', account: '@ugc.factory · Instagram',   status: 'queued' },
  { name: 'iPhone-04', account: '@growth.lab · TikTok',       status: 'queued' },
]

const STATUS = {
  published: { label: 'publié',   color: '#34D399', bg: 'rgba(52,211,153,0.12)', pulse: false },
  running:   { label: 'en cours', color: '#FCD34D', bg: 'rgba(251,191,36,0.13)', pulse: true },
  queued:    { label: 'en file',  color: 'rgba(196,181,253,0.6)', bg: 'rgba(255,255,255,0.06)', pulse: false },
} as const

/** Maquette de l'écran Mass Posting, présentée dans une fenêtre macOS. */
export function AppMockup() {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-[-20px] -top-10 h-[280px] rounded-full opacity-70 blur-[80px]"
        style={{ background: 'linear-gradient(120deg, rgba(94,234,212,0.18), rgba(129,140,248,0.25), rgba(192,132,252,0.18))' }}
        aria-hidden="true"
      />
      <div
        className="relative overflow-hidden rounded-[22px] text-left"
        style={{
          background: 'rgba(10,10,26,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 40px 100px -30px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Barre de fenêtre */}
        <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-[18px] py-[13px]">
          <span className="h-[11px] w-[11px] rounded-full bg-[#FF5F57]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#FEBC2E]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#28C840]" />
          <span className="ml-3 text-xs font-bold text-muted">scaleflow — Mass Posting</span>
          <span
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold text-emerald"
            style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }}
          >
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald" />
            52 phones en ligne
          </span>
        </div>

        <div className="flex min-h-[400px]">
          {/* Sidebar */}
          <div className="flex w-[198px] shrink-0 flex-col gap-[3px] border-r border-white/[0.07] p-2.5 text-[13px] font-semibold text-text2">
            {NAV.map(item => {
              const active = item === 'Mass Posting'
              return (
                <div
                  key={item}
                  className="rounded-[10px] px-3 py-2.5"
                  style={active ? {
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(34,211,238,0.10))',
                    border: '1px solid rgba(139,92,246,0.35)',
                    color: '#E9D5FF',
                    fontWeight: 800,
                  } : undefined}
                >
                  {item}
                </div>
              )
            })}
            <div className="mt-auto rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="text-[10.5px] font-bold text-muted">Crédits restants</div>
              <div className="gradient-text mt-0.5 font-display text-[17px] font-bold">107 150</div>
              <div className="mt-2 h-1 rounded-full bg-white/[0.07]">
                <div className="h-full w-[72%] rounded-full" style={{ background: 'linear-gradient(90deg,#22D3EE,#818CF8,#A855F7)' }} />
              </div>
            </div>
          </div>

          {/* Contenu */}
          <div className="flex flex-1 flex-col gap-3.5 p-[22px]">
            <div className="flex items-center justify-between">
              <div className="font-display text-base font-bold text-text">Nouveau mass posting</div>
              <div className="flex gap-1.5 text-[11px] font-bold">
                <span className="rounded-full px-2.5 py-1" style={{ background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}>1. Comptes</span>
                <span className="rounded-full border border-white/[0.09] px-2.5 py-1 text-text2">2. Contenu</span>
                <span className="rounded-full border border-white/[0.09] px-2.5 py-1 text-text2">3. Planification</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {ROWS.map(r => {
                const s = STATUS[r.status]
                const highlight = r.status === 'running'
                return (
                  <div
                    key={r.name}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-[13px]"
                    style={{
                      background: highlight ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${highlight ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <span className="font-mono font-extrabold text-[#E9D5FF]">{r.name}</span>
                    <span className="text-text2">{r.account}</span>
                    <span
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                      style={{ background: s.bg, color: s.color }}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${s.pulse ? 'animate-pulse-dot' : ''}`} style={{ background: s.color }} />
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              className="mt-auto cursor-pointer rounded-xl py-3.5 text-sm font-extrabold text-[#0A0A16]"
              style={{ background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)', boxShadow: '0 0 32px -8px rgba(129,140,248,0.7)' }}
            >
              ⚡ Lancer la diffusion sur 52 comptes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
