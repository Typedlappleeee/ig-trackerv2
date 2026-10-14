import { describe, it, expect } from 'vitest'
import { remixParams, remixFilter, remixAudioFilter, overlayFilter, concatFilter, captionLines, captionFor } from './studioFilters'

describe('Studio · Remix : vraies variations', () => {
  it('déterministe pour une seed, différent d’une seed à l’autre', () => {
    expect(remixParams(7)).toEqual(remixParams(7))
    expect(remixFilter(remixParams(7))).not.toBe(remixFilter(remixParams(8)))
  })
  it('reste dans les bornes de l’intensité', () => {
    for (let s = 1; s < 200; s++) {
      const p = remixParams(s, 'subtle')
      expect(p.zoom).toBeGreaterThanOrEqual(1.01); expect(p.zoom).toBeLessThanOrEqual(1.03)
      expect(Math.abs(p.brightness)).toBeLessThanOrEqual(0.025)
      expect(Math.abs(p.hue)).toBeLessThanOrEqual(3)
      expect(Math.abs(p.speed - 1)).toBeLessThanOrEqual(0.0151)
      const q = remixParams(s, 'strong')
      expect(q.zoom).toBeLessThanOrEqual(1.1); expect(Math.abs(q.speed - 1)).toBeLessThanOrEqual(0.0501)
    }
  })
  it('les interrupteurs coupent bien chaque effet', () => {
    const p = remixParams(11, 'normal', { color: false, speed: false, crop: false, mirror: false })
    expect(remixFilter(p)).toBe('scale=trunc(iw/2)*2:trunc(ih/2)*2')
    expect(remixAudioFilter(p)).toBeNull()
    const m = remixParams(11, 'normal', { color: true, speed: true, crop: true, mirror: true })
    const f = remixFilter(m)
    expect(f).toContain('eq=brightness='); expect(f).toContain('hue=h='); expect(f).toContain('hflip'); expect(f).toContain('crop=')
    if (Math.abs(m.speed - 1) > 1e-3) { expect(f).toContain('setpts=PTS/'); expect(remixAudioFilter(m)).toBe(`atempo=${m.speed}`) }
  })
})

describe('Studio · Incrustation : position, taille, durée', () => {
  it('place le centre de l’image au point choisi, largeur en % de 1080', () => {
    const f = overlayFilter({ x: 70, y: 30, sizePct: 35, from: 0, to: null })
    expect(f).toContain('[1:v]scale=378:-1[ov]')
    expect(f).toContain('overlay=x=(W*0.7000)-(w/2):y=(H*0.3000)-(h/2)')
    expect(f).not.toContain('enable')
  })
  it('fenêtre de temps', () => {
    expect(overlayFilter({ x: 50, y: 50, sizePct: 40, from: 1, to: 3 })).toContain(":enable='between(t,1,3)'")
    expect(overlayFilter({ x: 50, y: 50, sizePct: 40, from: 2, to: null })).toContain(":enable='gte(t,2)'")
  })
  it('borne les valeurs absurdes', () => {
    const f = overlayFilter({ x: 140, y: -10, sizePct: 500, from: 0, to: null })
    expect(f).toContain('scale=1080:-1[ov]'); expect(f).toContain('(W*1.0000)'); expect(f).toContain('(H*0.0000)')
  })
})

describe('Studio · Assemblage', () => {
  it('normalise chaque clip puis concatène, avec ou sans son', () => {
    const a = concatFilter(3, true)
    expect(a).toContain('[2:a]aresample=44100'); expect(a.endsWith('[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]')).toBe(true)
    const n = concatFilter(2, false)
    expect(n).not.toContain(':a]'); expect(n.endsWith('[v0][v1]concat=n=2:v=1:a=0[v]')).toBe(true)
    expect(n).toContain('pad=1080:1920')
  })
})

describe('Studio · Légendes réparties', () => {
  it('une par ligne, en boucle (ou au hasard)', () => {
    const l = captionLines(' a \n\nb\n c ')
    expect(l).toEqual(['a', 'b', 'c'])
    expect([0, 1, 2, 3].map(i => captionFor(l, i))).toEqual(['a', 'b', 'c', 'a'])
    expect(captionFor(l, 0, 'random', () => 0.99)).toBe('c')
    expect(captionFor([], 3)).toBe('')
  })
})
