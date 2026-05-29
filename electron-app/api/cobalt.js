// Video download proxy — multi-fallback strategy for Instagram and TikTok.
// 1. cobalt.tools (handles both platforms, actively maintained)
// 2. Instagram: mobile user-agent scraping + multiple JSON patterns
// 3. TikTok: douyin.wtf public API
const TIMEOUT = 14000

function cleanUrl(raw) {
  try {
    const u = new URL(raw.trim())
    // Strip tracking params but keep the path clean
    return (u.origin + u.pathname).replace(/\/$/, '')
  } catch { return raw.trim() }
}

// ── cobalt.tools ─────────────────────────────────────────────────────────────
async function tryCobalt(url) {
  const r = await fetch('https://api.cobalt.tools/', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify({ url, downloadMode: 'auto', videoQuality: 'max' }),
    signal:  AbortSignal.timeout(TIMEOUT),
  })
  if (!r.ok) return null
  const d = await r.json()
  if (d.status === 'error' || (!d.url && !d.picker)) return null
  return d
}

// ── Instagram scraping ───────────────────────────────────────────────────────
// Fetch with a mobile Instagram user-agent — this sometimes includes JSON data
// with video URLs directly in the page source.
async function tryInstagramScrape(url) {
  // Try both the clean URL and the /embed/ version
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

// ── TikTok — douyin.wtf ───────────────────────────────────────────────────────
async function tryDouyinWtf(url) {
  const r = await fetch(`https://api.douyin.wtf/api?url=${encodeURIComponent(url)}&minimal=true`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!r.ok) return null
  const d = await r.json()
  return d?.video_url_noWaterMark || d?.video_url || null
}

// ── TikTok — tikwm ────────────────────────────────────────────────────────────
async function tryTikwm(url) {
  const r = await fetch('https://api.tikwm.com/', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body:    new URLSearchParams({ url, hd: '1' }).toString(),
    signal:  AbortSignal.timeout(TIMEOUT),
  })
  if (!r.ok) return null
  const d = await r.json()
  return d?.data?.play || d?.data?.wmplay || null
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

  // 1. cobalt.tools — primary (handles both IG + TT)
  const cobalt = await tryCobalt(clean).catch(() => null)
  if (cobalt) return res.json(cobalt)

  // 2. Platform-specific fallbacks
  if (isIG) {
    const videoUrl = await tryInstagramScrape(clean).catch(() => null)
    if (videoUrl) return res.json({ status: 'tunnel', url: videoUrl })
    return res.json({ status: 'error', error: { code: 'instagram_video_not_found' } })
  }

  if (isTT) {
    const videoUrl =
      await tryDouyinWtf(url).catch(() => null) ||
      await tryTikwm(url).catch(() => null)
    if (videoUrl) return res.json({ status: 'tunnel', url: videoUrl })
    return res.json({ status: 'error', error: { code: 'tiktok_video_not_found' } })
  }
}
