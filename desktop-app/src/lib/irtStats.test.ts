import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { compactStat, staleAccounts, accountHealth } from './irtStats'

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

describe('état des comptes', () => {
  const now = Date.parse('2026-11-27T12:00:00Z'), d = 864e5
  const st = (views: number[]) => ({ username: 'a', at: '', recent: views.map((v, i) => ({ at: now - (i + 2) * d, views: v })) })
  it('introuvable / privé', () => {
    expect(accountHealth({ username: 'a', at: '', missing: true }, now)).toBe('banned')
    expect(accountHealth({ username: 'a', at: '', private: true }, now)).toBe('private')
  })
  it('portée en chute et très faible', () => {
    expect(accountHealth(st([20, 30, 25, 900, 1200, 800]), now)).toBe('drop')
    expect(accountHealth(st([5, 8, 3, 9, 4, 6]), now)).toBe('low')
    expect(accountHealth(st([400, 500, 300, 600, 700, 450]), now)).toBe('ok')
  })
})
