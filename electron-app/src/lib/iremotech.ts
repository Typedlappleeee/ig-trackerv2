// Client iRemoTech (Device API) — passe par le proxy serverless /api/iremotech
// (pas de CORS). La clé API est configurée PAR AGENCE dans ScaleFlow (comme le
// token GeeLark) : stockée dans Supabase org_config/app_config.iremotech_config,
// chargée en mémoire, puis envoyée au proxy à chaque appel.
import { supabase } from './supabase'

// Clé courante en mémoire (définie après chargement de la config de l'agence).
let apiKey: string | null = null
export function setIremotechKey(k: string | null) { apiKey = (k && k.trim()) ? k.trim() : null }
export function getIremotechKey(): string | null { return apiKey }

// Charge la clé de l'agence (org) ou du compte perso depuis Supabase.
export async function loadIremotechKey(orgId: string | null, userId: string): Promise<string | null> {
  const table = orgId ? 'org_config' : 'app_config'
  const col = orgId ? 'org_id' : 'user_id'
  const val = orgId ?? userId
  try {
    const { data } = await supabase.from(table).select('iremotech_config').eq(col, val).maybeSingle()
    const key = (data?.iremotech_config as { api_key?: string } | null)?.api_key ?? null
    setIremotechKey(key)
    return key
  } catch { return null }
}

// Enregistre la clé de l'agence.
export async function saveIremotechKey(orgId: string | null, userId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  const table = orgId ? 'org_config' : 'app_config'
  const col = orgId ? 'org_id' : 'user_id'
  const val = orgId ?? userId
  const { error } = await supabase.from(table).upsert({ [col]: val, iremotech_config: { api_key: key.trim() } }, { onConflict: col })
  if (error) return { ok: false, error: error.message }
  setIremotechKey(key)
  return { ok: true }
}

export interface IrtDevice {
  public_id: string
  name?: string
  model?: string
  status?: string
  [k: string]: unknown
}

// Actions supportées (cf. OpenAPI /devices/{id}/actions).
export type IrtAction =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x1: number; y1: number; x2: number; y2: number; duration_ms?: number }
  | { type: 'long_press'; x: number; y: number; hold_ms?: number }
  | { type: 'drag'; x1: number; y1: number; x2: number; y2: number; duration_ms?: number }
  | { type: 'scroll'; x: number; y: number; dy: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: string }
  | { type: 'press'; name?: string; key?: string; modifiers?: string[] }
  | { type: 'open_url'; url: string }
  | { type: 'airplane'; on: boolean }

interface IrtResult<T = unknown> { ok: boolean; status?: number; data?: T; dataUrl?: string; error?: string }

async function irt<T = unknown>(op: string, payload: Record<string, unknown> = {}): Promise<IrtResult<T>> {
  try {
    const res = await fetch('/api/iremotech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, apiKey: apiKey ?? undefined, ...payload }),
    })
    return await res.json() as IrtResult<T>
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export const iremotech = {
  // Liste des iPhones pilotables.
  listDevices: () => irt<{ devices?: IrtDevice[] } | IrtDevice[]>('devices'),
  // Quotas/budgets du jour.
  usage: () => irt('usage'),
  // Capture d'écran → data URL JPEG (base64).
  snapshot: (deviceId: string) => irt('snapshot', { deviceId }),
  // Envoie UNE action (tap, texte, swipe…).
  action: (deviceId: string, action: IrtAction) => irt('action', { deviceId, body: action }),
  // Upload d'un média de la banque (URL Supabase signée) vers l'iPhone.
  uploadMedia: (deviceId: string, mediaUrl: string, filename?: string) => irt('media', { deviceId, mediaUrl, filename }),
}

// Normalise la réponse /devices (peut être { devices: [] } ou [] selon l'API).
export function extractDevices(data: unknown): IrtDevice[] {
  if (Array.isArray(data)) return data as IrtDevice[]
  if (data && typeof data === 'object' && Array.isArray((data as { devices?: unknown }).devices)) {
    return (data as { devices: IrtDevice[] }).devices
  }
  return []
}
