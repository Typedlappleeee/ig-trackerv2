import type { VercelRequest, VercelResponse } from '@vercel/node'

// Validate an Instagram sessionid by calling the /api/v1/accounts/current_user/ endpoint.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { sessionid, username } = req.body as { sessionid: string; username?: string }
  if (!sessionid) return res.status(400).json({ ok: false })

  try {
    const response = await fetch('https://i.instagram.com/api/v1/accounts/current_user/?edit=true', {
      headers: {
        'Cookie':       `sessionid=${sessionid}`,
        'User-Agent':   'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G998B; p3q; exynos2100; en_US; 458229258)',
        'X-IG-App-ID':  '936619743392459',
        'Accept':       '*/*',
      },
    })

    if (!response.ok) return res.json({ ok: false })

    const data = await response.json() as Record<string, unknown>
    const user = data['user'] as Record<string, unknown> | undefined
    if (!user) return res.json({ ok: false })

    return res.json({
      ok: true,
      username: String(user['username'] ?? username ?? ''),
      followers: Number(user['follower_count'] ?? 0),
    })
  } catch (err) {
    return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
