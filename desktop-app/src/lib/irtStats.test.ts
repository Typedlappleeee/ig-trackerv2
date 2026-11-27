import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { compactStat, staleAccounts } from './irtStats'

describe('stats Instagram', () => {
  it('compacte la réponse du relais', () => {
    const c = compactStat({ username: 'Abc', followers: 120, following: 3, reels24: 2, views24: 900, viral48: [{ code: 'X1', views: 6200, at: 5, thumb: 'u' }], topReel: { code: 'X1', views: 6200 }, story: true, storyLink: true, at: '2026-11-27T00:00:00Z' })!
    expect(c).toMatchObject({ username: 'abc', followers: 120, reels24: 2, views24: 900, storyLink: true, top: { code: 'X1', views: 6200 } })
    expect(c.viral48).toEqual([{ code: 'X1', views: 6200, at: 5 }])
    expect(compactStat(c)?.top).toEqual({ code: 'X1', views: 6200 })
  })
  it('relit seulement les comptes de plus de 24 h', () => {
    const now = Date.parse('2026-11-27T12:00:00Z')
    const st = { a: { username: 'a', at: '2026-11-27T10:00:00Z' }, b: { username: 'b', at: '2026-11-25T10:00:00Z' } }
    expect(staleAccounts(['@a', '@b', '@c'], st, now)).toEqual(['b', 'c'])
    expect(staleAccounts(['@a'], st, now, true)).toEqual(['a'])
  })
})
