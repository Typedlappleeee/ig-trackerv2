// Genjutsu : rangement des modèles partagé dans l'espace (agence ou perso).
// Mini-dossiers (« Kenza · 5 ») et modèles masquées sont dans la table genjutsu_model_layout,
// une ligne par modèle : toute l'agence voit le même rangement. Sans la table (SQL pas encore
// passé), la page garde le rangement de ce navigateur comme avant.
import { supabase } from './supabase'
import type { BankScope } from './bankFolders'

export interface GjLayout { groups: Record<string, string>; hidden: string[] }
interface Row { model_id: string; grp: string | null; hidden: boolean }
const space = (s: BankScope) => s.orgId ?? `u:${s.userId}`

/** Rangement de l'espace, ou null si la table n'existe pas encore. */
export async function loadGjLayout(s: BankScope): Promise<GjLayout | null> {
  const { data, error } = await supabase.from('genjutsu_model_layout').select('model_id, grp, hidden').eq('space', space(s)).limit(5000)
  if (error) { if (/relation|does not exist|schema cache|not find/i.test(error.message)) return null; throw new Error(error.message) }
  return rowsToLayout((data ?? []) as Row[])
}
export function rowsToLayout(rows: Row[]): GjLayout {
  const groups: Record<string, string> = {}, hidden: string[] = []
  for (const r of rows) { if (r.grp) groups[r.model_id] = r.grp; if (r.hidden) hidden.push(r.model_id) }
  return { groups, hidden }
}

/** Fusion avec le rangement gardé sur ce navigateur : l'espace a toujours raison ; ce qui n'existe
 *  que sur ce navigateur (rangement fait avant le partage) est ajouté et envoyé à l'espace. */
export function mergeLayout(remote: GjLayout, local: GjLayout): { merged: GjLayout; push: { model_id: string; grp?: string; hidden?: boolean }[] } {
  const groups = { ...remote.groups }, hidden = new Set(remote.hidden), push: { model_id: string; grp?: string; hidden?: boolean }[] = []
  for (const [id, g] of Object.entries(local.groups)) if (g && !(id in groups)) { groups[id] = g; push.push({ model_id: id, grp: g }) }
  for (const id of local.hidden) if (!hidden.has(id)) { hidden.add(id); const p = push.find(x => x.model_id === id); if (p) p.hidden = true; else push.push({ model_id: id, hidden: true }) }
  return { merged: { groups, hidden: [...hidden] }, push }
}

async function upsert(s: BankScope, rows: { model_id: string; grp?: string | null; hidden?: boolean }[]) {
  // un envoi par forme de ligne : une colonne absente d'une ligne ne doit pas effacer la valeur déjà en base
  const batches = new Map<string, typeof rows>()
  for (const r of rows) { const k = `${'grp' in r}|${'hidden' in r}`; batches.set(k, [...(batches.get(k) ?? []), r]) }
  for (const list of batches.values()) {
    const { error } = await supabase.from('genjutsu_model_layout').upsert(
      list.map(r => ({ org_id: s.orgId, user_id: s.userId, model_id: r.model_id, ...('grp' in r ? { grp: r.grp } : {}), ...('hidden' in r ? { hidden: r.hidden } : {}), updated_at: new Date().toISOString() })),
      { onConflict: 'space,model_id' })
    if (error) throw new Error(error.message)
  }
}
export const pushGjLayout = upsert
export const saveGjGroup = (s: BankScope, modelId: string, grp: string) => upsert(s, [{ model_id: modelId, grp }])
export const hideGjModel = (s: BankScope, modelId: string) => upsert(s, [{ model_id: modelId, hidden: true }])
