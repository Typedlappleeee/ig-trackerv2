// Noms de containers Crane définis par l'utilisateur POUR CHAQUE iPhone iRemoTech.
// Partagés dans l'agence et synchronisés EN TEMPS RÉEL via Supabase (iremotech_device_meta
// .containers, SQL 20261028_irt_containers.sql) ; le localStorage sert de cache immédiat (et
// de repli si le SQL n'est pas encore passé). Utilisés par le Studio iRemoTech et Phone Farm.
import { supabase } from './supabase'

type Scope = { orgId: string | null; userId: string }
let scope: Scope | null = null
const scopeRow = (s: Scope) => s.orgId ? { scope_id: s.orgId, is_org: true } : { scope_id: s.userId, is_org: false }
/** Espace courant (orga ou perso) : les modifications sont envoyées à Supabase pour cet espace. */
export function setContainerScope(orgId: string | null, userId: string): void { scope = { orgId, userId } }

export function loadDevContainers(deviceId: string): string[] {
  try { const raw = localStorage.getItem(`sf-irt-containers:${deviceId}`); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : [] }
  catch { return [] }
}
function cache(deviceId: string, list: string[]): void {
  try { localStorage.setItem(`sf-irt-containers:${deviceId}`, JSON.stringify(list)) } catch { /* noop */ }
}
// Envoi à Supabase (en arrière-plan) : les autres pages et PC le reçoivent en direct.
function push(deviceId: string, list: string[]): void {
  if (!scope) return
  void supabase.from('iremotech_device_meta').upsert(
    { ...scopeRow(scope), device_id: deviceId, containers: list, updated_at: new Date().toISOString() },
    { onConflict: 'scope_id,device_id' },
  ).then(() => undefined, () => undefined)
}
export function saveDevContainers(deviceId: string, list: string[]): void {
  cache(deviceId, list)
  push(deviceId, list)
}
export function addDevContainer(deviceId: string, name: string): string[] {
  const clean = name.trim()
  if (!clean) return loadDevContainers(deviceId)
  const list = [...new Set([...loadDevContainers(deviceId), clean])]
  saveDevContainers(deviceId, list)
  return list
}
export function removeDevContainer(deviceId: string, name: string): string[] {
  const list = loadDevContainers(deviceId).filter(c => c !== name)
  saveDevContainers(deviceId, list)
  return list
}

/** Récupère les containers de l'espace depuis Supabase et met le cache à jour. La première
 *  fois sur ce navigateur, les containers enregistrés localement auparavant sont ajoutés
 *  (rien n'est perdu) ; ensuite, Supabase fait foi (une suppression ailleurs est suivie).
 *  null = synchro indisponible (SQL pas encore passé) → on reste sur le cache local. */
export async function pullContainers(deviceIds: string[]): Promise<Record<string, string[]> | null> {
  if (!scope) return null
  const { scope_id } = scopeRow(scope)
  const { data, error } = await supabase.from('iremotech_device_meta').select('device_id, containers').eq('scope_id', scope_id)
  if (error) return null
  const remote = new Map<string, string[]>()
  for (const r of (data ?? []) as { device_id: string; containers: unknown }[]) if (Array.isArray(r.containers)) remote.set(r.device_id, r.containers.filter((x): x is string => typeof x === 'string'))
  const flag = `sf-irt-containers-synced:${scope_id}`
  let first = false
  try { first = !localStorage.getItem(flag) } catch { /* ignore */ }
  const out: Record<string, string[]> = {}
  for (const id of new Set([...deviceIds, ...remote.keys()])) {
    const r = remote.get(id) ?? []
    const local = loadDevContainers(id)
    const list = first ? [...new Set([...r, ...local])] : r
    out[id] = list
    cache(id, list)
    if (first && list.length !== r.length) push(id, list)   // reprise des containers locaux
  }
  try { localStorage.setItem(flag, '1') } catch { /* ignore */ }
  return out
}

/** Abonnement temps réel : `onChange(deviceId, containers)` à chaque modification dans l'espace. */
export function subscribeContainers(onChange: (deviceId: string, list: string[]) => void): () => void {
  if (!scope) return () => {}
  const { scope_id } = scopeRow(scope)
  // Nom unique : supabase.channel() renvoie le canal existant si le nom est déjà pris
  // (Studio + Phone Farm ouverts → l'un fermerait le canal de l'autre).
  const ch = supabase.channel(`irt-containers-${scope_id}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'iremotech_device_meta', filter: `scope_id=eq.${scope_id}` }, payload => {
      const row = (payload.new ?? {}) as { device_id?: string; containers?: unknown }
      if (!row.device_id || !Array.isArray(row.containers)) return
      const list = row.containers.filter((x): x is string => typeof x === 'string')
      cache(row.device_id, list)
      onChange(row.device_id, list)
    })
    .subscribe()
  return () => { void supabase.removeChannel(ch) }
}

// Lien CTA de la story, PAR container (mémorisé, comme les liens par compte GeeLark).
export function loadStoryLink(deviceId: string, container: string): string {
  try { return localStorage.getItem(`sf-irt-storylink:${deviceId}:${container}`) ?? '' } catch { return '' }
}
export function saveStoryLink(deviceId: string, container: string, url: string): void {
  try { if (url.trim()) localStorage.setItem(`sf-irt-storylink:${deviceId}:${container}`, url.trim()); else localStorage.removeItem(`sf-irt-storylink:${deviceId}:${container}`) } catch { /* noop */ }
}
