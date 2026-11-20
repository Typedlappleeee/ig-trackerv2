import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))
import { sortContainerNames, pickerRows, classifySignup } from './iremotechVision'

describe('iRemoTech — containers détectés', () => {
  it('Default en premier puis ordre numérique, sans doublon ni bruit OCR', () => {
    expect(sortContainerNames(['12', '3', 'default', '3', '07', 'Defaul', 'abc', '1'])).toEqual(['Default', '1', '3', '7', '12'])
  })
})

// Relevé réel du sélecteur Crane (iPhone 406×720, 20/11/2026) : lignes centrées x≈204, + bruit de l'accueil.
const W = 406, H = 720
const word = (text: string, cx: number, cy: number) => ({ text, cx, cy })
describe('iRemoTech — lecture du sélecteur Crane sans défilement', () => {
  it('garde les noms centrés, écarte horloge, icônes et barre d’état', () => {
    const words = [word('1148', 203, 11), word('40', 60, 640), word('Default', 204, 302), word('1', 203, 362), word('2', 204, 424),
      word('3', 203, 486), word('4', 204, 549), word('5', 204, 611), word('alutee', 120, 200), word('19', 330, 120)]
    expect(pickerRows(words, W, H).map(o => o.text)).toEqual(['Default', '1', '2', '3', '4', '5'])
  })
})

describe('iRemoTech — container vierge ?', () => {
  it('« Join Instagram » / Get started → join', () => {
    expect(classifySignup([word('Join', 160, 437), word('Instagram', 250, 437), word('started', 240, 565)], H)).toBe('join')
  })
  it('inscription commencée (« What’s your mobile number? ») → mobile', () => {
    expect(classifySignup([word('What\'s', 60, 96), word('mobile', 220, 96), word('number?', 320, 96), word('Change', 360, 216), word('Next', 203, 404)], H)).toBe('mobile')
  })
  it('essai raté resté sur le code / alerte « stop creating » → code / stop (remis à zéro avant achat)', () => {
    expect(classifySignup([word('Enter', 60, 90), word('the', 110, 90), word('confirmation', 200, 90), word('code', 300, 90), word('Next', 203, 290)], H)).toBe('code')
    expect(classifySignup([word('Do', 90, 290), word('stop', 250, 290), word('creating', 300, 290), word('mobile', 220, 96), word('Change', 360, 216)], H)).toBe('stop')
  })
  it('compte connecté (fil) → null : aucun numéro acheté', () => {
    expect(classifySignup([word('Instagram', 80, 50), word('Your', 40, 140), word('story', 40, 160), word('Suggested', 100, 400)], H)).toBeNull()
  })
  it('« Join » dans une légende en haut du fil ne compte pas', () => {
    expect(classifySignup([word('Join', 100, 200), word('us', 140, 200)], H)).toBeNull()
  })
})
