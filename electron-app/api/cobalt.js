// Proxy cobalt.tools API to avoid CORS restrictions in the browser.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { url } = req.body ?? {}
  if (!url) return res.status(400).json({ status: 'error', error: { code: 'missing_url' } })

  try {
    const response = await fetch('https://api.cobalt.tools/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({ url }),
    })

    const data = await response.json()
    return res.status(response.ok ? 200 : response.status).json(data)
  } catch (err) {
    return res.status(500).json({ status: 'error', error: { code: err instanceof Error ? err.message : String(err) } })
  }
}
