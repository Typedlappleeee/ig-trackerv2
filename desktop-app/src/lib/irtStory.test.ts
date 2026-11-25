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

import { notNowUnderContinue } from './iremotechVision'
describe('feuille « Finish setting up your profile »', () => {
  const H = 720
  it('tape « Not now », jamais « Continue »', () => {
    const w = [{ text: 'Finish', cx: 90, cy: 230 }, { text: 'setting', cx: 160, cy: 230 }, { text: 'profile', cx: 120, cy: 262 },
      { text: 'Continue', cx: 200, cy: 530 }, { text: 'Not', cx: 185, cy: 582 }, { text: 'now', cx: 215, cy: 582 }]
    expect(notNowUnderContinue(w, H)).toEqual({ x: 200, y: 582 })
  })
  it('« Not now » illisible : sous « Continue » ; rien sur un écran ordinaire', () => {
    expect(notNowUnderContinue([{ text: 'Finish', cx: 90, cy: 230 }, { text: 'setting', cx: 160, cy: 230 }, { text: 'profile', cx: 120, cy: 262 }, { text: 'Continue', cx: 200, cy: 530 }], H)).toEqual({ x: 200, y: 582 })
    expect(notNowUnderContinue([{ text: 'Follow', cx: 300, cy: 40 }, { text: 'Reels', cx: 60, cy: 40 }], H)).toBeNull()
  })
})

import { cameraSheet } from './iremotechVision'
describe('feuille caméra / micro', () => {
  it('reconnue (→ Continue), pas l’alerte iOS ni un écran ordinaire', () => {
    const w = [{ text: 'Allow', cy: 210 }, { text: 'access', cy: 230 }, { text: 'camera', cy: 236 }, { text: 'microphone', cy: 262 }, { text: 'Continue', cy: 660 }]
    expect(cameraSheet(w, 720)).toBe(true)
    expect(cameraSheet([...w, { text: 'Would', cy: 300 }], 720)).toBe(false)
    expect(cameraSheet([{ text: 'Continue', cy: 660 }], 720)).toBe(false)
  })
})

import { adsConsentTaps } from './iremotechVision'
describe('écrans Meta « pub » (UE)', () => {
  const W = 360, H = 640
  it('« Choose if we process your data for ads » → Get started', () => {
    const w = [{ text: 'Choose', cx: 150, cy: 265 }, { text: 'process', cx: 170, cy: 297 }, { text: 'ads', cx: 220, cy: 329 }, { text: 'Get', cx: 155, cy: 481 }, { text: 'started', cx: 195, cy: 481 }]
    expect(adsConsentTaps(w, W, H)).toEqual([{ x: 180, y: 481 }])
  })
  it('abonnement ou gratuit avec pub → ligne gratuite puis Continue, jamais Subscribe', () => {
    const w = [{ text: 'Meta', cx: 180, cy: 90 }, { text: 'subscribe', cx: 250, cy: 140 }, { text: 'ads?', cx: 200, cy: 196 },
      { text: 'Subscribe', cx: 90, cy: 338 }, { text: 'Use', cx: 60, cy: 468 }, { text: 'free', cx: 100, cy: 468 }, { text: 'Continue', cx: 180, cy: 586 }]
    const t = adsConsentTaps(w, W, H)!
    expect(t).toEqual([{ x: 180, y: 468 }, { x: 180, y: 586 }])
    expect(t.some(p => p.y === 338)).toBe(false)
  })
  it('écran ordinaire → rien', () => {
    expect(adsConsentTaps([{ text: 'Continue', cx: 180, cy: 600 }], W, H)).toBeNull()
  })
})
describe('écrans Meta « pub » : suite', () => {
  it('Agree puis OK', () => {
    const base = [{ text: 'Meta', cx: 180, cy: 90 }, { text: 'personalized', cx: 180, cy: 200 }, { text: 'ads', cx: 240, cy: 200 }]
    expect(adsConsentTaps([...base, { text: 'Agree', cx: 180, cy: 590 }], 360, 640)).toEqual([{ x: 180, y: 590 }])
    expect(adsConsentTaps([...base, { text: 'OK', cx: 180, cy: 590 }], 360, 640)).toEqual([{ x: 180, y: 590 }])
  })
})

import { captionEditorOpen } from './iremotechVision'
describe('éditeur de légende (OK = coche sans texte)', () => {
  it('ouvert : titre Caption + puces Hashtags/Poll/Prompt ; fermé sur la page de partage', () => {
    const H = 600
    expect(captionEditorOpen([{ text: 'Caption', cy: 33 }, { text: 'Hashtags', cy: 170 }, { text: 'Poll', cy: 170 }, { text: 'Prompt', cy: 170 }], H)).toBe(true)
    expect(captionEditorOpen([{ text: 'Tag', cy: 420 }, { text: 'Share', cy: 545 }, { text: 'Hashtags', cy: 367 }, { text: 'Poll', cy: 367 }], H)).toBe(false)
    // titre illisible mais liste des hashtags suggérés ouverte sous les puces → éditeur ouvert
    expect(captionEditorOpen([{ text: 'Poll', cy: 200 }, { text: 'Prompt', cy: 200 }, { text: '#rvlifestyle', cy: 270 }, { text: 'posts', cy: 290 }, { text: '#gvlifestyle', cy: 330 }, { text: 'posts', cy: 350 }, { text: '#menslifestyle', cy: 390 }], H)).toBe(true)
  })
})

import { homeFeedShown } from './iremotechVision'
describe('fil d’accueil reconnu (le « + » est là)', () => {
  it('Your story / For you en haut ; pas sur un Reel plein écran', () => {
    expect(homeFeedShown([{ text: 'For', cy: 50 }, { text: 'you', cy: 50 }, { text: 'Your', cy: 190 }, { text: 'story', cy: 190 }], 720)).toBe(true)
    expect(homeFeedShown([{ text: 'Follow', cy: 553 }, { text: 'lesotwins', cy: 540 }], 720)).toBe(false)
  })
})

import { locationRow as locRow, locationAlreadySet } from './iremotechVision'
describe('localisation : bonne ligne et lieu déjà posé', () => {
  const loc = { city: /^Frankfurt,?$/i, first: /^Frankfurt,?$/i, region: /^(germany|deutschland)$/i }
  it('« Frankfurt, Germany » préféré à « Frankfurt Germany Temple »', () => {
    const w = [{ text: 'Frankfurt', cx: 60, cy: 300 }, { text: 'Germany', cx: 140, cy: 300 }, { text: 'Temple', cx: 210, cy: 300 },
      { text: 'Frankfurt,', cx: 60, cy: 360 }, { text: 'Germany', cx: 140, cy: 360 }]
    expect(locRow(w, loc, 200)).toEqual({ x: 60, y: 360 })
  })
  it('lieu déjà posé sous « Tag people » → reconnu ; « Add location » encore là → non', () => {
    const base = [{ text: 'Tag', cx: 60, cy: 460 }, { text: 'people', cx: 110, cy: 460 }]
    expect(locationAlreadySet([...base, { text: 'Leipzig,', cx: 80, cy: 514 }, { text: 'Germany', cx: 160, cy: 514 }], { city: /^Leipzig,?$/i, region: /^germany$/i }, 650)).toBe(true)
    expect(locationAlreadySet([...base, { text: 'Add', cx: 60, cy: 514 }, { text: 'location', cx: 110, cy: 514 }], { city: /^Leipzig,?$/i, region: /^germany$/i }, 650)).toBe(false)
  })
})
describe('lieu déjà posé, page défilée', () => {
  it('reconnu juste au-dessus de « People you share… » même sans « Tag people »', () => {
    const w = [{ text: 'Munich,', cx: 80, cy: 300 }, { text: 'Germany', cx: 160, cy: 300 }, { text: 'People', cx: 60, cy: 340 }, { text: 'you', cx: 100, cy: 340 }, { text: 'share', cx: 140, cy: 340 }]
    expect(locationAlreadySet(w, { city: /^Munich,?$/i, region: /^germany$/i }, 720)).toBe(true)
  })
})

import { otherPageShown } from './iremotechVision'
describe('page d’un autre compte (sans barre d’onglets)', () => {
  it('grille de Reels d’un autre compte → oui ; fil d’accueil et mon profil → non', () => {
    const other = [{ text: 'saraklavier', cx: 200, cy: 48 }, { text: '65.7K', cx: 60, cy: 210 }, { text: '12.7K', cx: 190, cy: 210 }, { text: '4,353', cx: 320, cy: 210 }, { text: '59.9K', cx: 60, cy: 450 }, { text: '19.1K', cx: 330, cy: 450 }]
    expect(otherPageShown(other, 406, 720)).toBe(true)
    expect(otherPageShown([{ text: 'For', cx: 180, cy: 50 }, { text: 'you', cx: 220, cy: 50 }, { text: 'Your', cx: 40, cy: 190 }, { text: 'story', cx: 80, cy: 190 }, { text: 'Follow', cx: 300, cy: 240 }], 406, 720)).toBe(false)
    expect(otherPageShown([{ text: 'Edit', cx: 100, cy: 360 }, { text: 'profile', cx: 140, cy: 360 }, { text: 'Follow', cx: 120, cy: 620 }], 406, 720)).toBe(false)
    expect(otherPageShown([{ text: '<', cx: 20, cy: 50 }, { text: 'Follow', cx: 200, cy: 300 }], 406, 720)).toBe(false) // signe faible seul : non
  })
})
describe('Reel plein écran ≠ page d’un autre compte', () => {
  it('compteurs tous à droite → non', () => {
    const reel = [{ text: 'Reels', cx: 60, cy: 50 }, { text: '1,234', cx: 375, cy: 300 }, { text: '56', cx: 375, cy: 380 }, { text: '12', cx: 375, cy: 450 }, { text: '3', cx: 375, cy: 520 }, { text: 'Follow', cx: 260, cy: 560 }]
    expect(otherPageShown(reel, 406, 720)).toBe(false)
  })
})

import { assistiveTouchIn } from './ocr'
describe('bouton AssistiveTouch repéré', () => {
  it('disque blanc entouré de gris → trouvé ; disque blanc sur fond blanc → non', () => {
    const W = 406, H = 720, cx = 35, cy = 35
    const at = (x: number, y: number): [number, number, number] => { const d = Math.hypot(x - cx, y - cy); return d < 17 ? [250, 250, 250] : (Math.abs(x - cx) < 32 && Math.abs(y - cy) < 32) ? [150, 150, 152] : [255, 255, 255] }
    expect(assistiveTouchIn(at, W, H)).toEqual({ cx: 35, cy: 35 })
    expect(assistiveTouchIn(() => [255, 255, 255], W, H)).toBeNull()
  })
})

import { removedContentScreen } from './iremotechVision'
describe('écran « We removed some content »', () => {
  it('reconnu, croix à la hauteur du titre ; écran ordinaire → non', () => {
    const w = [{ text: 'What', cy: 40 }, { text: 'happened', cy: 40 }, { text: 'We', cy: 270 }, { text: 'removed', cy: 270 }, { text: 'content', cy: 270 }, { text: 'messages', cy: 300 }]
    expect(removedContentScreen(w, 720)).toEqual({ y: 40 })
    expect(removedContentScreen([{ text: 'For', cy: 50 }, { text: 'you', cy: 50 }], 720)).toBeNull()
  })
})
