// Client RapidAPI Instagram — calibré pour l'API `instagram120.p.rapidapi.com`
// (POST + body JSON {username}). Surchargeable via RAPIDAPI_HOST.
// Parsing "deep" tolérant : on retrouve les champs quel que soit l'imbriquage.

export function rapidHost(): string {
  return (Deno.env.get('RAPIDAPI_HOST') ?? '').trim() || 'instagram120.p.rapidapi.com'
}

// POST https://<host>/api/instagram/<endpoint>  body {username, ...extra}
// deno-lint-ignore no-explicit-any
export async function igPost(key: string, endpoint: string, username: string, extra: Record<string, unknown> = {}): Promise<any | null> {
  try {
    const host = rapidHost()
    const r = await fetch(`https://${host}/api/instagram/${endpoint}`, {
      method: 'POST',
      headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.replace(/^@/, ''), ...extra }),
    })
    if (!r.ok) return null
    return await r.json().catch(() => null)
  } catch { return null }
}

// Recherche récursive de la 1ʳᵉ valeur numérique pour une des clés données.
// Gère aussi le motif edge_*: { count: N }.
// deno-lint-ignore no-explicit-any
export function deepNum(obj: any, keys: string[]): number {
  const stack = [obj]; let guard = 0
  while (stack.length && guard++ < 8000) {
    const cur = stack.shift()
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) {
        const v = (cur as Record<string, unknown>)[k]
        if (keys.includes(k)) {
          if (typeof v === 'number' && v >= 0) return v
          if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).count === 'number') return (v as Record<string, number>).count
        }
        if (v && typeof v === 'object') stack.push(v)
      }
    }
  }
  return 0
}

// Premier tableau "intéressant" (items/reels…) trouvé dans la réponse.
// deno-lint-ignore no-explicit-any
export function deepArray(obj: any, keys: string[]): any[] | null {
  const stack = [obj]; let guard = 0
  while (stack.length && guard++ < 8000) {
    const cur = stack.shift()
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) {
        const v = (cur as Record<string, unknown>)[k]
        if (keys.includes(k) && Array.isArray(v) && v.length) return v as unknown[]
        if (v && typeof v === 'object') stack.push(v)
      }
    }
  }
  // Repli : si la racine est déjà un tableau.
  return Array.isArray(obj) ? obj : null
}

// Première valeur SCALAIRE (string/bool/number) pour une des clés.
// deno-lint-ignore no-explicit-any
export function deepVal(obj: any, keys: string[]): unknown {
  const stack = [obj]; let guard = 0
  while (stack.length && guard++ < 8000) {
    const cur = stack.shift()
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) {
        const v = (cur as Record<string, unknown>)[k]
        if (keys.includes(k) && v != null && typeof v !== 'object') return v
        if (v && typeof v === 'object') stack.push(v)
      }
    }
  }
  return null
}
// deno-lint-ignore no-explicit-any
export function deepStr(obj: any, keys: string[]): string { const v = deepVal(obj, keys); return typeof v === 'string' ? v : '' }
// deno-lint-ignore no-explicit-any
export function deepBool(obj: any, keys: string[]): boolean { return deepVal(obj, keys) === true }

export interface ProfileInfo {
  username: string; fullName: string; pp: string
  followers: number; following: number; posts: number
  isPrivate: boolean; isVerified: boolean; bio: string
}

// deno-lint-ignore no-explicit-any
export function parseProfile(j: any): ProfileInfo | null {
  if (!j) return null
  const username  = deepStr(j, ['username'])
  const pp        = deepStr(j, ['profile_pic_url_hd', 'profile_pic_url', 'hd_profile_pic_url_info'])
  const fullName  = deepStr(j, ['full_name'])
  const followers = deepNum(j, ['follower_count', 'followers', 'followers_count', 'edge_followed_by'])
  const following = deepNum(j, ['following_count', 'edge_follow'])
  const posts     = deepNum(j, ['media_count', 'post_count', 'edge_owner_to_timeline_media'])
  const isPrivate = deepBool(j, ['is_private'])
  const isVerified = deepBool(j, ['is_verified'])
  const bio       = deepStr(j, ['biography'])
  if (!username && !followers && !pp) return null
  return { username, fullName, pp, followers, following, posts, isPrivate, isVerified, bio }
}

// Les N derniers reels avec miniature + stats.
// deno-lint-ignore no-explicit-any
export function parseReels(j: any, limit = 15): ReelInfo[] {
  const items = deepArray(j, ['items', 'reels', 'edges', 'data']) ?? []
  return items.slice(0, limit).map(reelInfo).filter(r => r.thumb || r.views || r.postedAt)
}

// deno-lint-ignore no-explicit-any
export function parseInfo(j: any): { followers: number; following: number; posts: number } | null {
  if (!j) return null
  const followers = deepNum(j, ['follower_count', 'followers', 'followers_count', 'edge_followed_by'])
  const following = deepNum(j, ['following_count', 'following', 'edge_follow'])
  const posts     = deepNum(j, ['media_count', 'post_count', 'posts', 'edge_owner_to_timeline_media'])
  if (!followers && !following && !posts) return null
  return { followers, following, posts }
}

export interface ReelInfo { postedAt: string | null; views: number; likes: number; comments: number; url: string | null; thumb: string | null }

// Recherche robuste d'un timestamp de publication dans l'objet média, quel que
// soit le nom exact du champ (taken_at, created_time, date ISO…).
// deno-lint-ignore no-explicit-any
function findTimestampMs(n: any): number {
  const toMs = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v > 1.3e9 && v < 2e10) return v * 1000        // secondes
      if (v > 1.3e12 && v < 2e13) return v              // millisecondes
    }
    if (typeof v === 'string') {
      const asNum = Number(v)
      if (Number.isFinite(asNum)) { const m = toMs(asNum); if (m) return m }
      const p = Date.parse(v); if (p) return p           // date ISO
    }
    return 0
  }
  // 1) champs connus directs
  for (const k of ['taken_at', 'taken_at_timestamp', 'device_timestamp', 'created_at', 'created_time', 'publish_date', 'date']) {
    const m = toMs(n?.[k]); if (m) return m
  }
  // 2) recherche profonde sur les clés "date-ish"
  const stack = [n]; let guard = 0
  while (stack.length && guard++ < 3000) {
    const cur = stack.shift()
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) {
        const v = (cur as Record<string, unknown>)[k]
        if (/taken|created|publish|timestamp|date|time/i.test(k)) { const m = toMs(v); if (m) return m }
        if (v && typeof v === 'object') stack.push(v)
      }
    }
  }
  return 0
}

// deno-lint-ignore no-explicit-any
export function reelInfo(reel: any): ReelInfo {
  // instagram120 reels : result.edges[].node.media → on déballe node.media.
  const n = reel?.node?.media ?? reel?.media ?? reel?.node ?? reel ?? {}
  const tsMs = findTimestampMs(n)
  const num = (...v: unknown[]) => { for (const x of v) { const k = Number(x); if (Number.isFinite(k) && k > 0) return k } return 0 }
  const code = n.code ?? n.shortcode ?? n.pk ?? null
  const thumb = n.thumbnail_url ?? n?.image_versions2?.candidates?.[0]?.url ?? n?.image_versions?.items?.[0]?.url ?? n.display_url ?? null
  return {
    postedAt: tsMs ? new Date(tsMs).toISOString() : null,
    views:    num(n.play_count, n.view_count, n.ig_play_count, n.video_view_count, n.views),
    likes:    num(n.like_count, n.likes),
    comments: num(n.comment_count, n.comments),
    url:      code ? `https://www.instagram.com/reel/${code}/` : null,
    thumb:    thumb ?? null,
  }
}
