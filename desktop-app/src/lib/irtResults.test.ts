import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { aggregateResults, type IrtResultEntry } from './irtResults'

const e = (name: string, action: IrtResultEntry['action'], ok: boolean, at: number, device = 'd1', error?: string): IrtResultEntry => ({ name, action, ok, at, device, phone: device === 'd1' ? 'SEDRA1' : 'SEDRA2', ...(error ? { error } : {}) })

describe('aggregateResults', () => {
  it('compte réussites et échecs par compte et par action', () => {
    const r = aggregateResults([e('@a', 'reel', true, 10), e('@a', 'reel', false, 20, 'd1', 'x'), e('@A', 'story', true, 30), e('@a', 'reel', true, 40, 'd2'), e('@b', 'warmup', true, 5)])
    expect(r).toHaveLength(3)
    const a = r.find(x => x.device === 'd1' && x.name === '@a')!
    expect(a.by.reel).toMatchObject({ ok: 1, err: 1, lastOk: 10, lastErr: 20, lastError: 'x' })
    expect(a.by.story.ok).toBe(1)
    expect(a.last).toBe(30)
  })
  it('ignore les entrées avant la période', () => {
    expect(aggregateResults([e('@a', 'reel', true, 10)], 11)).toHaveLength(0)
  })
})
