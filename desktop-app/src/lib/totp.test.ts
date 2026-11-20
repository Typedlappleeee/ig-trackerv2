import { describe, it, expect } from 'vitest'
import { totp, base32Decode, normalizeTotpKey } from './totp'

// RFC 6238, annexe B : secret ASCII « 12345678901234567890 » (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ)
const K = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
describe('2FA (TOTP)', () => {
  it('vecteurs officiels RFC 6238 (SHA-1)', async () => {
    expect(await totp(K, 59_000, 8)).toBe('94287082')
    expect(await totp(K, 1111111109_000, 8)).toBe('07081804')
    expect(await totp(K, 1234567890_000, 8)).toBe('89005924')
    expect(await totp(K, 59_000)).toBe('287082')
  })
  it('clé lue à l’écran : espaces / minuscules tolérés, texte quelconque refusé', () => {
    expect(normalizeTotpKey('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toBe(K)
    expect(normalizeTotpKey('Copy key')).toBeNull()
    expect(base32Decode('!!')).toBeNull()
  })
})
