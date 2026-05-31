// Proxy Anthropic Vision API calls (browsers can't call api.anthropic.com directly).
import { createClient } from '@supabase/supabase-js'

async function verifyAuth(req) {
  try {
    const auth = req.headers['authorization']
    if (!auth?.startsWith('Bearer ')) return null
    const token = auth.slice(7)
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) return null
    const sb = createClient(url, key, { auth: { persistSession: false } })
    const { data: { user }, error } = await sb.auth.getUser(token)
    return error ? null : user
  } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await verifyAuth(req)
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' })

  const { apiKey, model, messages, maxTokens } = req.body

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
