// Téléchargement ACCÉLÉRÉ d'une vidéo (lecteur de la Banque / Auto-contenu) : le fichier est
// récupéré en morceaux de 4 Mo, plusieurs en parallèle (requêtes Range). Une seule connexion
// au stockage plafonne bien en dessous du débit du wifi : une vidéo 4K (40–80 Mo) « chargeait
// beaucoup » et saccadait en lecture directe. Une fois complète, elle est lue depuis la mémoire
// (fluide, avance rapide instantanée) et gardée en cache (LRU) pour la rouvrir sans attendre.

export interface FetchProgress { loaded: number; total: number | null }
type Fetch = typeof fetch

const CHUNK = 4 * 1024 * 1024
const PARALLEL = 6

/** Télécharge `url` en morceaux parallèles. Repli : téléchargement simple si le serveur
 *  ignore les requêtes Range. */
export async function fetchFast(url: string, onProgress?: (p: FetchProgress) => void, signal?: AbortSignal, f: Fetch = fetch): Promise<Blob> {
  const first = await f(url, { headers: { Range: `bytes=0-${CHUNK - 1}` }, signal })
  if (!first.ok) throw new Error(`HTTP ${first.status}`)
  const type = first.headers.get('content-type') ?? 'video/mp4'
  // Pas de Range (200) : lecture du flux entier avec progression.
  if (first.status !== 206) return readAll(first, type, onProgress)
  const head = await first.arrayBuffer()
  const cr = first.headers.get('content-range')          // « bytes 0-4194303/56000000 » (si exposé)
  const total = cr && /\/(\d+)$/.test(cr) ? Number(cr.match(/\/(\d+)$/)![1]) : null
  let loaded = head.byteLength
  onProgress?.({ loaded, total })
  if (head.byteLength < CHUNK || (total !== null && total <= head.byteLength)) return new Blob([head], { type })

  // Morceaux suivants : jusqu'à la taille connue, sinon jusqu'à un morceau incomplet / 416.
  const parts: ArrayBuffer[] = [head]
  let next = 1, end = total !== null ? Math.ceil(total / CHUNK) : Infinity
  const one = async (i: number): Promise<void> => {
    const from = i * CHUNK, to = total !== null ? Math.min(total, from + CHUNK) - 1 : from + CHUNK - 1
    const r = await f(url, { headers: { Range: `bytes=${from}-${to}` }, signal })
    if (r.status === 416) { end = Math.min(end, i); return }           // au-delà de la fin
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const buf = await r.arrayBuffer()
    if (r.status === 200) throw new Error('range-ignored')               // serveur incohérent
    parts[i] = buf
    loaded += buf.byteLength
    onProgress?.({ loaded, total })
    if (buf.byteLength < to - from + 1) end = Math.min(end, i + 1)       // dernier morceau
  }
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < end) { const i = next++; await one(i) }
  }))
  return new Blob(parts.slice(0, Math.min(parts.length, end === Infinity ? parts.length : end)).filter(Boolean), { type })
}

async function readAll(res: Response, type: string, onProgress?: (p: FetchProgress) => void): Promise<Blob> {
  const total = Number(res.headers.get('content-length')) || null
  if (!res.body) return new Blob([await res.arrayBuffer()], { type })
  const reader = res.body.getReader(), chunks: BlobPart[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value as BlobPart); loaded += value.byteLength
    onProgress?.({ loaded, total })
  }
  return new Blob(chunks, { type })
}

// ── Cache mémoire des vidéos déjà ouvertes (URL blob), clé = chemin sans le jeton ──
const MAX_BYTES = 400 * 1024 * 1024
const cache = new Map<string, { url: string; size: number }>()
export const cacheKey = (url: string) => url.split('?')[0]
export function cachedVideo(url: string): string | null {
  const k = cacheKey(url), hit = cache.get(k)
  if (!hit) return null
  cache.delete(k); cache.set(k, hit)                    // le plus récent en dernier
  return hit.url
}
export function rememberVideo(url: string, blob: Blob): string {
  const k = cacheKey(url)
  const old = cache.get(k); if (old) { URL.revokeObjectURL(old.url); cache.delete(k) }
  const entry = { url: URL.createObjectURL(blob), size: blob.size }
  cache.set(k, entry)
  let sum = [...cache.values()].reduce((s, e) => s + e.size, 0)
  for (const [key, e] of cache) {
    if (sum <= MAX_BYTES || key === k) break
    URL.revokeObjectURL(e.url); cache.delete(key); sum -= e.size
  }
  return entry.url
}
