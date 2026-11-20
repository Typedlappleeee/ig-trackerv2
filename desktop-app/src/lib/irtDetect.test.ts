import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn() }))
import { sortContainerNames } from './iremotechVision'

describe('iRemoTech — containers détectés', () => {
  it('Default en premier puis ordre numérique, sans doublon ni bruit OCR', () => {
    expect(sortContainerNames(['12', '3', 'default', '3', '07', 'Defaul', 'abc', '1'])).toEqual(['Default', '1', '3', '7', '12'])
  })
})
