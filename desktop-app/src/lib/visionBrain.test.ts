import { describe, it, expect, vi } from 'vitest'
vi.mock('./ai', () => ({ groqChat: vi.fn() }))
import { parseBrain, buttonsFrom } from './visionBrain'

const W = 406, H = 720
const btns = buttonsFrom([
  { text: 'Find friends', cx: 150, cy: 100 }, { text: 'Next', cx: 203, cy: 640 }, { text: 'Skip', cx: 375, cy: 46 },
  { text: "Don't Allow", cx: 150, cy: 441 }, { text: 'OK', cx: 290, cy: 441 }, { text: 'Follow', cx: 330, cy: 300 }, { text: '12:04', cx: 200, cy: 10 },
], H)

describe('Cerveau vision — décisions sûres', () => {
  it('boutons numérotés, barre d’état exclue', () => {
    expect(btns.map(b => b.text)).toEqual(['Find friends', 'Next', 'Skip', "Don't Allow", 'OK', 'Follow'])
  })
  it('tap sur un bouton de la liste → coordonnées du bouton', () => {
    expect(parseBrain('Sure: {"action":"tap","id":3,"reason":"skip optional"}', btns, W, H)).toEqual({ kind: 'tap', x: 375, y: 46, label: 'Skip', reason: 'skip optional' })
  })
  it('garde-fous : Follow refusé, OK d’une alerte de permission refusé, id inconnu refusé', () => {
    expect(parseBrain('{"action":"tap","id":6}', btns, W, H)).toBeNull()
    const perm = buttonsFrom([{ text: '"Instagram" Would Like to Access Your Contacts', cx: 200, cy: 300 }, { text: 'OK', cx: 290, cy: 441 }], H)
    expect(parseBrain('{"action":"tap","id":2}', perm, W, H)).toBeNull()
    expect(parseBrain('{"action":"tap","id":99}', btns, W, H)).toBeNull()
  })
  it('« Allow Full Access » seulement quand on publie', () => {
    const ph = buttonsFrom([{ text: 'Allow Full Access', cx: 203, cy: 570 }], H)
    expect(parseBrain('{"action":"tap","id":1}', ph, W, H)).toBeNull()
    expect(parseBrain('{"action":"tap","id":1}', ph, W, H, { allowPhotos: true })?.kind).toBe('tap')
  })
  it('back / wait / done / stop ; réponse illisible → null', () => {
    expect(parseBrain('{"action":"stop","reason":"captcha"}', btns, W, H)).toEqual({ kind: 'stop', reason: 'captcha' })
    expect(parseBrain('{"action":"done"}', btns, W, H)?.kind).toBe('done')
    expect(parseBrain('je ne sais pas', btns, W, H)).toBeNull()
  })
})
