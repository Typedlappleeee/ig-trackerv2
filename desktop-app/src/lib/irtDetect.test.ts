import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))
import { sortContainerNames, pickerRows, classifySignup, decideEndScreen, sameUsername } from './iremotechVision'

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

describe('iRemoTech — écrans de fin : écran lu → action', () => {
  const D = (ws: [string, number, number][]) => decideEndScreen(ws.map(([text, cx, cy]) => ({ text, cx, cy, h: 16 })), W, H)
  it('alerte iOS « Access Your Contacts » → Don’t Allow en double tap', () => {
    expect(D([['"Instagram"', 150, 290], ['Would', 250, 290], ['Like', 300, 290], ['Contacts', 250, 310], ["Don't", 150, 441], ['Allow', 200, 441], ['OK', 290, 441]])).toMatchObject({ kind: 'tap', label: 'Don’t Allow', double: true })
  })
  it('refus « We couldn’t create an account » → refused', () => {
    expect(D([['We', 100, 315], ["couldn't", 160, 315], ['create', 240, 315], ['an', 280, 315], ['OK', 203, 435]])).toEqual({ kind: 'refused' })
  })
  it('cookies → Allow all cookies (double tap)', () => {
    expect(D([['Allow', 80, 133], ['cookies', 260, 133], ['Allow', 160, 680], ['all', 200, 680], ['cookies', 250, 680]])).toMatchObject({ kind: 'tap', double: true })
  })
  it('Review the settings → défiler puis Next (sans quitter) ; popup « Turn on from settings » → Not now', () => {
    expect(D([['Review', 80, 120], ['the', 140, 120], ['settings', 200, 120], ['Turn', 300, 300]])).toEqual({ kind: 'review' })
    expect(D([['Contacts', 140, 160], ['Location', 130, 346], ['Turn', 210, 533], ['on', 240, 533], ['Turn', 180, 489], ['Not', 190, 650], ['now', 220, 650]])).toMatchObject({ kind: 'tap' })
  })
  it('fil avec « Your story » → feed (prêt à poster)', () => {
    expect(D([['Instagram', 80, 50], ['Your', 40, 170], ['story', 80, 170]])).toEqual({ kind: 'feed' })
  })
  it('Skip / Not now passent avant l’opt-in bleu', () => {
    expect(D([['Add', 120, 100], ['profile', 200, 100], ['picture', 280, 100], ['Add', 180, 618], ['picture', 240, 618], ['Skip', 203, 672]])).toMatchObject({ kind: 'tap', label: 'Skip' })
    expect(D([['Turn', 100, 100], ['on', 150, 100], ['notifications', 250, 100], ['Not', 190, 650], ['now', 220, 650]])).toMatchObject({ kind: 'tap' })
  })
  it('« Follow 5 » sans Skip en haut → tout décocher (pas la phrase « to skip this step »)', () => {
    expect(D([['Follow', 70, 120], ['people', 120, 168], ['Follow', 203, 644], ['Unselect', 200, 700], ['all', 250, 700], ['skip', 360, 700]])).toEqual({ kind: 'unfollowAll' })
  })
  it('« Confirm you’re human » → captcha (container suivant)', () => {
    expect(D([['Confirm', 120, 270], ["you're", 190, 273], ['human', 250, 271], ['maevalwyemg5h', 200, 335]])).toEqual({ kind: 'captcha' })
  })
  it('« shows your vibe » : Skip en haut à droite', () => {
    expect(D([['Create', 90, 80], ['profile', 220, 80], ['vibe', 240, 125], ['Skip', 373, 45], ['Add', 190, 594], ['bio', 220, 594]])).toMatchObject({ kind: 'tap', label: 'Skip', y: 45 })
  })
  it('écran « Welcome to Instagram » (transition) → rien', () => {
    expect(D([['Welcome', 120, 440], ['to', 180, 440], ['Instagram,', 150, 470], ['eva389345', 140, 500]])).toBeNull()
  })
})

describe('iRemoTech — nom d’utilisateur relu', () => {
  it('erreur de lecture OCR (5↔s) = même nom ; suggestion d’Instagram = autre nom', () => {
    expect(sameUsername('maevalwyemg5h', 'maevalwyemgsh')).toBe(true)
    expect(sameUsername('evaqxma4t', 'eva389345')).toBe(false)
  })
})
