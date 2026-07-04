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

import { igPost, parseProfile, parseReels } from './ig-rapidapi.ts'
import { notifyOwner } from './notify.ts'

const STALE_HOURS = 22
const MAX_PER_INVOCATION = 40

// deno-lint-ignore no-explicit-any
export async function runStatsSync(db: any, nowIso: string, deadlineMs: number): Promise<number> {
  let done = 0
  try {
    const key = (Deno.env.get('RAPIDAPI_KEY') ?? '').trim()
    if (!key) return 0   // pas de clé → on laisse le poller client gérer

    const now = new Date(nowIso)
    const staleBefore = new Date(now.getTime() - STALE_HOURS * 3600_000).toISOString()

    // Comptes à suivre.
    const { data: phones } = await db.from('phones')
      .select('id, user_id, org_id, ig_username, total_views, account_state')
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
      const username = String(p.ig_username)
      // Profil (pp + compteurs) : `profile` puis repli `userInfo`.
      let prof = parseProfile(await igPost(key, 'profile', username))
      if (!prof) prof = parseProfile(await igPost(key, 'userInfo', username))
      // Reels : dernier post + heuristique de portée.
      const reels = parseReels(await igPost(key, 'reels', username, { maxId: '' }), 15)
      const lastPost = reels.reduce<string | null>((m, r) => (r.postedAt && (!m || r.postedAt > m)) ? r.postedAt : m, null)
      const avgViews = reels.length ? Math.round(reels.reduce((s, r) => s + r.views, 0) / reels.length) : 0

      // Statut du compte — PRUDENT : on ne marque "banni" QUE si on a une vraie
      // réponse vide. Si l'appel API a échoué (quota/429, réseau), prof ET reels
      // sont null → on NE TOUCHE PAS account_state (sinon faux "banni" en masse).
      const apiFailed = !prof && reels.length === 0
      const shadow = !!(prof && prof.followers > 200 && avgViews > 0 && avgViews < prof.followers * 0.05)
      // Si on a au moins un profil OU des reels → compte vivant → ok/shadow.
      const account_state = prof || reels.length ? (shadow ? 'shadow' : 'ok') : null

      // Si l'API a échoué, on saute ce compte SANS rien écraser (ni stats ni statut).
      if (apiFailed) { done++; continue }

      // Mise à jour phones (résilient si les nouvelles colonnes n'existent pas).
      const baseUpd: Record<string, unknown> = prof
        ? { followers: prof.followers, following: prof.following, video_count: prof.posts }
        : {}
      const fullUpd: Record<string, unknown> = { ...baseUpd, last_post_at: lastPost }
      if (prof?.pp) fullUpd.pp_url = prof.pp
      if (account_state) fullUpd.account_state = account_state
      let { error: uErr } = await db.from('phones').update(fullUpd).eq('id', p.id)
      if (uErr && /pp_url|last_post_at|account_state/.test(uErr.message || '')) {
        if (Object.keys(baseUpd).length) await db.from('phones').update(baseUpd).eq('id', p.id)
      }

      // Alerte : le compte VIENT de passer en shadowban/banni (transition depuis
      // un état sain). On ne notifie qu'à la bascule, pas à chaque sync.
      if ((account_state === 'shadow' || account_state === 'banned')
          && p.account_state !== 'shadow' && p.account_state !== 'banned') {
        await notifyOwner(db, { userId: p.user_id, orgId: p.org_id },
          'account_flagged',
          account_state === 'shadow' ? '🚫 Compte en shadowban' : '⛔ Compte bloqué',
          account_state === 'shadow'
            ? `Le compte @${username} semble en shadowban (vues effondrées). Vérifie-le et lève le pied sur les posts.`
            : `Le compte @${username} ne répond plus (probable blocage). Vérifie-le avant de continuer à poster dessus.`)
      }

      if (prof) {
        await db.from('account_stats_history').insert({
          user_id: p.user_id, org_id: p.org_id, phone_id: p.id,
          followers: prof.followers, following: prof.following, posts: prof.posts,
          total_views: Number(p.total_views) || 0, recorded_at: now.toISOString(),
        })
      }
      done++
    }
  } catch { /* best-effort */ }
  return done
}
