// Client iRemoTech (Parc VIP Blowsome) — pilote de vrais iPhones à distance.
// La clé API est configurée PAR AGENCE dans Supabase (app_config/org_config.
// iremotech_config.api_key), comme le token GeeLark. L'app Electron (webSecurity:false)
// appelle api.iremotech.com EN DIRECT (pas de proxy serverless, pas de CORS).
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'

const BASE = 'https://api.iremotech.com/v1'
const WS_BASE = 'wss://api.iremotech.com/v1'

export interface IrtDevice { public_id: string; name?: string; model?: string; status?: string; [k: string]: unknown }
export interface IrtBudget { used?: number; budget?: number; remaining?: number }
export interface IrtUsage {
  active_minutes?: IrtBudget; actions?: IrtBudget; snapshots?: IrtBudget; uploads?: IrtBudget
  max_active_devices?: number; resets_at?: string
  // compat ancien affichage
  used?: number; budget?: number; remaining?: number
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

// ── Clé API : perso (app_config) d'abord, sinon agence (org_config) ───────────
async function readKey(table: string, col: string, val: string): Promise<string | null> {
  try {
    const { data } = await supabase.from(table).select('iremotech_config').eq(col, val).maybeSingle()
    return (data?.iremotech_config as { api_key?: string } | null)?.api_key ?? null
  } catch { return null }
}
export async function loadIremotechKey(user: User, org: OrgState): Promise<string | null> {
  let key = await readKey('app_config', 'user_id', user.id)
  if (!key && org.currentOrg) key = await readKey('org_config', 'org_id', org.currentOrg.id)
  return key
}
export async function saveIremotechKey(orgId: string | null, userId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  const val = { api_key: key.trim() }
  const { error } = await supabase.from('app_config').upsert({ user_id: userId, iremotech_config: val }, { onConflict: 'user_id' })
  if (error) return { ok: false, error: error.message }
  if (orgId) { try { await supabase.from('org_config').upsert({ org_id: orgId, iremotech_config: val }, { onConflict: 'org_id' }) } catch { /* best-effort */ } }
  return { ok: true }
}

// ── Limiteur de débit (token-bucket ~5 req/s, comme iRemoTech) ────────────────
const BUCKET_CAP = 5, REFILL_MS = 220
let tokens = BUCKET_CAP
let lastRefill = Date.now()
const queue: Array<() => void> = []
let pumping = false
function refill() { const now = Date.now(); const add = Math.floor((now - lastRefill) / REFILL_MS); if (add > 0) { tokens = Math.min(BUCKET_CAP, tokens + add); lastRefill += add * REFILL_MS } }
function slot(): Promise<void> { return new Promise(res => { queue.push(res); pump() }) }
function pump() {
  if (pumping) return
  pumping = true
  const step = () => {
    refill()
    if (tokens >= 1 && queue.length) { tokens -= 1; queue.shift()?.(); setTimeout(step, 0) }
    else if (queue.length) { setTimeout(step, REFILL_MS) }
    else { pumping = false }
  }
  step()
}

// ── Appels directs (Electron webSecurity:false → pas de CORS) ─────────────────
async function get<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`iRemoTech HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function listDevices(key: string): Promise<IrtDevice[]> {
  const d = await get<{ devices?: IrtDevice[] } | IrtDevice[]>(key, 'devices')
  return Array.isArray(d) ? d : (Array.isArray((d as any).devices) ? (d as any).devices : [])
}
export async function fetchUsage(key: string): Promise<IrtUsage | null> {
  try { return await get<IrtUsage>(key, 'usage') } catch { return null }
}

// Capture d'écran → data URL JPEG.
export async function snapshot(key: string, deviceId: string): Promise<string | null> {
  await slot()
  try {
    const res = await fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/snapshot`, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    let bin = ''; const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return `data:image/jpeg;base64,${btoa(bin)}`
  } catch { return null }
}

// Envoie UNE action (tap/texte/swipe…).
export async function sendAction(key: string, deviceId: string, action: IrtAction): Promise<boolean> {
  await slot()
  try {
    const res = await fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/actions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    })
    return res.ok
  } catch { return false }
}

// Upload d'un média (URL signée Supabase) → octets bruts sur l'iPhone.
export async function uploadMedia(key: string, deviceId: string, mediaUrl: string, filename = 'video.mp4'): Promise<boolean> {
  try {
    const dl = await fetch(mediaUrl)
    if (!dl.ok) return false
    const bytes = await dl.arrayBuffer()
    const res = await fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/media?filename=${encodeURIComponent(filename)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    })
    return res.ok
  } catch { return false }
}

// Flux vidéo temps réel (WebSocket, frames JPEG Blob).
export function openLiveStream(key: string, deviceId: string, h: { onOpen?: () => void; onFrame: (b: Blob) => void; onClose?: (why: string) => void }, fps = 8): () => void {
  let ws: WebSocket | null = null
  let closed = false, fired = false
  const fireClose = (why: string) => { if (closed || fired) return; fired = true; h.onClose?.(why) }
  try {
    ws = new WebSocket(`${WS_BASE}/devices/${encodeURIComponent(deviceId)}/stream?token=${encodeURIComponent(key)}&fps=${fps}`)
    ws.binaryType = 'blob'
    ws.onopen = () => { if (!closed) h.onOpen?.() }
    ws.onmessage = (ev) => { if (!closed && ev.data instanceof Blob) h.onFrame(ev.data) }
    ws.onerror = () => fireClose('error')
    ws.onclose = (ev) => fireClose(`close ${ev.code}`)
  } catch (e) { fireClose(String(e)) }
  return () => { closed = true; try { ws?.close() } catch { /* noop */ } }
}

// ── Comptes + notes par appareil (partagés dans l'agence via Supabase) ────────
export interface IrtAccount { ig_base?: string; ig_modified?: string; password?: string; a2f?: string }
export interface IrtDeviceMeta { notes: string; accounts: IrtAccount[] }
function metaScope(orgId: string | null, userId: string) { return orgId ? { scope_id: orgId, is_org: true } : { scope_id: userId, is_org: false } }
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

// ── Séquences (macros de posting) ─────────────────────────────────────────────
// Une étape = un délai + une action, OU une étape "upload" (envoyer la vidéo), OU
// une étape texte marquée captionVar (remplacée par la légende choisie au rejeu).
export interface SeqStep { delay: number; action?: IrtAction; upload?: boolean; captionVar?: boolean }
export interface IrtSequence { id?: string; name: string; steps: SeqStep[] }
function seqScope(orgId: string | null, userId: string) { return orgId ? { scope_id: orgId, is_org: true } : { scope_id: userId, is_org: false } }
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

// Rejoue une séquence sur un ou plusieurs iPhones, avec la vidéo + légende choisies.
export async function replaySequence(
  key: string, deviceIds: string[], steps: SeqStep[],
  vars: { videoUrl?: string; videoName?: string; caption?: string },
  hooks?: { onStep?: (i: number, total: number) => void; log?: (m: string) => void; shouldStop?: () => boolean },
): Promise<void> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, Math.min(Math.max(ms, 0), 20000)))
  for (let i = 0; i < steps.length; i++) {
    if (hooks?.shouldStop?.()) return
    const s = steps[i]
    await sleep(s.delay)
    hooks?.onStep?.(i, steps.length)
    for (const dev of deviceIds) {
      if (s.upload) {
        if (vars.videoUrl) { hooks?.log?.(`⬆ upload vidéo → ${dev}`); await uploadMedia(key, dev, vars.videoUrl, vars.videoName || 'video.mp4') }
      } else if (s.action) {
        const a: IrtAction = (s.action.type === 'text' && s.captionVar && vars.caption != null) ? { type: 'text', text: vars.caption } : s.action
        await sendAction(key, dev, a)
      }
    }
  }
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
