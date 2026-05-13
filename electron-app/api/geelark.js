// Proxy GéeLark API calls from the browser (bypasses CORS).
// JavaScript (not TypeScript) — Vercel TS compile was failing for this project.

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    // Vercel may pass body as object, string, or null depending on headers.
    let parsed = {}
    if (req.body) {
      if (typeof req.body === 'string') {
        try { parsed = JSON.parse(req.body) } catch (e) { parsed = {} }
      } else if (typeof req.body === 'object') {
        parsed = req.body
      }
    }

    const method  = parsed.method || 'GET'
    const url     = parsed.url
    const headers = parsed.headers || {}
    const body    = parsed.body
    const isText  = Boolean(parsed.isText)

    if (!url || !url.startsWith('https://openapi.geelark.com/')) {
      return res.status(200).json({ ok: false, error: 'Forbidden URL' })
    }

    // Strip referer/origin headers (GéeLark rejects them)
    const safeHeaders = { 'Content-Type': 'application/json' }
    for (const k of Object.keys(headers)) {
      const lk = k.toLowerCase()
      if (lk !== 'referer' && lk !== 'origin') safeHeaders[k] = headers[k]
    }

    // Hard timeout < 10s so we return a real error instead of FUNCTION_INVOCATION_FAILED
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9000)

    let response
    try {
      response = await fetch(url, {
        method,
        headers: safeHeaders,
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timer)
      const msg = fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr)
      const isAbort = msg.toLowerCase().includes('abort')
      return res.status(200).json({
        ok: false,
        error: isAbort
          ? 'GéeLark inaccessible depuis le serveur web (timeout 9s)'
          : 'GéeLark inaccessible : ' + msg,
      })
    }
    clearTimeout(timer)

    if (isText) {
      const text = await response.text()
      return res.status(200).json({ ok: true, status: response.status, data: text })
    }

    const raw = await response.text()
    let data = null
    try {
      // Protect 16+ digit integers (task/phone IDs) from JSON precision loss
      const safe = raw.replace(/:(\s*)(\d{16,})/g, ':$1"$2"')
      data = JSON.parse(safe)
    } catch (e) {
      data = raw
    }

    return res.status(200).json({ ok: true, status: response.status, data })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return res.status(200).json({ ok: false, error: msg })
  }
}
