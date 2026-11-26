import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { splitCaptions, countByMarket, DEFAULT_PROMPTS } from './captionMarkets'

describe('descriptions par marché', () => {
  it('réponse de l’IA → descriptions (séparateur ———, lignes gardées)', () => {
    const raw = 'drop a song for me 🎧 #usa #fypage\n———\nok but who else can\'t sleep\n.\n.\n#american #reels #mood\n———\n\nguess my fav color 🌼\n\n#usagirl #explorepage'
    expect(splitCaptions(raw)).toEqual([
      'drop a song for me 🎧 #usa #fypage',
      'ok but who else can\'t sleep\n.\n.\n#american #reels #mood',
      'guess my fav color 🌼\n\n#usagirl #explorepage',
    ])
  })
  it('numérotation parasite retirée', () => {
    expect(splitCaptions('1. coucou vous #france #fyp\n———\n2) bonne nuit 🌙 #fr #reels')).toEqual(['coucou vous #france #fyp', 'bonne nuit 🌙 #fr #reels'])
  })
  it('nombre de descriptions par marché (compte sans marché = défaut)', () => {
    expect(countByMarket(['us', null, 'de', 'us', null], 'fr')).toEqual({ fr: 2, us: 2, de: 1 })
  })
  it('les 3 prompts sont là, avec le séparateur attendu', () => {
    for (const m of ['fr', 'us', 'de'] as const) expect(DEFAULT_PROMPTS[m]).toContain('———')
  })
})

import { MARKET_CITIES, pickCity } from './captionMarkets'
import { locationRow, homeScreenShown } from './iremotechVision'
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))
describe('localisation selon le marché', () => {
  const w = (text: string, cx: number, cy: number) => ({ text, cx, cy })
  it('« Paris » : la bonne ligne est « Paris, France », pas « Paris Las Vegas »', () => {
    const paris = MARKET_CITIES.fr.find(c => c.label === 'Paris, France')!
    const words = [w('Paris', 60, 223), w('Paris', 30, 275), w('Las', 75, 275), w('Vegas', 110, 275), w('Paris,', 35, 340), w('France', 95, 340), w('75004', 30, 358)]
    expect(locationRow(words, paris, 230)).toEqual({ x: 35, y: 340 })
  })
  it('USA : ville + État (« Los Angeles, California »)', () => {
    const la = MARKET_CITIES.us.find(c => c.label === 'Los Angeles, California')!
    expect(locationRow([w('Los', 20, 300), w('Angeles,', 70, 300), w('California', 150, 300)], la, 230)).toEqual({ x: 70, y: 300 })
  })
  it('Allemagne : « München, Germany » accepté pour Munich', () => {
    const mu = MARKET_CITIES.de.find(c => c.label === 'Munich, Germany')!
    expect(locationRow([w('München,', 50, 320), w('Germany', 120, 320)], mu, 230)).toEqual({ x: 50, y: 320 })
  })
  it('« New York, NY » (État en abréviation) et « New York, New York »', () => {
    const ny = MARKET_CITIES.us.find(c => c.label === 'New York, New York')!
    expect(locationRow([w('New', 20, 300), w('York,', 60, 300), w('NY', 100, 300)], ny, 230)).toEqual({ x: 60, y: 300 })
    expect(locationRow([w('New', 20, 300), w('York,', 60, 300), w('New', 110, 300), w('York', 150, 300)], ny, 230)).toEqual({ x: 60, y: 300 })
  })
  it('écran d’accueil reconnu (Instagram fermé tout seul)', () => {
    expect(homeScreenShown(['iremotech.', 'Weather', 'Books'].map(text => ({ text })))).toBe(true)
    expect(homeScreenShown(['Allow', 'iRemotech', 'to', 'connect'].map(text => ({ text })))).toBe(false)
  })
  it('ville du bon pays tirée au hasard', () => {
    expect(pickCity('de', () => 0).label).toBe('Berlin, Germany')
    expect(MARKET_CITIES.us.every(c => !/france|germany/i.test(c.label))).toBe(true)
  })
})

describe('localisation — la ligne commence par la ville', () => {
  const w = (text: string, cx: number, cy: number) => ({ text, cx, cy })
  it('« West Miami, Florida » écartée, « Miami, Florida » choisie', () => {
    const mia = MARKET_CITIES.us.find(c => c.label === 'Miami, Florida')!
    const words = [w('West', 30, 280), w('Miami,', 80, 280), w('Florida', 140, 280), w('Miami,', 35, 340), w('Florida', 100, 340)]
    expect(locationRow(words, mia, 230)).toEqual({ x: 35, y: 340 })
  })
  it('ville en 2 mots : « Los Angeles, California » gardée, « East Los Angeles » écartée', () => {
    const la = MARKET_CITIES.us.find(c => c.label === 'Los Angeles, California')!
    const words = [w('East', 20, 280), w('Los', 60, 280), w('Angeles,', 110, 280), w('California', 190, 280), w('Los', 20, 340), w('Angeles,', 70, 340), w('California', 150, 340)]
    expect(locationRow(words, la, 230)).toEqual({ x: 70, y: 340 })
  })
})
