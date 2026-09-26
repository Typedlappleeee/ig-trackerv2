// Client HeroSMS (numéros virtuels, ex-SMS-Activate) pour la création de comptes IG.
// WEB → relais /api/herosms (token côté serveur). Electron → appel direct.
import { IS_WEB } from './platform'

const BASE = 'https://hero-sms.com/api/v1'

interface ProxyResp { ok: boolean; status?: number; data?: any; error?: string }

async function call(op: string, apiKey: string, extra: Record<string, unknown> = {}): Promise<ProxyResp> {
  if (IS_WEB) {
    const res = await fetch('/api/herosms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, apiKey, ...extra }),
    })
    return res.json() as Promise<ProxyResp>
  }
  // Electron : appel direct (l'automatisation tourne surtout côté web).
  const H = { Authorization: `ApiKey ${apiKey}`, Accept: 'application/json' }
  const enc = encodeURIComponent
  try {
    let r: Response
    if (op === 'buy') {
      const body: Record<string, unknown> = { amount: 1, service: extra.service || 'ig', country: Number(extra.country), verificationType: 'sms' }
      if (extra.operator) body.operator = extra.operator
      if (extra.maxPrice != null) { body.maxPrice = Number(extra.maxPrice); body.fixedPrice = Boolean(extra.fixedPrice) }
      r = await fetch(`${BASE}/activations`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else if (op === 'offers') {
      const p = new URLSearchParams(); if (extra.service) p.set('services', String(extra.service)); if (extra.country != null) p.set('countries', String(extra.country))
      r = await fetch(`${BASE}/activations/offers/sms?${p.toString()}`, { headers: H })
    } else if (op === 'otp') r = await fetch(`${BASE}/activations/${enc(String(extra.id))}/otp/last`, { headers: H })
    else if (op === 'active') r = await fetch(`${BASE}/activations`, { headers: H })
    else if (op === 'finish') r = await fetch(`${BASE}/activations/${enc(String(extra.id))}/finish`, { method: 'POST', headers: H })
    else if (op === 'cancel') r = await fetch(`${BASE}/activations/${enc(String(extra.id))}`, { method: 'DELETE', headers: H })
    else return { ok: false, error: `op inconnu: ${op}` }
    if (r.status === 204) return { ok: true, status: 204 }
    let data: unknown = null
    try { data = await r.json() } catch { data = null }
    return { ok: r.ok, status: r.status, data }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

function errText(r: ProxyResp): string {
  if (r.error) return r.error
  const d = r.data
  if (d && typeof d === 'object') return (d.message || d.error || JSON.stringify(d)).toString().slice(0, 160)
  return typeof d === 'string' ? d : `HTTP ${r.status ?? '?'}`
}

// Prix disponible le PLUS ÉLEVÉ dans [min, max] pour service+pays (à partir des offres).
// Renvoie null si la tranche est vide. Robuste au nesting variable de la réponse.
export async function herosmsBestPriceInRange(
  apiKey: string, service: string, country: number, min: number, max: number, onLog?: (m: string) => void,
): Promise<number | null> {
  const r = await call('offers', apiKey, { service, country })
  if (!r.ok) { onLog?.(`   ⚠ offers: ${errText(r)}`); return null }
  const root = (r.data?.data ?? r.data) as any
  // svc = objet { <countryId>: { map: {...} } } pour le service demandé.
  let svc = root?.[service]
  if (!svc && root && typeof root === 'object') {
    // parfois la racine est { <service>: {...} } déjà, ou { data: { <service>: … } }
    svc = root?.data?.[service] ?? undefined
  }
  if (!svc) { onLog?.(`   ⚠ offers: service « ${service} » absent (clés: ${root ? Object.keys(root).join(',').slice(0, 80) : '∅'})`); return null }
  const entry = svc[String(country)] ?? svc[country as unknown as string]
  if (!entry) { onLog?.(`   ⚠ offers: pays ${country} absent (pays dispo: ${Object.keys(svc).join(',').slice(0, 80)})`); return null }
  const map = entry.map as Record<string, number> | undefined
  if (!map) { onLog?.('   ⚠ offers: pas de « map » de prix'); return null }
  const prices = Object.entries(map)
    .map(([p, count]) => ({ price: Number(p), count: Number(count) }))
    .filter(x => x.count > 0 && x.price >= min && x.price <= max)
    .sort((a, b) => b.price - a.price) // plus cher d'abord
  return prices.length ? prices[0].price : null
}

// Achat d'une activation. HeroSMS renvoie { data: [{ id, phone, ... }] }. Le numéro est
// au format international sans « + » (ex. « 447367782101 »).
// Si priceMin/priceMax fournis : on choisit le prix le PLUS ÉLEVÉ dispo dans la tranche
// et on achète pile à ce prix (fixedPrice).
export async function herosmsBuy(
  apiKey: string,
  opts: { country: number; service?: string; operator?: string; maxPrice?: number; priceMin?: number; priceMax?: number; onLog?: (m: string) => void },
): Promise<{ id: number; phone: string; price?: number }> {
  const service = opts.service ?? 'ig'
  let maxPrice = opts.maxPrice
  let fixedPrice = false
  if (opts.priceMin != null && opts.priceMax != null) {
    const best = await herosmsBestPriceInRange(apiKey, service, opts.country, opts.priceMin, opts.priceMax, opts.onLog)
    if (best != null) {
      maxPrice = best; fixedPrice = true
      opts.onLog?.(`   💲 prix choisi (le + cher de la tranche) : ${best.toFixed(4)}$`)
    } else {
      // Repli : on n'a pas pu lire les offres → on achète quand même sous le prix max
      // (le moins cher dispo ≤ priceMax), pour ne pas bloquer la création.
      maxPrice = opts.priceMax; fixedPrice = false
      opts.onLog?.(`   ⚠ tranche non lisible → achat ≤ ${opts.priceMax}$ (repli)`)
    }
  }
  const r = await call('buy', apiKey, { country: opts.country, service, operator: opts.operator, maxPrice, fixedPrice })
  const item = Array.isArray(r.data?.data) ? r.data.data[0] : (Array.isArray(r.data) ? r.data[0] : null)
  if (!r.ok || !item || !item.id || !item.phone) throw new Error(errText(r))
  return { id: Number(item.id), phone: String(item.phone), price: item.price != null ? Number(item.price) : undefined }
}

// Extrait un code numérique (4–8 chiffres) d'un objet OTP HeroSMS (forme variable).
function codeFromOtp(otp: any): string | null {
  if (!otp) return null
  if (typeof otp === 'string') { const m = otp.match(/\b(\d{4,8})\b/); return m ? m[1] : null }
  if (typeof otp.code === 'string' && /\d{4,8}/.test(otp.code)) return (otp.code.match(/\d{4,8}/) || [])[0] ?? otp.code
  const text = otp.text || otp.sms || otp.moreCodes || otp.message || ''
  const m = String(text).match(/\b(\d{4,8})\b/)
  return m ? m[1] : null
}

// Interroge le dernier OTP. Renvoie le code ou null (pas encore reçu).
export async function herosmsCheckCode(apiKey: string, id: number): Promise<string | null> {
  const r = await call('otp', apiKey, { id })
  if (r.ok && r.data) {
    const d = (r.data.data ?? r.data)
    const arr = Array.isArray(d) ? d : [d]
    for (const o of arr) { const c = codeFromOtp(o); if (c) return c }
  }
  // Repli : liste des activations actives → otpList de la nôtre.
  const a = await call('active', apiKey)
  const list = Array.isArray(a.data?.data) ? a.data.data : []
  const mine = list.find((x: any) => Number(x.id) === Number(id))
  if (mine && Array.isArray(mine.otpList)) { for (const o of mine.otpList) { const c = codeFromOtp(o); if (c) return c } }
  return null
}

export async function herosmsFinish(apiKey: string, id: number): Promise<void> { await call('finish', apiKey, { id }) }
export async function herosmsCancel(apiKey: string, id: number): Promise<void> { await call('cancel', apiKey, { id }) }

// Attend le code SMS (poll ~5 s, jusqu'à maxMs). Renvoie le code ou null (timeout).
export async function herosmsWaitCode(
  apiKey: string, id: number,
  opts?: { maxMs?: number; onLog?: (m: string) => void; shouldStop?: () => boolean },
): Promise<string | null> {
  const deadline = Date.now() + (opts?.maxMs ?? 6 * 60_000)
  let n = 0
  while (Date.now() < deadline) {
    if (opts?.shouldStop?.()) return null
    await new Promise(r => setTimeout(r, 5000))
    n++
    try {
      const code = await herosmsCheckCode(apiKey, id)
      if (code) { opts?.onLog?.(`   ✉️ code reçu : ${code}`); return code }
      if (n % 3 === 0) opts?.onLog?.(`   ⏳ attente du SMS… (${Math.round((deadline - Date.now()) / 1000)}s restantes)`)
    } catch (e) { opts?.onLog?.(`   ⚠ check: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return null
}
