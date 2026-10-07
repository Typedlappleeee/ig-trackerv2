// Client HikerAPI (https://api.hikerapi.com, éditeur d'instagrapi) — données
// Instagram publiques, payées à la requête réussie. Clé = secret serveur
// HIKERAPI_KEY (en-tête x-access-key), jamais dans le code.

const BASE = 'https://api.hikerapi.com'

export function hikerKey(): string {
  return (Deno.env.get('HIKERAPI_KEY') ?? '').trim()
}

// GET avec timeout 15 s et une relance sur 429 / 5xx / réseau. null si échec.
// deno-lint-ignore no-explicit-any
export async function hikerGet(path: string, params: Record<string, string>, key = hikerKey()): Promise<any | null> {
  if (!key) return null
  const url = `${BASE}${path}?${new URLSearchParams(params)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'x-access-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      if (r.ok) return await r.json().catch(() => null)
      if (r.status !== 429 && r.status < 500) return null      // 404 (compte inexistant), 403 (clé/solde)…
    } catch { /* réseau / timeout → relance */ }
    if (attempt === 0) await new Promise(res => setTimeout(res, 1500))
  }
  return null
}

// Profil : objet User (pk, username, follower_count, following_count, media_count,
// profile_pic_url_hd, biography, is_private, is_verified…).
// deno-lint-ignore no-explicit-any
export async function hikerProfile(username: string): Promise<any | null> {
  const j = await hikerGet('/v1/user/by/username', { username: username.replace(/^@/, '') })
  return j && typeof j === 'object' && !Array.isArray(j) && (j.pk || j.username) ? j : null
}

// Reels : /v1/user/clips/chunk renvoie [ [Media…], curseur ] → normalisé en { items }.
// deno-lint-ignore no-explicit-any
export async function hikerReels(userId: string): Promise<any | null> {
  if (!userId) return null
  const j = await hikerGet('/v1/user/clips/chunk', { user_id: userId })
  if (Array.isArray(j)) {
    const items = Array.isArray(j[0]) ? j[0] : j.filter(x => x && typeof x === 'object' && !Array.isArray(x))
    return { items }
  }
  return j && Array.isArray(j.items) ? j : null
}

// Solde restant (diagnostic).
// deno-lint-ignore no-explicit-any
export function hikerBalance(): Promise<any | null> { return hikerGet('/sys/balance', {}) }
