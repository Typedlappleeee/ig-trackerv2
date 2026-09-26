// Proxy serverless HeroSMS — protocole COMPATIBLE SMS-Activate (auth par query ?api_key=).
// HeroSMS se présente comme « compatible ex-SMS-Activate » ; l'API native /api/v1 (auth
// header) refuse la clé, donc on utilise le handler SMS-Activate. On essaie les URLs
// candidates et on garde celle qui répond.
//
// Config Vercel (optionnelle) : HEROSMS_API_KEY. Sinon le client envoie sa clé.
// Le client POST { op, apiKey?, ... }. Réponses SMS-Activate = TEXTE (ACCESS_*, STATUS_*).

const CANDIDATE_BASES = [
  'https://hero-sms.com/stubs/handler_api.php',
  'https://hero-sms.com/api/v1',
  'https://hero-sms.com/handler_api.php',
]

// Actions SMS-Activate par op.
function actionFor(op, b) {
  switch (op) {
    case 'ping':   return { action: 'getBalance' }
    case 'buy':    return { action: 'getNumberV2', service: b.service || 'ig', country: String(b.country ?? ''), ...(b.maxPrice != null ? { maxPrice: String(b.maxPrice) } : {}), ...(b.operator ? { operator: b.operator } : {}) }
    case 'status': return { action: 'getStatus', id: String(b.id ?? '') }
    case 'finish': return { action: 'setStatus', id: String(b.id ?? ''), status: '6' }
    case 'cancel': return { action: 'setStatus', id: String(b.id ?? ''), status: '8' }
    case 'prices': return { action: 'getPrices', service: b.service || 'ig', country: String(b.country ?? '') }
    default: return null
  }
}

// Une réponse qui indique « mauvais endpoint » → on essaie l'URL suivante.
function looksWrongEndpoint(status, text) {
  return status === 404 || /<html|<!doctype|not found|no such|bad_action|wrong_action|unauthenticated/i.test(text)
}

export default async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, bases: CANDIDATE_BASES })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const b = req.body ?? {}
  const KEY = (typeof b.apiKey === 'string' && b.apiKey.trim()) ? b.apiKey.trim() : process.env.HEROSMS_API_KEY
  if (!KEY) return res.status(200).json({ ok: false, error: 'Clé HeroSMS absente : colle ton token dans ScaleFlow, ou définis HEROSMS_API_KEY sur Vercel.' })

  const params = actionFor(b.op, b)
  if (!params) return res.status(200).json({ ok: false, error: `op inconnu: ${b.op}` })

  try {
    let last = null
    for (const base of CANDIDATE_BASES) {
      const qs = new URLSearchParams({ api_key: KEY, ...params })
      let r
      try { r = await fetch(`${base}?${qs.toString()}`, { signal: AbortSignal.timeout(25000) }) }
      catch (e) { last = { ok: false, error: String(e && e.message || e), base }; continue }
      const text = (await r.text()).trim()
      if (looksWrongEndpoint(r.status, text)) { last = { ok: false, status: r.status, text, base }; continue }
      // Réponse exploitable de ce endpoint. On tente aussi de parser du JSON (getNumberV2/getPrices).
      let data = null
      try { data = JSON.parse(text) } catch { /* texte SMS-Activate */ }
      const badKey = /BAD_KEY|WRONG_TOKEN|Unauthenticated/i.test(text)
      return res.status(200).json({ ok: r.status < 400 && !badKey, status: r.status, text, data, base })
    }
    return res.status(200).json(last ?? { ok: false, error: 'Aucun endpoint HeroSMS n’a répondu' })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}

export const config = { maxDuration: 30 }
