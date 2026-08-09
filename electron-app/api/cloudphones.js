// Proxy serverless « Cloud Phones maison » — relaie les appels du navigateur vers
// TON agent auto-hébergé (voir selfhost/agent/server.js). Contourne CORS et la CSP
// connect-src du navigateur ; le token de l'agent transite dans le corps POST
// (jamais exposé dans une URL/log).
// install (téléchargement + adb install sur l'agent) peut prendre plusieurs
// minutes pour un gros APK — budget bien plus large que les autres opérations.
module.exports.config = { maxDuration: 280 }

const { hostIsPrivate } = require('./_ssrf')

async function relay(agentUrl, agentToken, path, method = 'GET', body, timeoutMs = 45000) {
  const u = new URL(path, agentUrl)
  const opts = { method, headers: { Authorization: `Bearer ${agentToken}` }, signal: AbortSignal.timeout(timeoutMs) }
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  const r = await fetch(u, opts)
  let data = null
  try { data = await r.json() } catch { /* corps vide/non-JSON */ }
  return { ok: r.ok, status: r.status, data }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const { op, agentUrl, agentToken, id, name, cmd, timeout, url } = req.body ?? {}
  if (!agentUrl || !agentToken) return res.status(200).json({ ok: false, error: 'Agent non configuré (URL/token manquant)' })

  // Garde-fou : n'autorise pas de cibler une IP interne (SSRF) — l'agent doit
  // être un serveur public à toi, pas une ressource interne à Vercel.
  let host
  try { host = new URL(agentUrl).hostname }
  catch { return res.status(400).json({ ok: false, error: 'URL agent invalide' }) }
  if (hostIsPrivate(host)) return res.status(400).json({ ok: false, error: 'host non autorisé' })

  try {
    let r
    switch (op) {
      case 'health':     r = await relay(agentUrl, agentToken, '/health'); break
      case 'list':        r = await relay(agentUrl, agentToken, '/instances'); break
      case 'create':      r = await relay(agentUrl, agentToken, '/instances', 'POST', { name }); break
      case 'remove':       r = await relay(agentUrl, agentToken, `/instances/${encodeURIComponent(id || '')}`, 'DELETE'); break
      case 'start':       r = await relay(agentUrl, agentToken, `/instances/${encodeURIComponent(id || '')}/start`, 'POST'); break
      case 'stop':        r = await relay(agentUrl, agentToken, `/instances/${encodeURIComponent(id || '')}/stop`, 'POST'); break
      case 'shell':        r = await relay(agentUrl, agentToken, `/instances/${encodeURIComponent(id || '')}/shell`, 'POST', { cmd, timeout }); break
      case 'screenshot':  r = await relay(agentUrl, agentToken, `/instances/${encodeURIComponent(id || '')}/screenshot`); break
      case 'install':      r = await relay(agentUrl, agentToken, `/instances/${encodeURIComponent(id || '')}/install`, 'POST', { url }, 270000); break
      default: return res.status(400).json({ ok: false, error: `op inconnu: ${op}` })
    }
    // Les données de l'agent restent rangées sous `data` (pas dépliées à plat) —
    // le client (cloudPhones.ts) attend r.data.instances / r.data.dataUrl, etc.
    return res.status(200).json({ ok: r.ok, status: r.status, data: r.data })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : 'agent injoignable' })
  }
}
