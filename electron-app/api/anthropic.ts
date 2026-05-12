import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy Anthropic Vision API calls (browsers can't call api.anthropic.com directly).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { apiKey, model, messages, maxTokens } = req.body as {
    apiKey:     string
    model?:     string
    messages:   unknown[]
    maxTokens?: number
  }

  if (!apiKey) return res.status(400).json({ ok: false, error: 'Missing apiKey' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      model ?? 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens ?? 2000,
        messages,
      }),
    })
    const data = await response.json()
    if (!response.ok) return res.json({ ok: false, error: JSON.stringify(data) })
    return res.json({ ok: true, data })
  } catch (err) {
    return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
