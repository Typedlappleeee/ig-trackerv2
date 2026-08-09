// Admin — Cloud Phones maison (auto-hébergés, voir selfhost/). Réservé au
// super-admin. Configure l'agent (URL + token), liste les téléphones dans une
// table façon GeeLark, et ouvre chacun dans sa propre fenêtre flottante.
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useLicense } from '@/lib/license'
import { useOrg } from '@/lib/orgContext'
import { useTr } from '@/lib/i18n'
import {
  cloudPhones, loadCloudAgentConfig, saveCloudAgentConfig, getCloudAgent,
  type CpInstance,
} from '@/lib/cloudPhones'
import { CloudPhoneWindow } from '@/components/CloudPhoneWindow'

interface Props { user: User }

type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'

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
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const createInstance = async () => {
    if (!newName.trim() || creating) return
    setCreating(true)
    const r = await cloudPhones.create(newName.trim())
    setCreating(false)
    if (r.ok) { setNewName(''); loadInstances() }
    else alert(`${tr('Échec de la création', 'Creation failed')} : ${r.error ?? ''}`)
  }
  const doAction = async (id: string, action: 'start' | 'stop' | 'remove') => {
    setBusyId(id)
    const fn = action === 'start' ? cloudPhones.start : action === 'stop' ? cloudPhones.stop : cloudPhones.remove
    const r = await fn(id)
    setBusyId(null)
    if (r.ok) { if (action === 'remove') closeWindow(id); loadInstances() }
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
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder={tr('nom-du-tel', 'phone-name')} style={{ width: 150, height: 36 }} className="text-[13px]" />
              <Button onClick={createInstance} disabled={creating || !newName.trim()}>+ {tr('Nouveau', 'New')}</Button>
            </div>
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

        {/* Table façon GeeLark : statut, nom, id, ports, actions */}
        {conn === 'ok' && (
          <div className="sf-card mt-6" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                    {[tr('Statut', 'Status'), tr('Nom', 'Name'), 'ID', tr('Système', 'System'), tr('Port ADB', 'ADB port'), tr('Actions', 'Actions')].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {instances.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>{tr('Aucun téléphone. Crée-en un en haut à droite.', 'No phone yet. Create one at the top right.')}</td></tr>
                  )}
                  {instances.map(inst => {
                    const running = /running|up/i.test(inst.state)
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
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-1)' }}>{inst.name}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 11.5 }}>{inst.id}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-3)' }}>Android 13</td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 11.5 }}>{inst.adbPort ?? '—'}</td>
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
              <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{tr('Total', 'Total')} : {instances.length}</span>
              <button onClick={loadInstances} className="sf-btn sf-btn-ghost text-[11.5px]">↻ {tr('Rafraîchir', 'Refresh')}</button>
            </div>
          </div>
        )}
      </div>

      {/* Fenêtres flottantes — une par tel ouvert, façon GeeLark */}
      {openIds.map(id => {
        const inst = instances.find(i => i.id === id)
        if (!inst) return null
        return (
          <CloudPhoneWindow
            key={id} inst={inst}
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

export default CloudPhones
