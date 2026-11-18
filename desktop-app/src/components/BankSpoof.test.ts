import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { planSpoofCopies } from './BankSpoof'

describe('Banque — spoofer en copies', () => {
  it('N copies par média, numérotées, appareil fixe ou tiré par copie', () => {
    const p = planSpoofCopies(['a', 'b'], 3, 'iphone15')
    expect(p).toHaveLength(6)
    expect(p.map(x => `${x.item}${x.n}`)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3'])
    expect(new Set(p.map(x => x.device))).toEqual(new Set(['iphone15']))
    const r = planSpoofCopies(['a'], 4, 'random')
    expect(r.every(x => x.device !== 'random' && x.device !== 'none')).toBe(true)
  })
  it('borne le nombre de copies (1 à 20)', () => {
    expect(planSpoofCopies(['a'], 0, 'x')).toHaveLength(1)
    expect(planSpoofCopies(['a'], 99, 'x')).toHaveLength(20)
  })
})
