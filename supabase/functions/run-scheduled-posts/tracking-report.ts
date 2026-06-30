// Sync journalier des comptes pour le dashboard "Aujourd'hui".
//
// Appelé chaque minute par le cron. Une fois passée l'heure de sync configurée
// (heure de Paris, déf. 12:00), traite les comptes PAR LOTS (anti-timeout) :
//   - GRATUIT : "a posté aujourd'hui ?" via l'historique de posting ScaleFlow.
//   - OPTIONNEL (si clé API) : la vidéo + vues/likes/commentaires via une API
//     Instagram type RapidAPI (1 requête/compte/jour).
// Résultat stocké dans account_daily (1 ligne par compte/jour), lu par l'app.
//
// Scalable à 1000+ comptes : cap par invocation + reprise au tick suivant.
// Best-effort : ne jette jamais (ne casse pas le cron).

interface TrackingConfig {
  enabled?: boolean
  sync_time?: string        // "12:00" (heure de Paris)
  window_hours?: number     // (compat) non utilisé pour le dashboard journalier
  rapidapi_key?: string
  rapidapi_url?: string     // doit contenir {username}
  force_run?: string        // ISO : "lancer maintenant" déclenché par un admin
}

// Un "force_run" récent (< 90 min) rend le sync éligible hors de l'heure prévue,
// et force la re-synchro des comptes traités AVANT ce timestamp (refresh).
function isForced(cfg: TrackingConfig, now: Date): boolean {
  return !!cfg.force_run && (now.getTime() - new Date(cfg.force_run).getTime()) < 90 * 60 * 1000
}

import { igPost, deepArray, reelInfo, type ReelInfo } from './ig-rapidapi.ts'

const MAX_PER_INVOCATION = 60   // comptes traités par passage (≈ 1 tick / minute)

function parisDate(d: Date): string {
  // "YYYY-MM-DD" en heure de Paris (fr-CA donne ce format).
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
}
function parisHHMM(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false })
}

async function fetchLatestReel(cfg: TrackingConfig, username: string): Promise<ReelInfo | null> {
  if (!cfg.rapidapi_key) return null
  const j = await igPost(cfg.rapidapi_key, 'reels', username, { maxId: '' })
  const items = deepArray(j, ['items', 'reels', 'edges', 'data'])
  if (!items || !items.length) return null
  let best = reelInfo(items[0])
  for (const it of items) { const s = reelInfo(it); if ((s.postedAt ?? '') > (best.postedAt ?? '')) best = s }
  return best
}

// deno-lint-ignore no-explicit-any
export async function runAccountSync(db: any, nowIso: string, deadlineMs: number): Promise<number> {
  let synced = 0
  try {
    const now = new Date(nowIso)
    const today = parisDate(now)
    const hhmm = parisHHMM(now)

    // Propriétaires avec tracking activé dont l'heure de sync est passée.
    // deno-lint-ignore no-explicit-any
    const owners: { user_id: string | null; org_id: string | null; cfg: TrackingConfig }[] = []
    const eligible = (cfg: TrackingConfig) => cfg.enabled && (hhmm >= (cfg.sync_time || '12:00') || isForced(cfg, now))
    const { data: apps } = await db.from('app_config').select('user_id, tracking_config').not('tracking_config', 'is', null)
    for (const a of (apps ?? [])) {
      const cfg = (a.tracking_config ?? {}) as TrackingConfig
      if (eligible(cfg)) owners.push({ user_id: a.user_id, org_id: null, cfg })
    }
    const { data: orgs } = await db.from('org_config').select('org_id, tracking_config').not('tracking_config', 'is', null)
    for (const o of (orgs ?? [])) {
      const cfg = (o.tracking_config ?? {}) as TrackingConfig
      if (eligible(cfg)) owners.push({ user_id: null, org_id: o.org_id, cfg })
    }
    if (!owners.length) return 0

    // Clé/URL globales agence (secret serveur) → fallback si pas définies par owner.
    // Aucun client n'a à coller quoi que ce soit : on met RAPIDAPI_KEY une seule fois.
    const envKey = (Deno.env.get('RAPIDAPI_KEY') ?? '').trim()

    const startOfDayIso = new Date(`${today}T00:00:00+02:00`).toISOString()

    for (const owner of owners) {
      if (synced >= MAX_PER_INVOCATION || Date.now() > deadlineMs) break
      try {
        // Clé effective : réglage du propriétaire sinon secret serveur RAPIDAPI_KEY.
        const effCfg: TrackingConfig = {
          ...owner.cfg,
          rapidapi_key: owner.cfg.rapidapi_key || envKey,
        }
        // Comptes du propriétaire.
        let pq = db.from('phones').select('id, geelark_id, ig_username, group_name').not('ig_username', 'is', null)
        pq = owner.org_id ? pq.eq('org_id', owner.org_id) : pq.eq('user_id', owner.user_id).is('org_id', null)
        const { data: phones } = await pq
        if (!phones || !phones.length) continue

        // Déjà synchronisés aujourd'hui ? (reprise par lots)
        // Si "force_run" : on ne compte "fait" que les comptes synchronisés APRÈS
        // le clic → ceux d'avant sont re-synchronisés (refresh immédiat).
        let dq = db.from('account_daily').select('phone_id').eq('day', today).not('synced_at', 'is', null)
        dq = owner.org_id ? dq.eq('org_id', owner.org_id) : dq.eq('user_id', owner.user_id)
        if (isForced(owner.cfg, now)) dq = dq.gte('synced_at', owner.cfg.force_run as string)
        const { data: doneRows } = await dq
        const doneSet = new Set((doneRows ?? []).map((r: { phone_id: string }) => r.phone_id))
        const pending = phones.filter((p: { id: string }) => !doneSet.has(p.id))
        if (!pending.length) continue

        // Historique ScaleFlow du jour (posté via l'app) — gratuit, fiable.
        let sq = db.from('scheduled_posts').select('phones').eq('status', 'done').gte('executed_at', startOfDayIso)
        sq = owner.org_id ? sq.eq('org_id', owner.org_id) : sq.eq('user_id', owner.user_id)
        const { data: donePosts } = await sq
        const postedGeelark = new Set<string>()
        for (const p of (donePosts ?? [])) {
          for (const ph of (Array.isArray(p.phones) ? p.phones : [])) { if (ph?.geelark_id) postedGeelark.add(String(ph.geelark_id)) }
        }

        for (const ph of pending) {
          if (synced >= MAX_PER_INVOCATION || Date.now() > deadlineMs) break
          const username = String(ph.ig_username)
          const va = (ph.group_name && String(ph.group_name).trim()) || 'Sans groupe'
          let posted = false, posted_via: string | null = null, posted_at: string | null = null
          let views: number | null = null, likes: number | null = null, comments: number | null = null
          let reel_url: string | null = null, reel_thumb: string | null = null

          // On stocke TOUJOURS la dernière vidéo + ses stats (pour afficher la
          // perf de chaque compte), et on marque "posté aujourd'hui" en plus si
          // le dernier reel date d'aujourd'hui.
          const reel = await fetchLatestReel(effCfg, username)
          if (reel) {
            views = reel.views; likes = reel.likes; comments = reel.comments
            reel_url = reel.url; reel_thumb = reel.thumb
            if (reel.postedAt && parisDate(new Date(reel.postedAt)) === today) {
              posted = true; posted_via = 'instagram'; posted_at = reel.postedAt
            }
          }
          // Niveau gratuit : posté via ScaleFlow aujourd'hui.
          if (!posted && postedGeelark.has(String(ph.geelark_id))) { posted = true; posted_via = 'scaleflow' }

          const row = {
            user_id: owner.user_id, org_id: owner.org_id, phone_id: ph.id, ig_username: username, va, day: today,
            posted, posted_via, posted_at, views, likes, comments, reel_url, reel_thumb,
            synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }
          // Upsert manuel (l'index unique est sur une expression → pas d'onConflict PostgREST).
          let eq = db.from('account_daily').select('id').eq('phone_id', ph.id).eq('day', today)
          eq = owner.org_id ? eq.eq('org_id', owner.org_id) : eq.eq('user_id', owner.user_id)
          const { data: ex } = await eq.maybeSingle()
          if (ex?.id) await db.from('account_daily').update(row).eq('id', ex.id)
          else await db.from('account_daily').insert(row)
          synced++
        }
      } catch { /* propriétaire suivant */ }
    }
  } catch { /* best-effort */ }
  return synced
}
