// Client iRemoTech (Parc VIP Blowsome) — pilote de vrais iPhones à distance.
// La clé API est configurée PAR AGENCE dans Supabase (app_config/org_config.
// iremotech_config.api_key), comme le token GeeLark. L'app Electron (webSecurity:false)
// appelle api.iremotech.com en direct. DORMANT tant qu'aucune clé n'est configurée.
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'

const BASE = 'https://api.iremotech.com/v1'

export interface IrtDevice { public_id: string; name?: string; model?: string; status?: string }
export interface IrtUsage { used?: number; budget?: number; remaining?: number; max_active_devices?: number }

// Charge la clé : perso (app_config) d'abord, sinon celle de l'agence (org_config).
export async function loadIremotechKey(user: User, org: OrgState): Promise<string | null> {
  const read = async (table: string, col: string, val: string): Promise<string | null> => {
    try {
      const { data } = await supabase.from(table).select('iremotech_config').eq(col, val).maybeSingle()
      return (data?.iremotech_config as { api_key?: string } | null)?.api_key ?? null
    } catch { return null }
  }
  let key = await read('app_config', 'user_id', user.id)
  if (!key && org.currentOrg) key = await read('org_config', 'org_id', org.currentOrg.id)
  return key
}

async function irt<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`iRemoTech HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function listDevices(key: string): Promise<IrtDevice[]> {
  const d = await irt<{ devices?: IrtDevice[] } | IrtDevice[]>(key, 'devices')
  if (Array.isArray(d)) return d
  return Array.isArray((d as any).devices) ? (d as any).devices : []
}
export async function fetchUsage(key: string): Promise<IrtUsage | null> {
  try { return await irt<IrtUsage>(key, 'usage') } catch { return null }
}

// Hook : clé + statut. Dormant (key=null) tant que rien n'est configuré.
export interface IrtState { key: string | null; loading: boolean }
export function useIremotech(user: User, org: OrgState): IrtState {
  const { currentOrg } = org
  const [state, setState] = useState<IrtState>({ key: null, loading: true })
  useEffect(() => {
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    loadIremotechKey(user, org).then(key => { if (!cancelled) setState({ key, loading: false }) })
    return () => { cancelled = true }
  }, [currentOrg?.id, user.id])
  return state
}
