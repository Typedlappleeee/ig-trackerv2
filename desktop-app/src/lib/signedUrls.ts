// Liens signés des fichiers de la banque (bucket privé « content »), PARTAGÉS dans toute l'app
// et gardés entre deux ouvertures (localStorage, valables 6 h). Un même fichier garde le même
// lien partout (Banque, Auto-contenu…) → le navigateur réutilise ce qu'il a déjà en cache au
// lieu de tout retélécharger. Avant : chaque écran et chaque rechargement de la liste
// re-signait tout (nouveau jeton = nouvelle URL = vignettes et vidéos rechargées).
// Aucun téléchargement ici : seulement des liens.
import { supabase } from './supabase'

const KEY = 'sf-signed-v1'
const TTL_S = 6 * 3600                 // durée de validité demandée
const MARGIN_MS = 45 * 60_000          // re-signé s'il reste moins de 45 min
type Entry = [url: string, exp: number]

let mem: Record<string, Entry> | null = null
function store(): Record<string, Entry> {
  if (!mem) {
    try { mem = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {} } catch { mem = {} }
    const now = Date.now()
    for (const [k, v] of Object.entries(mem!)) if (!Array.isArray(v) || v[1] - now < MARGIN_MS) delete mem![k]
  }
  return mem!
}
let saveT: ReturnType<typeof setTimeout> | null = null
function save() {
  if (saveT) return
  saveT = setTimeout(() => {
    saveT = null
    try {
      const m = store(), keys = Object.keys(m)
      if (keys.length > 6000) for (const k of keys.slice(0, keys.length - 6000)) delete m[k]
      localStorage.setItem(KEY, JSON.stringify(m))
    } catch { /* stockage plein : on garde en mémoire seulement */ }
  }, 400)
}

/** Lien déjà signé et encore valable (null sinon). */
export function cachedSigned(path: string | null | undefined): string | null {
  if (!path) return null
  const e = store()[path]
  return e && e[1] - Date.now() > MARGIN_MS ? e[0] : null
}

/** Signe les chemins qui n'ont pas encore de lien valable, par lots de 100. `onBatch` reçoit les
 *  nouveaux liens au fil de l'eau ; `lost` = fichiers absents du stockage. */
export async function signPaths(paths: string[], onBatch?: (fresh: Record<string, string>) => void, isCancelled?: () => boolean): Promise<{ lost: string[]; ok: string[] }> {
  const todo = [...new Set(paths.filter(p => p && !cachedSigned(p)))]
  const lost: string[] = [], ok: string[] = []
  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100)
    let res = await supabase.storage.from('content').createSignedUrls(batch, TTL_S)
    if (res.error || !res.data) { await new Promise(r => setTimeout(r, 1500)); res = await supabase.storage.from('content').createSignedUrls(batch, TTL_S) }
    if (isCancelled?.()) break
    if (!res.data) continue
    const fresh: Record<string, string> = {}
    const exp = Date.now() + TTL_S * 1000
    for (const d of res.data) {
      if (d.path && d.signedUrl) { store()[d.path] = [d.signedUrl, exp]; fresh[d.path] = d.signedUrl; ok.push(d.path) }
      else if (d.path && /not.?found|does not exist/i.test(String(d.error ?? ''))) lost.push(d.path)
    }
    save()
    onBatch?.(fresh)
  }
  return { lost, ok }
}

/** Oublie le lien d'un fichier (il n'a pas chargé) : il sera re-signé. */
export function forgetSigned(path: string | null | undefined): void {
  if (path && store()[path]) { delete store()[path]; save() }
}

/** Lien d'un seul fichier (déjà signé si possible). */
export async function signedUrl(path: string): Promise<string | null> {
  const c = cachedSigned(path); if (c) return c
  await signPaths([path])
  return cachedSigned(path)
}
