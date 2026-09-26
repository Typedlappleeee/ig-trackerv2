// Proxy serverless HeroSMS (numéros virtuels, compatible ex-SMS-Activate) — garde le
// token côté serveur, évite le CORS. Hôte fixe. Auth: header « Authorization: ApiKey <key> ».
//
// Config Vercel (optionnelle) : HEROSMS_API_KEY. Sinon le client envoie sa clé.
// Le client POST { op, apiKey?, ... }.

const BASE = 'https://hero-sms.com/api/v1'

async function jsonOr(res) { try { return await res.json() } catch { return null } }

export default async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, base: BASE })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const b = req.body ?? {}
  const op = b.op
  const KEY = (typeof b.apiKey === 'string' && b.apiKey.trim()) ? b.apiKey.trim() : process.env.HEROSMS_API_KEY
  if (!KEY) return res.status(200).json({ ok: false, error: 'Clé HeroSMS absente : colle ton token dans ScaleFlow, ou définis HEROSMS_API_KEY sur Vercel.' })
  const headers = { Authorization: `ApiKey ${KEY}`, Accept: 'application/json' }
  const enc = encodeURIComponent

  try {
    let r
    if (op === 'buy') {
      // amount 1 · service ig · country (int) · operator? · maxPrice? · verificationType sms
      const body = {
        amount: 1,
        service: b.service || 'ig',
        country: Number(b.country),
        verificationType: 'sms',
      }
      if (b.operator) body.operator = b.operator
      if (b.maxPrice != null) { body.maxPrice = Number(b.maxPrice); body.fixedPrice = false }
      r = await fetch(`${BASE}/activations`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
      })
    } else if (op === 'offers') {
      const p = new URLSearchParams()
      if (b.service) p.set('services', String(b.service))
      if (b.country != null) p.set('countries', String(b.country))
      r = await fetch(`${BASE}/activations/offers/sms?${p.toString()}`, { headers, signal: AbortSignal.timeout(20000) })
    } else if (op === 'otp') {
      r = await fetch(`${BASE}/activations/${enc(String(b.id))}/otp/last`, { headers, signal: AbortSignal.timeout(20000) })
    } else if (op === 'active') {
      r = await fetch(`${BASE}/activations`, { headers, signal: AbortSignal.timeout(20000) })
    } else if (op === 'finish') {
      r = await fetch(`${BASE}/activations/${enc(String(b.id))}/finish`, { method: 'POST', headers, signal: AbortSignal.timeout(20000) })
    } else if (op === 'cancel') {
      r = await fetch(`${BASE}/activations/${enc(String(b.id))}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) })
    } else {
      return res.status(400).json({ ok: false, error: `op inconnu: ${op}` })
    }

    // 204 No Content (finish/cancel réussis) → pas de corps.
    if (r.status === 204) return res.status(200).json({ ok: true, status: 204 })
    const data = await jsonOr(r)
    return res.status(200).json({ ok: r.ok, status: r.status, data })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}

export const config = { maxDuration: 30 }
