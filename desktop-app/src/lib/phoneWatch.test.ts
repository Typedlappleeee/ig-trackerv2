import { describe, it, expect, vi, beforeEach } from 'vitest'

// Table phone_power_watch simulée (clé = geelark_id), comme en prod.
type Row = { geelark_id: string; org_id: string | null; user_id: string; reason: string; stop_at: string }
const H = vi.hoisted(() => ({ rows: new Map<string, Row>(), session: 'u1' as string | null }))
vi.mock('./supabase', () => {
  const from = () => {
    let op: 'select' | 'upsert' | 'delete' = 'select'
    let payload: Row[] = []
    let ignoreDup = false
    let inIds: string[] | null = null
    let eqId: string | null = null
    let orExpr: string | null = null
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b,
      upsert: (r: Row | Row[], o?: { ignoreDuplicates?: boolean }) => { op = 'upsert'; payload = Array.isArray(r) ? r : [r]; ignoreDup = !!o?.ignoreDuplicates; return b },
      delete: () => { op = 'delete'; return b },
      in: (_c: string, ids: string[]) => { inIds = ids; return b },
      eq: (_c: string, v: string) => { eqId = v; return b },
      or: (e: string) => { orExpr = e; return b },
      then: (res: (v: unknown) => void) => {
        if (op === 'upsert') {
          for (const r of payload) if (!(ignoreDup && H.rows.has(r.geelark_id))) H.rows.set(r.geelark_id, r)
          return res({ data: null, error: null })
        }
        const ids = inIds ?? (eqId ? [eqId] : [...H.rows.keys()])
        if (op === 'delete') {
          for (const id of ids) {
            const r = H.rows.get(id); if (!r) continue
            if (orExpr) {
              const reason = /reason\.eq\.([^,]+)/.exec(orExpr)?.[1]
              const before = /stop_at\.lt\.(.+)$/.exec(orExpr)?.[1]
              if (!(r.reason === reason || (before && Date.parse(r.stop_at) < Date.parse(before)))) continue
            }
            H.rows.delete(id)
          }
          return res({ data: null, error: null })
        }
        return res({ data: ids.map(id => H.rows.get(id)).filter(Boolean), error: null })
      },
    })
    return b
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: H.session ? { user: { id: H.session } } : null } }) } } }
})

import { planWatchguard, overdueOn, runClientWatchguard, leasePhone, setLeaseOwner, SEEN_RUNNING } from './phoneWatch'
import * as server from '../../../supabase/functions/run-scheduled-posts/watchguard'

const NOW = Date.parse('2026-10-09T12:00:00Z')
const iso = (minFromNow: number) => new Date(NOW + minFromNow * 60_000).toISOString()

describe('watchguard — plan', () => {
  it('pose un bail sur un téléphone allumé sans bail, jamais sur un téléphone déjà suivi', () => {
    const phones = [{ id: 'a', status: 0 }, { id: 'b', status: 2 }, { id: 'c', status: 0 }, { id: 'd', status: 1 }]
    const leases = [{ geelark_id: 'c', reason: 'warmup', stop_at: iso(60) }]
    expect(planWatchguard(phones, leases, NOW)).toEqual({ add: ['a', 'b'], drop: [] })
  })
  it('lève le bail seen_running (ou expiré) d’un téléphone éteint, garde un bail de tâche à venir', () => {
    const phones = [{ id: 'a', status: 1 }, { id: 'b', status: 3 }, { id: 'c', status: 1 }]
    const leases = [
      { geelark_id: 'a', reason: SEEN_RUNNING, stop_at: iso(5) },
      { geelark_id: 'b', reason: 'client_task', stop_at: iso(-1) },
      { geelark_id: 'c', reason: 'client_task', stop_at: iso(5) },   // tâche qui va démarrer le tel
    ]
    expect(planWatchguard(phones, leases, NOW)).toEqual({ add: [], drop: ['a', 'b'] })
  })
  it('copie client identique à la copie serveur (cas aléatoires)', () => {
    const reasons = [SEEN_RUNNING, 'client_task', 'warmup', null]
    for (let n = 0; n < 300; n++) {
      const phones = Array.from({ length: 8 }, (_, i) => ({ id: String(i), status: Math.floor(Math.random() * 4) }))
      const leases = phones.filter(() => Math.random() < 0.5).map(p => ({
        geelark_id: p.id, reason: reasons[Math.floor(Math.random() * 4)], stop_at: iso(Math.round(Math.random() * 40 - 20)),
      }))
      expect(planWatchguard(phones, leases, NOW)).toEqual(server.planWatchguard(phones, leases, NOW))
    }
  })
  it('« en retard » = allumé et bail expiré depuis plus de 2 min', () => {
    const phones = [{ id: 'a', status: 0 }, { id: 'b', status: 0 }, { id: 'c', status: 1 }]
    const leases = [
      { geelark_id: 'a', reason: SEEN_RUNNING, stop_at: iso(-5) },
      { geelark_id: 'b', reason: SEEN_RUNNING, stop_at: iso(-1) },
      { geelark_id: 'c', reason: SEEN_RUNNING, stop_at: iso(-30) },
    ]
    expect(overdueOn(phones, leases, NOW)).toEqual(['a'])
  })
})

describe('watchguard — passage client', () => {
  beforeEach(() => { H.rows.clear(); H.session = 'u1'; setLeaseOwner(null) })

  it('bail posé même avant que l’app ait défini le propriétaire (avant : ignoré en silence)', async () => {
    await leasePhone('p-early', 10, 'client_task')
    expect(H.rows.get('p-early')?.user_id).toBe('u1')
  })

  it('allumé sans bail → bail 10 min ; ne raccourcit pas un bail warmup', async () => {
    H.rows.set('w', { geelark_id: 'w', org_id: null, user_id: 'u1', reason: 'warmup', stop_at: iso(90) })
    const stop = vi.fn(async () => {})
    const r = await runClientWatchguard({ listPhones: async () => [{ id: 'x', status: 0 }, { id: 'w', status: 0 }], stopPhones: stop }, NOW)
    expect(r.leased).toBe(1)
    expect(H.rows.get('x')?.reason).toBe(SEEN_RUNNING)
    expect(Date.parse(H.rows.get('x')!.stop_at)).toBe(NOW + 10 * 60_000)
    expect(H.rows.get('w')?.stop_at).toBe(iso(90))
    expect(stop).not.toHaveBeenCalled()
  })

  it('bail dépassé et serveur absent → l’app éteint le téléphone et lève le bail', async () => {
    H.rows.set('late', { geelark_id: 'late', org_id: null, user_id: 'u1', reason: SEEN_RUNNING, stop_at: iso(-6) })
    const stop = vi.fn(async () => {})
    const r = await runClientWatchguard({ listPhones: async () => [{ id: 'late', status: 0 }], stopPhones: stop }, NOW)
    expect(stop).toHaveBeenCalledWith(['late'])
    expect(r.serverLate).toBe(true)
    expect(H.rows.has('late')).toBe(false)
  })
})
