import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_HOSTS = [
  'instagram.com', 'www.instagram.com', 'i.instagram.com',
  'graph.instagram.com', 'api.instagram.com',
  'cdninstagram.com', 'scontent', // IG CDN subdomains
]

function isAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h) || hostname.includes(h))
  } catch { return false }
}

// Generic CORS proxy for Instagram API + CDN image fetching.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { url, method = 'GET', headers, body, isText } = req.body as {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: unknown
    isText?: boolean
  }

  if (!url || !isAllowed(url)) {
    return res.status(403).json({ ok: false, error: 'Forbidden URL' })
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (isText) {
      const text = await response.text()
      return res.json({ ok: true, status: response.status, data: text })
    }

    const contentType = response.headers.get('content-type') ?? ''

    // Image → return as base64 data URL
    if (contentType.startsWith('image/')) {
      const buf = await response.arrayBuffer()
      const b64 = Buffer.from(buf).toString('base64')
      return res.json({ ok: true, dataUrl: `data:${contentType};base64,${b64}` })
    }

    const data = await response.json().catch(() => null)
    return res.json({ ok: true, status: response.status, data })
  } catch (err) {
    return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
