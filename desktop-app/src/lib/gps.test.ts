import { describe, expect, it } from 'vitest'
import { GPS_CITIES, gpsFor, inPoly, GERMANY_POLY } from './gps'

describe('Localisation GPS aléatoire', () => {
  it('USA (aléatoire) : toujours aux États-Unis, et différente d’une variante à l’autre', () => {
    const pts = Array.from({ length: 200 }, () => gpsFor('usa')!)
    for (const p of pts) {
      expect(p.lat).toBeGreaterThan(24); expect(p.lat).toBeLessThan(50)
      expect(p.lon).toBeGreaterThan(-125); expect(p.lon).toBeLessThan(-66)
    }
    expect(new Set(pts.map(p => `${p.lat},${p.lon}`)).size).toBeGreaterThan(150)
  })
  it('France (aléatoire) reste en France', () => {
    for (let i = 0; i < 200; i++) {
      const p = gpsFor('france')!
      expect(p.lat).toBeGreaterThan(41); expect(p.lat).toBeLessThan(51.5)
      expect(p.lon).toBeGreaterThan(-5.5); expect(p.lon).toBeLessThan(9.6)
    }
  })
  it('Allemagne (aléatoire) : n’importe où dans le pays, jamais deux fois le même point', () => {
    expect(inPoly(13.405, 52.52, GERMANY_POLY)).toBe(true)     // Berlin
    expect(inPoly(11.58, 48.135, GERMANY_POLY)).toBe(true)     // Munich
    expect(inPoly(2.35, 48.85, GERMANY_POLY)).toBe(false)      // Paris
    expect(inPoly(4.9, 52.37, GERMANY_POLY)).toBe(false)       // Amsterdam
    const pts = Array.from({ length: 200 }, () => gpsFor('germany')!)
    expect(new Set(pts.map(p => `${p.lat},${p.lon}`)).size).toBeGreaterThan(190)
    for (const p of pts) {
      expect(p.lat).toBeGreaterThan(47.2); expect(p.lat).toBeLessThan(55.1)
      expect(p.lon).toBeGreaterThan(5.8); expect(p.lon).toBeLessThan(15.1)
    }
  })
  it('liste : USA juste après France ; ville fixe et « aucune » inchangées', () => {
    expect(GPS_CITIES.map(c => c.k).slice(0, 3)).toEqual(['none', 'france', 'usa'])
    expect(gpsFor('paris')).toEqual({ lat: 48.8566, lon: 2.3522 })
    expect(gpsFor('none')).toBeNull()
  })
})
