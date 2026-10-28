// Dernier midi à Paris (12:00 Europe/Paris) avant `now`, en UTC. Copie EXACTE de lastParisNoon
// (supabase/functions/run-scheduled-posts/viral-score.ts) : la Veille sait ainsi, côté app, si le
// relevé du jour a eu lieu. Les deux sont comparées dans viral.test.ts.
export function lastParisNoon(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now)
  const g = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const [y, m, d, h] = [g('year'), g('month'), g('day'), g('hour') % 24]
  // Décalage Paris ↔ UTC à cet instant (1 h ou 2 h selon l'heure d'été).
  const asUtc = Date.UTC(y, m - 1, d, h)
  const offsetH = Math.round((asUtc - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())) / 3600_000)
  let noon = Date.UTC(y, m - 1, d, 12 - offsetH)
  if (noon > now.getTime()) noon -= 86400_000
  return new Date(noon)
}
