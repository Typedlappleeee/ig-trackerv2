// Fournisseur des données Instagram (stats, reels) : HikerAPI en principal si le
// secret HIKERAPI_KEY existe, RapidAPI (instagram120) en secours automatique —
// si l'un ne répond pas, l'autre prend le relais. Les deux renvoient du JSON brut
// lu par les mêmes parseurs tolérants (parseProfile / parseReels / reelInfo).
import { igPost, deepArray } from './ig-rapidapi.ts'
import { hikerKey, hikerProfile, hikerReels } from './ig-hikerapi.ts'

export function rapidKey(): string { return (Deno.env.get('RAPIDAPI_KEY') ?? '').trim() }

/** Au moins un fournisseur configuré (ou une clé RapidAPI propre au client). */
export function hasIgProvider(customRapidKey = ''): boolean {
  return !!(hikerKey() || customRapidKey || rapidKey())
}

// L'id Instagram (pk) lu sur le profil HikerAPI sert à récupérer les reels sans
// requête supplémentaire (cache le temps de l'invocation).
const pkCache = new Map<string, string>()
const norm = (u: string) => u.replace(/^@/, '').trim().toLowerCase()

// deno-lint-ignore no-explicit-any
export async function igProfile(username: string, customRapidKey = ''): Promise<any | null> {
  if (hikerKey()) {
    const j = await hikerProfile(username)
    if (j) { if (j.pk) pkCache.set(norm(username), String(j.pk)); return j }
  }
  const key = customRapidKey || rapidKey()
  if (!key) return null
  const j = await igPost(key, 'profile', username)
  if (j) return j
  return igPost(key, 'userInfo', username)
}

// deno-lint-ignore no-explicit-any
export async function igReels(username: string, customRapidKey = ''): Promise<any | null> {
  if (hikerKey()) {
    let pk = pkCache.get(norm(username))
    if (!pk) { const p = await hikerProfile(username); if (p?.pk) { pk = String(p.pk); pkCache.set(norm(username), pk) } }
    const j = pk ? await hikerReels(pk) : null
    if (j && (deepArray(j, ['items'])?.length ?? 0) > 0) return j
  }
  const key = customRapidKey || rapidKey()
  if (!key) return null
  return igPost(key, 'reels', username, { maxId: '' })
}
