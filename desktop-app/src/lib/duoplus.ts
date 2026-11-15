// DuoPlus (téléphones virtuels) : appels à /api/duoplus. La clé API reste sur le serveur.
import { supabase } from './supabase'
import { API_ORIGIN } from './scaleflowLink'

export interface DuoPhone { id: string; name: string; status: number; os: string; area: string; region: string; ip: string; remark: string; adb: boolean; expires: number | null; group: string[] }
export interface DuoError extends Error { nokey?: boolean; nosql?: boolean }

async function call<T>(orgId: string | null, a: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('session expirée : reconnecte-toi')
  const res = await fetch(`${API_ORIGIN}/api/duoplus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ a, org_id: orgId, ...body }),
  })
  let j: { ok?: boolean; error?: string; nokey?: boolean; nosql?: boolean } & Record<string, unknown>
  try { j = await res.json() } catch { throw new Error(`serveur indisponible (HTTP ${res.status})`) }
  if (!j.ok) { const e: DuoError = new Error(j.error || 'échec'); e.nokey = !!j.nokey; e.nosql = !!j.nosql; throw e }
  return j as T
}

export const duoStatus = (orgId: string | null) => call<{ configured: boolean; manager: boolean }>(orgId, 'status')
export const duoSetKey = (orgId: string | null, key: string) => call<{ phones: DuoPhone[] }>(orgId, 'setkey', { key })
export const duoDelKey = (orgId: string | null) => call<object>(orgId, 'delkey')
export const duoPhones = async (orgId: string | null) => (await call<{ phones: DuoPhone[] }>(orgId, 'phones')).phones
export const duoPower = (orgId: string | null, ids: string[], on: boolean) => call<{ success: string[]; fail: { id: string; error: string }[] }>(orgId, 'power', { ids, on })
export const duoCommand = (orgId: string | null, id: string, command: string) => call<{ output: string }>(orgId, 'command', { id, command })

// État d'un téléphone (codes de l'API DuoPlus).
export type DuoTone = 'on' | 'off' | 'busy' | 'bad'
export function duoState(status: number): { label: string; tone: DuoTone } {
  switch (status) {
    case 1: return { label: 'Allumé', tone: 'on' }
    case 2: return { label: 'Éteint', tone: 'off' }
    case 10: return { label: 'Démarrage…', tone: 'busy' }
    case 11: return { label: 'Configuration…', tone: 'busy' }
    case 0: return { label: 'Pas configuré', tone: 'bad' }
    case 3: return { label: 'Expiré', tone: 'bad' }
    case 4: return { label: 'Renouvellement en retard', tone: 'bad' }
    case 12: return { label: 'Configuration échouée', tone: 'bad' }
    default: return { label: `État ${status}`, tone: 'bad' }
  }
}
// On ne peut allumer qu'un téléphone éteint, et éteindre qu'un téléphone allumé (ou qui démarre).
export const canPowerOn = (p: DuoPhone) => p.status === 2
export const canPowerOff = (p: DuoPhone) => p.status === 1 || p.status === 10
// « France(FR) » → « France »
export const areaName = (a: string) => a.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim() || a
