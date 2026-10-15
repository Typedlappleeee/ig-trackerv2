// Dossier de MON PC où enregistrer aussi les vidéos générées (Auto-contenu, Studio), en vrais
// fichiers visibles. Par défaut : aucun (les vidéos vont seulement dans la Banque en ligne).
// API « File System Access » de Chromium (app PC + Chrome/Edge) : l'utilisateur choisit le
// dossier une fois, l'accès est mémorisé (IndexedDB) et redemandé au clic sur « Générer » si
// le navigateur l'a oublié. Non pris en charge (Firefox/Safari) : l'option est masquée.

/* eslint-disable @typescript-eslint/no-explicit-any */
type DirHandle = any
const DB = 'sf-prefs', STORE = 'kv', KEY = 'saveDir'

export const saveDirSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function kv(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<any> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode), r = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(r ? (r as IDBRequest).result : undefined)
    tx.onerror = () => reject(tx.error)
  })
}

/** Dossier choisi (null si aucun). */
export async function getSaveDir(): Promise<DirHandle | null> {
  try { return (await kv('readonly', s => s.get(KEY))) ?? null } catch { return null }
}
/** Ouvre le sélecteur de dossier ; renvoie son nom (null si annulé / non pris en charge). */
export async function pickSaveDir(): Promise<string | null> {
  if (!saveDirSupported()) return null
  try {
    const h = await (window as any).showDirectoryPicker({ id: 'scaleflow-videos', mode: 'readwrite', startIn: 'videos' })
    await kv('readwrite', s => s.put(h, KEY))
    return h.name as string
  } catch { return null }
}
export async function clearSaveDir(): Promise<void> {
  try { await kv('readwrite', s => s.delete(KEY)) } catch { /* ignore */ }
}

/** À appeler au clic (geste utilisateur) : s'assure que l'écriture est autorisée. */
export async function ensureSaveDirAccess(): Promise<boolean> {
  const h = await getSaveDir(); if (!h) return false
  try {
    if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true
    return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted'
  } catch { return false }
}

const safe = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video'

/** Écrit un fichier dans le dossier choisi (sans écraser : « nom (2).mp4 »…). false si impossible. */
export async function writeToSaveDir(name: string, bytes: Uint8Array): Promise<boolean> {
  const h = await getSaveDir(); if (!h) return false
  try {
    if ((await h.queryPermission?.({ mode: 'readwrite' })) !== 'granted') return false
    const dot = name.lastIndexOf('.')
    const base = safe(dot > 0 ? name.slice(0, dot) : name), ext = dot > 0 ? name.slice(dot) : '.mp4'
    let file = `${base}${ext}`
    for (let i = 2; i < 500; i++) {
      try { await h.getFileHandle(file); file = `${base} (${i})${ext}` } catch { break }   // existe → suffixe
    }
    const fh = await h.getFileHandle(file, { create: true })
    const w = await fh.createWritable()
    await w.write(bytes); await w.close()
    return true
  } catch { return false }
}
