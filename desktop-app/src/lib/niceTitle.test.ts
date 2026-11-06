import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { isUglyTitle, prefixFor, maxNumber, numbered } from './niceTitle'
describe('noms propres', () => {
  it('repère les noms techniques', () => {
    expect(isUglyTitle('hf_20261104_124000_2845c642-3602-4c9a-ac07-47ae1991d1fc')).toBe(true)
    expect(isUglyTitle('hf_20261104_124000_2845c642 · v2')).toBe(true)
    expect(isUglyTitle('5674172E-867F-485D-AF20-C9295DC1AC12')).toBe(true)
    expect(isUglyTitle('Zoe 012')).toBe(false)
    expect(isUglyTitle('IMG_0638')).toBe(false)
    expect(isUglyTitle('hfx clip')).toBe(false)
  })
  it('numérote après le plus grand', () => {
    expect(prefixFor('Genjutsu/Zoe')).toBe('Zoe'); expect(prefixFor(null)).toBe('Média')
    expect(maxNumber('Zoe', ['Zoe 007', 'Zoe 012 · v2', 'zoe 3', 'Zoey 99', null])).toBe(12)
    expect(numbered('Zoe', 13)).toBe('Zoe 013')
  })
})
