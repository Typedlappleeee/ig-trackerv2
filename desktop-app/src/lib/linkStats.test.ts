import { describe, it, expect } from 'vitest'
import { computeLinkStats } from './linkStats'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60000).toISOString()

describe('stats des liens', () => {
  const links = [{ id: 'L', kind: 'landing', group_id: 'g1' }, { id: 'D', kind: 'direct', group_id: 'g1' }, { id: 'M', kind: 'landing', group_id: null }]
  const clicks = [
    { link_id: 'L', page_id: 'p', button: null, created_at: ago(10), visit_id: 'v1', country: 'FR' },
    { link_id: 'L', page_id: 'p', button: 0, created_at: ago(9), visit_id: 'v1' },
    { link_id: 'L', page_id: 'p', button: null, created_at: ago(3), visit_id: 'v2', country: 'FR' },
    { link_id: 'D', page_id: null, button: null, created_at: ago(2), visit_id: null, country: 'BE' },
    { link_id: 'M', page_id: 'p', button: null, created_at: ago(60 * 24 * 3), visit_id: 'v3' },
  ]
  it('visites, visites avec clic et taux de clic (liens directs exclus du taux)', () => {
    const s = computeLinkStats(clicks, links, '7', NOW)
    expect(s.visits).toBe(4)
    expect(s.withClicks).toBe(1)
    expect(s.ctr).toBe(33.3)   // 1 sur 3 visites de page
  })
  it('par lien : aujourd’hui, tendance 7 jours, taux de clic', () => {
    const s = computeLinkStats(clicks, links, 'today', NOW)
    expect(s.perLink.get('L')).toMatchObject({ visits: 2, today: 2, ctr: 50 })
    expect(s.perLink.get('D')?.ctr).toBeNull()
    expect(s.perLink.get('M')?.trend.reduce((a, b) => a + b, 0)).toBe(1)
  })
  it('par groupe, pays, en direct', () => {
    const s = computeLinkStats(clicks, links, 'today', NOW)
    expect(s.byGroup[0]).toEqual(['g1', 3])
    expect(s.countries[0]).toEqual(['FR', 2])
    expect(s.liveNow).toBe(2)
    expect(s.perMinute.reduce((a, b) => a + b, 0)).toBe(4)
  })
})
