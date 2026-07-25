// Proxy serverless iRemoTech (Device API) — garde la clé API côté serveur et
// évite le CORS navigateur. Utilisé par la sous-app Blowsome (Phone Farm).
//
// Config Vercel requise :
//   IREMOTECH_API_KEY   = irt_live_<key_id>_<secret>   (créée dans leur dashboard)
//   IREMOTECH_API_BASE  = https://api.iremotech.com/v1 (optionnel, défaut ci-dessous)
//
// Le client POST { op, deviceId?, body?, filename?, mediaUrl? } ; on relaie vers
// l'API iRemoTech. Snapshot renvoyé en data URL base64 (JPEG). Upload média :
// on télécharge le fichier de la banque Supabase (garde anti-SSRF) puis on POST
// les octets bruts sur /devices/{id}/media.

const { fetchMediaFollow } = require('./_ssrf')

module.exports.config = { maxDuration: 60 }

const BASE = (process.env.IREMOTECH_API_BASE || 'https://api.iremotech.com/v1').replace(/\/$/, '')

async function jsonOr(res) { try { return await res.json() } catch { return null } }

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, base: BASE })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const { op, deviceId, body, filename, mediaUrl, apiKey } = req.body ?? {}
  // Clé : d'abord celle envoyée par le client (config par agence dans ScaleFlow),
  // sinon la variable d'env Vercel globale (fallback optionnel).
  const KEY = (typeof apiKey === 'string' && apiKey.trim()) ? apiKey.trim() : process.env.IREMOTECH_API_KEY
  if (!KEY) return res.status(200).json({ ok: false, error: 'Clé iRemoTech absente : colle ta clé API dans ScaleFlow (Phone Farm → ⚙) ou définis IREMOTECH_API_KEY sur Vercel.' })
  const auth = { Authorization: `Bearer ${KEY}` }
  const dev = encodeURIComponent(String(deviceId ?? ''))

  try {
    if (op === 'devices') {
      const r = await fetch(`${BASE}/devices`, { headers: auth, signal: AbortSignal.timeout(20000) })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    if (op === 'usage') {
      const r = await fetch(`${BASE}/usage`, { headers: auth, signal: AbortSignal.timeout(20000) })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    if (op === 'snapshot') {
      const r = await fetch(`${BASE}/devices/${dev}/snapshot`, { headers: auth, signal: AbortSignal.timeout(25000) })
      if (!r.ok) {
        // On remonte le corps réel d'iRemoTech (souvent un JSON { error, message })
        // pour diagnostiquer un 503 « device offline » vs autre chose.
        let detail = ''
        try { detail = (await r.text()).slice(0, 300) } catch { /* ignore */ }
        return res.status(200).json({ ok: false, status: r.status, error: `snapshot ${r.status}${detail ? ` — ${detail}` : ''}` })
      }
      const buf = Buffer.from(await r.arrayBuffer())
      return res.status(200).json({ ok: true, dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` })
    }
    if (op === 'action') {
      const r = await fetch(`${BASE}/devices/${dev}/actions`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(20000),
      })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    if (op === 'media') {
      // Télécharge le média (banque Supabase) — garde anti-SSRF — puis envoie les octets.
      let dl
      try { dl = await fetchMediaFollow(mediaUrl) }
      catch (e) { return res.status(200).json({ ok: false, error: `média refusé: ${e?.message ?? e}` }) }
      if (!dl.ok) return res.status(200).json({ ok: false, error: `fetch média ${dl.status}` })
      const bytes = Buffer.from(await dl.arrayBuffer())
      const r = await fetch(`${BASE}/devices/${dev}/media?filename=${encodeURIComponent(filename || 'video.mp4')}`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' },
        body: bytes, signal: AbortSignal.timeout(55000),
      })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    return res.status(400).json({ ok: false, error: `op inconnu: ${op}` })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}
