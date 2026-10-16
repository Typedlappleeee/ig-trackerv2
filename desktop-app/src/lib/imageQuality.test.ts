import { describe, it, expect } from 'vitest'
import { analyzePixels, isClean, igExpired, MIN_SHARP } from './imageQuality'

// Image RGBA w×h à partir d'une fonction de luminance (0–255).
const img = (w: number, h: number, f: (x: number, y: number) => number) => {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 }
  return d
}
const W = 120, H = 214

describe('analyzePixels', () => {
  it('détails fins (sujet net) → netteté élevée', () => {
    const s = analyzePixels(img(W, H, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? 200 : 60), W, H)
    expect(s.sharp).toBeGreaterThan(MIN_SHARP * 10)
    expect(s.bars).toBe(false)
  })
  it('dégradé lisse (image floue) → netteté quasi nulle', () => {
    const s = analyzePixels(img(W, H, (x, y) => 40 + (x + y) * 0.5), W, H)
    expect(s.sharp).toBeLessThan(5)
  })
  it('portrait au fond flou : seule une zone nette suffit', () => {
    const s = analyzePixels(img(W, H, (x, y) => x > 40 && x < 80 && y > 40 && y < 110 ? (((x >> 1) + (y >> 1)) % 2 ? 190 : 70) : 120), W, H)
    expect(s.sharp).toBeGreaterThan(MIN_SHARP)
  })
  it('bandes noires en haut et en bas (repost paysage) détectées', () => {
    const s = analyzePixels(img(W, H, (x, y) => y < 40 || y > H - 40 ? 0 : ((x + y) % 2 ? 200 : 60)), W, H)
    expect(s.bars).toBe(true)
  })
  it('luminance et contraste', () => {
    const s = analyzePixels(img(W, H, () => 100), W, H)
    expect(s.luma).toBeCloseTo(100, 0)
    expect(s.contrast).toBeLessThan(1)
  })
})

describe('isClean', () => {
  const ok = { sharp: 800, luma: 110, contrast: 55, bars: false, w: 640, h: 1136 }
  it('accepte une miniature nette', () => expect(isClean(ok)).toBe(true))
  it('refuse floue, petite, sombre, paysage ou à bandes', () => {
    expect(isClean({ ...ok, sharp: 90 })).toBe(false)
    expect(isClean({ ...ok, w: 240, h: 426 })).toBe(false)
    expect(isClean({ ...ok, luma: 20 })).toBe(false)
    expect(isClean({ ...ok, h: 480 })).toBe(false)
    expect(isClean({ ...ok, bars: true })).toBe(false)
    expect(isClean({ ...ok, contrast: 12 })).toBe(false)
  })
})

describe('igExpired', () => {
  const now = Date.UTC(2026, 9, 16)
  const hex = (ms: number) => Math.floor(ms / 1000).toString(16).toUpperCase()
  it('lien Instagram expiré → true, valide → false, sans oe → false', () => {
    expect(igExpired(`https://scontent.cdninstagram.com/v/x.jpg?stp=1&oe=${hex(now - 86400_000)}&_nc=1`, now)).toBe(true)
    expect(igExpired(`https://scontent.cdninstagram.com/v/x.jpg?oe=${hex(now + 3 * 86400_000)}`, now)).toBe(false)
    expect(igExpired('https://scontent.cdninstagram.com/v/x.jpg', now)).toBe(false)
  })
  it('lit le lien Instagram à travers le proxy (?img=)', () => {
    const ig = `https://scontent.cdninstagram.com/v/x.jpg?oe=${hex(now - 1000)}`
    expect(igExpired(`https://p.supabase.co/functions/v1/x?img=${encodeURIComponent(ig)}`, now)).toBe(true)
  })
})
