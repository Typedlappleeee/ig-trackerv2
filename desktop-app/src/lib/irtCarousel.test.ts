import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))
import { gridCellAt, gridCellPoint, checkedCells, firstTimeOkTap } from './iremotechVision'
import { whiteDisksIn } from './ocr'

// Relevés réels (iPhone 406×720, 21/11/2026) : « Recents » y≈483 → grille à y=514, cases de 101,5 px.
const W = 406, TOP = 514

describe('carrousel — grille de la galerie « New post »', () => {
  it('case sous un point (4 colonnes)', () => {
    expect(gridCellAt(50, 560, TOP, W)).toBe(0)   // appareil photo
    expect(gridCellAt(152, 560, TOP, W)).toBe(1)
    expect(gridCellAt(355, 560, TOP, W)).toBe(3)
    expect(gridCellAt(50, 660, TOP, W)).toBe(4)   // 2e rangée
    expect(gridCellAt(50, 500, TOP, W)).toBe(-1)  // au-dessus de la grille
  })
  it('point à taper = haut de la case (évite la barre des modes sur la 2e rangée)', () => {
    const p = gridCellPoint(2, TOP, W)
    expect(gridCellAt(p.x, p.y, TOP, W)).toBe(2)
    expect(gridCellPoint(5, TOP, W).y).toBeLessThan(668) // barre POST/STORY commence vers y≈668
  })
  it('pastilles blanches → cases cochées (pastille en haut à droite de sa case)', () => {
    // relevé : cases 1, 2, 3 cochées → pastilles à (183,533), (285,533), (387,533)
    expect(checkedCells([{ cx: 183, cy: 533 }, { cx: 285, cy: 533 }, { cx: 387, cy: 533 }], TOP, W)).toEqual([1, 2, 3])
    expect(checkedCells([{ cx: 81, cy: 634 }], TOP, W)).toEqual([4])
  })
})

describe('carrousel — fenêtres « première fois »', () => {
  it('« Share more » / « Find your vibe » → OK', () => {
    const words = [{ text: 'Share', cx: 175, cy: 368 }, { text: 'more', cx: 235, cy: 368 }, { text: 'OK', cx: 203, cy: 494 }]
    expect(firstTimeOkTap(words, W, 720)).toEqual({ x: 203, y: 494 })
  })
  it('jamais une alerte de permission iOS', () => {
    const words = [{ text: 'Would', cx: 150, cy: 300 }, { text: 'Like', cx: 200, cy: 300 }, { text: 'Contacts', cx: 200, cy: 320 }, { text: 'OK', cx: 280, cy: 420 }]
    expect(firstTimeOkTap(words, W, 720)).toBeNull()
  })
  it('pas de OK au centre → rien', () => {
    expect(firstTimeOkTap([{ text: 'OK', cx: 380, cy: 30 }], W, 720)).toBeNull()
  })
})

describe('carrousel — détection des pastilles blanches', () => {
  const disk = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  it('pastille pleine de 24 px détectée', () => {
    const d = whiteDisksIn(disk(183, 19, 12), W, 60)
    expect(d).toHaveLength(1)
    expect(Math.abs(d[0].cx - 183)).toBeLessThanOrEqual(1)
  })
  it('photo blanche (grande zone) ignorée', () => {
    expect(whiteDisksIn((x, y) => x < 100 && y < 60, W, 60)).toHaveLength(0)
  })
  it('petit point blanc (bruit, chiffre) ignoré', () => {
    expect(whiteDisksIn(disk(50, 20, 4), W, 60)).toHaveLength(0)
  })
})
