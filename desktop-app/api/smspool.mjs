// Proxy serverless SMSPool (https://api.smspool.net) — auth par param `key`.
// Le client POST { op, apiKey?, ...params }. On relaie côté serveur (pas de CORS navigateur).
// Config Vercel (optionnelle) : SMSPOOL_API_KEY. Sinon le client envoie sa clé.

const BASE = 'https://api.smspool.net'

export default async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, base: BASE })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const b = req.body ?? {}
  const KEY = (typeof b.apiKey === 'string' && b.apiKey.trim()) ? b.apiKey.trim() : process.env.SMSPOOL_API_KEY
  if (!KEY) return res.status(200).json({ ok: false, error: 'Clé SMSPool absente : colle ton token dans ScaleFlow, ou définis SMSPOOL_API_KEY sur Vercel.' })

  const form = new URLSearchParams(); form.set('key', KEY)
  const put = (k) => { if (b[k] != null && b[k] !== '') form.set(k, String(b[k])) }
  let url = '', method = 'POST'
  switch (b.op) {
    case 'balance': url = `${BASE}/request/balance`; method = 'GET'; break
    case 'buy': url = `${BASE}/purchase/sms`;['country', 'service', 'max_price', 'pool', 'pricing_option', 'quantity', 'areacode', 'exclude'].forEach(put); break
    case 'check': url = `${BASE}/sms/check`; put('orderid'); break
    case 'cancel': url = `${BASE}/sms/cancel`; put('orderid'); break
    case 'resend': url = `${BASE}/sms/resend`; put('orderid'); break
    case 'price': url = `${BASE}/request/price`;['country', 'service', 'pool'].forEach(put); break
    case 'countries': url = `${BASE}/country/retrieve_all`; method = 'GET'; break
    case 'services': url = `${BASE}/service/retrieve_all`; method = 'GET'; break
    default: return res.status(200).json({ ok: false, error: `op inconnu: ${b.op}` })
  }

  try {
    const r = await fetch(method === 'GET' ? `${url}?key=${encodeURIComponent(KEY)}` : url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } : { Accept: 'application/json' },
      body: method === 'POST' ? form.toString() : undefined,
      signal: AbortSignal.timeout(25000),
    })
    const text = await r.text()
    let data = null; try { data = JSON.parse(text) } catch { /* texte */ }
    return res.status(200).json({ ok: r.ok, status: r.status, data, text: data ? undefined : text })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}

export const config = { maxDuration: 30 }
