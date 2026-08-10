// Admin — Proxies des cloud phones. Réservé au super-admin. Ajout en masse
// (une ligne par proxy), organisation en groupes, suppression. L'assignation aux
// téléphones se fait à la création/édition d'un tel (page Cloud Phones).
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
import { listProxies, addProxies, deleteProxy, deleteGroup, parseProxyLine, proxyLabel, type Proxy, type ProxyType } from '@/lib/proxyStore'

interface Props { user: User }

export function Proxies({ user }: Props) {
  const { currentOrg } = useOrg()
  const orgId = currentOrg?.id ?? null
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [raw, setRaw] = useState('')
  const [group, setGroup] = useState('')
  const [type, setType] = useState<ProxyType>('socks5')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => { setProxies(await listProxies(user.id)) }, [user.id])
  useEffect(() => { load() }, [load])

  const parsed = raw.split('\n').map(l => parseProxyLine(l, type)).filter(Boolean) as Omit<Proxy, 'id'>[]

  const add = async () => {
    if (parsed.length === 0) { setBusy('Aucun proxy valide (format host:port:user:pass)'); return }
    setBusy('Ajout…')
    const r = await addProxies(parsed, { userId: user.id, orgId, group })
    if (r.ok) { setBusy(`✓ ${r.count} proxy ajouté(s)`); setRaw(''); load() } else setBusy(`Échec : ${r.error}`)
    window.setTimeout(() => setBusy(''), 3000)
  }
  const del = async (id: string) => { await deleteProxy(id); load() }
  const delGroup = async (g: string) => { if (window.confirm(`Supprimer tout le groupe « ${g} » ?`)) { await deleteGroup(g, user.id); load() } }

  // Regroupe par groupe (ordre : groupes nommés puis "Sans groupe").
  const groups = new Map<string, Proxy[]>()
  proxies.forEach(p => { const g = p.group?.trim() || 'Sans groupe'; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(p) })

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#F0F0F7', margin: '0 0 4px' }}>🌐 Proxies</h1>
      <p style={{ fontSize: 13, color: '#8a8a9c', margin: '0 0 20px' }}>Tes proxies pour les cloud phones (SOCKS5 recommandé). Organise-les en groupes, puis assigne-les aux téléphones à la création/édition.</p>

      {/* Ajout en masse */}
      <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#C7D2FE', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Ajouter des proxies</div>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={5}
          placeholder={'Un proxy par ligne, ex :\nhost:port:user:pass\nuser:pass@host:port\nsocks5://user:pass@host:port'}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, fontFamily: 'ui-monospace, monospace', padding: '9px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <input value={group} onChange={e => setGroup(e.target.value)} placeholder="Groupe (ex : Résidentiels FR)" style={{ flex: 1, minWidth: 180, boxSizing: 'border-box', fontSize: 12.5, padding: '9px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2' }} />
          <select value={type} onChange={e => setType(e.target.value as ProxyType)} style={{ fontSize: 12.5, padding: '9px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2' }}>
            <option value="socks5">SOCKS5</option>
            <option value="http">HTTP</option>
          </select>
          <button onClick={add} style={{ fontSize: 13, fontWeight: 800, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#818CF8,#6366F1)', color: '#fff', cursor: 'pointer' }}>
            Ajouter{parsed.length ? ` (${parsed.length})` : ''}
          </button>
        </div>
        {busy && <div style={{ fontSize: 12, marginTop: 8, color: busy.startsWith('✓') ? '#34D399' : busy.startsWith('Échec') || busy.startsWith('Aucun') ? '#F87171' : '#c8c8d8' }}>{busy}</div>}
      </div>

      {/* Liste par groupe */}
      {proxies.length === 0
        ? <p style={{ fontSize: 13, color: '#6b6b7c', textAlign: 'center', padding: 30 }}>Aucun proxy pour l’instant. Colle-en ci-dessus.</p>
        : [...groups.entries()].map(([g, list]) => (
          <div key={g} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#E9E9F2' }}>{g}</span>
              <span style={{ fontSize: 11, color: '#8a8a9c', background: 'rgba(255,255,255,0.06)', borderRadius: 99, padding: '1px 8px' }}>{list.length}</span>
              <span style={{ flex: 1 }} />
              {g !== 'Sans groupe' && <button onClick={() => delGroup(g)} style={{ fontSize: 10.5, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer' }}>Supprimer le groupe</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {list.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#C7D2FE', background: 'rgba(129,140,248,0.15)', borderRadius: 6, padding: '2px 6px' }}>{p.type.toUpperCase()}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#E9E9F2', fontFamily: 'ui-monospace, monospace' }}>{proxyLabel(p)}</span>
                  <button onClick={() => del(p.id)} style={{ fontSize: 12, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}

      <p style={{ fontSize: 11.5, color: '#6b6b7c', marginTop: 20, lineHeight: 1.5 }}>ℹ️ L’assignation d’un proxy à un téléphone (et son application réelle au trafic) se fait ensuite depuis <b>Cloud Phones</b>. Le test d’IP sortante arrive prochainement.</p>
    </div>
  )
}

export default Proxies
