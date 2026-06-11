/**
 * Stats — tableau de bord des comptes Instagram.
 *
 * « Temps réel » contre la base : la page s'abonne en Supabase Realtime sur
 * `phones` — dès que le collecteur (igStatsPoller) écrit une mise à jour,
 * l'UI se rafraîchit instantanément. La collecte elle-même est étalée
 * (1 compte / ~20 s) pour ne jamais déclencher les rate-limits Instagram.
 * Les courbes viennent de `account_stats_history` (snapshots horaires).
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { pollAllNow } from '@/lib/igStatsPoller'
import {
  ACCENT, ACCENT_L, TEXT_1, TEXT_2, TEXT_3, HAIR, BG_1, OK, ERR, SANS,
} from '@/lib/theme'

interface Snapshot {
  phone_id:    string
  followers:   number
  total_views: number
  recorded_at: string
}

type SortKey = 'followers' | 'total_views' | 'posts' | 'name'
type Period  = 7 | 30

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1).replace('.0', '')}k`
  : String(n)

const fmtDelta = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '—')

// ── SVG area chart ────────────────────────────────────────────────────────────
function AreaChart({ points, height = 180 }: { points: { t: number; v: number }[]; height?: number }) {
  const W = 720, H = height, PAD = 6
  if (points.length < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 12, color: TEXT_3, fontFamily: SANS, textAlign: 'center', lineHeight: 1.6 }}>
          Pas encore assez d'historique.<br />
          Les courbes apparaissent après quelques heures de collecte.
        </p>
      </div>
    )
  }
  const minT = points[0].t, maxT = points[points.length - 1].t
  const vs = points.map(p => p.v)
  const minV = Math.min(...vs), maxV = Math.max(...vs)
  const spanV = maxV - minV || 1
  const x = (t: number) => PAD + ((t - minT) / (maxT - minT || 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - minV) / spanV) * (H - PAD * 2 - 14)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(maxT).toFixed(1)},${H - PAD} L${x(minT).toFixed(1)},${H - PAD} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id="stats-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#stats-area)" />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* dernier point */}
      <circle cx={x(maxT)} cy={y(points[points.length - 1].v)} r="3.5" fill={ACCENT_L} />
      {/* min / max labels */}
      <text x={PAD + 2} y={12} fontSize="10" fill="rgba(233,234,240,0.35)" fontFamily={SANS}>{fmt(maxV)}</text>
      <text x={PAD + 2} y={H - PAD - 4} fontSize="10" fill="rgba(233,234,240,0.35)" fontFamily={SANS}>{fmt(minV)}</text>
    </svg>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function Kpi({ label, value, delta, accent }: { label: string; value: string; delta?: number; accent?: boolean }) {
  return (
    <div style={{
      flex: 1, minWidth: 150, padding: '16px 20px',
      background: BG_1, border: `1px solid ${accent ? 'rgba(99,102,241,0.22)' : HAIR}`,
      borderRadius: 10,
    }}>
      <p style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
        color: TEXT_2, margin: '0 0 10px', fontFamily: SANS,
      }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <p style={{
          fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em',
          color: accent ? ACCENT_L : TEXT_1, margin: 0, lineHeight: 1, fontFamily: SANS,
        }}>{value}</p>
        {delta !== undefined && delta !== 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: delta > 0 ? OK : ERR, fontFamily: SANS }}>
            {fmtDelta(delta)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string | null }) {
  const color = status === 'active' ? OK : status === 'expired' ? '#FBBF24' : status === 'error' ? ERR : 'rgba(233,234,240,0.18)'
  const label = status === 'active' ? 'Actif' : status === 'expired' ? 'Session expirée' : status === 'error' ? 'Erreur' : 'Inconnu'
  const hint  = status === 'error'
    ? 'Fetch impossible — vérifie que le pseudo existe (sans @, sans faute), ou extrais la session depuis le téléphone (page Téléphones) pour un fetch fiable.'
    : label
  return (
    <span title={hint} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: TEXT_2 }}>{label}</span>
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Stats({ user }: { user: User }) {
  const { currentOrg } = useOrg()
  const [phones, setPhones]   = useState<Phone[]>([])
  const [history, setHistory] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]   = useState<Period>(7)
  const [sortKey, setSortKey] = useState<SortKey>('followers')
  const [sortDesc, setSortDesc] = useState(true)
  const [search, setSearch]   = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function forceRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try { await pollAllNow() } finally { setRefreshing(false) }
    // le Realtime sur `phones` recharge déjà la liste à chaque écriture
  }

  const load = useCallback(async () => {
    let q = supabase.from('phones').select('*').order('followers', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString()
    const [phonesRes, histRes] = await Promise.all([
      q,
      supabase.from('account_stats_history')
        .select('phone_id, followers, total_views, recorded_at')
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .limit(5000),
    ])
    setPhones((phonesRes.data ?? []) as Phone[])
    setHistory((histRes.data ?? []) as Snapshot[])  // table absente → [] (erreur silencieuse)
    setLoading(false)
  }, [currentOrg?.id, user.id, period])

  useEffect(() => { setLoading(true); load() }, [load])

  // Live : le collecteur écrit phones → la page se met à jour instantanément
  useEffect(() => {
    const ch = supabase.channel('stats-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'phones' }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // ── Agrégats ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    followers: phones.reduce((s, p) => s + (p.followers ?? 0), 0),
    views:     phones.reduce((s, p) => s + (p.total_views ?? 0), 0),
    posts:     phones.reduce((s, p) => s + (p.video_count ?? 0), 0),
    active:    phones.filter(p => p.ig_status === 'active').length,
  }), [phones])

  // Courbe : somme des followers par jour (dernier snapshot de chaque compte par jour)
  const chartPoints = useMemo(() => {
    if (history.length === 0) return []
    const byDay = new Map<string, Map<string, number>>()   // day → phone_id → followers (dernier)
    for (const s of history) {
      const day = s.recorded_at.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, new Map())
      byDay.get(day)!.set(s.phone_id, s.followers)
    }
    // Report des comptes absents un jour donné : on garde la dernière valeur connue
    const days = [...byDay.keys()].sort()
    const lastKnown = new Map<string, number>()
    const points: { t: number; v: number }[] = []
    for (const day of days) {
      for (const [pid, v] of byDay.get(day)!) lastKnown.set(pid, v)
      let sum = 0
      for (const v of lastKnown.values()) sum += v
      points.push({ t: new Date(day).getTime(), v: sum })
    }
    return points
  }, [history])

  // Delta par compte sur la période (premier vs dernier snapshot)
  const deltas = useMemo(() => {
    const first = new Map<string, number>()
    const last  = new Map<string, number>()
    for (const s of history) {
      if (!first.has(s.phone_id)) first.set(s.phone_id, s.followers)
      last.set(s.phone_id, s.followers)
    }
    const d = new Map<string, number>()
    for (const [pid, l] of last) d.set(pid, l - (first.get(pid) ?? l))
    return d
  }, [history])

  const totalDelta = useMemo(
    () => [...deltas.values()].reduce((s, v) => s + v, 0),
    [deltas],
  )

  // ── Tri + recherche ────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    let rows = phones
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        p.ig_username?.toLowerCase().includes(q) || p.phone_name?.toLowerCase().includes(q))
    }
    const dir = sortDesc ? -1 : 1
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return dir * (a.ig_username ?? a.phone_name ?? '').localeCompare(b.ig_username ?? b.phone_name ?? '')
      const ka = sortKey === 'posts' ? (a.video_count ?? 0) : (a[sortKey] ?? 0)
      const kb = sortKey === 'posts' ? (b.video_count ?? 0) : (b[sortKey] ?? 0)
      return dir * (ka - kb)
    })
  }, [phones, search, sortKey, sortDesc])

  function clickSort(k: SortKey) {
    if (sortKey === k) setSortDesc(d => !d)
    else { setSortKey(k); setSortDesc(true) }
  }

  const th = (label: string, k: SortKey, align: 'left' | 'right' = 'right') => (
    <th
      onClick={() => clickSort(k)}
      style={{
        padding: '10px 14px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: sortKey === k ? ACCENT_L : TEXT_2,
        textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
      }}
    >
      {label}{sortKey === k ? (sortDesc ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div style={{ minHeight: '100%', padding: '36px 44px 80px', boxSizing: 'border-box', fontFamily: SANS }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 26 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: TEXT_1 }}>
              Statistiques
            </h1>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: TEXT_2 }}>
              Mise à jour en continu — un compte est rafraîchi toutes les ~20 secondes.
            </p>
          </div>
          {/* Refresh + period toggle */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={forceRefresh}
              disabled={refreshing}
              title="Force la collecte immédiate de tous les comptes (sinon rotation automatique ~20 s/compte)"
              style={{
                padding: '7px 14px', borderRadius: 7, cursor: refreshing ? 'wait' : 'pointer',
                fontSize: 12, fontWeight: 600,
                background: 'rgba(99,102,241,0.14)',
                border: '1px solid rgba(99,102,241,0.4)',
                color: ACCENT_L, opacity: refreshing ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >{refreshing ? 'Collecte…' : '↻ Actualiser'}</button>
            {([7, 30] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '7px 14px', borderRadius: 7, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: period === p ? 'rgba(99,102,241,0.14)' : 'transparent',
                  border: `1px solid ${period === p ? 'rgba(99,102,241,0.4)' : HAIR}`,
                  color: period === p ? ACCENT_L : TEXT_2,
                  transition: 'all 0.15s',
                }}
              >{p} jours</button>
            ))}
          </div>
        </div>

        {/* ── KPIs ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <Kpi label="Followers totaux" value={loading ? '…' : fmt(totals.followers)} delta={totalDelta} accent />
          <Kpi label="Vues totales"     value={loading ? '…' : fmt(totals.views)} />
          <Kpi label="Posts"            value={loading ? '…' : fmt(totals.posts)} />
          <Kpi label="Comptes actifs"   value={loading ? '…' : `${totals.active}/${phones.length}`} />
        </div>

        {/* ── Chart ──────────────────────────────────────────────────────── */}
        <div style={{
          background: BG_1, border: `1px solid ${HAIR}`, borderRadius: 10,
          padding: '16px 18px 10px', marginBottom: 18,
        }}>
          <p style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: TEXT_2, margin: '0 0 12px',
          }}>Followers cumulés — {period} jours</p>
          <AreaChart points={chartPoints} />
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div style={{ background: BG_1, border: `1px solid ${HAIR}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            padding: '12px 14px', borderBottom: `1px solid ${HAIR}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_1 }}>
              Comptes ({visible.length})
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un compte…"
              style={{
                height: 30, padding: '0 12px', fontSize: 12, width: 220,
                background: 'rgba(233,234,240,0.03)', border: `1px solid ${HAIR}`,
                borderRadius: 7, color: TEXT_1, outline: 'none', fontFamily: SANS,
              }}
            />
          </div>

          {loading ? (
            <p style={{ padding: '28px 16px', fontSize: 12, color: TEXT_3, textAlign: 'center' }}>Chargement…</p>
          ) : visible.length === 0 ? (
            <p style={{ padding: '28px 16px', fontSize: 12.5, color: TEXT_3, textAlign: 'center' }}>
              Aucun compte. Synchronise tes téléphones GéeLark et renseigne le pseudo Instagram de chaque compte — pas besoin de session.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
                    {th('Compte', 'name', 'left')}
                    {th('Followers', 'followers')}
                    <th style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_2, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      Δ {period} j
                    </th>
                    {th('Vues', 'total_views')}
                    {th('Posts', 'posts')}
                    <th style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_2, textAlign: 'left' }}>
                      Statut
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p, i) => {
                    const delta = deltas.get(p.id) ?? 0
                    return (
                      <tr key={p.id} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${HAIR}` : 'none' }}>
                        <td style={{ padding: '11px 14px' }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT_1 }}>
                            {p.ig_username ? `@${p.ig_username}` : p.phone_name}
                          </p>
                          {p.ig_username && (
                            <p style={{ margin: '1px 0 0', fontSize: 10.5, color: TEXT_3 }}>{p.phone_name}</p>
                          )}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: TEXT_1, fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(p.followers ?? 0)}
                        </td>
                        <td style={{
                          padding: '11px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700,
                          color: delta > 0 ? OK : delta < 0 ? ERR : TEXT_3, fontVariantNumeric: 'tabular-nums',
                        }}>
                          {fmtDelta(delta)}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12.5, color: TEXT_2, fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(p.total_views ?? 0)}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12.5, color: TEXT_2, fontVariantNumeric: 'tabular-nums' }}>
                          {p.video_count ?? 0}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <StatusDot status={p.ig_status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
