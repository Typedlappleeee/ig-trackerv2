// Codes 2FA (TOTP, RFC 6238 — ce que font Google Authenticator & co) à partir de la clé secrète en base32.
// Sert à activer la double authentification Instagram sans application : ScaleFlow lit la clé à l'écran,
// calcule le code à 6 chiffres et le saisit ; la clé est gardée avec le compte (username:password:2fa).

/** Clé base32 (espaces/tirets/minuscules tolérés) → octets ; null si invalide. */
export function base32Decode(input: string): Uint8Array | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of s) {
    const v = A.indexOf(ch)
    if (v < 0) return null
    value = (value << 5) | v; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return out.length ? new Uint8Array(out) : null
}

/** Clé lue à l'écran → forme normalisée (majuscules, sans espaces), null si ce n'est pas une clé plausible. */
export function normalizeTotpKey(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[\s-]/g, '')
  return /^[A-Z2-7]{16,64}$/.test(s) && base32Decode(s) ? s : null
}

/** Code TOTP (SHA-1, pas de 30 s) pour l'instant `at` (ms). */
export async function totp(secret: string, at = Date.now(), digits = 6, step = 30): Promise<string> {
  const key = base32Decode(secret)
  if (!key) throw new Error('clé 2FA invalide')
  const counter = Math.floor(at / 1000 / step)
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256) }
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg))
  const o = h[h.length - 1] & 0x0f
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}
