// Téléchargement ACCÉLÉRÉ d'une vidéo (aperçu Auto-contenu) : le fichier est récupéré en
// morceaux de 4 Mo, plusieurs en parallèle (requêtes Range). Une seule connexion au stockage
// plafonne bien en dessous du débit du wifi : une vidéo 4K (40–80 Mo) « mettait du temps à
// charger » en lecture directe. Fait EN ARRIÈRE-PLAN pendant que la lecture directe reste
// disponible ; une fois complète, la vidéo est lue depuis la mémoire (fluide) et gardée sur le
// PC (lib/localMedia) — la génération réutilise aussi ces octets au lieu de retélécharger.

export interface FetchProgress { loaded: number; total: number | null }
type Fetch = typeof fetch

const CHUNK = 4 * 1024 * 1024
const PARALLEL = 6

/** Télécharge `url` en morceaux parallèles. Repli : téléchargement simple si le serveur
 *  ignore les requêtes Range. */
export async function fetchFast(url: string, onProgress?: (p: FetchProgress) => void, signal?: AbortSignal, f: Fetch = fetch, maxBytes = Infinity): Promise<Blob> {
  const first = await f(url, { headers: { Range: `bytes=0-${CHUNK - 1}` }, signal })
  if (!first.ok) throw new Error(`HTTP ${first.status}`)
  const type = first.headers.get('content-type') ?? 'video/mp4'
  // Pas de Range (200) : lecture du flux entier avec progression.
  if (first.status !== 206) return readAll(first, type, onProgress)
  const head = await first.arrayBuffer()
  const cr = first.headers.get('content-range')          // « bytes 0-4194303/56000000 » (si exposé)
  const total = cr && /\/(\d+)$/.test(cr) ? Number(cr.match(/\/(\d+)$/)![1]) : null
  if (total !== null && total > maxBytes) throw new Error('too-big')
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
