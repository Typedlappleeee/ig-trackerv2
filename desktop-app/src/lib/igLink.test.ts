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
