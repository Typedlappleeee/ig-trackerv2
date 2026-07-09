/**
 * Santé des proxys — tableau par téléphone : proxy configuré (server:port),
 * détection des proxys PARTAGÉS (plusieurs comptes sur la même IP = risque de ban),
 * et vérification de l'IP publique EN DIRECT à la demande (allume le tél).
 *
 * Le proxy configuré se lit sans allumer le téléphone (dans les données GeeLark).
 * L'IP réelle nécessite un `curl` sur le tél → on la vérifie uniquement sur la
 * sélection (bouton), pas sur les 700 d'un coup.
 */
import { useState, useEffect, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import {
  fetchAllPhones, getPhonePublicIp, startPhones, waitForPhoneConnectivity, type GeelarkPhone,
} from '@/lib/geelark'

const phoneName = (p: GeelarkPhone) => p.serialName ?? p.name ?? p.serialNo ?? p.id.slice(-6)
const proxyKey  = (p: GeelarkPhone) => { const px = p.proxy; return px?.server ? `${px.server}:${px.port ?? ''}` : '' }

type IpState = string | 'checking' | 'fail'

async function pLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; await worker(it) }
  }))
}

export function ProxyHealth({ user }: { user: User }) {
  const { bearer } = useConnections(user)
  const [phones, setPhones]   = useState<GeelarkPhone[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [group, _setGroup]    = useState(loadLastGroup)
  const setGroup = (g: string) => { _setGroup(g); saveLastGroup(g) }
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ips, setIps]         = useState<Record<string, IpState>>({})
  const [checking, setChecking] = useState(false)

  async function load() {
    if (!bearer) return
    setLoading(true); setErr(null)
    try { setPhones(await fetchAllPhones(bearer)) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }
  useEffect(() => { if (bearer) load() }, [bearer])

  const groups = ['Tous', ...[...new Set(phones.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()]
  const visible = phones.filter(p => {
    const g = p.group?.name ?? p.groupName ?? null
    if (group !== 'Tous' && g !== group) return false
    if (search && !(phoneName(p).toLowerCase().includes(search.toLowerCase()) || proxyKey(p).includes(search))) return false
    return true
  })

  // Compte de tél par proxy (server:port) → détecte les proxys partagés.
  const proxyCounts = useMemo(() => {
    const m = new Map<string, number>()
    phones.forEach(p => { const k = proxyKey(p); if (k) m.set(k, (m.get(k) ?? 0) + 1) })
    return m
  }, [phones])

  // Compte de tél par IP LIVE vérifiée → détecte les vrais conflits d'IP identiques.
  const ipCounts = useMemo(() => {
    const m = new Map<string, number>()
    Object.values(ips).forEach(v => { if (v && v !== 'checking' && v !== 'fail') m.set(v, (m.get(v) ?? 0) + 1) })
    return m
  }, [ips])

  const withProxy    = phones.filter(p => proxyKey(p)).length
  const uniqueProxies = proxyCounts.size
  const sharedProxies = [...proxyCounts.values()].filter(n => n > 1).length
  const noProxy       = phones.length - withProxy

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function checkIps() {
    if (!bearer) return
    const targets = phones.filter(p => selected.has(p.id))
    if (!targets.length) return
    setChecking(true)
    setIps(prev => { const n = { ...prev }; targets.forEach(p => { n[p.id] = 'checking' }); return n })
    await pLimit(targets, 5, async p => {
      try {
        await startPhones(bearer, [p.id]).catch(() => {})
        await waitForPhoneConnectivity(bearer, p.id, () => {}, { tries: 8 })
        const ip = await getPhonePublicIp(bearer, p.id)
        setIps(prev => ({ ...prev, [p.id]: ip ?? 'fail' }))
      } catch { setIps(prev => ({ ...prev, [p.id]: 'fail' })) }
    })
    setChecking(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Proxy par téléphone, proxys partagés (risque de ban) et IP en direct.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={checkIps} disabled={!selected.size || checking} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" style={{ opacity: (!selected.size || checking) ? 0.5 : 1 }} title="Allume les téléphones sélectionnés et lit leur IP publique réelle">
            {checking ? '⏳ Vérification…' : `🌍 Vérifier l'IP (${selected.size})`}
          </button>
          <button onClick={load} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">↻</button>
        </div>
      </div>

      <div>
        {!bearer ? (
          <div className="sf-card" style={{ padding: 24, maxWidth: 480 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--warn)', margin: '0 0 6px' }}>Connexion GéeLark manquante</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Ajoute ton token GéeLark dans les Réglages.</p>
          </div>
        ) : (
          <>
            {/* Tuiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
              <Tile icon="📱" label="Téléphones" value={String(phones.length)} />
              <Tile icon="🌐" label="Proxys uniques" value={String(uniqueProxies)} />
              <Tile icon="⚠️" label="Proxys partagés" value={String(sharedProxies)} accent={sharedProxies > 0 ? '#fbbf24' : 'var(--ok)'} sub={sharedProxies > 0 ? 'plusieurs comptes / IP' : 'aucun'} />
              <Tile icon="🚫" label="Sans proxy" value={String(noProxy)} accent={noProxy > 0 ? 'var(--err)' : 'var(--ok)'} />
            </div>

            {/* Filtres */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              {groups.length > 1 && (
                <select value={group} onChange={e => setGroup(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 32, fontSize: 12.5 }}>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (tél, proxy)…" className="sf-input" style={{ flex: 1, minWidth: 180, maxWidth: 320, height: 32, fontSize: 12.5 }} />
              <button onClick={() => setSelected(new Set(visible.map(p => p.id)))} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">Tout sélectionner</button>
              <button onClick={() => setSelected(new Set())} disabled={!selected.size} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ opacity: selected.size ? 1 : 0.4 }}>Aucun</button>
              <span style={{ fontSize: 12, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>{visible.length} tél.</span>
            </div>

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1, 2, 3].map(i => <div key={i} className="sf-card sf-skeleton" style={{ height: 44 }} />)}</div>
            ) : err ? (
              <div style={{ color: 'var(--err)', fontSize: 13 }}>{err}</div>
            ) : (
              <div className="sf-card" style={{ overflow: 'hidden', padding: 0 }}>
                {/* En-tête */}
                <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 120px 1fr 150px', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--border)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-4)' }}>
                  <span></span><span>Téléphone</span><span>Groupe</span><span>Proxy</span><span>IP en direct</span>
                </div>
                <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
                  {visible.slice(0, 400).map(p => {
                    const k = proxyKey(p)
                    const shared = k ? (proxyCounts.get(k) ?? 0) : 0
                    const ip = ips[p.id]
                    const ipConflict = ip && ip !== 'checking' && ip !== 'fail' && (ipCounts.get(ip) ?? 0) > 1
                    const sel = selected.has(p.id)
                    return (
                      <div key={p.id} onClick={() => toggle(p.id)} className="cursor-pointer" style={{ display: 'grid', gridTemplateColumns: '30px 1fr 120px 1fr 150px', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 12.5, background: sel ? 'rgba(99,102,241,0.07)' : 'transparent' }}>
                        <div style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${sel ? 'var(--accent)' : 'rgba(99,102,241,0.3)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {sel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M20 6 9 17l-5-5"/></svg>}
                        </div>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneName(p)}</span>
                        <span style={{ color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.group?.name ?? p.groupName ?? '—'}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: k ? 'var(--text-2)' : 'var(--err)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k || 'aucun proxy'}</span>
                          {shared > 1 && <span title={`${shared} téléphones sur ce proxy`} style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>partagé ×{shared}</span>}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                          {ip === 'checking' ? <span style={{ color: 'var(--accent-l)' }}>⧗ …</span>
                            : ip === 'fail' ? <span style={{ color: 'var(--err)' }}>✕ injoignable</span>
                            : ip ? <span style={{ color: ipConflict ? '#f87171' : 'var(--ok)' }}>{ip}{ipConflict ? ' ⚠ même IP' : ''}</span>
                            : <span style={{ color: 'var(--text-4)' }}>—</span>}
                        </span>
                      </div>
                    )
                  })}
                  {visible.length > 400 && <div style={{ padding: 12, fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center' }}>+{visible.length - 400} autres — affine le filtre.</div>}
                </div>
              </div>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 10 }}>
              « Partagé » = plusieurs téléphones configurés sur le même proxy. « Même IP » (après vérif) = ils sortent vraiment sur la même IP publique → risque de ban si tu postes dessus en même temps. La vérif d'IP <b>allume</b> les téléphones sélectionnés.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Tile({ icon, label, value, sub, accent }: { icon: string; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="sf-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: accent ?? 'var(--text-1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {sub && <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{sub}</span>}
      </div>
    </div>
  )
}
