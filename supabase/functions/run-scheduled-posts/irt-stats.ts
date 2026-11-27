// iRemoTech › Résultats : stats Instagram (HikerAPI) des comptes des iPhones — abonnés, Reels publiés ces 24 h et leurs
// vues, Reels ≥ 5 000 vues en 48 h, Story en ligne (avec lien ?). 3 requêtes HikerAPI par compte, 8 comptes par appel.
import { hikerGet, hikerProfile, hikerReels } from './ig-hikerapi.ts'

const num = (...v: unknown[]) => { for (const x of v) { const k = Number(x); if (x !== null && x !== '' && Number.isFinite(k) && k >= 0) return k } return null }
const ts = (v: unknown) => { if (v == null) return 0; const n = Number(v); if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000; const d = Date.parse(String(v)); return Number.isFinite(d) ? d : 0 }

// deno-lint-ignore no-explicit-any
export async function irtStats(usernames: unknown[]): Promise<Record<string, any>> {
  const list = [...new Set(usernames.map(u => String(u ?? '').toLowerCase().replace(/^@/, '').trim()).filter(u => /^[a-z0-9._]{1,30}$/.test(u)))].slice(0, 8)
  const now = Date.now()
  // deno-lint-ignore no-explicit-any
  const out: Record<string, any> = {}
  await Promise.all(list.map(async u => {
    try {
      const x = await hikerProfile(u)
      if (!x) { out[u] = { username: u, missing: true, at: new Date().toISOString() }; return }
      const pk = String(x.pk ?? x.id ?? '')
      const [clips, stories] = await Promise.all([pk ? hikerReels(pk) : null, pk ? hikerGet('/v1/user/stories', { user_id: pk }) : null])
      // deno-lint-ignore no-explicit-any
      const reels = ((clips?.items ?? []) as any[]).map(m => ({ code: String(m.code ?? ''), at: ts(m.taken_at ?? m.taken_at_ts), views: num(m.play_count, m.view_count, m.ig_play_count) ?? 0 })).filter(r => r.code && r.at)
      const d24 = reels.filter(r => now - r.at <= 24 * 3600_000), d48 = reels.filter(r => now - r.at <= 48 * 3600_000)
      // deno-lint-ignore no-explicit-any
      const st: any[] = Array.isArray(stories) ? stories : Array.isArray(stories?.items) ? stories.items : []
      const hasLink = st.some(s => (Array.isArray(s.links) && s.links.length) || (Array.isArray(s.story_link_stickers) && s.story_link_stickers.length)
        // deno-lint-ignore no-explicit-any
        || (Array.isArray(s.stickers) && s.stickers.some((k: any) => /link/i.test(String(k?.type ?? k?.extra?.type ?? '')))))
      out[u] = {
        username: u, followers: num(x.follower_count), following: num(x.following_count), media: num(x.media_count),
        reels24: d24.length, views24: d24.reduce((n, r) => n + r.views, 0),
        viral48: d48.filter(r => r.views >= 5000).sort((a, b) => b.views - a.views).slice(0, 3),
        topReel: reels.slice().sort((a, b) => b.views - a.views)[0] ?? null,
        story: st.length > 0, storyLink: hasLink, at: new Date().toISOString(),
      }
    } catch { out[u] = null }
  }))
  return out
}
