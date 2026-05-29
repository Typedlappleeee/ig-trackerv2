// Video download proxy — routes Instagram and TikTok through server-side extraction
// to avoid CORS and Instagram/TikTok anti-bot measures in the browser.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { url } = req.body ?? {}
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ status: 'error', error: { code: 'missing_url' } })
  }

  try {
    if (url.includes('instagram.com')) {
      return await handleInstagram(url, res)
    }
    if (url.includes('tiktok.com')) {
      return await handleTikTok(url, res)
    }
    return res.json({ status: 'error', error: { code: 'unsupported_platform' } })
  } catch (err) {
    return res.json({ status: 'error', error: { code: err instanceof Error ? err.message : String(err) } })
  }
}

// ── Instagram ────────────────────────────────────────────────────────────────
// Fetches the public page and extracts the og:video meta tag URL.
async function handleInstagram(url, res) {
  // Normalise URL — remove query params and trailing slash
  const clean = url.split('?')[0].replace(/\/$/, '')

  const page = await fetch(clean + '/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  })

  if (!page.ok) {
    return res.json({ status: 'error', error: { code: `instagram_page_${page.status}` } })
  }

  const html = await page.text()

  // Look for og:video or og:video:secure_url
  const videoMatch =
    html.match(/<meta[^>]+property="og:video:secure_url"[^>]+content="([^"]+)"/) ||
    html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:video:secure_url"/) ||
    html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/) ||
    html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:video"/)

  if (videoMatch?.[1]) {
    const videoUrl = videoMatch[1].replace(/&amp;/g, '&')
    return res.json({ status: 'tunnel', url: videoUrl })
  }

  // Fallback: try JSON-LD or window.__additionalDataLoaded
  const jsonMatch = html.match(/"video_url":"([^"]+)"/) || html.match(/"playback_url":"([^"]+)"/)
  if (jsonMatch?.[1]) {
    return res.json({ status: 'tunnel', url: jsonMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '') })
  }

  return res.json({ status: 'error', error: { code: 'instagram_video_not_found' } })
}

// ── TikTok ───────────────────────────────────────────────────────────────────
// Uses tikwm.com public API — returns a watermark-free MP4 URL.
async function handleTikTok(url, res) {
  const r = await fetch('https://api.tikwm.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:   new URLSearchParams({ url, hd: '1' }).toString(),
  })

  if (!r.ok) {
    return res.json({ status: 'error', error: { code: `tikwm_${r.status}` } })
  }

  const data = await r.json()
  // data.data.play = no-watermark HD URL; data.data.wmplay = with watermark
  const videoUrl = data?.data?.play || data?.data?.wmplay
  if (!videoUrl) {
    return res.json({ status: 'error', error: { code: data?.msg ?? 'tiktok_no_url' } })
  }

  return res.json({ status: 'tunnel', url: videoUrl })
}
