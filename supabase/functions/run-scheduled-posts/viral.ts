// Veille des Reels viraux : relève les derniers Reels des comptes surveillés
// (HikerAPI, repli RapidAPI via ig-provider) et calcule le score « au-dessus de
// la normale » = vues / médiane des vues du compte.
// Déployée automatiquement par .github/workflows/deploy-functions.yml (push sur main,
// secret GitHub SUPABASE_ACCESS_TOKEN requis).
import { igReels } from './ig-provider.ts'
import { parseReels } from './ig-rapidapi.ts'
import { hikerGet } from './ig-hikerapi.ts'

export { scoreReels, isIgCdn, type ScoredReel } from './viral-score.ts'
import { scoreReels } from './viral-score.ts'

// deno-lint-ignore no-explicit-any
export async function refreshWatch(db: any, w: { id: string; username: string }): Promise<{ ok: boolean; n: number; error?: string }> {
  const nowIso = new Date().toISOString()
  try {
    const reels = scoreReels(parseReels(await igReels(w.username), 12))
    if (!reels.length) {
      await db.from('viral_watch').update({ fetched_at: nowIso, last_error: 'Aucun Reel récupéré (compte privé, introuvable, ou clé HikerAPI manquante)' }).eq('id', w.id)
      return { ok: false, n: 0, error: 'aucun reel' }
    }
    const rows = reels.map(r => ({ watch_id: w.id, code: r.code, username: w.username, views: r.views, likes: r.likes, comments: r.comments, taken_at: r.postedAt, thumb: r.thumb, url: r.url, baseline: r.baseline, score: r.score, fetched_at: nowIso }))
    const { error } = await db.from('viral_reels').upsert(rows, { onConflict: 'watch_id,code' })
    await db.from('viral_watch').update({ fetched_at: nowIso, last_error: error ? error.message : null }).eq('id', w.id)
    return { ok: !error, n: rows.length, error: error?.message }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.from('viral_watch').update({ fetched_at: nowIso, last_error: msg }).eq('id', w.id)
    return { ok: false, n: 0, error: msg }
  }
}

/** Relève les comptes pas relevés depuis `minAgeMs` (20 h par défaut), dans le budget.
 *  `userId` : seulement les comptes privés de cet utilisateur (bouton « Actualiser » côté client). */
// deno-lint-ignore no-explicit-any
export async function runViralWatch(db: any, deadline: number, o: { userId?: string | null; minAgeMs?: number; max?: number } = {}): Promise<{ accounts: number; reels: number }> {
  const minAge = o.minAgeMs ?? 20 * 3600_000
  let q = db.from('viral_watch').select('id, username').order('fetched_at', { ascending: true, nullsFirst: true }).limit(o.max ?? 40)
  if (o.userId) q = q.eq('user_id', o.userId).eq('scope', 'private')
  if (minAge > 0) q = q.or(`fetched_at.is.null,fetched_at.lt.${new Date(Date.now() - minAge).toISOString()}`)
  const { data } = await q
  let accounts = 0, reels = 0
  for (const w of (data ?? []) as { id: string; username: string }[]) {
    if (Date.now() > deadline) break
    const r = await refreshWatch(db, w)
    accounts++; reels += r.n
  }
  return { accounts, reels }
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
