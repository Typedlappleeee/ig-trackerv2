import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { splitCaptions, countByMarket, DEFAULT_PROMPTS } from './captionMarkets'

describe('descriptions par marché', () => {
  it('réponse de l’IA → descriptions (séparateur ———, lignes gardées)', () => {
    const raw = 'drop a song for me 🎧 #usa #fypage\n———\nok but who else can\'t sleep\n.\n.\n#american #reels #mood\n———\n\nguess my fav color 🌼\n\n#usagirl #explorepage'
    expect(splitCaptions(raw)).toEqual([
      'drop a song for me 🎧 #usa #fypage',
      'ok but who else can\'t sleep\n.\n.\n#american #reels #mood',
      'guess my fav color 🌼\n\n#usagirl #explorepage',
    ])
  })
  it('numérotation parasite retirée', () => {
    expect(splitCaptions('1. coucou vous #france #fyp\n———\n2) bonne nuit 🌙 #fr #reels')).toEqual(['coucou vous #france #fyp', 'bonne nuit 🌙 #fr #reels'])
  })
  it('nombre de descriptions par marché (compte sans marché = défaut)', () => {
    expect(countByMarket(['us', null, 'de', 'us', null], 'fr')).toEqual({ fr: 2, us: 2, de: 1 })
  })
  it('les 3 prompts sont là, avec le séparateur attendu', () => {
    for (const m of ['fr', 'us', 'de'] as const) expect(DEFAULT_PROMPTS[m]).toContain('———')
  })
})
