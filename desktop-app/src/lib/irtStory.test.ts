import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))
import { storyGalleryPick, addLinkScreen, linkStickerPoint, okAboveSettingsLink, iosToggleOn } from './iremotechVision'

// Relevés réels (iPhone 406×720, 21/11/2026, TEST QUENTIN NOJB)
const W = 406, H = 720

describe('Story — galerie « Add to story »', () => {
  it('reconnue (titre + Recents) → 1re rangée sous Recents', () => {
    const words = [{ text: 'Add', cx: 175, cy: 57 }, { text: 'story', cx: 235, cy: 57 }, { text: 'Music', cx: 203, cy: 168 }, { text: 'Recents', cx: 52, cy: 236 }]
    expect(storyGalleryPick(words, W, H)).toEqual({ y: 382, gridTop: 263 })
  })
  it('galerie POST (pas de titre « Add to story » ni Music/Collage) → null', () => {
    expect(storyGalleryPick([{ text: 'New', cx: 180, cy: 24 }, { text: 'post', cx: 225, cy: 24 }, { text: 'Recents', cx: 52, cy: 494 }], W, H)).toBeNull()
  })
})

describe('Story — sticker lien', () => {
  it('« Cancel » de la recherche du tiroir n’est PAS l’écran « Add link »', () => {
    expect(addLinkScreen([{ text: 'Cancel' }, { text: 'Stickers' }, { text: 'GIPHY' }, { text: 'Link' }])).toBe(false)
    expect(addLinkScreen([{ text: 'Cancel' }, { text: 'Searching...' }])).toBe(false)
  })
  it('écran « Add link » = URL / Customize', () => {
    expect(addLinkScreen([{ text: 'Cancel' }, { text: 'Add' }, { text: 'link' }, { text: 'URL' }, { text: 'Customize' }])).toBe(true)
  })
  it('puce « Link » lue sous « Stickers »', () => {
    expect(linkStickerPoint([{ text: 'Stickers', cx: 50, cy: 149 }, { text: 'Link', cx: 221, cy: 191 }, { text: 'GIPHY', cx: 44, cy: 246 }], W, H)).toEqual({ x: 221, y: 191 })
  })
  it('« Link » illisible → juste sous l’intitulé « Stickers »', () => {
    const p = linkStickerPoint([{ text: 'Stickers', cx: 50, cy: 149 }], W, H)!
    expect(Math.abs(p.y - 191)).toBeLessThan(12)
  })
})

describe('feuilles d’info Instagram', () => {
  it('OK juste au-dessus de « View settings » / « Manage settings »', () => {
    const y = okAboveSettingsLink([{ text: 'View', cx: 180, cy: 654 }, { text: 'settings', cx: 230, cy: 654 }], H)!.y
    expect(y).toBeGreaterThan(590); expect(y).toBeLessThan(625) // bouton OK relevé à y≈604
    expect(okAboveSettingsLink([{ text: 'Settings', cx: 200, cy: 40 }], H)).toBeNull()
  })
})

describe('interrupteur iOS', () => {
  it('vert = actif, blanc / gris = coupé', () => {
    expect(iosToggleOn([66, 222, 99])).toBe(true)
    expect(iosToggleOn([255, 254, 255])).toBe(false)
    expect(iosToggleOn([198, 196, 199])).toBe(false)
  })
})
