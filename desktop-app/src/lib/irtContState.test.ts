import { describe, it, expect } from 'vitest'
import { containersToFill } from './irtContState'
import { profileHeaderUsername } from './iremotechVision'
import { vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))

describe('containers — état lu à l’écran', () => {
  const st = { '1': { state: 'account' as const, username: 'a', at: 0 }, '2': { state: 'empty' as const, at: 0 }, '3': { state: 'blocked' as const, at: 0 } }
  it('vides + jamais vérifiés ; comptes seulement si on les déconnecte ; jamais un bloqué', () => {
    expect(containersToFill(['1', '2', '3', '4'], st, false)).toEqual(['2', '4'])
    expect(containersToFill(['1', '2', '3', '4'], st, true)).toEqual(['1', '2', '4'])
  })
})

describe('identifiant en haut du profil', () => {
  const W = 406, H = 720
  it('mot du bandeau du haut, chevron « v » collé retiré grâce aux comptes connus', () => {
    expect(profileHeaderUsername([{ text: 'aliceha2nbxv', cx: 200, cy: 47 }, { text: 'posts', cx: 70, cy: 162 }], W, H, ['aliceha2nbx'])).toBe('aliceha2nbx')
  })
  it('compte inconnu → lu tel quel ; heure / réseau ignorés', () => {
    expect(profileHeaderUsername([{ text: '9:45', cx: 200, cy: 8 }, { text: 'mia.lopez_22', cx: 200, cy: 47 }], W, H)).toBe('mia.lopez_22')
  })
  it('rien en haut → null', () => {
    expect(profileHeaderUsername([{ text: 'posts', cx: 70, cy: 162 }], W, H)).toBeNull()
  })
})
