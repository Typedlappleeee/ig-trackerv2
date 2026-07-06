/**
 * Reports — Dashboard « Aujourd'hui ».
 * Chaque client voit SES comptes (filtrés par ses accès) avec, pour la journée :
 * a posté / pas posté, la vidéo (miniature + lien), vues/likes/commentaires.
 * Données synchronisées 1×/jour côté serveur (run-scheduled-posts → account sync).
 *
 * Niveau gratuit : posté/pas posté via l'historique ScaleFlow (aucune API).
 * Niveau API : vidéo + stats par post (clé RapidAPI dans la config).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { syncGeelarkAnalytics } from '@/lib/geelarkAnalytics'

interface TrackingConfig {
  enabled: boolean
  sync_time: string
  force_run?: string
}
interface DailyRow {
  id: string; phone_id: string; ig_username: string; va: string | null
  posted: boolean; posted_via: string | null; posted_at: string | null
  reel_url: string | null; reel_thumb: string | null
  views: number | null; likes: number | null; comments: number | null
  posts_today?: number | null
  synced_at: string | null
  // mergés depuis phones (sync stats)
  followers?: number | null
  pp_url?: string | null
  last_post_at?: string | null
  account_state?: string | null   // 'ok' | 'banned' | 'shadow'
}
interface TrendPoint { day: string; views: number }

const DEFAULT_CFG: TrackingConfig = {
  enabled: false,
  sync_time: '12:00',
}

// Images Instagram : proxy Vercel /api/img (déployé automatiquement, fiable).
const _isWeb = typeof window !== 'undefined' && !(window as unknown as { electronAPI?: unknown }).electronAPI
function igimg(u: string | null | undefined): string | undefined {
  if (!u) return undefined
  if (!_isWeb || !/^https?:\/\//i.test(u)) return u
  return `/api/ig?url=${encodeURIComponent(u)}`
}

function parisToday(): string { return new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }) }
function fmt(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k'
  return String(n)
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
}

export function Reports({ user }: { user: User }) {
  const { currentOrg } = useOrg()
  const { bearer } = useConnections(user)
  const [glSyncing, setGlSyncing] = useState(false)
  const [glMsg, setGlMsg]         = useState('')
  const table  = currentOrg ? 'org_config' : 'app_config'
  const keyCol = currentOrg ? 'org_id' : 'user_id'
  const keyVal = currentOrg ? currentOrg.id : user.id

  const [cfg, setCfg]       = useState<TrackingConfig>(DEFAULT_CFG)
  const [rows, setRows]     = useState<DailyRow[]>([])
  const [day, setDay]       = useState(parisToday())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [showCfg, setShowCfg] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [launched, setLaunched]   = useState(false)
  const [launchMsg, setLaunchMsg] = useState('')
  const [testing, setTesting]     = useState(false)
  // Modal détail compte
  const [detailRow, setDetailRow] = useState<DailyRow | null>(null)
  // deno-lint-ignore no-explicit-any
  const [detail, setDetail]       = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [trend, setTrend] = useState<TrendPoint[]>([])

  async function openDetail(a: DailyRow) {
    setDetailRow(a); setDetail(null); setDetailLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('run-scheduled-posts', {
        body: { detail: 'account', username: a.ig_username },
      })
      if (error) { setDetail({ error: error.message }); }
      else setDetail(data)
    } catch (e) { setDetail({ error: String(e) }) } finally { setDetailLoading(false) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const cfgQ = supabase.from(table).select('tracking_config').eq(keyCol, keyVal).maybeSingle()
    let dQ = supabase.from('account_daily').select('*').eq('day', day)
    dQ = currentOrg ? dQ.eq('org_id', currentOrg.id) : dQ.eq('user_id', user.id).is('org_id', null)
    // Infos live depuis phones (followers, pp, dernier post, statut).
    let pQ = supabase.from('phones').select('id, followers, pp_url, last_post_at, account_state').not('ig_username', 'is', null)
    pQ = currentOrg ? pQ.eq('org_id', currentOrg.id) : pQ.eq('user_id', user.id).is('org_id', null)
    // Courbe : depuis les données STOCKÉES (account_daily, posts faits ce jour-là).
    // AUCUN appel API ici (sinon on crame le quota RapidAPI à chaque chargement).
    const from30 = new Date(new Date(day + 'T12:00:00').getTime() - 29 * 86_400_000).toLocaleDateString('fr-CA')
    let tQ = supabase.from('account_daily').select('day, views, posted').eq('posted', true).gte('day', from30).lte('day', day)
    tQ = currentOrg ? tQ.eq('org_id', currentOrg.id) : tQ.eq('user_id', user.id).is('org_id', null)
    const [{ data: cfgData }, { data: dData }, { data: pData }, { data: tData }] = await Promise.all([cfgQ, dQ, pQ, tQ])
    const tc = (cfgData?.tracking_config ?? {}) as Partial<TrackingConfig>
    setCfg({ ...DEFAULT_CFG, ...tc })
    // deno-lint-ignore no-explicit-any
    const pMap = new Map<string, any>((pData ?? []).map((p: { id: string }) => [p.id, p]))
    // Page réservée au superadmin ScaleFlow → on affiche tous les comptes (pas de
    // filtre par groupe : sinon un rôle org restrictif masquerait tout).
    setRows(((dData ?? []) as DailyRow[]).map(r => {
      const p = pMap.get(r.phone_id)
      return { ...r, followers: p?.followers ?? null, pp_url: p?.pp_url ?? null, last_post_at: p?.last_post_at ?? null, account_state: p?.account_state ?? null }
    }))
    // Série 30 j depuis account_daily.
    const byDay = new Map<string, number>()
    for (const r of (tData ?? []) as { day: string; views: number | null }[]) byDay.set(r.day, (byDay.get(r.day) ?? 0) + (r.views ?? 0))
    const series: TrendPoint[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(new Date(day + 'T12:00:00').getTime() - i * 86_400_000).toLocaleDateString('fr-CA')
      series.push({ day: d, views: byDay.get(d) ?? 0 })
    }
    setTrend(series)
    setShowCfg(prev => prev || !tc.enabled)
    setLoading(false)
  }, [table, keyCol, keyVal, currentOrg?.id, user.id, day])

  useEffect(() => { load() }, [load])

  // Sync auto via l'analytics GeeLark à l'ouverture — les vues/followers se mettent
  // à jour tout seuls, sans cliquer. Garde-fou : au plus 1×/30 min par périmètre
  // (localStorage), pour ne pas spammer l'API. Silencieux ; recharge si des comptes
  // ont été mis à jour. Enregistre aussi les comptes dans le tracking GeeLark.
  const autoSyncedRef = useRef(false)
  useEffect(() => {
    if (autoSyncedRef.current || !bearer) return
    autoSyncedRef.current = true
    const KEY = `sf-gl-analytics-sync-${keyVal}`
    let last = 0
    try { last = Number(localStorage.getItem(KEY) || 0) } catch { /* ignore */ }
    if (Date.now() - last < 30 * 60_000) return   // synchronisé récemment → on saute
    try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ }
    syncGeelarkAnalytics(bearer, currentOrg?.id ?? null, user.id)
      .then(r => { if (r.ok && r.updated > 0) load() })
      .catch(() => { /* best-effort — le bouton manuel reste dispo */ })
  }, [bearer, currentOrg?.id, user.id, keyVal, load])

  async function save() {
    setSaving(true); setSaved(false)
    const { error } = await supabase.from(table).upsert({ [keyCol]: keyVal, tracking_config: cfg }, { onConflict: keyCol })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  // « Lancer maintenant » : déclenche la synchro IMMÉDIATEMENT (appel direct de
  // l'edge function) puis recharge — pas d'attente du cron.
  async function launchNow() {
    setLaunching(true); setLaunched(false); setLaunchMsg('')
    const next = { ...cfg, enabled: true, force_run: new Date().toISOString() }
    setCfg(next)
    await supabase.from(table).upsert({ [keyCol]: keyVal, tracking_config: next }, { onConflict: keyCol })
    try {
      const { data, error } = await supabase.functions.invoke('run-scheduled-posts', { body: { sync: 'accounts' } })
      if (error) { setLaunchMsg('❌ ' + error.message); console.error('[Reports] sync error', error) }
      else {
        // deno-lint-ignore no-explicit-any
        const a = (data as any)?.accountsSynced
        setLaunchMsg(typeof a === 'number' ? `✓ ${a} compte(s) synchronisé(s)` : '✓ Synchronisé')
        console.log('[Reports] sync result', data)
      }
    } catch (e) { setLaunchMsg('❌ ' + String(e)); console.error('[Reports] sync exception', e) }
    await load()   // recharge les données fraîchement synchronisées (+ courbe)
    setLaunching(false); setLaunched(true); setTimeout(() => setLaunched(false), 10000)
  }

  // Synchro via l'analytics GeeLark (inclus au plan Pro — gratuit, sans RapidAPI).
  async function syncViaGeelark() {
    setGlSyncing(true); setGlMsg('')
    try {
      const r = await syncGeelarkAnalytics(bearer, currentOrg?.id ?? null, user.id)
      if (r.needsPro) setGlMsg('❌ Analytics indisponible — plan Pro GéeLark requis')
      else if (!r.ok) setGlMsg('❌ ' + (r.error ?? 'Échec'))
      else setGlMsg(`✓ ${r.updated} compte(s) mis à jour via GéeLark`)
    } catch (e) { setGlMsg('❌ ' + String(e)) }
    await load()
    setGlSyncing(false)
    setTimeout(() => setGlMsg(''), 10000)
  }

  // Test RapidAPI : appelle l'edge function en mode diagnostic et affiche le détail.
  async function testApi() {
    setTesting(true)
    try {
      const uname = rows[0]?.ig_username || 'instagram'
      const { data, error } = await supabase.functions.invoke('run-scheduled-posts', {
        body: { diag: 'rapidapi', username: uname },
      })
      if (error) { alert('Échec invocation edge function :\n' + error.message + '\n\n(As-tu redéployé run-scheduled-posts ?)'); return }
      console.log('[Reports] diag RapidAPI (complet)', data)
      // deno-lint-ignore no-explicit-any
      const d = data as any
      const pp = d?.parsedProfile, pi = d?.parsedInfo, pr = d?.parsedReels
      const fol = pp?.followers || pi?.followers || 0
      const folSrc = pp?.followers ? 'profile' : pi?.followers ? 'userInfo' : '—'
      const summary =
        `Test RapidAPI @${uname}\n\n` +
        `Clé présente : ${d?.keyPresent ? 'oui' : 'NON'}\n` +
        `Statuts HTTP : profile=${d?.profile?.status} · userInfo=${d?.userInfo?.status} · reels=${d?.reels?.status}\n\n` +
        `➡ Followers détectés : ${fol}  (source: ${folSrc})\n` +
        `➡ Following : ${pp?.following || pi?.following || 0}\n` +
        `➡ Posts : ${pp?.posts || pi?.posts || 0}\n` +
        `➡ Reels trouvés : ${pr?.count ?? 0}\n` +
        `➡ Vues dernier reel : ${pr?.latest?.views ?? '—'}\n` +
        `➡ Date dernier reel : ${pr?.latest?.postedAt ?? 'NULL'}\n\n` +
        `── QUOTA RapidAPI ──\n${Object.entries(d?.quota ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n') || 'non renvoyé par l\'API'}\n\n` +
        `── Champs date du reel ──\n` +
        `dateish: ${JSON.stringify(d?.firstReel?.dateish ?? {})}\n\n` +
        `clés du reel: ${(d?.firstReel?.keys ?? []).join(', ')}\n\n` +
        `(Détail complet dans la console — F12.)`
      alert(summary)
    } catch (e) { alert('Erreur : ' + String(e)) } finally { setTesting(false) }
  }

  // Groupement par VA (client).
  const vaMap = new Map<string, DailyRow[]>()
  for (const r of rows) { const k = r.va || 'Sans groupe'; const l = vaMap.get(k) ?? []; l.push(r); vaMap.set(k, l) }
  const vas = [...vaMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const totalPosted = rows.filter(r => r.posted).length
  const totalViews = rows.reduce((s, r) => s + (r.views ?? 0), 0)
  const totalLikes = rows.reduce((s, r) => s + (r.likes ?? 0), 0)
  const totalComments = rows.reduce((s, r) => s + (r.comments ?? 0), 0)
  const totalFollowers = rows.reduce((s, r) => s + (r.followers ?? 0), 0)
  const postedPct = rows.length ? Math.round((totalPosted / rows.length) * 100) : 0
  const lastSync = rows.reduce<string | null>((m, r) => (r.synced_at && (!m || r.synced_at > m)) ? r.synced_at : m, null)
  const isToday = day === parisToday()
  const fmtDayLabel = new Date(day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 8 }

  // Courbe des vues par jour (SVG, sans lib).
  const ViewsChart = ({ data }: { data: TrendPoint[] }) => {
    const W = 760, H = 150, P = 6
    const max = Math.max(1, ...data.map(d => d.views))
    const n = data.length
    const pts = data.map((d, i) => {
      const x = P + (n > 1 ? (i / (n - 1)) : 0) * (W - 2 * P)
      const y = H - P - (d.views / max) * (H - 2 * P)
      return [x, y] as [number, number]
    })
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} L${pts[n - 1][0].toFixed(1)},${H - P} L${pts[0][0].toFixed(1)},${H - P} Z`
    const lastV = data[n - 1]?.views ?? 0
    const prevV = data[n - 2]?.views ?? 0
    const delta = lastV - prevV
    return (
      <div className="sf-card" style={{ padding: '16px 18px', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)' }}>Vues par jour · 30 jours</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(lastV)} aujourd'hui {delta !== 0 && <span style={{ color: delta > 0 ? 'var(--ok)' : 'var(--err)', fontSize: 11 }}>{delta > 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}</span>}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }}>
          <defs>
            <linearGradient id="rpt-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(99,102,241,0.35)" />
              <stop offset="100%" stopColor="rgba(99,102,241,0)" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#rpt-grad)" />
          <path d={line} fill="none" stroke="#818CF8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map(([x, y], i) => data[i].views > 0 && i === n - 1 ? <circle key={i} cx={x} cy={y} r="3.5" fill="#818CF8" /> : null)}
        </svg>
      </div>
    )
  }

  const StatCard = ({ icon, label, value, sub, accent }: { icon: string; label: string; value: string; sub?: string; accent?: string }) => (
    <div className="sf-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: accent ?? 'var(--text-1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {sub && <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{sub}</span>}
      </div>
    </div>
  )

  return (
    <div className="sf-page">
      <div className="sf-toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            background: 'linear-gradient(135deg,#10B981,#059669)',
            boxShadow: '0 10px 24px -8px rgba(16,185,129,0.5), inset 0 1px 0 0 rgba(255,255,255,0.35)',
          }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
            </svg>
          </div>
          <div>
            <h1 className="sf-page-title">Rapports</h1>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
              Activité quotidienne par compte · maj 1×/jour {lastSync && `· dernière maj ${fmtTime(lastSync)}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={day} max={parisToday()} onChange={e => setDay(e.target.value)} className="sf-input" style={{ width: 150, height: 32 }} />
          <button onClick={syncViaGeelark} disabled={glSyncing || !bearer} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" style={{ opacity: (glSyncing || !bearer) ? 0.6 : 1 }} title="Récupère followers/vues via l'analytics GeeLark (inclus, sans RapidAPI)">
            {glSyncing ? '⏳ Synchro…' : '🟢 Sync via GéeLark'}
          </button>
          {glMsg && <span style={{ fontSize: 12, color: glMsg.startsWith('❌') ? 'var(--err)' : 'var(--ok)' }}>{glMsg}</span>}
          <button onClick={() => setShowCfg(v => !v)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">{showCfg ? 'Masquer' : 'Configurer'}</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px 60px' }}>

        {/* KPI row */}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 22 }}>
            <StatCard icon="📅" label={isToday ? "Aujourd'hui" : 'Ce jour'} value={`${rows.length}`} sub="comptes" />
            <StatCard icon="✅" label="Ont posté" value={`${totalPosted}/${rows.length}`} sub={`${postedPct}%`} accent={postedPct >= 80 ? 'var(--ok)' : postedPct >= 40 ? '#fbbf24' : 'var(--err)'} />
            <StatCard icon="👥" label="Followers" value={fmt(totalFollowers)} accent="var(--text-1)" />
            <StatCard icon="👁" label="Vues totales" value={fmt(totalViews)} accent="var(--accent-l)" />
            <StatCard icon="💬" label="Engagement" value={fmt(totalLikes + totalComments)} sub={`❤ ${fmt(totalLikes)} · 💬 ${fmt(totalComments)}`} />
          </div>
        )}

        {/* Courbe des vues — toujours visible quand il y a des comptes */}
        {!loading && rows.length > 0 && <ViewsChart data={trend.length ? trend : Array.from({ length: 30 }, (_, i) => ({ day: String(i), views: 0 }))} />}

        {/* Config */}
        {showCfg && (
          <div className="sf-card" style={{ padding: 20, marginBottom: 22, maxWidth: 640 }}>
            <button onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))} className="cursor-pointer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', marginBottom: 16 }}>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Suivi quotidien</p>
                <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '2px 0 0' }}>Synchronise tes comptes 1×/jour</p>
              </div>
              <span style={{ width: 34, height: 19, borderRadius: 99, position: 'relative', background: cfg.enabled ? 'var(--accent)' : 'rgba(255,255,255,0.12)', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: cfg.enabled ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
              </span>
            </button>

            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <p style={{ ...lbl, marginBottom: 0 }}>Heure de maj (FR)</p>
              <input type="time" value={cfg.sync_time} onChange={e => setCfg(c => ({ ...c, sync_time: e.target.value }))} className="sf-input" style={{ width: 130, height: 32 }} />
            </div>

            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', marginBottom: 16 }}>
              <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                🟢 Le bouton <b>« Sync via GéeLark »</b> (en haut) récupère followers/vues via l'analytics GéeLark <b>inclus à ton plan</b> — gratuit, sans RapidAPI. Le suivi automatique quotidien, lui, passe par la clé serveur (agence).
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={save} disabled={saving} className="sf-btn sf-btn-primary cursor-pointer" style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={launchNow} disabled={launching} className="sf-btn sf-btn-primary cursor-pointer" style={{ opacity: launching ? 0.6 : 1 }}>{launching ? '⏳ Synchro en cours…' : '⚡ Lancer maintenant'}</button>
              <button onClick={testApi} disabled={testing} className="sf-btn sf-btn-secondary cursor-pointer" style={{ opacity: testing ? 0.6 : 1 }}>{testing ? 'Test…' : '🔍 Tester l\'API'}</button>
              {saved && <span style={{ fontSize: 12, color: 'var(--ok)' }}>✓ Enregistré</span>}
              {launched && <span style={{ fontSize: 12, color: launchMsg.startsWith('❌') ? 'var(--err)' : 'var(--ok)' }}>{launchMsg || '✓ Synchronisé'}</span>}
              {glMsg && <span style={{ fontSize: 12, color: glMsg.startsWith('❌') ? 'var(--err)' : 'var(--ok)' }}>{glMsg}</span>}
            </div>
          </div>
        )}

        {/* Libellé du jour */}
        {!loading && rows.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-4)', margin: '0 0 16px', textTransform: 'capitalize' }}>{fmtDayLabel}</p>
        )}

        {/* Contenu */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>
            {[0, 1, 2].map(i => <div key={i} className="sf-card sf-skeleton" style={{ height: 64 }} />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="sf-card" style={{ padding: '40px 24px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📭</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>Aucune donnée pour ce jour</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
              {cfg.enabled
                ? `La synchro tourne chaque jour à ${cfg.sync_time}. Tu peux aussi cliquer « ⚡ Lancer maintenant » dans Configurer.`
                : 'Active le suivi quotidien dans Configurer pour commencer.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 960 }}>
            {vas.map(([vaName, accounts]) => {
              const postedN = accounts.filter(a => a.posted).length
              const pct = Math.round((postedN / accounts.length) * 100)
              return (
                <div key={vaName}>
                  {/* En-tête groupe + barre de progression */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{vaName}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', maxWidth: 220 }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: pct >= 80 ? 'var(--ok)' : pct >= 40 ? '#fbbf24' : 'var(--err)', transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>{postedN}/{accounts.length} postés</span>
                  </div>
                  {/* Cartes comptes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                    {accounts.slice().sort((a, b) => Number(b.posted) - Number(a.posted)).map(a => (
                      <div key={a.id} onClick={() => openDetail(a)} className="sf-card sf-card-lift cursor-pointer" style={{
                        padding: 11, display: 'flex', gap: 11, alignItems: 'center',
                        borderColor: a.posted ? 'rgba(34,197,94,0.22)' : 'var(--border)',
                        background: a.posted ? 'rgba(34,197,94,0.04)' : undefined,
                      }}>
                        {/* Avatar = photo de profil (rond) */}
                        <div style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                          {a.pp_url
                            ? <img src={igimg(a.pp_url)} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-3)' }}>{a.ig_username.charAt(0).toUpperCase()}</span>}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: a.posted ? 'var(--ok)' : 'rgba(255,255,255,0.18)' }} title={a.posted ? "Posté aujourd'hui" : "Pas posté aujourd'hui"} />
                            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>@{a.ig_username}</p>
                            {a.account_state === 'banned' && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', flexShrink: 0 }}>BANNI</span>}
                            {a.account_state === 'shadow' && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', flexShrink: 0 }}>SHADOW?</span>}
                            {(!a.account_state || a.account_state === 'ok') && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: 'rgba(34,197,94,0.12)', color: 'var(--ok)', border: '1px solid rgba(34,197,94,0.25)', flexShrink: 0 }}>OK</span>}
                          </div>
                          {/* Followers (live) */}
                          {a.followers != null && a.followers > 0 && (
                            <p style={{ fontSize: 10.5, color: 'var(--text-3)', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>👥 {fmt(a.followers)} followers</p>
                          )}
                          {/* Dernière vidéo + stats (toujours affichées si dispo) */}
                          {a.views != null ? (
                            <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>👁 {fmt(a.views)} · ❤ {fmt(a.likes)} · 💬 {fmt(a.comments)}</p>
                          ) : (
                            <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '3px 0 0' }}>Stats indisponibles</p>
                          )}
                          <p style={{ fontSize: 10, color: 'var(--text-4)', margin: '2px 0 0' }}>
                            {a.posted
                              ? <span style={{ color: 'var(--ok)' }}>✓ {(a.posts_today ?? 0) > 1 ? `${a.posts_today} posts aujourd'hui` : 'Posté aujourd\'hui'}{a.posted_at ? ` · ${fmtTime(a.posted_at)}` : ''}</span>
                              : 'Pas posté aujourd\'hui'}
                            {a.reel_url && <> · <a href={a.reel_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-l)' }}>voir le reel</a></>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {detailRow && (
        <AccountDetailModal row={detailRow} data={detail} loading={detailLoading} onClose={() => setDetailRow(null)} />
      )}
    </div>
  )
}

// ── Modal détail d'un compte ────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
function fmtReelDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Vignette d'un reel + bouton info (ⓘ) qui affiche date complète + stats.
function ReelCard({ r, today }: { r: ReelInfo; today: string }) {
  const [info, setInfo] = useState(false)
  const isToday = (r.postedAt ?? '').slice(0, 10) === today
  const fullDate = r.postedAt ? new Date(r.postedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : 'Date inconnue'
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
      <a href={r.url ?? undefined} target="_blank" rel="noreferrer" className="sf-card-lift" style={{ display: 'block', textDecoration: 'none' }}>
        <div style={{ aspectRatio: '9/16', background: 'rgba(255,255,255,0.04)', position: 'relative' }}>
          {r.thumb ? <img src={igimg(r.thumb)} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 22, opacity: 0.4 }}>🎬</div>}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', color: '#fff', fontSize: 10.5, fontWeight: 700 }}>👁 {fmt(r.views)}</div>
        </div>
        <div style={{ padding: '5px 7px 2px', fontSize: 9.5, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums' }}>
          <span>❤ {fmt(r.likes)}</span><span>💬 {fmt(r.comments)}</span>
        </div>
        {r.postedAt && (
          <div style={{ padding: '0 7px 6px', fontSize: 9, color: isToday ? 'var(--ok)' : 'var(--text-4)', fontWeight: isToday ? 700 : 400 }}>
            📅 {isToday ? "Aujourd'hui" : fmtReelDate(r.postedAt)}
          </div>
        )}
      </a>
      {/* Bouton info */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfo(v => !v) }}
        aria-label="Infos du reel"
        style={{
          position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
          background: 'rgba(0,0,0,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', cursor: 'pointer',
        }}
      >ⓘ</button>
      {info && (
        <div onClick={(e) => { e.stopPropagation(); setInfo(false) }} style={{
          position: 'absolute', inset: 0, background: 'rgba(10,11,14,0.92)', padding: 10, display: 'flex',
          flexDirection: 'column', justifyContent: 'center', gap: 4, fontSize: 10.5, color: 'var(--text-2)', cursor: 'pointer',
        }}>
          <div style={{ fontWeight: 700, color: isToday ? 'var(--ok)' : 'var(--text-1)', marginBottom: 2 }}>📅 {fullDate}</div>
          <div>👁 {fmt(r.views)} vues</div>
          <div>❤ {fmt(r.likes)} · 💬 {fmt(r.comments)}</div>
          {r.url && <div style={{ color: 'var(--accent-l)', marginTop: 4 }}>Ouvrir le reel ↗</div>}
        </div>
      )}
    </div>
  )
}
function AccountDetailModal({ row, data, loading, onClose }: { row: DailyRow; data: any; loading: boolean; onClose: () => void }) {
  const p = data?.profile
  const reels: ReelInfo[] = data?.reels ?? []
  const notFound = data && data.found === false
  const today = parisToday()
  const postsToday = reels.filter(r => r.postedAt && r.postedAt.slice(0, 10) === today).length
  return (
    <div className="sf-modal-bg" onClick={onClose} style={{ zIndex: 9000 }}>
      <div className="sf-modal anim-scale-in" onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* En-tête profil */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
            {p?.pp ? <img src={igimg(p.pp)} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 22 }}>👤</div>}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>@{row.ig_username}</span>
              {p?.isVerified && <span title="Vérifié" style={{ fontSize: 13 }}>☑️</span>}
              {p?.isPrivate && <span className="sf-badge" style={{ fontSize: 10 }}>Privé</span>}
              {notFound && <span className="sf-badge" style={{ fontSize: 10, background: 'rgba(239,68,68,0.15)', color: 'var(--err)', border: '1px solid rgba(239,68,68,0.3)' }}>⚠ Introuvable (banni/désactivé ?)</span>}
              {data?.lowReach && <span className="sf-badge" style={{ fontSize: 10, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>⚠ Portée faible (shadowban ?)</span>}
              {postsToday > 0 && <span className="sf-badge" style={{ fontSize: 10, background: 'rgba(34,197,94,0.14)', color: 'var(--ok)', border: '1px solid rgba(34,197,94,0.3)' }}>✓ {postsToday} post{postsToday > 1 ? 's' : ''} aujourd'hui</span>}
            </div>
            {p?.fullName && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '2px 0 0' }}>{p.fullName}</p>}
            {p?.bio && <p style={{ fontSize: 11.5, color: 'var(--text-4)', margin: '4px 0 0', lineHeight: 1.4, maxHeight: 34, overflow: 'hidden' }}>{p.bio}</p>}
          </div>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer" aria-label="Fermer" style={{ flexShrink: 0 }}>✕</button>
        </div>

        {/* Stats profil */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {[
            { l: 'Abonnés', v: p ? fmt(p.followers) : '—' },
            { l: 'Abonnements', v: p ? fmt(p.following) : '—' },
            { l: 'Publications', v: p ? fmt(p.posts) : '—' },
            { l: 'Vues moy./reel', v: data?.avgViews ? fmt(data.avgViews) : '—' },
          ].map(s => (
            <div key={s.l} style={{ padding: '12px 8px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
              <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Grille des reels */}
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', margin: '0 0 12px' }}>
            Derniers reels {reels.length > 0 && `(${reels.length})`}
          </p>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sf-skeleton" style={{ aspectRatio: '9/16', borderRadius: 10 }} />)}
            </div>
          ) : reels.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-4)', textAlign: 'center', padding: '20px 0' }}>{notFound ? 'Compte introuvable via l\'API.' : 'Aucun reel trouvé.'}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {reels.map((r, i) => <ReelCard key={i} r={r} today={today} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ReelInfo { postedAt: string | null; views: number; likes: number; comments: number; url: string | null; thumb: string | null }
