// ScaleFlow Link — côté app : clés de l'API ScaleFlow (/api/v1), site partenaire (ex. site du
// staff) et échanges de médias avec lui via /api/link (la clé du partenaire reste côté serveur).
// SQL : supabase/migrations/20261029_scaleflow_link.sql.
import { supabase } from './supabase'
import { IS_WEB } from './platform'

export const API_ORIGIN = IS_WEB && typeof window !== 'undefined' && /^https?:/.test(window.location.origin) ? window.location.origin : 'https://scaleflow.company'
export const API_BASE = `${API_ORIGIN}/api/v1`
export const DOCS_URL = `${API_BASE}/docs`
export const LINK_SQL = '20261029_scaleflow_link.sql'

export interface ApiToken { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }
export interface Partner { name: string; base_url: string; key_hint: string; updated_at: string; can_edit: boolean }
export interface LinkFolder { name: string; videos?: number; images?: number; updated_at?: string }
export interface LinkFile { id: string; title: string; folder: string | null; kind: 'video' | 'image'; url: string | null; thumbnail_url: string | null; duration?: number | null; created_at?: string }

// Fonction SQL absente → le SQL de la liaison n'a pas encore été passé.
export const isMissingSql = (e: unknown) => /function .*does not exist|could not find the function|schema cache/i.test(e instanceof Error ? e.message : String(e))

export async function listTokens(orgId: string | null): Promise<ApiToken[]> {
  const { data, error } = await supabase.rpc('sf_api_token_list', { p_org: orgId })
  if (error) throw new Error(error.message)
  return (data ?? []) as ApiToken[]
}
export async function createToken(orgId: string | null, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('sf_api_token_create', { p_org: orgId, p_name: name })
  if (error) throw new Error(error.message)
  return String(data)
}
export async function revokeToken(id: string): Promise<void> {
  const { error } = await supabase.rpc('sf_api_token_revoke', { p_id: id })
  if (error) throw new Error(error.message)
}
export async function getPartner(orgId: string | null): Promise<Partner | null> {
  const { data, error } = await supabase.rpc('sf_link_partner_get', { p_org: orgId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Partner[])[0] ?? null
}
export async function savePartner(orgId: string | null, name: string, baseUrl: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('sf_link_partner_set', { p_org: orgId, p_name: name, p_base_url: baseUrl, p_key: key })
  if (error) throw new Error(error.message)
}

async function linkCall<T>(orgId: string | null, op: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('session expirée : reconnecte-toi')
  const res = await fetch(`${API_ORIGIN}/api/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ op, org_id: orgId, ...body }),
  })
  let j: { ok?: boolean; error?: string } & Record<string, unknown>
  try { j = await res.json() } catch { throw new Error(`serveur indisponible (HTTP ${res.status})`) }
  if (!j.ok) throw new Error(j.error || 'échec')
  return j as T
}

export const testPartner = (orgId: string | null) => linkCall<{ partner: string }>(orgId, 'test')
export const partnerFolders = (orgId: string | null) => linkCall<{ partner: string; folders: LinkFolder[]; unfiled: { videos?: number; images?: number } | null }>(orgId, 'folders')
export const partnerFiles = (orgId: string | null, folder: string | null, cursor?: string | null) =>
  linkCall<{ files: LinkFile[]; next_cursor: string | null }>(orgId, 'files', { folder, cursor: cursor ?? undefined })

export interface Progress { done: number; total: number; failed: number; lastError?: string }

// Lots envoyés EN PARALLÈLE (et chaque lot traite ses fichiers en parallèle côté serveur) :
// 10 vidéos partent en même temps → durée ≈ celle d'une seule.
async function runBatches<T>(items: T[], size: number, parallel: number, op: string, orgId: string | null, extra: Record<string, unknown>,
  key: string, p: Progress, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<void> {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, batches.length) }, async () => {
    while (next < batches.length && !signal?.aborted) {
      const batch = batches[next++]
      try {
        const r = await linkCall<{ results: { ok: boolean; error?: string }[] }>(orgId, op, { ...extra, [key]: batch })
        const okN = r.results.filter(x => x.ok).length
        p.done += okN; p.failed += batch.length - okN
        const err = r.results.find(x => !x.ok)?.error
        if (err) p.lastError = err
      } catch (e) { p.failed += batch.length; p.lastError = e instanceof Error ? e.message : String(e) }
      onProgress({ ...p })
    }
  }))
}

// Mes médias → dossier du partenaire.
export async function sendToPartner(orgId: string | null, ids: string[], folder: string, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<Progress> {
  const p: Progress = { done: 0, total: ids.length, failed: 0 }
  await runBatches(ids, 3, 4, 'send', orgId, { folder }, 'ids', p, onProgress, signal)
  return p
}

// Médias du partenaire → ma banque (chaque fichier est copié dans mon stockage).
export async function importFromPartner(orgId: string | null, files: LinkFile[], folder: string, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<Progress> {
  const items = files.filter(f => f.url).map(f => ({ url: f.url, title: f.title, thumbnail_url: f.thumbnail_url }))
  const p: Progress = { done: 0, total: items.length, failed: files.length - items.length }
  await runBatches(items, 3, 3, 'import', orgId, { folder }, 'items', p, onProgress, signal)
  return p
}

// Un montage tout juste enregistré dans ma banque → directement chez le partenaire.
export async function sendOneToPartner(orgId: string | null, id: string, folder: string): Promise<{ ok: boolean; error?: string; ms: number }> {
  const t0 = performance.now()
  try {
    const r = await linkCall<{ results: { ok: boolean; error?: string }[] }>(orgId, 'send', { ids: [id], folder })
    const x = r.results[0]
    return { ok: !!x?.ok, error: x ? x.error : 'média introuvable', ms: Math.round(performance.now() - t0) }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - t0) } }
}

// Partenaire de l'espace (mis en cache) + ses dossiers, pour les sélecteurs « Envoyer direct vers ».
const partnerCache = new Map<string, Promise<Partner | null>>()
export function cachedPartner(orgId: string | null): Promise<Partner | null> {
  const k = orgId ?? 'perso'
  if (!partnerCache.has(k)) partnerCache.set(k, getPartner(orgId).catch(() => null))
  return partnerCache.get(k)!
}
export function forgetPartner(): void { partnerCache.clear() }
