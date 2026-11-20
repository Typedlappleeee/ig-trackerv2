// Profils Instagram des comptes iRemoTech (onglet « Comptes » de ScaleFlow) : photo, abonnés, abonnements,
// publications. iRemoTech ne les expose pas dans son API → HikerAPI, avec un cache de 6 h (table
// irt_ig_profiles, service-role seulement) pour maîtriser le coût ; photo copiée dans le bucket « viral ».
import { igProfileHiker } from './ig-provider.ts'
import { parseProfile, avatarPath, isCachedImage } from './viral-score.ts'
import { cacheImage } from './viral.ts'

const TTL = 6 * 3600_000
export interface IrtProfile { username: string; full_name: string | null; profile_pic: string | null; followers: number | null; following: number | null; media_count: number | null; is_verified: boolean; at: string }

// deno-lint-ignore no-explicit-any
export async function irtProfiles(db: any, usernames: unknown[], force = false): Promise<Record<string, IrtProfile | null>> {
  const list = [...new Set(usernames.map(u => String(u ?? '').toLowerCase().replace(/^@/, '').trim()).filter(u => /^[a-z0-9._]{1,30}$/.test(u)))].slice(0, 30)
  const out: Record<string, IrtProfile | null> = {}
  let cached: Record<string, { data: IrtProfile; updated_at: string }> = {}
  try {
    const { data } = await db.from('irt_ig_profiles').select('username, data, updated_at').in('username', list)
    for (const r of data ?? []) cached[r.username] = r
  } catch { cached = {} } // table pas encore créée : pas de cache
  const todo: string[] = []
  for (const u of list) {
    const c = cached[u]
    if (c && !force && Date.now() - Date.parse(c.updated_at) < TTL) out[u] = c.data
    else todo.push(u)
  }
  // 3 en parallèle (HikerAPI)
  for (let i = 0; i < todo.length; i += 3) {
    await Promise.all(todo.slice(i, i + 3).map(async u => {
      const p = parseProfile(await igProfileHiker(u).catch(() => null))
      if (!p) { out[u] = cached[u]?.data ?? null; return }
      const pic = p.profile_pic && !isCachedImage(p.profile_pic) ? (await cacheImage(db, p.profile_pic, avatarPath(u)).catch(() => null)) ?? p.profile_pic : p.profile_pic
      const prof: IrtProfile = { username: u, full_name: p.full_name, profile_pic: pic, followers: p.followers, following: p.following, media_count: p.media_count, is_verified: p.is_verified, at: new Date().toISOString() }
      out[u] = prof
      try { await db.from('irt_ig_profiles').upsert({ username: u, data: prof, updated_at: prof.at }) } catch { /* pas de table */ }
    }))
  }
  return out
}
