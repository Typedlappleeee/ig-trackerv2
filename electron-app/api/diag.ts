import type { VercelRequest, VercelResponse } from '@vercel/node'

// Diagnostic endpoint. Visit these URLs in the browser to see what works:
//   /api/diag                 → Vercel function alive?
//   /api/diag?step=fetch      → can Vercel fetch a public URL? (httpbin.org)
//   /api/diag?step=geelark    → can Vercel reach openapi.geelark.com at all?
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const step = (req.query.step as string) || 'alive'

  if (step === 'alive') {
    return res.status(200).json({
      ok: true,
      step,
      now: new Date().toISOString(),
      node: process.version,
      region: process.env.VERCEL_REGION ?? 'unknown',
    })
  }

  if (step === 'fetch') {
    const t0 = Date.now()
    try {
      const r = await fetch('https://httpbin.org/get', { signal: AbortSignal.timeout(8000) })
      const txt = await r.text()
      return res.status(200).json({
        ok: true, step, status: r.status, ms: Date.now() - t0,
        sample: txt.slice(0, 200),
      })
    } catch (err) {
      return res.status(200).json({
        ok: false, step, ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (step === 'geelark') {
    const t0 = Date.now()
    try {
      // Just hit the host without auth — we only want to know if TCP/TLS works.
      const r = await fetch('https://openapi.geelark.com/', { signal: AbortSignal.timeout(8000) })
      const txt = await r.text()
      return res.status(200).json({
        ok: true, step, status: r.status, ms: Date.now() - t0,
        sample: txt.slice(0, 200),
      })
    } catch (err) {
      return res.status(200).json({
        ok: false, step, ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return res.status(200).json({ ok: false, error: `unknown step: ${step}` })
}
