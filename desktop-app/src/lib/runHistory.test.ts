import { describe, it, expect, vi, beforeEach } from 'vitest'

// post_runs simulé : insert (avec .select().single()) et update par id.
const H = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), n: 0, failInsert: false, listeners: [] as ((p: string, t: string) => void)[] }))
vi.mock('./supabase', () => {
  const from = () => {
    let op: 'insert' | 'update' = 'insert'
    let payload: Record<string, unknown> = {}
    let id: string | null = null
    const b: Record<string, unknown> = {}
    const exec = () => {
      if (op === 'insert') {
        if (H.failInsert) return { data: null, error: { message: 'réseau' } }
        const nid = `r${++H.n}`; H.rows.set(nid, { ...payload }); return { data: { id: nid }, error: null }
      }
      if (id && H.rows.has(id)) H.rows.set(id, { ...H.rows.get(id), ...payload })
      return { data: null, error: null }
    }
    Object.assign(b, {
      insert: (r: Record<string, unknown>) => { op = 'insert'; payload = r; return b },
      update: (r: Record<string, unknown>) => { op = 'update'; payload = r; return b },
      eq: (_c: string, v: string) => { id = v; return b },
      select: () => b,
      single: () => b,
      then: (res: (v: unknown) => void) => res(exec()),
    })
    return b
  }
  return { supabase: { from } }
})
vi.mock('./geelark', () => ({
  onGeelarkTask: (cb: (p: string, t: string) => void) => { H.listeners.push(cb); return () => { H.listeners = H.listeners.filter(f => f !== cb) } },
}))
import { startRunHistory, runState, counts, type HistoryEntry } from './runHistory'

const only = () => [...H.rows.values()][0] as { ok_count: number; err_count: number; total: number; details: HistoryEntry[] }

describe('historique des runs — écrit dès le lancement', () => {
  beforeEach(() => { H.rows.clear(); H.n = 0; H.failInsert = false; H.listeners = []; vi.useFakeTimers() })

  it('la ligne existe AVANT tout résultat (onglet fermé en plein run → visible quand même)', async () => {
    await startRunHistory({ userId: 'u', orgId: null, type: 'mass_posting', accounts: [{ key: 'a', name: '@a' }, { key: 'b', name: '@b' }] })
    expect(H.rows.size).toBe(1)
    expect(only().total).toBe(2)
    expect(only().details.every(d => d.pending)).toBe(true)
  })

  it('le taskId GeeLark est enregistré tout de suite, les résultats au fil de l’eau', async () => {
    const h = await startRunHistory({ userId: 'u', orgId: null, type: 'mass_posting', accounts: [{ key: 'a', name: '@a', geelarkId: 'g1' }, { key: 'b', name: '@b', geelarkId: 'g2' }] })
    H.listeners.forEach(f => f('g1', 't-1'))
    await vi.advanceTimersByTimeAsync(0)
    expect(only().details[0].taskId).toBe('t-1')
    h.set('a', { ok: true })
    await vi.advanceTimersByTimeAsync(3100)
    expect(only().ok_count).toBe(1)
    expect(only().details[1].pending).toBe(true)
    await h.finish('annulé')
    expect(only().err_count).toBe(1)
    expect(only().details[1]).toMatchObject({ ok: false, error: 'annulé', pending: false })
  })

  it('cross-posting : les tâches d’un même téléphone vont aux plateformes dans l’ordre', async () => {
    await startRunHistory({ userId: 'u', orgId: null, type: 'mass_posting', accounts: [{ key: 'a:ig', name: 'ig', geelarkId: 'g' }, { key: 'a:tt', name: 'tt', geelarkId: 'g' }] })
    H.listeners.forEach(f => f('g', 't1')); H.listeners.forEach(f => f('g', 't1')); H.listeners.forEach(f => f('g', 't2'))
    await vi.advanceTimersByTimeAsync(0)
    expect(only().details.map(d => d.taskId)).toEqual(['t1', 't2'])
  })

  it('insert de départ raté → recréé à la fin, sans rien perdre', async () => {
    H.failInsert = true
    const h = await startRunHistory({ userId: 'u', orgId: null, type: 'story', accounts: [{ key: 'a', name: '@a' }] })
    expect(H.rows.size).toBe(0)
    H.failInsert = false
    h.set('a', { ok: true })
    expect(await h.finish()).toBeNull()
    expect(only().ok_count).toBe(1)
  })

  it('état : en cours (< 2 h), interrompu au-delà, terminé sans compte en attente', () => {
    const now = Date.now()
    expect(runState([{ pending: true }], now - 10 * 60_000, now)).toBe('running')
    expect(runState([{ pending: true }], now - 3 * 3600_000, now)).toBe('interrupted')
    expect(runState([{ pending: false }], now - 3 * 3600_000, now)).toBe('done')
    expect(counts([{ name: 'a', ok: true }, { name: 'b', ok: false }, { name: 'c', ok: false, pending: true }])).toEqual({ ok: 1, err: 1, pending: 1 })
  })
})
