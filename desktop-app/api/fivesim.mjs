// Proxy serverless 5sim (numéros virtuels pour la création de comptes) — garde le
// token côté serveur et évite le CORS navigateur. Hôte fixe (pas de SSRF ouvert).
//
// Config Vercel (optionnelle) : FIVESIM_API_KEY = <token 5sim>. Sinon le client
// envoie sa propre clé (stockée dans ScaleFlow). Le client POST { op, apiKey?, ... }.

const BASE = 'https://5sim.net/v1'

async function jsonOr(res) { try { return await res.json() } catch { return null } }

export default async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, base: BASE })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const b = req.body ?? {}
  const op = b.op
  const KEY = (typeof b.apiKey === 'string' && b.apiKey.trim()) ? b.apiKey.trim() : process.env.FIVESIM_API_KEY
  if (!KEY) return res.status(200).json({ ok: false, error: 'Clé 5sim absente : colle ton token dans ScaleFlow, ou définis FIVESIM_API_KEY sur Vercel.' })
  const headers = { Authorization: `Bearer ${KEY}`, Accept: 'application/json' }

  // Construit l'URL selon l'opération (tous les paramètres sont encodés).
  const enc = encodeURIComponent
  let url
  switch (op) {
    case 'balance': url = `${BASE}/user/profile`; break
    case 'buy': {
      const country = enc(b.country || 'england'), operator = enc(b.operator || 'any'), product = enc(b.product || 'instagram')
      url = `${BASE}/user/buy/activation/${country}/${operator}/${product}`
      break
    }
    case 'check':  url = `${BASE}/user/check/${enc(String(b.id ?? ''))}`;  break
    case 'finish': url = `${BASE}/user/finish/${enc(String(b.id ?? ''))}`; break
    case 'cancel': url = `${BASE}/user/cancel/${enc(String(b.id ?? ''))}`; break
    case 'ban':    url = `${BASE}/user/ban/${enc(String(b.id ?? ''))}`;    break
    default: return res.status(400).json({ ok: false, error: `op inconnu: ${op}` })
  }

  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(25000) })
    const text = await r.text()
    // 5sim renvoie souvent du texte brut sur erreur (ex. « no free phones »).
    let data = null
    try { data = JSON.parse(text) } catch { data = text }
    return res.status(200).json({ ok: r.ok, status: r.status, data })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}

export const config = { maxDuration: 30 }
