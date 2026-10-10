import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Panel, PanelHead, PageHead, Kpi, Empty, Modal, FIELD, TEXTAREA, MONO, Segmented, SkeletonRows, toast } from '@/lib/ui'
import type { OrgState } from '@/lib/data'

// Parse une ligne d'import de proxy (porté de electron-app/src/lib/proxyStore.ts).
function parseProxyLine(line: string, defType: 'socks5' | 'http'): { type: 'socks5' | 'http'; host: string; port: number; username?: string; password?: string } | null {
  let s = line.trim(); if (!s) return null
  let type = defType
  const scheme = /^(socks5|http|https):\/\//i.exec(s)
  if (scheme) { type = /socks/i.test(scheme[1]) ? 'socks5' : 'http'; s = s.slice(scheme[0].length) }
  let user: string | undefined, pass: string | undefined, host = '', port = 0
  if (s.includes('@')) {
    const [cred, hp] = s.split('@');[user, pass] = cred.split(':')
    const [h, p] = hp.split(':'); host = h; port = Number(p)
  } else {
    const parts = s.split(':'); host = parts[0]; port = Number(parts[1])
    if (parts.length >= 4) { user = parts[2]; pass = parts[3] }
  }
  if (!host || !port || Number.isNaN(port)) return null
  return { type, host, port, username: user, password: pass }
}
function newProxyId(): string {
  return 'px-' + Array.from({ length: 10 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
}

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
  const [addOpen, setAddOpen] = useState(false)
  const [addText, setAddText] = useState('')
  const [addType, setAddType] = useState<'socks5' | 'http'>('socks5')
  const [addGroup, setAddGroup] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Le test réel d'un SOCKS5/HTTP ne peut pas se faire depuis le navigateur (pas de
  // routage per-requête). Il s'effectue côté serveur au moment de la rotation d'IP,
  // avant chaque boot de téléphone. On l'explique honnêtement plutôt que simuler.
  function testInfo() {
    setNotice("Le test de connectivité d'un proxy s'effectue automatiquement côté serveur au moment de l'assignation (rotation d'IP avant chaque boot). Assure-toi juste du format host:port — SOCKS5 recommandé.")
  }

  async function doDelete(id: string) {
    await supabase.from('cloud_proxies').delete().eq('id', id)
    setRows(r => r.filter(x => x.id !== id))
  }
  async function doAdd() {
    const parsed = addText.split('\n').map(l => parseProxyLine(l, addType)).filter(Boolean) as ReturnType<typeof parseProxyLine>[]
    if (parsed.length === 0) { toast('Aucun proxy valide (format host:port ou user:pass@host:port).', 'bad'); return }
    setAdding(true)
    const rowsToInsert = parsed.map(p => ({
      id: newProxyId(), user_id: user.id, org_id: currentOrg?.id ?? null,
      label: null, group_name: addGroup.trim() || null, type: p!.type, host: p!.host, port: p!.port,
      username: p!.username ?? null, password: p!.password ?? null,
    }))
    const { error: err } = await supabase.from('cloud_proxies').insert(rowsToInsert)
    setAdding(false)
    if (err) { toast(`Échec de l'ajout : ${err.message}`, 'bad'); return }
    setAddOpen(false); setAddText(''); setAddGroup(''); toast(`${rowsToInsert.length} proxy(s) ajouté(s).`, 'ok')
    load()
  }

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
    <button type="button" onClick={onClick} aria-label={label} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      width: 14, height: 14, boxSizing: 'border-box', borderRadius: 4, cursor: 'pointer',
      background: on ? theme.accent : 'transparent', border: on ? `1px solid ${theme.accent}` : '1px solid rgba(255,255,255,0.2)',
      color: '#fff', fontSize: 9, fontWeight: 600, lineHeight: 1,
    }}>{on ? '✓' : ''}</button>
  )

  const th: CSSProperties = {
    display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center',
    height: 36, boxSizing: 'border-box', padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#71717A',
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Proxies"
        sub="SOCKS5 recommandé. Crée des groupes, teste les IP — l'assignation se fait ensuite depuis les réglages de l'appareil."
        actions={<>
          <Btn theme={theme} icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8" label="Vérifier" onClick={testInfo} />
          <Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Ajouter" onClick={() => setAddOpen(true)} />
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        <Kpi theme={theme} label="Total" value={rows.length} />
        <Kpi theme={theme} label="Groupes" value={groups.length} />
        <Kpi theme={theme} label="SOCKS5" value={nSocks} />
        <Kpi theme={theme} label="HTTP" value={nHttp} />
      </div>

      {loading ? (
        <Panel theme={theme}><SkeletonRows rows={4} /></Panel>
      ) : error ? (
        <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" title="Erreur" text={error} /></Panel>
      ) : rows.length === 0 ? (
        <Panel theme={theme}>
          <Empty icon="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"
            title="Aucun proxy" text="Ajoute tes proxies (SOCKS5 de préférence) pour attribuer une IP dédiée à chaque appareil cloud."
            action={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Ajouter des proxies" onClick={() => setAddOpen(true)} />} />
        </Panel>
      ) : (
        <Panel theme={theme} style={{ overflow: 'visible' }}>
          <PanelHead
            title="Proxies"
            sub={sel.size ? `${sel.size} sur ${rows.length} sélectionnés` : 'Coche des lignes pour tester en lot'}
            right={<>
              <Btn theme={theme} sm tone="primary" disabled={!sel.size} icon="M2 12h4l3 8 4-16 3 8h6"
                label={sel.size ? `Tester la sélection · ${sel.size}` : 'Tester la sélection'} onClick={testInfo} />
              <Btn theme={theme} sm tone="quiet" icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8" label="Tout tester" onClick={testInfo} />
            </>}
          />

          {/* Pools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94', marginRight: 4 }}>Pools</span>
            <Segmented value={pool} onChange={setPool} options={pools.map(o => ({ v: o.g, l: <span>{o.g}</span>, n: o.n }))} />
          </div>

          <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
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
                  display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', minHeight: 48, boxSizing: 'border-box', padding: '6px 16px', fontSize: 13,
                  background: on ? 'rgba(255,255,255,0.03)' : 'transparent',
                  borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', transition: 'background .12s ease',
                }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                  <span><Checkbox on={on} onClick={() => toggle(r.id)} label="Sélectionner" /></span>
                  <span>{r.group_name ? <Chip text={r.group_name} tone="mute" /> : <span style={{ fontSize: 12, color: '#5A5A63' }}>—</span>}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proxyName(r)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proxyEndpoint(r)}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: '#5A5A63' }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Non testé</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: '#5A5A63' }}>—</span>
                  <span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', height: 20, boxSizing: 'border-box', padding: '0 7px', borderRadius: 5,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#8B8B94', fontSize: 11, fontWeight: 500,
                    }}>libre</span>
                  </span>
                  <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <Btn theme={theme} sm tone="quiet" label="Tester" onClick={testInfo} />
                    <Btn theme={theme} sm tone="quiet" icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" label="Supprimer" onClick={() => doDelete(r.id)} />
                  </span>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: '#8B8B94', fontSize: 13 }}>Aucun proxy dans ce pool.</div>
            )}
          </div>
          </div>
          </div>
        </Panel>
      )}

      {notice && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', fontSize: 13, lineHeight: 1.55, color: '#A1A1AA' }}>{notice}</div>
      )}

      {addOpen && (
        <Modal theme={theme} title="Ajouter des proxies" sub="Un proxy par ligne. SOCKS5 recommandé." icon="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"
          onClose={() => setAddOpen(false)}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setAddOpen(false)} />
            <Btn theme={theme} tone="primary" label={adding ? 'Ajout…' : 'Ajouter'} disabled={adding} onClick={doAdd} />
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Type par défaut</span>
              <Segmented<'socks5' | 'http'> sm value={addType} onChange={setAddType}
                options={(['socks5', 'http'] as const).map(t => ({ v: t, l: t.toUpperCase() }))} />
              <input value={addGroup} onChange={e => setAddGroup(e.target.value)} placeholder="Groupe (optionnel)"
                style={{ ...FIELD, width: 'auto', marginLeft: 'auto' }} />
            </div>
            <textarea value={addText} onChange={e => setAddText(e.target.value)} rows={8}
              placeholder={'host:port\nhost:port:user:pass\nuser:pass@host:port\nsocks5://user:pass@host:port'}
              style={{ ...TEXTAREA, fontSize: 12, fontFamily: MONO, lineHeight: 1.7 }} />
          </div>
        </Modal>
      )}
    </div>
  )
}
