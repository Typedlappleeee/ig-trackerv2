import { describe, expect, it } from 'vitest'
import { reelCodeFrom } from '@/lib/genjutsu'

describe('Genjutsu · liens Instagram', () => {
  it('extrait le code des liens reel / reels / p / tv', () => {
    expect(reelCodeFrom('https://www.instagram.com/reel/DAbC12_xYz/')).toBe('DAbC12_xYz')
    expect(reelCodeFrom('https://instagram.com/reels/DAbC12_xYz?igsh=abc')).toBe('DAbC12_xYz')
    expect(reelCodeFrom('instagram.com/p/C9xYz-12AB/')).toBe('C9xYz-12AB')
    expect(reelCodeFrom('https://www.instagram.com/lea.modele/reel/DAbC12_xYz/')).toBe('DAbC12_xYz')
    expect(reelCodeFrom('https://www.instagram.com/tv/B1234567xy/')).toBe('B1234567xy')
  })
  it('refuse ce qui n’est pas un Reel', () => {
    expect(reelCodeFrom('https://www.instagram.com/lea.modele/')).toBeNull()
    expect(reelCodeFrom('bonjour')).toBeNull()
    expect(reelCodeFrom('nimporte')).toBeNull()
    expect(reelCodeFrom('https://tiktok.com/@x/video/123')).toBeNull()
  })
})
