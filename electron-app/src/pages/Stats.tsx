/**
 * Stats — tableau de bord Analytics.
 * Exploite `account_stats_history` (snapshots horaires écrits par igStatsPoller)
 * + la table `phones` (valeurs live) pour afficher :
 *   - KPI agrégés (followers, vues, posts, vues/post, croissance %) avec delta
 *   - Courbes d'évolution (followers, vues, posts) sur 7/30/90 jours
 *   - Top progressions / régressions
 *   - Classement par compte (filtrable par groupe + recherche), cliquable → détail
 *   - Détail par compte : courbes followers/vues/posts du compte
 * Aucune dépendance graphique : tout est en SVG maison.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, fetchAllRows, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useTr } from '@/lib/i18n'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { pollAllNow } from '@/lib/igStatsPoller'
import { useToast } from '@/components/Toast'
import { exportCsv } from '@/lib/exportCsv'
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

type Period = 7 | 30 | 90
type Metric = 'followers' | 'total_views' | 'posts' | 'following'

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
function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(n >= 100 || n <= -100 ? 0 : 1) + '%'
}
function dayKey(d: Date): string { return d.toISOString().slice(0, 10) }

// ── Build a per-day aggregated series (forward-filled) ───────────────────────
function buildSeries(
  snaps: Snapshot[], phoneIds: string[], days: number, metric: Metric,
): { date: string; value: number }[] {
  const today = new Date()
  const buckets: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - i); buckets.push(dayKey(d))
  }
  const idSet = new Set(phoneIds)
  const perPhone = new Map<string, Map<string, number>>()
  for (const id of phoneIds) perPhone.set(id, new Map())
  for (const s of snaps) {
    if (!idSet.has(s.phone_id)) continue
    const m = perPhone.get(s.phone_id)!
    m.set(s.recorded_at.slice(0, 10), Number(s[metric]) || 0)
  }
  return buckets.map((day, di) => {
    let total = 0
    for (const id of phoneIds) {
      const m = perPhone.get(id)!
      let v = m.get(day)
      if (v === undefined) {
        for (let j = di - 1; j >= 0; j--) { const pv = m.get(buckets[j]); if (pv !== undefined) { v = pv; break } }
      }
      total += v ?? 0
    }
    return { date: day, value: total }
  })
}

// ── Line chart (SVG) ─────────────────────────────────────────────────────────
function LineChart({ data, color, height = 120 }: {
  data: { date: string; value: number }[]; color: string; height?: number
}) {
  const tr = useTr()
  const W = 600, H = height, PAD = 6
  if (data.length < 2 || data.every(d => d.value === 0)) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FAINT, fontSize: 12, textAlign: 'center', padding: '0 20px' }}>
        {tr('Pas encore assez de données — les courbes apparaissent après quelques jours de collecte.', 'Not enough data yet — charts appear after a few days of collection.')}
      </div>
    )
  }
  const vals = data.map(d => d.value)
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2)
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`
  const gid = `grad-${color.replace(/[^a-z0-9]/gi, '')}-${height}`
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

function Kpi({ label, value, delta, sub, accent }: {
  label: string; value: string; delta?: number | null; sub?: string; accent?: boolean
}) {
  const tr = useTr()
  const up = (delta ?? 0) >= 0
  return (
    <div style={{ flex: 1, minWidth: 150, padding: '16px 20px', background: BG2, border: `1px solid ${accent ? 'rgba(99,102,241,0.22)' : HAIR}`, borderRadius: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: IVORY, marginTop: 6, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {delta !== undefined && delta !== null && (
        <p style={{ fontSize: 12, fontWeight: 600, color: delta === 0 ? FAINT : up ? OK : ERR, marginTop: 8 }}>
          {up && delta !== 0 ? '▲' : delta !== 0 ? '▼' : '•'} {fmtSigned(delta)} <span style={{ color: FAINT, fontWeight: 500 }}>{tr('sur la période', 'over the period')}</span>
        </p>
      )}
      {sub && <p style={{ fontSize: 11.5, color: FAINT, marginTop: 8 }}>{sub}</p>}
    </div>
  )
}

interface Row { phone: Phone; spark: number[]; growth: number | null; growthPct: number | null }

export function Stats({ user }: StatsProps) {
  const { currentOrg, role, perms } = useOrg()
  const tr = useTr()
  const toast = useToast()
  const [phones, setPhones]       = useState<Phone[]>([])
  const [snaps, setSnaps]         = useState<Snapshot[]>([])
  const [period, setPeriod]       = useState<Period>(7)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [detail, setDetail]       = useState<Phone | null>(null)

  const loadPhones = useCallback(async () => {
    const data = await fetchAllRows<Phone>((from, to) => {
      let q = supabase.from('phones').select('*').order('followers', { ascending: false }).range(from, to)
      q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
      return q
    }).catch(() => [] as Phone[])
    const visible = data.filter(p => !role || canAccessPhoneGroup(role, perms, p.group_name))
    setPhones(visible)
  }, [currentOrg?.id, user.id, role, perms])

  const loadHistory = useCallback(async () => {
    const since = new Date(); since.setUTCDate(since.getUTCDate() - period)
    // Pagination complète : l'ancien .limit(8000) en ordre ASCENDANT tronquait les
    // jours les plus RÉCENTS pour les grosses orgs (des milliers de snapshots).
    const data = await fetchAllRows<Snapshot>((from, to) => {
      let q = supabase.from('account_stats_history')
        .select('phone_id, followers, following, posts, total_views, recorded_at')
        .gte('recorded_at', since.toISOString()).order('recorded_at', { ascending: true }).range(from, to)
      q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
      return q
    }).catch(() => [] as Snapshot[])
    setSnaps(data)
  }, [currentOrg?.id, user.id, period])

  useEffect(() => {
    let cancelled = false; setLoading(true)
    Promise.all([loadPhones(), loadHistory()]).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [loadPhones, loadHistory])

  useEffect(() => {
    // Filtre par org/user + COALESCE : le poller de stats écrit en continu sur des
    // centaines de lignes `phones` ; sans filtre ni debounce, chaque écriture
    // relançait un loadPhones() complet → tempête de rechargements = interface qui rame.
    const filter = currentOrg ? `org_id=eq.${currentOrg.id}` : `user_id=eq.${user.id}`
    let t: ReturnType<typeof setTimeout> | null = null
    const ch = supabase.channel('stats-phones')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'phones', filter }, () => {
        if (t) clearTimeout(t)
        t = setTimeout(() => { loadPhones() }, 4000)  // regroupe les rafales d'updates
      })
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
  }, [loadPhones, currentOrg, user.id])

  const groups = useMemo(() => [...new Set(phones.map(p => p.group_name).filter(Boolean))].sort() as string[], [phones])

  // Filtered set (group + search)
  const filtered = useMemo(() => phones.filter(p => {
    if (groupFilter !== 'all' && p.group_name !== groupFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(p.ig_username?.toLowerCase().includes(q) || p.phone_name?.toLowerCase().includes(q))) return false
    }
    return true
  }), [phones, groupFilter, search])

  const phoneIds = useMemo(() => filtered.map(p => p.id), [filtered])

  const totals = useMemo(() => ({
    followers: filtered.reduce((s, p) => s + (p.followers ?? 0), 0),
    views:     filtered.reduce((s, p) => s + (p.total_views ?? 0), 0),
    posts:     filtered.reduce((s, p) => s + (p.video_count ?? 0), 0),
    following: filtered.reduce((s, p) => s + (p.following ?? 0), 0),
  }), [filtered])

  // Santé de la flotte : vue d'ensemble d'org (actifs / bloqués / silencieux).
  const fleet = useMemo(() => {
    const now = Date.now()
    const SILENT_MS = 3 * 24 * 3600 * 1000
    let banned = 0, shadow = 0, silent = 0
    for (const p of filtered) {
      const st = (p as { account_state?: string }).account_state
      if (st === 'banned') banned++
      else if (st === 'shadow') shadow++
      const last = (p as { last_post_at?: string }).last_post_at
      if (!last || now - new Date(last).getTime() > SILENT_MS) silent++
    }
    const total = filtered.length
    const healthy = Math.max(0, total - banned - shadow)
    return { total, banned, shadow, silent, healthy }
  }, [filtered])

  const followersSeries = useMemo(() => buildSeries(snaps, phoneIds, period, 'followers'), [snaps, phoneIds, period])
  const viewsSeries     = useMemo(() => buildSeries(snaps, phoneIds, period, 'total_views'), [snaps, phoneIds, period])
  const postsSeries     = useMemo(() => buildSeries(snaps, phoneIds, period, 'posts'), [snaps, phoneIds, period])

  const deltaOf = (series: { value: number }[], current: number): number | null => {
    const first = series.find(s => s.value > 0); if (!first) return null
    return current - first.value
  }
  const followersDelta = deltaOf(followersSeries, totals.followers)
  const viewsDelta     = deltaOf(viewsSeries, totals.views)
  const followersFirst = followersSeries.find(s => s.value > 0)?.value ?? null
  const followersPct   = followersFirst && followersDelta !== null ? (followersDelta / followersFirst) * 100 : null
  const avgViewsPerPost = totals.posts > 0 ? totals.views / totals.posts : null

  // Per-account leaderboard with sparkline + growth
  const leaderboard = useMemo<Row[]>(() => {
    return filtered.map(p => {
      const phoneSnaps = snaps.filter(s => s.phone_id === p.id)
      const spark = phoneSnaps.map(s => s.followers)
      const firstFollowers = phoneSnaps.find(s => s.followers > 0)?.followers ?? null
      const growth = firstFollowers !== null ? (p.followers ?? 0) - firstFollowers : null
      const growthPct = firstFollowers && growth !== null ? (growth / firstFollowers) * 100 : null
      return { phone: p, spark, growth, growthPct }
    }).sort((a, b) => (b.phone.followers ?? 0) - (a.phone.followers ?? 0))
  }, [filtered, snaps])

  // Top movers (only accounts with measurable growth)
  const movers = useMemo(() => {
    const withGrowth = leaderboard.filter(r => r.growth !== null && r.growth !== 0)
    const up = [...withGrowth].sort((a, b) => (b.growth ?? 0) - (a.growth ?? 0)).slice(0, 3)
    const down = [...withGrowth].sort((a, b) => (a.growth ?? 0) - (b.growth ?? 0)).filter(r => (r.growth ?? 0) < 0).slice(0, 3)
    return { up, down }
  }, [leaderboard])

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      const n = await pollAllNow()
      await Promise.all([loadPhones(), loadHistory()])
      toast.show({ title: tr('Actualisé', 'Refreshed'), body: tr(`${n} compte(s) rafraîchi(s)`, `${n} account(s) refreshed`), kind: 'ok' })
    } catch {
      toast.show({ title: tr('Erreur', 'Error'), body: tr('Actualisation échouée', 'Refresh failed'), kind: 'error' })
    } finally { setRefreshing(false) }
  }

  const card: React.CSSProperties = { background: BG2, border: `1px solid ${HAIR}`, borderRadius: 12 }

  return (
    <div style={{ height: '100%', overflow: 'auto', fontFamily: SANS, background: BG }}>
      {detail && (
        <DetailModal phone={detail} snaps={snaps.filter(s => s.phone_id === detail.id)} period={period} onClose={() => setDetail(null)} />
      )}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: IVORY }}>Analytics</h1>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>
              {filtered.length} {tr(filtered.length > 1 ? 'comptes' : 'compte', filtered.length > 1 ? 'accounts' : 'account')}{groupFilter !== 'all' ? ` · ${groupFilter}` : ''} · {tr('collecte automatique', 'automatic collection')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'inline-flex', background: BG2, border: `1px solid ${HAIR}`, borderRadius: 9, padding: 3 }}>
              {([7, 30, 90] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} className="cursor-pointer" style={{
                  padding: '6px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, border: 'none',
                  background: period === p ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: period === p ? ACCENT_L : MUTED, transition: 'all 0.15s',
                }}>{tr(`${p}j`, `${p}d`)}</button>
              ))}
            </div>
            <button onClick={refresh} disabled={refreshing} className="cursor-pointer" style={{
              padding: '7px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
              background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.32)',
              color: ACCENT_L, opacity: refreshing ? 0.6 : 1,
            }}>{refreshing ? tr('Actualisation…', 'Refreshing…') : tr('↻ Actualiser', '↻ Refresh')}</button>
          </div>
        </div>

        {/* Filters */}
        {phones.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Rechercher un compte…', 'Search an account…')}
              style={{ flex: 1, minWidth: 180, height: 34, padding: '0 12px', fontSize: 13, color: IVORY, background: BG2, border: `1px solid ${HAIR}`, borderRadius: 9, outline: 'none' }} />
            {groups.length > 0 && (
              <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="cursor-pointer"
                style={{ height: 34, padding: '0 10px', fontSize: 12.5, color: groupFilter === 'all' ? MUTED : ACCENT_L, background: BG2, border: `1px solid ${HAIR}`, borderRadius: 9, outline: 'none' }}>
                <option value="all">{tr('Tous les groupes', 'All groups')}</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: FAINT }}>{tr('Chargement…', 'Loading…')}</div>
        ) : phones.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: MUTED, ...card }}>
            {tr('Aucun compte avec un pseudo Instagram. Ajoute le pseudo IG de tes téléphones pour démarrer le suivi.', 'No account with an Instagram handle. Add your phones\' IG handles to start tracking.')}
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
              <Kpi label="Followers"  value={fmtCompact(totals.followers)} delta={followersDelta} sub={followersPct !== null ? tr(`${fmtPct(followersPct)} sur la période`, `${fmtPct(followersPct)} over the period`) : undefined} accent />
              <Kpi label={tr('Vues totales', 'Total views')} value={fmtCompact(totals.views)}   delta={viewsDelta} />
              <Kpi label="Posts"       value={fmtCompact(totals.posts)} />
              <Kpi label={tr('Vues / post', 'Views / post')} value={avgViewsPerPost !== null ? fmtCompact(avgViewsPerPost) : '—'} sub={tr('moyenne', 'average')} />
            </div>

            {/* Santé de la flotte */}
            <div style={{ ...card, padding: '14px 18px', marginBottom: 18, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: IVORY }}>{tr('Santé de la flotte', 'Fleet health')}</span>
              {[
                { label: tr('Comptes', 'Accounts'), val: fleet.total, color: IVORY },
                { label: tr('Sains', 'Healthy'), val: fleet.healthy, color: '#22C55E' },
                { label: 'Shadowban', val: fleet.shadow, color: '#F59E0B' },
                { label: tr('Bloqués', 'Blocked'), val: fleet.banned, color: '#EF4444' },
                { label: tr('Silencieux 3j+', 'Silent 3d+'), val: fleet.silent, color: '#94A3B8' },
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.val}</span>
                  <span style={{ fontSize: 10.5, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</span>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div style={{ ...card, padding: '16px 18px' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 12 }}>Followers · {tr(`${period}j`, `${period}d`)}</p>
                <LineChart data={followersSeries} color={ACCENT} />
              </div>
              <div style={{ ...card, padding: '16px 18px' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 12 }}>{tr('Vues', 'Views')} · {tr(`${period}j`, `${period}d`)}</p>
                <LineChart data={viewsSeries} color={OK} />
              </div>
            </div>
            <div style={{ ...card, padding: '16px 18px', marginBottom: 18 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 12 }}>Posts · {tr(`${period}j`, `${period}d`)}</p>
              <LineChart data={postsSeries} color={ACCENT_L} height={90} />
            </div>

            {/* Top movers */}
            {(movers.up.length > 0 || movers.down.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <MoversCard title={tr('📈 Meilleures progressions', '📈 Top gainers')} rows={movers.up} positive onPick={setDetail} />
                <MoversCard title={tr('📉 Régressions', '📉 Decliners')} rows={movers.down} positive={false} onPick={setDetail} />
              </div>
            )}

            {/* Leaderboard */}
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: IVORY }}>{tr('Classement par compte', 'Account leaderboard')} <span style={{ color: FAINT, fontWeight: 500 }}>{tr('· clique un compte pour le détail', '· click an account for details')}</span></p>
                <button
                  onClick={() => exportCsv(`scaleflow-comptes-${new Date().toISOString().slice(0, 10)}`,
                    [
                      { key: 'account', label: tr('Compte', 'Account') },
                      { key: 'followers', label: 'Followers' },
                      { key: 'views', label: tr('Vues', 'Views') },
                      { key: 'posts', label: 'Posts' },
                      { key: 'growth', label: tr('Croissance', 'Growth') },
                    ],
                    leaderboard.map(r => ({
                      account: r.phone.ig_username ?? r.phone.phone_name ?? '',
                      followers: r.phone.followers ?? 0,
                      views: r.phone.total_views ?? 0,
                      posts: r.phone.video_count ?? 0,
                      growth: r.growth ?? '',
                    })))}
                  className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                  style={{ marginLeft: 'auto', fontSize: 11 }}
                  title={tr('Exporter le classement en CSV', 'Export leaderboard as CSV')}
                >
                  ⬇ Export CSV
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 70px 90px', padding: '8px 18px', fontSize: 10.5, fontWeight: 600, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${HAIR}` }}>
                <span>#</span><span>{tr('Compte', 'Account')}</span>
                <span style={{ textAlign: 'right' }}>Followers</span>
                <span style={{ textAlign: 'right' }}>{tr('Vues', 'Views')}</span>
                <span style={{ textAlign: 'right' }}>Posts</span>
                <span style={{ textAlign: 'right' }}>{tr('Croissance', 'Growth')}</span>
              </div>
              {leaderboard.map((row, i) => {
                const up = (row.growth ?? 0) >= 0
                return (
                  <button key={row.phone.id} onClick={() => setDetail(row.phone)} className="cursor-pointer"
                    style={{ width: '100%', display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 70px 90px', padding: '11px 18px', alignItems: 'center', fontSize: 13, textAlign: 'left', background: 'none', border: 'none', borderBottom: i < leaderboard.length - 1 ? `1px solid rgba(233,234,240,0.04)` : 'none' }}>
                    <span style={{ color: FAINT, fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Sparkline data={row.spark} color={up ? OK : ERR} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.phone.ig_username ? `@${row.phone.ig_username}` : row.phone.phone_name}
                        </p>
                        {row.phone.ig_username && <p style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.phone.phone_name}</p>}
                      </div>
                    </div>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: IVORY, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(row.phone.followers ?? 0)}</span>
                    <span style={{ textAlign: 'right', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(row.phone.total_views ?? 0)}</span>
                    <span style={{ textAlign: 'right', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(row.phone.video_count ?? 0)}</span>
                    <span style={{ textAlign: 'right', fontWeight: 600, color: row.growth === null ? FAINT : up ? OK : ERR, fontVariantNumeric: 'tabular-nums' }}>
                      {row.growth === null ? '—' : fmtSigned(row.growth)}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Top movers card ──────────────────────────────────────────────────────────
function MoversCard({ title, rows, positive, onPick }: {
  title: string; rows: Row[]; positive: boolean; onPick: (p: Phone) => void
}) {
  const tr = useTr()
  return (
    <div style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 12, padding: '14px 16px' }}>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 10 }}>{title}</p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: FAINT }}>{tr('Pas encore de données.', 'No data yet.')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => (
            <button key={r.phone.id} onClick={() => onPick(r.phone)} className="cursor-pointer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}`, textAlign: 'left' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                @{r.phone.ig_username ?? r.phone.phone_name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: positive ? OK : ERR, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {fmtSigned(r.growth ?? 0)} {r.growthPct !== null && <span style={{ color: FAINT, fontWeight: 500 }}>({fmtPct(r.growthPct)})</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Per-account detail modal ─────────────────────────────────────────────────
function DetailModal({ phone, snaps, period, onClose }: {
  phone: Phone; snaps: Snapshot[]; period: Period; onClose: () => void
}) {
  const tr = useTr()
  const fSeries = useMemo(() => buildSeries(snaps, [phone.id], period, 'followers'), [snaps, phone.id, period])
  const vSeries = useMemo(() => buildSeries(snaps, [phone.id], period, 'total_views'), [snaps, phone.id, period])
  const pSeries = useMemo(() => buildSeries(snaps, [phone.id], period, 'posts'), [snaps, phone.id, period])
  const fFirst = fSeries.find(s => s.value > 0)?.value ?? null
  const fGrowth = fFirst !== null ? (phone.followers ?? 0) - fFirst : null
  const fPct = fFirst && fGrowth !== null ? (fGrowth / fFirst) * 100 : null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(6,6,8,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="anim-scale-in" style={{ width: '100%', maxWidth: 640, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', background: BG2, border: `1px solid ${HAIR}`, borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${HAIR}` }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: IVORY }}>@{phone.ig_username ?? phone.phone_name}</p>
            <p style={{ fontSize: 12, color: FAINT, marginTop: 2 }}>{phone.phone_name}{phone.group_name ? ` · ${phone.group_name}` : ''} · {tr(`${period}j`, `${period}d`)}</p>
          </div>
          <button onClick={onClose} className="cursor-pointer" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 22 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <Kpi label="Followers" value={fmtCompact(phone.followers ?? 0)} delta={fGrowth} sub={fPct !== null ? fmtPct(fPct) : undefined} accent />
            <Kpi label={tr('Vues', 'Views')} value={fmtCompact(phone.total_views ?? 0)} />
            <Kpi label="Posts" value={fmtCompact(phone.video_count ?? 0)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 10 }}>Followers</p>
            <LineChart data={fSeries} color={ACCENT} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 10 }}>{tr('Vues', 'Views')}</p>
            <LineChart data={vSeries} color={OK} />
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, marginBottom: 10 }}>Posts</p>
            <LineChart data={pSeries} color={ACCENT_L} height={90} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Stats
