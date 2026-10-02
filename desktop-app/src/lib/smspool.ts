// Client SMSPool (numéros virtuels) pour la création de comptes Instagram.
// WEB → relais /api/smspool (clé côté serveur, pas de CORS). Electron → appel direct.
// API : https://api.smspool.net (POST form, param `key`). order_id = chaîne (pas un entier).
import { IS_WEB } from './platform'

const BASE = 'https://api.smspool.net'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface Resp { ok: boolean; status?: number; data?: any; error?: string }

async function call(op: string, apiKey: string, extra: Record<string, string | number> = {}): Promise<Resp> {
  if (IS_WEB) {
    const res = await fetch('/api/smspool', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, apiKey, ...extra }),
    })
    return res.json() as Promise<Resp>
  }
  // Electron : appel direct (l'automatisation tourne surtout côté web).
  const form = new URLSearchParams(); form.set('key', apiKey)
  for (const [k, v] of Object.entries(extra)) form.set(k, String(v))
  let url = '', method: 'GET' | 'POST' = 'POST'
  if (op === 'balance') { url = `${BASE}/request/balance`; method = 'GET' }
  else if (op === 'buy') url = `${BASE}/purchase/sms`
  else if (op === 'check') url = `${BASE}/sms/check`
  else if (op === 'cancel') url = `${BASE}/sms/cancel`
  else if (op === 'resend') url = `${BASE}/sms/resend`
  else if (op === 'price') url = `${BASE}/request/price`
  else if (op === 'countries') { url = `${BASE}/country/retrieve_all`; method = 'GET' }
  else if (op === 'services') { url = `${BASE}/service/retrieve_all`; method = 'GET' }
  else return { ok: false, error: `op inconnu: ${op}` }
  try {
    const r = await fetch(method === 'GET' ? `${url}?key=${encodeURIComponent(apiKey)}` : url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } : { Accept: 'application/json' },
      body: method === 'POST' ? form.toString() : undefined,
    })
    const text = await r.text()
    let data: unknown = null; try { data = JSON.parse(text) } catch { data = text }
    return { ok: r.ok, status: r.status, data }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

// Résolution dynamique des IDs (service « Instagram », pays par nom/ISO) — on ne code JAMAIS
// d'ID en dur (ils peuvent changer). Cache mémoire par session.
const svcCache: Record<string, number> = {}
const cnCache: Record<string, number> = {}

function asArray(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (data && typeof data === 'object') return Object.values(data)
  return []
}

async function resolveServiceId(apiKey: string, name = 'Instagram'): Promise<number | null> {
  const k = name.toLowerCase()
  if (svcCache[k]) return svcCache[k]
  const r = await call('services', apiKey)
  for (const s of asArray(r.data)) {
    const nm = (s?.name ?? '').toString(); const id = Number(s?.ID ?? s?.id)
    if (nm && Number.isFinite(id) && id > 0) svcCache[nm.toLowerCase()] = id
  }
  return svcCache[k] ?? null
}

async function resolveCountryId(apiKey: string, name: string): Promise<number | null> {
  const k = name.toLowerCase()
  if (cnCache[k]) return cnCache[k]
  const r = await call('countries', apiKey)
  for (const c of asArray(r.data)) {
    const nm = (c?.name ?? '').toString(); const sn = (c?.short_name ?? '').toString(); const id = Number(c?.ID ?? c?.id)
    if (Number.isFinite(id) && id > 0) { if (nm) cnCache[nm.toLowerCase()] = id; if (sn) cnCache[sn.toLowerCase()] = id }
  }
  return cnCache[k] ?? null
}

// Vérifie la clé via le solde.
export async function smspoolPing(apiKey: string): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const r = await call('balance', apiKey)
  const d: any = r.data
  if (r.ok && d && d.balance != null) return { ok: true, balance: Number(d.balance) }
  return { ok: false, error: typeof d === 'string' ? d : (d?.message || r.error || 'clé SMSPool invalide') }
}

// Prix actuel pour un pays (nom) + service (défaut Instagram). null si indisponible.
export async function smspoolPrice(apiKey: string, country: string, service = 'Instagram'): Promise<number | null> {
  const svc = await resolveServiceId(apiKey, service); const cn = await resolveCountryId(apiKey, country)
  if (!svc || !cn) return null
  const r = await call('price', apiKey, { country: cn, service: svc })
  const d: any = r.data
  const p = d?.price ?? d?.data?.price
  return p != null ? Number(p) : null
}

// Achète un numéro. `country` = NOM (ex. « United States »). `maxPrice` = plafond optionnel.
export async function smspoolBuy(
  apiKey: string, opts: { country: string; service?: string; maxPrice?: number; onLog?: (m: string) => void },
): Promise<{ id: string; phone: string; price?: number }> {
  const svc = await resolveServiceId(apiKey, opts.service ?? 'Instagram')
  const cn = await resolveCountryId(apiKey, opts.country)
  if (!svc) throw new Error('service « Instagram » introuvable (SMSPool)')
  if (!cn) throw new Error(`pays « ${opts.country} » introuvable (SMSPool)`)
  const extra: Record<string, string | number> = { country: cn, service: svc, quantity: 1 }
  if (opts.maxPrice != null) extra.max_price = opts.maxPrice
  const r = await call('buy', apiKey, extra)
  const d: any = r.data
  if (!d || typeof d !== 'object') throw new Error(typeof d === 'string' ? d : (r.error || 'achat SMSPool échoué'))
  if (d.success === 0 || d.success === '0') throw new Error(d.message || 'achat SMSPool refusé')
  const phone = String(d.phonenumber ?? d.number ?? '').replace(/^\+/, '')
  const order = String(d.order_id ?? d.orderid ?? '')
  if (!phone || !order) throw new Error('réponse SMSPool sans numéro/order_id (' + JSON.stringify(d).slice(0, 140) + ')')
  opts.onLog?.(`   💲 SMSPool : ${d.cost != null ? d.cost + '$ · ' : ''}order ${order}`)
  return { id: order, phone, price: d.cost != null ? Number(d.cost) : undefined }
}

// Interroge la commande : code dans `sms` quand reçu ; status 6 = remboursé/annulé.
export async function smspoolCheck(apiKey: string, orderid: string): Promise<{ code: string | null; failed: boolean }> {
  const r = await call('check', apiKey, { orderid })
  const d: any = r.data
  if (!d || typeof d !== 'object') return { code: null, failed: false }
  const code = (d.sms ?? '').toString().trim() || null
  const st = Number(d.status)
  return { code, failed: st === 6 }
}

export async function smspoolCancel(apiKey: string, orderid: string): Promise<void> { await call('cancel', apiKey, { orderid }) }
// SMSPool n'a pas d'action « finish » (la réception du code clôt l'achat) → no-op.
export async function smspoolFinish(_apiKey: string, _orderid: string): Promise<void> { /* no-op */ }

// Attend le code SMS (poll ~5 s jusqu'à maxMs). Renvoie le code ou null (timeout/annulé).
export async function smspoolWaitCode(
  apiKey: string, orderid: string,
  opts?: { maxMs?: number; onLog?: (m: string) => void; shouldStop?: () => boolean },
): Promise<string | null> {
  const maxMs = opts?.maxMs ?? 8 * 60_000
  const deadline = Date.now() + maxMs
  let n = 0
  while (Date.now() < deadline) {
    if (opts?.shouldStop?.()) return null
    await sleep(5000); n++
    try {
      const c = await smspoolCheck(apiKey, orderid)
      if (c.code) { opts?.onLog?.(`   ✉️ code reçu : ${c.code}`); return c.code }
      if (c.failed) { opts?.onLog?.('   ⚠ commande remboursée/annulée'); return null }
      if (n % 3 === 0) opts?.onLog?.(`   ⏳ attente du SMS… (${Math.round((deadline - Date.now()) / 1000)}s restantes)`)
    } catch (e) { opts?.onLog?.(`   ⚠ check: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return null
}
