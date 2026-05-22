import { useState, useEffect, useRef, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { Spinner } from '@/components/ui/Spinner'
import { fetchIgStats } from '@/lib/instagram'

interface DashboardProps { user: User; onNavigate?: (page: string) => void }

type Range = '24h' | '7d' | '30d' | 'all'
interface ViewPoint { label: string; value: number; date: Date }

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString('fr-FR')
}

// ─────────────────────────────────────────────────────────────────────────────
// Smooth area chart
// ─────────────────────────────────────────────────────────────────────────────
function LineChart({ data, height = 240, color = '#8B5CF6' }: { data: ViewPoint[]; height?: number; color?: string }) {
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
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <span className="text-xl opacity-50">📊</span>
        </div>
        <p className="text-[12px]">Aucune donnée — actualisez d'abord l'onglet Téléphones</p>
      </div>
    )
  }

  const ml = 48, mr = 16, mt = 16, mb = 36
  const plotW = Math.max(w - ml - mr, 100)
  const plotH = height - mt - mb
  const max = Math.max(...data.map(d => d.value), 1)
  const labelStep = Math.max(1, Math.ceil(data.length / 8))

  function smoothPath(pts: { x: number; y: number }[]) {
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`
    let d = `M${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(i + 2, pts.length - 1)]
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
    }
    return d
  }

  const pts = data.map((d, i) => ({
    x: ml + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * plotW,
    y: mt + plotH - (d.value / max) * plotH,
  }))
  const linePath = smoothPath(pts)
  const last = pts[pts.length - 1]
  const first = pts[0]
  const areaPath = `${linePath} L${last.x},${mt + plotH} L${first.x},${mt + plotH} Z`
  const hoverPt = hover !== null ? pts[hover.idx] : null

  return (
    <div ref={wrapRef} className="relative select-none" style={{ height }}>
      <svg width={w} height={height} className="block">
        <defs>
          <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="dash-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
          <filter id="dash-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const y = mt + plotH * frac
          return (
            <g key={i}>
              <line x1={ml} y1={y} x2={ml + plotW} y2={y} stroke="rgba(255,255,255,0.04)" />
              <text x={ml - 8} y={y + 4} textAnchor="end" fill="#52525B" fontSize="9.5" fontFamily="Inter,system-ui,sans-serif">
                {fmt(Math.round(max * (1 - frac)))}
              </text>
            </g>
          )
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#dash-area)" />

        {/* Glow line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="6" strokeOpacity="0.12" strokeLinecap="round" />

        {/* Main line */}
        <path d={linePath} fill="none" stroke="url(#dash-line)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Last dot always visible */}
        {pts.length > 0 && (
          <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r={4} fill="#A855F7" stroke="#07070B" strokeWidth="2" />
        )}

        {/* Hovered dot */}
        {hoverPt && hover !== null && (
          <>
            <line x1={hoverPt.x} y1={mt} x2={hoverPt.x} y2={mt + plotH}
              stroke="rgba(139,92,246,0.3)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hoverPt.x} cy={hoverPt.y} r={5} fill="#8B5CF6" stroke="#07070B" strokeWidth="2" />
          </>
        )}

        {/* Hover strips */}
        {pts.map((p, i) => (
          <rect key={i}
            x={i === 0 ? ml : (p.x + pts[i - 1].x) / 2}
            y={mt} height={plotH}
            width={i === 0
              ? pts.length > 1 ? (pts[1].x - p.x) / 2 : plotW
              : i === pts.length - 1 ? p.x - (p.x + pts[i - 1].x) / 2
              : (pts[i + 1].x - pts[i - 1].x) / 2}
            fill="transparent" style={{ cursor: 'crosshair' }}
            onMouseEnter={() => setHover({ idx: i })}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        {/* X labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null
          return (
            <text key={i} x={pts[i].x} y={mt + plotH + 22}
              textAnchor="middle" fill="#52525B" fontSize="9.5" fontFamily="Inter,system-ui,sans-serif">
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
        return (
          <div className="absolute pointer-events-none rounded-xl px-3 py-2.5 shadow-2xl"
            style={{
              background: 'rgba(14,14,22,0.95)', border: '1px solid rgba(139,92,246,0.3)',
              backdropFilter: 'blur(20px)',
              left: Math.min(Math.max(hoverPt.x - 70, ml), w - 148), top: Math.max(hoverPt.y - 72, 4), width: 140,
            }}>
            <p className="text-[10px] font-semibold text-text2 mb-1">
              {d.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <p className="text-[18px] font-black text-white leading-none">{fmt(d.value)}</p>
            {delta !== null && delta !== 0 && (
              <p className={`text-[11px] font-semibold mt-1 ${delta >= 0 ? 'text-ok' : 'text-danger'}`}>
                {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}
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

export function Dashboard({ user, onNavigate }: DashboardProps) {
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
    const peak     = chartData.length > 0 ? Math.max(...chartData.map(p => p.value)) : 0
    const nonZero  = chartData.filter(p => p.value > 0)
    const avg      = nonZero.length > 0 ? Math.round(nonZero.reduce((s, p) => s + p.value, 0) / nonZero.length) : 0
    const linkedPhones = phones.filter(p => p.ig_username)
    const activePhones = linkedPhones.length
    const online   = phones.filter(p => p.ig_status === 'active').length
    const banned   = phones.filter(p => p.ig_status === 'error').length
    const videos   = selPhone ? (selPhone.video_count ?? 0) : phones.reduce((s, p) => s + (p.video_count ?? 0), 0)
    return { today, delta, peak, avg, activePhones, online, banned, videos }
  }, [chartData, phones, selPhone])

  const linkedPhones = phones.filter(p => p.ig_username)
  const RANGES: { key: Range; label: string }[] = [
    { key: '24h', label: '24h' }, { key: '7d', label: '7j' },
    { key: '30d', label: '30j' }, { key: 'all', label: 'Tout' },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-8 pb-10 pt-7">

        {/* Schema migration notice */}
        {schemaMissing && (
          <div className="mb-6 rounded-xl p-4 flex items-start gap-3"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <span className="text-xl flex-shrink-0 mt-0.5">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-warn">Table <code className="font-mono text-xs">views_history</code> introuvable</p>
              <p className="text-xs text-text2 mt-1">Va dans <strong className="text-text">Supabase → SQL Editor</strong>, colle le SQL et clique <strong className="text-text">Run</strong>.</p>
              <button
                onClick={() => { navigator.clipboard.writeText(SCHEMA_V3_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000) }}
                className="mt-2 px-3 py-1 text-xs font-semibold rounded-lg transition-all"
                style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#FCD34D' }}>
                {sqlCopied ? '✓ Copié !' : '📋 Copier le SQL'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-32"><Spinner /></div>
        ) : phones.length === 0 ? (
          /* ── Empty / onboarding ─────────────────────────────────────────────── */
          <div className="max-w-xl mx-auto mt-16 text-center space-y-8">
            <div>
              <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center mb-5"
                style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.1))', border: '1px solid rgba(139,92,246,0.25)' }}>
                <span className="text-4xl">🚀</span>
              </div>
              <h2 className="text-2xl font-black text-white">Bienvenue sur ScaleFlow</h2>
              <p className="text-sm text-text2 mt-2">Suis ces étapes pour démarrer et scaler tes comptes Instagram</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-left">
              {[
                { n: '1', icon: '🔑', title: 'Bearer Token', desc: 'Configure ton token GéeLark dans Paramètres → Connexions' },
                { n: '2', icon: '📱', title: 'Sync téléphones', desc: 'Va dans Téléphones et clique "Sync GéeLark"' },
                { n: '3', icon: '📷', title: 'Ajoute Instagram', desc: 'Renseigne le nom d\'utilisateur IG sur chaque téléphone' },
                { n: '4', icon: '⚡', title: 'Lance le posting', desc: 'Utilise Posting ou Mass Posting pour publier en masse' },
              ].map(step => (
                <div key={step.n} className="rounded-xl p-4 flex gap-3 items-start sf-card">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff' }}>{step.n}</div>
                  <div>
                    <p className="text-xs font-bold text-white">{step.icon} {step.title}</p>
                    <p className="text-[11px] text-text2 mt-1 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">

            {/* ── Header row ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-[22px] font-black text-white leading-none">Dashboard</h1>
                  <p className="text-[12px] text-text2 mt-0.5">
                    {fetchingStats
                      ? <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />Actualisation des stats…</span>
                      : `${phones.length} téléphone${phones.length > 1 ? 's' : ''} · ${linkedPhones.length} compte${linkedPhones.length > 1 ? 's' : ''} IG`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Range pills */}
                <div className="flex gap-0.5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {RANGES.map(({ key, label }) => (
                    <button key={key} onClick={() => setRange(key)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        range === key ? 'text-white' : 'text-text2 hover:text-text'
                      }`}
                      style={range === key ? { background: 'linear-gradient(130deg,#7C3AED,#A855F7)', boxShadow: '0 0 12px -3px rgba(124,58,237,0.6)' } : {}}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Account selector */}
                {linkedPhones.length > 0 && (
                  <div className="relative">
                    <select
                      value={selPhone?.id ?? ''}
                      onChange={e => setSelPhone(linkedPhones.find(p => p.id === e.target.value) ?? null)}
                      className="appearance-none outline-none pl-3 pr-8 py-2 rounded-xl text-[12px] font-semibold cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#A78BFA' }}>
                      <option value="" style={{ background: '#0E0E16', color: '#fff' }}>Tous les comptes</option>
                      {linkedPhones.map(p => (
                        <option key={p.id} value={p.id} style={{ background: '#0E0E16', color: '#fff' }}>
                          {p.ig_username ? `@${p.ig_username}` : p.phone_name}
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] pointer-events-none text-text2">▾</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── 6 KPI cards ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
              {/* Vues aujourd'hui */}
              {(() => {
                const deltaPct = kpis.delta !== null && kpis.today > 0
                  ? Math.round((kpis.delta / Math.max(kpis.today - kpis.delta, 1)) * 100)
                  : null
                return (
                  <div className="sf-card rounded-2xl p-5 col-span-1 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none"
                      style={{ background: 'radial-gradient(ellipse at top right, rgba(139,92,246,0.15) 0%, transparent 70%)' }} />
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-text2">Vues aujourd'hui</p>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <span className="text-base">👁</span>
                      </div>
                    </div>
                    <p className="text-[36px] font-black text-white leading-none anim-number-pop" key={kpis.today}>
                      {fmt(kpis.today)}
                    </p>
                    {kpis.delta !== null && (
                      <div className={`flex items-center gap-1 mt-2 text-[11px] font-semibold ${kpis.delta >= 0 ? 'text-ok' : 'text-danger'}`}>
                        <span>{kpis.delta >= 0 ? '▲' : '▼'}</span>
                        <span>{fmt(Math.abs(kpis.delta))} vs hier</span>
                        {deltaPct !== null && <span className="font-normal text-text2">({deltaPct >= 0 ? '+' : ''}{deltaPct}%)</span>}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Record */}
              <div className="sf-card rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at top right, rgba(168,85,247,0.12) 0%, transparent 70%)' }} />
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text2">Record</p>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)' }}>
                    <span className="text-base">🏆</span>
                  </div>
                </div>
                <p className="text-[28px] font-black text-white leading-none">{fmt(kpis.peak)}</p>
                <p className="text-[11px] text-text2 mt-2">Meilleur jour sur la période</p>
              </div>

              {/* Moyenne */}
              <div className="sf-card rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at top right, rgba(59,130,246,0.1) 0%, transparent 70%)' }} />
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text2">Moyenne/jour</p>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <span className="text-base">📈</span>
                  </div>
                </div>
                <p className="text-[28px] font-black text-white leading-none">{fmt(kpis.avg)}</p>
                <p className="text-[11px] text-text2 mt-2">Vues gagnées par jour actif</p>
              </div>

              {/* Téléphones */}
              <div className="sf-card rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at top right, rgba(34,197,94,0.1) 0%, transparent 70%)' }} />
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text2">Téléphones</p>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <span className="text-base">📱</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-[28px] font-black text-white leading-none">{kpis.online}</p>
                  <p className="text-[14px] font-semibold text-text2">/ {phones.length}</p>
                </div>
                <p className="text-[11px] text-ok mt-2">actifs en ligne</p>
              </div>

              {/* Bannis */}
              <div className="sf-card rounded-2xl p-5 relative overflow-hidden"
                style={kpis.banned > 0 ? { borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' } : {}}>
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text2">Erreurs</p>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: kpis.banned > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <span className="text-base">🚫</span>
                  </div>
                </div>
                <p className="text-[28px] font-black leading-none" style={{ color: kpis.banned > 0 ? '#F87171' : '#fff' }}>
                  {kpis.banned}
                </p>
                <p className="text-[11px] mt-2" style={{ color: kpis.banned > 0 ? '#F87171' : '#52525B' }}>
                  {kpis.banned > 0 ? 'compte(s) en erreur ⚠' : 'aucun problème'}
                </p>
              </div>

              {/* Comptes IG / vidéos */}
              <div className="sf-card rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at top right, rgba(251,191,36,0.1) 0%, transparent 70%)' }} />
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text2">
                    {selPhone ? 'Vidéos' : 'Comptes IG'}
                  </p>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
                    <span className="text-base">{selPhone ? '🎥' : '📷'}</span>
                  </div>
                </div>
                <p className="text-[28px] font-black text-white leading-none">
                  {selPhone ? fmt(kpis.videos) : linkedPhones.length}
                </p>
                <p className="text-[11px] text-text2 mt-2">
                  {selPhone ? `vidéos postées sur @${selPhone.ig_username}` : 'comptes Instagram liés'}
                </p>
              </div>
            </div>

            {/* ── Chart card ─────────────────────────────────────────────────── */}
            <div className="sf-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-[14px] font-bold text-white">Tendances des vues</h3>
                  <p className="text-[11px] text-text2 mt-0.5">Vues gagnées par jour · {range === '24h' ? '24 dernières heures' : range === '7d' ? '7 derniers jours' : range === '30d' ? '30 derniers jours' : 'Tout l\'historique'}</p>
                </div>
                {selPhone && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <span className="text-[11px] font-semibold" style={{ color: '#A78BFA' }}>@{selPhone.ig_username}</span>
                    <button onClick={() => setSelPhone(null)} className="text-text2 hover:text-text transition-colors text-xs ml-1">✕</button>
                  </div>
                )}
              </div>
              {loadingChart ? (
                <div className="flex items-center justify-center" style={{ height: 240 }}><Spinner /></div>
              ) : (
                <LineChart data={chartData} height={240} />
              )}
            </div>

            {/* ── Quick actions + Phone overview ─────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">

              {/* Quick actions */}
              <div className="sf-card rounded-2xl p-5">
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-text2 mb-4">Actions rapides</h3>
                <div className="space-y-2">
                  {[
                    { icon: '🚀', label: 'Nouveau Post', sub: 'Publier sur des comptes', page: 'posting', color: '#8B5CF6' },
                    { icon: '⚡', label: 'Mass Posting', sub: 'Lancer une campagne', page: 'massposting', color: '#A855F7' },
                    { icon: '📅', label: 'Programmer', sub: 'Planifier des posts', page: 'scheduler', color: '#3B82F6' },
                    { icon: '🔥', label: 'Warmup', sub: 'Chauffer les comptes', page: 'warmup', color: '#F59E0B' },
                  ].map(action => (
                    <button key={action.page}
                      onClick={() => onNavigate?.(action.page)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] group"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-110"
                        style={{ background: `${action.color}18`, border: `1px solid ${action.color}30` }}>
                        <span className="text-sm">{action.icon}</span>
                      </div>
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-white">{action.label}</p>
                        <p className="text-[10px] text-text2">{action.sub}</p>
                      </div>
                      <span className="text-text2 text-xs opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone status overview */}
              <div className="sf-card rounded-2xl p-5 col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-text2">État des téléphones</h3>
                  <button onClick={() => onNavigate?.('phones')} className="text-[11px] font-semibold transition-all hover:opacity-80"
                    style={{ color: '#8B5CF6' }}>Voir tout →</button>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {phones.slice(0, 8).map(phone => {
                    const statusColor = phone.ig_status === 'active' ? '#22C55E' : phone.ig_status === 'error' ? '#EF4444' : phone.ig_status === 'rate_limited' ? '#F59E0B' : '#71717A'
                    const statusLabel = phone.ig_status === 'active' ? 'Actif' : phone.ig_status === 'error' ? 'Erreur' : phone.ig_status === 'rate_limited' ? 'Limité' : 'Inconnu'
                    return (
                      <div key={phone.id}
                        onClick={() => { setSelPhone(phone.ig_username ? phone : null) }}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all hover:bg-white/[0.04] ${selPhone?.id === phone.id ? 'bg-white/[0.05]' : ''}`}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0"
                          style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}30` }}>
                          📱
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-white truncate">{phone.phone_name}</p>
                          {phone.ig_username && <p className="text-[10px] text-text2 truncate">@{phone.ig_username}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: statusColor }}>
                            {phone.ig_status === 'active' && (
                              <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: statusColor }} />
                            )}
                          </span>
                          <span className="text-[10px] font-medium" style={{ color: statusColor }}>{statusLabel}</span>
                        </div>
                      </div>
                    )
                  })}
                  {phones.length > 8 && (
                    <p className="text-center text-[11px] text-text2 pt-1">+{phones.length - 8} autres</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Account chips ───────────────────────────────────────────────── */}
            {!selPhone && linkedPhones.length > 1 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-3 text-text3">· Filtrer par compte</p>
                <div className="flex flex-wrap gap-2">
                  {linkedPhones.map(phone => {
                    const dotColor = phone.ig_status === 'active' ? '#22C55E' : phone.ig_status === 'error' ? '#EF4444' : phone.ig_status === 'rate_limited' ? '#F59E0B' : '#71717A'
                    return (
                      <button key={phone.id} onClick={() => setSelPhone(phone)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <span className="relative w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }}>
                          {phone.ig_status === 'active' && (
                            <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: dotColor }} />
                          )}
                        </span>
                        <span className="text-[11px] font-semibold text-text">
                          @{phone.ig_username ?? phone.phone_name}
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
