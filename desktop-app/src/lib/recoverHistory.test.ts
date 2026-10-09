import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./geelark', () => ({ geelarkFetch: async () => ({}) }))
import { parseTaskRecord, clusterTasks, toEntry } from './recoverHistory'

const T0 = Date.parse('2026-10-09T08:00:00Z')
const rec = (id: string, minutes: number, extra: Record<string, unknown> = {}) =>
  parseTaskRecord({ id, envId: 'g' + id, serialName: 'Phone ' + id, scheduleAt: Math.floor((T0 + minutes * 60_000) / 1000), status: 3, planName: 'Reels Scaleflow', ...extra })!

describe('récupération 24 h — lecture des tâches GeeLark', () => {
  it('lit un enregistrement (secondes → ms, téléphone, statut, échec)', () => {
    const t = parseTaskRecord({ id: '123', envId: '999', serialName: 'S1', scheduleAt: T0 / 1000, status: 4, failDesc: 'Not logged in' })
    expect(t).toMatchObject({ id: '123', phoneId: '999', phoneName: 'S1', at: T0, status: 4, error: 'Not logged in', kind: 'mass_posting' })
    expect(parseTaskRecord({ status: 3 })).toBeNull()
    expect(parseTaskRecord({ id: 'x', taskName: 'Story lien', createTime: new Date(T0).toISOString() })?.kind).toBe('story')
  })
  it('regroupe en runs : tâches rapprochées ensemble, séparées au-delà de 10 min ou par type', () => {
    const groups = clusterTasks([rec('1', 0), rec('2', 3), rec('3', 9), rec('4', 40), rec('5', 2, { planName: 'Story ScaleFlow' })])
    expect(groups.map(g => g.map(t => t.id))).toEqual([['1', '2', '3'], ['5'], ['4']])
  })
  it('compte réussi / échoué / encore en cours', () => {
    expect(toEntry(rec('1', 0), '@a')).toMatchObject({ ok: true, taskId: '1', recovered: true })
    expect(toEntry(rec('2', 0, { status: 4, failDesc: 'x' }), '@b')).toMatchObject({ ok: false, error: 'x' })
    expect(toEntry(rec('3', 0, { status: 2 }), '@c')).toMatchObject({ ok: false, pending: true })
  })
})
