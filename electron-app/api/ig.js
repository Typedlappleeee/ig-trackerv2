// Proxy Instagram unifié (fusion de img + proxy + instagram). EN JAVASCRIPT :
// les fonctions .ts échouent (FUNCTION_INVOCATION_FAILED) sur ce déploiement Vercel.
//   • GET  ?url=…                         → proxy d'image (miniatures / pp)
//   • POST { fn:'session', sessionid }    → valide un sessionid Instagram
//   • POST { url, method, headers, body } → proxy générique CORS (HTML/JSON/image)

module.exports.config = { maxDuration: 30 }

const ALLOWED = [
  'instagram.com', 'www.instagram.com', 'i.instagram.com', 'graph.instagram.com', 'api.instagram.com',
  'cdninstagram.com', 'scontent', 'fbcdn.net', 'supabase.co',
]
function isAllowed(url) {
  try {
    const { hostname } = new URL(url)
    return ALLOWED.some(h => hostname === h || hostname.endsWith('.' + h) || hostname.includes(h))
  } catch { return false }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

module.exports = async (req, res) => {
  // ── GET : proxy d'image ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const url = (req.query && req.query.url) || ''
    if (!url || !isAllowed(url)) return res.status(403).end('Forbidden')
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', Referer: 'https://www.instagram.com/' },
      })
      if (!r.ok) return res.status(r.status).end()
      res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.status(200).send(Buffer.from(await r.arrayBuffer()))
    } catch { return res.status(502).end() }
  }

  if (req.method !== 'POST') return res.status(405).end()

  const b = req.body || {}

  // ── POST fn:'session' : validation d'un sessionid Instagram ────────────────
  if (b.fn === 'session') {
    try {
      const sessionid = b.sessionid
      const username  = b.username
      if (!sessionid) return res.status(400).json({ ok: false })
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      let response
      try {
        response = await fetch('https://i.instagram.com/api/v1/accounts/current_user/?edit=true', {
          signal: controller.signal,
          headers: {
            Cookie: `sessionid=${sessionid}`,
            'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G998B; p3q; exynos2100; en_US; 458229258)',
            'X-IG-App-ID': '936619743392459', Accept: '*/*',
          },
        })
      } finally { clearTimeout(timeout) }
      if (!response.ok) return res.json({ ok: false })
      const data = await response.json().catch(() => null)
      const user = data && data.user
      if (!user) return res.json({ ok: false })
      return res.json({ ok: true, username: String(user.username || username || ''), followers: Number(user.follower_count || 0) })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      const isTimeout = msg.includes('abort') || msg.includes('timeout')
      return res.status(200).json({ ok: false, error: isTimeout ? 'Timeout Instagram' : msg })
    }
  }

  // ── POST : proxy générique CORS ────────────────────────────────────────────
  try {
    const url = b.url
    const method = b.method || 'GET'
    const headers = b.headers
    const body = b.body
    const isText = b.isText
    if (!url || !isAllowed(url)) return res.status(403).json({ ok: false, error: 'Forbidden URL' })
    const response = await fetch(url, {
      method,
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', ...(headers || {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (isText) return res.json({ ok: true, status: response.status, data: await response.text() })
    const contentType = response.headers.get('content-type') || ''
    if (contentType.startsWith('image/')) {
      const b64 = Buffer.from(await response.arrayBuffer()).toString('base64')
      return res.json({ ok: true, dataUrl: `data:${contentType};base64,${b64}` })
    }
    return res.json({ ok: true, status: response.status, data: await response.json().catch(() => null) })
  } catch (err) {
    return res.json({ ok: false, error: err && err.message ? err.message : String(err) })
  }
}
