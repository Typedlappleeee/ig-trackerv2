/**
 * Reports — « Rapports de tracking VA ».
 * Affiche les rapports générés 2×/jour par le serveur (a posté / pas posté +
 * vues/likes/commentaires par compte, groupés par VA) et la configuration
 * (heures, fenêtre, clé + URL de l'API Instagram type RapidAPI).
 *
 * Config stockée dans org_config.tracking_config (si org) ou app_config.tracking_config.
 * Les rapports sont générés côté serveur (run-scheduled-posts → tracking-report.ts).
 */
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'

interface TrackingConfig {
  enabled: boolean
  times: string[]
  window_hours: number
  rapidapi_key: string
  rapidapi_url: string
}
interface AccountResult {
  username: string; va: string
  status: 'posted' | 'not_posted'
  source: 'instagram' | 'scaleflow' | 'none'
  posted_at: string | null
  views: number | null; likes: number | null; comments: number | null
}
interface VaGroup { name: string; posted: number; total: number; accounts: AccountResult[] }
interface TrackingReport {
  id: string; label: string; slot: string
  total_accounts: number; posted: number; not_posted: number
  data: { vas: VaGroup[]; totals: { posted: number; total: number } }
  created_at: string
}

const DEFAULT_CFG: TrackingConfig = {
  enabled: false,
  times: ['09:30', '20:00'],
  window_hours: 14,
  rapidapi_key: '',
  rapidapi_url: 'https://instagram-scraper-2025.p.rapidapi.com/userreels/?username_or_id={username}',
}

function fmt(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k'
  return String(n)
}
function fmtTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function Reports({ user }: { user: User }) {
  const { currentOrg } = useOrg()
  const table  = currentOrg ? 'org_config' : 'app_config'
  const keyCol = currentOrg ? 'org_id' : 'user_id'
  const keyVal = currentOrg ? currentOrg.id : user.id

  const [cfg, setCfg]         = useState<TrackingConfig>(DEFAULT_CFG)
  const [reports, setReports] = useState<TrackingReport[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [showCfg, setShowCfg] = useState(false)
  const [newTime, setNewTime] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const cfgQ = supabase.from(table).select('tracking_config').eq(keyCol, keyVal).maybeSingle()
    let rQ = supabase.from('tracking_reports').select('*').order('created_at', { ascending: false }).limit(40)
    rQ = currentOrg ? rQ.eq('org_id', currentOrg.id) : rQ.eq('user_id', user.id).is('org_id', null)
    const [{ data: cfgData }, { data: rData }] = await Promise.all([cfgQ, rQ])
    const tc = (cfgData?.tracking_config ?? {}) as Partial<TrackingConfig>
    setCfg({ ...DEFAULT_CFG, ...tc, times: tc.times?.length ? tc.times : DEFAULT_CFG.times })
    setReports((rData ?? []) as TrackingReport[])
    setShowCfg(!(tc.enabled))   // ouvre la config si pas encore activé
    setLoading(false)
  }, [table, keyCol, keyVal, currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setSaved(false)
    const { error } = await supabase.from(table).upsert({ [keyCol]: keyVal, tracking_config: cfg }, { onConflict: keyCol })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 8 }

  return (
    <div className="sf-page">
      <div className="sf-toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="sf-page-title">Rapports de tracking</h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
            Vérifie 2×/jour si chaque compte a posté + vues/likes/commentaires.
          </p>
        </div>
        <button onClick={() => setShowCfg(v => !v)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">
          {showCfg ? 'Masquer' : 'Configurer'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px 60px' }}>

        {/* ── Configuration ── */}
        {showCfg && (
          <div className="sf-card" style={{ padding: 20, marginBottom: 22, maxWidth: 640 }}>
            <button onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))} className="cursor-pointer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', marginBottom: 16 }}>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Tracking automatique</p>
                <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '2px 0 0' }}>Génère un rapport aux heures choisies</p>
              </div>
              <span style={{ width: 34, height: 19, borderRadius: 99, position: 'relative', background: cfg.enabled ? 'var(--accent)' : 'rgba(255,255,255,0.12)', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: cfg.enabled ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
              </span>
            </button>

            <div style={{ marginBottom: 16 }}>
              <p style={lbl}>Heures du rapport (heure FR)</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {cfg.times.map(t => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 7, background: 'rgba(99,102,241,0.1)', border: '1px solid var(--border)', color: 'var(--accent-l)', fontSize: 12, fontWeight: 600 }}>
                    {t}
                    <button onClick={() => setCfg(c => ({ ...c, times: c.times.filter(x => x !== t) }))} className="cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-3)' }}>×</button>
                  </span>
                ))}
                <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="sf-input" style={{ width: 120, height: 30 }} />
                <button onClick={() => { if (/^\d{2}:\d{2}$/.test(newTime) && !cfg.times.includes(newTime)) { setCfg(c => ({ ...c, times: [...c.times, newTime].sort() })); setNewTime('') } }}
                  className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">+ Ajouter</button>
              </div>
            </div>

            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ ...lbl, marginBottom: 0 }}>Fenêtre</p>
              <input type="number" min={1} max={48} value={cfg.window_hours} onChange={e => setCfg(c => ({ ...c, window_hours: Math.max(1, Number(e.target.value) || 14) }))} className="sf-input" style={{ width: 70, height: 30, textAlign: 'center' }} />
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>h — un Reel plus récent que ça compte comme « posté »</span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <p style={lbl}>Clé API Instagram (RapidAPI)</p>
              <input type="password" value={cfg.rapidapi_key} onChange={e => setCfg(c => ({ ...c, rapidapi_key: e.target.value }))} placeholder="x-rapidapi-key…" className="sf-input" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <p style={lbl}>URL de l'endpoint Reels</p>
              <input value={cfg.rapidapi_url} onChange={e => setCfg(c => ({ ...c, rapidapi_url: e.target.value }))} placeholder="https://….p.rapidapi.com/…?username_or_id={username}" className="sf-input" style={{ width: '100%' }} />
              <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '5px 0 0' }}>
                Doit contenir <code style={{ color: 'var(--accent-l)' }}>{'{username}'}</code> (remplacé par chaque compte). Sans clé API, le rapport se base sur l'historique de ScaleFlow uniquement.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={save} disabled={saving} className="sf-btn sf-btn-primary cursor-pointer" style={{ opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {saved && <span style={{ fontSize: 12, color: 'var(--ok)' }}>✓ Enregistré</span>}
            </div>
          </div>
        )}

        {/* ── Liste des rapports ── */}
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Chargement…</p>
        ) : reports.length === 0 ? (
          <div className="sf-card" style={{ padding: '32px 24px', textAlign: 'center', maxWidth: 640 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 6px' }}>Aucun rapport pour l'instant</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              {cfg.enabled ? 'Le premier rapport arrivera à la prochaine heure configurée.' : 'Active le tracking ci-dessus pour recevoir des rapports automatiques.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
            {reports.map(r => (
              <div key={r.id} className="sf-card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{r.label}</span>
                  <span className="sf-badge sf-badge-accent">{r.posted}/{r.total_accounts} postés</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {r.data?.vas?.map(va => (
                    <div key={va.name}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-l)' }}>{va.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{va.posted}/{va.total}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {va.accounts.map(a => (
                          <div key={a.username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>{a.status === 'posted' ? '✅' : '❌'}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              @{a.username}
                              {a.posted_at && <span style={{ color: 'var(--text-4)', fontWeight: 400 }}> · {fmtTime(a.posted_at)}</span>}
                            </span>
                            {a.status === 'posted' && a.source === 'instagram' && (
                              <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                👁 {fmt(a.views)} · ❤ {fmt(a.likes)} · 💬 {fmt(a.comments)}
                              </span>
                            )}
                            {a.status === 'posted' && a.source === 'scaleflow' && (
                              <span className="sf-badge sf-badge-muted" style={{ flexShrink: 0 }}>via ScaleFlow</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                  TOTAL : {r.posted} postés · {r.not_posted} manqués sur {r.total_accounts} comptes
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
