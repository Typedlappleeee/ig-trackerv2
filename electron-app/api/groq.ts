import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy Groq API calls from the browser.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { apiKey, model, messages, temperature, maxTokens } = req.body as {
    apiKey:       string
    model?:       string
    messages:     unknown[]
    temperature?: number
    maxTokens?:   number
  }

  if (!apiKey) return res.status(400).json({ ok: false, error: 'Missing apiKey' })

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       model ?? 'llama3-70b-8192',
        messages,
        temperature: temperature ?? 0.7,
        max_tokens:  maxTokens ?? 2048,
      }),
    })
    const data = await response.json()
    if (!response.ok) return res.json({ ok: false, error: JSON.stringify(data) })
    return res.json({ ok: true, data })
  } catch (err) {
    return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
