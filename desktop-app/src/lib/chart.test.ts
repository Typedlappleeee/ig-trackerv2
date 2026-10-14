import { describe, it, expect } from 'vitest'
import { smoothPath } from './chart'

describe('courbe lissée du tableau de bord', () => {
  it('passe par chaque point, un segment de Bézier entre deux points', () => {
    const d = smoothPath([[0, 50], [10, 20], [20, 40], [30, 10]])
    expect(d.startsWith('M0.0,50.0')).toBe(true)
    expect(d.match(/ C/g)).toHaveLength(3)
    expect(d.endsWith('30.0,10.0')).toBe(true)
  })
  it('ne descend jamais sous le sol (pas de creux sous l’axe)', () => {
    const d = smoothPath([[0, 100], [10, 0], [20, 100], [30, 100]], 100)
    const ys = [...d.matchAll(/,(-?\d+\.\d)/g)].map(m => Number(m[1]))
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
  })
  it('vide → chaîne vide', () => { expect(smoothPath([])).toBe('') })
})
