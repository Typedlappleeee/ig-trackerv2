/**
 * Reports — « Mes comptes ».
 * 1 téléphone = 1 compte Instagram. On liste TOUS les comptes (phones avec un
 * ig_username), organisés par leur groupe GéeLark natif (group_name).
 * Les stats (followers, posté aujourd'hui, vues) s'affichent quand elles sont là
 * — le fetch/synchro se branche derrière (bouton Sync via GéeLark ou cron).
 */
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useLicense } from '@/lib/license'
import { useConnections } from '@/lib/connections'
import { syncGeelarkAnalytics } from '@/lib/geelarkAnalytics'
import { AccountTracker } from './AccountTracker'

interface TrackingConfig { enabled: boolean; sync_time: string; force_run?: string }

// Un compte = un téléphone (1 tél = 1 compte IG). ig_username peut être vide
// (téléphone pas encore lié à un compte).
interface Account {
  id: string; ig_username: string | null; phone_name: string | null
  group_name: string | null      // groupe GéeLark natif
  followers: number | null; pp_url: string | null
  account_state: string | null   // 'ok' | 'banned' | 'shadow'
  last_post_at: string | null
  // données du jour (account_daily), si dispo
  posted: boolean; posted_at: string | null; posts_today: number | null
  reel_url: string | null; views: number | null; likes: number | null; comments: number | null
  synced_at: string | null
}
interface TrendPoint { day: string; views: number }
interface ReelInfo { postedAt: string | null; views: number; likes: number; comments: number; url: string | null; thumb: string | null }

const DEFAULT_CFG: TrackingConfig = { enabled: false, sync_time: '12:00' }

const _isWeb = typeof window !== 'undefined' && !(window as unknown as { electronAPI?: unknown }).electronAPI
function igimg(u: string | null | undefined): string | undefined {
  if (!u) return undefined
  if (!_isWeb || !/^https?:\/\//i.test(u)) return u
  return `/api/ig?url=${encodeURIComponent(u)}`
}
function parisToday(): string { return new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }) }
function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k'
  return String(n)
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
}
function agoLabel(iso: string | null): string {
  if (!iso) return 'jamais synchronisé'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  const h = Math.round(mins / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

export function Reports({ user }: { user: User }) {
  const { currentOrg, role } = useOrg()
  const isSuperAdmin = useLicense()?.isSuperAdmin === true
  // Stats réservées à l'agence (owner/admin/superadmin, ou solo) — « bientôt » pour les autres.
  const canStats = isSuperAdmin || !currentOrg || role === 'owner' || role === 'admin'
  const { bearer } = useConnections(user)
  const table  = currentOrg ? 'org_config' : 'app_config'
  const keyCol = currentOrg ? 'org_id' : 'user_id'
  const keyVal = currentOrg ? currentOrg.id : user.id

  const [view, setView]       = useState<'gestion' | 'stats' | 'tracker'>('gestion')
  const [cfg, setCfg]         = useState<TrackingConfig>(DEFAULT_CFG)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [day]                 = useState(parisToday())
  const [loading, setLoading] = useState(true)
  const [trend, setTrend]     = useState<TrendPoint[]>([])

  // Organisation par groupe GéeLark natif (les 700 tels y sont déjà rangés).
  const [geeGroup, setGeeGroup] = useState<string>('__all__')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(60)   // pagination : on cape l'affichage
  useEffect(() => { setLimit(60) }, [geeGroup, search])
  const [linkOpen, setLinkOpen] = useState(false)   // modale « Lier des comptes »

  // Synchro / config
  const [glSyncing, setGlSyncing] = useState(false)
  const [glMsg, setGlMsg]         = useState('')
  const [showCfg, setShowCfg]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [launching, setLaunching] = useState(false)

  // Détail compte
  const [detailRow, setDetailRow]         = useState<Account | null>(null)
  const [detail, setDetail]               = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function openDetail(a: Account) {
    setDetailRow(a); setDetail(null); setDetailLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('run-scheduled-posts', { body: { detail: 'account', username: a.ig_username } })
      if (error) setDetail({ error: error.message }); else setDetail(data)
    } catch (e) { setDetail({ error: String(e) }) } finally { setDetailLoading(false) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const cfgQ = supabase.from(table).select('tracking_config').eq(keyCol, keyVal).maybeSingle()
    // Base : TOUS les téléphones (1 tél = 1 compte ; ig_username éventuellement vide).
    let pQ = supabase.from('phones')
      .select('id, ig_username, phone_name, group_name, followers, pp_url, account_state, last_post_at')
      .order('phone_name')
    pQ = currentOrg ? pQ.eq('org_id', currentOrg.id) : pQ.eq('user_id', user.id).is('org_id', null)
    // Données du jour (posté / vues) mergées par phone_id.
    let dQ = supabase.from('account_daily').select('*').eq('day', day)
    dQ = currentOrg ? dQ.eq('org_id', currentOrg.id) : dQ.eq('user_id', user.id).is('org_id', null)
    // Courbe 30 j (vues publiées) — depuis les données stockées, aucun appel API.
    const from30 = new Date(new Date(day + 'T12:00:00').getTime() - 29 * 86_400_000).toLocaleDateString('fr-CA')
    let tQ = supabase.from('account_daily').select('day, views, posted').eq('posted', true).gte('day', from30).lte('day', day)
    tQ = currentOrg ? tQ.eq('org_id', currentOrg.id) : tQ.eq('user_id', user.id).is('org_id', null)

    const [{ data: cfgData }, { data: pData }, { data: dData }, { data: tData }] = await Promise.all([cfgQ, pQ, dQ, tQ])
    setCfg({ ...DEFAULT_CFG, ...((cfgData?.tracking_config ?? {}) as Partial<TrackingConfig>) })

    const dMap = new Map<string, any>((dData ?? []).map((r: any) => [r.phone_id, r]))
    const list: Account[] = ((pData ?? []) as any[]).map(p => {
      const d = dMap.get(p.id)
      return {
        id: p.id, ig_username: p.ig_username ?? null, phone_name: p.phone_name ?? null,
        group_name: p.group_name ?? null,
        followers: p.followers ?? null, pp_url: p.pp_url ?? null,
        account_state: p.account_state ?? null, last_post_at: p.last_post_at ?? null,
        posted: !!d?.posted, posted_at: d?.posted_at ?? null, posts_today: d?.posts_today ?? null,
        reel_url: d?.reel_url ?? null, views: d?.views ?? null, likes: d?.likes ?? null, comments: d?.comments ?? null,
        synced_at: d?.synced_at ?? null,
      }
    })
    // Comptes renseignés d'abord (par followers), puis les tels sans @pseudo.
    list.sort((a, b) => {
      if (!!a.ig_username !== !!b.ig_username) return a.ig_username ? -1 : 1
      return (b.followers ?? 0) - (a.followers ?? 0) || (a.ig_username ?? a.phone_name ?? '').localeCompare(b.ig_username ?? b.phone_name ?? '')
    })
    setAccounts(list)

    const byDay = new Map<string, number>()
    for (const r of (tData ?? []) as { day: string; views: number | null }[]) byDay.set(r.day, (byDay.get(r.day) ?? 0) + (r.views ?? 0))
    const series: TrendPoint[] = []
    for (let i = 29; i >= 0; i--) {
      const dd = new Date(new Date(day + 'T12:00:00').getTime() - i * 86_400_000).toLocaleDateString('fr-CA')
      series.push({ day: dd, views: byDay.get(dd) ?? 0 })
    }
    setTrend(series)
    setLoading(false)
  }, [table, keyCol, keyVal, currentOrg?.id, user.id, day])

  useEffect(() => { load() }, [load])

  // ── Liaison compte ↔ téléphone (1 tél = 1 compte) ────────────────────────────
  async function setUsername(acc: Account, raw: string) {
    const clean = raw.trim().replace(/^@+/, '').toLowerCase() || null
    if (clean === (acc.ig_username ?? null)) return
    setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, ig_username: clean } : a))
    const { error } = await supabase.from('phones').update({ ig_username: clean }).eq('id', acc.id)
    if (error) { console.error('[Reports] setUsername', error); load() }
  }
  // Liaison en masse : une paire {id, pseudo} par téléphone → un seul aller-retour.
  async function bulkLink(pairs: { id: string; u: string }[]) {
    const updates = pairs.filter(p => p.u)
    if (!updates.length) return
    setAccounts(prev => prev.map(a => { const up = updates.find(x => x.id === a.id); return up ? { ...a, ig_username: up.u } : a }))
    try { await Promise.all(updates.map(up => supabase.from('phones').update({ ig_username: up.u }).eq('id', up.id))) }
    catch (e) { console.error('[Reports] bulkLink', e); load() }
  }

  // ── Sync ───────────────────────────────────────────────────────────────────
  async function syncViaGeelark() {
    setGlSyncing(true); setGlMsg('')
    try {
      const r = await syncGeelarkAnalytics(bearer, currentOrg?.id ?? null, user.id)
      if (r.needsPro) setGlMsg('❌ Analytics indisponible — plan Pro GéeLark requis')
      else if (!r.ok) setGlMsg('❌ ' + (r.error ?? 'Échec'))
      else setGlMsg(`✓ ${r.updated} compte(s) mis à jour`)
    } catch (e) { setGlMsg('❌ ' + String(e)) }
    await load(); setGlSyncing(false); setTimeout(() => setGlMsg(''), 8000)
  }
  async function saveCfg() {
    setSaving(true); setSaved(false)
    await supabase.from(table).upsert({ [keyCol]: keyVal, tracking_config: cfg }, { onConflict: keyCol })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  async function launchNow() {
    setLaunching(true)
    const next = { ...cfg, enabled: true, force_run: new Date().toISOString() }
    setCfg(next)
    await supabase.from(table).upsert({ [keyCol]: keyVal, tracking_config: next }, { onConflict: keyCol })
    try { await supabase.functions.invoke('run-scheduled-posts', { body: { sync: 'accounts' } }) } catch { /* ignore */ }
    await load(); setLaunching(false)
  }

  // ── Dérivés ──────────────────────────────────────────────────────────────
  const named    = accounts.filter(a => a.ig_username)   // comptes IG liés
  const unlinked = accounts.filter(a => !a.ig_username)  // tels sans compte
  const geeGroups = [...new Set(accounts.map(a => a.group_name).filter(Boolean) as string[])].sort()

  const filtered = named.filter(a => {
    if (geeGroup !== '__all__' && (a.group_name ?? '') !== geeGroup) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return (a.ig_username ?? '').toLowerCase().includes(q) || (a.phone_name ?? '').toLowerCase().includes(q)
    }
    return true
  })
  const shown = filtered.slice(0, limit)

  const totalFollowers = named.reduce((s, a) => s + (a.followers ?? 0), 0)
  const okCount        = named.filter(a => !a.account_state || a.account_state === 'ok').length
  const postedToday    = named.filter(a => a.posted).length
  const lastSync       = accounts.reduce<string | null>((m, a) => (a.synced_at && (!m || a.synced_at > m)) ? a.synced_at : m, null)
  const hasTrend       = trend.some(t => t.views > 0)

  return (
    <div className="sf-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sf-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'linear-gradient(135deg,#8B5CF6,#6366F1)', boxShadow: '0 10px 24px -8px rgba(139,92,246,0.5), inset 0 1px 0 0 rgba(255,255,255,0.35)' }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <h1 className="sf-page-title">{view === 'tracker' ? 'Suivi des comptes' : view === 'stats' ? 'Stats' : 'Gestion des comptes'}</h1>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
              {view === 'tracker'
                ? 'Tableau partagé — le suivi de tous vos comptes par plateforme'
                : view === 'stats'
                ? `Followers & vues de tes comptes${lastSync ? ` · dernière synchro ${agoLabel(lastSync)}` : ''}`
                : 'Lie tes téléphones à un compte Instagram (1 téléphone = 1 compte)'}
            </p>
          </div>
        </div>
        {view === 'gestion' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setLinkOpen(true)} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" style={{ position: 'relative' }}>
              🔗 Lier des comptes
              {unlinked.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: 'rgba(255,255,255,0.22)' }}>{unlinked.length}</span>}
            </button>
          </div>
        )}
        {view === 'stats' && canStats && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={syncViaGeelark} disabled={glSyncing || !bearer} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ opacity: (glSyncing || !bearer) ? 0.6 : 1 }} title="Récupère followers/vues via l'analytics GéeLark (inclus)">
              {glSyncing ? '⏳ Synchro…' : '🟢 Sync'}
            </button>
            <button onClick={() => setShowCfg(v => !v)} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">{showCfg ? 'Masquer' : '⚙︎'}</button>
            {glMsg && <span style={{ fontSize: 12, color: glMsg.startsWith('❌') ? 'var(--err)' : 'var(--ok)' }}>{glMsg}</span>}
          </div>
        )}
      </div>

      {/* Onglets : Gestion (liaison tél↔IG) · Stats · Suivi (tableau) */}
      <div style={{ display: 'flex', gap: 6, padding: '0 28px', borderBottom: '1px solid var(--border)' }}>
        {([['gestion', '🔗 Gestion des comptes'], ['stats', '📊 Stats'], ['tracker', '🗂️ Suivi des comptes']] as const).map(([v, lbl]) => (
          <button key={v} onClick={() => setView(v)} className="cursor-pointer" style={{
            padding: '10px 16px', fontSize: 13, fontWeight: 700, background: 'transparent', border: 'none',
            color: view === v ? 'var(--text-1)' : 'var(--text-4)',
            borderBottom: `2px solid ${view === v ? 'var(--accent)' : 'transparent'}`, marginBottom: -1,
          }}>{lbl}</button>
        ))}
      </div>

      {view === 'tracker' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px 60px' }}>
          <AccountTracker user={user} orgId={currentOrg?.id ?? null} />
        </div>
      ) : view === 'stats' ? (
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px 60px' }}>
        {!canStats ? (
          <div className="sf-card" style={{ padding: '44px 26px', textAlign: 'center', maxWidth: 520, margin: '20px auto' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 6px' }}>Bientôt disponible</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>Les statistiques de tes comptes (followers, vues, croissance) arrivent très bientôt. En attendant, gère tes comptes dans l'onglet « Gestion des comptes ».</p>
          </div>
        ) : (
        <>
        {/* Config (repliée par défaut) */}
        {showCfg && (
          <div className="sf-card" style={{ padding: 18, marginBottom: 18, maxWidth: 620 }}>
            <button onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))} className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Synchro quotidienne automatique</p>
                <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '2px 0 0' }}>Met à jour followers & stats 1×/jour</p>
              </div>
              <span style={{ width: 34, height: 19, borderRadius: 99, position: 'relative', background: cfg.enabled ? 'var(--accent)' : 'rgba(255,255,255,0.12)', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: cfg.enabled ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
              </span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Heure (FR)</span>
              <input type="time" value={cfg.sync_time} onChange={e => setCfg(c => ({ ...c, sync_time: e.target.value }))} className="sf-input" style={{ width: 120, height: 32 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={saveCfg} disabled={saving} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer">{saving ? '…' : 'Enregistrer'}</button>
              <button onClick={launchNow} disabled={launching} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">{launching ? '⏳ Synchro…' : '⚡ Lancer maintenant'}</button>
              {saved && <span style={{ fontSize: 12, color: 'var(--ok)' }}>✓ Enregistré</span>}
            </div>
          </div>
        )}

        {/* Tuiles */}
        {!loading && accounts.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
            <StatCard icon="👥" label="Abonnés (total)" value={fmt(totalFollowers)} accent="var(--text-1)" />
            <StatCard icon="📱" label="Comptes liés" value={String(named.length)} sub={unlinked.length > 0 ? `${unlinked.length} tél. à lier` : `${geeGroups.length} groupe${geeGroups.length > 1 ? 's' : ''}`} />
            <StatCard icon="✅" label="Comptes OK" value={`${okCount}/${named.length || 0}`} accent={named.length && okCount === named.length ? 'var(--ok)' : '#fbbf24'} />
            <StatCard icon="🚀" label="Postés aujourd'hui" value={`${postedToday}/${named.length || 0}`} accent="var(--accent-l)" />
          </div>
        )}

        {/* Courbe (seulement si on a des données) */}
        {!loading && hasTrend && <ViewsChart data={trend} />}
        {!loading && named.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-4)', fontSize: 13 }}>Aucune stat pour l'instant — lie des comptes puis clique « Sync ».</div>
        )}
        </>
        )}
      </div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px 60px' }}>
        {/* Filtres : groupe GéeLark (dropdown) + recherche */}
        {!loading && named.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {geeGroups.length > 0 && (
              <select value={geeGroup} onChange={e => setGeeGroup(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 32, fontSize: 12.5 }} title="Filtrer par groupe GéeLark">
                <option value="__all__">Tous les groupes</option>
                {geeGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (pseudo, téléphone)…" className="sf-input" style={{ flex: 1, minWidth: 180, maxWidth: 320, height: 32, fontSize: 12.5 }} />
            <span style={{ fontSize: 12, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>{filtered.length} compte{filtered.length > 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Liste des comptes liés */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 900 }}>
            {[0, 1, 2, 3].map(i => <div key={i} className="sf-card sf-skeleton" style={{ height: 60 }} />)}
          </div>
        ) : accounts.length === 0 ? (
          <div className="sf-card" style={{ padding: '44px 24px', textAlign: 'center', maxWidth: 560, margin: '10px auto' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📱</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>Aucun téléphone pour l'instant</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
              Synchronise tes cloud phones GéeLark depuis l'onglet <b>Téléphones</b>, puis clique <b>Lier des comptes</b> pour les associer à un Instagram.
            </p>
          </div>
        ) : named.length === 0 ? (
          <div className="sf-card" style={{ padding: '44px 24px', textAlign: 'center', maxWidth: 560, margin: '10px auto' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🔗</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>Aucun compte lié</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Tu as <b>{unlinked.length} téléphone{unlinked.length > 1 ? 's' : ''}</b> à associer à un compte Instagram.
            </p>
            <button onClick={() => setLinkOpen(true)} className="sf-btn sf-btn-primary cursor-pointer">🔗 Lier des comptes</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-4)', fontSize: 13.5 }}>Aucun compte dans ce filtre.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 960 }}>
              {shown.map(a => (
                <AccountRow key={a.id} a={a} onOpen={() => openDetail(a)} onSetUsername={v => setUsername(a, v)} />
              ))}
            </div>
            {filtered.length > shown.length && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => setLimit(l => l + 60)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">
                  Voir plus ({filtered.length - shown.length} restant{filtered.length - shown.length > 1 ? 's' : ''})
                </button>
              </div>
            )}
          </>
        )}
      </div>
      )}

      {linkOpen && <LinkModal phones={unlinked} geeGroups={geeGroups} onClose={() => setLinkOpen(false)} onBulkLink={bulkLink} />}

      {detailRow && <AccountDetailModal row={detailRow} data={detail} loading={detailLoading} onClose={() => setDetailRow(null)} />}
    </div>
  )
}

// ── Ligne compte (lié) ────────────────────────────────────────────────────────
function AccountRow({ a, onOpen, onSetUsername }: { a: Account; onOpen: () => void; onSetUsername: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(a.ig_username ?? '')
  useEffect(() => { setVal(a.ig_username ?? '') }, [a.ig_username])
  const state = a.account_state
  const pill = state === 'banned' ? { t: 'BANNI', c: '#f87171', b: 'rgba(239,68,68,0.15)', bd: 'rgba(239,68,68,0.3)' }
    : state === 'shadow' ? { t: 'SHADOW?', c: '#fbbf24', b: 'rgba(251,191,36,0.15)', bd: 'rgba(251,191,36,0.3)' }
    : { t: 'OK', c: 'var(--ok)', b: 'rgba(34,197,94,0.12)', bd: 'rgba(34,197,94,0.25)' }
  const commit = () => { setEditing(false); onSetUsername(val) }
  return (
    <div className="sf-card sf-card-lift cursor-pointer" onClick={!editing ? onOpen : undefined}
      style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 13 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
        {a.pp_url ? <img src={igimg(a.pp_url)} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-3)' }}>{(a.ig_username ?? '?').charAt(0).toUpperCase()}</span>}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        {editing ? (
          <input autoFocus value={val} onClick={e => e.stopPropagation()} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(a.ig_username ?? ''); setEditing(false) } }}
            onBlur={commit} placeholder="pseudo (vide = délier)" className="sf-input" style={{ height: 30, fontSize: 13, maxWidth: 240 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{a.ig_username}</span>
            <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: pill.b, color: pill.c, border: `1px solid ${pill.bd}`, flexShrink: 0 }}>{pill.t}</span>
            {a.group_name && <span className="sf-badge" style={{ fontSize: 9.5 }}>{a.group_name}</span>}
            <button onClick={e => { e.stopPropagation(); setEditing(true) }} className="cursor-pointer" title="Modifier / délier" style={{ border: 'none', background: 'transparent', color: 'var(--text-4)', fontSize: 12, padding: 0 }}>✎</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
          <span>👥 {fmt(a.followers)} abonnés</span>
          <span style={{ color: a.posted ? 'var(--ok)' : 'var(--text-4)' }}>{a.posted ? '● posté' : '○ pas posté'}</span>
          <span style={{ color: 'var(--text-4)' }}>📱 {a.phone_name ?? a.id.slice(-6)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Modale « Lier des comptes » ────────────────────────────────────────────────
// On associe chaque téléphone (non lié) à un @pseudo. Deux modes : saisie ligne
// par ligne, ou collage en masse (un pseudo par ligne, dans l'ordre affiché).
function LinkModal({ phones, geeGroups, onClose, onBulkLink }: {
  phones: Account[]; geeGroups: string[]; onClose: () => void
  onBulkLink: (pairs: { id: string; u: string }[]) => Promise<void>
}) {
  const [group, setGroup] = useState<string>(geeGroups[0] ?? '__all__')
  const [search, setSearch] = useState('')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const list = phones.filter(p => {
    if (group !== '__all__' && (p.group_name ?? '') !== group) return false
    if (search.trim()) return (p.phone_name ?? '').toLowerCase().includes(search.trim().toLowerCase())
    return true
  })
  const capped = list.slice(0, 300)  // garde-fou anti-lag

  function pasteBulk(text: string) {
    const names = text.split('\n').map(s => s.trim().replace(/^@+/, '').toLowerCase())
    setVals(prev => {
      const next = { ...prev }
      capped.forEach((p, i) => { if (names[i]) next[p.id] = names[i] })
      return next
    })
  }
  async function save() {
    const pairs = Object.entries(vals).map(([id, u]) => ({ id, u: u.trim().replace(/^@+/, '').toLowerCase() })).filter(p => p.u)
    if (!pairs.length) { onClose(); return }
    setBusy(true); await onBulkLink(pairs); setBusy(false); onClose()
  }
  const filledCount = Object.values(vals).filter(v => v.trim()).length

  return (
    <div className="sf-modal-bg" onClick={onClose} style={{ zIndex: 9100 }}>
      <div className="sf-modal anim-scale-in" onClick={e => e.stopPropagation()} style={{ width: 'min(680px, 95vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>🔗 Lier des comptes</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>{phones.length} téléphone{phones.length > 1 ? 's' : ''} sans compte · associe un @pseudo Instagram à chacun</p>
          </div>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer" aria-label="Fermer">✕</button>
        </div>

        {/* Filtres + collage en masse */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {geeGroups.length > 0 && (
              <select value={group} onChange={e => setGroup(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 32, fontSize: 12.5 }}>
                <option value="__all__">Tous les groupes</option>
                {geeGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer par nom de téléphone…" className="sf-input" style={{ flex: 1, minWidth: 160, height: 32, fontSize: 12.5 }} />
            <span style={{ fontSize: 12, color: 'var(--text-4)', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>{list.length} tél.</span>
          </div>
          <details>
            <summary style={{ fontSize: 12, color: 'var(--accent-l)', cursor: 'pointer' }}>⚡ Coller une liste (un pseudo par ligne, dans l'ordre)</summary>
            <textarea onChange={e => pasteBulk(e.target.value)} rows={4} placeholder={'compte1\ncompte2\ncompte3'} className="sf-input" style={{ width: '100%', marginTop: 8, fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical' }} />
          </details>
        </div>

        {/* Liste des tels à lier */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px' }}>
          {list.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13, padding: '30px 0' }}>Aucun téléphone à lier dans ce filtre. 🎉</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {capped.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📱 {p.phone_name ?? p.id.slice(-6)}</span>
                  <span style={{ color: 'var(--text-4)', fontSize: 13 }}>@</span>
                  <input value={vals[p.id] ?? ''} onChange={e => setVals(v => ({ ...v, [p.id]: e.target.value }))} placeholder="pseudo Instagram" className="sf-input" style={{ width: 220, height: 30, fontSize: 12.5 }} />
                </div>
              ))}
              {list.length > capped.length && <p style={{ fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center', marginTop: 6 }}>+{list.length - capped.length} autres — affine le filtre pour les voir.</p>}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 'auto' }}>{filledCount} à lier</span>
          <button onClick={onClose} className="sf-btn sf-btn-ghost cursor-pointer">Annuler</button>
          <button onClick={save} disabled={busy || filledCount === 0} className="sf-btn sf-btn-primary cursor-pointer" style={{ opacity: (busy || filledCount === 0) ? 0.6 : 1 }}>{busy ? 'Liaison…' : `Lier ${filledCount} compte${filledCount > 1 ? 's' : ''}`}</button>
        </div>
      </div>
    </div>
  )
}

// ── Courbe (SVG) ──────────────────────────────────────────────────────────────
function ViewsChart({ data }: { data: TrendPoint[] }) {
  const W = 760, H = 140, P = 6
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
  return (
    <div className="sf-card" style={{ padding: '16px 18px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)' }}>Vues publiées · 30 jours</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{fmt(lastV)} aujourd'hui</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 140, display: 'block' }}>
        <defs><linearGradient id="rpt-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(99,102,241,0.35)" /><stop offset="100%" stopColor="rgba(99,102,241,0)" /></linearGradient></defs>
        <path d={area} fill="url(#rpt-grad)" />
        <path d={line} fill="none" stroke="#818CF8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([x, y], i) => data[i].views > 0 && i === n - 1 ? <circle key={i} cx={x} cy={y} r="3.5" fill="#818CF8" /> : null)}
      </svg>
    </div>
  )
}

function StatCard({ icon, label, value, sub, accent }: { icon: string; label: string; value: string; sub?: string; accent?: string }) {
  return (
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
}

// ── Modal détail d'un compte ────────────────────────────────────────────────
function fmtReelDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
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
        {r.postedAt && <div style={{ padding: '0 7px 6px', fontSize: 9, color: isToday ? 'var(--ok)' : 'var(--text-4)', fontWeight: isToday ? 700 : 400 }}>📅 {isToday ? "Aujourd'hui" : fmtReelDate(r.postedAt)}</div>}
      </a>
      <button onClick={e => { e.preventDefault(); e.stopPropagation(); setInfo(v => !v) }} aria-label="Infos du reel" style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: 'rgba(0,0,0,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', cursor: 'pointer' }}>ⓘ</button>
      {info && (
        <div onClick={e => { e.stopPropagation(); setInfo(false) }} style={{ position: 'absolute', inset: 0, background: 'rgba(10,11,14,0.92)', padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, fontSize: 10.5, color: 'var(--text-2)', cursor: 'pointer' }}>
          <div style={{ fontWeight: 700, color: isToday ? 'var(--ok)' : 'var(--text-1)', marginBottom: 2 }}>📅 {fullDate}</div>
          <div>👁 {fmt(r.views)} vues</div>
          <div>❤ {fmt(r.likes)} · 💬 {fmt(r.comments)}</div>
          {r.url && <div style={{ color: 'var(--accent-l)', marginTop: 4 }}>Ouvrir le reel ↗</div>}
        </div>
      )}
    </div>
  )
}
function AccountDetailModal({ row, data, loading, onClose }: { row: Account; data: any; loading: boolean; onClose: () => void }) {
  const p = data?.profile
  const reels: ReelInfo[] = data?.reels ?? []
  const notFound = data && data.found === false
  const today = parisToday()
  const postsToday = reels.filter(r => r.postedAt && r.postedAt.slice(0, 10) === today).length
  return (
    <div className="sf-modal-bg" onClick={onClose} style={{ zIndex: 9000 }}>
      <div className="sf-modal anim-scale-in" onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {[
            { l: 'Abonnés', v: p ? fmt(p.followers) : fmt(row.followers) },
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
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', margin: '0 0 12px' }}>Derniers reels {reels.length > 0 && `(${reels.length})`}</p>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="sf-skeleton" style={{ aspectRatio: '9/16', borderRadius: 10 }} />)}</div>
          ) : reels.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-4)', textAlign: 'center', padding: '20px 0' }}>{notFound ? 'Compte introuvable via l\'API.' : 'Aucun reel trouvé.'}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>{reels.map((r, i) => <ReelCard key={i} r={r} today={today} />)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
