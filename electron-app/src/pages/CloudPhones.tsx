// Admin — Cloud Phones maison (auto-hébergés, voir selfhost/). Réservé au
// super-admin. Configure l'agent (URL + token) et pilote les instances Android
// (créer/démarrer/arrêter/supprimer, écran + actions de base).
import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/Toast'
import { useLicense } from '@/lib/license'
import { useOrg } from '@/lib/orgContext'
import { useTr } from '@/lib/i18n'
import {
  cloudPhones, loadCloudAgentConfig, saveCloudAgentConfig, getCloudAgent,
  type CpInstance,
} from '@/lib/cloudPhones'

interface Props { user: User }

type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'

export function CloudPhones({ user }: Props) {
  const tr = useTr()
  const toast = useToast()
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
  const [selected, setSelected] = useState<CpInstance | null>(null)
  const [snap, setSnap] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const imgRef = useRef<HTMLImageElement>(null)

  const addLog = (m: string) => setLog(l => [`${new Date().toLocaleTimeString()} · ${m}`, ...l].slice(0, 30))

  const loadInstances = useCallback(async () => {
    const r = await cloudPhones.list()
    if (r.ok) setInstances(r.data?.instances ?? [])
    else addLog(`❌ liste : ${r.error}`)
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

  const saveKey = async () => {
    if (!urlInput.trim() || !tokenInput.trim()) return
    setSavingKey(true); setKeyErr('')
    const r = await saveCloudAgentConfig(currentOrg?.id ?? null, user.id, urlInput, tokenInput)
    setSavingKey(false)
    if (r.ok) { setShowKey(false); addLog('✓ agent configuré'); checkConn() }
    else { setKeyErr(`Échec : ${r.error ?? 'erreur inconnue'}`); addLog(`❌ config : ${r.error}`) }
  }

  const createInstance = async () => {
    if (!newName.trim() || creating) return
    setCreating(true)
    const r = await cloudPhones.create(newName.trim())
    setCreating(false)
    if (r.ok) { addLog(`✓ ${newName} créé (boot en cours…)`); setNewName(''); loadInstances() }
    else { toast.show({ title: tr('Échec de la création', 'Creation failed'), body: r.error ?? '', kind: 'error' }); addLog(`❌ créer : ${r.error}`) }
  }
  const doAction = async (id: string, action: 'start' | 'stop' | 'remove') => {
    setBusyId(id)
    const fn = action === 'start' ? cloudPhones.start : action === 'stop' ? cloudPhones.stop : cloudPhones.remove
    const r = await fn(id)
    setBusyId(null)
    if (r.ok) { addLog(`✓ ${id} : ${action}`); if (action === 'remove' && selected?.id === id) setSelected(null); loadInstances() }
    else addLog(`❌ ${id} ${action} : ${r.error}`)
  }

  const refreshSnapshot = useCallback(async (inst: CpInstance | null) => {
    if (!inst) return
    const r = await cloudPhones.screenshot(inst.id)
    if (r.ok && r.data?.dataUrl) setSnap(r.data.dataUrl)
    else addLog(`❌ capture : ${r.error ?? r.status}`)
  }, [])

  useEffect(() => { if (selected) { setSnap(null); refreshSnapshot(selected) } }, [selected, refreshSnapshot])
  useEffect(() => {
    if (!live || !selected) return
    const id = window.setInterval(() => refreshSnapshot(selected), 2000)
    return () => window.clearInterval(id)
  }, [live, selected, refreshSnapshot])

  // Tap sur l'écran → coordonnées pixel → `input tap` ADB.
  const onScreenClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!selected) return
    const img = imgRef.current
    if (!img || !img.naturalWidth) return
    const r = img.getBoundingClientRect()
    const x = Math.round((e.clientX - r.left) / r.width * img.naturalWidth)
    const y = Math.round((e.clientY - r.top) / r.height * img.naturalHeight)
    await cloudPhones.shell(selected.id, `input tap ${x} ${y}`)
    addLog(`✓ tap (${x}, ${y})`)
    window.setTimeout(() => refreshSnapshot(selected), 400)
  }
  const quickKey = async (key: string, label: string) => {
    if (!selected) return
    const r = await cloudPhones.shell(selected.id, `input keyevent ${key}`)
    addLog(r.ok ? `✓ ${label}` : `❌ ${label} : ${r.error}`)
    window.setTimeout(() => refreshSnapshot(selected), 400)
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
        <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
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
              {tr('L\'URL et le token de ton agent auto-hébergé (voir le guide selfhost/TUTO.md — affiché à la fin de l\'installation).', 'The URL and token of your self-hosted agent (see selfhost/TUTO.md — shown at the end of the install).')}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 280px) 1fr', gap: 16, marginTop: 24, alignItems: 'start' }}>
            {/* Liste + création */}
            <div className="sf-card p-4">
              <div className="flex gap-2 mb-3">
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder={tr('nom-du-tel', 'phone-name')} className="text-[13px]" />
                <Button onClick={createInstance} disabled={creating || !newName.trim()} style={{ flexShrink: 0 }}>+ </Button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }}>
                {instances.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-4)', padding: 8 }}>{tr('Aucun téléphone. Crée-en un ci-dessus.', 'No phone yet. Create one above.')}</p>}
                {instances.map(inst => {
                  const on = selected?.id === inst.id
                  const running = /running|up/i.test(inst.state)
                  return (
                    <div key={inst.id} className="sf-widget-row" style={{ borderRadius: 10, background: on ? 'rgba(129,140,248,0.12)' : 'transparent', padding: '8px 10px' }}>
                      <button onClick={() => setSelected(inst)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: running ? 'var(--ok)' : 'var(--text-4)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.name}</span>
                      </button>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        {running ? (
                          <button disabled={busyId === inst.id} onClick={() => doAction(inst.id, 'stop')} className="sf-btn sf-btn-ghost text-[11px]" style={{ height: 26, padding: '0 8px' }}>{tr('Arrêter', 'Stop')}</button>
                        ) : (
                          <button disabled={busyId === inst.id} onClick={() => doAction(inst.id, 'start')} className="sf-btn sf-btn-ghost text-[11px]" style={{ height: 26, padding: '0 8px' }}>{tr('Démarrer', 'Start')}</button>
                        )}
                        <button disabled={busyId === inst.id} onClick={() => doAction(inst.id, 'remove')} className="sf-btn sf-btn-ghost text-[11px] text-danger" style={{ height: 26, padding: '0 8px' }}>{tr('Suppr.', 'Del.')}</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button onClick={loadInstances} className="sf-btn sf-btn-ghost text-[11px] mt-2" style={{ width: '100%' }}>↻ {tr('Rafraîchir', 'Refresh')}</button>
            </div>

            {/* Écran + actions */}
            {selected ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 280px) 1fr', gap: 16 }}>
                <div className="sf-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: 12.5, fontWeight: 800 }}>{tr('Écran', 'Screen')}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setLive(v => !v)} className="sf-btn sf-btn-ghost text-[11px]" style={{ color: live ? 'var(--ok)' : undefined }}>● Live</button>
                      <button onClick={() => refreshSnapshot(selected)} className="sf-btn sf-btn-ghost text-[11px]">↻</button>
                    </div>
                  </div>
                  {/* Écran FLUIDE (flux vidéo temps réel, comme GeeLark) — ouvre
                      ws-scrcpy dans un nouvel onglet. Demande le mot de passe une
                      fois (utilisateur "phone", mot de passe = ton token agent). */}
                  <button
                    onClick={() => { const { url } = getCloudAgent(); if (url) window.open(`${url}/live/`, '_blank', 'noopener') }}
                    className="sf-btn sf-btn-primary text-[12px] mb-2" style={{ width: '100%' }}
                  >
                    🎥 {tr('Écran fluide (temps réel)', 'Fluid screen (real-time)')}
                  </button>
                  <p style={{ fontSize: 10, color: 'var(--text-4)', margin: '0 0 10px' }}>
                    {tr('S\'ouvre dans un nouvel onglet · identifiant : phone · mot de passe : ton token agent', 'Opens in a new tab · username: phone · password: your agent token')}
                  </p>
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: '#0b0b12', aspectRatio: '9/19.5', display: 'grid', placeItems: 'center' }}>
                    {snap ? (
                      <img ref={imgRef} src={snap} alt="écran" draggable={false} onClick={onScreenClick}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair' }} />
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{tr('Pas de capture', 'No snapshot')}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => quickKey('3', tr('Accueil', 'Home'))} className="sf-btn sf-btn-ghost text-[12px]">⌂ {tr('Accueil', 'Home')}</button>
                    <button onClick={() => quickKey('4', tr('Retour', 'Back'))} className="sf-btn sf-btn-ghost text-[12px]">← {tr('Retour', 'Back')}</button>
                    <button onClick={() => quickKey('187', tr('Récents', 'Recents'))} className="sf-btn sf-btn-ghost text-[12px]">▢ {tr('Récents', 'Recents')}</button>
                  </div>
                </div>

                <div className="sf-card p-4">
                  <p className="sf-section-label mb-2">{tr('Journal', 'Log')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
                    {log.length === 0
                      ? <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{tr('Aucune action.', 'No action yet.')}</span>
                      : log.map((l, i) => <span key={i} style={{ fontSize: 11.5, fontFamily: 'monospace', color: l.includes('❌') ? 'var(--danger)' : 'var(--text-3)' }}>{l}</span>)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="sf-card p-8" style={{ textAlign: 'center', color: 'var(--text-3)' }}>{tr('Sélectionne un téléphone à gauche.', 'Select a phone on the left.')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CloudPhones
