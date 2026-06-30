import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy GET d'images (miniatures de reels, photos de profil Instagram).
// Le CDN Instagram bloque le chargement direct depuis le navigateur → on
// récupère l'image côté serveur et on la renvoie telle quelle pour <img src>.
const ALLOWED = ['cdninstagram.com', 'scontent', 'fbcdn.net', 'instagram.com', 'supabase.co']

function isAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED.some(h => hostname.includes(h))
  } catch { return false }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = (req.query.url as string) || ''
  if (!url || !isAllowed(url)) return res.status(403).end('Forbidden')
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        Referer: 'https://www.instagram.com/',
      },
    })
    if (!r.ok) return res.status(r.status).end()
    const ct = r.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', ct)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.status(200).send(buf)
  } catch {
    return res.status(502).end()
  }
}
