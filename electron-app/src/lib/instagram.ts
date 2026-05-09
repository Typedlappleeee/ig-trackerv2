// Fetch public Instagram profile stats via Electron main process (bypasses CORS).
// Tries the JSON API first, falls back to parsing the profile HTML page.

export interface IgStats {
  username:    string
  followers:   number
  following:   number
  posts:       number
  total_views: number
  bio:         string
}

const IG_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'X-IG-App-ID':    '936619743392459',
  'X-ASBD-ID':      '129477',
  'Sec-Fetch-Site':  'same-origin',
  'Sec-Fetch-Mode':  'cors',
  'Sec-Fetch-Dest':  'empty',
}

// ── Attempt 1: internal JSON API ───────────────────────────────────────────
async function fetchViaJsonApi(clean: string): Promise<IgStats | null> {
  const result = await window.electronAPI!.geelarkRequest({
    method: 'GET',
    url: `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`,
    headers: { ...IG_HEADERS, 'Referer': `https://www.instagram.com/${clean}/`, 'Origin': 'https://www.instagram.com' },
  })
  if (!result.ok) return null
  try {
    const data = result.data as Record<string, unknown>
    const user = (data?.['data'] as Record<string, unknown>)?.['user'] as Record<string, unknown>
    if (!user) return null
    return extractFromUser(user, clean)
  } catch { return null }
}

function extractFromUser(user: Record<string, unknown>, clean: string): IgStats {
  const timeline = user['edge_owner_to_timeline_media'] as Record<string, unknown> | undefined
  const edges    = (timeline?.['edges'] as unknown[]) ?? []
  const total_views = edges.reduce((sum, e) => {
    const node = (e as Record<string, unknown>)?.['node'] as Record<string, unknown>
    return sum + ((node?.['video_view_count'] as number) ?? 0)
  }, 0)
  return {
    username:    (user['username'] as string) ?? clean,
    followers:   (user['edge_followed_by'] as Record<string, number>)?.['count'] ?? 0,
    following:   (user['edge_follow']     as Record<string, number>)?.['count'] ?? 0,
    posts:       (timeline?.['count'] as number) ?? 0,
    total_views,
    bio:         (user['biography'] as string) ?? '',
  }
}

// ── Attempt 2: parse the profile HTML page ────────────────────────────────
async function fetchViaHtml(clean: string): Promise<IgStats | null> {
  const result = await window.electronAPI!.geelarkRequest({
    method: 'GET',
    url: `https://www.instagram.com/${clean}/`,
    headers: {
      'User-Agent': IG_HEADERS['User-Agent'],
      'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer':    'https://www.instagram.com/',
    },
    isText: true,
  })
  if (!result.ok) return null
  const html = result.data as string
  if (!html || typeof html !== 'string') return null

  try {
    // Try to find embedded JSON (newer IG format)
    const jsonMatch = html.match(/"props":\{.*?"profilePage"[\s\S]{0,5000}?"biography":"([^"]*)"/)
    // Extract individual fields with targeted regex
    const followers = extractNumber(html, [
      /"edge_followed_by":\{"count":(\d+)\}/,
      /"followers":(\d+)/,
      /(\d[\d,]*)\s+followers/i,
    ])
    const following = extractNumber(html, [
      /"edge_follow":\{"count":(\d+)\}/,
      /"following":(\d+)/,
      /(\d[\d,]*)\s+following/i,
    ])
    const posts = extractNumber(html, [
      /"edge_owner_to_timeline_media":\{"count":(\d+)/,
      /"posts":(\d+)/,
      /(\d[\d,]*)\s+posts/i,
    ])
    const bio = html.match(/"biography":"([^"]*)"/)
    // total_views: sum any video_view_count values found in page
    const viewMatches = [...html.matchAll(/"video_view_count":(\d+)/g)]
    const total_views = viewMatches.reduce((s, m) => s + parseInt(m[1]), 0)

    if (followers === 0 && following === 0 && posts === 0) return null

    void jsonMatch // suppress unused warning
    return {
      username:    clean,
      followers:   followers,
      following:   following,
      posts:       posts,
      total_views: total_views,
      bio:         bio ? bio[1].replace(/\\n/g, '\n') : '',
    }
  } catch { return null }
}

function extractNumber(html: string, patterns: RegExp[]): number {
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return parseInt(m[1].replace(/,/g, ''))
  }
  return 0
}

// ── Attempt 3: i.instagram.com endpoint ──────────────────────────────────
async function fetchViaAltEndpoint(clean: string): Promise<IgStats | null> {
  const result = await window.electronAPI!.geelarkRequest({
    method: 'GET',
    url: `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`,
    headers: { ...IG_HEADERS, 'Referer': `https://www.instagram.com/${clean}/` },
  })
  if (!result.ok) return null
  try {
    const data = result.data as Record<string, unknown>
    const user = (data?.['data'] as Record<string, unknown>)?.['user'] as Record<string, unknown>
    if (!user) return null
    return extractFromUser(user, clean)
  } catch { return null }
}

// ── Public entry point — tries all methods in order ───────────────────────
export async function fetchIgStats(username: string): Promise<IgStats | null> {
  if (!window.electronAPI?.geelarkRequest) return null
  const clean = username.replace(/^@/, '').trim()
  if (!clean) return null

  // Try methods sequentially; return first success
  return (
    await fetchViaJsonApi(clean)   ??
    await fetchViaAltEndpoint(clean) ??
    await fetchViaHtml(clean)
  )
}
