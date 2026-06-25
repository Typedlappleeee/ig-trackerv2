// Vercel API — vérifie le statut d'un compte Instagram via le proxy du téléphone.
// Même logique que le handler IPC Electron 'check-instagram-status' dans main.ts.
// POST { username, proxy?: { type, server, port, username, password } }
// Returns { ok, status: 'active'|'banned'|'blocked', httpStatus? }

const https = require('https')
const http  = require('http')

function buildProxyAgent(proxy) {
  if (!proxy?.server || !proxy?.port) return undefined
  const scheme = (proxy.type ?? proxy.scheme ?? 'http').toLowerCase()
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@`
    : ''
  const proxyUrl = `${scheme}://${auth}${proxy.server}:${proxy.port}`
  try {
    if (scheme.startsWith('socks')) {
      const { SocksProxyAgent } = require('socks-proxy-agent')
      return new SocksProxyAgent(proxyUrl)
    }
    const { HttpsProxyAgent } = require('https-proxy-agent')
    return new HttpsProxyAgent(proxyUrl)
  } catch {
    return undefined
  }
}

function classifyIgResponse(status, body) {
  if (status === 404) return 'banned'
  const low = body.toLowerCase()
  if (/sorry, this page isn'?t available|page isn'?t available|cette page n'est pas disponible|page introuvable|user not found|"users":\[\]/.test(low)) {
    if (!/log in to see|connecte-toi pour voir|loginform/.test(low)) return 'banned'
  }
  if (status === 200) {
    if (/"edge_followed_by"|"follower_count"|og:description|"biography"|profilepage|"edge_owner_to_timeline_media"/.test(low)) return 'active'
    if (/login|challenge|checkpoint|robot|captcha|few minutes|réessayer plus tard|try again later/.test(low)) return 'blocked'
    return 'blocked'
  }
  if (status === 429 || status === 401 || status === 403) return 'blocked'
  return 'blocked'
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body ?? {}

  const username = (body.username ?? '').replace(/^@/, '').trim()
  if (!username) return res.status(200).json({ ok: false, status: 'blocked', error: 'no_username' })

  const agent = buildProxyAgent(body.proxy)
  const url = `https://www.instagram.com/${encodeURIComponent(username)}/`
  const parsed = new URL(url)

  const result = await new Promise((resolve) => {
    const reqOpts = {
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   'GET',
      agent,
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }
    const igReq = https.request(reqOpts, (igRes) => {
      const httpStatus = igRes.statusCode ?? 0
      if (httpStatus === 404) {
        igRes.resume()
        return resolve({ ok: true, status: 'banned', httpStatus })
      }
      const chunks = []
      let size = 0
      igRes.on('data', c => { if (size < 600_000) { chunks.push(c); size += c.length } })
      igRes.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        resolve({ ok: true, status: classifyIgResponse(httpStatus, text), httpStatus })
      })
      igRes.on('error', () => resolve({ ok: true, status: 'blocked', httpStatus, error: 'stream_error' }))
    })
    igReq.on('error', e => resolve({ ok: false, status: 'blocked', error: e.message }))
    igReq.setTimeout(20_000, () => { igReq.destroy(new Error('timeout')); resolve({ ok: false, status: 'blocked', error: 'timeout' }) })
    igReq.end()
  })

  return res.status(200).json(result)
}
