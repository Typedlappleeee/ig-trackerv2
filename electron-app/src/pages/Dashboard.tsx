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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#07070C', overflow: 'hidden' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F2F0FF', letterSpacing: '-0.04em', lineHeight: 1.15, margin: 0 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.45)', marginTop: 4, margin: '4px 0 0' }}>
            {fetchingStats
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="sf-ping-dot" style={{ background: '#8B5CF6' }} />
                  Actualisation des stats…
                </span>
              : 'Vue d\'ensemble de tes performances'
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Range selector pills */}
          <div style={{ display: 'flex', gap: 3, padding: '3px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
            {RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                style={{
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  border: range === key ? '1px solid rgba(139,92,246,0.25)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 160ms',
                  fontFamily: 'inherit',
                  background: range === key ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
                  color: range === key ? '#A78BFA' : 'rgba(148,163,184,0.52)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Account selector */}
          {linkedPhones.length > 0 && (
            <div style={{ position: 'relative' }}>
              <select
                value={selPhone?.id ?? ''}
                onChange={e => setSelPhone(linkedPhones.find(p => p.id === e.target.value) ?? null)}
                style={{
                  appearance: 'none',
                  outline: 'none',
                  paddingLeft: 12,
                  paddingRight: 30,
                  height: 32,
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: '#A78BFA',
                  fontFamily: 'inherit',
                  transition: 'border-color 150ms',
                }}
              >
                <option value="" style={{ background: '#0E0E16', color: '#fff' }}>Tous les comptes</option>
                {linkedPhones.map(p => (
                  <option key={p.id} value={p.id} style={{ background: '#0E0E16', color: '#fff' }}>
                    {p.ig_username ? `@${p.ig_username}` : p.phone_name}
                  </option>
                ))}
              </select>
              <svg style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

        {/* Schema migration notice */}
        {schemaMissing && (
          <div style={{ marginBottom: 20, borderRadius: 11, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#F59E0B', margin: 0 }}>Table <code style={{ fontFamily: 'monospace', fontSize: 11 }}>views_history</code> introuvable</p>
              <p style={{ fontSize: 12, color: 'rgba(196,181,253,0.72)', marginTop: 4, margin: '4px 0 0' }}>Va dans <strong style={{ color: '#F2F0FF' }}>Supabase → SQL Editor</strong>, colle le SQL et clique <strong style={{ color: '#F2F0FF' }}>Run</strong>.</p>
              <button
                onClick={() => { navigator.clipboard.writeText(SCHEMA_V3_SQL); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000) }}
                style={{ marginTop: 8, padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#FCD34D', fontFamily: 'inherit', transition: 'all 140ms' }}>
                {sqlCopied ? 'Copié !' : 'Copier le SQL'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          /* ── Skeleton loading state ───────────────────────────────────────── */
          <div className="sf-anim-slide-up">
            {/* Skeleton stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '20px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div className="sf-skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
                    <div className="sf-skeleton" style={{ width: 52, height: 20, borderRadius: 99 }} />
                  </div>
                  <div className="sf-skeleton" style={{ width: 72, height: 28, borderRadius: 6, marginBottom: 8 }} />
                  <div className="sf-skeleton" style={{ width: 110, height: 11, borderRadius: 4 }} />
                </div>
              ))}
            </div>
            {/* Skeleton chart */}
            <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '20px 24px', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div className="sf-skeleton" style={{ width: 140, height: 14, borderRadius: 5, marginBottom: 8 }} />
                  <div className="sf-skeleton" style={{ width: 200, height: 11, borderRadius: 4 }} />
                </div>
              </div>
              <div className="sf-skeleton" style={{ width: '100%', height: 220, borderRadius: 10 }} />
            </div>
            {/* Skeleton phone rows */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>
              <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
                  <div className="sf-skeleton" style={{ width: 90, height: 13, borderRadius: 4 }} />
                </div>
                <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[0, 1].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 4px' }}>
                      <div className="sf-skeleton" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="sf-skeleton" style={{ width: '55%', height: 13, borderRadius: 4, marginBottom: 5 }} />
                        <div className="sf-skeleton" style={{ width: '35%', height: 10, borderRadius: 3 }} />
                      </div>
                      <div className="sf-skeleton" style={{ width: 48, height: 20, borderRadius: 99 }} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="sf-skeleton" style={{ borderRadius: 15, height: 180 }} />
                <div className="sf-skeleton" style={{ borderRadius: 15, height: 160 }} />
              </div>
            </div>
          </div>
        ) : phones.length === 0 ? (
          /* ── Empty / onboarding ─────────────────────────────────────────────── */
          <div className="sf-anim-slide-up" style={{ maxWidth: 520, margin: '64px auto 0', textAlign: 'center' }}>
            <div className="sf-anim-scale-spring" style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.1))', border: '1px solid rgba(139,92,246,0.25)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="sf-gradient-text" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>Bienvenue sur ScaleFlow</h2>
            <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.52)', marginTop: 8 }}>Suis ces étapes pour démarrer et scaler tes comptes Instagram</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 28, textAlign: 'left' }}>
              {[
                { n: '1', title: 'Bearer Token', desc: 'Configure ton token GéeLark dans Paramètres → Connexions', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
                { n: '2', title: 'Sync téléphones', desc: 'Va dans Téléphones et clique "Sync GéeLark"', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
                { n: '3', title: 'Ajoute Instagram', desc: "Renseigne le nom d'utilisateur IG sur chaque téléphone", icon: 'M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zm1.5-4.87h.01' },
                { n: '4', title: 'Lance le posting', desc: 'Utilise Posting ou Mass Posting pour publier en masse', icon: 'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z' },
              ].map((step, idx) => (
                <div key={step.n} className={`sf-hover-lift sf-anim-slide-up sf-d${(idx + 1) * 50}`} style={{ borderRadius: 12, padding: '16px', display: 'flex', gap: 12, alignItems: 'flex-start', background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff' }}>{step.n}</div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#F2F0FF', margin: 0 }}>{step.title}</p>
                    <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.52)', marginTop: 4, lineHeight: 1.5 }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="sf-anim-slide-up">
            {/* ── Stats grid — 4 cards across ─────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>

              {/* Card 1: Téléphones */}
              <div className="sf-stat-card sf-anim-slide-up sf-d50">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(124,58,237,0.12)', color: '#A78BFA', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{kpis.online} actifs</span>
                </div>
                <div>
                  <p className="sf-anim-count-up sf-d100" style={{ fontSize: 30, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.04em', lineHeight: 1, margin: 0 }}>{phones.length}</p>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(100,116,139,0.5)', marginTop: 6, margin: '6px 0 0' }}>Téléphones actifs</p>
                </div>
              </div>

              {/* Card 2: Comptes IG */}
              <div className="sf-stat-card sf-anim-slide-up sf-d100">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                    </svg>
                  </div>
                  {linkedPhones.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(59,130,246,0.1)', color: '#60A5FA', letterSpacing: '0.04em', textTransform: 'uppercase' }}>liés</span>
                  )}
                </div>
                <div>
                  <p className="sf-anim-count-up sf-d150" style={{ fontSize: 30, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.04em', lineHeight: 1, margin: 0 }}>{linkedPhones.length}</p>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(100,116,139,0.5)', marginTop: 6, margin: '6px 0 0' }}>Comptes Instagram</p>
                </div>
              </div>

              {/* Card 3: Vues aujourd'hui */}
              <div className="sf-stat-card sf-anim-slide-up sf-d150">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  </div>
                  {kpis.delta !== null && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: kpis.delta >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: kpis.delta >= 0 ? '#22C55E' : '#EF4444', letterSpacing: '0.04em' }}>
                      {kpis.delta >= 0 ? '+' : ''}{fmt(kpis.delta)}
                    </span>
                  )}
                </div>
                <div>
                  <p className="sf-anim-count-up sf-d200" style={{ fontSize: 30, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.04em', lineHeight: 1, margin: 0 }}>{fmt(kpis.today)}</p>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(100,116,139,0.5)', marginTop: 6, margin: '6px 0 0' }}>Vues aujourd'hui</p>
                </div>
              </div>

              {/* Card 4: Record de vues / Erreurs */}
              <div className={`sf-stat-card sf-anim-slide-up sf-d200${kpis.banned > 0 ? ' danger-card' : ''}`}
                style={{ borderColor: kpis.banned > 0 ? 'rgba(239,68,68,0.22)' : undefined }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: kpis.banned > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(124,58,237,0.08)', border: `1px solid ${kpis.banned > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={kpis.banned > 0 ? '#F87171' : '#A78BFA'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                  {kpis.banned > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#EF4444', letterSpacing: '0.04em' }}>{kpis.banned} erreur{kpis.banned > 1 ? 's' : ''}</span>
                  )}
                </div>
                <div>
                  <p className="sf-anim-count-up sf-d250" style={{ fontSize: 30, fontWeight: 800, color: kpis.banned > 0 ? '#F87171' : '#F2F0FF', letterSpacing: '-0.04em', lineHeight: 1, margin: 0 }}>{fmt(kpis.peak)}</p>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(100,116,139,0.5)', marginTop: 6, margin: '6px 0 0' }}>Record de vues</p>
                </div>
              </div>
            </div>

            {/* ── Chart section — glassmorphism card ───────────────────────────── */}
            <div style={{ position: 'relative', background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '20px 24px', marginBottom: 24, overflow: 'hidden' }}>
              {/* Subtle top gradient line */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.3), transparent)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', letterSpacing: '-0.025em', margin: 0 }}>Évolution des vues</p>
                  <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', marginTop: 3, margin: '3px 0 0' }}>
                    Total vues
                    {selPhone && <span style={{ color: '#A78BFA', marginLeft: 6 }}>· @{selPhone.ig_username}</span>}
                    <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 99, background: 'rgba(139,92,246,0.1)', color: '#A78BFA', fontSize: 11, fontWeight: 600 }}>
                      {RANGES.find(r => r.key === range)?.label}
                    </span>
                  </p>
                </div>
                {selPhone && (
                  <button
                    onClick={() => setSelPhone(null)}
                    style={{ fontSize: 12, color: 'rgba(167,139,250,0.7)', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 140ms' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.14)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.32)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.18)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    Réinitialiser
                  </button>
                )}
              </div>
              <div style={{ paddingTop: 16 }}>
                {loadingChart ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220 }}>
                    <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#8B5CF6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  </div>
                ) : (
                  <LineChart data={chartData} height={220} color="#8B5CF6" />
                )}
              </div>
            </div>

            {/* ── Bottom split: phone list left, activity right ─────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>

              {/* Phone list */}
              <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(100,116,139,0.5)', margin: 0 }}>Téléphones</p>
                  <button
                    onClick={() => onNavigate?.('phones')}
                    style={{ fontSize: 12, color: '#A78BFA', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.8, transition: 'opacity 140ms' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8' }}
                  >
                    Voir tout
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto', padding: '6px 8px' }}>
                  {phones.slice(0, 8).map(phone => {
                    const isActive = phone.ig_status === 'active'
                    const statusColor = isActive ? '#22C55E' : phone.ig_status === 'error' ? '#EF4444' : phone.ig_status === 'rate_limited' ? '#F59E0B' : 'rgba(100,116,139,0.4)'
                    const statusLabel = isActive ? 'Actif' : phone.ig_status === 'error' ? 'Erreur' : phone.ig_status === 'rate_limited' ? 'Limité' : 'Inconnu'
                    const isSelected = selPhone?.id === phone.id
                    return (
                      <div
                        key={phone.id}
                        onClick={() => setSelPhone(phone.ig_username ? phone : null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          height: 44,
                          padding: '0 12px',
                          borderRadius: 9,
                          cursor: 'pointer',
                          transition: 'background 120ms, border-color 120ms',
                          background: isSelected ? 'rgba(124,58,237,0.08)' : 'transparent',
                          border: isSelected ? '1px solid rgba(139,92,246,0.15)' : '1px solid transparent',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        {/* Status dot — ping for online */}
                        {isActive
                          ? <span className="sf-ping-dot" style={{ flexShrink: 0 }} />
                          : <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                        }
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#F2F0FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{phone.phone_name}</p>
                          {phone.ig_username && (
                            <p style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.45)', marginTop: 1, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{phone.ig_username}</p>
                          )}
                        </div>
                        {/* Followers */}
                        {(phone.followers ?? 0) > 0 && (
                          <p style={{ fontSize: 12, color: 'rgba(196,181,253,0.6)', fontWeight: 600, flexShrink: 0, margin: 0 }}>{fmt(phone.followers ?? 0)}</p>
                        )}
                        {/* IG status badge */}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: `${statusColor}18`, color: statusColor, flexShrink: 0, letterSpacing: '0.03em' }}>{statusLabel}</span>
                      </div>
                    )
                  })}
                  {phones.length > 8 && (
                    <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(148,163,184,0.35)', padding: '10px 0 4px' }}>+{phones.length - 8} autres</p>
                  )}
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* IG status breakdown — 2x2 mini cards */}
                <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '16px 18px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(100,116,139,0.5)', marginBottom: 12, margin: '0 0 12px' }}>Statut Instagram</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Actifs', count: phones.filter(p => p.ig_status === 'active').length, color: '#22C55E', bg: 'rgba(34,197,94,0.07)' },
                      { label: 'Erreurs', count: phones.filter(p => p.ig_status === 'error').length, color: '#EF4444', bg: 'rgba(239,68,68,0.07)' },
                      { label: 'Limités', count: phones.filter(p => p.ig_status === 'rate_limited').length, color: '#F59E0B', bg: 'rgba(245,158,11,0.07)' },
                      { label: 'Inconnus', count: phones.filter(p => !p.ig_status).length, color: 'rgba(100,116,139,0.6)', bg: 'rgba(100,116,139,0.05)' },
                    ].map(({ label, count, color, bg }) => (
                      <div key={label} style={{ background: bg, borderRadius: 9, padding: '10px 12px', borderLeft: `2px solid ${color}` }}>
                        <p style={{ fontSize: 18, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>{count}</p>
                        <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions rapides */}
                <div style={{ background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 15, padding: '16px 18px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(100,116,139,0.5)', marginBottom: 10, margin: '0 0 10px' }}>Actions rapides</p>
                  {[
                    { label: 'Poster un Reel', page: 'posting', icon: 'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z' },
                    { label: 'Mass Posting', page: 'massposting', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                    { label: 'Programmer', page: 'scheduler', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  ].map(({ label, page, icon }) => (
                    <button
                      key={page}
                      onClick={() => onNavigate?.(page as any)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 14px', borderRadius: 10, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(139,92,246,0.15)', cursor: 'pointer', marginBottom: 8, transition: 'all 150ms', fontFamily: 'inherit' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.14)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.28)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 18px -6px rgba(124,58,237,0.35)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.15)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <path d={icon} />
                        </svg>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(196,181,253,0.8)', flex: 1, textAlign: 'left' }}>{label}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
