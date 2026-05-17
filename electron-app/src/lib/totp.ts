// TOTP (RFC 6238) — Web Crypto API, no external dependencies

function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/[\s=]/g, '')
  const output = new Uint8Array(Math.ceil(clean.length * 5 / 8))
  let bits = 0, value = 0, idx = 0
  for (const ch of clean) {
    const charIdx = alphabet.indexOf(ch)
    if (charIdx === -1) continue
    value = (value << 5) | charIdx
    bits += 5
    if (bits >= 8) { output[idx++] = (value >>> (bits - 8)) & 0xff; bits -= 8 }
  }
  return output.slice(0, idx)
}

export async function generateTOTP(secret: string, digits = 6, period = 30): Promise<string> {
  const keyBytes = base32Decode(secret.replace(/\s/g, '')).buffer.slice(0) as ArrayBuffer
  const T = Math.floor(Date.now() / 1000 / period)

  // 8-byte big-endian time counter
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(T / 0x100000000), false)
  view.setUint32(4, T >>> 0, false)

  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf))

  const offset = sig[19] & 0x0f
  const code = (
    ((sig[offset]     & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8)  |
     (sig[offset + 3] & 0xff)
  ) % (10 ** digits)

  return code.toString().padStart(digits, '0')
}

/** Seconds until the current TOTP code expires */
export function totpSecondsLeft(period = 30): number {
  return period - (Math.floor(Date.now() / 1000) % period)
}
