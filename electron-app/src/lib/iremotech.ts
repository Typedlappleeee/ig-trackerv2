// Client iRemoTech (Device API) — passe par le proxy serverless /api/iremotech
// (pas de CORS). La clé API est configurée PAR AGENCE dans ScaleFlow (comme le
// token GeeLark) : stockée dans Supabase org_config/app_config.iremotech_config,
// chargée en mémoire, puis envoyée au proxy à chaque appel.
import { supabase } from './supabase'

// Clé courante en mémoire. On la met AUSSI en cache localStorage (partagé entre
// onglets même origine) pour que la page "tel en plein écran" (nouvel onglet
// léger) l'ait direct, sans rechargement de toute l'app.
const IRT_KEY_LS = 'sf-irt-key'
let apiKey: string | null = (() => { try { return localStorage.getItem(IRT_KEY_LS) } catch { return null } })()
export function setIremotechKey(k: string | null) {
  apiKey = (k && k.trim()) ? k.trim() : null
  try { if (apiKey) localStorage.setItem(IRT_KEY_LS, apiKey); else localStorage.removeItem(IRT_KEY_LS) } catch { /* noop */ }
}
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

// ── Calibration du curseur PAR TÉLÉPHONE (comme le "calibrer" d'iRemoTech) ────
// Décalage en pixels appliqué aux taps quand le mapping dérive côté device.
// Mémorisé en localStorage → persiste et vaut pour toutes les vues (écran, plein
// écran, multi).
export interface IrtCalib { dx: number; dy: number }
export function getCalib(deviceId: string): IrtCalib {
  try { const r = localStorage.getItem('sf-irt-calib-' + deviceId); if (r) { const c = JSON.parse(r); return { dx: Number(c.dx) || 0, dy: Number(c.dy) || 0 } } } catch { /* noop */ }
  return { dx: 0, dy: 0 }
}
export function setCalib(deviceId: string, c: IrtCalib) {
  try { localStorage.setItem('sf-irt-calib-' + deviceId, JSON.stringify({ dx: Math.round(c.dx), dy: Math.round(c.dy) })) } catch { /* noop */ }
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

// ── Limiteur de débit (token-bucket, comme iRemoTech) ────────────────────────
// iRemoTech plafonne à ~5 req/s via un token-bucket → il AUTORISE les rafales
// courtes. On modélise pareil : une rafale de 5 taps part instantanément, puis
// ça se régule à ~5/s (1 jeton toutes les 220 ms). Fini le retard sur 3-4 clics
// rapides. Le flux vidéo WebSocket n'est PAS concerné (1 connexion).
const BUCKET_CAP = 5, REFILL_MS = 220
let tokens = BUCKET_CAP
let lastRefill = Date.now()
const reqQueueHi: Array<() => void> = []   // actions (tap/swipe…) — PRIORITAIRES
const reqQueueLo: Array<() => void> = []   // captures (stream de secours) — passent après
let reqPumping = false
function refill() {
  const now = Date.now(); const add = Math.floor((now - lastRefill) / REFILL_MS)
  if (add > 0) { tokens = Math.min(BUCKET_CAP, tokens + add); lastRefill += add * REFILL_MS }
}
function reqSlot(hi = false): Promise<void> {
  return new Promise(resolve => { (hi ? reqQueueHi : reqQueueLo).push(resolve); pump() })
}
function pump() {
  if (reqPumping) return
  reqPumping = true
  const step = () => {
    refill()
    if (tokens >= 1 && (reqQueueHi.length || reqQueueLo.length)) {
      tokens -= 1
      const next = reqQueueHi.shift() ?? reqQueueLo.shift()   // les actions doublent les captures
      next?.()
      window.setTimeout(step, 0)   // enchaîne la rafale tant qu'il reste des jetons
    } else if (reqQueueHi.length || reqQueueLo.length) {
      window.setTimeout(step, REFILL_MS)   // plus de jeton → on attend le prochain refill
    } else {
      reqPumping = false
    }
  }
  step()
}

// Actions (tap/swipe/scroll) : relai EDGE dédié (faible latence) + priorité dans
// le limiteur. Repli sur le proxy Node si l'Edge échoue.
async function irtAction(deviceId: string, action: IrtAction): Promise<IrtResult> {
  await reqSlot(true)   // prioritaire + respecte les ~5 req/s
  try {
    const res = await fetch('/api/irt-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, action, apiKey: apiKey ?? undefined }),
    })
    return await res.json() as IrtResult
  } catch {
    return irt('action', { deviceId, body: action })
  }
}

async function irt<T = unknown>(op: string, payload: Record<string, unknown> = {}): Promise<IrtResult<T>> {
  // Un tap/une action passe DEVANT les captures → réactivité immédiate.
  await reqSlot(op === 'action')
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
  h: { onOpen?: () => void; onFrame: (frame: Blob) => void; onClose?: (why: string) => void },
  fps = 10,
): () => void {
  const key = apiKey
  if (!key) { h.onClose?.('no-key'); return () => {} }
  let ws: WebSocket | null = null
  let closed = false
  let fired = false   // onClose ne doit se déclencher QU'UNE fois (onerror + onclose)
  const fireClose = (why: string) => { if (closed || fired) return; fired = true; h.onClose?.(why) }
  try {
    ws = new WebSocket(`${WS_BASE}/devices/${encodeURIComponent(deviceId)}/stream?token=${encodeURIComponent(key)}&fps=${fps}`)
    ws.binaryType = 'blob'
    ws.onopen = () => { if (!closed) h.onOpen?.() }
    // On passe la frame BRUTE (Blob) → le consommateur la décode via
    // createImageBitmap (hors-thread) et la dessine sur un canvas = flux lisse.
    ws.onmessage = (ev) => { if (!closed && ev.data instanceof Blob) h.onFrame(ev.data) }
    ws.onerror = () => fireClose('error')
    ws.onclose = (ev) => fireClose(`close ${ev.code}`)
  } catch (e) { fireClose(String(e)) }
  return () => { closed = true; try { ws?.close() } catch { /* noop */ } }
}

// ── Séquences d'automatisation (macros) ──────────────────────────────────────
// Une étape = une action (avec le délai depuis la précédente). `upload` = étape
// "envoyer la vidéo sur le tel" (la vidéo choisie au rejeu). `captionVar` = étape
// texte à remplacer par la description choisie au rejeu.
export interface SeqStep { delay: number; action?: IrtAction; upload?: boolean; captionVar?: boolean }
export interface IrtSequence { id?: string; name: string; steps: SeqStep[] }

function seqScope(orgId: string | null, userId: string) {
  return orgId ? { scope_id: orgId, is_org: true } : { scope_id: userId, is_org: false }
}
export async function loadSequences(orgId: string | null, userId: string): Promise<IrtSequence[]> {
  const { scope_id } = seqScope(orgId, userId)
  try {
    const { data } = await supabase.from('iremotech_sequences').select('id, name, steps').eq('scope_id', scope_id).order('created_at', { ascending: false })
    return (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, steps: (r.steps as SeqStep[]) ?? [] }))
  } catch { return [] }
}
export async function saveSequence(orgId: string | null, userId: string, name: string, steps: SeqStep[]): Promise<{ ok: boolean; error?: string }> {
  const { scope_id, is_org } = seqScope(orgId, userId)
  const { error } = await supabase.from('iremotech_sequences').insert({ scope_id, is_org, name, steps })
  return error ? { ok: false, error: error.message } : { ok: true }
}
export async function deleteSequence(id: string): Promise<void> {
  try { await supabase.from('iremotech_sequences').delete().eq('id', id) } catch { /* noop */ }
}

// Rejoue une séquence sur un ou plusieurs tels, avec la vidéo/description choisies.
export async function replaySequence(
  deviceIds: string[], steps: SeqStep[],
  vars: { videoUrl?: string; videoName?: string; caption?: string },
  hooks?: { onStep?: (i: number, total: number) => void; shouldStop?: () => boolean },
): Promise<void> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, Math.min(Math.max(ms, 0), 20000)))
  for (let i = 0; i < steps.length; i++) {
    if (hooks?.shouldStop?.()) return
    const s = steps[i]
    await sleep(s.delay)
    hooks?.onStep?.(i, steps.length)
    for (const dev of deviceIds) {
      if (s.upload) { if (vars.videoUrl) await iremotech.uploadMedia(dev, vars.videoUrl, vars.videoName || 'video.mp4') }
      else if (s.action) {
        const a: IrtAction = (s.action.type === 'text' && s.captionVar && vars.caption != null) ? { type: 'text', text: vars.caption } : s.action
        await iremotech.action(dev, a)
      }
    }
  }
}

export const iremotech = {
  // Liste des iPhones pilotables.
  listDevices: () => irt<{ devices?: IrtDevice[] } | IrtDevice[]>('devices'),
  // Quotas/budgets du jour.
  usage: () => irt<IrtUsage>('usage'),
  // Capture d'écran → data URL JPEG (base64).
  snapshot: (deviceId: string) => irt('snapshot', { deviceId }),
  // Envoie UNE action (tap, texte, swipe…) via le relai Edge rapide.
  action: (deviceId: string, action: IrtAction) => irtAction(deviceId, action),
  // Upload d'un média de la banque (URL Supabase signée) vers l'iPhone.
  uploadMedia: (deviceId: string, mediaUrl: string, filename?: string) => irt('media', { deviceId, mediaUrl, filename }),
  // Upload d'un fichier du PC (base64) vers l'iPhone (≤ ~4 Mo — limite corps serverless).
  uploadMediaData: (deviceId: string, fileData: string, filename: string) => irt('media', { deviceId, fileData, filename }),
}

// Normalise la réponse /devices (peut être { devices: [] } ou [] selon l'API).
export function extractDevices(data: unknown): IrtDevice[] {
  if (Array.isArray(data)) return data as IrtDevice[]
  if (data && typeof data === 'object' && Array.isArray((data as { devices?: unknown }).devices)) {
    return (data as { devices: IrtDevice[] }).devices
  }
  return []
}
