// Génération des rapports de tracking « VA posting ».
//
// Appelé chaque minute par le cron. Aux heures configurées (fuseau Europe/Paris),
// pour chaque propriétaire (org ou user) ayant activé le tracking :
//   1. on liste ses comptes (phones avec ig_username),
//   2. on vérifie sur Instagram (API RapidAPI) si un Reel a été posté dans le
//      créneau + on récupère vues/likes/commentaires,
//   3. on croise avec l'historique de posting de ScaleFlow (scheduled_posts),
//   4. on enregistre un rapport groupé par VA (group_name) dans tracking_reports.
//
// Best-effort : ne jette jamais (ne doit pas casser le cron).

interface TrackingConfig {
  enabled?: boolean
  times?: string[]          // ["09:30","20:00"] en heure de Paris
  window_hours?: number     // ancienneté max d'un Reel pour compter "posté" (défaut 14)
  rapidapi_key?: string
  rapidapi_url?: string     // doit contenir {username}
}

interface AccountResult {
  username: string
  va: string
  status: 'posted' | 'not_posted'
  source: 'instagram' | 'scaleflow' | 'none'
  posted_at: string | null
  views: number | null
  likes: number | null
  comments: number | null
}

function parisParts(nowIso: string): { hhmm: string; dateLabel: string } {
  const d = new Date(nowIso)
  const hhmm = d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false })
  const dateLabel = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: 'long' })
  return { hhmm, dateLabel }
}

// deno-lint-ignore no-explicit-any
function pickItems(j: any): any[] | null {
  const c = j?.data?.items ?? j?.items ?? j?.data?.reels ?? j?.reels ?? (Array.isArray(j?.data) ? j.data : null) ?? (Array.isArray(j) ? j : null)
  return Array.isArray(c) ? c : null
}

// deno-lint-ignore no-explicit-any
function reelStats(reel: any): { postedAt: string | null; views: number; likes: number; comments: number } {
  const n = reel?.media ?? reel?.node ?? reel ?? {}
  const tsRaw = Number(n.taken_at ?? n.taken_at_timestamp ?? n.device_timestamp ?? n?.caption?.created_at ?? n.created_at ?? 0)
  const tsMs = tsRaw > 1e12 ? tsRaw : tsRaw * 1000
  const num = (...v: unknown[]) => { for (const x of v) { const k = Number(x); if (Number.isFinite(k) && k > 0) return k } return 0 }
  return {
    postedAt: tsRaw ? new Date(tsMs).toISOString() : null,
    views:    num(n.play_count, n.view_count, n.ig_play_count, n.video_view_count, n.views),
    likes:    num(n.like_count, n.likes),
    comments: num(n.comment_count, n.comments),
  }
}

async function fetchLatestReel(cfg: TrackingConfig, username: string): Promise<ReturnType<typeof reelStats> | null> {
  if (!cfg.rapidapi_key || !cfg.rapidapi_url || !cfg.rapidapi_url.includes('{username}')) return null
  try {
    const url = cfg.rapidapi_url.replace('{username}', encodeURIComponent(username))
    const host = new URL(url).host
    const r = await fetch(url, { headers: { 'x-rapidapi-key': cfg.rapidapi_key, 'x-rapidapi-host': host } })
    if (!r.ok) return null
    const j = await r.json().catch(() => null)
    const items = pickItems(j)
    if (!items || !items.length) return null
    // Reel le plus récent (par timestamp).
    let best = reelStats(items[0])
    for (const it of items) {
      const s = reelStats(it)
      if ((s.postedAt ?? '') > (best.postedAt ?? '')) best = s
    }
    return best
  } catch { return null }
}

// deno-lint-ignore no-explicit-any
export async function runTrackingReports(db: any, nowIso: string): Promise<number> {
  let generated = 0
  try {
    const { hhmm, dateLabel } = parisParts(nowIso)

    // Configs actives (user + org).
    // deno-lint-ignore no-explicit-any
    const owners: { user_id: string | null; org_id: string | null; cfg: TrackingConfig }[] = []
    const { data: apps } = await db.from('app_config').select('user_id, tracking_config').not('tracking_config', 'is', null)
    for (const a of (apps ?? [])) {
      const cfg = (a.tracking_config ?? {}) as TrackingConfig
      if (cfg.enabled && Array.isArray(cfg.times) && cfg.times.includes(hhmm)) owners.push({ user_id: a.user_id, org_id: null, cfg })
    }
    const { data: orgs } = await db.from('org_config').select('org_id, tracking_config').not('tracking_config', 'is', null)
    for (const o of (orgs ?? [])) {
      const cfg = (o.tracking_config ?? {}) as TrackingConfig
      if (cfg.enabled && Array.isArray(cfg.times) && cfg.times.includes(hhmm)) owners.push({ user_id: null, org_id: o.org_id, cfg })
    }
    if (!owners.length) return 0

    const periodEnd = new Date(nowIso)
    for (const owner of owners) {
      try {
        const windowH = Math.max(1, Number(owner.cfg.window_hours) || 14)
        const periodStart = new Date(periodEnd.getTime() - windowH * 3600_000)

        // Comptes du propriétaire.
        let pq = db.from('phones').select('geelark_id, ig_username, group_name').not('ig_username', 'is', null)
        pq = owner.org_id ? pq.eq('org_id', owner.org_id) : pq.eq('user_id', owner.user_id).is('org_id', null)
        const { data: phones } = await pq
        if (!phones || !phones.length) continue

        // Historique ScaleFlow : posts "done" exécutés dans le créneau.
        let sq = db.from('scheduled_posts').select('phones, executed_at, status').eq('status', 'done').gte('executed_at', periodStart.toISOString())
        sq = owner.org_id ? sq.eq('org_id', owner.org_id) : sq.eq('user_id', owner.user_id)
        const { data: donePosts } = await sq
        const doneGeelark = new Set<string>()
        for (const p of (donePosts ?? [])) {
          const arr = Array.isArray(p.phones) ? p.phones : []
          for (const ph of arr) { if (ph?.geelark_id) doneGeelark.add(String(ph.geelark_id)) }
        }

        // Évaluation par compte.
        const results: AccountResult[] = []
        for (const ph of phones) {
          const username = String(ph.ig_username)
          const va = (ph.group_name && String(ph.group_name).trim()) || 'Sans groupe'
          let status: AccountResult['status'] = 'not_posted'
          let source: AccountResult['source'] = 'none'
          let posted_at: string | null = null
          let views: number | null = null, likes: number | null = null, comments: number | null = null

          // 1) Instagram réel.
          const reel = await fetchLatestReel(owner.cfg, username)
          if (reel && reel.postedAt && new Date(reel.postedAt) >= periodStart) {
            status = 'posted'; source = 'instagram'; posted_at = reel.postedAt
            views = reel.views; likes = reel.likes; comments = reel.comments
          } else if (doneGeelark.has(String(ph.geelark_id))) {
            // 2) Repli : ScaleFlow a posté pour ce compte dans le créneau.
            status = 'posted'; source = 'scaleflow'
          }
          results.push({ username, va, status, source, posted_at, views, likes, comments })
        }

        // Groupement par VA.
        const vaMap = new Map<string, AccountResult[]>()
        for (const r of results) { const l = vaMap.get(r.va) ?? []; l.push(r); vaMap.set(r.va, l) }
        const vas = [...vaMap.entries()].map(([name, accounts]) => ({
          name,
          posted: accounts.filter(a => a.status === 'posted').length,
          total: accounts.length,
          accounts,
        })).sort((a, b) => a.name.localeCompare(b.name))

        const posted = results.filter(r => r.status === 'posted').length
        const period = hhmm < '13:00' ? 'Matin' : 'Soir'
        const label = `${period} — ${dateLabel} · ${hhmm}`

        const { error } = await db.from('tracking_reports').insert({
          user_id: owner.user_id, org_id: owner.org_id,
          slot: hhmm, label,
          period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(),
          total_accounts: results.length, posted, not_posted: results.length - posted,
          data: { vas, totals: { posted, total: results.length } },
        })
        // L'index unique (propriétaire, slot, jour) évite les doublons → on ignore l'erreur de conflit.
        if (!error) generated++
      } catch { /* compte suivant */ }
    }
  } catch { /* best-effort */ }
  return generated
}
