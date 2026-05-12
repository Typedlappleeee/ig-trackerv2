import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy GéeLark API calls from the browser (bypasses CORS).
// Also applies large-integer protection (GéeLark task IDs are 19-digit numbers
// that JSON.parse() loses precision on — we stringify them before parsing).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { method, url, headers, body, isText } = req.body as {
    method: string
    url: string
    headers?: Record<string, string>
    body?: unknown
    isText?: boolean
  }

  if (!url || !url.startsWith('https://openapi.geelark.com/')) {
    return res.status(403).json({ ok: false, error: 'Forbidden URL' })
  }

  try {
    const { Referer: _r, referer: _r2, Origin: _o, origin: _o2, ...safeHeaders } = headers ?? {}
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...safeHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (isText) {
      const text = await response.text()
      return res.json({ ok: true, status: response.status, data: text })
    }

    const raw = await response.text()
    let data: unknown
    try {
      // Protect 16+ digit integers (GéeLark task/phone IDs) from precision loss
      const safe = raw.replace(/:(\s*)(\d{16,})/g, ':$1"$2"')
      data = JSON.parse(safe)
    } catch { data = null }

    return res.json({ ok: true, status: response.status, data })
  } catch (err) {
    return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
