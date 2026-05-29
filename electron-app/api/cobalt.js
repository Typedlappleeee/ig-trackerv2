// Video download proxy — multi-fallback strategy for Instagram and TikTok.
// cobalt.tools was removed (now requires JWT auth as of 2026).
// TikTok: tikmate.app (reliable) → page scraping fallback
// Instagram: mobile UA scraping (best-effort; Instagram blocks most server IPs)
const TIMEOUT = 14000

function cleanUrl(raw) {
  try {
    const u = new URL(raw.trim())
    return (u.origin + u.pathname).replace(/\/$/, '')
  } catch { return raw.trim() }
}

// ── TikTok — tikmate.app ──────────────────────────────────────────────────────
// Returns a direct download URL via tikmate's token-based system
async function tryTikmate(url) {
  const r = await fetch('https://api.tikmate.app/api/lookup', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body:    new URLSearchParams({ url }).toString(),
    signal:  AbortSignal.timeout(TIMEOUT),
  })
  if (!r.ok) return null
  const d = await r.json()
  if (!d.success || !d.token || !d.id) return null
  return `https://tikmate.app/download/${d.token}/${d.id}.mp4`
}

// ── TikTok — page scraping ────────────────────────────────────────────────────
// TikTok embeds playAddr in the page HTML (server-rendered JSON)
async function tryTikTokScrape(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!r.ok) return null
  const html = await r.text()
  const m = html.match(/"playAddr":"([^"]+)"/) || html.match(/"downloadAddr":"([^"]+)"/)
  if (!m) return null
  return m[1]
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g,    '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\/g,      '')
}

// ── Instagram scraping ───────────────────────────────────────────────────────
// Instagram renders video URLs client-side, so server-side scraping often fails
// for standard datacenter IPs. This tries anyway with multiple patterns.
async function tryInstagramScrape(url) {
  const urls = [url + '/', url + '/embed/']

  for (const target of urls) {
    try {
      const r = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.instagram.com/',
        },
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (!r.ok) continue

      const html = await r.text()

      const patterns = [
        /"video_url":"(https:[^"]+)"/,
        /"playback_url":"(https:[^"]+)"/,
        /"video_versions":\[{"type":\d+,"width":\d+,"height":\d+,"url":"(https:[^"]+)"/,
        /property="og:video:secure_url"\s+content="([^"]+)"/,
        /content="([^"]+)"\s+property="og:video:secure_url"/,
        /property="og:video"\s+content="([^"]+)"/,
        /content="([^"]+)"\s+property="og:video"/,
        /<video[^>]+src="(https:[^"]+)"/,
      ]

      for (const p of patterns) {
        const m = html.match(p)
        if (m?.[1]) {
          return m[1].replace(/\\u0026/g, '&').replace(/\\\/\\\//g, '//').replace(/\\/g, '')
        }
      }
    } catch { /* try next */ }
  }
  return null
}

// ── main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { url } = req.body ?? {}
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ status: 'error', error: { code: 'missing_url' } })
  }

  const clean = cleanUrl(url)
  const isIG  = url.includes('instagram.com')
  const isTT  = url.includes('tiktok.com')

  if (!isIG && !isTT) {
    return res.json({ status: 'error', error: { code: 'unsupported_platform' } })
  }

  if (isTT) {
    // 1. tikmate.app (most reliable for TikTok)
    const tikmate = await tryTikmate(url).catch(() => null)
    if (tikmate) return res.json({ status: 'tunnel', url: tikmate })

    // 2. Page scraping fallback
    const scraped = await tryTikTokScrape(url).catch(() => null)
    if (scraped) return res.json({ status: 'tunnel', url: scraped })

    return res.json({ status: 'error', error: { code: 'tiktok_video_not_found' } })
  }

  if (isIG) {
    const videoUrl = await tryInstagramScrape(clean).catch(() => null)
    if (videoUrl) return res.json({ status: 'tunnel', url: videoUrl })
    return res.json({ status: 'error', error: { code: 'instagram_not_supported' } })
  }
}
