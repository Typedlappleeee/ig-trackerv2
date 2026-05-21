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

function LineChart({ data, height = 260 }: { data: ViewPoint[]; height?: number }) {
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
      <div className="flex flex-col items-center justify-center gap-3 text-text2 text-sm" style={{ height }}>
        <span className="text-3xl opacity-30">📈</span>
        <span>Aucune donnée — actualisez l'onglet Téléphones d'abord</span>
      </div>
    )
  }

  const ml = 52, mr = 16, mt = 20, mb = 40
  const plotW = Math.max(w - ml - mr, 100)
  const plotH = height - mt - mb
  const max = Math.max(...data.map(d => d.value), 1)
  const labelStep = Math.max(1, Math.ceil(data.length / 10))

  const pts = data.map((d, i) => ({
    x: ml + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * plotW,
    y: mt + plotH - (d.value / max) * plotH,
  }))

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
          <linearGradient id="dash-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.28" />
            <stop offset="75%" stopColor="#8B5CF6" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dash-line-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map(i => {
          const y = mt + (plotH * i) / 4
          return (
            <g key={i}>
              <line x1={ml} y1={y} x2={ml + plotW} y2={y}
                stroke="rgba(139,92,246,0.07)" strokeDasharray="4 6" />
              <text x={ml - 8} y={y + 4} textAnchor="end"
                fill="#4B4B5E" fontSize="10" fontFamily="Inter,system-ui,sans-serif">
                {fmt(Math.round(max * (1 - i / 4)))}
              </text>
            </g>
          )
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#dash-area-grad)" />

        {/* Glow copy */}
        <path d={linePath} fill="none" stroke="#8B5CF6" strokeWidth="6"
          strokeOpacity="0.12" strokeLinecap="round" />

        {/* Main line */}
        <path d={linePath} fill="none" stroke="url(#dash-line-grad)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {pts.map((p, i) => {
          const isLast = i === pts.length - 1
          const isHov  = hover?.idx === i
          const show   = data.length <= 14 || isHov || isLast
          return show ? (
            <circle key={i} cx={p.x} cy={p.y}
              r={isHov ? 5 : isLast ? 4 : 3}
              fill={isLast ? '#A855F7' : '#8B5CF6'}
              stroke="#07070B" strokeWidth="2"
            />
          ) : null
        })}

        {/* Hover strips */}
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
            stroke="#8B5CF6" strokeWidth="1" strokeDasharray="3 4" opacity="0.4"
          />
        )}

        {/* X labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null
          return (
            <text key={i} x={pts[i].x} y={mt + plotH + 16}
              textAnchor="middle" fill="#4B4B5E" fontSize="10"
              fontFamily="Inter,system-ui,sans-serif">
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
              background: '#0E0E16',
              border: '1px solid rgba(139,92,246,0.35)',
              backdropFilter: 'blur(20px)',
              left: Math.min(Math.max(hoverPt.x - 80, ml), w - 172),
              top: Math.max(hoverPt.y - 76, 4),
              width: 164,
            }}
          >
            <p className="text-[11px] font-bold text-white mb-1.5">
              {d.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <p className="text-text2 text-[11px]">
              Vues : <span className="font-semibold text-[#c4b5fd]">{fmt(d.value)}</span>
            </p>
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
  const [fetchingStats, setFetchingStats] = useState(false)
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

      const withUsername = loaded.filter(p => p.ig_username)
      if (withUsername.length === 0) return
      setFetchingStats(true)
      const now = new Date().toISOString()
      const rows: { user_id: string; phone_id: string; views: number; recorded_at: string }[] = []
      for (const p of withUsername) {
        try {
          const stats = await fetchIgStats(p.ig_username!)
          if (stats && stats.total_views > 0)
            rows.push({ user_id: user.id, phone_id: p.id, views: stats.total_views, recorded_at: now })
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 800))
      }
      if (rows.length > 0)
        supabase.from('views_history').insert(rows).then(() => {})
      setFetchingStats(false)
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

    const maxByDayPhone = new Map<string, Map<string, number>>()
    for (const row of rows) {
      const day = dayKey(row.recorded_at)
      if (!maxByDayPhone.has(day)) maxByDayPhone.set(day, new Map())
      const phoneMap = maxByDayPhone.get(day)!
      const cur = phoneMap.get(row.phone_id) ?? 0
      phoneMap.set(row.phone_id, Math.max(cur, row.views as number))
    }
    const totalByDay = new Map<string, number>()
    for (const [day, phoneMap] of maxByDayPhone)
      totalByDay.set(day, [...phoneMap.values()].reduce((a, b) => a + b, 0))

    const sortedDays = [...totalByDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    const deltaByDay = new Map<string, number>()
    for (let i = 0; i < sortedDays.length; i++) {
      const [day, views] = sortedDays[i]
      deltaByDay.set(day, i === 0 ? 0 : Math.max(0, views - sortedDays[i - 1][1]))
    }

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

  const kpis = useMemo(() => {
    const today    = chartData.length > 0 ? chartData[chartData.length - 1].value : 0
    const prev     = chartData.length > 1 ? chartData[chartData.length - 2].value : null
    const delta    = prev !== null ? today - prev : null
    const deltaPct = prev && prev > 0 ? ((today - prev) / prev) * 100 : null
    const peak     = chartData.length > 0 ? Math.max(...chartData.map(p => p.value)) : 0
    const nonZero  = chartData.filter(p => p.value > 0)
    const avg      = nonZero.length > 0 ? Math.round(nonZero.reduce((s, p) => s + p.value, 0) / nonZero.length) : 0
    const linkedPhones = phones.filter(p => p.ig_username)
    const activePhones = linkedPhones.length
    const banned   = phones.filter(p => p.ig_status === 'error').length
    return { today, delta, deltaPct, peak, avg, activePhones, banned }
  }, [chartData, phones])

  const linkedPhones = phones.filter(p => p.ig_username)

  const RANGES: { key: Range; label: string }[] = [
    { key: '24h', label: '24h'  },
    { key: '7d',  label: '7j'   },
    { key: '30d', label: '30j'  },
    { key: 'all', label: 'Tout' },
  ]

  // Hour greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const firstName = user.email?.split('@')[0] ?? ''

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07070B' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-8 pt-7 pb-6 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-black text-white leading-none tracking-tight">
              {greeting}, <span style={{ color: '#c4b5fd' }}>{firstName}</span> 👋
            </h1>
            {fetchingStats && (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse inline-block" />
                Actualisation…
              </div>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6B7A' }}>
            Vue d'ensemble de tes performances Instagram
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Range pills */}
          <div className="flex gap-0.5 p-1 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  range === key ? 'text-white' : 'text-text2 hover:text-white hover:bg-white/[0.04]'
                }`}
                style={range === key ? {
                  background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)',
                  boxShadow: '0 1px 8px -2px rgba(124,58,237,0.55)',
                } : {}}
              >{label}</button>
            ))}
          </div>

          {/* Account selector */}
          {linkedPhones.length > 0 && (
            <div className="relative">
              <select
                value={selPhone?.id ?? ''}
                onChange={e => setSelPhone(linkedPhones.find(p => p.id === e.target.value) ?? null)}
                className="appearance-none outline-none pl-3 pr-8 py-2 rounded-xl text-[12px] font-semibold cursor-pointer"
                style={{
                  background: '#0E0E16',
                  border: '1px solid rgba(139,92,246,0.2)',
                  color: '#c4b5fd',
                }}
              >
                <option value="" style={{ background: '#0E0E16', color: '#e2e2f0' }}>Tous les comptes</option>
                {linkedPhones.map(p => (
                  <option key={p.id} value={p.id} style={{ background: '#0E0E16', color: '#e2e2f0' }}>
                    {p.ig_username ? `@${p.ig_username}` : p.phone_name}
                  </option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] pointer-events-none"
                style={{ color: 'rgba(196,181,253,0.4)' }}>▾</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 pb-10">

        {/* Schema warning */}
        {schemaMissing && (
          <div className="mt-6 rounded-xl p-4 space-y-3"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warn">Table <code>views_history</code> introuvable</p>
                <p className="text-xs text-text2 mt-0.5">
                  Va dans <strong className="text-text">Supabase → SQL Editor</strong>, colle le code ci-dessous et clique <strong className="text-text">Run</strong>.
                </p>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(SCHEMA_V3_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000) }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all"
                style={{ background: '#F59E0B', color: '#000' }}
              >
                {sqlCopied ? '✓ Copié' : '📋 Copier'}
              </button>
            </div>
            <pre className="text-[10px] font-mono text-text2 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap"
              style={{ background: '#0E0E16' }}>
              {SCHEMA_V3_SQL}
            </pre>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24"><Spinner /></div>
        ) : phones.length === 0 ? (

          /* ── Empty / onboarding state ─────────────────────────────────── */
          <div className="mt-10 rounded-2xl p-10 text-center space-y-7"
            style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl"
              style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.2),rgba(168,85,247,0.1))' }}>
              🚀
            </div>
            <div>
              <p className="text-lg font-black text-white">Bienvenue sur ScaleFlow</p>
              <p className="text-sm text-text2 mt-1">Suis ces étapes pour démarrer</p>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-left">
              {[
                { n: '1', title: 'Bearer Token',    desc: 'Configure ton token GéeLark dans Paramètres → Connexions' },
                { n: '2', title: 'Sync téléphones', desc: 'Va dans Téléphones et clique "Sync GéeLark"' },
                { n: '3', title: 'Ajoute Instagram', desc: 'Renseigne le nom d\'utilisateur IG sur chaque téléphone' },
                { n: '4', title: 'Lance le posting', desc: 'Utilise Posting ou Mass Posting pour publier' },
              ].map(step => (
                <div key={step.n} className="rounded-xl p-3 flex gap-3 items-start"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.1)' }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff' }}>{step.n}</span>
                  <div>
                    <p className="text-xs font-semibold text-white">{step.title}</p>
                    <p className="text-[11px] text-text2 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        ) : (
          <div className="space-y-5 mt-6 anim-stagger">

            {/* ── 4 KPI Cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-4">

              {/* Vues aujourd'hui */}
              <div className="stat-card card-glow rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                  style={{ background: 'radial-gradient(circle at top right, rgba(139,92,246,0.12) 0%, transparent 65%)' }} />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                    style={{ background: 'rgba(139,92,246,0.15)' }}>👁</div>
                  {kpis.delta !== null && (
                    <span className={`trend-chip ${kpis.delta >= 0 ? 'trend-up' : 'trend-down'}`}>
                      {kpis.delta >= 0 ? '▲' : '▼'} {kpis.deltaPct !== null ? `${Math.abs(kpis.deltaPct).toFixed(0)}%` : fmt(Math.abs(kpis.delta))}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#6B6B7A' }}>
                  Vues aujourd'hui{selPhone?.ig_username ? ` · @${selPhone.ig_username}` : ''}
                </p>
                <p className="text-[34px] font-black text-white leading-none kpi-value anim-number-pop" key={kpis.today}>
                  {fmt(kpis.today)}
                </p>
              </div>

              {/* Record */}
              <div className="stat-card card-glow rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                  style={{ background: 'radial-gradient(circle at top right, rgba(168,85,247,0.1) 0%, transparent 65%)' }} />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                    style={{ background: 'rgba(168,85,247,0.15)' }}>🏆</div>
                </div>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#6B6B7A' }}>Record</p>
                <p className="text-[34px] font-black text-white leading-none kpi-value">{fmt(kpis.peak)}</p>
              </div>

              {/* Moyenne */}
              <div className="stat-card card-glow rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                  style={{ background: 'radial-gradient(circle at top right, rgba(34,197,94,0.08) 0%, transparent 65%)' }} />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                    style={{ background: 'rgba(34,197,94,0.12)' }}>📈</div>
                </div>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#6B6B7A' }}>Moyenne / jour</p>
                <p className="text-[34px] font-black text-white leading-none kpi-value">{fmt(kpis.avg)}</p>
              </div>

              {/* Comptes actifs / bannés */}
              <div className="stat-card card-glow rounded-2xl p-5 relative overflow-hidden"
                style={kpis.banned > 0 ? { borderColor: 'rgba(239,68,68,0.25)' } : {}}>
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                  style={{ background: kpis.banned > 0
                    ? 'radial-gradient(circle at top right, rgba(239,68,68,0.1) 0%, transparent 65%)'
                    : 'radial-gradient(circle at top right, rgba(59,130,246,0.08) 0%, transparent 65%)' }} />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                    style={{ background: kpis.banned > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.12)' }}>
                    📱
                  </div>
                  {kpis.banned > 0 && (
                    <span className="trend-chip trend-down">{kpis.banned} bannis</span>
                  )}
                </div>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#6B6B7A' }}>Comptes actifs</p>
                <p className="text-[34px] font-black leading-none kpi-value"
                  style={{ color: kpis.banned > 0 ? '#EF4444' : 'white' }}>
                  {kpis.activePhones}
                  <span className="text-[16px] font-semibold ml-1.5" style={{ color: '#4B4B5E' }}>
                    / {phones.length}
                  </span>
                </p>
              </div>
            </div>

            {/* ── Chart card ───────────────────────────────────────────────── */}
            <div className="rounded-2xl p-6 card-glow"
              style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <p className="text-[14px] font-bold text-white">Tendances des vues</p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(139,92,246,0.1)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(139,92,246,0.15)' }}>
                    vues gagnées / jour
                  </span>
                </div>
                {loadingChart && (
                  <div className="flex items-center gap-1.5 text-[11px] text-text2">
                    <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                    Chargement…
                  </div>
                )}
              </div>
              {loadingChart ? (
                <div className="flex justify-center" style={{ height: 260 }}><Spinner /></div>
              ) : (
                <LineChart data={chartData} height={260} />
              )}
            </div>

            {/* ── Account chips ────────────────────────────────────────────── */}
            {!selPhone && linkedPhones.length > 1 && (
              <div className="rounded-2xl p-5 card-glow"
                style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.1)' }}>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3.5"
                  style={{ color: 'rgba(139,92,246,0.45)' }}>· Comptes</p>
                <div className="flex flex-wrap gap-2">
                  {linkedPhones.map(phone => {
                    const dotColor =
                      phone.ig_status === 'active'       ? '#22C55E' :
                      phone.ig_status === 'error'        ? '#EF4444' :
                      phone.ig_status === 'rate_limited' ? '#F59E0B' :
                      '#4B4B5E'
                    const handle   = phone.ig_username ?? phone.phone_name
                    const initials = handle.slice(0, 2).toUpperCase()
                    return (
                      <button
                        key={phone.id}
                        onClick={() => setSelPhone(phone)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.97]"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                          style={{ background: avatarColor(handle) }}>
                          {initials}
                        </div>
                        <span className="text-[12px] font-semibold text-white">
                          {phone.ig_username
                            ? `@${phone.ig_username.length > 16 ? phone.ig_username.slice(0, 16) + '…' : phone.ig_username}`
                            : phone.phone_name.length > 18 ? phone.phone_name.slice(0, 18) + '…' : phone.phone_name}
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

          </div>
        )}
      </div>
    </div>
  )
}
