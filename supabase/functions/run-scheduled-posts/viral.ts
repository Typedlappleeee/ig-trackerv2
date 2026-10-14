// Veille des Reels viraux : relève les derniers Reels des comptes surveillés
// (HikerAPI, repli RapidAPI via ig-provider) et calcule le score « au-dessus de
// la normale » = vues / médiane des vues du compte.
// Déployée automatiquement par .github/workflows/deploy-functions.yml (push sur main,
// secret GitHub SUPABASE_ACCESS_TOKEN requis).
import { igReels, igFeed } from './ig-provider.ts'
import { deepArray } from './ig-rapidapi.ts'
import { hikerGet } from './ig-hikerapi.ts'

export { scoreReels, isIgCdn, lastParisNoon, type ScoredReel } from './viral-score.ts'
import { parseMedia, scoreBy, lastParisNoon, type ParsedMedia } from './viral-score.ts'

type WatchRow = { id: string; username: string }

/** Relève UN compte (Reels + feed) et écrit le résultat pour chaque ligne qui le suit
 *  (un même @ peut être suivi par la Sélection ScaleFlow et par une agence : 1 seul appel). */
// deno-lint-ignore no-explicit-any
export async function refreshAccount(db: any, username: string, rows: WatchRow[]): Promise<{ ok: boolean; n: number; error?: string }> {
  const nowIso = new Date().toISOString()
  const ids = rows.map(r => r.id)
  try {
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
  let accounts = 0, reels = 0
  for (const [username, rows] of groups) {
    if (Date.now() > deadline) break
    const r = await refreshAccount(db, username, rows)
    accounts++; reels += r.n
  }
  const { count } = await due(db.from('viral_watch').select('id', { count: 'exact', head: true }))
  return { accounts, reels, remaining: count ?? 0 }
}

// Détail d'un Reel à la demande (fiche) : URL vidéo fraîche (les liens CDN expirent),
// légende et stats à jour. HikerAPI /v1/media/by/code, repli /v1/media/by/url.
export interface ReelMedia { videoUrl: string | null; caption: string; duration: number; views: number; likes: number; comments: number; thumb: string | null }
export async function reelMedia(code: string): Promise<ReelMedia | null> {
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(code)) return null
  // deno-lint-ignore no-explicit-any
  let m: any = await hikerGet('/v1/media/by/code', { code })
  if (!m || typeof m !== 'object') m = await hikerGet('/v1/media/by/url', { url: `https://www.instagram.com/reel/${code}/` })
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
  }
}
