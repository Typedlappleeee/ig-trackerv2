import { describe, it, expect } from 'vitest'
import { splitCtas, validCta } from './ctaMarkets'

describe('textes CTA de Story', () => {
  it('découpe la réponse (numéros, guillemets) et vérifie les consignes', () => {
    expect(splitCtas('1. seule ce soir ❤️\n2) « je m’ennuie.. 💕 »\n- schreib mir 💗')).toEqual(['seule ce soir ❤️', 'je m’ennuie.. 💕', 'schreib mir 💗'])
    expect(validCta('seule ce soir ❤️')).toBe(true)
    expect(validCta('leistest du mir Gesellschaft? ❤️💕')).toBe(true)
    expect(validCta('salut, ça va ❤️')).toBe(false)        // virgule
    expect(validCta('clique sur le lien ❤️')).toBe(false)  // pub
    expect(validCta('seule ce soir')).toBe(false)          // pas d'emoji
    expect(validCta('moi ❤️')).toBe(false)                 // 1 mot
    expect(validCta('je suis vraiment toute seule ce soir ❤️')).toBe(false) // 7 mots
  })
})
