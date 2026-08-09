// Client « Cloud Phones maison » — parle à TON agent auto-hébergé (voir
// selfhost/) via le proxy serverless /api/cloudphones (contourne CORS/CSP,
// garde le token côté serveur). Réservé aux super-admins dans l'UI.
import { supabase } from './supabase'

let agentUrl: string | null = null
let agentToken: string | null = null
export function setCloudAgent(url: string | null, token: string | null) {
  agentUrl = (url && url.trim()) ? url.trim().replace(/\/$/, '') : null
  agentToken = (token && token.trim()) ? token.trim() : null
}
export function getCloudAgent(): { url: string | null; token: string | null } {
  return { url: agentUrl, token: agentToken }
}

// Config stockée par agence (org_config) ou perso (app_config), comme iRemoTech.
export async function loadCloudAgentConfig(orgId: string | null, userId: string): Promise<{ url: string; token: string } | null> {
  const table = orgId ? 'org_config' : 'app_config'
  const col = orgId ? 'org_id' : 'user_id'
  const val = orgId ?? userId
  try {
    const { data } = await supabase.from(table).select('cloudphones_config').eq(col, val).maybeSingle()
    const cfg = (data?.cloudphones_config as { url?: string; token?: string } | null) ?? null
    if (cfg?.url && cfg?.token) { setCloudAgent(cfg.url, cfg.token); return { url: cfg.url, token: cfg.token } }
  } catch { /* colonne pas encore migrée */ }
  return null
}
export async function saveCloudAgentConfig(orgId: string | null, userId: string, url: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const val = { url: url.trim().replace(/\/$/, ''), token: token.trim() }
  const { error } = orgId
    ? await supabase.from('org_config').upsert({ org_id: orgId, cloudphones_config: val }, { onConflict: 'org_id' })
    : await supabase.from('app_config').upsert({ user_id: userId, cloudphones_config: val }, { onConflict: 'user_id' })
  if (error) return { ok: false, error: error.message }
  setCloudAgent(val.url, val.token)
  return { ok: true }
}

export interface CpInstance { id: string; name: string; state: string; adbPort: number | null; serial: string | null }
interface CpResult<T = unknown> { ok: boolean; status?: number; error?: string; data?: T }

async function call<T = unknown>(op: string, payload: Record<string, unknown> = {}): Promise<CpResult<T>> {
  if (!agentUrl || !agentToken) return { ok: false, error: 'Agent non configuré' }
  try {
    const res = await fetch('/api/cloudphones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, agentUrl, agentToken, ...payload }),
    })
    return await res.json() as CpResult<T>
  } catch (e) { return { ok: false, error: String(e) } }
}

export const cloudPhones = {
  health: () => call('health'),
  list: () => call<{ instances: CpInstance[] }>('list'),
  create: (name: string) => call<{ instance: CpInstance }>('create', { name }),
  remove: (id: string) => call('remove', { id }),
  start: (id: string) => call('start', { id }),
  stop: (id: string) => call('stop', { id }),
  shell: (id: string, cmd: string, timeout?: number) => call<{ output: string }>('shell', { id, cmd, timeout }),
  screenshot: (id: string) => call<{ dataUrl: string }>('screenshot', { id }),
}
