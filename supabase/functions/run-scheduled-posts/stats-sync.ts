// Sync serveur des stats de comptes (PC éteint).
//
// Appelé chaque minute par le cron. Pour les comptes (phones avec ig_username)
// dont le dernier snapshot date de > STALE_HOURS, récupère followers / following
// / posts via une API Instagram (RapidAPI, clé = secret serveur RAPIDAPI_KEY),
// met à jour `phones` et insère un snapshot dans `account_stats_history`.
//
// → throttle naturel à ~1×/jour/compte (on ne retraite pas un compte tant que
//   son dernier snapshot a < STALE_HOURS). Batché pour tenir 1000+ comptes.
// Best-effort : ne jette jamais, no-op si pas de clé.

const STALE_HOURS = 22
const MAX_PER_INVOCATION = 40
// Endpoint "user info" (public, non secret). Surchargable via RAPIDAPI_INFO_URL.
const DEFAULT_INFO_URL = 'https://instagram-scraper-api2.p.rapidapi.com/v1/info?username_or_id_or_url={username}'

// deno-lint-ignore no-explicit-any
function num(...v: unknown[]): number {
  for (const x of v) { const k = Number(x); if (Number.isFinite(k) && k >= 0) return k }
  return 0
}

// deno-lint-ignore no-explicit-any
function parseInfo(j: any): { followers: number; following: number; posts: number } | null {
  const d = j?.data ?? j?.user ?? j ?? {}
  const followers = num(d.follower_count, d.followers, d.followers_count, d.edge_followed_by?.count)
  const following = num(d.following_count, d.following, d.edge_follow?.count)
  const posts     = num(d.media_count, d.posts, d.post_count, d.edge_owner_to_timeline_media?.count)
  if (!followers && !following && !posts) return null
  return { followers, following, posts }
}

async function fetchInfo(key: string, url: string, username: string): Promise<ReturnType<typeof parseInfo>> {
  try {
    const u = url.replace('{username}', encodeURIComponent(username))
    const host = new URL(u).host
    const r = await fetch(u, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host } })
    if (!r.ok) return null
    return parseInfo(await r.json().catch(() => null))
  } catch { return null }
}

// deno-lint-ignore no-explicit-any
export async function runStatsSync(db: any, nowIso: string, deadlineMs: number): Promise<number> {
  let done = 0
  try {
    const key = (Deno.env.get('RAPIDAPI_KEY') ?? '').trim()
    if (!key) return 0   // pas de clé → on laisse le poller client gérer
    const url = (Deno.env.get('RAPIDAPI_INFO_URL') ?? '').trim() || DEFAULT_INFO_URL

    const now = new Date(nowIso)
    const staleBefore = new Date(now.getTime() - STALE_HOURS * 3600_000).toISOString()

    // Comptes à suivre.
    const { data: phones } = await db.from('phones')
      .select('id, user_id, org_id, ig_username, total_views')
      .not('ig_username', 'is', null)
      .limit(4000)
    if (!phones || !phones.length) return 0

    // Comptes déjà snapshotés récemment → on les saute (throttle ~1×/jour).
    const { data: fresh } = await db.from('account_stats_history')
      .select('phone_id').gte('recorded_at', staleBefore).limit(8000)
    const freshSet = new Set((fresh ?? []).map((r: { phone_id: string }) => r.phone_id))

    const pending = phones.filter((p: { id: string }) => !freshSet.has(p.id))
    if (!pending.length) return 0

    for (const p of pending) {
      if (done >= MAX_PER_INVOCATION || Date.now() > deadlineMs) break
      const info = await fetchInfo(key, url, String(p.ig_username))
      if (!info) continue
      // phones : valeurs live (total_views préservé — l'API info ne le donne pas).
      await db.from('phones').update({
        followers: info.followers, following: info.following, video_count: info.posts,
      }).eq('id', p.id)
      // snapshot historique
      await db.from('account_stats_history').insert({
        user_id: p.user_id, org_id: p.org_id, phone_id: p.id,
        followers: info.followers, following: info.following, posts: info.posts,
        total_views: Number(p.total_views) || 0, recorded_at: now.toISOString(),
      })
      done++
    }
  } catch { /* best-effort */ }
  return done
}
