// Admin — Cloud Phones maison (auto-hébergés, voir selfhost/). Réservé au
// super-admin. Configure l'agent (URL + token), liste les téléphones dans une
// table façon GeeLark, et ouvre chacun dans sa propre fenêtre flottante.
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useLicense } from '@/lib/license'
import { useOrg } from '@/lib/orgContext'
import { useTr } from '@/lib/i18n'
import {
  cloudPhones, loadCloudAgentConfig, saveCloudAgentConfig, getCloudAgent,
  loadAllCpMeta, saveCpMeta, removeCpMeta, genPhoneId,
  type CpInstance, type CpMeta,
} from '@/lib/cloudPhones'
import { CloudPhoneWindow } from '@/components/CloudPhoneWindow'

interface Props { user: User }

type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'

// Systèmes proposés à la création. '' = image officielle redroid (Android 15) +
// Aurora Store ; '13/14' = builds tiers avec Play Store & services Google.
const ANDROID_OPTS = [
  { value: '',       android: '15', store: 'Aurora Store', title: 'Android 15', desc: 'Image officielle redroid + Aurora Store. Recommandé, sans compte Google.', recommended: true },
  { value: '14.0.0', android: '14', store: 'Play Store',   title: 'Android 14', desc: 'Google Play Store & services Google intégrés (build tiers).' },
  { value: '13.0.0', android: '13', store: 'Play Store',   title: 'Android 13', desc: 'Google Play Store & services Google intégrés (build tiers).' },
] as const

export function CloudPhones({ user }: Props) {
  const tr = useTr()
  const license = useLicense()
  const { currentOrg } = useOrg()
  const isSuperAdmin = license.isSuperAdmin

  const [conn, setConn] = useState<Conn>('checking')
  const [connMsg, setConnMsg] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyErr, setKeyErr] = useState('')

  const [instances, setInstances] = useState<CpInstance[]>([])
  const [meta, setMeta] = useState<Record<string, CpMeta>>(() => loadAllCpMeta())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Modal de création (vrai formulaire, pas un simple champ nom).
  const [showCreate, setShowCreate] = useState(false)
  const [cName, setCName] = useState('')
  const [cAndroid, setCAndroid] = useState<string>('')
  const [cQty, setCQty] = useState(1)
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  // Fenêtres flottantes ouvertes (façon GeeLark) : une par tel, indépendantes.
  const [openIds, setOpenIds] = useState<string[]>([])
  const [zOrder, setZOrder] = useState<string[]>([])   // ordre d'empilement (dernier = au-dessus)
  const openWindow = (id: string) => {
    setOpenIds(o => o.includes(id) ? o : [...o, id])
    setZOrder(z => [...z.filter(x => x !== id), id])
  }
  const closeWindow = (id: string) => { setOpenIds(o => o.filter(x => x !== id)); setZOrder(z => z.filter(x => x !== id)) }
  const focusWindow = (id: string) => setZOrder(z => [...z.filter(x => x !== id), id])

  const loadInstances = useCallback(async () => {
    const r = await cloudPhones.list()
    if (r.ok) setInstances(r.data?.instances ?? [])
  }, [])

  const checkConn = useCallback(async () => {
    setConn('checking'); setConnMsg('')
    const { url, token } = getCloudAgent()
    if (!url || !token) { setConn('unconfigured'); setShowKey(true); return }
    const r = await cloudPhones.health()
    if (r.ok) { setConn('ok'); loadInstances() }
    else { setConn('error'); setConnMsg(r.error ?? `Erreur ${r.status ?? ''}`) }
  }, [loadInstances])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const cfg = await loadCloudAgentConfig(currentOrg?.id ?? null, user.id)
      if (!alive) return
      if (cfg) { setUrlInput(cfg.url); setTokenInput(cfg.token) }
      checkConn()
    })()
    return () => { alive = false }
  }, [currentOrg?.id, user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rafraîchit la liste toutes les 8s quand connecté (statuts à jour sans y penser).
  useEffect(() => {
    if (conn !== 'ok') return
    const t = window.setInterval(loadInstances, 8000)
    return () => window.clearInterval(t)
  }, [conn, loadInstances])

  const saveKey = async () => {
    if (!urlInput.trim() || !tokenInput.trim()) return
    setSavingKey(true); setKeyErr('')
    const r = await saveCloudAgentConfig(currentOrg?.id ?? null, user.id, urlInput, tokenInput)
    setSavingKey(false)
    if (r.ok) { setShowKey(false); checkConn() }
    else setKeyErr(`Échec : ${r.error ?? 'erreur inconnue'}`)
  }

  const openCreate = () => {
    setCName(''); setCAndroid(''); setCQty(1); setCreateMsg(''); setShowCreate(true)
  }

  // Crée `cQty` téléphones : un id de création unique par tel, la version choisie,
  // et on capture le modèle (fingerprint) renvoyé par l'agent dans les métadonnées.
  const createPhones = async () => {
    const base = cName.trim()
    if (!base || creating) return
    const opt = ANDROID_OPTS.find(o => o.value === cAndroid) ?? ANDROID_OPTS[0]
    setCreating(true)
    let ok = 0
    for (let i = 0; i < cQty; i++) {
      const friendly = cQty > 1 ? `${base} ${i + 1}` : base
      setCreateMsg(tr(`Création ${i + 1}/${cQty}…`, `Creating ${i + 1}/${cQty}…`))
      const id = genPhoneId(friendly)
      const r = await cloudPhones.create(id, cAndroid || undefined)
      if (r.ok) {
        ok++
        const fp = r.data?.instance?.fingerprint
        const m: CpMeta = { name: friendly, android: opt.android, store: opt.store, model: fp?.name, createdAt: Date.now() }
        saveCpMeta(id, m)
        setMeta(loadAllCpMeta())
      } else {
        setCreateMsg(`${tr('Échec', 'Failed')} : ${r.error ?? ''}`)
        break
      }
    }
    setCreating(false)
    await loadInstances()
    if (ok === cQty) setShowCreate(false)
  }

  const doAction = async (id: string, action: 'start' | 'stop' | 'remove') => {
    if (action === 'remove' && !window.confirm(tr('Supprimer définitivement ce téléphone ?', 'Permanently delete this phone?'))) return
    setBusyId(id)
    const fn = action === 'start' ? cloudPhones.start : action === 'stop' ? cloudPhones.stop : cloudPhones.remove
    const r = await fn(id)
    setBusyId(null)
    if (r.ok) {
      if (action === 'remove') { closeWindow(id); removeCpMeta(id); setMeta(loadAllCpMeta()) }
      loadInstances()
    }
  }

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id).then(() => {
      setCopiedId(id); window.setTimeout(() => setCopiedId(c => c === id ? null : c), 1400)
    }).catch(() => {})
  }

  const isRunning = (s: string) => /running|up/i.test(s)
  const stats = useMemo(() => {
    const online = instances.filter(i => isRunning(i.state)).length
    return { total: instances.length, online, offline: instances.length - online }
  }, [instances])

  const fmtDate = (t?: number) => {
    if (!t) return '—'
    try { return new Date(t).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' }) } catch { return '—' }
  }

  if (!isSuperAdmin) return null

  return (
    <div className="sf-page anim-page">
      <div className="sf-page-header">
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="3" width="14" height="7" rx="1"/><rect x="5" y="13" width="14" height="7" rx="1"/><path d="M7 7h.01M7 17h.01"/>
            </svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad">Admin — Cloud Phones</h1>
            <p className="sf-page-sub">{tr('Tes propres téléphones Android, auto-hébergés', 'Your own self-hosted Android phones')}</p>
          </div>
        </div>
        <div className="sf-page-header-actions sf-anim-slide-up sf-d100" style={{ display: 'flex', gap: 8 }}>
          {conn === 'ok' && (
            <Button onClick={openCreate}>+ {tr('Nouveau téléphone', 'New phone')}</Button>
          )}
          <button onClick={() => setShowKey(v => !v)} className="sf-btn sf-btn-secondary" style={{ height: 36 }}>
            ⚙ {tr('Agent', 'Agent')}
          </button>
        </div>
      </div>

      <div className="flex-1 px-8 pb-10">
        {showKey && (
          <div className="sf-card p-6 space-y-4 mt-6">
            <p className="sf-section-label">{tr('Configurer l\'agent', 'Configure the agent')}</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {tr('L\'URL et le token de ton agent auto-hébergé (voir selfhost/TUTO_ORACLE.md — affiché à la fin de l\'installation).', 'The URL and token of your self-hosted agent (see selfhost/TUTO_ORACLE.md — shown at the end of the install).')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{tr('URL de l\'agent', 'Agent URL')}</label>
                <Input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://tonnom-phones.duckdns.org" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>Token</label>
                <Input value={tokenInput} onChange={e => setTokenInput(e.target.value)} type="password" placeholder="a1b2c3d4..." />
              </div>
            </div>
            <Button onClick={saveKey} disabled={savingKey || !urlInput.trim() || !tokenInput.trim()}>
              {savingKey ? tr('Enregistrement…', 'Saving…') : tr('Enregistrer et tester', 'Save and test')}
            </Button>
            {keyErr && <div className="sf-banner is-danger">{keyErr}</div>}
          </div>
        )}

        {conn === 'checking' && (
          <div className="sf-card p-8 mt-6" style={{ textAlign: 'center', color: 'var(--text-3)' }}>{tr('Connexion à l\'agent…', 'Connecting to the agent…')}</div>
        )}
        {conn === 'unconfigured' && !showKey && (
          <div className="sf-card p-8 mt-6" style={{ textAlign: 'center', color: 'var(--text-3)' }}>{tr('Configure ton agent (⚙ ci-dessus) pour commencer.', 'Configure your agent (⚙ above) to get started.')}</div>
        )}
        {conn === 'error' && (
          <div className="sf-banner is-danger mt-6">{tr('Connexion impossible', 'Connection failed')} : {connMsg}</div>
        )}

        {conn === 'ok' && (
          <>
            {/* Tuiles de synthèse */}
            <div className="mt-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <StatTile label={tr('Téléphones', 'Phones')} value={stats.total} tone="neutral" />
              <StatTile label={tr('En ligne', 'Online')} value={stats.online} tone="ok" />
              <StatTile label={tr('Arrêtés', 'Stopped')} value={stats.offline} tone="muted" />
            </div>

            {/* Table façon GeeLark : statut, nom, id de création, modèle, système, port, date */}
            <div className="sf-card mt-4" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                      {[tr('Statut', 'Status'), tr('Téléphone', 'Phone'), 'ID', tr('Modèle', 'Model'), tr('Système', 'System'), tr('Port ADB', 'ADB port'), tr('Créé le', 'Created'), tr('Actions', 'Actions')].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {instances.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
                        {tr('Aucun téléphone.', 'No phone yet.')} <button onClick={openCreate} className="sf-link" style={{ fontWeight: 600 }}>{tr('Crée ton premier téléphone', 'Create your first phone')}</button>
                      </td></tr>
                    )}
                    {instances.map(inst => {
                      const running = isRunning(inst.state)
                      const m = meta[inst.id] ?? {}
                      const display = m.name || inst.name
                      return (
                        <tr key={inst.id} onDoubleClick={() => openWindow(inst.id)}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .15s' }}
                          className="cp-row"
                        >
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: running ? 'var(--ok)' : 'var(--text-4)' }}>
                              <span style={{ width: 7, height: 7, borderRadius: 99, background: running ? 'var(--ok)' : 'var(--text-4)', boxShadow: running ? '0 0 6px var(--ok)' : 'none' }} />
                              {running ? tr('En ligne', 'Online') : tr('Arrêté', 'Stopped')}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{display}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <button onClick={(e) => { e.stopPropagation(); copyId(inst.id) }} title={tr('Copier l\'ID', 'Copy ID')}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-3)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                              {inst.id}
                              <span style={{ color: copiedId === inst.id ? 'var(--ok)' : 'var(--text-4)' }}>{copiedId === inst.id ? '✓' : '⧉'}</span>
                            </button>
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{m.model ?? '—'}</td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ color: 'var(--text-2)' }}>Android {m.android ?? '15'}</span>
                            {m.store && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-4)' }}>{m.store}</span>}
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 11.5 }}>{inst.adbPort ?? '—'}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => openWindow(inst.id)} className="sf-btn sf-btn-primary text-[11.5px]" style={{ height: 28, padding: '0 10px' }}>▶ {tr('Ouvrir', 'Open')}</button>
                              {running ? (
                                <button disabled={busyId === inst.id} onClick={() => doAction(inst.id, 'stop')} className="sf-btn sf-btn-ghost text-[11.5px]" style={{ height: 28, padding: '0 10px' }}>{tr('Arrêter', 'Stop')}</button>
                              ) : (
                                <button disabled={busyId === inst.id} onClick={() => doAction(inst.id, 'start')} className="sf-btn sf-btn-ghost text-[11.5px]" style={{ height: 28, padding: '0 10px' }}>{tr('Démarrer', 'Start')}</button>
                              )}
                              <button disabled={busyId === inst.id} onClick={() => doAction(inst.id, 'remove')} className="sf-btn sf-btn-ghost text-[11.5px] text-danger" style={{ height: 28, padding: '0 10px' }}>{tr('Suppr.', 'Del.')}</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{tr('Double-clic sur une ligne pour ouvrir le téléphone', 'Double-click a row to open the phone')}</span>
                <button onClick={loadInstances} className="sf-btn sf-btn-ghost text-[11.5px]">↻ {tr('Rafraîchir', 'Refresh')}</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Modal de création ─────────────────────────────────────────────── */}
      {showCreate && (
        <div onClick={() => !creating && setShowCreate(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(6,7,12,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="sf-card sf-anim-scale-spring"
            style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{tr('Nouveau téléphone', 'New phone')}</h2>
                <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 2 }}>{tr('Provisionne une instance Android auto-hébergée', 'Provisions a self-hosted Android instance')}</p>
              </div>
              <button onClick={() => !creating && setShowCreate(false)} className="sf-btn sf-btn-ghost" style={{ height: 30, width: 30, padding: 0 }}>✕</button>
            </div>

            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Nom */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{tr('Nom du téléphone', 'Phone name')}</label>
                <Input value={cName} onChange={e => setCName(e.target.value)} placeholder={tr('ex : Compte Insta Marseille', 'e.g. Insta Marseille')} autoFocus />
                {cName.trim() && (
                  <p style={{ fontSize: 11, color: 'var(--text-4)' }}>
                    {tr('ID généré', 'Generated ID')} : <span style={{ fontFamily: 'monospace', color: 'var(--text-3)' }}>{genPhoneId(cName).replace(/-[0-9a-f]{6}$/, '-xxxxxx')}</span>
                  </p>
                )}
              </div>

              {/* Système Android */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{tr('Système', 'System')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ANDROID_OPTS.map(opt => {
                    const active = cAndroid === opt.value
                    return (
                      <button key={opt.value} onClick={() => setCAndroid(opt.value)}
                        style={{ textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'rgba(129,140,248,0.10)' : 'transparent', transition: 'all .15s' }}>
                        <span style={{ marginTop: 2, width: 15, height: 15, borderRadius: 99, flexShrink: 0, border: `2px solid ${active ? 'var(--accent)' : 'var(--text-4)'}`, background: active ? 'var(--accent)' : 'transparent', boxShadow: active ? '0 0 0 3px rgba(129,140,248,0.15)' : 'none' }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{opt.title}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', color: 'var(--text-3)' }}>{opt.store}</span>
                            {opt.recommended && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'rgba(52,211,153,0.15)', color: 'var(--ok)' }}>{tr('Recommandé', 'Recommended')}</span>}
                          </span>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-4)', marginTop: 3, lineHeight: 1.5 }}>{opt.desc}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Quantité */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>{tr('Quantité', 'Quantity')}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setCQty(q => Math.max(1, q - 1))} className="sf-btn sf-btn-ghost" style={{ height: 34, width: 34, padding: 0, fontSize: 18 }}>−</button>
                  <span style={{ minWidth: 42, textAlign: 'center', fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{cQty}</span>
                  <button onClick={() => setCQty(q => Math.min(20, q + 1))} className="sf-btn sf-btn-ghost" style={{ height: 34, width: 34, padding: 0, fontSize: 18 }}>+</button>
                  <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{tr('téléphone(s) — numérotés automatiquement', 'phone(s) — auto-numbered')}</span>
                </div>
              </div>

              <p style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {tr('Le boot Android et l\'installation d\'Aurora Store prennent 1-2 min en tâche de fond après la création.', 'Android boot and Aurora Store install take 1-2 min in the background after creation.')}
              </p>
              {createMsg && <div style={{ fontSize: 12, color: createMsg.startsWith(tr('Échec', 'Failed')) ? 'var(--danger)' : 'var(--text-2)' }}>{createMsg}</div>}
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => !creating && setShowCreate(false)} className="sf-btn sf-btn-ghost" style={{ height: 38 }}>{tr('Annuler', 'Cancel')}</button>
              <Button onClick={createPhones} disabled={creating || !cName.trim()}>
                {creating ? tr('Création…', 'Creating…') : `+ ${tr('Créer', 'Create')}${cQty > 1 ? ` (${cQty})` : ''}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fenêtres flottantes — une par tel ouvert, façon GeeLark */}
      {openIds.map(id => {
        const inst = instances.find(i => i.id === id)
        if (!inst) return null
        const display = meta[id]?.name || inst.name
        return (
          <CloudPhoneWindow
            key={id} inst={{ ...inst, name: display }}
            zIndex={1000 + zOrder.indexOf(id)}
            offset={openIds.indexOf(id)}
            onClose={() => closeWindow(id)}
            onFocus={() => focusWindow(id)}
          />
        )
      })}

      <style>{`.cp-row:hover { background: rgba(129,140,248,0.06); }`}</style>
    </div>
  )
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'ok' | 'muted' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'muted' ? 'var(--text-4)' : 'var(--text-1)'
  return (
    <div className="sf-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
    </div>
  )
}

export default CloudPhones
