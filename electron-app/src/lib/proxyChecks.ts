// Cache partagé des tests de proxy — source unique de vérité de l'« IP sortante »,
// keyé par proxyId. Lu/écrit par la page Proxies ET la page Cloud Phones ET
// AutomationLab → même IP, même timestamp partout, jamais deux tests pour rien.
// Persisté en localStorage ; notifie les composants ouverts (re-render live).
import { cloudPhones } from './cloudPhones'

export interface ProxyCheck {
  reachable: boolean
  ip?: string
  isp?: string
  country?: string
  countryCode?: string
  city?: string
  latencyMs?: number
  checkedAt: number       // Date.now()
  error?: string
}

const KEY = 'sf-proxy-checks'
const EVT = 'sf-proxy-checks-changed'

export function loadProxyChecks(): Record<string, ProxyCheck> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, ProxyCheck> } catch { return {} }
}
export function getProxyCheck(id?: string): ProxyCheck | undefined {
  if (!id) return undefined
  return loadProxyChecks()[id]
}
export function saveProxyCheck(id: string, c: ProxyCheck): void {
  const all = loadProxyChecks()
  all[id] = c
  localStorage.setItem(KEY, JSON.stringify(all))
  window.dispatchEvent(new CustomEvent(EVT))
}
// Périmé passé `ttlMs` (défaut 24 h) → l'UI grise l'IP.
export function isStale(c: ProxyCheck, ttlMs = 24 * 3600e3): boolean {
  return Date.now() - c.checkedAt > ttlMs
}
// Ré-render live quand un autre onglet/composant teste un proxy.
export function subscribeProxyChecks(cb: () => void): () => void {
  const onEvt = () => cb()
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb() }
  window.addEventListener(EVT, onEvt)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener(EVT, onEvt); window.removeEventListener('storage', onStorage) }
}

export interface ProxyLike { id: string; type: string; host: string; port: number; username?: string; password?: string }

// Teste un proxy au travers de l'agent, mesure la latence côté client, met en
// cache. UNIQUE point d'écriture → tout le monde lit le même résultat.
export async function runProxyCheck(p: ProxyLike): Promise<ProxyCheck> {
  const t0 = Date.now()
  const r = await cloudPhones.checkProxy({ type: p.type, host: p.host, port: p.port, username: p.username, password: p.password })
  const latencyMs = Date.now() - t0
  const d = r.data
  const check: ProxyCheck = (r.ok && d?.reachable)
    ? { reachable: true, ip: d.ip, isp: d.isp, country: d.country, countryCode: (d as { countryCode?: string }).countryCode, city: d.city, latencyMs, checkedAt: Date.now() }
    : { reachable: false, error: d?.error || r.error || 'KO', checkedAt: Date.now() }
  saveProxyCheck(p.id, check)
  return check
}

// Teste une liste avec une concurrence limitée (évite de saturer l'agent ADB).
export async function runProxyChecks(list: ProxyLike[], concurrency = 4): Promise<void> {
  let i = 0
  const worker = async () => { while (i < list.length) { const p = list[i++]; try { await runProxyCheck(p) } catch { /* ignore */ } } }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker))
}
