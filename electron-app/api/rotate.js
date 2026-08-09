// Proxy de rotation d'IP (web).
// GET /api/rotate?url=<change-ip-url>
// Appelle côté serveur le "Change IP URL" du fournisseur de proxy (ex. Prox'Easy,
// ou un dongle/DDNS auto-hébergé) pour contourner le CORS du navigateur. Ne fait
// qu'un GET, renvoie le statut + un extrait de la réponse. N'expose aucun secret :
// l'URL (avec son token) vient du client, on ne fait que la relayer.
//
// Robustesse : beaucoup d'endpoints de rotation sont des boîtiers auto-hébergés
// derrière un DNS dynamique (*.ddns.net) avec un certificat SSL auto-signé/expiré.
// Un `fetch()` standard rejette alors la connexion (« impossible de joindre le
// proxy ») ALORS QUE le proxy est bon. On tente donc, dans l'ordre :
//   1) l'URL telle quelle, vérification TLS normale ;
//   2) la même URL en ignorant le certificat (cas auto-signé) ;
//   3) le repli http:// si l'https échoue de bout en bout.
// C'est sûr : on ne fait qu'un GET pour déclencher une rotation, aucune donnée
// sensible n'est lue dans la réponse.

const https = require('https')
const http  = require('http')
const { hostIsPrivate } = require('./_ssrf')

module.exports.config = { maxDuration: 15 }

// GET bas niveau via le module Node http/https. `insecure` désactive la
// vérification du certificat (uniquement pour https). Résout toujours (jamais de
// throw) avec { ok, status, body } ou { failed, reason }.
function rawGet(targetUrl, { insecure } = {}) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(targetUrl) } catch { resolve({ failed: true, reason: 'url invalide' }); return }
    const mod = u.protocol === 'http:' ? http : https
    const opts = {
      method: 'GET',
      // Certains boîtiers renvoient 403 sans User-Agent « navigateur ».
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScaleFlow/1.0)' },
      timeout: 12000,
    }
    if (mod === https && insecure) opts.rejectUnauthorized = false
    const req = mod.request(u, opts, (r) => {
      let body = ''
      r.on('data', (c) => { if (body.length < 300) body += c.toString() })
      r.on('end', () => resolve({ ok: r.statusCode >= 200 && r.statusCode < 400, status: r.statusCode, body: body.slice(0, 300) }))
    })
    req.on('timeout', () => { req.destroy(); resolve({ failed: true, reason: 'le proxy n’a pas répondu (délai dépassé)' }) })
    req.on('error', (e) => resolve({ failed: true, reason: (e && e.code) ? e.code : (e && e.message) ? e.message : 'connexion refusée', code: e && e.code }))
    req.end()
  })
}

// Un code d'erreur Node lié au certificat TLS → on retentera en mode « insecure ».
function isCertError(code) {
  return typeof code === 'string' && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|TLS|SSL|ALTNAME|DEPTH_ZERO/i.test(code)
}

module.exports = async (req, res) => {
  const url = (req.query && req.query.url) || ''
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ ok: false, error: 'url manquante ou invalide' })
    return
  }
  // Garde-fou SSRF : pas d'IP privée / localhost.
  let host
  try {
    host = new URL(url).hostname
    if (hostIsPrivate(host)) {
      res.status(400).json({ ok: false, error: 'host non autorisé' })
      return
    }
  } catch {
    res.status(400).json({ ok: false, error: 'url invalide' })
    return
  }

  // 1) Tentative normale (TLS vérifié).
  let r = await rawGet(url)
  // 2) Erreur de certificat → retente en ignorant le cert (boîtier auto-signé).
  if (r.failed && (isCertError(r.code) || isCertError(r.reason)) && /^https:/i.test(url)) {
    r = await rawGet(url, { insecure: true })
  }
  // 3) https injoignable → repli http:// (certains boîtiers n'écoutent qu'en http).
  if (r.failed && /^https:/i.test(url)) {
    const httpTry = await rawGet(url.replace(/^https:/i, 'http:'))
    if (!httpTry.failed) r = httpTry
  }

  if (r.failed) {
    res.status(502).json({ ok: false, error: r.reason || 'injoignable' })
    return
  }
  res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, body: r.body })
}
