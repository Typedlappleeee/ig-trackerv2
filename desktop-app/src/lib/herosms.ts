// Client HeroSMS — protocole COMPATIBLE SMS-Activate (auth ?api_key=, réponses texte).
// WEB → relais /api/herosms (token côté serveur). Electron → appel direct au handler.
import { IS_WEB } from './platform'

const CANDIDATE_BASES = [
  'https://hero-sms.com/stubs/handler_api.php',
  'https://hero-sms.com/api/v1',
  'https://hero-sms.com/handler_api.php',
]

interface Resp { ok: boolean; status?: number; text?: string; data?: any; base?: string; error?: string }

function actionFor(op: string, b: Record<string, unknown>): Record<string, string> | null {
  switch (op) {
    case 'ping':   return { action: 'getBalance' }
    case 'buy':    return { action: 'getNumberV2', service: String(b.service || 'ig'), country: String(b.country ?? ''), ...(b.maxPrice != null ? { maxPrice: String(b.maxPrice) } : {}), ...(b.operator ? { operator: String(b.operator) } : {}) }
    case 'status': return { action: 'getStatus', id: String(b.id ?? '') }
    case 'finish': return { action: 'setStatus', id: String(b.id ?? ''), status: '6' }
    case 'cancel': return { action: 'setStatus', id: String(b.id ?? ''), status: '8' }
    case 'prices': return { action: 'getPrices', service: String(b.service || 'ig'), country: String(b.country ?? '') }
    default: return null
  }
}

async function call(op: string, apiKey: string, extra: Record<string, unknown> = {}): Promise<Resp> {
  if (IS_WEB) {
    const res = await fetch('/api/herosms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, apiKey, ...extra }),
    })
    return res.json() as Promise<Resp>
  }
  // Electron : appel direct au handler SMS-Activate (essaie les URLs candidates).
  const params = actionFor(op, extra)
  if (!params) return { ok: false, error: `op inconnu: ${op}` }
  for (const base of CANDIDATE_BASES) {
    const qs = new URLSearchParams({ api_key: apiKey, ...params })
    let r: Response
    try { r = await fetch(`${base}?${qs.toString()}`) } catch { continue }
    const text = (await r.text()).trim()
    if (r.status === 404 || /<html|<!doctype|not found|no such|bad_action/i.test(text)) continue
    let data: unknown = null; try { data = JSON.parse(text) } catch { /* texte */ }
    const badKey = /BAD_KEY|WRONG_TOKEN|Unauthenticated/i.test(text)
    return { ok: r.status < 400 && !badKey, status: r.status, text, data, base }
  }
  return { ok: false, error: 'Aucun endpoint HeroSMS n’a répondu' }
}

// Testeur d'auth : essaie une matrice endpoint × méthode. Renvoie chaque résultat.
export async function herosmsProbe(apiKey: string): Promise<{ ok: boolean; results: { label: string; status: number; good: boolean; snippet: string }[] }> {
  const r = await fetch('/api/herosms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'probe', apiKey }),
  })
  const j = await r.json()
  return { ok: !!j.ok, results: Array.isArray(j.results) ? j.results : [] }
}

// Test de clé : getBalance → « ACCESS_BALANCE:xx ».
export async function herosmsPing(apiKey: string): Promise<{ ok: boolean; auth?: string; error?: string }> {
  const r = await call('ping', apiKey)
  const t = r.text ?? ''
  if (r.ok && /ACCESS_BALANCE/i.test(t)) return { ok: true, auth: `solde ${t.split(':')[1] ?? '?'}$ · ${r.base?.replace('https://hero-sms.com', '') ?? ''}` }
  return { ok: false, error: t || r.error || 'refusée' }
}

// Prix dispo dans [min,max] via l'API NATIVE (offres = paliers de prix). `pick` = 'high'
// (le plus cher, défaut) ou 'low' (le moins cher).
async function nativeBestPriceInRange(apiKey: string, service: string, country: number, min: number, max: number, pick: 'low' | 'high', onLog?: (m: string) => void): Promise<number | null> {
  const r = await call('native_offers', apiKey, { service, country })
  if (!r.ok) { onLog?.(`   ⚠ offres natives: ${r.error ?? ('HTTP ' + (r.status ?? '?'))}`); return null }
  const root = (r.data?.data ?? r.data) as any
  const map = root?.[service]?.[String(country)]?.map as Record<string, number> | undefined
  if (!map) { onLog?.(`   ⚠ offres natives sans « map » (pays ${country})`); return null }
  const prices = Object.entries(map).map(([p, c]) => ({ price: Number(p), count: Number(c) }))
    .filter(x => x.count > 0 && x.price >= min && x.price <= max)
    .sort((a, b) => pick === 'low' ? a.price - b.price : b.price - a.price)
  return prices.length ? prices[0].price : null
}

// Liste des paliers de prix disponibles (prix + nombre de numéros dispo), triés croissant.
// Pour l'UI « choisir le prix ». Web uniquement (native_offers via /api/herosms) ; côté desktop
// le protocole compat ne renvoie pas d'offres → liste vide (on retombe sur l'achat auto).
export async function herosmsOffers(apiKey: string, country: number, service = 'ig'): Promise<{ price: number; count: number }[]> {
  const r = await call('native_offers', apiKey, { service, country })
  if (!r.ok) return []
  const root = (r.data?.data ?? r.data) as any
  const map = root?.[service]?.[String(country)]?.map as Record<string, number> | undefined
  if (!map) return []
  return Object.entries(map)
    .map(([p, c]) => ({ price: Number(p), count: Number(c) }))
    .filter(x => x.count > 0 && !Number.isNaN(x.price))
    .sort((a, b) => a.price - b.price)
}

// Achat. Si priceMin/priceMax : on tente l'API NATIVE (offres + achat à prix fixe = le plus
// cher de la tranche). Repli sur le compat getNumberV2 (plafond seul) si le natif est indispo.
export async function herosmsBuy(
  apiKey: string,
  opts: { country: number; service?: string; operator?: string; maxPrice?: number; priceMin?: number; priceMax?: number; pick?: 'low' | 'high'; onLog?: (m: string) => void },
): Promise<{ id: number; phone: string; price?: number }> {
  const service = opts.service ?? 'ig'
  const pick = opts.pick ?? 'high'

  // 1. Ciblage de tranche via l'API native.
  if (opts.priceMin != null && opts.priceMax != null) {
    const best = await nativeBestPriceInRange(apiKey, service, opts.country, opts.priceMin, opts.priceMax, pick, opts.onLog)
    if (best != null) {
      const nb = await call('native_buy', apiKey, { country: opts.country, service, maxPrice: best, fixedPrice: true })
      const item = Array.isArray(nb.data?.data) ? nb.data.data[0] : null
      if (nb.ok && item?.id && item?.phone) {
        opts.onLog?.(`   💲 prix ciblé (natif, le ${pick === 'low' ? 'moins' : 'plus'} cher de ${opts.priceMin}–${opts.priceMax}$) : ${best.toFixed(4)}$`)
        return { id: Number(item.id), phone: String(item.phone), price: item.price != null ? Number(item.price) : best }
      }
      opts.onLog?.(`   ⚠ achat natif refusé → repli compat (${(nb.data && (nb.data.title || nb.data.details)) || nb.error || nb.status || ''})`)
    }
  }

  // 2. Repli compat getNumberV2 (plafond = priceMax).
  const maxPrice = opts.maxPrice ?? opts.priceMax
  const r = await call('buy', apiKey, { country: opts.country, service, operator: opts.operator, maxPrice })
  const d = r.data
  if (r.ok && d && (d.activationId || d.phoneNumber)) return { id: Number(d.activationId), phone: String(d.phoneNumber), price: d.activationCost != null ? Number(d.activationCost) : undefined }
  const m = (r.text ?? '').match(/ACCESS_NUMBER:(\d+):(\d+)/)
  if (m) return { id: Number(m[1]), phone: m[2] }
  throw new Error(`${r.text || r.error || 'achat HeroSMS échoué'}${r.base ? ` [${r.base.replace('https://hero-sms.com', '')}]` : ''}`)
}

// getStatus → « STATUS_OK:<code> » (code reçu) / « STATUS_WAIT_CODE » (attente).
export async function herosmsCheckCode(apiKey: string, id: number): Promise<string | null> {
  const r = await call('status', apiKey, { id })
  const t = r.text ?? ''
  const m = t.match(/STATUS_OK:(\d+)/)
  return m ? m[1] : null
}

export async function herosmsFinish(apiKey: string, id: number): Promise<void> { await call('finish', apiKey, { id }) }
export async function herosmsCancel(apiKey: string, id: number): Promise<void> { await call('cancel', apiKey, { id }) }

// Attend le code SMS (poll ~5 s jusqu'à maxMs). Détecte aussi l'annulation côté HeroSMS.
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
      const r = await call('status', apiKey, { id })
      const t = r.text ?? ''
      const m = t.match(/STATUS_OK:(\d+)/)
      if (m) { opts?.onLog?.(`   ✉️ code reçu : ${m[1]}`); return m[1] }
      if (/STATUS_CANCEL/i.test(t)) { opts?.onLog?.('   ⚠ activation annulée côté HeroSMS'); return null }
      if (n % 3 === 0) opts?.onLog?.(`   ⏳ attente du SMS… (${Math.round((deadline - Date.now()) / 1000)}s restantes)`)
    } catch (e) { opts?.onLog?.(`   ⚠ check: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return null
}
