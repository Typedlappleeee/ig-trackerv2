// Garde SSRF partagée pour les fonctions serverless qui vont chercher une URL
// média fournie par le client. Les fichiers *_préfixés `_` ne sont PAS des routes
// Vercel — c'est un simple module partagé.
//
// Principe : tout média légitime provient d'une URL signée Supabase (la banque).
// On n'autorise donc QUE l'hôte de stockage Supabase du projet, et on bloque les
// IP privées / metadata / services internes (anti-exfiltration).

const net = require('net')

function hostIsPrivate(hostRaw) {
  const h = String(hostRaw || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true
  if (net.isIP(h)) {
    if (/^127\./.test(h)) return true            // loopback
    if (/^10\./.test(h)) return true             // 10/8
    if (/^192\.168\./.test(h)) return true       // 192.168/16
    if (/^169\.254\./.test(h)) return true       // link-local (metadata 169.254.169.254)
    if (/^0\./.test(h)) return true              // 0.0.0.0/8
    const m = h.match(/^172\.(\d+)\./)           // 172.16/12
    if (m && +m[1] >= 16 && +m[1] <= 31) return true
    if (h === '::1' || h === '::') return true   // IPv6 loopback / unspecified
    if (/^f[cd]/.test(h)) return true            // fc00::/7 unique-local
    if (/^fe80/.test(h)) return true             // link-local
    if (/^::ffff:/.test(h)) return true          // IPv4-mapped IPv6 (bypass classique)
  }
  return false
}

function allowedSupabaseHosts() {
  const set = new Set()
  const envUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  try { if (envUrl) set.add(new URL(envUrl).hostname.toLowerCase()) } catch { /* ignore */ }
  return set
}

// Jette une Error si l'URL n'est pas une source média autorisée (à catcher par
// l'appelant → renvoie {ok:false,error} au client).
function assertAllowedMediaUrl(raw) {
  let u
  try { u = new URL(String(raw)) } catch { throw new Error('URL média invalide') }
  if (u.protocol !== 'https:') throw new Error('URL média : https requis')
  const host = u.hostname.toLowerCase()
  if (hostIsPrivate(host)) throw new Error('hôte non autorisé')
  // UNIQUEMENT l'hôte Supabase de CETTE app (pas *.supabase.co : un attaquant
  // pourrait créer son propre projet Supabase et y héberger une Edge Function qui
  // redirige vers 169.254.169.254). Les médias légitimes viennent tous de la
  // banque, donc du même hôte que SUPABASE_URL.
  const allow = allowedSupabaseHosts()
  if (!allow.has(host)) throw new Error('source média non autorisée (doit être un fichier de la banque)')
  return String(raw)
}

// Options fetch sûres pour aller chercher un média : pas de suivi de redirection
// (une 3xx vers un hôte interne contournerait l'allowlist qui ne valide que l'URL
// initiale) + timeout. L'appelant traite un statut 3xx comme un échec (!resp.ok).
function safeMediaFetchOpts(timeoutMs = 30000) {
  return { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }
}

// Un storagePath fourni par le client doit rester dans l'arborescence de l'app
// (videos/users/<id>/… ou videos/orgs/<id>/…) et sans traversée : sinon la clé
// service-role permettrait de lire/supprimer le fichier d'un autre tenant.
// Retourne true si le chemin est acceptable.
function isOwnStoragePath(p) {
  const s = String(p || '')
  return /^videos\/(users|orgs)\/[^/]+\//.test(s) && !s.includes('..')
}

module.exports = { assertAllowedMediaUrl, hostIsPrivate, safeMediaFetchOpts, isOwnStoragePath }
