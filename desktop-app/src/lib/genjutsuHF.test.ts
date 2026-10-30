import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { parseLinks, buildPrompt, isDirectVideo } from './genjutsuHF'

describe('Genjutsu — liens collés', () => {
  it('garde les reels Instagram (normalisés, sans doublon) et les fichiers vidéo', () => {
    const l = parseLinks(`https://www.instagram.com/reel/AbC_1-2/?igsh=xyz
      regarde https://instagram.com/p/AbC_1-2/ et https://www.instagram.com/reels/ZZZ9/
      https://www.instagram.com/someone/ https://cdn.exemple.com/v/clip.mp4?sig=1 https://exemple.com/page`)
    expect(l).toEqual([
      'https://www.instagram.com/reel/AbC_1-2/',
      'https://www.instagram.com/reel/ZZZ9/',
      'https://cdn.exemple.com/v/clip.mp4?sig=1',
      'https://exemple.com/page',
    ])
    expect(isDirectVideo('https://cdn.exemple.com/v/clip.mp4?sig=1')).toBe(true)
    expect(isDirectVideo('https://exemple.com/page')).toBe(false)
  })
})

describe('Genjutsu — prompt automatique', () => {
  it('par défaut : même mouvement, textes retirés, même tenue', () => {
    const p = buildPrompt({ several: false, who: '', keepText: false, outfit: '' })
    expect(p).toContain('@Video 1')
    expect(p).toContain('Replace the woman with @Image 1')
    expect(p).toContain('Remove the caption texts')
    expect(p).toContain('Keep the same outfit as @Video 1.')
  })
  it('options : laquelle remplacer, textes gardés, autre tenue', () => {
    const p = buildPrompt({ several: true, who: 'on the left', keepText: true, outfit: 'a white dress' })
    expect(p).toContain('Replace the woman on the left with @Image 1')
    expect(p).toContain('Keep every other person')
    expect(p).toContain('Keep the on-screen texts')
    expect(p).not.toContain('Remove the caption texts')
    expect(p).toContain('She wears a white dress.')
  })
})
