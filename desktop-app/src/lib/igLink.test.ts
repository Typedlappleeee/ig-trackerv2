import { describe, it, expect } from 'vitest'
import { igCodeFromLink } from './igLink'

describe('lien Instagram → code du post', () => {
  it('Reel, photo, carrousel, TV', () => {
    expect(igCodeFromLink('https://www.instagram.com/reel/DCx1AbC2dEf/?igsh=abc')).toBe('DCx1AbC2dEf')
    expect(igCodeFromLink('https://www.instagram.com/p/C9zz_-12345/')).toBe('C9zz_-12345')
    expect(igCodeFromLink('instagram.com/reels/ABCDE12345')).toBe('ABCDE12345')
    expect(igCodeFromLink('https://www.instagram.com/someuser/p/XyZ12345/')).toBe('XyZ12345')
    expect(igCodeFromLink('https://instagram.com/tv/QWERTY123/')).toBe('QWERTY123')
  })
  it('pas un lien de post → null', () => {
    expect(igCodeFromLink('https://www.instagram.com/someuser/')).toBeNull()
    expect(igCodeFromLink('https://tiktok.com/@x/video/123')).toBeNull()
  })
})

import { igLinksFrom } from './igLink'
import { vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
describe('plusieurs liens collés', () => {
  it('un par ligne, doublons et texte parasite ignorés', () => {
    const t = 'https://www.instagram.com/reel/AAAAA11111/\ninstagram.com/p/BBBBB22222 bonjour https://www.instagram.com/reel/AAAAA11111/?igsh=x'
    expect(igLinksFrom(t)).toEqual(['https://www.instagram.com/reel/AAAAA11111/', 'instagram.com/p/BBBBB22222'])
  })
})
