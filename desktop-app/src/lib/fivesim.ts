// Client 5sim (numéros virtuels) pour la création de comptes Instagram.
// WEB → relais /api/fivesim (token côté serveur, pas de CORS). Electron → appel direct.
import { IS_WEB } from './platform'

const BASE = 'https://5sim.net/v1'

export interface FivesimSms { sender: string; text: string; code: string }
export interface FivesimOrder { id: number; phone: string; status: string; sms: FivesimSms[] }

interface ProxyResp { ok: boolean; status?: number; data?: any; error?: string }

async function call(op: string, apiKey: string, extra: Record<string, string> = {}): Promise<ProxyResp> {
  if (IS_WEB) {
    const res = await fetch('/api/fivesim', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, apiKey, ...extra }),
    })
    return res.json() as Promise<ProxyResp>
  }
  // Electron : appel direct (l'automatisation tourne surtout côté web).
  const enc = encodeURIComponent
  let url = ''
  if (op === 'balance') url = `${BASE}/user/profile`
  else if (op === 'buy') url = `${BASE}/user/buy/activation/${enc(extra.country || 'england')}/${enc(extra.operator || 'any')}/${enc(extra.product || 'instagram')}`
  else if (op === 'check') url = `${BASE}/user/check/${enc(extra.id)}`
  else if (op === 'finish') url = `${BASE}/user/finish/${enc(extra.id)}`
  else if (op === 'cancel') url = `${BASE}/user/cancel/${enc(extra.id)}`
  else return { ok: false, error: `op inconnu: ${op}` }
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } })
    const text = await r.text()
    let data: unknown = null
    try { data = JSON.parse(text) } catch { data = text }
    return { ok: r.ok, status: r.status, data }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

// Numéro « local » à saisir sur IG quand le pays (+44) est déjà sélectionné :
// « +447350690992 » → « 7350690992 » (on retire l'indicatif 44).
export function localPhone(phone: string, countryDigits = '44'): string {
  const digits = String(phone).replace(/[^\d]/g, '')
  return digits.startsWith(countryDigits) ? digits.slice(countryDigits.length) : digits
}

// Solde/compte 5sim (pour vérifier la clé). Renvoie le solde ou lève une erreur.
export async function fivesimBalance(apiKey: string): Promise<number> {
  const r = await call('balance', apiKey)
  if (!r.ok || typeof r.data !== 'object') throw new Error(typeof r.data === 'string' ? r.data : (r.error || 'clé 5sim invalide'))
  return Number((r.data as { balance?: number }).balance ?? 0)
}

// Achète un numéro d'activation (défaut : Instagram, Angleterre, n'importe quel opérateur).
export async function fivesimBuy(
  apiKey: string, opts?: { country?: string; operator?: string; product?: string },
): Promise<{ id: number; phone: string }> {
  const r = await call('buy', apiKey, { country: opts?.country || 'england', operator: opts?.operator || 'any', product: opts?.product || 'instagram' })
  if (!r.ok || typeof r.data !== 'object' || !r.data) {
    throw new Error(typeof r.data === 'string' ? r.data : (r.error || 'achat 5sim échoué'))
  }
  const d = r.data as { id?: number; phone?: string }
  if (!d.id || !d.phone) throw new Error('réponse 5sim sans id/numéro (' + JSON.stringify(r.data).slice(0, 120) + ')')
  return { id: d.id, phone: d.phone }
}

function parseOrder(data: unknown): FivesimOrder | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { id?: number; phone?: string; status?: string; sms?: unknown }
  const sms = Array.isArray(d.sms) ? (d.sms as FivesimSms[]) : []
  return { id: Number(d.id ?? 0), phone: String(d.phone ?? ''), status: String(d.status ?? ''), sms }
}

// Interroge une commande (statut + SMS reçus).
export async function fivesimCheck(apiKey: string, id: number): Promise<FivesimOrder> {
  const r = await call('check', apiKey, { id: String(id) })
  const o = parseOrder(r.data)
  if (!o) throw new Error(typeof r.data === 'string' ? r.data : (r.error || 'check 5sim échoué'))
  return o
}

export async function fivesimFinish(apiKey: string, id: number): Promise<void> { await call('finish', apiKey, { id: String(id) }) }
export async function fivesimCancel(apiKey: string, id: number): Promise<void> { await call('cancel', apiKey, { id: String(id) }) }

// Attend le code SMS (poll toutes les ~5 s, jusqu'à maxMs). Renvoie le code ou null (timeout).
export async function fivesimWaitCode(
  apiKey: string, id: number,
  opts?: { maxMs?: number; onLog?: (m: string) => void; shouldStop?: () => boolean },
): Promise<string | null> {
  const maxMs = opts?.maxMs ?? 8 * 60_000
  const deadline = Date.now() + maxMs
  let n = 0
  while (Date.now() < deadline) {
    if (opts?.shouldStop?.()) return null
    await new Promise(r => setTimeout(r, 5000))
    n++
    try {
      const o = await fivesimCheck(apiKey, id)
      const code = o.sms.find(s => s.code)?.code
      if (code) { opts?.onLog?.(`   ✉️ code reçu : ${code}`); return code }
      if (/CANCELED|TIMEOUT|BANNED/i.test(o.status)) { opts?.onLog?.(`   ⚠ commande ${o.status}`); return null }
      if (n % 3 === 0) opts?.onLog?.(`   ⏳ attente du SMS… (${Math.round((deadline - Date.now()) / 1000)}s restantes)`)
    } catch (e) { opts?.onLog?.(`   ⚠ check: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return null
}
