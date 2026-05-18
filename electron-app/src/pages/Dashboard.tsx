import { useState, useEffect, useRef, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { Spinner } from '@/components/ui/Spinner'
import { fetchIgStats } from '@/lib/instagram'

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
    q.then(async ({ data }) => {
      const loaded = data ?? []
      setPhones(loaded)
      setLoading(false)

      // Fetch fresh Instagram stats for each phone with a username, then snapshot
      const withUsername = loaded.filter(p => p.ig_username)
      if (withUsername.length === 0) return
      const now = new Date().toISOString()
      const rows: { user_id: string; phone_id: string; views: number; recorded_at: string }[] = []
      for (const p of withUsername) {
        try {
          const stats = await fetchIgStats(p.ig_username!)
          if (stats && stats.total_views > 0)
            rows.push({ user_id: user.id, phone_id: p.id, views: stats.total_views, recorded_at: now })
        } catch { /* ignore individual failures */ }
        await new Promise(r => setTimeout(r, 800)) // small delay to avoid rate-limiting
      }
      if (rows.length > 0)
        supabase.from('views_history').insert(rows).then(() => {})
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

    const dayKey = (iso: string) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const fmtDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    // Last (highest) snapshot per day per phone → sum across phones per day
    const maxByDayPhone = new Map<string, Map<string, number>>() // day → phoneId → maxViews
    for (const row of rows) {
      const day = dayKey(row.recorded_at)
      if (!maxByDayPhone.has(day)) maxByDayPhone.set(day, new Map())
      const phoneMap = maxByDayPhone.get(day)!
      const cur = phoneMap.get(row.phone_id) ?? 0
      phoneMap.set(row.phone_id, Math.max(cur, row.views as number))
    }
    // Total views per day = sum of max per phone
    const totalByDay = new Map<string, number>()
    for (const [day, phoneMap] of maxByDayPhone)
      totalByDay.set(day, [...phoneMap.values()].reduce((a, b) => a + b, 0))

    // Sort days and compute DAILY DELTA (views gained = today_total - yesterday_total)
    const sortedDays = [...totalByDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    const deltaByDay = new Map<string, number>()
    for (let i = 0; i < sortedDays.length; i++) {
      const [day, views] = sortedDays[i]
      deltaByDay.set(day, i === 0 ? 0 : Math.max(0, views - sortedDays[i - 1][1]))
    }

    // Build chart series
    let pts: ViewPoint[]
    if (range === 'all') {
      pts = sortedDays.map(([label]) => ({ label, value: deltaByDay.get(label) ?? 0, date: new Date(label) }))
    } else {
      const days = range === '24h' ? 1 : range === '7d' ? 7 : 30
      const today = new Date(); today.setHours(0, 0, 0, 0)
      pts = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i)
        const label = fmtDay(d)
        pts.push({ label, value: deltaByDay.get(label) ?? 0, date: new Date(d) })
      }
    }
    setChartData(pts)
    setLC(false)
  }

  // KPI calculations (matches Python 6-cell grid)
  const kpis = useMemo(() => {
    // today = views gained today (last bar), prev = views gained yesterday
    const today    = chartData.length > 0 ? chartData[chartData.length - 1].value : 0
    const prev     = chartData.length > 1 ? chartData[chartData.length - 2].value : null
    const delta    = prev !== null ? today - prev : null  // vs yesterday
    const peak     = chartData.length > 0 ? Math.max(...chartData.map(p => p.value)) : 0
    const nonZero  = chartData.filter(p => p.value > 0)
    const avg      = nonZero.length > 0 ? Math.round(nonZero.reduce((s, p) => s + p.value, 0) / nonZero.length) : 0
    const linkedPhones = phones.filter(p => p.ig_username)
    const activePhones = linkedPhones.length
    const banned   = phones.filter(p => p.ig_status === 'error').length
    const videos   = selPhone ? (selPhone.video_count ?? 0) : 0
    return { today, delta, peak, avg, activePhones, banned, videos }
  }, [chartData, phones, selPhone])

  const linkedPhones = phones.filter(p => p.ig_username)

  const RANGES: { key: Range; label: string }[] = [
    { key: '24h', label: '24h'  },
    { key: '7d',  label: '7j'   },
    { key: '30d', label: '30j'  },
    { key: 'all', label: 'Tout' },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <h1 className="text-[28px] font-black text-white leading-none">Dashboard</h1>

        <div className="flex items-center gap-3">
          {/* Range pills */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  range === key ? 'text-white' : 'text-text2 hover:text-text hover:bg-white/[0.04]'
                }`}
                style={range === key ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', boxShadow: '0 1px 8px -2px rgba(124,58,237,0.5)' } : {}}
              >{label}</button>
            ))}
          </div>

          {/* Account dropdown */}
          {linkedPhones.length > 0 && (
            <div className="relative">
              <select
                value={selPhone?.id ?? ''}
                onChange={e => {
                  const found = linkedPhones.find(p => p.id === e.target.value) ?? null
                  setSelPhone(found)
                }}
                className="appearance-none outline-none px-4 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: 'rgba(196,181,253,0.8)',
                  paddingRight: '2.5rem',
                }}
              >
                <option value="" style={{ background: '#0d1120', color: '#e2d9f3' }}>Tous les comptes</option>
                {linkedPhones.map(p => (
                  <option key={p.id} value={p.id} style={{ background: '#0d1120', color: '#e2d9f3' }}>
                    {p.phone_name}
                  </option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none" style={{ color: 'rgba(196,181,253,0.5)' }}>▾</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-10 pb-10">

        {/* Schema migration notice */}
        {schemaMissing && (
          <div className="mt-7 bg-warn/10 border border-warn/30 rounded-xl p-5 space-y-3">
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

        {loading ? (
          <div className="flex justify-center py-24"><Spinner /></div>
        ) : phones.length === 0 ? (
          /* ── Empty state ─────────────────────────────────────────────────── */
          <div className="mt-10 rounded-2xl p-10 text-center space-y-6" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <div className="text-4xl">🚀</div>
            <div>
              <p className="text-base font-bold text-text">Bienvenue sur ScaleFlow</p>
              <p className="text-sm text-text2 mt-1">Suis ces étapes pour commencer</p>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-left">
              {[
                { n: '1', title: 'Bearer Token', desc: 'Configure ton token GéeLark dans Paramètres → Connexions' },
                { n: '2', title: 'Sync téléphones', desc: 'Va dans Téléphones et clique "Sync GéeLark"' },
                { n: '3', title: 'Ajoute Instagram', desc: 'Clic droit sur un téléphone → Session ID' },
                { n: '4', title: 'Lance le posting', desc: 'Utilise Posting ou Mass Posting pour publier' },
              ].map(step => (
                <div key={step.n} className="rounded-xl p-3 flex gap-3 items-start" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.1)' }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: '#fff' }}>{step.n}</span>
                  <div>
                    <p className="text-xs font-semibold text-text">{step.title}</p>
                    <p className="text-[11px] text-text2 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ── 4 KPI cards ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-6 mt-8">
              {/* totalNow */}
              <div
                className="rounded-2xl p-7"
                style={{ background: 'rgba(129,140,248,0.05)', border: '1px solid rgba(129,140,248,0.12)' }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[18px]">👁</span>
                  <span className="text-[12px] font-semibold" style={{ color: 'rgba(148,163,184,0.7)' }}>
                    {selPhone ? 'Vues du compte' : 'Total vues'}
                  </span>
                </div>
                <p className="text-[42px] font-black text-white leading-none anim-number-pop" key={kpis.peak}>
                  {fmt(kpis.peak)}
                </p>
              </div>

              {/* today + delta */}
              <div
                className="rounded-2xl p-7"
                style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.12)' }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[18px]">{kpis.delta !== null && kpis.delta >= 0 ? '📈' : '📉'}</span>
                  <span className="text-[12px] font-semibold" style={{ color: 'rgba(148,163,184,0.7)' }}>Aujourd'hui</span>
                </div>
                <p className="text-[42px] font-black text-white leading-none anim-number-pop" key={kpis.today}>
                  {fmt(kpis.today)}
                </p>
                {kpis.delta !== null && (
                  <p className={`text-[13px] font-semibold mt-2 ${kpis.delta >= 0 ? 'text-ok' : 'text-danger'}`}>
                    {kpis.delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(kpis.delta))} vs hier
                  </p>
                )}
              </div>

              {/* peak */}
              <div
                className="rounded-2xl p-7"
                style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)' }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[18px]">🏆</span>
                  <span className="text-[12px] font-semibold" style={{ color: 'rgba(148,163,184,0.7)' }}>Record</span>
                </div>
                <p className="text-[42px] font-black text-white leading-none anim-number-pop" key={kpis.peak}>
                  {fmt(kpis.peak)}
                </p>
              </div>

              {/* avg */}
              <div
                className="rounded-2xl p-7"
                style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.12)' }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[18px]">📊</span>
                  <span className="text-[12px] font-semibold" style={{ color: 'rgba(148,163,184,0.7)' }}>Moyenne / jour</span>
                </div>
                <p className="text-[42px] font-black text-white leading-none anim-number-pop" key={kpis.avg}>
                  {fmt(kpis.avg)}
                </p>
              </div>
            </div>

            {/* ── 3 secondary stat chips ──────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-5 mt-5">
              {/* Active phones */}
              <div
                className="rounded-2xl px-6 py-5 flex items-center gap-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-[22px]">📱</span>
                <div>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: 'rgba(148,163,184,0.65)' }}>Téléphones actifs</p>
                  <p className="text-[22px] font-black text-white leading-none">
                    {kpis.activePhones}<span className="text-[14px] font-semibold ml-1" style={{ color: 'rgba(148,163,184,0.5)' }}>/ {phones.length}</span>
                  </p>
                </div>
              </div>

              {/* Banned */}
              <div
                className="rounded-2xl px-6 py-5 flex items-center gap-4"
                style={{
                  background: kpis.banned > 0 ? 'rgba(240,61,85,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${kpis.banned > 0 ? 'rgba(240,61,85,0.2)' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                <span className="text-[22px]">🚫</span>
                <div>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: 'rgba(148,163,184,0.65)' }}>Bannis / Erreur</p>
                  <p
                    className="text-[22px] font-black leading-none"
                    style={{ color: kpis.banned > 0 ? '#f03d55' : 'white' }}
                  >
                    {kpis.banned}
                  </p>
                </div>
              </div>

              {/* Videos (if selPhone) or IG accounts */}
              {selPhone ? (
                <div
                  className="rounded-2xl px-6 py-5 flex items-center gap-4"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <span className="text-[22px]">🎥</span>
                  <div>
                    <p className="text-[11px] font-semibold mb-1" style={{ color: 'rgba(148,163,184,0.65)' }}>Vidéos</p>
                    <p className="text-[22px] font-black text-white leading-none">{fmt(kpis.videos)}</p>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl px-6 py-5 flex items-center gap-4"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <span className="text-[22px]">📷</span>
                  <div>
                    <p className="text-[11px] font-semibold mb-1" style={{ color: 'rgba(148,163,184,0.65)' }}>Comptes IG liés</p>
                    <p className="text-[22px] font-black text-white leading-none">{linkedPhones.length}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Chart card ──────────────────────────────────────────────────── */}
            <div
              className="rounded-2xl p-8 mt-5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-[15px] font-bold text-white mb-7">Tendances des vues</p>
              {loadingChart ? (
                <div className="flex justify-center" style={{ height: 320 }}><Spinner /></div>
              ) : (
                <LineChart data={chartData} height={320} />
              )}
            </div>

            {/* ── Account chips (multi-account overview) ──────────────────────── */}
            {!selPhone && linkedPhones.length > 1 && (
              <div className="mt-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-3" style={{ color: 'rgba(139,92,246,0.5)' }}>
                  · Comptes
                </p>
                <div className="flex flex-wrap gap-2">
                  {linkedPhones.map(phone => {
                    const dotColor =
                      phone.ig_status === 'active'       ? '#00ccaa' :
                      phone.ig_status === 'error'        ? '#f03d55' :
                      phone.ig_status === 'rate_limited' ? '#ffaa2a' :
                      '#5a6882'
                    const initials = (phone.ig_username ?? phone.phone_name).slice(0, 2).toUpperCase()
                    return (
                      <button
                        key={phone.id}
                        onClick={() => setSelPhone(phone)}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                          style={{ background: avatarColor(phone.ig_username ?? phone.phone_name) }}
                        >
                          {initials}
                        </div>
                        <span className="text-[12px] font-semibold text-text">
                          {phone.phone_name.length > 18 ? phone.phone_name.slice(0, 18) + '…' : phone.phone_name}
                        </span>
                        <span className="relative w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }}>
                          {phone.ig_status === 'active' && (
                            <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: dotColor }} />
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
