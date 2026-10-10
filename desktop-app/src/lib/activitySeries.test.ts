import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { buildDailySeries } from './activitySeries'

const NOW = new Date(2026, 9, 10, 15, 0)
const at = (daysAgo: number, h = 12) => new Date(2026, 9, 10 - daysAgo, h).toISOString()

describe('série quotidienne de l’accueil', () => {
  it('14 jours, aujourd’hui en dernier, runs directs + programmés', () => {
    const s = buildDailySeries(
      [{ created_at: at(0), ok_count: 5, err_count: 1 }, { created_at: at(8), ok_count: 2, err_count: 0 }, { created_at: at(20), ok_count: 9, err_count: 0 }],
      [{ executed_at: at(1), created_at: at(2), status: 'done', phones: ['a', 'b', 'c'], result: null },
       { executed_at: at(2), created_at: at(2), status: 'failed', phones: [], result: { details: [{ ok: true }, { ok: false }] } }],
      14, NOW)
    expect(s.days).toHaveLength(14)
    expect(s.days[13]).toMatchObject({ ok: 5, failed: 1 })
    expect(s.days[12]).toMatchObject({ ok: 3, failed: 0 })
    expect(s.days[11]).toMatchObject({ ok: 1, failed: 1 })
    expect(s.ok7).toBe(9); expect(s.failed7).toBe(2)
    expect(s.okPrev7).toBe(2)
    expect(s.rate7).toBe(82); expect(s.ratePrev7).toBe(100)
  })
  it('aucune donnée → taux inconnu', () => {
    const s = buildDailySeries([], [], 14, NOW)
    expect(s.rate7).toBeNull(); expect(s.days.every(d => d.ok === 0 && d.failed === 0)).toBe(true)
  })
})
