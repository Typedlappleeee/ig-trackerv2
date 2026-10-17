// Banque : utilitaires partagés — lecture paginée (au-delà de 1000 lignes, Supabase coupe
// en silence : les plus anciens médias « disparaissaient »), quota d'espace par
// abonnement (RPC bank_usage), miniatures générées à l'envoi.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Toutes les lignes d'une requête, par pages de 1000. `make` recrée la requête à chaque page. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(make: () => any, page = 1000, max = 50_000): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; from < max; from += page) {
    const { data, error } = await make().range(from, from + page - 1)
    if (error) return { data: out, error }
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < page) break
  }
  return { data: out, error: null }
}

// ── Quota ────────────────────────────────────────────────────────────────────
export interface BankUsage { used: number; quota: number | null; plan: string }
export const PLAN_LABEL: Record<string, string> = { standard: 'Standard', pro: 'Pro', organisation: 'Organisation', business: 'Organisation' }

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1).replace('.', ',')} Go`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} Mo`
  return `${Math.max(1, Math.round(n / 1024))} Ko`
}

/** Pur : message de blocage si l'envoi dépasse la limite (null = OK). */
export function quotaIssue(u: BankUsage | null, incoming: number): string | null {
  if (!u || u.quota === null) return null
  if (u.used >= u.quota) return `Espace plein (${fmtBytes(u.used)} / ${fmtBytes(u.quota)}). Supprime des médias et vide la corbeille, ou passe à l’abonnement supérieur.`
  if (u.used + incoming > u.quota) return `Pas assez d’espace : il reste ${fmtBytes(u.quota - u.used)}, l’envoi fait ${fmtBytes(incoming)}.`
  return null
}

/** Espace utilisé / limite de l'espace courant (null tant que la RPC n'est pas installée). */
export function useBankUsage(orgId: string | null): { usage: BankUsage | null; reload: () => Promise<BankUsage | null> } {
  const [usage, setUsage] = useState<BankUsage | null>(null)
  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('bank_usage', { p_org: orgId })
    const u = !error && data ? { used: Number((data as BankUsage).used) || 0, quota: (data as BankUsage).quota === null ? null : Number((data as BankUsage).quota), plan: String((data as BankUsage).plan ?? 'standard') } : null
    setUsage(u)
    return u
  }, [orgId])
  useEffect(() => { void reload() }, [reload])
  return { usage, reload }
}

// ── Miniature + durée d'une vidéo, générées dans le navigateur à l'envoi ─────────
export function videoThumb(file: Blob, at = 0.6): Promise<{ blob: Blob; duration: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    let done = false
    const finish = (r: { blob: Blob; duration: number } | null) => { if (done) return; done = true; URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(r) }
    const timer = setTimeout(() => finish(null), 12_000)
    v.muted = true; v.playsInline = true; v.preload = 'metadata'
    v.onerror = () => { clearTimeout(timer); finish(null) }   // ex. HEVC non décodable : pas de miniature, pas grave
    v.onloadedmetadata = () => { try { v.currentTime = Math.min(at, Math.max(0, (v.duration || 1) / 2)) } catch { finish(null) } }
    v.onseeked = () => {
      try {
        const w = 360, h = Math.round(w * (v.videoHeight / Math.max(1, v.videoWidth))) || 640
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d')!.drawImage(v, 0, 0, w, h)
        c.toBlob(b => { clearTimeout(timer); finish(b ? { blob: b, duration: Math.round(v.duration || 0) } : null) }, 'image/jpeg', 0.8)
      } catch { clearTimeout(timer); finish(null) }
    }
    v.src = url
  })
}

/** Miniature + durée d'une vidéo qu'on a DÉJÀ sur ce PC (import, vidéo générée), envoyée à côté
 *  du fichier (…_thumb.jpg). Aucun téléchargement. null si le navigateur ne la décode pas. */
export async function uploadThumbFor(file: Blob, storagePath: string): Promise<{ thumbPath: string | null; duration: number | null }> {
  const th = await videoThumb(file)
  if (!th) return { thumbPath: null, duration: null }
  const tp = storagePath.replace(/\.[a-z0-9]+$/i, '') + '_thumb.jpg'
  const up = await supabase.storage.from('content').upload(tp, th.blob, { contentType: 'image/jpeg', upsert: false })
  return { thumbPath: up.error ? null : tp, duration: th.duration || null }
}
