// Fetch public Instagram profile stats via Electron main process (bypasses CORS).
// Uses Instagram's internal web API — no credentials required for public accounts.

export interface IgStats {
  username:   string
  followers:  number
  following:  number
  posts:      number
  total_views: number  // sum of video view counts from recent posts
  bio:        string
}

export async function fetchIgStats(username: string): Promise<IgStats | null> {
  if (!window.electronAPI?.geelarkRequest) return null

  const clean = username.replace(/^@/, '').trim()
  if (!clean) return null

  // Instagram internal API — returns JSON for public profiles
  const result = await window.electronAPI.geelarkRequest({
    method: 'GET',
    url: `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'X-IG-App-ID': '936619743392459',
      'Referer': `https://www.instagram.com/${clean}/`,
      'Origin': 'https://www.instagram.com',
    },
  })

  if (!result.ok) return null

  try {
    const data = result.data as Record<string, unknown>
    const user = (data?.['data'] as Record<string, unknown>)?.['user'] as Record<string, unknown>
    if (!user) return null

    const timeline = user['edge_owner_to_timeline_media'] as Record<string, unknown> | undefined
    const edges = (timeline?.['edges'] as unknown[]) ?? []
    const totalViews = edges.reduce((sum, e) => {
      const node = (e as Record<string, unknown>)?.['node'] as Record<string, unknown>
      return sum + ((node?.['video_view_count'] as number) ?? 0)
    }, 0)

    return {
      username:    (user['username'] as string) ?? clean,
      followers:   (user['edge_followed_by'] as Record<string, number>)?.['count'] ?? 0,
      following:   (user['edge_follow'] as Record<string, number>)?.['count'] ?? 0,
      posts:       (timeline?.['count'] as number) ?? 0,
      total_views: totalViews,
      bio:         (user['biography'] as string) ?? '',
    }
  } catch {
    return null
  }
}
