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
  // On accepte l'hôte Supabase de l'app (SUPABASE_URL) OU tout *.supabase.co /
  // *.supabase.in. C'est robuste même si SUPABASE_URL n'est pas configuré côté
  // serveur (sinon les URLs signées légitimes seraient rejetées → le spoof casse).
  // La protection anti-SSRF-interne repose sur hostIsPrivate + safeMediaFetchOpts
  // (redirect: 'manual', donc une 3xx vers une IP interne n'est jamais suivie) :
  // même un projet Supabase tiers ne peut pas nous faire atteindre un hôte interne.
  const allow = allowedSupabaseHosts()
  const ok = allow.has(host) || /\.supabase\.(co|in)$/.test(host)
  if (!ok) throw new Error('source média non autorisée (doit être un fichier de la banque)')
  return String(raw)
}

// Options fetch sûres pour aller chercher un média : pas de suivi de redirection
// (une 3xx vers un hôte interne contournerait l'allowlist qui ne valide que l'URL
// initiale) + timeout. L'appelant traite un statut 3xx comme un échec (!resp.ok).
function safeMediaFetchOpts(timeoutMs = 30000) {
  return { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }
}

// Fetch d'un média en SUIVANT les redirections MAIS en validant chaque saut
// (anti-SSRF). Nécessaire car les URLs signées Supabase peuvent renvoyer une 3xx
// vers un CDN de stockage : avec redirect:'manual' brut, le téléchargement échoue
// (« Fetch vidéo échoué: 302 »). Ici on suit la redirection uniquement si la
// nouvelle URL passe assertAllowedMediaUrl (hôte Supabase/allowlist, pas d'IP
// interne). `doFetch` est optionnel : permet de réutiliser un wrapper retry/timeout
// de l'appelant ; signature (url, init) => Promise<Response>. Défaut = fetch global.
async function fetchMediaFollow(rawUrl, { maxHops = 5, timeoutMs = 30000, doFetch } = {}) {
  const fetcher = doFetch || ((u, init) => fetch(u, init))
  let url = assertAllowedMediaUrl(rawUrl)
  for (let hop = 0; hop <= maxHops; hop++) {
    const resp = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    const status = resp.status
    if (status >= 300 && status < 400) {
      const loc = resp.headers.get('location')
      if (!loc) return resp // 3xx sans Location : laisse l'appelant gérer (!ok)
      // Résout les Location relatifs sur l'URL courante, puis re-valide l'hôte.
      let next
      try { next = new URL(loc, url).toString() } catch { throw new Error('redirection média invalide') }
      url = assertAllowedMediaUrl(next) // jette si hôte interne / non autorisé
      continue
    }
    return resp
  }
  throw new Error('trop de redirections média')
}

// Un storagePath fourni par le client doit rester dans l'arborescence de l'app
// (videos/users/<id>/… ou videos/orgs/<id>/…) et sans traversée : sinon la clé
// service-role permettrait de lire/supprimer le fichier d'un autre tenant.
// Retourne true si le chemin est acceptable.
function isOwnStoragePath(p) {
  const s = String(p || '')
  return /^videos\/(users|orgs)\/[^/]+\//.test(s) && !s.includes('..')
}

module.exports = { assertAllowedMediaUrl, hostIsPrivate, safeMediaFetchOpts, fetchMediaFollow, isOwnStoragePath }
