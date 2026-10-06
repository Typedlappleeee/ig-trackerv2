import { describe, it, expect } from 'vitest'
import { isReleased, releaseLabel } from './releases'

describe('releases', () => {
  it('verrouillé avant le 11/10, débloqué dès minuit le 11/10', () => {
    expect(isReleased('flowBuilder', new Date(2026, 9, 10, 23, 59))).toBe(false)
    expect(isReleased('flowBuilder', new Date(2026, 9, 11, 0, 0))).toBe(true)
    expect(isReleased('massEdit', new Date(2026, 9, 12))).toBe(true)
  })
  it('libellé', () => expect(releaseLabel('massEdit')).toBe('11/10'))
})
