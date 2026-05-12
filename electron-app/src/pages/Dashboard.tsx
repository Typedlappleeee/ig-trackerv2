import { useState, useEffect, useRef, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
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
function LineChart({ data, height = 280 }: { data: ViewPoint[]; height?: number }) {
  const [hover, setHover] = useState<{ idx: number } | null>(null)
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

  const ml = 56, mr = 20, mt = 24, mb = 44
  const plotW = Math.max(w - ml - mr, 100)
  const plotH = height - mt - mb
  const max = Math.max(...data.map(d => d.value), 1)
  const labelStep = Math.max(1, Math.ceil(data.length / 10))

  const pts = data.map((d, i) => ({
    x: ml + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * plotW,
    y: mt + plotH - (d.value / max) * plotH,
  }))

  // Catmull-Rom → cubic bezier smooth path
  function smoothPath(points: { x: number; y: number }[]): string {
    if (points.length === 1) return `M${points[0].x},${points[0].y}`
    let d = `M${points[0].x},${points[0].y}`
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[Math.min(i + 2, points.length - 1)]
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
    }
    return d
  }

  const linePath = smoothPath(pts)
  const last = pts[pts.length - 1]
  const first = pts[0]
  const areaPath = `${linePath} L${last.x},${mt + plotH} L${first.x},${mt + plotH} Z`
  const hoverPt = hover !== null ? pts[hover.idx] : null

  return (
    <div ref={wrapRef} className="relative select-none" style={{ height }}>
      <svg width={w} height={height} className="block">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <filter id="glowLine">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Grid */}
        {[0, 1, 2, 3, 4].map(i => {
          const y = mt + (plotH * i) / 4
          return (
            <g key={i}>
              <line x1={ml} y1={y} x2={ml + plotW} y2={y} stroke="#1e2438" strokeDasharray="4 5" />
              <text x={ml - 8} y={y + 4} textAnchor="end" fill="#5a6882" fontSize="10" fontFamily="Segoe UI,system-ui,sans-serif">
                {fmt(Math.round(max * (1 - i / 4)))}
              </text>
            </g>
          )
        })}

        {/* Area */}
        <path d={areaPath} fill="url(#areaGrad)" />

        {/* Glow copy of line */}
        <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="5" strokeOpacity="0.18" strokeLinecap="round" />

        {/* Main line */}
        <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots — always for ≤14 pts, only hovered otherwise */}
        {pts.map((p, i) => {
          const isLast = i === pts.length - 1
          const isHov  = hover?.idx === i
          const show   = data.length <= 14 || isHov || isLast
          return show ? (
            <circle key={i} cx={p.x} cy={p.y}
              r={isHov ? 6 : isLast ? 4 : 3}
              fill={isLast ? '#f472b6' : '#8b5cf6'}
              stroke="#0d1120" strokeWidth="2"
            />
          ) : null
        })}

        {/* Invisible hover strips */}
        {pts.map((p, i) => (
          <rect key={i}
            x={i === 0 ? ml : (p.x + pts[i - 1].x) / 2}
            y={mt}
            width={i === 0
              ? pts.length > 1 ? (pts[1].x - p.x) / 2 : plotW
              : i === pts.length - 1
                ? p.x - (p.x + pts[i - 1].x) / 2
                : (pts[i + 1].x - pts[i - 1].x) / 2}
            height={plotH}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onMouseEnter={() => setHover({ idx: i })}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        {/* Vertical cursor */}
        {hoverPt && (
          <line x1={hoverPt.x} y1={mt} x2={hoverPt.x} y2={mt + plotH}
            stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4 3" opacity="0.5"
          />
        )}

        {/* X labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null
          return (
            <text key={i} x={pts[i].x} y={mt + plotH + 18}
              textAnchor="middle" fill="#5a6882" fontSize="10" fontFamily="Segoe UI,system-ui,sans-serif">
              {d.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </text>
          )
        })}
      </svg>

      {/* Tooltip */}
      {hover !== null && hoverPt && (() => {
        const d = data[hover.idx]
        const prev = hover.idx > 0 ? data[hover.idx - 1].value : null
        const delta = prev !== null ? d.value - prev : null
        const pct   = prev && prev > 0 ? ((d.value - prev) / prev) * 100 : null
        return (
          <div
            className="absolute pointer-events-none rounded-xl px-3 py-2.5 shadow-2xl"
            style={{
              background: 'rgba(8,5,20,0.92)', border: '1px solid rgba(139,92,246,0.4)', backdropFilter: 'blur(16px)',
              left: Math.min(Math.max(hoverPt.x - 80, ml), w - 172),
              top: Math.max(hoverPt.y - 80, 4),
              width: 164,
            }}
          >
            <p className="text-[11px] font-bold text-text mb-1">
              {d.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <p className="text-text2 text-[11px]">Vues : <span className="font-semibold" style={{ color: '#a78bfa' }}>{fmt(d.value)}</span></p>
            {delta !== null && (
              <p className={`text-[11px] font-semibold mt-0.5 ${delta >= 0 ? 'text-ok' : 'text-danger'}`}>
                {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}
                {pct !== null && <span className="font-normal text-text2"> ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
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
  const { currentOrg }              = useOrg()
  const conns                       = useConnections(user)
  const [phones, setPhones]         = useState<Phone[]>([])
  const [selPhone, setSelPhone]     = useState<Phone | null>(null)
  const [range, setRange]           = useState<Range>('30d')
  const [chartData, setChartData]   = useState<ViewPoint[]>([])
  const [loading, setLoading]       = useState(true)
  const [loadingChart, setLC]       = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [sqlCopied, setSqlCopied]   = useState(false)

  useEffect(() => {
    if (!conns.bearer) { setPhones([]); setLoading(false); return }
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
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
  }, [currentOrg?.id, user.id, conns.bearer])

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

    const byDay = new Map<string, number>()
    const dayKey = (iso: string) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    for (const row of rows) {
      const day = dayKey(row.recorded_at)
      const cur = byDay.get(day) ?? 0
      byDay.set(day, Math.max(cur, row.views as number))
    }

    // Build a complete day-by-day series for fixed ranges, filling gaps with 0.
    let pts: ViewPoint[]
    if (range === 'all') {
      const sorted = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
      pts = sorted.map(([label, value]) => ({ label, value, date: new Date(label) }))
    } else {
      const days = range === '24h' ? 1 : range === '7d' ? 7 : 30
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      pts = []
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const label = fmt(d)
        pts.push({ label, value: byDay.get(label) ?? 0, date: new Date(d) })
      }
    }
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
      <aside className="w-[210px] flex-shrink-0 flex flex-col border-r border-border bg-[#0e1118] anim-slide-l">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-bold text-text2 uppercase tracking-wider">Comptes</p>
        </div>
        <div className="flex-1 overflow-auto py-1 anim-stagger">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size="sm" /></div>
          ) : (
            <>
              {/* Total row */}
              <button
                onClick={() => setSelPhone(null)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all rounded-lg mx-1 my-0.5 ${
                  selPhone === null
                    ? 'border'
                    : 'hover:bg-surface2 border border-transparent'
                }`}
                style={selPhone === null ? { background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.25)', width: 'calc(100% - 8px)' } : { width: 'calc(100% - 8px)' }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-transform ${selPhone === null ? 'scale-110' : ''}`} style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>📊</div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs ${selPhone === null ? 'font-bold' : 'text-text'}`} style={selPhone === null ? { color: '#c4b5fd' } : {}}>Tous les comptes</p>
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
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all rounded-lg mx-1 my-0.5 ${
                      active ? 'border' : 'hover:bg-surface2 border border-transparent'
                    }`}
                    style={active ? { background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.25)', width: 'calc(100% - 8px)' } : { width: 'calc(100% - 8px)' }}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 transition-transform ${active ? 'scale-110 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)]' : ''}`}
                      style={{ background: avatarColor(phone.ig_username ?? phone.phone_name) }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${active ? 'font-bold' : 'text-text'}`} style={active ? { color: '#c4b5fd' } : {}}>
                        {phone.phone_name.length > 20 ? phone.phone_name.slice(0, 20) + '…' : phone.phone_name}
                      </p>
                      {phone.ig_username && (
                        <p className="text-[10px] text-text2 truncate">@{phone.ig_username.length > 18 ? phone.ig_username.slice(0, 18) + '…' : phone.ig_username}</p>
                      )}
                    </div>
                    <span className="relative w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }}>
                      {phone.ig_status === 'active' && (
                        <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: dotColor }} />
                      )}
                    </span>
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
        <div className="bg-card border border-border rounded-xl p-5 flex gap-5 anim-page card-lift" style={{ animationDelay: '0.04s' }}>
          {/* Left: total views */}
          <div className="flex items-center gap-4 pr-5 border-r border-border">
            <div className="w-[46px] h-[46px] rounded-full flex items-center justify-center text-xl anim-float" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>👁</div>
            <div>
              <p className="text-[10px] font-semibold text-text2 uppercase tracking-wider">{selPhone ? 'Vues du compte' : 'Total vues'}</p>
              <p className="text-[24px] font-bold text-text leading-none mt-1 anim-number-pop" key={kpis.totalNow}>
                {kpis.totalNow.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>

          {/* Right: 3x2 KPI grid */}
          <div className="flex-1 grid grid-cols-3 gap-2 anim-stagger">
            {[
              { label: "Vues aujourd'hui", value: kpis.today,    icon: '👁',  color: '#a78bfa' },
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
              <div key={i} className="bg-surface2 border border-border rounded-lg p-3 card-lift">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-sm">{kpi.icon}</span>
                  <span className="text-[9px] font-semibold text-text2 uppercase tracking-wider">{kpi.label}</span>
                </div>
                <p className="text-base font-bold anim-number-pop" style={{ color: kpi.color }} key={String(kpi.value)}>
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
        <div className="bg-card border border-border rounded-xl p-5 anim-page card-lift" style={{ animationDelay: '0.08s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text">Tendances des vues</h2>
            <div className="flex gap-1 bg-surface2 p-1 rounded-lg">
              {RANGES.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setRange(key)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    range === key ? 'text-white' : 'text-text2 hover:text-text hover:bg-surface3/50'
                  }`}
                  style={range === key ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', boxShadow: '0 1px 8px -2px rgba(124,58,237,0.5)' } : {}}
                >{label}</button>
              ))}
            </div>
          </div>
          {loadingChart ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <LineChart data={chartData} height={280} />
          )}
        </div>

        {/* Quick start tips */}
        {phones.length === 0 && !loading && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-2 text-sm text-text2">
            <h2 className="text-sm font-semibold text-text mb-3">Démarrage rapide</h2>
            <div className="flex gap-2"><span style={{ color: '#a78bfa' }}>1.</span><span>Configure ton <span className="text-text font-medium">Bearer Token GéeLark</span> dans Paramètres.</span></div>
            <div className="flex gap-2"><span style={{ color: '#a78bfa' }}>2.</span><span>Va dans <span className="text-text font-medium">Téléphones</span> et clique sur Sync GéeLark.</span></div>
            <div className="flex gap-2"><span style={{ color: '#a78bfa' }}>3.</span><span>Ajoute tes comptes Instagram via le menu clic droit.</span></div>
            <div className="flex gap-2"><span style={{ color: '#a78bfa' }}>4.</span><span>Utilise <span className="text-text font-medium">Stats</span> pour voir tes performances.</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
