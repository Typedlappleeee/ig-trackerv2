// Facebook par l'API officielle Meta : Pages connectées + publication de Reels via /api/fb.
// Les jetons de Page restent sur le serveur ; le navigateur ne voit que le nom des Pages.
import { supabase } from './supabase'
import { API_ORIGIN } from './scaleflowLink'

export interface FbPage { id: string; page_id: string; name: string; picture: string | null; connected_at: string; last_post_at: string | null; last_error: string | null }
export interface FbError extends Error { code?: string; reconnect?: boolean }

async function call<T>(orgId: string | null, a: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('session expirée : reconnecte-toi')
  const res = await fetch(`${API_ORIGIN}/api/fb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ a, org_id: orgId, ...body }),
  })
  let j: { ok?: boolean; error?: string; code?: string; reconnect?: boolean } & Record<string, unknown>
  try { j = await res.json() } catch { throw new Error(`serveur indisponible (HTTP ${res.status})`) }
  if (!j.ok) { const e: FbError = new Error(j.error || 'échec'); e.code = j.code; e.reconnect = !!j.reconnect; throw e }
  return j as T
}

export const listFbPages = (orgId: string | null) => call<{ pages: FbPage[]; configured: boolean }>(orgId, 'pages')
export const fbConnectUrl = async (orgId: string | null) => (await call<{ url: string }>(orgId, 'start')).url
export const removeFbPage = (orgId: string | null, page: string) => call<object>(orgId, 'remove', { page })
export const publishFbReel = async (orgId: string | null, page: string, fileId: string, caption: string) =>
  (await call<{ video_id: string }>(orgId, 'publish', { page, file_id: fileId, caption })).video_id
export const fbReelStatus = (orgId: string | null, page: string, videoId: string) =>
  call<{ phase: 'processing' | 'published' | 'failed'; error: string | null; link: string | null }>(orgId, 'status', { page, video_id: videoId })

// Répartition des vidéos sur les Pages.
//   'rotate' : une vidéo par Page, à tour de rôle (Page 1 → vidéo 1, Page 2 → vidéo 2…)
//   'all'    : chaque Page publie TOUTES les vidéos choisies
export interface FbJob { page: string; file: string }
export function planFbJobs(pages: string[], files: string[], mode: 'rotate' | 'all'): FbJob[] {
  if (!pages.length || !files.length) return []
  if (mode === 'all') return pages.flatMap(p => files.map(f => ({ page: p, file: f })))
  return pages.map((p, i) => ({ page: p, file: files[i % files.length] }))
}
// Légendes : une par ligne, distribuées à tour de rôle ; une seule ligne = la même partout.
export function captionFor(text: string, i: number): string {
  const l = text.split('\n').map(s => s.trim()).filter(Boolean)
  return l.length ? l[i % l.length] : ''
}
