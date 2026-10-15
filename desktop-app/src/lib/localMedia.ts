// Copie LOCALE des médias de la banque, sur cet ordinateur. La banque est en ligne (partagée avec
// l'équipe, les téléphones, les tâches programmées) : sans copie locale, chaque aperçu ou
// génération retéléchargeait la vidéo (une 4K = 40–80 Mo). Ici :
// - toute vidéo ajoutée depuis ce PC (import, sorties générées) est gardée tout de suite ;
// - une vidéo déjà en ligne est gardée après sa 1re lecture ;
// → aperçus et générations instantanés, même après avoir fermé l'app.
// IndexedDB (fonctionne aussi en file:// dans l'app PC). Limite 4 Go : les plus anciennes
// (dernière utilisation) sortent d'abord. Clé = chemin dans le stockage (stable).

const DB = 'sf-media', FILES = 'files', META = 'meta'
const LIMIT = 4 * 1024 * 1024 * 1024
interface Meta { path: string; size: number; at: number }

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('indexedDB indisponible')); return }
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      const d = r.result
      if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES)
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'path' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  dbp.catch(() => { dbp = null })
  // Demande au navigateur de ne pas effacer ce stockage de lui-même.
  try { void navigator.storage?.persist?.() } catch { /* ignore */ }
  return dbp
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

/** Copie locale d'un média (null si absente). Met à jour sa date d'utilisation. */
export async function getLocal(path: string | null | undefined): Promise<Blob | null> {
  if (!path) return null
  try {
    const d = await db()
    const blob = await req(d.transaction(FILES).objectStore(FILES).get(path)) as Blob | undefined
    if (!blob) return null
    void req(d.transaction(META, 'readwrite').objectStore(META).put({ path, size: blob.size, at: Date.now() } satisfies Meta)).catch(() => {})
    return blob
  } catch { return null }
}

/** Garde une copie locale (silencieux en cas d'échec : simple accélérateur). */
export async function putLocal(path: string | null | undefined, blob: Blob): Promise<void> {
  if (!path || !blob.size || blob.size > LIMIT / 4) return
  try {
    const d = await db()
    const tx = d.transaction([FILES, META], 'readwrite')
    tx.objectStore(FILES).put(blob, path)
    tx.objectStore(META).put({ path, size: blob.size, at: Date.now() } satisfies Meta)
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error) })
    await evict(d)
  } catch { /* stockage plein / indisponible : on continue sans copie */ }
}

async function evict(d: IDBDatabase): Promise<void> {
  const all = await req(d.transaction(META).objectStore(META).getAll()) as Meta[]
  let total = all.reduce((s, m) => s + m.size, 0)
  if (total <= LIMIT) return
  const tx = d.transaction([FILES, META], 'readwrite')
  for (const m of all.sort((a, b) => a.at - b.at)) {
    if (total <= LIMIT * 0.85) break
    tx.objectStore(FILES).delete(m.path); tx.objectStore(META).delete(m.path); total -= m.size
  }
}
