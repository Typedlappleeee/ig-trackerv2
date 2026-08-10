// Gestion des proxies des cloud phones (Supabase). SOCKS5 par défaut. Import en
// masse (une ligne par proxy), groupes, assignation aux tels (via CpMeta.proxyId).
import { supabase } from './supabase'

export type ProxyType = 'socks5' | 'http'
export interface Proxy {
  id: string
  label?: string
  group?: string
  type: ProxyType
  host: string
  port: number
  username?: string
  password?: string
  mine?: boolean
}

export function newProxyId(): string {
  const hex = Array.from({ length: 10 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
  return `px-${hex}`
}

// Affichage court d'un proxy (sans le mot de passe).
export function proxyLabel(p: Proxy): string {
  return p.label?.trim() || `${p.host}:${p.port}${p.username ? ` (${p.username})` : ''}`
}

// Parse une ligne d'import. Formats acceptés :
//   host:port
//   host:port:user:pass
//   user:pass@host:port
//   socks5://user:pass@host:port
export function parseProxyLine(line: string, defaultType: ProxyType): Omit<Proxy, 'id'> | null {
  let s = line.trim()
  if (!s) return null
  let type: ProxyType = defaultType
  const scheme = /^(socks5|http|https):\/\//i.exec(s)
  if (scheme) { type = /socks/i.test(scheme[1]) ? 'socks5' : 'http'; s = s.slice(scheme[0].length) }
  let user: string | undefined, pass: string | undefined, host = '', port = 0
  if (s.includes('@')) {
    const [cred, hp] = s.split('@')
    ;[user, pass] = cred.split(':')
    const [h, p] = hp.split(':')
    host = h; port = Number(p)
  } else {
    const parts = s.split(':')
    host = parts[0]; port = Number(parts[1])
    if (parts.length >= 4) { user = parts[2]; pass = parts[3] }
  }
  if (!host || !port || Number.isNaN(port)) return null
  return { type, host, port, username: user, password: pass }
}

interface Row { id: string; user_id: string; label: string | null; group_name: string | null; type: ProxyType; host: string; port: number; username: string | null; password: string | null }
function rowToProxy(r: Row, uid: string): Proxy {
  return { id: r.id, label: r.label ?? undefined, group: r.group_name ?? undefined, type: r.type, host: r.host, port: r.port, username: r.username ?? undefined, password: r.password ?? undefined, mine: r.user_id === uid }
}

export async function listProxies(uid: string): Promise<Proxy[]> {
  const { data } = await supabase.from('cloud_proxies').select('*').order('group_name', { ascending: true }).order('created_at', { ascending: true })
  return (data as Row[] | null ?? []).map(r => rowToProxy(r, uid))
}

export async function addProxies(items: Omit<Proxy, 'id' | 'mine'>[], opts: { userId: string; orgId: string | null; group?: string }): Promise<{ ok: boolean; count: number; error?: string }> {
  if (items.length === 0) return { ok: false, count: 0, error: 'aucun proxy valide' }
  const rows = items.map(p => ({
    id: newProxyId(), user_id: opts.userId, org_id: opts.orgId,
    label: p.label ?? null, group_name: (opts.group?.trim() || p.group) ?? null,
    type: p.type, host: p.host, port: p.port, username: p.username ?? null, password: p.password ?? null,
  }))
  const { error } = await supabase.from('cloud_proxies').insert(rows)
  return error ? { ok: false, count: 0, error: error.message } : { ok: true, count: rows.length }
}

export async function deleteProxy(id: string): Promise<void> {
  await supabase.from('cloud_proxies').delete().eq('id', id)
}
export async function deleteGroup(group: string, uid: string): Promise<void> {
  await supabase.from('cloud_proxies').delete().eq('user_id', uid).eq('group_name', group)
}
