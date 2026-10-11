// Score « au-dessus de la normale » (pur, sans dépendance Deno : testé côté app).
export interface ReelLike { postedAt: string | null; views: number; likes: number; comments: number; url: string | null; thumb: string | null }
export interface ScoredReel extends ReelLike { code: string; baseline: number; score: number }

/** Pur : médiane des vues du compte et score de chaque Reel. */
export function scoreReels<T extends ReelLike>(reels: T[]): (T & { code: string; baseline: number; score: number })[] {
  const withCode = reels.map(r => ({ ...r, code: (r.url?.match(/\/reel\/([^/]+)/)?.[1]) ?? '' })).filter(r => r.code)
  const v = withCode.map(r => r.views).filter(x => x > 0).sort((a, b) => a - b)
  const median = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)) : 0
  return withCode.map(r => ({ ...r, baseline: median, score: median > 0 ? Math.round((r.views / median) * 100) / 100 : 0 }))
}

/** Seules les vidéos du CDN Instagram / Facebook passent par le proxy. */
export function isIgCdn(u: string): boolean {
  try { const h = new URL(u).hostname; return /^https:$/.test(new URL(u).protocol) && /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(h) } catch { return false }
}
