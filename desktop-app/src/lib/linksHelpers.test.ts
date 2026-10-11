import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { makeCode, buttonIndexFor, slugify } from '@/pages/Links'

describe('création automatique des liens', () => {
  it('code = @ du compte, suffixé si déjà pris', () => {
    const t = new Set(['luna.dodow'.replace('.', '-')])
    expect(makeCode('luna.dodow', t)).toBe('luna-dodow2')
    expect(makeCode('Léa Officiel', new Set())).toBe('lea-officiel')
    expect(slugify('@Luna_Cute 01')).toBe('luna-cute-01')
  })
  it('bouton qui reçoit le lien OF / MYM : par URL/texte, sinon par position', () => {
    const b = [{ label: 'Telegram', url: 'https://t.me/x' }, { label: 'Mon MYM', url: '' }, { label: 'OF', url: 'https://onlyfans.com/x' }]
    expect(buttonIndexFor(b, 'of')).toBe(2)
    expect(buttonIndexFor(b, 'mym')).toBe(1)
    expect(buttonIndexFor([{ label: 'A', url: '' }, { label: 'B', url: '' }], 'mym')).toBe(1)
  })
})
