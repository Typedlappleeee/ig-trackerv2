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
  loadAllCpMeta, saveCpMeta, removeCpMeta, genPhoneId,
  type CpInstance, type CpMeta,
} from '@/lib/cloudPhones'
import { CloudPhoneWindow } from '@/components/CloudPhoneWindow'
import { listProxies, proxyLabel, type Proxy } from '@/lib/proxyStore'
import { ExitIpCell } from '@/components/ui/ExitIpCell'
import { runProxyCheck, runProxyChecks } from '@/lib/proxyChecks'

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
  const [cProxy, setCProxy] = useState('')   // '' | proxy:<id> | group:<name>
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
  const [allProxies, setAllProxies] = useState<Proxy[]>([])

  // Proxies (pour l'assignation aux tels).
  useEffect(() => { listProxies(user.id).then(setAllProxies) }, [user.id])
  // Proxies déjà pris (1 proxy = 1 tel) → pour piocher un libre dans un groupe.
  const usedProxyIds = new Set(Object.values(meta).map(mm => mm.proxyId).filter(Boolean) as string[])
  const proxyGroups = [...new Set(allProxies.map(p => p.group).filter(Boolean) as string[])]
  const proxyById = (pid?: string) => allProxies.find(p => p.id === pid)
  // Choisit un proxy pour un nouveau tel selon le sélecteur (proxy précis, ou 1 libre du groupe).
  const pickProxyForNew = (taken: Set<string>): string | undefined => {
    if (cProxy.startsWith('proxy:')) { const id = cProxy.slice(6); return taken.has(id) ? undefined : id }
    if (cProxy.startsWith('group:')) { const g = cProxy.slice(6); return allProxies.find(p => p.group === g && !taken.has(p.id))?.id }
    return undefined
  }

  // ── Menu ⋯ + modal d'édition (proxy / profil) ─────────────────────────────
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editKind, setEditKind] = useState<'proxy' | 'profile'>('proxy')
  const [epName, setEpName] = useState('')
  const [epAccount, setEpAccount] = useState('')
  const [epNotes, setEpNotes] = useState('')
  const [epGroup, setEpGroup] = useState('')     // '' = tous
  const [epProxyId, setEpProxyId] = useState('')
  const [epCheck, setEpCheck] = useState<{ loading?: boolean; ip?: string; err?: string } | null>(null)

  // Test de l'IP sortante du proxy assigné à un tel (écrit dans le cache partagé
  // → la cellule ExitIpCell se met à jour toute seule, ici et dans Proxies).
  const [testingIp, setTestingIp] = useState<Set<string>>(new Set())
  const testExitIp = async (proxyId?: string) => {
    const p = proxyById(proxyId); if (!p) return
    setTestingIp(s => new Set(s).add(p.id))
    await runProxyCheck({ id: p.id, type: p.type, host: p.host, port: p.port, username: p.username, password: p.password })
    setTestingIp(s => { const n = new Set(s); n.delete(p.id); return n })
  }
  const verifyAllIps = async () => {
    const seen = new Set<string>()
    const list: Proxy[] = []
    for (const i of instances) { const p = proxyById(meta[i.id]?.proxyId); if (p && !seen.has(p.id)) { seen.add(p.id); list.push(p) } }
    if (list.length) await runProxyChecks(list.map(p => ({ id: p.id, type: p.type, host: p.host, port: p.port, username: p.username, password: p.password })))
  }

  const openEdit = (id: string, kind: 'proxy' | 'profile') => {
    const m = meta[id] ?? {}
    setEditId(id); setEditKind(kind); setEpName(m.name ?? ''); setEpAccount(m.account ?? ''); setEpNotes(m.notes ?? '')
    const px = proxyById(m.proxyId); setEpGroup(px?.group ?? ''); setEpProxyId(m.proxyId ?? ''); setEpCheck(null)
  }
  const epProxies = allProxies.filter(p => !epGroup || p.group === epGroup)
  const epRandom = () => {
    const free = epProxies.filter(p => !usedProxyIds.has(p.id) || p.id === epProxyId)
    const pool = free.length ? free : epProxies
    if (pool.length) { setEpProxyId(pool[Math.floor(Math.random() * pool.length)].id); setEpCheck(null) }
  }
  const epCheckNow = async () => {
    const p = proxyById(epProxyId); if (!p) return
    setEpCheck({ loading: true })
    const c = await runProxyCheck({ id: p.id, type: p.type, host: p.host, port: p.port, username: p.username, password: p.password })
    setEpCheck(c.reachable ? { ip: c.ip } : { err: c.error })
  }
  const saveEdit = () => {
    if (!editId) return
    const patch: CpMeta = { proxyId: epProxyId || undefined }
    if (editKind === 'profile') { patch.name = epName.trim() || undefined; patch.account = epAccount.trim() || undefined; patch.notes = epNotes.trim() || undefined }
    saveCpMeta(editId, patch); setMeta(loadAllCpMeta()); setEditId(null)
  }

  // Fenêtres flottantes ouvertes (façon GeeLark) : une par tel, indépendantes.
  const [openIds, setOpenIds] = useState<string[]>([])
  const [zOrder, setZOrder] = useState<string[]>([])   // ordre d'empilement (dernier = au-dessus)
  const openWindow = (id: string) => {
    setOpenIds(o => o.includes(id) ? o : [...o, id])
    setZOrder(z => [...z.filter(x => x !== id), id])
  }
  // Fermer la fenêtre = éteindre le tel (il se rallume à la prochaine ouverture).
  const closeWindow = (id: string) => {
    setOpenIds(o => o.filter(x => x !== id)); setZOrder(z => z.filter(x => x !== id))
    cloudPhones.stop(id).finally(() => loadInstances())
  }
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
    const taken = new Set(usedProxyIds)   // évite d'assigner 2× le même proxy dans le lot
    for (let i = 0; i < cQty; i++) {
      const friendly = cQty > 1 ? `${base} ${i + 1}` : base
      setCreateMsg(tr(`Création ${i + 1}/${cQty}…`, `Creating ${i + 1}/${cQty}…`))
      const id = genPhoneId(friendly)
      const r = await cloudPhones.create(id, cAndroid || undefined)
      if (r.ok) {
        ok++
        const fp = r.data?.instance?.fingerprint
        const proxyId = pickProxyForNew(taken)
        if (proxyId) taken.add(proxyId)
        const m: CpMeta = { name: friendly, android: opt.android, store: opt.store, model: fp?.name, createdAt: Date.now(), proxyId }
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

  // ── Recherche / filtres / multi-sélection (passage à l'échelle) ────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'stopped' | 'open'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const q = search.trim().toLowerCase()
  const filtered = instances.filter(inst => {
    const okStatus = statusFilter === 'all' ? true
      : statusFilter === 'online' ? isRunning(inst.state)
      : statusFilter === 'stopped' ? !isRunning(inst.state)
      : openIds.includes(inst.id)
    if (!okStatus) return false
    if (!q) return true
    const mm = meta[inst.id] ?? {}
    const px = proxyById(mm.proxyId)
    return [mm.name || inst.name, inst.id, mm.account, px ? `${px.host}:${px.port}` : ''].filter(Boolean).join(' ').toLowerCase().includes(q)
  })
  const toggleSel = (id: string) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allFilteredSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))
  const toggleAllFiltered = () => setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map(i => i.id)))
  const clearSel = () => setSelectedIds(new Set())
  const bulkOpen = () => { selectedIds.forEach(openWindow); clearSel() }
  const bulkVerifyIp = async () => {
    const seen = new Set<string>(); const list: Proxy[] = []
    selectedIds.forEach(id => { const p = proxyById(meta[id]?.proxyId); if (p && !seen.has(p.id)) { seen.add(p.id); list.push(p) } })
    if (list.length) await runProxyChecks(list.map(p => ({ id: p.id, type: p.type, host: p.host, port: p.port, username: p.username, password: p.password })))
  }
  const bulkRemove = async () => {
    if (!window.confirm(`Supprimer ${selectedIds.size} téléphone(s) ? Irréversible.`)) return
    for (const id of selectedIds) await doAction(id, 'remove')
    clearSel()
  }

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
            <>
              <button onClick={verifyAllIps} className="sf-btn sf-btn-ghost" style={{ height: 36 }}>🔎 {tr('Vérifier les IP', 'Check IPs')}</button>
              <Button onClick={openCreate}>+ {tr('Nouveau téléphone', 'New phone')}</Button>
            </>
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

        {conn === 'ok' && instances.length > 0 && (
          <>
            {/* Recherche + filtres de statut */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 12px' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Rechercher (nom, id, compte, proxy)…', 'Search (name, id, account, proxy)…')} className="sf-input" style={{ height: 34, flex: '0 1 320px', minWidth: 200 }} />
              <span style={{ flex: 1 }} />
              <FChip on={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>{tr('Tous', 'All')} · {instances.length}</FChip>
              <FChip on={statusFilter === 'online'} onClick={() => setStatusFilter('online')}>{tr('En ligne', 'Online')} · {instances.filter(i => isRunning(i.state)).length}</FChip>
              <FChip on={statusFilter === 'stopped'} onClick={() => setStatusFilter('stopped')}>{tr('Arrêté', 'Stopped')} · {instances.filter(i => !isRunning(i.state)).length}</FChip>
              <FChip on={statusFilter === 'open'} onClick={() => setStatusFilter('open')}>{tr('Ouvert', 'Open')} · {openIds.length}</FChip>
            </div>

            {/* Barre d'actions groupées */}
            {selectedIds.size > 0 && (
              <div className="sf-card" style={{ padding: '9px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, borderColor: 'var(--accent)' }}>
                <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>{selectedIds.size} {tr('sélectionné(s)', 'selected')}</span>
                <span style={{ flex: 1 }} />
                <button className="sf-btn sf-btn-ghost text-[12px]" style={{ height: 30 }} onClick={bulkOpen}>▶ {tr('Ouvrir', 'Open')}</button>
                <button className="sf-btn sf-btn-ghost text-[12px]" style={{ height: 30 }} onClick={bulkVerifyIp}>🔎 {tr('Vérifier IP', 'Check IP')}</button>
                <button className="sf-btn sf-btn-ghost text-[12px]" style={{ height: 30, color: 'var(--danger)' }} onClick={bulkRemove}>🗑 {tr('Supprimer', 'Delete')}</button>
                <button className="sf-btn sf-btn-ghost text-[12px]" style={{ height: 30 }} onClick={clearSel}>✕</button>
              </div>
            )}

            {/* Table façon GeeLark : statut, nom, id de création, modèle, système, port, date */}
            <div className="sf-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '11px 8px 11px 16px', width: 34 }}><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} style={{ cursor: 'pointer' }} /></th>
                      {[tr('Statut', 'Status'), tr('Téléphone', 'Phone'), 'ID', tr('Modèle', 'Model'), tr('Système', 'System'), 'Proxy', tr('IP sortante', 'Exit IP'), tr('Port ADB', 'ADB port'), tr('Créé le', 'Created'), tr('Actions', 'Actions')].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={11} style={{ padding: 30, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
                        {tr('Aucun résultat pour ce filtre.', 'No match for this filter.')}
                      </td></tr>
                    )}
                    {filtered.map(inst => {
                      const running = isRunning(inst.state)
                      const isOpen = openIds.includes(inst.id)
                      const m = meta[inst.id] ?? {}
                      const display = m.name || inst.name
                      const sel = selectedIds.has(inst.id)
                      return (
                        <tr key={inst.id} onDoubleClick={() => openWindow(inst.id)}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .15s', background: sel ? 'var(--accent-dim)' : undefined, borderLeft: isOpen ? '3px solid var(--accent)' : '3px solid transparent' }}
                          className="cp-row"
                        >
                          <td style={{ padding: '10px 8px 10px 16px' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={sel} onChange={() => toggleSel(inst.id)} style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: running ? 'var(--ok)' : 'var(--text-4)' }}>
                              <span style={{ width: 7, height: 7, borderRadius: 99, background: running ? 'var(--ok)' : 'var(--text-4)', boxShadow: running ? '0 0 6px var(--ok)' : 'none' }} />
                              {running ? tr('En ligne', 'Online') : tr('Arrêté', 'Stopped')}
                            </span>
                            {isOpen && <span className="sf-badge sf-badge-accent" style={{ marginLeft: 8 }}>● {tr('Ouvert', 'Open')}</span>}
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>{display}</div>
                            {m.account && <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{m.account}</div>}
                          </td>
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
                          <td style={{ padding: '10px 16px', maxWidth: 170 }}>
                            {m.proxyId
                              ? (proxyById(m.proxyId)
                                  ? <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-2)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proxyById(m.proxyId)!.type}://{proxyLabel(proxyById(m.proxyId)!)}</span>
                                  : <span className="sf-badge sf-badge-warn">proxy introuvable</span>)
                              : <span style={{ color: 'var(--text-4)' }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <ExitIpCell proxyId={m.proxyId} testing={!!m.proxyId && testingIp.has(m.proxyId)} onTest={() => testExitIp(m.proxyId)} />
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 11.5 }}>{inst.adbPort ?? '—'}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {isOpen
                                ? <button onClick={() => closeWindow(inst.id)} className="sf-btn sf-btn-ghost text-[11.5px]" style={{ height: 28, padding: '0 10px', color: '#818CF8' }}>◉ {tr('Ouvert', 'Open')} · {tr('fermer', 'close')}</button>
                                : <button onClick={() => openWindow(inst.id)} className="sf-btn sf-btn-primary text-[11.5px]" style={{ height: 28, padding: '0 10px' }}>▶ {tr('Ouvrir', 'Open')}</button>}
                              <button disabled={busyId === inst.id} onClick={() => doAction(inst.id, 'remove')} className="sf-btn sf-btn-ghost text-[11.5px] text-danger" style={{ height: 28, padding: '0 10px' }}>{tr('Suppr.', 'Del.')}</button>
                              <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                                <button onClick={() => setMenuId(menuId === inst.id ? null : inst.id)} className="sf-btn sf-btn-ghost text-[11.5px]" style={{ height: 28, padding: '0 8px', fontWeight: 800 }}>⋯</button>
                                {menuId === inst.id && (
                                  <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, background: '#12131d', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 16px 40px -14px rgba(0,0,0,0.8)', padding: 6, minWidth: 180 }}>
                                    <button onClick={() => { setMenuId(null); openEdit(inst.id, 'proxy') }} style={menuItem}>🌐 {tr('Modifier le proxy', 'Edit proxy')}</button>
                                    <button onClick={() => { setMenuId(null); openEdit(inst.id, 'profile') }} style={menuItem}>✏️ {tr('Modifier le profil', 'Edit profile')}</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{filtered.length} {tr('téléphone(s)', 'phone(s)')} · {instances.filter(i => isRunning(i.state)).length} {tr('en ligne', 'online')} · {openIds.length} {tr('ouvert(s)', 'open')}</span>
                <button onClick={loadInstances} className="sf-btn sf-btn-ghost text-[11.5px]">↻ {tr('Rafraîchir', 'Refresh')}</button>
              </div>
            </div>
          </>
        )}

        {/* État vide : aucun téléphone */}
        {conn === 'ok' && instances.length === 0 && (
          <div className="sf-card" style={{ padding: '48px 24px', textAlign: 'center', marginTop: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>{tr('Aucun téléphone', 'No phone yet')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-4)', marginBottom: 16 }}>{tr('Crée ton premier cloud phone pour commencer.', 'Create your first cloud phone to get started.')}</div>
            <button onClick={openCreate} className="sf-btn sf-btn-primary">+ {tr('Créer un téléphone', 'Create a phone')}</button>
            {allProxies.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 14 }}>{tr('💡 Pense à ajouter des proxys dans l’onglet Proxies.', '💡 Add proxies in the Proxies tab first.')}</div>}
          </div>
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

              {/* Proxy */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-text2 uppercase" style={{ letterSpacing: '0.04em' }}>Proxy</label>
                <select value={cProxy} onChange={e => setCProxy(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-1)' }}>
                  <option value="">— {tr('Aucun', 'None')} —</option>
                  {proxyGroups.length > 0 && (
                    <optgroup label={tr('Groupes (1 proxy libre par tel)', 'Groups (1 free proxy per phone)')}>
                      {proxyGroups.map(g => {
                        const free = allProxies.filter(p => p.group === g && !usedProxyIds.has(p.id)).length
                        return <option key={g} value={`group:${g}`}>{g} — {free} {tr('libre(s)', 'free')}</option>
                      })}
                    </optgroup>
                  )}
                  <optgroup label={tr('Proxy précis', 'Specific proxy')}>
                    {allProxies.map(p => <option key={p.id} value={`proxy:${p.id}`} disabled={usedProxyIds.has(p.id)}>{p.group ? `[${p.group}] ` : ''}{proxyLabel(p)}{usedProxyIds.has(p.id) ? ` (${tr('pris', 'taken')})` : ''}</option>)}
                  </optgroup>
                </select>
                {allProxies.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{tr('Aucun proxy — ajoute-en dans l\'onglet Proxies.', 'No proxy — add some in the Proxies tab.')}</span>}
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

      {/* Ferme le menu ⋯ au clic ailleurs */}
      {menuId && <div onClick={() => setMenuId(null)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />}

      {/* Modal Modifier le proxy / le profil (façon GeeLark) */}
      {editId && (() => {
        const inst = instances.find(i => i.id === editId)
        const m = meta[editId] ?? {}
        return (
          <div onClick={() => setEditId(null)} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(6,7,12,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} className="sf-card sf-anim-scale-spring" style={{ width: 'min(520px,94vw)', padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{editKind === 'proxy' ? tr('Modifier le proxy', 'Edit proxy') : tr('Modifier le profil', 'Edit profile')}</h3>
                <span style={{ flex: 1 }} />
                <button onClick={() => setEditId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>

              <FieldLabel>{tr('Nom', 'Name')}</FieldLabel>
              {editKind === 'profile'
                ? <input value={epName} onChange={e => setEpName(e.target.value)} placeholder={tr('Nom du téléphone', 'Phone name')} style={fieldInput} />
                : <div style={{ ...fieldInput, color: 'var(--text-2)' }}>{m.name || inst?.name}</div>}

              {editKind === 'profile' && (
                <>
                  <FieldLabel style={{ marginTop: 14 }}>{tr('Compte associé', 'Linked account')}</FieldLabel>
                  <input value={epAccount} onChange={e => setEpAccount(e.target.value)} placeholder={tr('@pseudo ou email du compte', '@handle or account email')} style={fieldInput} />

                  <FieldLabel style={{ marginTop: 14 }}>{tr('Remarques', 'Notes')}</FieldLabel>
                  <textarea value={epNotes} onChange={e => setEpNotes(e.target.value)} rows={2} placeholder={tr('Notes libres (identifiants, statut du compte…)', 'Free notes (credentials, account status…)')} style={{ ...fieldInput, resize: 'vertical', fontFamily: 'inherit' }} />

                  <FieldLabel style={{ marginTop: 14 }}>{tr('Appareil (non modifiable)', 'Device (read-only)')}</FieldLabel>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[[tr('Modèle', 'Model'), m.model], ['Android', m.android || '15'], [tr('Store', 'Store'), m.store], ['Port ADB', inst?.adbPort], ['ID', editId]].filter(x => x[1]).map(([k, v]) => (
                      <span key={String(k)} style={{ fontSize: 11, color: 'var(--text-3)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 9px' }}><b style={{ color: 'var(--text-4)', fontWeight: 700 }}>{k} :</b> {String(v)}</span>
                    ))}
                  </div>
                </>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-4)', margin: '10px 0 16px', fontFamily: 'monospace' }}>{editKind === 'proxy' ? `${editId}${m.android ? ` · Android ${m.android}` : ''}` : ''}</div>

              <FieldLabel>{tr('Groupe de proxy', 'Proxy group')}</FieldLabel>
              <select value={epGroup} onChange={e => { setEpGroup(e.target.value); setEpProxyId(''); setEpCheck(null) }} style={fieldInput}>
                <option value="">{tr('Tous', 'All')}</option>
                {proxyGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>

              <FieldLabel style={{ marginTop: 14 }}>{tr('Proxy', 'Proxy')}</FieldLabel>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={epProxyId} onChange={e => { setEpProxyId(e.target.value); setEpCheck(null) }} style={{ ...fieldInput, flex: 1 }}>
                  <option value="">— {tr('Aucun', 'None')} —</option>
                  {epProxies.map(p => <option key={p.id} value={p.id} disabled={usedProxyIds.has(p.id) && p.id !== m.proxyId}>{p.type}://{proxyLabel(p)}{usedProxyIds.has(p.id) && p.id !== m.proxyId ? ` (${tr('pris', 'taken')})` : ''}</option>)}
                </select>
                <button onClick={epRandom} title={tr('Aléatoire', 'Random')} className="sf-btn sf-btn-ghost" style={{ height: 38, padding: '0 12px' }}>🔀</button>
                <button onClick={epCheckNow} disabled={!epProxyId} className="sf-btn sf-btn-ghost" style={{ height: 38, padding: '0 12px' }}>{tr('Vérifier', 'Check')}</button>
              </div>
              {epCheck && <div style={{ fontSize: 12, marginTop: 8, color: epCheck.loading ? 'var(--text-4)' : epCheck.ip ? 'var(--ok)' : '#F87171' }}>{epCheck.loading ? tr('Test…', 'Testing…') : epCheck.ip ? `✓ IP : ${epCheck.ip}` : `KO : ${epCheck.err}`}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
                <button onClick={() => setEditId(null)} className="sf-btn sf-btn-ghost">{tr('Annuler', 'Cancel')}</button>
                <button onClick={saveEdit} className="sf-btn sf-btn-primary">OK</button>
              </div>
            </div>
          </div>
        )
      })()}

      <style>{`.cp-row:hover { background: rgba(129,140,248,0.06); }`}</style>
    </div>
  )
}

const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }
const fieldInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-1)' }
function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, ...style }}>{children}</div>
}
function FChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 99, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-lt)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer' }}>{children}</button>
}

export default CloudPhones
