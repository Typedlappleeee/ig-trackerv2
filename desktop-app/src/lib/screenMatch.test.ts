import { describe, it, expect } from 'vitest'
import { findGalleryThumbPx, signaturePx, findMatchingCellPx, type Px } from './screenMatch'

type RGB = [number, number, number]
const W = 390, H = 844
function canvas(bg: (x: number, y: number) => RGB): Px {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = bg(x, y); const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255 }
  return { data, width: W, height: H }
}
function fill(p: Px, x0: number, y0: number, w: number, h: number, f: (x: number, y: number) => RGB) {
  for (let y = Math.round(y0); y < y0 + h; y++) for (let x = Math.round(x0); x < x0 + w; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const [r, g, b] = f(x, y); const i = (y * W + x) * 4; p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b
  }
}
// Médias : motif défini sur le carré central [0,1]² (u,v hors bornes = prolongé).
const clamp = (t: number) => Math.min(1, Math.max(0, t))
const media = {
  latest: (u: number, v: number): RGB => [Math.round(40 + 180 * clamp(u)), Math.round(200 * clamp(v)), clamp(u) + clamp(v) > 1 ? 210 : 60],
  older: (u: number, v: number): RGB => [clamp(v) < 0.5 ? 220 : 30, 120, Math.round(255 * clamp(u))],
  other: (u: number, v: number): RGB => [90, Math.round(255 * clamp(u * v)), 150],
  dark: (u: number, v: number): RGB => [Math.round(30 + 40 * clamp(u)), 30, Math.round(30 + 40 * clamp(v))],
}
const camBg = (_x: number, y: number): RGB => [Math.round(190 - y * 0.12), Math.round(170 - y * 0.12), Math.round(160 - y * 0.12)]

// Caméra Story : vignette 32 px à bordure blanche 2 px (bas-gauche), déclencheur rond blanc,
// bulle d'effet, bouton « retourner » blanc à droite.
function storyCamera(withThumb = true, m = media.latest): Px {
  const p = canvas(camBg)
  if (withThumb) {
    const s = 32, x0 = 42 - s / 2, y0 = 786 - s / 2
    fill(p, x0, y0, s, s, () => [255, 255, 255])
    fill(p, x0 + 2, y0 + 2, s - 4, s - 4, (x, y) => m((x - x0 - 2) / (s - 4), (y - y0 - 2) / (s - 4)))
  }
  fill(p, 75, 770, 220, 32, () => [70, 66, 66])                      // barre d'effet « pretty »
  for (const [cx, cy, r] of [[195, 700, 34], [350, 786, 17]] as const)  // déclencheur + retourner
    fill(p, cx - r, cy - r, 2 * r, 2 * r, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r + 3) < 3 ? [255, 255, 255] : [p.data[(y * W + x) * 4], p.data[(y * W + x) * 4 + 1], p.data[(y * W + x) * 4 + 2]] as RGB)
  return p
}
// Galerie : rangée de raccourcis (gris) puis grille 3 colonnes de cases portrait.
function gallery(cells: ((u: number, v: number) => RGB)[]): Px {
  const p = canvas(() => [12, 12, 14])
  for (let c = 0; c < 3; c++) fill(p, 10 + c * 128, 110, 116, 120, () => [58, 58, 62])
  const cw = 130, ch = 230
  cells.forEach((m, i) => {
    const col = i % 3, row = Math.floor(i / 3)
    const x0 = col * cw, y0 = 270 + row * ch
    const side = cw - 2, sy = y0 + (ch - side) / 2                       // carré central de la case
    fill(p, x0 + 1, y0 + 1, cw - 2, ch - 2, (x, y) => m((x - x0 - 1) / side, (y - sy) / side))
  })
  return p
}

describe('Caméra Story : vignette de galerie (bas-gauche)', () => {
  it('trouvée au centre, malgré le déclencheur, la bulle d’effet et le bouton retourner', () => {
    const b = findGalleryThumbPx(storyCamera())!
    expect(b).not.toBeNull()
    expect(Math.abs(b.cx - 42)).toBeLessThanOrEqual(3)
    expect(Math.abs(b.cy - 786)).toBeLessThanOrEqual(3)
  })
  it('pas de vignette → null (aucun faux positif)', () => {
    expect(findGalleryThumbPx(storyCamera(false))).toBeNull()
    expect(findGalleryThumbPx(canvas(() => [250, 250, 250]))).toBeNull()   // écran blanc
  })
})

describe('Galerie : la vidéo la plus récente (celle de la vignette)', () => {
  const sig = () => { const cam = storyCamera(); return signaturePx(cam, findGalleryThumbPx(cam)!) }
  it('case du même média, même avec des raccourcis au-dessus et la vidéo pas en 1re case', () => {
    const hit = findMatchingCellPx(gallery([media.other, media.latest, media.older, media.dark, media.other, media.older]), sig())!
    expect(hit).not.toBeNull()
    expect(Math.abs(hit.cx - 195)).toBeLessThan(10)              // 2e colonne
    expect(Math.abs(hit.cy - 385)).toBeLessThan(40)              // 1re rangée
  })
  it('média présent deux fois → la case la plus haute / à gauche (la plus récente)', () => {
    const hit = findMatchingCellPx(gallery([media.latest, media.other, media.older, media.dark, media.latest, media.other]), sig())!
    expect(Math.abs(hit.cx - 65)).toBeLessThan(10)
    expect(Math.abs(hit.cy - 385)).toBeLessThan(40)
  })
  it('aucun média ressemblant → null (on garde la position connue)', () => {
    expect(findMatchingCellPx(gallery([media.older, media.other, media.older, media.other]), sig())).toBeNull()
  })
})
