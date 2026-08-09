/**
 * Santé des proxys — tableau par téléphone : proxy configuré (server:port),
 * détection des proxys PARTAGÉS (plusieurs comptes sur la même IP = risque de ban),
 * et vérification de l'IP publique EN DIRECT à la demande (allume le tél).
 *
 * Le proxy configuré se lit sans allumer le téléphone (dans les données GeeLark).
 * L'IP réelle nécessite un `curl` sur le tél → on la vérifie uniquement sur la
 * sélection (bouton), pas sur les 700 d'un coup.
 */
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import {
  fetchAllPhones, getPhonePublicIp, startPhones, waitForPhoneConnectivity, type GeelarkPhone,
} from '@/lib/geelark'
import { useTr } from '@/lib/i18n'

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
  const tr = useTr()
  const { bearer } = useConnections(user)
  const { role, perms } = useOrg()
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
    try {
      const raw = await fetchAllPhones(bearer)
      // 🔒 Filtre à la source : le membre ne voit que ses groupes autorisés.
      setPhones(role ? raw.filter(p => canAccessPhoneGroup(role, perms, p.group?.name ?? p.groupName ?? null)) : raw)
    }
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
    <div className="sf-page anim-page">
      {/* En-tête de page v2 */}
      <div className="sf-page-header">
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" aria-hidden style={{ ['--icon-grad' as string]: 'linear-gradient(135deg,#38BDF8,#6366F1)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title">{tr('Santé des proxys', 'Proxy health')}</h1>
            <p className="sf-page-sub">{tr('Proxy par téléphone · proxys partagés (risque de ban) · IP en direct', 'Proxy per phone · shared proxies (ban risk) · live IP')}</p>
          </div>
        </div>
        <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
          {checking ? (
            <span className="sf-status-chip is-accent"><span className="sf-status-dot" />{tr('Vérification…', 'Checking…')}</span>
          ) : sharedProxies > 0 ? (
            <span className="sf-status-chip" style={{ color: 'var(--warn)', background: 'var(--warn-dim)', borderColor: 'rgba(245,158,11,0.22)' }}>
              <span className="sf-status-dot" />{tr(`${sharedProxies} partagé(s)`, `${sharedProxies} shared`)}
            </span>
          ) : phones.length > 0 && (
            <span className="sf-status-chip is-live"><span className="sf-status-dot" />{tr('Sain', 'Healthy')}</span>
          )}
          <button onClick={checkIps} disabled={!selected.size || checking} className="sf-btn sf-btn-primary sf-btn-sm cursor-pointer" title={tr('Allume les téléphones sélectionnés et lit leur IP publique réelle', 'Powers on the selected phones and reads their real public IP')}>
            {checking ? tr('Vérification…', 'Checking…') : tr(`Vérifier l'IP (${selected.size})`, `Check IP (${selected.size})`)}
          </button>
          <button onClick={load} disabled={loading} className="sf-btn sf-btn-secondary sf-btn-icon sf-btn-sm cursor-pointer" title={tr('Actualiser', 'Refresh')} aria-label={tr('Actualiser', 'Refresh')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </div>

      <div className="sf-page-body">
        {!bearer ? (
          <div className="sf-empty">
            <div className="sf-empty-icon" aria-hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
            </div>
            <div className="sf-empty-title">{tr('Connexion GeeLark manquante', 'GeeLark connection missing')}</div>
            <div className="sf-empty-desc">{tr('Ajoute ton token GeeLark dans les Réglages pour afficher la santé des proxys.', 'Add your GeeLark token in Settings to display proxy health.')}</div>
          </div>
        ) : (
          <>
            {/* Statistiques */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
              <Tile label={tr('Téléphones', 'Phones')} value={String(phones.length)}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>} />
              <Tile label={tr('Proxys uniques', 'Unique proxies')} value={String(uniqueProxies)}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>} />
              <Tile label={tr('Proxys partagés', 'Shared proxies')} value={String(sharedProxies)} accent={sharedProxies > 0 ? 'var(--warn)' : 'var(--ok)'} tint={sharedProxies > 0 ? 'warn' : 'ok'} sub={sharedProxies > 0 ? tr('plusieurs comptes / IP', 'multiple accounts / IP') : tr('aucun', 'none')}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
              <Tile label={tr('Sans proxy', 'No proxy')} value={String(noProxy)} accent={noProxy > 0 ? 'var(--danger)' : 'var(--ok)'} tint={noProxy > 0 ? 'danger' : 'ok'}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>} />
            </div>

            {/* Filtres */}
            <div className="sf-cluster" style={{ gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
              {groups.length > 1 && (
                <select value={group} onChange={e => setGroup(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 34, fontSize: 13 }}>
                  {groups.map(g => <option key={g} value={g}>{g === 'Tous' ? tr('Tous', 'All') : g}</option>)}
                </select>
              )}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Rechercher (tél, proxy)…', 'Search (phone, proxy)…')} className="sf-input" style={{ flex: 1, minWidth: 180, maxWidth: 320, height: 34, fontSize: 13 }} />
              <button onClick={() => setSelected(new Set(visible.map(p => p.id)))} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">{tr('Tout sélectionner', 'Select all')}</button>
              <button onClick={() => setSelected(new Set())} disabled={!selected.size} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">{tr('Aucun', 'None')}</button>
              <span className="sf-tabular" style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 'auto' }}>{tr(`${visible.length} tél.`, `${visible.length} phones`)}</span>
            </div>

            {loading ? (
              <div className="sf-card" style={{ overflow: 'hidden', padding: 0 }}>
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 120px 1fr 150px', gap: 8, padding: '11px 14px', borderBottom: i < 5 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                    <div className="sf-skeleton" style={{ width: 15, height: 15, borderRadius: 4 }} />
                    <div className="sf-skeleton-text" style={{ width: '65%' }} />
                    <div className="sf-skeleton-text" style={{ width: '55%' }} />
                    <div className="sf-skeleton-text" style={{ width: '80%' }} />
                    <div className="sf-skeleton-text" style={{ width: '50%' }} />
                  </div>
                ))}
              </div>
            ) : err ? (
              <div className="sf-banner is-danger">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span style={{ minWidth: 0 }}>{err}</span>
                <button onClick={load} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer sf-banner-action">{tr('Réessayer', 'Retry')}</button>
              </div>
            ) : visible.length === 0 ? (
              <div className="sf-empty">
                <div className="sf-empty-icon" aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <div className="sf-empty-title">{tr('Aucun téléphone', 'No phones')}</div>
                <div className="sf-empty-desc">{search || group !== 'Tous' ? tr('Aucun résultat pour ce filtre. Élargis la recherche ou change de groupe.', 'No results for this filter. Broaden the search or switch group.') : tr('Aucun téléphone GeeLark disponible pour le moment.', 'No GeeLark phone available right now.')}</div>
              </div>
            ) : (
              <div className="sf-card" style={{ overflow: 'hidden', padding: 0 }}>
                <div className="sf-scroll-x">
                  {/* En-tête de table */}
                  <div style={{ display: 'grid', gridTemplateColumns: '30px minmax(120px,1fr) 120px minmax(140px,1fr) 150px', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-md)', background: 'rgba(255,255,255,0.015)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)' }}>
                    <span></span><span>{tr('Téléphone', 'Phone')}</span><span>{tr('Groupe', 'Group')}</span><span>{tr('Proxy', 'Proxy')}</span><span>{tr('IP en direct', 'Live IP')}</span>
                  </div>
                  <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
                    {visible.slice(0, 400).map(p => {
                      const k = proxyKey(p)
                      const shared = k ? (proxyCounts.get(k) ?? 0) : 0
                      const ip = ips[p.id]
                      const ipConflict = ip && ip !== 'checking' && ip !== 'fail' && (ipCounts.get(ip) ?? 0) > 1
                      const sel = selected.has(p.id)
                      return (
                        <div key={p.id} onClick={() => toggle(p.id)} className="cursor-pointer sf-proxy-row" style={{ display: 'grid', gridTemplateColumns: '30px minmax(120px,1fr) 120px minmax(140px,1fr) 150px', gap: 8, padding: '11px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 12.5, background: sel ? 'rgba(99,102,241,0.07)' : 'transparent', transition: 'background var(--t-fast)' }}>
                          <div style={{ width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border-accent)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--t-fast)' }}>
                            {sel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M20 6 9 17l-5-5"/></svg>}
                          </div>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneName(p)}</span>
                          <span style={{ color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.group?.name ?? p.groupName ?? '—'}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: k ? 'var(--text-2)' : 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k || tr('aucun proxy', 'no proxy')}</span>
                            {shared > 1 && <span title={tr(`${shared} téléphones sur ce proxy`, `${shared} phones on this proxy`)} className="sf-badge sf-badge-warn" style={{ flexShrink: 0 }}>{tr(`partagé ×${shared}`, `shared ×${shared}`)}</span>}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                            {ip === 'checking' ? <span style={{ color: 'var(--accent-l)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><span className="sf-spinner" style={{ width: 11, height: 11 }} />{tr('…', '…')}</span>
                              : ip === 'fail' ? <span style={{ color: 'var(--danger)' }}>{tr('✕ injoignable', '✕ unreachable')}</span>
                              : ip ? <span style={{ color: ipConflict ? 'var(--danger)' : 'var(--ok)', fontWeight: ipConflict ? 700 : 400 }}>{ip}{ipConflict ? tr(' ⚠ même IP', ' ⚠ same IP') : ''}</span>
                              : <span style={{ color: 'var(--text-4)' }}>—</span>}
                          </span>
                        </div>
                      )
                    })}
                    {visible.length > 400 && <div style={{ padding: 12, fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center' }}>{tr(`+${visible.length - 400} autres — affine le filtre.`, `+${visible.length - 400} more — refine the filter.`)}</div>}
                  </div>
                </div>
              </div>
            )}
            <p className="sf-hint" style={{ marginTop: 'var(--sp-3)', maxWidth: 720 }}>
              {tr('« Partagé » = plusieurs téléphones configurés sur le même proxy. « Même IP » (après vérif) = ils sortent vraiment sur la même IP publique → risque de ban si tu postes dessus en même temps. La vérif d\'IP ', '« Shared » = several phones configured on the same proxy. « Same IP » (after check) = they really exit on the same public IP → ban risk if you post on them at the same time. The IP check ')}<b>{tr('allume', 'powers on')}</b>{tr(' les téléphones sélectionnés.', ' the selected phones.')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Tile({ icon, label, value, sub, accent, tint }: { icon: ReactNode; label: string; value: string; sub?: string; accent?: string; tint?: 'ok' | 'warn' | 'danger' | 'accent' }) {
  const tintBg = tint === 'warn' ? 'var(--warn-dim)' : tint === 'danger' ? 'var(--danger-dim)' : tint === 'ok' ? 'var(--ok-dim)' : 'var(--accent-dim)'
  const tintColor = tint === 'warn' ? 'var(--warn)' : tint === 'danger' ? 'var(--danger)' : tint === 'ok' ? 'var(--ok)' : 'var(--accent-glow)'
  return (
    <div className="sf-stat-card sf-card-lift">
      <div className="sf-cluster" style={{ justifyContent: 'space-between' }}>
        <span className="sf-stat-label">{label}</span>
        <span className="sf-stat-icon" style={{ background: tintBg, color: tintColor }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="sf-stat-value sf-tabular" style={accent ? { color: accent } : undefined}>{value}</span>
        {sub && <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{sub}</span>}
      </div>
    </div>
  )
}
