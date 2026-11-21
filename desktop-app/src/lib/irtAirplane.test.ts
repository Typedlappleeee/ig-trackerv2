import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
const calls: unknown[] = []
let ips = ['1.1.1.1', '2.2.2.2']
vi.mock('./iremotech', () => ({
  snapshot: vi.fn(async () => null),
  sendAction: vi.fn(async (_k: string, _d: string, a: unknown) => { calls.push(a); return true }),
  deviceIp: vi.fn(async () => ips.shift() ?? null),
}))
import { airplaneReset } from './iremotechVision'

describe('iRemoTech — nouvelle IP par le mode avion natif', () => {
  it('sortie d’Instagram (accueil) PUIS avion ON / OFF par l’action native, IP relue avant/après', async () => {
    vi.useFakeTimers()
    const log: string[] = []
    const p = airplaneReset('k', 'd', { log: m => log.push(m) }, 10)
    await vi.runAllTimersAsync(); await p
    vi.useRealTimers()
    expect(calls).toEqual([{ type: 'press', name: 'home' }, { type: 'airplane', on: true }, { type: 'airplane', on: false }])
    expect(log.join('\n')).toContain('1.1.1.1')
    expect(log.join('\n')).toContain('nouvelle IP ✓ 2.2.2.2')
  })
})
