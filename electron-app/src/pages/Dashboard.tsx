import { useState, useEffect, useRef, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'

interface DashboardProps { user: User }

type Range = '24h' | '7d' | '30d' | 'all'
interface ViewPoint { label: string; value: number; date: Date }

// Deterministic avatar color from string (matches Python _stats_avatar_color)
function avatarColor(s: string): string {
  const palette = ['#3b5bdb', '#2f9e44', '#c2255c', '#e8590c', '#5c7cfa', '#0ca678', '#f76707', '#9c36b5']
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  return palette[Math.abs(hash) % palette.length]
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString('fr-FR')
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar chart with hover tooltip — mirrors _dash_redraw_chart in Python
// ─────────────────────────────────────────────────────────────────────────────
function BarChart({ data, height = 280 }: { data: ViewPoint[]; height?: number }) {
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setW(wrapRef.current?.clientWidth ?? 900))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-text2 text-sm" style={{ height }}>
        Aucune donnée — actualisez l'onglet Téléphones d'abord
      </div>
    )
  }

  const ml = 56, mr = 20, mt = 20, mb = 44
  const plotW = Math.max(w - ml - mr, 100)
  const plotH = height - mt - mb
  const max = Math.max(...data.map(d => d.value), 1)
  const gap = 0.18
  const slotW = plotW / data.length
  const barW = slotW * (1 - gap)

  const today = data[data.length - 1]
  const labelStep = Math.max(1, Math.ceil(data.length / 14))

  return (
    <div ref={wrapRef} className="relative" style={{ height }}>
      <svg width={w} height={height} className="block">
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map(i => {
          const y = mt + (plotH * i) / 4
          const v = max * (1 - i / 4)
          return (
            <g key={i}>
              <line x1={ml} y1={y} x2={ml + plotW} y2={y} stroke="#2a2f44" strokeDasharray="3 4" />
              <text x={ml - 8} y={y + 4} textAnchor="end" fill="#5a6882" fontSize="10" fontFamily="Segoe UI">
                {fmt(Math.round(v))}
              </text>
            </g>
          )
        })}
        {/* Bars */}
        {data.map((d, i) => {
          const isToday = i === data.length - 1
          const h = (d.value / max) * plotH
          const x = ml + i * slotW + (slotW - barW) / 2
          const y = mt + plotH - h
          return (
            <g
              key={i}
              onMouseEnter={() => setHover({ idx: i, x: x + barW / 2, y })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={x} y={y} width={barW} height={h} fill={isToday ? '#4f8ef7' : '#5b7fd4'} rx={2} />
              <rect x={x} y={y} width={barW} height={2} fill={isToday ? '#d4f96a' : '#8aabef'} />
            </g>
          )
        })}
        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null
          const x = ml + i * slotW + slotW / 2
          return (
            <text key={i} x={x} y={mt + plotH + 18} textAnchor="middle" fill="#5a6882" fontSize="10" fontFamily="Segoe UI">
              {d.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </text>
          )
        })}
      </svg>
      {/* Tooltip */}
      {hover && (() => {
        const d = data[hover.idx]
        const prev = hover.idx > 0 ? data[hover.idx - 1].value : null
        const variation = prev !== null && prev > 0 ? ((d.value - prev) / prev) * 100 : null
        return (
          <div
            className="absolute pointer-events-none bg-[#1a1f2e] border border-accent rounded-lg px-3 py-2 text-[11px] text-text shadow-xl"
            style={{
              left: Math.min(Math.max(hover.x - 80, 4), w - 168),
              top: Math.max(hover.y - 70, 4),
              width: 160,
            }}
          >
            <p className="font-bold mb-0.5">{d.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <p className="text-text2">Vues : <span className="text-text font-semibold">{fmt(d.value)}</span></p>
            {variation !== null && (
              <p className={variation >= 0 ? 'text-ok' : 'text-danger'}>
                Variation : {variation >= 0 ? '+' : ''}{variation.toFixed(2)}%
              </p>
            )}
          </div>
        )
      })()}
    </div>
  )
}

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
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`

export function Dashboard({ user }: DashboardProps) {
  const [phones, setPhones]         = useState<Phone[]>([])
  const [selPhone, setSelPhone]     = useState<Phone | null>(null)
  const [range, setRange]           = useState<Range>('30d')
  const [chartData, setChartData]   = useState<ViewPoint[]>([])
  const [loading, setLoading]       = useState(true)
  const [loadingChart, setLC]       = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [sqlCopied, setSqlCopied]   = useState(false)

  useEffect(() => {
    supabase.from('phones').select('*').eq('user_id', user.id).order('phone_name')
      .then(({ data }) => {
        const loaded = data ?? []
        setPhones(loaded)
        setLoading(false)
        // Snapshot today's totals
        const withViews = loaded.filter(p => (p.total_views ?? 0) > 0)
        if (withViews.length > 0) {
          const now = new Date().toISOString()
          supabase.from('views_history').insert(
            withViews.map(p => ({ user_id: user.id, phone_id: p.id, views: p.total_views, recorded_at: now }))
          ).then(() => {})
        }
      })
  }, [])

  useEffect(() => { loadChart() }, [selPhone, range, phones])

  async function loadChart() {
    if (phones.length === 0) return
    setLC(true)
    let query = supabase.from('views_history').select('views, recorded_at, phone_id').eq('user_id', user.id)
    if (selPhone) query = query.eq('phone_id', selPhone.id)

    const cutoff = new Date()
    if (range === '24h') cutoff.setHours(cutoff.getHours() - 24)
    else if (range === '7d') cutoff.setDate(cutoff.getDate() - 7)
    else if (range === '30d') cutoff.setDate(cutoff.getDate() - 30)

    if (range !== 'all') query = query.gte('recorded_at', cutoff.toISOString())
    query = query.order('recorded_at')

    const { data, error: qErr } = await query
    if (qErr) {
      if (qErr.code === '42P01' || qErr.message?.includes('does not exist')) setSchemaMissing(true)
      setLC(false); return
    }
    setSchemaMissing(false)
    const rows = data ?? []
    if (rows.length === 0) {
      setChartData([])
      setLC(false); return
    }

    const byDay = new Map<string, number>()
    for (const row of rows) {
      const day = row.recorded_at.slice(0, 10)
      const cur = byDay.get(day) ?? 0
      byDay.set(day, Math.max(cur, row.views as number))
    }
    const sorted = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    const pts: ViewPoint[] = sorted.map(([label, value]) => ({ label, value, date: new Date(label) }))
    setChartData(pts)
    setLC(false)
  }

  // KPI calculations (matches Python 6-cell grid)
  const kpis = useMemo(() => {
    const today    = chartData.length > 0 ? chartData[chartData.length - 1].value : 0
    const prev     = chartData.length > 1 ? chartData[chartData.length - 2].value : null
    const delta    = prev !== null ? today - prev : null
    const peak     = chartData.length > 0 ? Math.max(...chartData.map(p => p.value)) : 0
    const avg      = chartData.length > 0 ? Math.round(chartData.reduce((s, p) => s + p.value, 0) / chartData.length) : 0
    const totalNow = selPhone ? (selPhone.total_views ?? 0) : phones.reduce((s, p) => s + (p.total_views ?? 0), 0)
    const activePhones = phones.filter(p => p.status === 'online').length
    const banned   = phones.filter(p => p.ig_status === 'error').length
    const videos   = selPhone ? (selPhone.video_count ?? 0) : 0
    return { today, delta, peak, avg, totalNow, activePhones, banned, videos }
  }, [chartData, phones, selPhone])

  const linkedPhones = phones.filter(p => p.ig_username)

  const RANGES: { key: Range; label: string }[] = [
    { key: '24h', label: '24h'  },
    { key: '7d',  label: '7j'   },
    { key: '30d', label: '30j'  },
    { key: 'all', label: 'Tout' },
  ]

  return (
    <div className="flex h-full min-h-screen">
      {/* Left sidebar: per-account selector — Python: 210px wide */}
      <aside className="w-[210px] flex-shrink-0 flex flex-col border-r border-border bg-[#0e1118]">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-bold text-text2 uppercase tracking-wider">Comptes</p>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size="sm" /></div>
          ) : (
            <>
              {/* Total row */}
              <button
                onClick={() => setSelPhone(null)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  selPhone === null ? 'bg-[#1e2a4a]' : 'hover:bg-surface2'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">📊</div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs ${selPhone === null ? 'font-bold text-text' : 'text-text'}`}>Tous les comptes</p>
                </div>
              </button>

              {/* Per-phone rows */}
              {linkedPhones.map(phone => {
                const dotColor =
                  phone.ig_status === 'active'      ? '#00ccaa' :
                  phone.ig_status === 'error'       ? '#f03d55' :
                  phone.ig_status === 'rate_limited'? '#ffaa2a' :
                  '#5a6882'
                const initials = (phone.ig_username ?? phone.phone_name).slice(0, 2).toUpperCase()
                const active = selPhone?.id === phone.id
                return (
                  <button
                    key={phone.id}
                    onClick={() => setSelPhone(phone)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      active ? 'bg-[#1e2a4a]' : 'hover:bg-surface2'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ background: avatarColor(phone.ig_username ?? phone.phone_name) }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${active ? 'font-bold text-text' : 'text-text'}`}>
                        {phone.phone_name.length > 20 ? phone.phone_name.slice(0, 20) + '…' : phone.phone_name}
                      </p>
                      {phone.ig_username && (
                        <p className="text-[10px] text-text2 truncate">@{phone.ig_username.length > 18 ? phone.ig_username.slice(0, 18) + '…' : phone.ig_username}</p>
                      )}
                    </div>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                  </button>
                )
              })}
            </>
          )}
        </div>
      </aside>

      {/* Right panel */}
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Title */}
        <h1 className="text-xl font-bold text-text">
          {selPhone ? `📱 ${selPhone.phone_name}` : 'Résumé des vues'}
        </h1>

        {/* Summary card with views + 6-cell KPI grid (Python layout) */}
        <div className="bg-card border border-border rounded-xl p-5 flex gap-5">
          {/* Left: total views */}
          <div className="flex items-center gap-4 pr-5 border-r border-border">
            <div className="w-[46px] h-[46px] rounded-full bg-accent/20 text-accent flex items-center justify-center text-xl">👁</div>
            <div>
              <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{selPhone ? 'Vues du compte' : 'Total vues'}</p>
              <p className="text-[24px] font-bold text-text leading-none mt-1">{kpis.totalNow.toLocaleString('fr-FR')}</p>
            </div>
          </div>

          {/* Right: 3x2 KPI grid */}
          <div className="flex-1 grid grid-cols-3 gap-2">
            {[
              { label: "Vues aujourd'hui", value: kpis.today,    icon: '👁',  color: '#4f8ef7' },
              { label: 'Croissance',        value: kpis.delta,    icon: kpis.delta !== null && kpis.delta >= 0 ? '📈' : '📉', color: kpis.delta !== null && kpis.delta >= 0 ? '#00ccaa' : '#f03d55', sign: true },
              selPhone
                ? { label: 'Statut IG',     value: selPhone.ig_status === 'active' ? 'Actif' : selPhone.ig_status === 'error' ? 'Banni' : selPhone.ig_status ?? '—', icon: '✅', color: '#00ccaa', isText: true }
                : { label: 'Téléphones actifs', value: kpis.activePhones, icon: '📱', color: '#00ccaa' },
              { label: 'Record journalier', value: kpis.peak,     icon: '🏆', color: '#ffaa2a' },
              { label: 'Moyenne / jour',    value: kpis.avg,      icon: '📊', color: '#5a6882' },
              selPhone
                ? { label: 'Vidéos',         value: kpis.videos,   icon: '🎥', color: '#a56ef5' }
                : { label: 'Bannis',         value: kpis.banned,   icon: '🚫', color: '#f03d55' },
            ].map((kpi, i) => (
              <div key={i} className="bg-surface2 border border-border rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-sm">{kpi.icon}</span>
                  <span className="text-[9px] font-semibold text-text2 uppercase tracking-wider">{kpi.label}</span>
                </div>
                <p className="text-base font-bold" style={{ color: kpi.color }}>
                  {(() => {
                    if ('isText' in kpi && kpi.isText) return kpi.value as string
                    const v = kpi.value
                    if (v === null) return '—'
                    if (typeof v !== 'number') return v
                    if ('sign' in kpi && kpi.sign && v > 0) return `+${v.toLocaleString('fr-FR')}`
                    return v.toLocaleString('fr-FR')
                  })()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Schema migration notice */}
        {schemaMissing && (
          <div className="bg-warn/10 border border-warn/30 rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warn">Table <code>views_history</code> introuvable — migration requise</p>
                <p className="text-xs text-text2 mt-1">Va dans <strong className="text-text">Supabase → SQL Editor</strong>, colle le code ci-dessous et clique <strong className="text-text">Run</strong>.</p>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(SCHEMA_V3_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000) }}
                className="px-3 py-1.5 bg-warn text-black text-xs font-semibold rounded-lg hover:bg-warn/80 flex-shrink-0"
              >
                {sqlCopied ? '✓ Copié' : '📋 Copier'}
              </button>
            </div>
            <pre className="text-[10px] font-mono text-text2 bg-surface rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {SCHEMA_V3_SQL}
            </pre>
          </div>
        )}

        {/* Chart card with range pills */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text">Tendances des vues</h2>
            <div className="flex gap-1">
              {RANGES.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setRange(key)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    range === key ? 'bg-[#3d5a99] text-white' : 'bg-surface2 text-text2 hover:text-text'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
          {loadingChart ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <BarChart data={chartData} height={280} />
          )}
        </div>

        {/* Quick start tips */}
        {phones.length === 0 && !loading && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-2 text-sm text-text2">
            <h2 className="text-sm font-semibold text-text mb-3">Démarrage rapide</h2>
            <div className="flex gap-2"><span className="text-accent">1.</span><span>Configure ton <span className="text-text font-medium">Bearer Token GéeLark</span> dans Paramètres.</span></div>
            <div className="flex gap-2"><span className="text-accent">2.</span><span>Va dans <span className="text-text font-medium">Téléphones</span> et clique sur Sync GéeLark.</span></div>
            <div className="flex gap-2"><span className="text-accent">3.</span><span>Ajoute tes comptes Instagram via le menu clic droit.</span></div>
            <div className="flex gap-2"><span className="text-accent">4.</span><span>Utilise <span className="text-text font-medium">Stats</span> pour voir tes performances.</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
