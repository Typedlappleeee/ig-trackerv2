// Client iRemoTech (Device API) — passe par le proxy serverless /api/iremotech
// (pas de CORS). La clé API est configurée PAR AGENCE dans ScaleFlow (comme le
// token GeeLark) : stockée dans Supabase org_config/app_config.iremotech_config,
// chargée en mémoire, puis envoyée au proxy à chaque appel.
import { supabase } from './supabase'

// Clé courante en mémoire (définie après chargement de la config de l'agence).
let apiKey: string | null = null
export function setIremotechKey(k: string | null) { apiKey = (k && k.trim()) ? k.trim() : null }
export function getIremotechKey(): string | null { return apiKey }

async function readKey(table: string, col: string, val: string): Promise<string | null> {
  try {
    const { data } = await supabase.from(table).select('iremotech_config').eq(col, val).maybeSingle()
    return (data?.iremotech_config as { api_key?: string } | null)?.api_key ?? null
  } catch { return null }
}

// Charge la clé : d'abord l'agence (org_config), sinon le compte perso (app_config).
export async function loadIremotechKey(orgId: string | null, userId: string): Promise<string | null> {
  let key: string | null = null
  if (orgId) key = await readKey('org_config', 'org_id', orgId)
  if (!key) key = await readKey('app_config', 'user_id', userId)
  setIremotechKey(key)
  return key
}

// Enregistre la clé : essaie l'agence (org_config) ; si la RLS bloque, repli sur
// le compte perso (app_config) pour que ça marche quand même.
export async function saveIremotechKey(orgId: string | null, userId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  const val = { api_key: key.trim() }
  if (orgId) {
    const { error } = await supabase.from('org_config').upsert({ org_id: orgId, iremotech_config: val }, { onConflict: 'org_id' })
    if (!error) { setIremotechKey(key); return { ok: true } }
    // RLS / colonne absente → on retombe sur la config perso ci-dessous.
  }
  const { error } = await supabase.from('app_config').upsert({ user_id: userId, iremotech_config: val }, { onConflict: 'user_id' })
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

// ── Notes + comptes (login/mdp) par téléphone (coffre perso, Supabase) ───────
export interface IrtAccount { label?: string; platform?: string; username: string; password: string }
export interface IrtDeviceMeta { notes: string; accounts: IrtAccount[] }

export async function loadDeviceMeta(userId: string, deviceId: string): Promise<IrtDeviceMeta> {
  try {
    const { data } = await supabase.from('iremotech_device_meta').select('notes, accounts').eq('user_id', userId).eq('device_id', deviceId).maybeSingle()
    return { notes: data?.notes ?? '', accounts: (data?.accounts as IrtAccount[] | null) ?? [] }
  } catch { return { notes: '', accounts: [] } }
}

export async function saveDeviceMeta(userId: string, orgId: string | null, deviceId: string, meta: IrtDeviceMeta): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('iremotech_device_meta').upsert(
    { user_id: userId, org_id: orgId, device_id: deviceId, notes: meta.notes, accounts: meta.accounts, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,device_id' },
  )
  return error ? { ok: false, error: error.message } : { ok: true }
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
