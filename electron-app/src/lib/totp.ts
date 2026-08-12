// Génère un code TOTP (mot de passe à usage unique basé sur le temps) — le même
// code que Google Authenticator / Authy — à partir d'un secret base32.
// Utilisé pour la connexion Instagram avec 2FA (app d'authentification), sans
// dépendre d'un service tiers (ex : twofa.co) : tout est calculé en local via
// Web Crypto (HMAC-SHA1), donc pas de CORS ni de secret envoyé à l'extérieur.

// Décode un secret base32 (RFC 4648) en octets.
function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) continue                     // ignore les caractères hors alphabet
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) { bits -= 8; out.push((value >>> bits) & 0xff) }
  }
  return new Uint8Array(out)
}

// Renvoie le code TOTP courant (6 chiffres, période 30 s, SHA-1 — les valeurs
// par défaut d'Instagram / Google Authenticator).
export async function generateTOTP(secret: string, digits = 6, period = 30): Promise<string> {
  const key = base32Decode(secret)
  if (!key.length) throw new Error('clé 2FA invalide (base32)')

  const counter = Math.floor(Date.now() / 1000 / period)
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(counter / 0x100000000))   // 32 bits de poids fort
  view.setUint32(4, counter >>> 0)                        // 32 bits de poids faible

  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, buf))

  // Troncature dynamique (RFC 6238).
  const offset = sig[sig.length - 1] & 0x0f
  const code = ((sig[offset] & 0x7f) << 24) | ((sig[offset + 1] & 0xff) << 16)
    | ((sig[offset + 2] & 0xff) << 8) | (sig[offset + 3] & 0xff)
  return (code % 10 ** digits).toString().padStart(digits, '0')
}
