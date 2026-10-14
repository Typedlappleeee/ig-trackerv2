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

// ── Veille v4 : lecture d'un média Instagram (HikerAPI / instagrapi) — pur et testé ──
export interface ParsedMedia {
  code: string; kind: 'reel' | 'feed'; postedAt: string | null
  views: number; likes: number; comments: number
  thumb: string | null; url: string; videoUrl: string | null; caption: string; duration: number; images: string[]
}
// deno-lint-ignore no-explicit-any
const num = (...v: any[]) => { for (const x of v) { const k = Number(x); if (Number.isFinite(k) && k > 0) return k } return 0 }
// deno-lint-ignore no-explicit-any
function tsOf(n: any): string | null {
  for (const k of ['taken_at', 'taken_at_timestamp', 'device_timestamp', 'created_at']) {
    const v = n?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) { const ms = v > 1.3e12 ? v : v > 1.3e9 ? v * 1000 : 0; if (ms) return new Date(ms).toISOString() }
    if (typeof v === 'string') { const asN = Number(v); if (Number.isFinite(asN) && asN > 1.3e9) return new Date(asN > 1.3e12 ? asN : asN * 1000).toISOString(); const p = Date.parse(v); if (p) return new Date(p).toISOString() }
  }
  return null
}
// deno-lint-ignore no-explicit-any
const imgOf = (n: any): string | null => n?.thumbnail_url ?? n?.image_versions2?.candidates?.[0]?.url ?? n?.image_versions?.items?.[0]?.url ?? n?.display_url ?? n?.thumbnail_src ?? null
/** Un média brut → données utiles. `forceKind` : 'reel' pour les clips, sinon déduit. */
// deno-lint-ignore no-explicit-any
export function parseMedia(raw: any, forceKind?: 'reel' | 'feed'): ParsedMedia | null {
  const n = raw?.node?.media ?? raw?.media ?? raw?.node ?? raw ?? {}
  const code = String(n.code ?? n.shortcode ?? '')
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(code)) return null
  const isVideo = Number(n.media_type) === 2 || !!n.video_url || !!n.video_versions?.length || n.product_type === 'clips'
  const kind: 'reel' | 'feed' = forceKind ?? (isVideo ? 'reel' : 'feed')
  const slides = (n.resources ?? n.carousel_media ?? []) as unknown[]
  const images = (Array.isArray(slides) ? slides : []).map(imgOf).filter((x): x is string => !!x).slice(0, 20)
  const caption = String(n.caption_text ?? n?.caption?.text ?? (typeof n.caption === 'string' ? n.caption : '') ?? '')
  const album = Number(n.media_type) === 8 || n.product_type === 'carousel_container' || Number(n.carousel_media_count) > 1
  return {
    code, kind, postedAt: tsOf(n),
    views: num(n.play_count, n.view_count, n.ig_play_count, n.video_view_count),
    likes: num(n.like_count, n.likes), comments: num(n.comment_count, n.comments),
    thumb: imgOf(n) ?? images[0] ?? null,
    url: `https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${code}/`,
    videoUrl: n.video_url ?? n?.video_versions?.[0]?.url ?? null,
    caption: caption.slice(0, 2200), duration: num(n.video_duration),
    // Carrousel dont les slides ne sont pas fournies (liste « légère ») → [] = à récupérer à l'ouverture.
    images: kind !== 'feed' ? [] : images.length ? images : album ? [] : [imgOf(n)].filter((x): x is string => !!x),
  }
}

/** Score « au-dessus de la normale » sur une métrique (vues pour les Reels, likes pour le feed). */
export function scoreBy<T>(items: T[], metric: (x: T) => number): (T & { baseline: number; score: number })[] {
  const v = items.map(metric).filter(x => x > 0).sort((a, b) => a - b)
  const median = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)) : 0
  return items.map(x => ({ ...x, baseline: median, score: median > 0 ? Math.round((metric(x) / median) * 100) / 100 : 0 }))
}

/** Dernier midi à Paris (12:00 Europe/Paris) avant `now`, en UTC. */
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
