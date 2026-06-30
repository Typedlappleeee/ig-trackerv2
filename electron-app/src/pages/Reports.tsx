/**
 * Reports — Dashboard « Aujourd'hui ».
 * Chaque client voit SES comptes (filtrés par ses accès) avec, pour la journée :
 * a posté / pas posté, la vidéo (miniature + lien), vues/likes/commentaires.
 * Données synchronisées 1×/jour côté serveur (run-scheduled-posts → account sync).
 *
 * Niveau gratuit : posté/pas posté via l'historique ScaleFlow (aucune API).
 * Niveau API : vidéo + stats par post (clé RapidAPI dans la config).
 */
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'

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
  synced_at: string | null
}

const DEFAULT_CFG: TrackingConfig = {
  enabled: false,
  sync_time: '12:00',
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
  const [testing, setTesting]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const cfgQ = supabase.from(table).select('tracking_config').eq(keyCol, keyVal).maybeSingle()
    let dQ = supabase.from('account_daily').select('*').eq('day', day)
    dQ = currentOrg ? dQ.eq('org_id', currentOrg.id) : dQ.eq('user_id', user.id).is('org_id', null)
    const [{ data: cfgData }, { data: dData }] = await Promise.all([cfgQ, dQ])
    const tc = (cfgData?.tracking_config ?? {}) as Partial<TrackingConfig>
    setCfg({ ...DEFAULT_CFG, ...tc })
    // Page réservée au superadmin ScaleFlow → on affiche tous les comptes (pas de
    // filtre par groupe : sinon un rôle org restrictif masquerait tout).
    setRows((dData ?? []) as DailyRow[])
    setShowCfg(prev => prev || !tc.enabled)
    setLoading(false)
  }, [table, keyCol, keyVal, currentOrg?.id, user.id, day])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setSaved(false)
    const { error } = await supabase.from(table).upsert({ [keyCol]: keyVal, tracking_config: cfg }, { onConflict: keyCol })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  // « Lancer maintenant » : déclenche la synchro hors de l'heure prévue.
  // Le cron (chaque minute) la détecte et la lance dans la minute qui suit.
  async function launchNow() {
    setLaunching(true); setLaunched(false)
    const next = { ...cfg, enabled: true, force_run: new Date().toISOString() }
    setCfg(next)
    await supabase.from(table).upsert({ [keyCol]: keyVal, tracking_config: next }, { onConflict: keyCol })
    setLaunching(false); setLaunched(true); setTimeout(() => setLaunched(false), 6000)
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
        `➡ Vues dernier reel : ${pr?.latest?.views ?? '—'}\n\n` +
        `(Détail complet dans la console — F12.)`
      alert(summary)
    } catch (e) { alert('Erreur : ' + String(e)) } finally { setTesting(false) }
  }

  // Groupement par VA (client).
  const vaMap = new Map<string, DailyRow[]>()
  for (const r of rows) { const k = r.va || 'Sans groupe'; const l = vaMap.get(k) ?? []; l.push(r); vaMap.set(k, l) }
  const vas = [...vaMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const totalPosted = rows.filter(r => r.posted).length
  const lastSync = rows.reduce<string | null>((m, r) => (r.synced_at && (!m || r.synced_at > m)) ? r.synced_at : m, null)

  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 8 }

  return (
    <div className="sf-page">
      <div className="sf-toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="sf-page-title">Rapports</h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
            Activité quotidienne par compte · maj 1×/jour {lastSync && `· dernière maj ${fmtTime(lastSync)}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={day} max={parisToday()} onChange={e => setDay(e.target.value)} className="sf-input" style={{ width: 150, height: 32 }} />
          <button onClick={() => setShowCfg(v => !v)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">{showCfg ? 'Masquer' : 'Configurer'}</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px 60px' }}>

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
                🔑 L'API Instagram est <b>gérée côté serveur</b> (clé agence) — rien à coller ici. Vues/likes/commentaires arrivent automatiquement. Sans clé serveur, le suivi marche quand même en « posté / pas posté ».
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={save} disabled={saving} className="sf-btn sf-btn-primary cursor-pointer" style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={launchNow} disabled={launching} className="sf-btn sf-btn-secondary cursor-pointer" style={{ opacity: launching ? 0.6 : 1 }}>{launching ? 'Lancement…' : '⚡ Lancer maintenant'}</button>
              <button onClick={testApi} disabled={testing} className="sf-btn sf-btn-secondary cursor-pointer" style={{ opacity: testing ? 0.6 : 1 }}>{testing ? 'Test…' : '🔍 Tester l\'API'}</button>
              {saved && <span style={{ fontSize: 12, color: 'var(--ok)' }}>✓ Enregistré</span>}
              {launched && <span style={{ fontSize: 12, color: 'var(--accent-l)' }}>⚡ Lancé — données dans quelques minutes (recharge la page)</span>}
            </div>
          </div>
        )}

        {/* En-tête du jour */}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <span className="sf-badge sf-badge-accent" style={{ fontSize: 12 }}>{totalPosted}/{rows.length} comptes ont posté</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>👁 {fmt(rows.reduce((s, r) => s + (r.views ?? 0), 0))} vues au total</span>
          </div>
        )}

        {/* Contenu */}
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <div className="sf-card" style={{ padding: '32px 24px', textAlign: 'center', maxWidth: 640 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 6px' }}>Aucune donnée pour ce jour</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              {cfg.enabled ? `La synchro tourne chaque jour à ${cfg.sync_time}. Reviens après cette heure.` : 'Active le suivi quotidien ci-dessus.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 900 }}>
            {vas.map(([vaName, accounts]) => (
              <div key={vaName}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-l)' }}>{vaName}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{accounts.filter(a => a.posted).length}/{accounts.length} postés</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {accounts.map(a => (
                    <div key={a.id} className="sf-card" style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center', opacity: a.posted ? 1 : 0.6 }}>
                      <div style={{ width: 46, height: 60, borderRadius: 8, flexShrink: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {a.reel_thumb
                          ? <img src={a.reel_thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 20 }}>{a.posted ? '🎬' : '—'}</span>}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.posted ? '✅' : '❌'} @{a.ig_username}
                        </p>
                        {a.posted ? (
                          <>
                            {(a.views != null) ? (
                              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>👁 {fmt(a.views)} · ❤ {fmt(a.likes)} · 💬 {fmt(a.comments)}</p>
                            ) : (
                              <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '4px 0 0' }}>posté{a.posted_via === 'scaleflow' ? ' via ScaleFlow' : ''}</p>
                            )}
                            {a.posted_at && <p style={{ fontSize: 10, color: 'var(--text-4)', margin: '2px 0 0' }}>{fmtTime(a.posted_at)}{a.reel_url && <> · <a href={a.reel_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-l)' }}>voir</a></>}</p>}
                          </>
                        ) : (
                          <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '4px 0 0' }}>Pas de vidéo</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
