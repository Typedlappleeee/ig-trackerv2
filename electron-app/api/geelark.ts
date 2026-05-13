import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy GéeLark API calls from the browser (bypasses CORS).
// Also applies large-integer protection (GéeLark task IDs are 19-digit numbers
// that JSON.parse() loses precision on — we stringify them before parsing).

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

    // Vercel may pass req.body as a parsed object, a string, or null depending on headers.
    let parsed: Record<string, unknown> = {}
    if (req.body) {
      if (typeof req.body === 'string') {
        try { parsed = JSON.parse(req.body) } catch { parsed = {} }
      } else if (typeof req.body === 'object') {
        parsed = req.body as Record<string, unknown>
      }
    }

    const method  = (parsed.method as string) || 'GET'
    const url     = parsed.url as string
    const headers = (parsed.headers as Record<string, string> | undefined) ?? {}
    const body    = parsed.body
    const isText  = Boolean(parsed.isText)

    if (!url || !url.startsWith('https://openapi.geelark.com/')) {
      return res.status(200).json({ ok: false, error: 'Forbidden URL' })
    }

    const { Referer: _r, referer: _r2, Origin: _o, origin: _o2, ...safeHeaders } = headers

    // Hard timeout under Vercel's 10s function limit so we return a real error
    // instead of letting Vercel kill the function with FUNCTION_INVOCATION_FAILED.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9000)
    let response: globalThis.Response
    try {
      response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...safeHeaders },
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timer)
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      const isAbort = msg.toLowerCase().includes('abort')
      return res.status(200).json({
        ok: false,
        error: isAbort
          ? 'GéeLark inaccessible depuis le serveur web (timeout). Utilise la version desktop pour la sync.'
          : `GéeLark inaccessible : ${msg}`,
      })
    }
    clearTimeout(timer)

    if (isText) {
      const text = await response.text()
      return res.status(200).json({ ok: true, status: response.status, data: text })
    }

    const raw = await response.text()
    let data: unknown = null
    try {
      const safe = raw.replace(/:(\s*)(\d{16,})/g, ':$1"$2"')
      data = JSON.parse(safe)
    } catch { data = raw }

    return res.status(200).json({ ok: true, status: response.status, data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(200).json({ ok: false, error: msg })
  }
}
