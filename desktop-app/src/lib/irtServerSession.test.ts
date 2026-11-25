import { describe, it, expect, vi } from 'vitest'
vi.mock('./iremotechVision', () => ({}))
vi.mock('./iremotech', () => ({}))
import { locToServer, locFromServer, planTotal } from './irtServerSession'
import { MARKET_CITIES } from './captionMarkets'

describe('session serveur : plan transportable en JSON', () => {
  it('le lieu (RegExp) survit à JSON aller-retour', () => {
    const loc = MARKET_CITIES.de.find(c => c.q.startsWith('Dusseldorf'))!
    const back = locFromServer(JSON.parse(JSON.stringify(locToServer(loc))))!
    expect(back.q).toBe(loc.q)
    expect(back.city.test('Düsseldorf,')).toBe(true)
    expect(back.region.test('Germany')).toBe(true)
    expect(back.first!.test('Dusseldorf')).toBe(true)
    expect(locToServer(null)).toBeNull()
  })
  it('total des posts', () => {
    expect(planTotal({ kind: 'reel', opts: { airplaneOn: true, gapMin: 3, gapScroll: true, parallel: true }, phones: [{ dev: 'a', name: 'A', jobs: [{ container: '@x', caption: '', vids: [] }, { container: '@x', caption: '', vids: [] }] }, { dev: 'b', name: 'B', jobs: [{ container: '@y', caption: '', vids: [] }] }] })).toBe(3)
  })
})
