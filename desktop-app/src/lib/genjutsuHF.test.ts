import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { parseLinks, buildPrompt, isDirectVideo, buildWanPrompt, buildDuoPrompt, pickWanId, estimateCredits } from './genjutsuHF'

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
  it('accepte les liens Instagram collés sans « https:// »', () => {
    expect(parseLinks(`instagram.com/reel/AAA111/
      www.instagram.com/reels/BBB222/?igsh=x
      m.instagram.com/p/CCC333
      lea.modele instagram.com/lea.modele/reel/DDD444/
      instagr.am/p/EEE555/
      https://www.instagram.com/reel/AAA111/`)).toEqual([
      'https://www.instagram.com/reel/AAA111/',
      'https://www.instagram.com/reel/BBB222/',
      'https://www.instagram.com/reel/CCC333/',
      'https://www.instagram.com/reel/DDD444/',
      'https://www.instagram.com/reel/EEE555/',
    ])
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

describe('WAN 3.0 + duo', () => {
  it('prompt universel : garde la tenue de la vidéo, image_1 = corps entier', () => {
    const p = buildWanPrompt({ duo: false, keepText: false, outfit: '' })
    expect(p.startsWith('Video edit of <<<video_1>>>.')).toBe(true)
    expect(p).toContain('<<<image_1>>> defines the character\'s full body')
    expect(p).toContain('she wears exactly the same outfit as the original woman in <<<video_1>>>')
    expect(p).toContain('Clean frame: remove all captions')
    expect(p).toContain('Audio: keep the original audio track.')
    expect(p).not.toContain('<<<image_2>>>')
  })
  it('prompt duo : gauche = image_1, droite = image_2', () => {
    const p = buildWanPrompt({ duo: true, keepText: true, outfit: 'a red bikini' })
    expect(p).toContain('<<<image_2>>> defines the full body of the woman on the right')
    expect(p).toContain('both women wear a red bikini')
    expect(p).toContain('keep the captions and on-screen texts')
    expect(buildDuoPrompt({ keepText: false, outfit: '' })).toContain('woman on the right with @Image 2')
  })
  it('identifiant du modèle WAN lu dans le schéma', () => {
    expect(pickWanId('{"enum":["kling3_0","wan2_6","wan3_0","seedance"]}')).toBe('wan3_0')
    expect(pickWanId('models: wan-3.0, veo3')).toBe('wan-3.0')
    expect(pickWanId('rien')).toBe('wan3_0')
  })
  it('estimation : rien avant la 1re mesure', () => { expect(estimateCredits('wan', '480p')).toBeNull() })
})
