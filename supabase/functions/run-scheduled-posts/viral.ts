// Veille des Reels viraux : relève les derniers Reels des comptes surveillés
// (HikerAPI, repli RapidAPI via ig-provider) et calcule le score « au-dessus de
// la normale » = vues / médiane des vues du compte.
import { igReels } from './ig-provider.ts'
import { parseReels } from './ig-rapidapi.ts'

export { scoreReels, type ScoredReel } from './viral-score.ts'
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

/** Relève les comptes pas relevés depuis 20 h (ou ceux d'un utilisateur, sur demande), dans le budget. */
// deno-lint-ignore no-explicit-any
export async function runViralWatch(db: any, deadline: number, userId: string | null = null, force = false): Promise<{ accounts: number; reels: number }> {
  let q = db.from('viral_watch').select('id, username').order('fetched_at', { ascending: true, nullsFirst: true }).limit(userId ? 300 : 40)
  if (userId) q = q.eq('user_id', userId)
  if (!force) q = q.or(`fetched_at.is.null,fetched_at.lt.${new Date(Date.now() - 20 * 3600_000).toISOString()}`)
  const { data } = await q
  let accounts = 0, reels = 0
  for (const w of (data ?? []) as { id: string; username: string }[]) {
    if (Date.now() > deadline) break
    const r = await refreshWatch(db, w)
    accounts++; reels += r.n
  }
  return { accounts, reels }
}
