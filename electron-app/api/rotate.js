// Proxy de rotation d'IP (web).
// GET /api/rotate?url=<change-ip-url>
// Appelle côté serveur le "Change IP URL" du fournisseur de proxy (ex. Prox'Easy)
// pour contourner le CORS du navigateur. Ne fait qu'un GET, renvoie le statut +
// un extrait de la réponse. N'expose aucun secret : l'URL (avec son token) vient
// du client, on ne fait que la relayer.

module.exports.config = { maxDuration: 15 }

module.exports = async (req, res) => {
  const url = (req.query && req.query.url) || ''
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ ok: false, error: 'url manquante ou invalide' })
    return
  }
  // Garde-fou : n'autorise que des URLs http(s) publiques (pas d'IP privée / localhost).
  try {
    const host = new URL(url).hostname
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|::1)/i.test(host)) {
      res.status(400).json({ ok: false, error: 'host non autorisé' })
      return
    }
  } catch {
    res.status(400).json({ ok: false, error: 'url invalide' })
    return
  }
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 12000)
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    clearTimeout(t)
    const text = (await r.text().catch(() => '')).slice(0, 300)
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, body: text })
  } catch (e) {
    res.status(502).json({ ok: false, error: e && e.message ? e.message : String(e) })
  }
}
