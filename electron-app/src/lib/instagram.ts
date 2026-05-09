// Fetch public Instagram profile stats.
// Strategy: try hidden BrowserWindow first (most reliable — real browser context),
// fall back to net.fetch JSON API, then HTML regex on net.fetch.

export interface IgStats {
  username:    string
  followers:   number
  following:   number
  posts:       number
  total_views: number
  bio:         string
}

const IG_HDRS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'X-IG-App-ID':    '936619743392459',
  'X-ASBD-ID':      '129477',
}

// ── HTML parser (shared by all methods that return raw HTML) ─────────────────
function parseHtml(html: string, fallbackUsername: string): IgStats | null {
  function num(pats: RegExp[]): number {
    for (const re of pats) {
      const m = html.match(re)
      if (m) return parseInt(m[1].replace(/[,\s]/g, ''))
    }
    return 0
  }

  const followers = num([
    /"edge_followed_by":\{"count":(\d+)\}/,
    /"follower_count":(\d+)/,
    /"userInteractionCount":(\d+)/,         // schema.org embed
    /(\d+)\s*(?:followers|abonnés)/i,       // visible text fallback
  ])
  const following = num([
    /"edge_follow":\{"count":(\d+)\}/,
    /"following_count":(\d+)/,
  ])
  const posts = num([
    /"edge_owner_to_timeline_media":\{"count":(\d+)/,
    /"media_count":(\d+)/,
    /"timeline_media_count":(\d+)/,
  ])

  const bioMatch  = html.match(/"biography":"((?:[^"\\]|\\.)*)"/)
  const bio       = bioMatch
    ? bioMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\u[\dA-Fa-f]{4}/g, c => String.fromCharCode(parseInt(c.slice(2), 16)))
    : ''

  const viewMs      = [...html.matchAll(/"video_view_count":(\d+)/g)]
  const playMs      = [...html.matchAll(/"play_count":(\d+)/g)]
  const allViews    = viewMs.length ? viewMs : playMs
  const total_views = allViews.reduce((s, m) => s + parseInt(m[1]), 0)

  const unameM = html.match(/"username":"([^"]+)"/)

  // If we got zero on everything the page was probably a consent/login wall
  if (followers === 0 && following === 0 && posts === 0) return null
  return { username: unameM?.[1] ?? fallbackUsername, followers, following, posts, bio, total_views }
}

// ── Method 1: Hidden BrowserWindow + API fast-path ──────────────────────────
// The IPC handler first tries the Instagram API with session cookies (fast).
// Falls back to loading the full page in a hidden browser (slow but handles GDPR).
async function fetchViaBrowser(clean: string): Promise<IgStats | null> {
  if (!window.electronAPI?.fetchInstagramHtml) return null
  const res = await window.electronAPI.fetchInstagramHtml(clean)
  if (!res.ok) return null

  // Fast path: IPC returned structured API JSON
  if (res.apiJson) {
    try {
      const json = res.apiJson as Record<string, unknown>
      const user = ((json['data'] as Record<string, unknown>)?.['user']) as Record<string, unknown>
      if (!user) return null
      const timeline    = user['edge_owner_to_timeline_media'] as Record<string, unknown> | undefined
      const edges       = (timeline?.['edges'] as unknown[]) ?? []
      const total_views = edges.reduce((s, e) => {
        const n = (e as Record<string, unknown>)['node'] as Record<string, unknown>
        return s + (((n['video_view_count'] as number) ?? 0))
      }, 0)
      return {
        username:    (user['username'] as string) ?? clean,
        followers:   ((user['edge_followed_by'] as Record<string, number>)?.count) ?? 0,
        following:   ((user['edge_follow']     as Record<string, number>)?.count) ?? 0,
        posts:       ((timeline?.['count'] as number) ?? 0),
        total_views,
        bio:         (user['biography'] as string) ?? '',
      }
    } catch { return null }
  }

  // Slow path: parse HTML from full browser page load
  if (!res.html || !res.url) return null
  if ((res.url as string).includes('/accounts/login') || (res.url as string).includes('/challenge')) return null
  return parseHtml(res.html, clean)
}

// ── Method 2: JSON API via net.fetch ─────────────────────────────────────────
async function fetchViaApi(clean: string, base = 'https://www.instagram.com'): Promise<IgStats | null> {
  if (!window.electronAPI?.geelarkRequest) return null
  const res = await window.electronAPI.geelarkRequest({
    method: 'GET',
    url: `${base}/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`,
    headers: { ...IG_HDRS, Referer: `https://www.instagram.com/${clean}/`, Origin: 'https://www.instagram.com' },
  })
  if (!res.ok) return null
  try {
    const data = res.data as Record<string, unknown>
    const user = (data?.['data'] as Record<string, unknown>)?.['user'] as Record<string, unknown>
    if (!user) return null
    const timeline    = user['edge_owner_to_timeline_media'] as Record<string, unknown> | undefined
    const edges       = (timeline?.['edges'] as unknown[]) ?? []
    const total_views = edges.reduce((s, e) => {
      const n = (e as Record<string, unknown>)['node'] as Record<string, unknown>
      return s + ((n['video_view_count'] as number) ?? 0)
    }, 0)
    return {
      username:    (user['username'] as string) ?? clean,
      followers:   (user['edge_followed_by'] as Record<string, number>)?.count ?? 0,
      following:   (user['edge_follow']     as Record<string, number>)?.count ?? 0,
      posts:       (timeline?.['count'] as number) ?? 0,
      total_views,
      bio:         (user['biography'] as string) ?? '',
    }
  } catch { return null }
}

// ── Method 3: Fetch HTML via net.fetch + regex parse ────────────────────────
async function fetchViaNetHtml(clean: string): Promise<IgStats | null> {
  if (!window.electronAPI?.geelarkRequest) return null
  const res = await window.electronAPI.geelarkRequest({
    method: 'GET',
    url: `https://www.instagram.com/${clean}/`,
    headers: {
      'User-Agent': IG_HDRS['User-Agent'],
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      Referer: 'https://www.instagram.com/',
    },
    isText: true,
  })
  if (!res.ok || typeof res.data !== 'string') return null
  return parseHtml(res.data, clean)
}

// ── In-memory cache (8 min TTL) ──────────────────────────────────────────────
// Instagram rate-limits after ~4 unauthenticated requests per session.
// Caching avoids redundant fetches when the user clicks Refresh repeatedly.
const _statsCache = new Map<string, { stats: IgStats; ts: number }>()
const CACHE_TTL = 8 * 60 * 1000

// ── Public entry point ───────────────────────────────────────────────────────
export async function fetchIgStats(username: string, { force = false } = {}): Promise<IgStats | null> {
  if (!window.electronAPI) return null
  const clean = username.replace(/^@/, '').trim()
  if (!clean) return null

  if (!force) {
    const cached = _statsCache.get(clean.toLowerCase())
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.stats
  }

  const result =
    await fetchViaBrowser(clean)             ??
    await fetchViaApi(clean)                 ??
    await fetchViaApi(clean, 'https://i.instagram.com') ??
    await fetchViaNetHtml(clean)

  if (result) _statsCache.set(clean.toLowerCase(), { stats: result, ts: Date.now() })
  return result
}

// Force-invalidate the cache for a username (call when user explicitly presses Refresh)
export function invalidateIgCache(username: string) {
  _statsCache.delete(username.replace(/^@/, '').trim().toLowerCase())
}
