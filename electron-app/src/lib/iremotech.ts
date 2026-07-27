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

// Charge la clé : d'abord TA clé perso (app_config, toujours à jour), sinon la
// clé de l'agence (org_config, partagée). Cet ordre évite qu'une ancienne clé
// d'org masque la nouvelle clé perso que tu viens d'enregistrer.
export async function loadIremotechKey(orgId: string | null, userId: string): Promise<string | null> {
  let key: string | null = await readKey('app_config', 'user_id', userId)
  if (!key && orgId) key = await readKey('org_config', 'org_id', orgId)
  setIremotechKey(key)
  return key
}

// Enregistre la clé : PRIMAIRE = compte perso (app_config, accessible via RLS,
// toujours fiable) ; puis, best-effort, on la partage à l'agence (org_config).
// Ainsi la clé qu'on vient d'enregistrer est TOUJOURS celle qui sera rechargée.
export async function saveIremotechKey(orgId: string | null, userId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  const val = { api_key: key.trim() }
  const { error } = await supabase.from('app_config').upsert({ user_id: userId, iremotech_config: val }, { onConflict: 'user_id' })
  if (error) return { ok: false, error: error.message }
  // Partage à l'agence (peut échouer selon la RLS : sans importance, la perso suffit).
  if (orgId) { try { await supabase.from('org_config').upsert({ org_id: orgId, iremotech_config: val }, { onConflict: 'org_id' }) } catch { /* best-effort */ } }
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

// Réponse de GET /usage (budgets quotidiens, remis à zéro à minuit UTC).
export interface IrtBudget { used: number; budget: number; remaining: number }
export interface IrtUsage {
  active_minutes?: IrtBudget
  actions?: IrtBudget
  snapshots?: IrtBudget
  uploads?: IrtBudget
  max_active_devices?: number
  resets_at?: string
}

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

// ── Notes + comptes par téléphone (visible par toute l'agence, Supabase) ─────
// Champs d'un compte : nom IG de base, nom IG modifié, mot de passe, id A2F (2FA).
// (username/auth_id restent optionnels pour lire d'anciennes fiches.)
export interface IrtAccount {
  ig_base?: string      // nom IG de base
  ig_modified?: string  // nom IG modifié
  password?: string     // mot de passe
  a2f?: string          // id A2F (2FA)
  username?: string     // ancien champ (compat)
  auth_id?: string      // ancien champ (compat)
}
export interface IrtDeviceMeta { notes: string; accounts: IrtAccount[] }

// scope = l'agence (org_id) si présente, sinon le compte perso (user_id).
function metaScope(orgId: string | null, userId: string) {
  return orgId ? { scope_id: orgId, is_org: true } : { scope_id: userId, is_org: false }
}

export async function loadDeviceMeta(orgId: string | null, userId: string, deviceId: string): Promise<IrtDeviceMeta> {
  const { scope_id } = metaScope(orgId, userId)
  try {
    const { data } = await supabase.from('iremotech_device_meta').select('notes, accounts').eq('scope_id', scope_id).eq('device_id', deviceId).maybeSingle()
    return { notes: data?.notes ?? '', accounts: (data?.accounts as IrtAccount[] | null) ?? [] }
  } catch { return { notes: '', accounts: [] } }
}

export async function saveDeviceMeta(orgId: string | null, userId: string, deviceId: string, meta: IrtDeviceMeta): Promise<{ ok: boolean; error?: string }> {
  const { scope_id, is_org } = metaScope(orgId, userId)
  const { error } = await supabase.from('iremotech_device_meta').upsert(
    { scope_id, is_org, device_id: deviceId, notes: meta.notes, accounts: meta.accounts, updated_at: new Date().toISOString() },
    { onConflict: 'scope_id,device_id' },
  )
  return error ? { ok: false, error: error.message } : { ok: true }
}

// Flux "live" relayé côté serveur (une seule requête POST, frames en NDJSON).
// Bien plus fluide qu'un polling navigateur et ne sature pas le tel (boucle
// serveur, une capture à la fois). Renvoie une fonction pour arrêter le flux.
export interface IrtStreamHandlers {
  onFrame: (dataUrl: string) => void
  onOffline: () => void
  onEnd?: () => void
  onError?: (msg: string) => void
}
export function openSnapshotStream(deviceId: string, h: IrtStreamHandlers): () => void {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const res = await fetch('/api/iremotech-stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, apiKey: apiKey ?? undefined }), signal: ctrl.signal,
      })
      if (!res.ok || !res.body) { h.onError?.(`stream ${res.status}`); return }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
          if (!line) continue
          let msg: { t?: string; d?: string; s?: number }
          try { msg = JSON.parse(line) } catch { continue }
          if (msg.t === 'frame' && msg.d) h.onFrame(`data:image/jpeg;base64,${msg.d}`)
          else if (msg.t === 'offline') h.onOffline()
          else if (msg.t === 'end') h.onEnd?.()
          else if (msg.t === 'err') h.onError?.(`amont ${msg.s ?? ''}`)
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) h.onError?.(String(e))
    }
  })()
  return () => ctrl.abort()
}

// Flux vidéo TEMPS RÉEL via WebSocket (frames JPEG binaires, une par message).
// C'est le mode le plus fluide (vs captures relayées). La clé passe en query
// param `token` — les WebSockets navigateur ne peuvent pas poser d'en-tête, et
// la clé est de toute façon déjà chargée en mémoire client.
const WS_BASE = 'wss://api.iremotech.com/v1'
export function openLiveStream(
  deviceId: string,
  h: { onFrame: (objectUrl: string) => void; onClose?: (why: string) => void },
  fps = 10,
): () => void {
  const key = apiKey
  if (!key) { h.onClose?.('no-key'); return () => {} }
  let ws: WebSocket | null = null
  let lastUrl: string | null = null
  let closed = false
  try {
    ws = new WebSocket(`${WS_BASE}/devices/${encodeURIComponent(deviceId)}/stream?token=${encodeURIComponent(key)}&fps=${fps}`)
    ws.binaryType = 'blob'
    ws.onmessage = (ev) => {
      if (closed || !(ev.data instanceof Blob)) return
      const url = URL.createObjectURL(ev.data)
      h.onFrame(url)
      if (lastUrl) URL.revokeObjectURL(lastUrl)   // libère la frame précédente
      lastUrl = url
    }
    ws.onerror = () => { if (!closed) h.onClose?.('error') }
    ws.onclose = (ev) => { if (!closed) h.onClose?.(`close ${ev.code}`) }
  } catch (e) { h.onClose?.(String(e)) }
  return () => {
    closed = true
    try { ws?.close() } catch { /* noop */ }
    if (lastUrl) URL.revokeObjectURL(lastUrl)
  }
}

export const iremotech = {
  // Liste des iPhones pilotables.
  listDevices: () => irt<{ devices?: IrtDevice[] } | IrtDevice[]>('devices'),
  // Quotas/budgets du jour.
  usage: () => irt<IrtUsage>('usage'),
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
