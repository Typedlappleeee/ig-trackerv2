// Admin — Proxies des cloud phones (facon GeeLark). Reserve au super-admin.
// Tableau dense sur le design system : groupe (reassignable), proxy copiable,
// statut + latence, IP sortante (cache partage avec Cloud Phones), nb de tels.
// Les groupes se creent independamment (bouton dedie).
import { useState, useEffect, useCallback, useRef, useReducer } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
import { loadCloudAgentConfig, getCloudAgent, loadAllCpMeta } from '@/lib/cloudPhones'
import { runProxyCheck, getProxyCheck, isStale } from '@/lib/proxyChecks'
import { ExitIpCell } from '@/components/ui/ExitIpCell'
import {
  listProxies, addProxies, deleteProxy, setProxyGroup,
  listGroups, addGroup, deleteGroup,
  parseProxyLine, proxyLabel, type Proxy, type ProxyType,
} from '@/lib/proxyStore'

interface Props { user: User }

export function Proxies({ user }: Props) {
  const { currentOrg } = useOrg()
  const orgId = currentOrg?.id ?? null
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [filter, setFilter] = useState<string>('all')      // 'all' | 'none' | nom de groupe
  const [showAdd, setShowAdd] = useState(false)
  const [raw, setRaw] = useState('')
  const [addToGroup, setAddToGroup] = useState('')
  const [type, setType] = useState<ProxyType>('socks5')
  const [busy, setBusy] = useState('')
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [checkingAll, setCheckingAll] = useState(false)
  const [agentReady, setAgentReady] = useState(false)
  const [phoneMeta, setPhoneMeta] = useState<Record<string, { proxyId?: string; name?: string }>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const startedRef = useRef<Set<string>>(new Set())
  const [, bump] = useReducer((x: number) => x + 1, 0)   // re-render quand un check change

  const load = useCallback(async () => {
    const [px, gr] = await Promise.all([listProxies(user.id), listGroups(user.id)])
    setProxies(px); setGroups(gr); setPhoneMeta(loadAllCpMeta())
  }, [user.id])
  useEffect(() => { load() }, [load])
  useEffect(() => { loadCloudAgentConfig(orgId, user.id).then(() => setAgentReady(!!getCloudAgent().url)) }, [orgId, user.id])
  useEffect(() => { const t = setInterval(bump, 4000); return () => clearInterval(t) }, [])   // rafraichit "il y a X min"

  const checkOne = async (p: Proxy) => {
    if (!getCloudAgent().url) { setBusy('Configure l’agent dans Cloud Phones pour tester'); window.setTimeout(() => setBusy(''), 3000); return }
    startedRef.current.add(p.id)
    setTesting(s => new Set(s).add(p.id))
    await runProxyCheck({ id: p.id, type: p.type, host: p.host, port: p.port, username: p.username, password: p.password })
    setTesting(s => { const n = new Set(s); n.delete(p.id); return n })
  }
  const runList = async (list: Proxy[]) => {
    let i = 0
    const worker = async () => { while (i < list.length) { await checkOne(list[i++]) } }
    await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker))
  }
  const checkAll = async () => { setCheckingAll(true); startedRef.current.clear(); await runList(visible); setCheckingAll(false) }

  const parsed = raw.split('\n').map(l => parseProxyLine(l, type)).filter(Boolean) as Omit<Proxy, 'id'>[]
  const countIn = (g: string) => proxies.filter(p => (p.group ?? '') === g).length
  const assignedTo = (pid: string) => Object.values(phoneMeta).filter(m => m.proxyId === pid)

  const doAdd = async () => {
    if (parsed.length === 0) { setBusy('Aucun proxy valide'); window.setTimeout(() => setBusy(''), 2500); return }
    setBusy('Ajout…')
    const r = await addProxies(parsed, { userId: user.id, orgId, group: addToGroup || undefined })
    if (r.ok) { setRaw(''); setShowAdd(false); setBusy(`✓ ${r.count} ajouté(s)`); load() } else setBusy(`Échec : ${r.error}`)
    window.setTimeout(() => setBusy(''), 3000)
  }
  const newGroup = async () => {
    const n = window.prompt('Nom du nouveau groupe :'); if (!n?.trim()) return
    const r = await addGroup(n.trim(), { userId: user.id, orgId })
    if (r.ok) { setFilter(n.trim()); load() } else setBusy(`Échec : ${r.error}`)
  }
  const removeGroup = async (g: string) => { if (window.confirm(`Supprimer le groupe « ${g} » ? (les proxies sont conservés, juste dégroupés)`)) { if (filter === g) setFilter('all'); await deleteGroup(g, user.id); load() } }
  const changeGroup = async (id: string, g: string) => { await setProxyGroup(id, g || null); load() }
  const remove = async (id: string) => { await deleteProxy(id); load() }
  const copyProxy = (p: Proxy) => { navigator.clipboard?.writeText(`${p.type}://${proxyLabel(p)}`); setCopied(p.id); window.setTimeout(() => setCopied(c => (c === p.id ? null : c)), 1400) }

  const visible = proxies.filter(p => filter === 'all' ? true : filter === 'none' ? !p.group : p.group === filter)

  // Auto-test des proxies visibles non encore en cache (throttle 4).
  useEffect(() => {
    if (!agentReady) return
    const pending = visible.filter(p => !startedRef.current.has(p.id) && !getProxyCheck(p.id))
    if (pending.length) runList(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxies, filter, agentReady])

  return (
    <div className="sf-page sf-page-enter">
      <header className="sf-page-header">
        <div className="sf-page-icon">🌐</div>
        <div>
          <h1 className="sf-page-title">Proxies</h1>
          <p className="sf-page-sub">SOCKS5 recommandé. Crée des groupes, teste les IP, puis assigne-les aux tels (Cloud Phones).</p>
        </div>
        <div className="sf-page-header-actions" style={{ display: 'flex', gap: 8 }}>
          <button onClick={checkAll} disabled={checkingAll || visible.length === 0} className="sf-btn sf-btn-ghost" style={{ height: 36 }}>{checkingAll ? '⏳ Test…' : '🔎 Vérifier'}</button>
          <button onClick={newGroup} className="sf-btn sf-btn-secondary" style={{ height: 36 }}>＋ Nouveau groupe</button>
          <button onClick={() => { setAddToGroup(filter !== 'all' && filter !== 'none' ? filter : ''); setShowAdd(true) }} className="sf-btn sf-btn-primary" style={{ height: 36 }}>＋ Ajouter des proxies</button>
        </div>
      </header>

      {/* Filtres par groupe */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>Tous · {proxies.length}</Chip>
        {groups.map(g => (
          <Chip key={g} on={filter === g} onClick={() => setFilter(g)} onDelete={() => removeGroup(g)}>{g} · {countIn(g)}</Chip>
        ))}
        {countIn('') > 0 && <Chip on={filter === 'none'} onClick={() => setFilter('none')}>Sans groupe · {countIn('')}</Chip>}
      </div>

      {/* Tableau */}
      <div className="sf-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 820 }}>
            <thead>
              <tr>
                <Th w={44}>#</Th><Th w={150}>Groupe</Th><Th>Proxy</Th><Th w={140}>Statut</Th><Th w={190}>IP sortante</Th><Th w={120}>Tels</Th><Th w={44} />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0
                ? <tr><td colSpan={7} style={{ padding: 34, textAlign: 'center', color: 'var(--text-4)' }}>Aucun proxy{filter !== 'all' ? ' dans ce groupe' : ''}. Clique « Ajouter des proxies ».</td></tr>
                : visible.map((p, i) => {
                  const used = assignedTo(p.id)
                  return (
                    <tr key={p.id} className="cp-row" style={{ borderTop: '1px solid var(--border)' }}>
                      <Td style={{ color: 'var(--text-4)' }}>{i + 1}</Td>
                      <Td>
                        <select value={p.group ?? ''} onChange={e => changeGroup(p.id, e.target.value)} className="sf-input" style={{ height: 30, fontSize: 12, padding: '0 8px', maxWidth: 140 }}>
                          <option value="">— Aucun —</option>
                          {groups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </Td>
                      <Td>
                        <button onClick={() => copyProxy(p)} title="Copier" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-1)', background: 'var(--surface-2, rgba(255,255,255,0.04))', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>
                          {p.type}://{proxyLabel(p)}
                          <span style={{ color: copied === p.id ? 'var(--ok)' : 'var(--text-4)' }}>{copied === p.id ? '✓' : '⧉'}</span>
                        </button>
                      </Td>
                      <Td><StatusCell id={p.id} testing={testing.has(p.id)} onTest={() => checkOne(p)} /></Td>
                      <Td><ExitIpCell proxyId={p.id} testing={testing.has(p.id)} onTest={() => checkOne(p)} /></Td>
                      <Td>
                        {used.length === 0
                          ? <span style={{ color: 'var(--text-4)' }}>libre</span>
                          : used.length === 1
                            ? <span className="sf-badge sf-badge-ok" title={used[0].name}>● {used[0].name || 'assigné'}</span>
                            : <span className="sf-badge sf-badge-warn" title={used.map(u => u.name).join(', ')}>partagé ×{used.length}</span>}
                      </Td>
                      <Td><button onClick={() => remove(p.id)} title="Supprimer" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 13 }}>✕</button></Td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
      {busy && <div style={{ fontSize: 12.5, marginTop: 10, color: busy.startsWith('✓') ? 'var(--ok)' : busy.startsWith('Échec') || busy.startsWith('Aucun') ? 'var(--danger)' : 'var(--text-2)' }}>{busy}</div>}

      {/* Modal ajout */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(6,7,12,0.6)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 3000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="sf-card sf-anim-scale-spring" style={{ width: 'min(560px,94vw)', padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Ajouter des proxies</h3>
              <span style={{ flex: 1 }} />
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={7} autoFocus
              placeholder={'Un proxy par ligne :\nhost:port:user:pass\nuser:pass@host:port\nsocks5://user:pass@host:port'}
              className="sf-input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, fontFamily: 'ui-monospace, monospace', padding: 10, resize: 'vertical' }} />
            <div style={{ fontSize: 11.5, color: 'var(--text-4)', margin: '6px 2px 0' }}>{parsed.length} valide(s){raw.trim() ? ` / ${raw.split('\n').filter(l => l.trim()).length} ligne(s)` : ''}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11.5, color: 'var(--text-4)' }}>Groupe</label>
              <select value={addToGroup} onChange={e => setAddToGroup(e.target.value)} className="sf-input" style={{ height: 34, minWidth: 150, fontSize: 12.5 }}>
                <option value="">— Aucun —</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <label style={{ fontSize: 11.5, color: 'var(--text-4)', marginLeft: 6 }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value as ProxyType)} className="sf-input" style={{ height: 34, fontSize: 12.5 }}>
                <option value="socks5">SOCKS5</option>
                <option value="http">HTTP</option>
              </select>
              <span style={{ flex: 1 }} />
              <button onClick={() => setShowAdd(false)} className="sf-btn sf-btn-ghost">Annuler</button>
              <button onClick={doAdd} className="sf-btn sf-btn-primary">Ajouter{parsed.length ? ` (${parsed.length})` : ''}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`.cp-row:hover { background: var(--accent-dim); }`}</style>
    </div>
  )
}

function StatusCell({ id, testing, onTest }: { id: string; testing: boolean; onTest: () => void }) {
  if (testing) return <span style={{ color: 'var(--text-4)' }}>● test…</span>
  const c = getProxyCheck(id)
  if (!c) return <button onClick={onTest} style={{ background: 'none', border: '1px solid var(--border-md)', borderRadius: 6, color: 'var(--text-4)', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>● non testé</button>
  if (!c.reachable) return <span onClick={onTest} title={c.error} style={{ color: 'var(--danger)', fontWeight: 700, cursor: 'pointer' }}>● KO ↻</span>
  return <span style={{ color: isStale(c) ? 'var(--text-4)' : 'var(--ok)', fontWeight: 700 }}>● OK{c.latencyMs ? <span style={{ color: 'var(--text-4)', fontWeight: 400 }}> · {c.latencyMs} ms</span> : null}</span>
}
function Th({ children, w }: { children?: React.ReactNode; w?: number }) {
  return <th style={{ padding: '10px 12px', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, width: w, textAlign: 'left', color: 'var(--text-4)', background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap' }}>{children}</th>
}
function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '9px 12px', ...style }}>{children}</td>
}
function Chip({ on, onClick, onDelete, children }: { on: boolean; onClick: () => void; onDelete?: () => void; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 99, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-lt)' : 'transparent', overflow: 'hidden' }}>
      <button onClick={onClick} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', border: 'none', background: 'transparent', color: on ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer' }}>{children}</button>
      {onDelete && <button onClick={onDelete} title="Supprimer le groupe" style={{ border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', fontSize: 11, padding: '0 8px 0 0' }}>✕</button>}
    </span>
  )
}

export default Proxies
