// Repères VISUELS (pixels, sans OCR) de la caméra Story d'Instagram sur un iPhone iRemoTech :
//  • la VIGNETTE de galerie en bas-gauche (carré à bordure blanche = dernier média de la
//    pellicule, donc la vidéo qu'on vient d'envoyer) ;
//  • dans la galerie, la CASE qui montre ce même média (signature de couleurs) → on choisit
//    toujours la vidéo la plus récente, quelle que soit la mise en page de la galerie.
// Le cœur travaille sur des pixels bruts (testé) ; les enveloppes lisent une capture (data URL).

export interface Px { data: Uint8ClampedArray | Uint8Array; width: number; height: number }
export interface Box { cx: number; cy: number; size: number }

const light = (d: Px['data'], i: number) => d[i] > 185 && d[i + 1] > 185 && d[i + 2] > 185
  && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) < 40

// Part de pixels clairs sur le contour (carré de côté s centré en cx,cy, décalé de `inset`
// vers l'intérieur ; >0 = dedans, <0 = dehors). Coins ignorés (vignette arrondie).
function ringLight(p: Px, cx: number, cy: number, s: number, inset: number): number {
  const h = s / 2 - inset
  const x0 = Math.round(cx - h), x1 = Math.round(cx + h), y0 = Math.round(cy - h), y1 = Math.round(cy + h)
  if (x0 < 0 || y0 < 0 || x1 >= p.width || y1 >= p.height) return 0
  let n = 0, l = 0
  const a = Math.round(h * 2 * 0.2), b = Math.round(h * 2 * 0.8)
  for (let k = a; k <= b; k += 1) {
    for (const [x, y] of [[x0 + k, y0], [x0 + k, y1], [x0, y0 + k], [x1, y0 + k]]) {
      n++; if (light(p.data, (y * p.width + x) * 4)) l++
    }
  }
  return n ? l / n : 0
}
function areaLight(p: Px, cx: number, cy: number, half: number): number {
  let n = 0, l = 0
  const st = Math.max(1, Math.round(half / 6))
  for (let y = Math.round(cy - half); y <= cy + half; y += st) for (let x = Math.round(cx - half); x <= cx + half; x += st) {
    if (x < 0 || y < 0 || x >= p.width || y >= p.height) continue
    n++; if (light(p.data, (y * p.width + x) * 4)) l++
  }
  return n ? l / n : 1
}

/** Vignette de galerie (bas-gauche) : carré de 7 à 12 % de la largeur, bordure CLAIRE,
 *  intérieur et extérieur non clairs. null si absente. */
export function findGalleryThumbPx(p: Px): Box | null {
  const W = p.width, H = p.height
  const sMin = Math.max(8, Math.round(W * 0.07)), sMax = Math.round(W * 0.125)
  const ds = Math.max(1, Math.round(W / 260))
  let best: (Box & { score: number }) | null = null
  for (let s = sMin; s <= sMax; s += ds) {
    const t = Math.max(1, Math.round(s * 0.035))
    for (let cy = Math.round(H * 0.84 + s / 2); cy <= Math.round(H * 0.995 - s / 2); cy += ds) {
      for (let cx = Math.round(s / 2 + 1); cx <= Math.round(W * 0.25); cx += ds) {
        let ring = 0
        for (let k = 0; k <= t; k++) ring = Math.max(ring, ringLight(p, cx, cy, s, k))
        if (ring < 0.7) continue
        const out = ringLight(p, cx, cy, s, -Math.max(2, t + 2))
        const inner = areaLight(p, cx, cy, s * 0.3)
        if (out > 0.45 || inner > 0.75) continue
        const score = ring - out
        if (!best || score > best.score + 1e-9) best = { cx, cy, size: s, score }
      }
    }
  }
  return best ? { cx: best.cx, cy: best.cy, size: best.size } : null
}

/** Signature 8×8 (RVB moyens) du CENTRE d'un carré (70 % intérieurs : sans la bordure). */
export function signaturePx(p: Px, b: Box): Float32Array {
  const G = 8, half = (b.size * 0.7) / 2
  const out = new Float32Array(G * G * 3)
  const cell = (half * 2) / G
  const st = Math.max(1, cell / 3)
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let r = 0, g = 0, bl = 0, n = 0
    for (let y = b.cy - half + gy * cell; y < b.cy - half + (gy + 1) * cell; y += st) {
      for (let x = b.cx - half + gx * cell; x < b.cx - half + (gx + 1) * cell; x += st) {
        const xi = Math.round(x), yi = Math.round(y)
        if (xi < 0 || yi < 0 || xi >= p.width || yi >= p.height) continue
        const i = (yi * p.width + xi) * 4
        r += p.data[i]; g += p.data[i + 1]; bl += p.data[i + 2]; n++
      }
    }
    const o = (gy * G + gx) * 3
    out[o] = n ? r / n : 0; out[o + 1] = n ? g / n : 0; out[o + 2] = n ? bl / n : 0
  }
  return out
}
const dist = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length }

/** Dans la galerie (grille de 3 colonnes) : la case qui montre le média de la signature.
 *  Parmi les cases quasi identiques, la plus en HAUT puis à GAUCHE (= la plus récente).
 *  null si rien ne ressemble assez. */
export function findMatchingCellPx(p: Px, sig: Float32Array, maxDist = 30): { cx: number; cy: number; dist: number } | null {
  const W = p.width, H = p.height
  const cw = W / 3
  const step = Math.max(1, Math.round(H * 0.006))
  const hits: { col: number; cx: number; cy: number; dist: number }[] = []
  for (let col = 0; col < 3; col++) {
    const cx = Math.round(cw * col + cw / 2)
    for (let cy = Math.round(H * 0.1); cy <= Math.round(H * 0.92); cy += step) {
      hits.push({ col, cx, cy, dist: dist(signaturePx(p, { cx, cy, size: cw * 0.97 }), sig) })
    }
  }
  const dmin = Math.min(...hits.map(h => h.dist))
  if (!isFinite(dmin) || dmin > maxDist) return null
  // Minima locaux quasi aussi bons que le meilleur → le plus haut, puis le plus à gauche.
  const near = hits.filter((h, i) => h.dist <= dmin * 1.2 + 3
    && (hits[i - 1]?.col !== h.col || hits[i - 1].dist >= h.dist)
    && (hits[i + 1]?.col !== h.col || hits[i + 1].dist >= h.dist))
  near.sort((a, b) => (Math.abs(a.cy - b.cy) < cw * 0.5 ? a.col - b.col : a.cy - b.cy))
  const h = near[0] ?? hits.find(x => x.dist === dmin)!
  return { cx: h.cx, cy: h.cy, dist: Math.round(h.dist * 10) / 10 }
}

// ── Enveloppes sur une capture (data URL) : travail à ~390 px de large (rapide), coordonnées
//    renvoyées dans l'espace de la capture d'origine (= celui des taps iRemoTech).
async function pxOf(image: string, maxW = 390): Promise<{ p: Px; k: number } | null> {
  const img = await new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = image })
  if (!img || !img.naturalWidth) return null
  const k = Math.min(1, maxW / img.naturalWidth)
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k))
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h)
  return { p: { data: d.data, width: w, height: h }, k }
}
/** Vignette de galerie sur une capture + sa signature (pour retrouver le média dans la galerie). */
export async function findGalleryThumb(image: string): Promise<(Box & { sig: Float32Array }) | null> {
  const r = await pxOf(image); if (!r) return null
  const b = findGalleryThumbPx(r.p); if (!b) return null
  return { cx: Math.round(b.cx / r.k), cy: Math.round(b.cy / r.k), size: Math.round(b.size / r.k), sig: signaturePx(r.p, b) }
}
export async function findMatchingCell(image: string, sig: Float32Array): Promise<{ cx: number; cy: number; dist: number } | null> {
  const r = await pxOf(image); if (!r) return null
  const m = findMatchingCellPx(r.p, sig); if (!m) return null
  return { cx: Math.round(m.cx / r.k), cy: Math.round(m.cy / r.k), dist: m.dist }
}
