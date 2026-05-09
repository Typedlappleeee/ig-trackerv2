import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { Spinner }  from '@/components/ui/Spinner'
import { Button }   from '@/components/ui/Button'

interface DashboardProps { user: User }

// ── Tiny SVG line chart ───────────────────────────────────────────────────────
function LineChart({ data, color = '#4f9eff', height = 80 }: {
  data: { label: string; value: number }[]
  color?: string
  height?: number
}) {
  if (data.length === 0) return (
    <div className="flex items-center justify-center text-text2 text-xs" style={{ height }}>
      Pas de données — clique sur "📸 Snapshot" pour enregistrer les vues actuelles.
    </div>
  )
  // Single point: draw a flat line at mid-height
  const W = 600; const H = height
  if (data.length === 1) {
    const y = H / 2
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        <line x1="0" y1={y} x2={W} y2={y} stroke={color} strokeWidth="2" strokeDasharray="6 4" strokeOpacity="0.5" />
        <circle cx={W / 2} cy={y} r="4" fill={color} />
      </svg>
    )
  }
  const max   = Math.max(...data.map(d => d.value), 1)
  const min   = Math.min(...data.map(d => d.value))
  const range = max - min || 1
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((d.value - min) / range) * (H - 10) - 5,
  }))
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${W},${H} L0,${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace('#','')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </svg>
  )
}

type Range = '24h' | '7d' | '30d' | 'all'

interface ViewPoint { label: string; value: number }

const SCHEMA_V3_SQL = `-- Colle ce SQL dans Supabase → SQL Editor → Run
create table if not exists public.views_history (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  phone_id    uuid references public.phones(id) on delete cascade not null,
  views       bigint not null,
  recorded_at timestamptz default now()
);
alter table public.views_history enable row level security;
create policy "views_history_all" on public.views_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table public.app_config
  add column if not exists groq_api_key  text default '',
  add column if not exists profile_name  text default '',
  add column if not exists profile_niche text default '';`

export function Dashboard({ user }: DashboardProps) {
  const [phones, setPhones]         = useState<Phone[]>([])
  const [selectedPhone, setSelPhone]= useState<Phone | null>(null)  // null = total
  const [range, setRange]           = useState<Range>('30d')
  const [chartData, setChartData]   = useState<ViewPoint[]>([])
  const [loadingChart, setLC]       = useState(false)
  const [loading, setLoading]       = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [sqlCopied, setSqlCopied]   = useState(false)

  // KPI values
  const [kpiToday, setKpiToday]     = useState<number | null>(null)
  const [kpiDelta, setKpiDelta]     = useState<number | null>(null)
  const [kpiPeak, setKpiPeak]       = useState<number | null>(null)
  const [kpiAvg, setKpiAvg]         = useState<number | null>(null)

  useEffect(() => {
    supabase.from('phones').select('*').eq('user_id', user.id).order('phone_name')
      .then(({ data }) => { setPhones(data ?? []); setLoading(false) })
  }, [])

  useEffect(() => { loadChart() }, [selectedPhone, range, phones])

  async function loadChart() {
    if (phones.length === 0) return
    setLC(true)

    // Build chart from views_history
    let query = supabase.from('views_history').select('views, recorded_at, phone_id').eq('user_id', user.id)
    if (selectedPhone) query = query.eq('phone_id', selectedPhone.id)

    const cutoff = new Date()
    if (range === '24h') cutoff.setHours(cutoff.getHours() - 24)
    else if (range === '7d') cutoff.setDate(cutoff.getDate() - 7)
    else if (range === '30d') cutoff.setDate(cutoff.getDate() - 30)

    if (range !== 'all') query = query.gte('recorded_at', cutoff.toISOString())
    query = query.order('recorded_at')

    const { data, error: qErr } = await query
    if (qErr) {
      // Table doesn't exist yet → show migration notice
      if (qErr.code === '42P01' || (qErr as unknown as { status?: number }).status === 404 || qErr.message?.includes('does not exist')) {
        setSchemaMissing(true)
      }
      setLC(false); return
    }
    setSchemaMissing(false)
    const rows = data ?? []

    if (rows.length === 0) {
      // No history yet — show a single current-views point as flat reference line
      const totalNow = phones.reduce((s, p) => s + (p.total_views ?? 0), 0)
      const today = new Date().toISOString().slice(0, 10)
      if (!selectedPhone) {
        setChartData(totalNow > 0 ? [{ label: today, value: totalNow }] : [])
      } else {
        const v = selectedPhone.total_views ?? 0
        setChartData(v > 0 ? [{ label: today, value: v }] : [])
      }
      setKpiToday(null); setKpiDelta(null); setKpiPeak(null); setKpiAvg(null)
      setLC(false); return
    }

    // Group by day
    const byDay = new Map<string, number>()
    for (const row of rows) {
      const day = row.recorded_at.slice(0, 10)
      const cur = byDay.get(day) ?? 0
      byDay.set(day, Math.max(cur, row.views as number))
    }
    const sorted = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    const pts: ViewPoint[] = sorted.map(([label, value]) => ({ label, value }))

    setChartData(pts)

    // KPIs from chart data
    if (pts.length >= 1) {
      const today = pts[pts.length - 1].value
      const yesterday = pts.length >= 2 ? pts[pts.length - 2].value : null
      setKpiToday(today)
      setKpiDelta(yesterday !== null ? today - yesterday : null)
      setKpiPeak(Math.max(...pts.map(p => p.value)))
      setKpiAvg(Math.round(pts.reduce((s, p) => s + p.value, 0) / pts.length))
    }

    setLC(false)
  }

  async function recordSnapshot() {
    // Save current views as a snapshot in views_history
    if (phones.length === 0) return
    const now = new Date().toISOString()
    const rows = phones.filter(p => p.total_views).map(p => ({
      user_id:     user.id,
      phone_id:    p.id,
      views:       p.total_views ?? 0,
      recorded_at: now,
    }))
    if (rows.length > 0) {
      await supabase.from('views_history').insert(rows)
      loadChart()
    }
  }

  const totalViews    = phones.reduce((s, p) => s + (p.total_views ?? 0), 0)
  const activePhones  = phones.filter(p => p.status === 'online').length
  const linkedPhones  = phones.filter(p => p.ig_username).length

  const RANGES: { key: Range; label: string }[] = [
    { key: '24h', label: '24h' },
    { key: '7d',  label: '7j'  },
    { key: '30d', label: '30j' },
    { key: 'all', label: 'Tout'},
  ]

  return (
    <div className="flex h-full min-h-screen">
      {/* Left sidebar: per-account selector */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-border bg-surface">
        <div className="px-4 py-4 border-b border-border">
          <p className="text-xs font-semibold text-text2 uppercase tracking-wider">Comptes</p>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size="sm" /></div>
          ) : (
            <>
              {/* Total row */}
              <button
                onClick={() => setSelPhone(null)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  selectedPhone === null ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">∑</div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text">Total</p>
                  <p className="text-[10px] text-text2">{phones.length} phones</p>
                </div>
              </button>

              {/* Per-phone rows */}
              {phones.filter(p => p.ig_username || p.total_views).map(phone => (
                <button
                  key={phone.id}
                  onClick={() => setSelPhone(phone)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    selectedPhone?.id === phone.id ? 'bg-surface2 border-l-2 border-accent pl-[10px]' : 'hover:bg-surface2'
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(phone.ig_username ?? phone.phone_name)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text truncate">
                      {phone.ig_username ? `@${phone.ig_username}` : phone.phone_name}
                    </p>
                    {phone.total_views ? (
                      <p className="text-[10px] text-text2">{phone.total_views.toLocaleString('fr-FR')} vues</p>
                    ) : null}
                  </div>
                  {phone.status === 'online' && <span className="w-1.5 h-1.5 rounded-full bg-ok flex-shrink-0" />}
                </button>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* Right: dashboard content */}
      <div className="flex-1 overflow-auto p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">
              {selectedPhone ? (selectedPhone.ig_username ? `@${selectedPhone.ig_username}` : selectedPhone.phone_name) : 'Dashboard'}
            </h1>
            <p className="text-text2 text-sm mt-1">Vue d'ensemble de ton activité IG</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={recordSnapshot} disabled={phones.length === 0}>
              📸 Snapshot
            </Button>
            <Button variant="secondary" size="sm" onClick={loadChart} loading={loadingChart}>
              ↺ Rafraîchir
            </Button>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'VUES TOTALES',     value: selectedPhone ? (selectedPhone.total_views ?? 0) : totalViews, color: '#4f9eff', icon: '👁' },
            { label: 'PHONES EN LIGNE',  value: activePhones,   color: '#00ccaa', icon: '✅' },
            { label: 'COMPTES IG LIÉS', value: linkedPhones,   color: '#a56ef5', icon: '📱' },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4 border-t-2" style={{ borderTopColor: color }}>
              <div className="flex items-center gap-2 mb-2">
                <span>{icon}</span>
                <span className="text-xs font-semibold text-text2">{label}</span>
              </div>
              <p className="text-3xl font-bold" style={{ color }}>{value.toLocaleString('fr-FR')}</p>
            </div>
          ))}
        </div>

        {/* Stats KPIs (from chart history) */}
        {(kpiToday !== null || kpiPeak !== null) && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'VUES AUJOURD\'HUI', value: kpiToday,                   color: '#4f9eff', icon: '👁' },
              { label: 'ÉVOLUTION 24H',     value: kpiDelta,                   color: kpiDelta !== null && kpiDelta >= 0 ? '#00ccaa' : '#f03d55', icon: kpiDelta !== null && kpiDelta >= 0 ? '📈' : '📉', prefix: kpiDelta !== null && kpiDelta > 0 ? '+' : '' },
              { label: 'PIC MAX',           value: kpiPeak,                    color: '#ffaa2a', icon: '🏆' },
              { label: 'MOYENNE / JOUR',    value: kpiAvg,                     color: '#5a6882', icon: '📊' },
            ].map(({ label, value, color, icon, prefix = '' }) => value !== null && (
              <div key={label} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{icon}</span>
                  <span className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{label}</span>
                </div>
                <p className="text-xl font-bold" style={{ color }}>
                  {prefix}{value.toLocaleString('fr-FR')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Schema migration notice */}
        {schemaMissing && (
          <div className="bg-warn/10 border border-warn/30 rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warn">Table <code>views_history</code> introuvable — migration requise</p>
                <p className="text-xs text-text2 mt-1">
                  Va dans <strong className="text-text">Supabase → SQL Editor</strong>, colle le code ci-dessous et clique <strong className="text-text">Run</strong>.
                  Ensuite actualise cette page.
                </p>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(SCHEMA_V3_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000) }}
                className="px-3 py-1.5 bg-warn text-black text-xs font-semibold rounded-lg hover:bg-warn/80 transition-colors flex-shrink-0"
              >
                {sqlCopied ? '✓ Copié !' : '📋 Copier le SQL'}
              </button>
            </div>
            <pre className="text-[10px] font-mono text-text2 bg-surface rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {SCHEMA_V3_SQL}
            </pre>
          </div>
        )}

        {/* Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text">Tendance des vues</h2>
            <div className="flex gap-1">
              {RANGES.map(({ key, label }) => (
                <button key={key} onClick={() => setRange(key)}
                  className={`px-3 py-1.5 rounded text-xs transition-all ${
                    range === key ? 'bg-accent/20 text-accent' : 'text-text2 hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loadingChart ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <LineChart data={chartData} color="#4f9eff" height={100} />
          )}

          {chartData.length > 0 && (
            <div className="flex justify-between mt-2 px-1">
              <span className="text-[10px] text-text2">{chartData[0]?.label}</span>
              <span className="text-[10px] text-text2">{chartData[chartData.length - 1]?.label}</span>
            </div>
          )}
        </div>

        {/* Quick start tips */}
        {phones.length === 0 && !loading && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-2 text-sm text-text2">
            <h2 className="text-sm font-semibold text-text mb-3">Démarrage rapide</h2>
            <div className="flex gap-2"><span className="text-accent">1.</span><span>Configure ton <span className="text-text font-medium">Bearer Token GéeLark</span> dans Paramètres.</span></div>
            <div className="flex gap-2"><span className="text-accent">2.</span><span>Va dans <span className="text-text font-medium">Téléphones</span> et clique sur Sync GéeLark.</span></div>
            <div className="flex gap-2"><span className="text-accent">3.</span><span>Ajoute tes comptes Instagram dans la colonne Instagram.</span></div>
            <div className="flex gap-2"><span className="text-accent">4.</span><span>Utilise <span className="text-text font-medium">Stats IG</span> pour récupérer les stats de tes comptes.</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
