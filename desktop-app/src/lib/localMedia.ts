// Copie LOCALE de quelques médias de la banque, sur cet ordinateur. La banque est en ligne
// (partagée avec l'équipe, les téléphones, les tâches programmées) : sans copie, chaque aperçu
// retéléchargeait la vidéo source (une 4K = 40–80 Mo).
// SEULES les vidéos SOURCES sont gardées (choisies dans Auto-contenu, utilisées pour générer) —
// JAMAIS les imports ni les vidéos générées (elles remplissaient le disque).
// IndexedDB (fonctionne aussi en file:// dans l'app PC). Limite 1 Go (250 Mo par fichier) :
// les moins récemment utilisées sortent d'abord. Clé = chemin dans le stockage (stable).
// « Vider » dans la Banque efface tout (clearLocal).

const DB = 'sf-media-2', OLD_DB = 'sf-media', FILES = 'files', META = 'meta'
const LIMIT = 1024 * 1024 * 1024, MAX_FILE = 250 * 1024 * 1024
interface Meta { path: string; size: number; at: number }

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('indexedDB indisponible')); return }
    // Ancienne copie (gardait aussi les vidéos générées) : supprimée → espace libéré.
    try { indexedDB.deleteDatabase(OLD_DB) } catch { /* ignore */ }
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      const d = r.result
      if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES)
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'path' })
    }
    // Jamais bloquant : si le stockage du navigateur ne répond pas, on fait sans copie locale.
    const t = setTimeout(() => reject(new Error('timeout')), 2000)
    r.onsuccess = () => { clearTimeout(t); resolve(r.result) }
    r.onerror = () => { clearTimeout(t); reject(r.error) }
    r.onblocked = () => { clearTimeout(t); reject(new Error('blocked')) }
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
  return Promise.race([readLocal(path), new Promise<null>(r => setTimeout(() => r(null), 2500))])
}
async function readLocal(path: string): Promise<Blob | null> {
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
  if (!path || !blob.size || blob.size > MAX_FILE) return
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

/** Place occupée par les copies locales (octets). */
export async function localUsage(): Promise<number> {
  try {
    const d = await db()
    const all = await req(d.transaction(META).objectStore(META).getAll()) as Meta[]
    return all.reduce((s, m) => s + m.size, 0)
  } catch { return 0 }
}

/** Efface toutes les copies locales. */
export async function clearLocal(): Promise<void> {
  try {
    const d = await db()
    const tx = d.transaction([FILES, META], 'readwrite')
    tx.objectStore(FILES).clear(); tx.objectStore(META).clear()
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
  } catch { /* ignore */ }
}
