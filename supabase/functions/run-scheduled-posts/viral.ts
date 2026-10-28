// Veille des Reels viraux : relève les derniers Reels des comptes surveillés
// (HikerAPI, repli RapidAPI via ig-provider) et calcule le score « au-dessus de
// la normale » = vues / médiane des vues du compte.
// Déployée automatiquement par .github/workflows/deploy-functions.yml (push sur main,
// secret GitHub SUPABASE_ACCESS_TOKEN requis).
import { igReels, igFeed, igProfileHiker } from './ig-provider.ts'
import { deepArray } from './ig-rapidapi.ts'
import { hikerGet } from './ig-hikerapi.ts'

export { scoreReels, isIgCdn, lastParisNoon, type ScoredReel } from './viral-score.ts'
import { parseMedia, scoreBy, lastParisNoon, parseProfile, thumbPath, avatarPath, isCachedImage, VIRAL_BUCKET, type ParsedMedia, type ProfileInfo } from './viral-score.ts'

type WatchRow = { id: string; username: string }

async function mapLimit<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]) }))
}

// Copie une image Instagram dans le bucket PUBLIC « viral » → lien permanent (les liens CDN
// Instagram expirent en quelques jours : miniatures noires). Bucket créé au premier besoin.
// Renvoie l'URL publique, ou null (l'appelant garde alors le lien Instagram).
let bucketChecked = false
// deno-lint-ignore no-explicit-any
export async function cacheImage(db: any, src: string | null | undefined, path: string | null): Promise<string | null> {
  if (!src || !path) return null
  if (isCachedImage(src)) return src
  try {
    const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.instagram.com/' } })
    if (!r.ok) return null
    const bytes = new Uint8Array(await r.arrayBuffer())
    if (bytes.length < 200) return null
    const contentType = r.headers.get('content-type') ?? 'image/jpeg'
    const up = () => db.storage.from(VIRAL_BUCKET).upload(path, bytes, { contentType, upsert: true, cacheControl: '31536000' })
    let { error } = await up()
    if (error && !bucketChecked) {
      bucketChecked = true
      await db.storage.createBucket(VIRAL_BUCKET, { public: true }).catch(() => null)
      ;({ error } = await up())
    }
    if (error) return null
    return db.storage.from(VIRAL_BUCKET).getPublicUrl(path).data.publicUrl as string
  } catch { return null }
}

/** Relève UN compte (Reels + feed) et écrit le résultat pour chaque ligne qui le suit
 *  (un même @ peut être suivi par la Sélection ScaleFlow et par une agence : 1 seul appel). */
// deno-lint-ignore no-explicit-any
export async function refreshAccount(db: any, username: string, rows: WatchRow[]): Promise<{ ok: boolean; n: number; error?: string }> {
  const nowIso = new Date().toISOString()
  const ids = rows.map(r => r.id)
  try {
    // Profil d'abord (photo, bio, abonnés) : son pk sert ensuite aux Reels et au feed, sans appel de plus.
    try {
      const prof = parseProfile(await igProfileHiker(username))
      if (prof) { prof.profile_pic = (await cacheImage(db, prof.profile_pic, avatarPath(username))) ?? prof.profile_pic; await saveProfile(db, ids, prof) }
    } catch { /* profil facultatif */ }
    const rawReels = deepArray(await igReels(username), ['items', 'reels', 'edges', 'data']) ?? []
    const reels = scoreBy(rawReels.slice(0, 15).map(m => parseMedia(m, 'reel')).filter((x): x is ParsedMedia => !!x), x => x.views)
    let feed: (ParsedMedia & { baseline: number; score: number })[] = []
    try {
      const rawFeed = (await igFeed(username)) ?? []
      feed = scoreBy(rawFeed.slice(0, 18).map(m => parseMedia(m)).filter((x): x is ParsedMedia => !!x && x.kind === 'feed'), x => x.likes)
    } catch { /* feed indisponible : on garde les Reels */ }
    if (!reels.length && !feed.length) {
      await db.from('viral_watch').update({ fetched_at: nowIso, last_error: 'Aucun Reel récupéré (compte privé, introuvable, ou clé HikerAPI manquante)' }).in('id', ids)
      return { ok: false, n: 0, error: 'aucun reel' }
    }
    const all = [...reels, ...feed]
    // Miniatures copiées chez nous (une seule fois par Reel) : plus de tuiles noires quand le
    // lien Instagram expire. En cas d'échec, on garde le lien Instagram.
    const known = new Map<string, string>()
    try {
      const { data: ex } = await db.from('viral_reels').select('code, thumb').in('code', all.map(r => r.code))
      for (const x of (ex ?? []) as { code: string; thumb: string | null }[]) if (x.thumb && isCachedImage(x.thumb)) known.set(x.code, x.thumb)
    } catch { /* table absente : on copie tout */ }
    await mapLimit(all, 6, async r => { r.thumb = known.get(r.code) ?? (await cacheImage(db, r.thumb, thumbPath(r.code))) ?? r.thumb })
    const full = rows.flatMap(w => all.map(r => ({
      watch_id: w.id, code: r.code, username, kind: r.kind, views: r.views, likes: r.likes, comments: r.comments, taken_at: r.postedAt,
      thumb: r.thumb, url: r.url, baseline: r.baseline, score: r.score, fetched_at: nowIso,
      video_url: r.videoUrl, caption: r.caption || null, duration: r.duration || null, images: r.images.length ? r.images : null,
    })))
    let { error } = await db.from('viral_reels').upsert(full, { onConflict: 'watch_id,code' })
    if (error && /column|schema cache/i.test(error.message)) {
      // SQL 20261016 pas encore passé : on écrit seulement les Reels, sans les nouvelles colonnes.
      const legacy = full.filter(r => r.kind === 'reel').map(({ kind: _k, video_url: _v, caption: _c, duration: _d, images: _i, ...rest }) => rest)
      ;({ error } = await db.from('viral_reels').upsert(legacy, { onConflict: 'watch_id,code' }))
    }
    await db.from('viral_watch').update({ fetched_at: nowIso, last_error: error ? error.message : null }).in('id', ids)
    return { ok: !error, n: all.length, error: error?.message }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.from('viral_watch').update({ fetched_at: nowIso, last_error: msg }).in('id', ids)
    return { ok: false, n: 0, error: msg }
  }
}
// deno-lint-ignore no-explicit-any
async function saveProfile(db: any, ids: string[], p: ProfileInfo): Promise<void> {
  const { error } = await db.from('viral_watch').update({ ...p, profile_at: new Date().toISOString() }).in('id', ids)
  if (error && !/column|schema cache/i.test(error.message)) throw new Error(error.message)
}

/** Profil d'un compte suivi, à la demande (page profil) : stocké, re-relevé au plus toutes les 6 h. */
// deno-lint-ignore no-explicit-any
export async function accountProfile(db: any, username: string): Promise<(ProfileInfo & { profile_at: string | null }) | null> {
  const u = username.toLowerCase().replace(/^@/, '')
  if (!/^[a-z0-9._]{1,30}$/.test(u)) return null
  const { data: rows } = await db.from('viral_watch').select('*').eq('username', u)
  if (!rows?.length) return null                      // uniquement des comptes suivis (coût HikerAPI maîtrisé)
  const r0 = rows[0]
  if (r0.profile_at && Date.now() - Date.parse(r0.profile_at) < 6 * 3600_000) return { ...(parseProfile({ username: u, ...r0, profile_pic_url: r0.profile_pic, follower_count: r0.followers, following_count: r0.following }) as ProfileInfo), profile_at: r0.profile_at }
  const prof = parseProfile(await igProfileHiker(u))
  if (!prof) return null
  prof.profile_pic = (await cacheImage(db, prof.profile_pic, avatarPath(u))) ?? prof.profile_pic
  try { await saveProfile(db, rows.map((x: { id: string }) => x.id), prof) } catch { /* colonnes absentes : renvoyé quand même */ }
  return { ...prof, profile_at: new Date().toISOString() }
}

/** Compat : relève une seule ligne. */
// deno-lint-ignore no-explicit-any
export function refreshWatch(db: any, w: WatchRow) { return refreshAccount(db, w.username, [w]) }

/** Relève les comptes « dus » (jamais relevés ou relevés avant `before`), regroupés par @,
 *  dans le budget. `userId` : seulement les comptes privés de cet utilisateur / de son équipe.
 *  Renvoie aussi le nombre de lignes encore dues (le client relance tant qu'il en reste). */
// deno-lint-ignore no-explicit-any
export async function runViralWatch(db: any, deadline: number, o: { userId?: string | null; orgId?: string | null; before?: string; max?: number } = {}): Promise<{ accounts: number; reels: number; remaining: number }> {
  const before = o.before ?? lastParisNoon().toISOString()
  // deno-lint-ignore no-explicit-any
  const due = (q: any) => {
    q = q.or(`fetched_at.is.null,fetched_at.lt.${before}`)
    if (o.userId) q = o.orgId ? q.eq('scope', 'private').eq('org_id', o.orgId) : q.eq('scope', 'private').eq('user_id', o.userId).is('org_id', null)
    return q
  }
  const { data } = await due(db.from('viral_watch').select('id, username')).order('fetched_at', { ascending: true, nullsFirst: true }).limit(o.max ?? 400)
  const groups = new Map<string, WatchRow[]>()
  for (const w of (data ?? []) as WatchRow[]) {
    const k = w.username.toLowerCase().replace(/^@/, '')
    groups.set(k, [...(groups.get(k) ?? []), w])
  }
  // 3 comptes relevés en parallèle (avant : un seul à la fois → relevé de midi trop lent).
  let accounts = 0, reels = 0
  await mapLimit([...groups], 3, async ([username, rows]) => {
    if (Date.now() > deadline) return
    const r = await refreshAccount(db, username, rows)
    accounts++; reels += r.n
  })
  const { count } = await due(db.from('viral_watch').select('id', { count: 'exact', head: true }))
  return { accounts, reels, remaining: count ?? 0 }
}

// Détail d'un Reel à la demande (fiche) : URL vidéo fraîche (les liens CDN expirent),
// légende et stats à jour. HikerAPI /v1/media/by/code, repli /v1/media/by/url.
export interface ReelMedia { videoUrl: string | null; caption: string; duration: number; views: number; likes: number; comments: number; thumb: string | null; images: string[] }
export async function reelMedia(code: string): Promise<ReelMedia | null> {
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(code)) return null
  // deno-lint-ignore no-explicit-any
  let m: any = await hikerGet('/v1/media/by/code', { code })
  if (!m || typeof m !== 'object') m = await hikerGet('/v1/media/by/url', { url: `https://www.instagram.com/p/${code}/` })
  if (!m || typeof m !== 'object') return null
  const n = (...v: unknown[]) => { for (const x of v) { const k = Number(x); if (Number.isFinite(k) && k > 0) return k } return 0 }
  return {
    videoUrl: m.video_url ?? m?.video_versions?.[0]?.url ?? null,
    caption: String(m.caption_text ?? m?.caption?.text ?? ''),
    duration: n(m.video_duration),
    views: n(m.play_count, m.view_count, m.ig_play_count),
    likes: n(m.like_count),
    comments: n(m.comment_count),
    thumb: m.thumbnail_url ?? m?.image_versions2?.candidates?.[0]?.url ?? null,
    // Slides d'un carrousel (fiche du feed).
    images: parseMedia(m, 'feed')?.images ?? [],
  }
}

// Image morte (lien Instagram expiré, déjà enregistré) : on en récupère une fraîche UNE fois,
// on la copie dans le bucket et on met à jour la ligne → le lien ne meurt plus. Uniquement pour
// des Reels / comptes réellement suivis (pas d'appels HikerAPI pour n'importe quoi).
const healTried = new Map<string, number>()
// deno-lint-ignore no-explicit-any
export async function healImage(db: any, o: { code?: string | null; user?: string | null }): Promise<string | null> {
  const key = o.code ? `c:${o.code}` : `u:${o.user}`
  if (Date.now() - (healTried.get(key) ?? 0) < 3600_000) return null   // un essai par heure et par image
  healTried.set(key, Date.now())
  if (o.code) {
    const path = thumbPath(o.code); if (!path) return null
    const { data } = await db.from('viral_reels').select('thumb').eq('code', o.code).limit(1)
    if (!data?.length) return null
    if (isCachedImage(data[0].thumb)) return data[0].thumb
    const m = await reelMedia(o.code)
    const url = await cacheImage(db, m?.thumb ?? null, path)
    if (url) await db.from('viral_reels').update({ thumb: url }).eq('code', o.code)
    return url
  }
  const path = avatarPath(o.user); if (!path) return null
  const u = (o.user ?? '').toLowerCase().replace(/^@/, '')
  const { data } = await db.from('viral_watch').select('profile_pic').eq('username', u)
  if (!data?.length) return null
  const done = (data as { profile_pic: string | null }[]).find(x => isCachedImage(x.profile_pic))
  if (done) return done.profile_pic
  const prof = parseProfile(await igProfileHiker(u))
  const url = await cacheImage(db, prof?.profile_pic ?? null, path)
  if (url) await db.from('viral_watch').update({ profile_pic: url, profile_at: new Date().toISOString() }).eq('username', u)
  return url
}
