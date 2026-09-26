// Proxy serverless HeroSMS (numéros virtuels, ex-SMS-Activate) — garde le token côté
// serveur, évite le CORS. Hôte fixe. Auth: header « Authorization ».
//
// La doc montre « Authorization: ApiKey <key> », mais selon la config le serveur peut
// attendre la clé BRUTE (« Authorization: <key> ») ou « Bearer <key> ». On essaie les
// variantes et on garde celle qui n'est pas rejetée (BAD_API_KEY / 401).
//
// Config Vercel (optionnelle) : HEROSMS_API_KEY. Sinon le client envoie sa clé.

const BASE = 'https://hero-sms.com/api/v1'

async function jsonOr(res) { try { return await res.json() } catch { return null } }
function isBadKey(status, data) {
  if (status === 401 || status === 403) return true
  const t = data && typeof data === 'object' ? `${data.title ?? ''} ${data.details ?? ''} ${data.message ?? ''}` : String(data ?? '')
  return /bad_api_key|invalid api key|unauthorized|unauthenticated|forbidden|api key/i.test(t)
}

export default async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, base: BASE })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const b = req.body ?? {}
  const op = b.op
  const KEY = (typeof b.apiKey === 'string' && b.apiKey.trim()) ? b.apiKey.trim() : process.env.HEROSMS_API_KEY
  if (!KEY) return res.status(200).json({ ok: false, error: 'Clé HeroSMS absente : colle ton token dans ScaleFlow, ou définis HEROSMS_API_KEY sur Vercel.' })
  const enc = encodeURIComponent

  // Décrit la requête (méthode / url / corps) selon l'op ; l'auth est ajoutée ensuite.
  let url, method = 'GET', jsonBody = null
  if (op === 'buy') {
    const body = { amount: 1, service: b.service || 'ig', country: Number(b.country), verificationType: 'sms' }
    if (b.operator) body.operator = b.operator
    if (b.maxPrice != null) { body.maxPrice = Number(b.maxPrice); body.fixedPrice = Boolean(b.fixedPrice) }
    url = `${BASE}/activations`; method = 'POST'; jsonBody = body
  } else if (op === 'offers') {
    const p = new URLSearchParams()
    if (b.service) p.set('services', String(b.service))
    if (b.country != null) p.set('countries', String(b.country))
    url = `${BASE}/activations/offers/sms?${p.toString()}`
  } else if (op === 'ping')   { url = `${BASE}/activations?size=1` }
  else if (op === 'otp')      { url = `${BASE}/activations/${enc(String(b.id))}/otp/last` }
  else if (op === 'active')   { url = `${BASE}/activations` }
  else if (op === 'finish')   { url = `${BASE}/activations/${enc(String(b.id))}/finish`; method = 'POST' }
  else if (op === 'cancel')   { url = `${BASE}/activations/${enc(String(b.id))}`; method = 'DELETE' }
  else return res.status(400).json({ ok: false, error: `op inconnu: ${op}` })

  const authVariants = [`ApiKey ${KEY}`, KEY, `Bearer ${KEY}`]
  try {
    let last = null
    for (const auth of authVariants) {
      const headers = { Authorization: auth, Accept: 'application/json' }
      if (jsonBody) headers['Content-Type'] = 'application/json'
      const r = await fetch(url, { method, headers, body: jsonBody ? JSON.stringify(jsonBody) : undefined, signal: AbortSignal.timeout(25000) })
      if (r.status === 204) return res.status(200).json({ ok: true, status: 204, auth })
      const data = await jsonOr(r)
      if (isBadKey(r.status, data)) { last = { ok: false, status: r.status, data }; continue } // essaie la variante suivante
      return res.status(200).json({ ok: r.ok, status: r.status, data, auth: auth.split(' ')[0] || 'raw' })
    }
    return res.status(200).json(last ?? { ok: false, error: 'auth HeroSMS refusée (toutes variantes)' })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}

export const config = { maxDuration: 30 }
