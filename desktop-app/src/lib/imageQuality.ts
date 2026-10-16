// Qualité d'une miniature de Reel, mesurée dans le navigateur. Critères : définition, netteté
// (variance du laplacien), exposition et contraste, bandes unies en haut et en bas (repost d'une
// vidéo paysage, format mème). Les visuels (Explorer, Studio, tableau de bord) n'affichent ainsi
// que des images propres. analyzePixels est PUR (testé dans imageQuality.test.ts).

export interface ImgStats { sharp: number; luma: number; contrast: number; bars: boolean }
export interface ImgQuality extends ImgStats { w: number; h: number }

/** Largeur d'analyse : proche de la taille d'affichage des vignettes (le flou visible à l'écran). */
export const ANALYZE_W = 240
export const MIN_SRC_W = 320       // en dessous, l'image est étirée → floue
export const MIN_SHARP = 220       // netteté du sujet à ANALYZE_W (calibrée : nette 300–6000, floue 35–250)

/** Statistiques d'une image RGBA (w×h) : netteté, luminance moyenne, contraste, bandes unies. */
export function analyzePixels(data: ArrayLike<number>, w: number, h: number): ImgStats {
  const n = w * h
  const y = new Float32Array(n)
  let sum = 0, sum2 = 0
  for (let i = 0; i < n; i++) {
    const v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    y[i] = v; sum += v; sum2 += v * v
  }
  const luma = sum / n
  const contrast = Math.sqrt(Math.max(0, sum2 / n - luma * luma))
  // Netteté du SUJET : variance du laplacien par carreau de 24 px, moyenne des 12 % de carreaux
  // les plus nets (un portrait au fond flou reste « net », une image floue partout non).
  const T = 24, tiles: number[] = []
  for (let r0 = 1; r0 + T <= h - 1; r0 += T) for (let c0 = 1; c0 + T <= w - 1; c0 += T) {
    let ls = 0, ls2 = 0
    for (let r = r0; r < r0 + T; r++) for (let c = c0; c < c0 + T; c++) {
      const i = r * w + c
      const l = y[i - 1] + y[i + 1] + y[i - w] + y[i + w] - 4 * y[i]
      ls += l; ls2 += l * l
    }
    const lm = ls / (T * T)
    tiles.push(ls2 / (T * T) - lm * lm)
  }
  tiles.sort((a, b) => b - a)
  const top = tiles.slice(0, Math.max(1, Math.round(tiles.length * 0.12)))
  const sharp = tiles.length ? top.reduce((a, b) => a + b, 0) / top.length : 0
  // Bandes unies : les 7 % du haut ET du bas quasi uniformes (noir ou blanc) → vidéo recadrée.
  const band = (r0: number, r1: number) => {
    let s = 0, s2 = 0, k = 0
    for (let r = r0; r < r1; r++) for (let c = 0; c < w; c++) { const v = y[r * w + c]; s += v; s2 += v * v; k++ }
    const mean = s / Math.max(1, k)
    return { mean, sd: Math.sqrt(Math.max(0, s2 / Math.max(1, k) - mean * mean)) }
  }
  const bh = Math.max(1, Math.round(h * 0.07))
  const hi = band(0, bh), lo = band(h - bh, h)
  const flat = (b: { mean: number; sd: number }) => b.sd < 6 && (b.mean < 24 || b.mean > 232)
  return { sharp, luma, contrast, bars: flat(hi) && flat(lo) }
}

/** Image assez propre pour un visuel ? */
export function isClean(q: ImgQuality): boolean {
  return q.w >= MIN_SRC_W && q.h >= q.w && !q.bars && q.sharp >= MIN_SHARP && q.luma >= 38 && q.luma <= 225 && q.contrast >= 28
}

// ── Mesure dans le navigateur (canvas), avec cache localStorage ──────────────
const KEY = 'sf-img-q'
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }
let mem: Record<string, [number, number, number, number, number, number]> | null = null
function store() {
  if (!mem) { try { mem = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {} } catch { mem = {} } }
  return mem!
}
function save() {
  try {
    const m = store(), keys = Object.keys(m)
    if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete m[k]
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch { /* stockage plein ou bloqué : on remesurera */ }
}

/** Lien Instagram expiré (ou qui expire dans l'heure) ? Les miniatures du CDN Instagram portent
 *  leur date d'expiration (`oe=`, secondes en hexadécimal) ; un lien expiré ne charge plus → image
 *  noire. Gère aussi l'URL du proxy (`?img=<url Instagram>`). */
export function igExpired(url: string, now = Date.now()): boolean {
  let u = url
  try { const inner = new URL(url).searchParams.get('img'); if (inner) u = inner } catch { /* URL relative */ }
  const m = u.match(/[?&]oe=([0-9a-fA-F]{6,10})(?:&|$)/)
  if (!m) return false
  return parseInt(m[1], 16) * 1000 < now + 3600_000
}

/** Mesure une image. Ne charge pas → qualité nulle (écartée par isClean, jamais en cache) ;
 *  canvas bloqué → null (gardée). */
export async function measureImage(url: string, timeoutMs = 6000): Promise<ImgQuality | null> {
  const k = hash(url), hit = store()[k]
  if (hit) return { sharp: hit[0], luma: hit[1], contrast: hit[2], bars: !!hit[3], w: hit[4], h: hit[5] }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  const ok = await new Promise<boolean>(res => {
    const t = setTimeout(() => res(false), timeoutMs)
    img.onload = () => { clearTimeout(t); res(true) }
    img.onerror = () => { clearTimeout(t); res(false) }
    img.src = url
  })
  if (!ok || !img.naturalWidth) return { sharp: 0, luma: 0, contrast: 0, bars: false, w: 0, h: 0 }
  try {
    const w = Math.min(ANALYZE_W, img.naturalWidth), h = Math.max(2, Math.round(img.naturalHeight * w / img.naturalWidth))
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    const s = analyzePixels(ctx.getImageData(0, 0, w, h).data, w, h)
    const q: ImgQuality = { ...s, w: img.naturalWidth, h: img.naturalHeight }
    store()[k] = [Math.round(q.sharp), Math.round(q.luma), Math.round(q.contrast), q.bars ? 1 : 0, q.w, q.h]
    return q
  } catch { return null }
}

/** Mesure une liste (n à la fois) ; renvoie les qualités dans le même ordre. */
export async function measureAll(urls: string[], concurrency = 10): Promise<(ImgQuality | null)[]> {
  const out: (ImgQuality | null)[] = new Array(urls.length).fill(null)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) { const i = next++; out[i] = await measureImage(urls[i]) }
  }))
  save()
  return out
}
