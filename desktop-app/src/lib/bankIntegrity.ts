// Médias de la Banque dont le FICHIER n'existe plus dans le stockage (supprimé, restauration ratée…) : la ligne restait
// visible et choisie par les lancements → « fichier introuvable » et post raté (vu le 27/11/2026). Détection par
// createSignedUrls (une erreur « object does not exist » par fichier absent), 500 chemins par appel, résultat gardé en
// mémoire pour la session. Les médias cassés sont retirés des listes ET mis à la corbeille (deleted_at).
import { supabase } from './supabase'

const known = new Map<string, boolean>()   // chemin → existe
const MISSING = /exist|not.?found|404/i

/** Chemins absents du stockage (seuls les cas CERTAINS : une erreur réseau ne rend jamais un fichier « absent »). */
export async function missingPaths(paths: string[]): Promise<Set<string>> {
  const todo = [...new Set(paths.filter(p => p && !known.has(p)))]
  for (let i = 0; i < todo.length; i += 500) {
    const batch = todo.slice(i, i + 500)
    const { data, error } = await supabase.storage.from('content').createSignedUrls(batch, 60)
    if (error || !data) continue
    for (const d of data) {
      if (!d.path) continue
      if (d.signedUrl) known.set(d.path, true)
      else if (d.error && MISSING.test(String(d.error))) known.set(d.path, false)
    }
  }
  return new Set(paths.filter(p => known.get(p) === false))
}

/** Retire les médias dont le fichier est absent ; les met à la corbeille en tâche de fond (une seule fois). */
const trashed = new Set<string>()
export async function dropBroken<T extends { id: string; storage_path?: string | null; tags?: string[] | null }>(rows: T[], onTrashed?: (n: number) => void): Promise<T[]> {
  const miss = await missingPaths(rows.map(r => r.storage_path ?? '').filter(Boolean))
  if (!miss.size) return rows
  const bad = rows.filter(r => r.storage_path && miss.has(r.storage_path))
  const fresh = bad.filter(r => !trashed.has(r.id))
  if (fresh.length) {
    fresh.forEach(r => trashed.add(r.id))
    const now = new Date().toISOString()
    const ids = fresh.map(r => r.id)
    void (async () => {
      for (let i = 0; i < ids.length; i += 200) await supabase.from('content_bank').update({ deleted_at: now }).in('id', ids.slice(i, i + 200))
    })().then(() => onTrashed?.(fresh.length), () => undefined)
  }
  const badIds = new Set(bad.map(r => r.id))
  return rows.filter(r => !badIds.has(r.id))
}
