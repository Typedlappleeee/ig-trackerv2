// Relais Graph API Meta (web) — contourne le CORS pour lire les insights IG.
// POST { url } où url commence par https://graph.facebook.com/ (token dans la query,
// posé par le client). On ne fait que relayer, aucun secret serveur.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })
  let body = {}
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) } catch { body = {} }
  const url = body.url
  if (!url || !String(url).startsWith('https://graph.facebook.com/')) {
    return res.status(200).json({ ok: false, error: 'Forbidden URL' })
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) })
    let data = null
    try { data = await r.json() } catch { data = null }
    return res.status(200).json({ ok: r.ok, status: r.status, data })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}
