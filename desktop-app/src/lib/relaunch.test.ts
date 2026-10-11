import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./geelark', () => ({ onGeelarkTask: () => () => {} }))
const mem = new Map<string, string>()
;(globalThis as any).sessionStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } }
import { relaunchFromDetails, setRelaunch, peekRelaunch, takeRelaunch } from './runHistory'

describe('relance des échecs', () => {
  it('ne garde que les comptes échoués (pas les réussis ni ceux encore en cours)', () => {
    const r = relaunchFromDetails([
      { name: 'a', ok: true, phone_id: 'p1', media_id: 'v1', kind: 'reels' },
      { name: 'b', ok: false, error: 'x', phone_id: 'p2', media_id: 'v2', kind: 'reels' },
      { name: 'c', ok: false, pending: true, phone_id: 'p3', media_id: 'v3', kind: 'reels' },
      { name: 'd', ok: false, error: 'y', phone_id: 'p4', media_id: 'v2', kind: 'reels' },
    ])
    expect(r).toEqual({ kind: 'reels', phoneIds: ['p2', 'p4'], mediaIds: ['v2'] })
  })
  it('ancien run sans infos de relance → rien', () => {
    expect(relaunchFromDetails([{ name: 'a', ok: false, error: 'x' }])).toBeNull()
  })
  it('lecture unique, et seulement par le bon composer', () => {
    setRelaunch({ kind: 'tiktok', phoneIds: ['p'], mediaIds: [] })
    expect(takeRelaunch('reels')).toBeNull()
    expect(peekRelaunch()?.kind).toBe('tiktok')
    expect(takeRelaunch('tiktok')?.phoneIds).toEqual(['p'])
    expect(peekRelaunch()).toBeNull()
  })
})
