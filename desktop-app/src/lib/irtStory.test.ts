import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))
import { storyGalleryPick, addLinkScreen, linkStickerPoint, okAboveSettingsLink, iosToggleOn, findStickerBox, stickerInCorner, stickerDrag, stickerDomain, createSheetShown } from './iremotechVision'

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

describe('Story — sticker lien en bas à droite', () => {
  const wd = (text: string, x: number, w: number, cy: number) => ({ text, x, w, cx: x + w / 2, cy })
  // relevé : « Clique ici » au centre de l'éditeur, texte de x≈193 à x≈288, y≈436
  const center = [wd('Clique', 193, 58, 436), wd('ici', 258, 30, 436), wd('Drag', 220, 30, 637)]
  it('texte du sticker retrouvé (ligne du libellé, pas ailleurs)', () => {
    const b = findStickerBox(center, 'Clique ici', W, H)!
    expect(b).toMatchObject({ x0: 193, x1: 288, cy: 436 })
    expect(findStickerBox([wd('Drag', 220, 30, 637)], 'Clique ici', W, H)).toBeNull()
  })
  it('sans texte perso → domaine du lien (sans www)', () => {
    expect(stickerDomain('https://www.example.com/promo')).toBe('example.com')
    expect(stickerDomain('example.com')).toBe('example.com')
    expect(findStickerBox([wd('EXAMPLE.COM', 150, 110, 400)], stickerDomain('https://example.com'), W, H)).not.toBeNull()
  })
  it('au centre → pas dans le coin ; le glissement amène le bord droit à 92 % et le bas à 80 %', () => {
    const b = findStickerBox(center, 'Clique ici', W, H)!
    expect(stickerInCorner(b, W, H)).toBe(false)
    const m = stickerDrag(b, W, H)
    expect(m.x1).toBe(Math.round(b.cx))
    expect(b.x1 + (m.x2 - m.x1)).toBeGreaterThanOrEqual(Math.round(W * 0.92) - 1)
    expect(m.y2).toBe(Math.round(H * 0.8))
    expect(stickerInCorner({ x1: b.x1 + (m.x2 - m.x1), cy: m.y2 }, W, H)).toBe(true)
  })
})

describe('+ depuis le profil → feuille « Create »', () => {
  it('reconnue (titre + lignes Reel / Post / Story…)', () => {
    const rows = ['Reel', 'Edits', 'Post', 'Story', 'Instants', 'Highlights', 'Live'].map((t, i) => ({ text: t, cy: 294 + i * 40 }))
    expect(createSheetShown([{ text: 'Create', cy: 246 }, ...rows], H)).toBe(true)
  })
  it('galerie « New post » (modes POST / STORY en bas) → pas la feuille', () => {
    expect(createSheetShown([{ text: 'New', cy: 50 }, { text: 'post', cy: 50 }, { text: 'POST', cy: 690 }, { text: 'STORY', cy: 690 }, { text: 'REEL', cy: 690 }], H)).toBe(false)
  })
})
