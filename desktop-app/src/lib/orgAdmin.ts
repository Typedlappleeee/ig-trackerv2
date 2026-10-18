// Supprimer une organisation (avec TOUT son contenu) et vider une banque.
// Les fichiers partent d'abord, par l'API Storage : Supabase interdit de les effacer en SQL,
// et le droit de les supprimer disparaît avec l'orga. Puis les lignes, côté serveur, en une
// fois (tout ou rien) — SQL supabase/migrations/20261018_org_delete.sql.
// Avant : supprimer une orga ne supprimait que l'orga ; ses vidéos, téléphones, programmés…
// retombaient dans l'espace perso de chaque membre, et les fichiers restaient stockés.
import { supabase } from './supabase'
import { promptDialog, toast } from './ui'

export type Progress = (msg: string) => void

const MISSING = 'Fonction absente : colle supabase/migrations/20261018_org_delete.sql dans Supabase (SQL Editor → Run).'
function fail(e: { message?: string; code?: string } | null): never {
  const m = e?.message ?? 'Erreur inconnue'
  throw new Error(e?.code === 'PGRST202' || /could not find the function|schema cache/i.test(m) ? MISSING : m)
}

/** Supprime des fichiers du bucket « content » (lots de 100, 4 en parallèle). Renvoie le nombre supprimé. */
async function removeFiles(paths: string[], onProgress?: Progress): Promise<number> {
  const parts: string[][] = []
  for (let i = 0; i < paths.length; i += 100) parts.push(paths.slice(i, i + 100))
  let done = 0, sent = 0, next = 0
  await Promise.all(Array.from({ length: Math.min(4, parts.length) }, async () => {
    while (next < parts.length) {
      const part = parts[next++]
      const { data, error } = await supabase.storage.from('content').remove(part)
      if (!error) done += data?.length ?? 0
      sent += part.length
      onProgress?.(`Suppression des fichiers… ${sent}/${paths.length}`)
    }
  }))
  return done
}

/** Supprime l'orga et tout ce qui lui appartient (banque + fichiers, légendes, téléphones de
 *  la liste, programmés, tâches, historique…). Owner de l'orga ou super admin. */
export async function deleteOrgEverything(org: { id: string; name: string }, onProgress?: Progress): Promise<{ files: number }> {
  onProgress?.('Préparation…')
  const list = await supabase.rpc('sf_org_files', { p_org: org.id })
  if (list.error) fail(list.error)
  const paths = (list.data ?? []) as string[]
  const files = await removeFiles(paths, onProgress)
  // Aucun fichier supprimé alors qu'il y en avait : droits manquants → on n'efface pas les lignes
  // (sinon les fichiers resteraient stockés sans plus aucun moyen de les retrouver).
  if (paths.length && !files) throw new Error('Les fichiers n’ont pas pu être supprimés (droits manquants) : rien n’a été supprimé.')
  onProgress?.('Suppression de l’organisation…')
  const del = await supabase.rpc('sf_delete_org', { p_org: org.id, p_confirm: org.name })
  if (del.error) fail(del.error)
  return { files }
}

/** Vide une banque : toutes les vidéos et images, corbeille comprise, avec leurs fichiers.
 *  orgId = orga (owner / admin / super admin) ; null = ma banque perso. */
export async function emptyBank(orgId: string | null, onProgress?: Progress): Promise<{ files: number; media: number }> {
  onProgress?.('Préparation…')
  const list = await supabase.rpc('sf_bank_files', { p_org: orgId })
  if (list.error) fail(list.error)
  const files = await removeFiles((list.data ?? []) as string[], onProgress)
  onProgress?.('Suppression des médias…')
  const del = await supabase.rpc('sf_empty_bank', { p_org: orgId })
  if (del.error) fail(del.error)
  return { files, media: Number(del.data ?? 0) }
}

/** Confirmation forte : il faut taper le nom exact de l'orga. */
export async function confirmDeleteOrg(name: string): Promise<boolean> {
  const typed = await promptDialog({
    title: `Supprimer « ${name} » ?`,
    text: 'Irréversible : l’organisation et TOUT son contenu sont supprimés — banque (fichiers compris), légendes, téléphones de la liste (pas chez GeeLark), programmés, tâches automatiques, historique et membres. Tape le nom de l’organisation pour confirmer.',
    placeholder: name, confirmLabel: 'Supprimer définitivement', danger: true,
  })
  if (typed === null) return false
  if (typed.trim() !== name.trim()) { toast('Le nom ne correspond pas : rien n’a été supprimé.', 'bad'); return false }
  return true
}

/** Confirmation forte : il faut taper VIDER. orgName null = banque perso. */
export async function confirmEmptyBank(orgName: string | null): Promise<boolean> {
  const typed = await promptDialog({
    title: orgName === null ? 'Vider ta banque perso ?' : `Vider la banque de « ${orgName} » ?`,
    text: 'Irréversible : toutes les vidéos et images (corbeille comprise) et leurs fichiers sont supprimés. Les légendes, téléphones et programmés ne sont pas touchés. Tape VIDER pour confirmer.',
    placeholder: 'VIDER', confirmLabel: 'Vider définitivement', danger: true,
  })
  if (typed === null) return false
  if (!['VIDER', 'EMPTY'].includes(typed.trim().toUpperCase())) { toast('Confirmation incorrecte : rien n’a été supprimé.', 'bad'); return false }
  return true
}
