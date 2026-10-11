// Statistiques des liens suivis (tableau de bord façon GetMySocial). Pur, testable.
//   • visite = affichage d'une page de liens OU passage par un lien direct (button = null)
//   • visite avec clic = visite dont au moins un bouton a été cliqué (même visit_id)
//   • taux de clic = visites avec clic / visites de pages (les liens directs n'ont pas de page)
export interface StatClick { link_id: string | null; page_id: string | null; button: number | null; created_at: string; device?: string | null; country?: string | null; visit_id?: string | null }
export interface StatLink { id: string; kind?: string | null; group_id?: string | null }
export type Period = 'today' | '7' | '30'

const DAY = 86400000
export function periodStart(p: Period, now = Date.now()): number {
  if (p === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() }
  return now - Number(p) * DAY
}

export function computeLinkStats(clicks: StatClick[], links: StatLink[], period: Period, now = Date.now()) {
  const from = periodStart(period, now)
  const kindOf = new Map(links.map(l => [l.id, l.kind ?? 'landing']))
  const groupOf = new Map(links.map(l => [l.id, l.group_id ?? null]))
  const inP = clicks.filter(c => { const t = Date.parse(c.created_at); return t >= from && t <= now })
  const visits = inP.filter(c => c.button === null)
  const pageVisits = visits.filter(c => !c.link_id || kindOf.get(c.link_id) !== 'direct')
  const clickedVisits = new Set(inP.filter(c => c.button !== null && c.visit_id).map(c => c.visit_id!))
  const withClicks = pageVisits.filter(c => c.visit_id && clickedVisits.has(c.visit_id)).length
  const ctr = pageVisits.length ? Math.round((withClicks / pageVisits.length) * 1000) / 10 : null

  // Courbe : par heure aujourd'hui, par jour sinon.
  const buckets: { ts: number; visits: number; clicks: number }[] = []
  if (period === 'today') for (let h = 0; h < 24; h++) buckets.push({ ts: from + h * 3600000, visits: 0, clicks: 0 })
  else for (let d = Number(period) - 1; d >= 0; d--) { const x = new Date(now); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - d); buckets.push({ ts: x.getTime(), visits: 0, clicks: 0 }) }
  const step = period === 'today' ? 3600000 : DAY
  for (const c of inP) {
    const t = Date.parse(c.created_at)
    const b = buckets.findIndex((x, i) => t >= x.ts && t < (buckets[i + 1]?.ts ?? x.ts + step))
    if (b >= 0) { if (c.button === null) buckets[b].visits++; else buckets[b].clicks++ }
  }

  // Par lien : visites sur la période, aujourd'hui, tendance 7 jours, taux de clic.
  const today0 = periodStart('today', now)
  const perLink = new Map<string, { visits: number; today: number; trend: number[]; ctr: number | null }>()
  for (const l of links) {
    const mine = clicks.filter(c => c.link_id === l.id)
    const v = mine.filter(c => c.button === null)
    const trend = Array.from({ length: 7 }, (_, i) => { const s = today0 - (6 - i) * DAY; return v.filter(c => { const t = Date.parse(c.created_at); return t >= s && t < s + DAY }).length })
    const vp = v.filter(c => Date.parse(c.created_at) >= from)
    const clickedIds = new Set(mine.filter(c => c.button !== null && c.visit_id).map(c => c.visit_id!))
    const vc = vp.filter(c => c.visit_id && clickedIds.has(c.visit_id)).length
    perLink.set(l.id, { visits: vp.length, today: v.filter(c => Date.parse(c.created_at) >= today0).length, trend, ctr: l.kind === 'direct' || !vp.length ? null : Math.round((vc / vp.length) * 1000) / 10 })
  }

  const byGroup = new Map<string | null, number>()
  for (const c of visits) { const g = c.link_id ? groupOf.get(c.link_id) ?? null : null; byGroup.set(g, (byGroup.get(g) ?? 0) + 1) }

  const countries = new Map<string, number>()
  for (const c of visits) { const k = c.country || '—'; countries.set(k, (countries.get(k) ?? 0) + 1) }

  // En direct : visiteurs des 5 dernières minutes, événements des 30 dernières (par minute).
  const liveNow = new Set(clicks.filter(c => now - Date.parse(c.created_at) < 5 * 60000).map(c => c.visit_id ?? `${c.link_id}-${c.created_at}`)).size
  const perMinute = Array.from({ length: 30 }, (_, i) => { const s = now - (30 - i) * 60000; return clicks.filter(c => { const t = Date.parse(c.created_at); return t >= s && t < s + 60000 }).length })

  return {
    visits: visits.length, withClicks, ctr, buckets, perLink,
    byGroup: [...byGroup.entries()].sort((a, b) => b[1] - a[1]),
    countries: [...countries.entries()].sort((a, b) => b[1] - a[1]),
    liveNow, perMinute,
  }
}
