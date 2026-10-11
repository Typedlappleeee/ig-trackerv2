import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/ui', () => ({}))
import { weekDays, monthCells, canMove, movedDate } from './ScheduleCalendar'

describe('calendrier des programmations', () => {
  it('semaine du lundi au dimanche', () => {
    const w = weekDays(new Date(2026, 9, 11, 15))   // dimanche 11 oct.
    expect(w[0].getDate()).toBe(5); expect(w[0].getDay()).toBe(1); expect(w[6].getDate()).toBe(11)
  })
  it('mois : 42 cases commençant un lundi, contenant tout le mois', () => {
    const c = monthCells(new Date(2026, 9, 20))
    expect(c).toHaveLength(42); expect(c[0].getDay()).toBe(1)
    expect(c.some(d => d.getMonth() === 9 && d.getDate() === 1)).toBe(true)
    expect(c.some(d => d.getMonth() === 9 && d.getDate() === 31)).toBe(true)
  })
  it('déplacement : seulement les posts serveur en attente, dans le futur', () => {
    const now = Date.parse('2026-10-11T10:00:00Z')
    expect(canMove({ id: 'a', type: 'story', status: 'pending', scheduled_at: '2026-10-12T10:00:00Z', caption: null, phones: [] }, now)).toBe(true)
    expect(canMove({ id: 'b', type: 'story', status: 'geelark', scheduled_at: '2026-10-12T10:00:00Z', caption: null, phones: [] }, now)).toBe(false)
    expect(canMove({ id: 'c', type: 'story', status: 'pending', scheduled_at: '2026-10-10T10:00:00Z', caption: null, phones: [] }, now)).toBe(false)
  })
  it('garde la même heure sur le nouveau jour', () => {
    const orig = new Date(2026, 9, 12, 18, 30).toISOString()
    const to = movedDate(orig, new Date(2026, 9, 15))
    expect([to.getDate(), to.getHours(), to.getMinutes()]).toEqual([15, 18, 30])
  })
})
