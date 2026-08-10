// Admin — Proxies des cloud phones (façon GeeLark). Réservé au super-admin.
// Tableau : groupe (réassignable), proxy, IP sortante (bientôt), nb de tels.
// Les groupes se créent INDÉPENDAMMENT (bouton dédié), pas à l'ajout d'un proxy.
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
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
  const [filter, setFilter] = useState<string>('all')   // 'all' | 'none' | nom de groupe
  const [showAdd, setShowAdd] = useState(false)
  const [raw, setRaw] = useState('')
  const [addToGroup, setAddToGroup] = useState('')
  const [type, setType] = useState<ProxyType>('socks5')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const [px, gr] = await Promise.all([listProxies(user.id), listGroups(user.id)])
    setProxies(px); setGroups(gr)
  }, [user.id])
  useEffect(() => { load() }, [load])

  const parsed = raw.split('\n').map(l => parseProxyLine(l, type)).filter(Boolean) as Omit<Proxy, 'id'>[]
  const countIn = (g: string) => proxies.filter(p => (p.group ?? '') === g).length

  const doAdd = async () => {
    if (parsed.length === 0) { setBusy('Aucun proxy valide'); window.setTimeout(() => setBusy(''), 2500); return }
    setBusy('Ajout…')
    const r = await addProxies(parsed, { userId: user.id, orgId, group: addToGroup || undefined })
    if (r.ok) { setRaw(''); setShowAdd(false); setBusy(`✓ ${r.count} ajouté(s)`); load() } else setBusy(`Échec : ${r.error}`)
    window.setTimeout(() => setBusy(''), 3000)
  }
  const newGroup = async () => {
    const n = window.prompt('Nom du nouveau groupe :')
    if (!n?.trim()) return
    const r = await addGroup(n.trim(), { userId: user.id, orgId })
    if (r.ok) { setFilter(n.trim()); load() } else setBusy(`Échec : ${r.error}`)
  }
  const removeGroup = async (g: string) => { if (window.confirm(`Supprimer le groupe « ${g} » ? (les proxies sont conservés, juste dégroupés)`)) { if (filter === g) setFilter('all'); await deleteGroup(g, user.id); load() } }
  const changeGroup = async (id: string, g: string) => { await setProxyGroup(id, g || null); load() }
  const remove = async (id: string) => { await deleteProxy(id); load() }

  const visible = proxies.filter(p => filter === 'all' ? true : filter === 'none' ? !p.group : p.group === filter)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 20px' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#F0F0F7', margin: 0 }}>🌐 Proxies</h1>
        <span style={{ fontSize: 12, color: '#8a8a9c', background: 'rgba(255,255,255,0.06)', borderRadius: 99, padding: '2px 10px' }}>{proxies.length} au total</span>
        <span style={{ flex: 1 }} />
        <button onClick={newGroup} style={btnGhost}>＋ Nouveau groupe</button>
        <button onClick={() => { setAddToGroup(filter !== 'all' && filter !== 'none' ? filter : ''); setShowAdd(true) }} style={btnPrimary}>＋ Ajouter des proxies</button>
      </div>
      <p style={{ fontSize: 12.5, color: '#8a8a9c', margin: '4px 0 16px' }}>SOCKS5 recommandé. Crée des groupes, range tes proxies dedans, puis assigne-les aux tels (Cloud Phones).</p>

      {/* Filtres par groupe */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>Tous · {proxies.length}</Chip>
        {groups.map(g => (
          <span key={g} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Chip on={filter === g} onClick={() => setFilter(g)}>{g} · {countIn(g)}</Chip>
            <button onClick={() => removeGroup(g)} title="Supprimer le groupe" style={{ marginLeft: -4, marginRight: 2, background: 'none', border: 'none', color: '#6b6b7c', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </span>
        ))}
        {countIn('') > 0 && <Chip on={filter === 'none'} onClick={() => setFilter('none')}>Sans groupe · {countIn('')}</Chip>}
      </div>

      {/* Tableau */}
      <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', color: '#8a8a9c', textAlign: 'left' }}>
                <Th w={40}>#</Th><Th w={170}>Groupe</Th><Th>Proxy</Th><Th w={100}>Type</Th><Th w={130}>IP sortante</Th><Th w={70}>Tels</Th><Th w={50}></Th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0
                ? <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#6b6b7c' }}>Aucun proxy{filter !== 'all' ? ' dans ce groupe' : ''}. Clique « Ajouter des proxies ».</td></tr>
                : visible.map((p, i) => (
                  <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Td style={{ color: '#6b6b7c' }}>{i + 1}</Td>
                    <Td>
                      <select value={p.group ?? ''} onChange={e => changeGroup(p.id, e.target.value)} style={selMini}>
                        <option value="">— Aucun —</option>
                        {groups.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </Td>
                    <Td style={{ fontFamily: 'ui-monospace, monospace', color: '#E9E9F2' }}>{p.type}://{proxyLabel(p)}</Td>
                    <Td><span style={{ fontSize: 10, fontWeight: 800, color: '#C7D2FE', background: 'rgba(129,140,248,0.15)', borderRadius: 6, padding: '2px 6px' }}>{p.type.toUpperCase()}</span></Td>
                    <Td style={{ color: '#6b6b7c' }}>—</Td>
                    <Td style={{ color: '#6b6b7c' }}>—</Td>
                    <Td><button onClick={() => remove(p.id)} style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 13 }}>✕</button></Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {busy && <div style={{ fontSize: 12.5, marginTop: 10, color: busy.startsWith('✓') ? '#34D399' : busy.startsWith('Échec') || busy.startsWith('Aucun') ? '#F87171' : '#c8c8d8' }}>{busy}</div>}
      <p style={{ fontSize: 11.5, color: '#6b6b7c', marginTop: 14 }}>ℹ️ IP sortante & nombre de tels : bientôt (Phase 2 — test + routage du trafic).</p>

      {/* Modal ajout */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px,92vw)', background: '#12131d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#F0F0F7', marginBottom: 12 }}>Ajouter des proxies</div>
            <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={7} autoFocus
              placeholder={'Un proxy par ligne :\nhost:port:user:pass\nuser:pass@host:port\nsocks5://user:pass@host:port'}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, fontFamily: 'ui-monospace, monospace', padding: '10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.4)', color: '#E9E9F2', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11.5, color: '#8a8a9c' }}>Groupe</label>
              <select value={addToGroup} onChange={e => setAddToGroup(e.target.value)} style={{ ...selMini, minWidth: 150 }}>
                <option value="">— Aucun —</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <label style={{ fontSize: 11.5, color: '#8a8a9c', marginLeft: 6 }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value as ProxyType)} style={selMini}>
                <option value="socks5">SOCKS5</option>
                <option value="http">HTTP</option>
              </select>
              <span style={{ flex: 1 }} />
              <button onClick={() => setShowAdd(false)} style={btnGhost}>Annuler</button>
              <button onClick={doAdd} style={btnPrimary}>Ajouter{parsed.length ? ` (${parsed.length})` : ''}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const btnPrimary: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#818CF8,#6366F1)', color: '#fff', cursor: 'pointer' }
const btnGhost: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: '#d2d2e0', cursor: 'pointer' }
const selMini: React.CSSProperties = { fontSize: 12, padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2' }

function Th({ children, w }: { children?: React.ReactNode; w?: number }) {
  return <th style={{ padding: '9px 12px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, width: w }}>{children}</th>
}
function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '8px 12px', ...style }}>{children}</td>
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 99, border: `1px solid ${on ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'}`, background: on ? 'rgba(129,140,248,0.18)' : 'rgba(255,255,255,0.04)', color: on ? '#C7D2FE' : '#a8a8ba', cursor: 'pointer' }}>{children}</button>
}

export default Proxies
