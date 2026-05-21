// Dedicated GéeLark shell proxy for screenshot commands — longer timeout than gx.js
export const config = { maxDuration: 25 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { url, headers, body } = req.body ?? {}

  if (!url || !String(url).startsWith('https://openapi.geelark.com/')) {
    return res.status(200).json({ ok: false, error: 'Forbidden URL' })
  }

  const safeHeaders = { 'Content-Type': 'application/json' }
  if (headers && typeof headers === 'object') {
    for (const k of Object.keys(headers)) {
      const lk = k.toLowerCase()
      if (lk !== 'referer' && lk !== 'origin') safeHeaders[k] = headers[k]
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 22000)

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: safeHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (fetchErr) {
    clearTimeout(timer)
    const msg = fetchErr?.message ?? String(fetchErr)
    return res.status(200).json({ ok: false, error: msg.includes('abort') ? 'Timeout screenshot (22s)' : msg })
  }
  clearTimeout(timer)

  try {
    const raw = await response.text()
    let data = null
    try {
      const safe = raw.replace(/:(\s*)(\d{16,})/g, ':$1"$2"')
      data = JSON.parse(safe)
    } catch {
      data = raw
    }
    return res.status(200).json({ ok: true, status: response.status, data })
  } catch (err) {
    return res.status(200).json({ ok: false, error: err?.message ?? String(err) })
  }
}
