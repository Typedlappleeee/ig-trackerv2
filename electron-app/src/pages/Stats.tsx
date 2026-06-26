/**
 * Stats — tableau de bord Analytics.
 * Exploite `account_stats_history` (snapshots horaires écrits par igStatsPoller)
 * + la table `phones` (valeurs live) pour afficher :
 *   - KPI agrégés (followers, vues, posts, following) avec delta sur la période
 *   - Courbes d'évolution (followers & vues) agrégées sur tous les comptes
 *   - Classement par compte avec sparkline + croissance
 * Aucune dépendance graphique : tout est en SVG maison (style hub).
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { pollAllNow } from '@/lib/igStatsPoller'
import { useToast } from '@/components/Toast'
import {
  ACCENT, ACCENT_L, TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT,
  HAIR, BG_1 as BG, BG_2 as BG2, OK, ERR, SANS,
} from '@/lib/theme'

interface StatsProps { user: User }

interface Snapshot {
  phone_id:    string
  followers:   number
  following:   number
  posts:       number
  total_views: number
  recorded_at: string
}

type Period = 7 | 30

// ── Formatting ───────────────────────────────────────────────────────────────
function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (abs >= 1_000)     return (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}
function fmtSigned(n: number): string {
  if (n === 0) return '0'
  return (n > 0 ? '+' : '') + fmtCompact(n)
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

// ── Build a per-day aggregated series (forward-filled) ───────────────────────
// For each account we keep the last snapshot of each day, then forward-fill so a
// missing day doesn't make the aggregate dip, then sum across accounts per day.
function buildSeries(
  snaps: Snapshot[],
  phoneIds: string[],
  days: number,
  metric: keyof Pick<Snapshot, 'followers' | 'total_views' | 'posts' | 'following'>,
): { date: string; value: number }[] {
  // Day buckets from (today - days + 1) → today
  const today = new Date()
  const buckets: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    buckets.push(dayKey(d))
  }

  // phone → (day → last value that day)
  const perPhone = new Map<string, Map<string, number>>()
  for (const id of phoneIds) perPhone.set(id, new Map())
  for (const s of snaps) {
    const m = perPhone.get(s.phone_id)
    if (!m) continue
    const k = s.recorded_at.slice(0, 10)
    m.set(k, Number(s[metric]) || 0) // snapshots are asc → last write wins
  }

  return buckets.map(day => {
    let total = 0
    for (const id of phoneIds) {
      const m = perPhone.get(id)!
      // forward-fill: take this day's value, else the most recent prior day
      let v = m.get(day)
      if (v === undefined) {
        for (let j = buckets.indexOf(day) - 1; j >= 0; j--) {
          const pv = m.get(buckets[j])
          if (pv !== undefined) { v = pv; break }
        }
      }
      total += v ?? 0
    }
    return { date: day, value: total }
  })
}

// ── Line chart (SVG, no deps) ────────────────────────────────────────────────
function LineChart({ data, color, height = 120 }: {
  data: { date: string; value: number }[]; color: string; height?: number
}) {
  const W = 600, H = height, PAD = 6
  if (data.length < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FAINT, fontSize: 12 }}>
        Pas encore assez de données — les courbes apparaîtront après quelques jours de collecte.
      </div>
    )
  }
  const vals = data.map(d => d.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2)
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`
  const gid = `grad-${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="3.5" fill={color} />
    </svg>
  )
}

// ── Sparkline (tiny inline) ──────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 80, H = 24, PAD = 2
  if (data.length < 2) return <div style={{ width: W, height: H }} />
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2)
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: 'block' }}>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ label, value, delta, accent }: {
  label: string; value: string; delta: number | null; accent?: boolean
}) {
  const up = (delta ?? 0) >= 0
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '16px 20px', background: BG2,
      border: `1px solid ${accent ? 'rgba(99,102,241,0.22)' : HAIR}`, borderRadius: 12,
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: IVORY, marginTop: 6, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {delta !== null && (
        <p style={{ fontSize: 12, fontWeight: 600, color: delta === 0 ? FAINT : up ? OK : ERR, marginTop: 8 }}>
          {up && delta !== 0 ? '▲' : delta !== 0 ? '▼' : '•'} {fmtSigned(delta)} <span style={{ color: FAINT, fontWeight: 500 }}>sur la période</span>
        </p>
      )}
    </div>
  )
}

export function Stats({ user }: StatsProps) {
  const { currentOrg, role, perms } = useOrg()
  const toast = useToast()
  const [phones, setPhones]       = useState<Phone[]>([])
  const [snaps, setSnaps]         = useState<Snapshot[]>([])
  const [period, setPeriod]       = useState<Period>(7)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadPhones = useCallback(async () => {
    let q = supabase.from('phones').select('*').order('followers', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    const visible = (data ?? []).filter(p =>
      !role || canAccessPhoneGroup(role, perms, p.group_name)) as Phone[]
    setPhones(visible)
  }, [currentOrg?.id, user.id, role, perms])

  const loadHistory = useCallback(async () => {
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - period)
    let q = supabase
      .from('account_stats_history')
      .select('phone_id, followers, following, posts, total_views, recorded_at')
      .gte('recorded_at', since.toISOString())
      .order('recorded_at', { ascending: true })
      .limit(5000)
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    setSnaps((data ?? []) as Snapshot[])
  }, [currentOrg?.id, user.id, period])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([loadPhones(), loadHistory()]).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [loadPhones, loadHistory])

  // Realtime: live phone updates from the background poller
  useEffect(() => {
    const ch = supabase.channel('stats-phones')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'phones' }, () => { loadPhones() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadPhones])

  const phoneIds = useMemo(() => phones.map(p => p.id), [phones])

  // Aggregated current totals (live values from phones)
  const totals = useMemo(() => ({
    followers: phones.reduce((s, p) => s + (p.followers ?? 0), 0),
    views:     phones.reduce((s, p) => s + (p.total_views ?? 0), 0),
    posts:     phones.reduce((s, p) => s + (p.video_count ?? 0), 0),
    following: phones.reduce((s, p) => s + (p.following ?? 0), 0),
  }), [phones])

  const followersSeries = useMemo(() => buildSeries(snaps, phoneIds, period, 'followers'), [snaps, phoneIds, period])
  const viewsSeries     = useMemo(() => buildSeries(snaps, phoneIds, period, 'total_views'), [snaps, phoneIds, period])

  // Delta over the period = current total − first non-zero point of the series
  const deltaOf = (series: { value: number }[], current: number): number | null => {
    const firstNonZero = series.find(s => s.value > 0)
    if (!firstNonZero) return null
    return current - firstNonZero.value
  }
  const followersDelta = deltaOf(followersSeries, totals.followers)
  const viewsDelta     = deltaOf(viewsSeries, totals.views)

  // Per-account leaderboard with sparkline + growth
  const leaderboard = useMemo(() => {
    return phones.map(p => {
      const phoneSnaps = snaps.filter(s => s.phone_id === p.id)
      const spark = phoneSnaps.map(s => s.followers)
      const firstFollowers = phoneSnaps.find(s => s.followers > 0)?.followers ?? null
      const growth = firstFollowers !== null ? (p.followers ?? 0) - firstFollowers : null
      return { phone: p, spark, growth }
    }).sort((a, b) => (b.phone.followers ?? 0) - (a.phone.followers ?? 0))
  }, [phones, snaps])

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      const n = await pollAllNow()
      await Promise.all([loadPhones(), loadHistory()])
      toast.show({ title: 'Actualisé', body: `${n} compte(s) rafraîchi(s)`, kind: 'ok' })
    } catch {
      toast.show({ title: 'Erreur', body: 'Actualisation échouée', kind: 'error' })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', fontFamily: SANS, background: BG }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: IVORY }}>Analytics</h1>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>
              {phones.length} compte{phones.length > 1 ? 's' : ''} suivi{phones.length > 1 ? 's' : ''} · collecte automatique en continu
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Period toggle */}
            <div style={{ display: 'inline-flex', background: BG2, border: `1px solid ${HAIR}`, borderRadius: 9, padding: 3 }}>
              {([7, 30] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} className="cursor-pointer" style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, border: 'none',
                  background: period === p ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: period === p ? ACCENT_L : MUTED, transition: 'all 0.15s',
                }}>{p}j</button>
              ))}
            </div>
            <button onClick={refresh} disabled={refreshing} className="cursor-pointer" style={{
              padding: '7px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
              background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.32)',
              color: ACCENT_L, opacity: refreshing ? 0.6 : 1, transition: 'all 0.15s',
            }}>{refreshing ? 'Actualisation…' : '↻ Actualiser'}</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: FAINT }}>Chargement…</div>
        ) : phones.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: MUTED, background: BG2, border: `1px solid ${HAIR}`, borderRadius: 12 }}>
            Aucun compte avec un pseudo Instagram. Ajoute le pseudo IG de tes téléphones pour démarrer le suivi.
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
              <Kpi label="Followers"  value={fmtCompact(totals.followers)} delta={followersDelta} accent />
              <Kpi label="Vues totales" value={fmtCompact(totals.views)}   delta={viewsDelta} />
              <Kpi label="Posts"       value={fmtCompact(totals.posts)}    delta={null} />
              <Kpi label="Abonnements" value={fmtCompact(totals.following)} delta={null} />
            </div>

            {/* Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 12, padding: '16px 18px' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 12 }}>Followers · {period} jours</p>
                <LineChart data={followersSeries} color={ACCENT} />
              </div>
              <div style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 12, padding: '16px 18px' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 12 }}>Vues · {period} jours</p>
                <LineChart data={viewsSeries} color={OK} />
              </div>
            </div>

            {/* Leaderboard */}
            <div style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${HAIR}` }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: IVORY }}>Classement par compte</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 70px 90px', gap: 0, padding: '8px 18px', fontSize: 10.5, fontWeight: 600, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${HAIR}` }}>
                <span>#</span><span>Compte</span>
                <span style={{ textAlign: 'right' }}>Followers</span>
                <span style={{ textAlign: 'right' }}>Vues</span>
                <span style={{ textAlign: 'right' }}>Posts</span>
                <span style={{ textAlign: 'right' }}>Croissance</span>
              </div>
              {leaderboard.map((row, i) => {
                const up = (row.growth ?? 0) >= 0
                return (
                  <div key={row.phone.id} style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 70px 90px', gap: 0,
                    padding: '11px 18px', alignItems: 'center', fontSize: 13,
                    borderBottom: i < leaderboard.length - 1 ? `1px solid rgba(233,234,240,0.04)` : 'none',
                  }}>
                    <span style={{ color: FAINT, fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Sparkline data={row.spark} color={up ? OK : ERR} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.phone.ig_username ? `@${row.phone.ig_username}` : row.phone.phone_name}
                        </p>
                        {row.phone.ig_username && (
                          <p style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.phone.phone_name}</p>
                        )}
                      </div>
                    </div>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: IVORY, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(row.phone.followers ?? 0)}</span>
                    <span style={{ textAlign: 'right', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(row.phone.total_views ?? 0)}</span>
                    <span style={{ textAlign: 'right', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(row.phone.video_count ?? 0)}</span>
                    <span style={{ textAlign: 'right', fontWeight: 600, color: row.growth === null ? FAINT : up ? OK : ERR, fontVariantNumeric: 'tabular-nums' }}>
                      {row.growth === null ? '—' : fmtSigned(row.growth)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Stats
