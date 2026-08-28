import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Panel, PanelHead, PageHead, Kpi, Empty } from '@/lib/ui'
import type { OrgState } from '@/lib/data'

// ── Type Proxy (sous-ensemble RÉEL de la table `cloud_proxies`, aligné sur
//    electron-app/src/lib/proxyStore.ts). Lecture seule pour cette passe. ────────
interface ProxyRow {
  id: string
  label: string | null
  group_name: string | null
  type: 'socks5' | 'http'
  host: string
  port: number
  username: string | null
  created_at: string
}

function proxyEndpoint(p: ProxyRow): string {
  return `${p.host}:${p.port}${p.username ? ` · ${p.username}` : ''}`
}
function proxyName(p: ProxyRow): string {
  return p.label?.trim() || `${p.host}:${p.port}`
}

const COLS = '24px 120px minmax(120px,1.3fr) 116px 96px 120px 96px'

export default function Proxies({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg } = org
  const [rows, setRows] = useState<ProxyRow[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pool, setPool] = useState<string>('Tous')
  const [sel, setSel] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [pxRes, gRes] = await Promise.all([
      scope(supabase.from('cloud_proxies').select('id,label,group_name,type,host,port,username,created_at'))
        .order('group_name', { ascending: true }).order('created_at', { ascending: true }),
      scope(supabase.from('proxy_groups').select('name')).order('created_at', { ascending: true }),
    ])
    if (pxRes.error) { setError('Impossible de charger tes proxies.'); setLoading(false); return }
    const data = (pxRes.data ?? []) as ProxyRow[]
    setRows(data)
    // Groupes : lignes dédiées + groupes présents sur des proxies (rétrocompat).
    const names = new Set<string>(((gRes.data ?? []) as { name: string }[]).map(g => g.name))
    data.forEach(r => { if (r.group_name) names.add(r.group_name) })
    setGroups([...names])
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSel(new Set()) }, [pool])

  const pools = useMemo(() => {
    const list: { g: string; n: number }[] = [{ g: 'Tous', n: rows.length }]
    for (const g of groups) list.push({ g, n: rows.filter(r => (r.group_name ?? '') === g).length })
    return list
  }, [rows, groups])

  const filtered = useMemo(
    () => pool === 'Tous' ? rows : rows.filter(r => (r.group_name ?? '') === pool),
    [rows, pool],
  )

  const nSocks = rows.filter(r => r.type === 'socks5').length
  const nHttp = rows.filter(r => r.type === 'http').length

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = filtered.length > 0 && filtered.every(r => sel.has(r.id))
  const toggleAll = () => setSel(allSel ? new Set() : new Set(filtered.map(r => r.id)))

  const Checkbox = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button onClick={onClick} aria-label={label} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      width: 15, height: 15, borderRadius: 4, cursor: 'pointer',
      background: on ? '#7C3AED' : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)',
      color: '#fff', fontSize: 9, fontWeight: 900,
    }}>{on ? '✓' : ''}</button>
  )

  const th: CSSProperties = {
    display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center',
    padding: '9px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#52525B',
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Proxies"
        sub="SOCKS5 recommandé. Crée des groupes, teste les IP — l'assignation se fait ensuite depuis les réglages de l'appareil."
        actions={<>
          <Btn theme={theme} icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8" label="Vérifier" />
          <Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Ajouter" />
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi theme={theme} label="Total" value={rows.length} />
        <Kpi theme={theme} label="Groupes" value={groups.length} />
        <Kpi theme={theme} label="SOCKS5" value={nSocks} color="#34D399" />
        <Kpi theme={theme} label="HTTP" value={nHttp} />
      </div>

      {loading ? (
        <Panel theme={theme}><div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div></Panel>
      ) : error ? (
        <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" title="Erreur" text={error} /></Panel>
      ) : rows.length === 0 ? (
        <Panel theme={theme}>
          <Empty icon="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"
            title="Aucun proxy" text="Ajoute tes proxies (SOCKS5 de préférence) pour attribuer une IP dédiée à chaque appareil cloud."
            action={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Ajouter des proxies" />} />
        </Panel>
      ) : (
        <Panel theme={theme} style={{ overflow: 'visible' }}>
          <PanelHead
            title="Proxies"
            sub={sel.size ? `${sel.size} sur ${rows.length} sélectionnés` : 'Coche des lignes pour tester en lot'}
            right={<>
              <Btn theme={theme} sm tone="primary" disabled={!sel.size} icon="M2 12h4l3 8 4-16 3 8h6"
                label={sel.size ? `Tester la sélection · ${sel.size}` : 'Tester la sélection'} />
              <Btn theme={theme} sm tone="quiet" icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8" label="Tout tester" />
            </>}
          />

          {/* Pools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 13px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#52525B', marginRight: 3 }}>Pools</span>
            {pools.map(o => {
              const on = pool === o.g
              return (
                <button key={o.g} onClick={() => setPool(o.g)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 99, cursor: 'pointer',
                  background: on ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.02)',
                  border: '1px solid ' + (on ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'),
                  color: on ? '#C4B5FD' : '#A1A1AA', fontSize: 11.5, fontWeight: 700, transition: 'all .14s ease',
                }}>
                  <span>{o.g}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: on ? 'rgba(255,255,255,0.5)' : '#3F3F46' }}>{o.n}</span>
                </button>
              )
            })}
          </div>

          {/* header */}
          <div style={th}>
            <span><Checkbox on={allSel} onClick={toggleAll} label="Tout sélectionner" /></span>
            {['Groupe', 'Proxy', 'Statut', 'IP sortante', 'Assigné à', 'Test'].map((h, i) => <span key={i} style={i === 5 ? { textAlign: 'right' } : undefined}>{h}</span>)}
          </div>

          {/* rows */}
          <div>
            {filtered.map((r, i) => {
              const on = sel.has(r.id)
              return (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '10px 15px', fontSize: 12,
                  background: on ? 'rgba(139,92,246,0.05)' : 'transparent',
                  borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none', transition: 'background .14s ease',
                }}>
                  <span><Checkbox on={on} onClick={() => toggle(r.id)} label="Sélectionner" /></span>
                  <span>{r.group_name ? <Chip text={r.group_name} tone="mute" /> : <span style={{ fontSize: 11, color: '#3F3F46' }}>—</span>}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: '#F4F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proxyName(r)}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#52525B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proxyEndpoint(r)}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: '#52525B' }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#71717A' }}>Non testé</span>
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#3F3F46' }}>—</span>
                  <span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      color: '#52525B', fontSize: 11, fontWeight: 700,
                    }}>libre</span>
                  </span>
                  <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 3 }}>
                    <Btn theme={theme} sm tone="quiet" label="Tester" />
                    <Btn theme={theme} sm tone="quiet" icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" label="Supprimer" />
                  </span>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '28px 15px', textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun proxy dans ce pool.</div>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
