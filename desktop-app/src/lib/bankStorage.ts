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
// Une miniature ne doit JAMAIS être noire : on essaie plusieurs instants (0,6 s, 1,5 s, 20 %, 40 %,
// 60 %, 80 %) et on garde la première image assez claire — sinon la plus claire trouvée.
export function videoThumb(file: Blob | string, at = 0.6): Promise<{ blob: Blob; duration: number } | null> {
  return new Promise(resolve => {
    const url = typeof file === 'string' ? file : URL.createObjectURL(file)
    const v = document.createElement('video')
    let done = false
    const finish = (r: { blob: Blob; duration: number } | null) => {
      if (done) return; done = true
      if (typeof file !== 'string') URL.revokeObjectURL(url)
      v.removeAttribute('src'); v.load(); resolve(r)
    }
    const timer = setTimeout(() => finish(best ? { blob: best.blob, duration: Math.round(v.duration || 0) } : null), 20_000)
    let times: number[] = [], k = 0
    let best: { blob: Blob; lum: number } | null = null
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'
    v.onerror = () => { clearTimeout(timer); finish(null) }   // ex. HEVC non décodable : pas de miniature, pas grave
    v.onloadedmetadata = () => {
      const d = v.duration || 1
      times = [Math.min(at, d / 2), Math.min(1.5, d * 0.3), d * 0.2, d * 0.4, d * 0.6, d * 0.8].filter((t, i, a) => t < d && a.indexOf(t) === i)
      try { v.currentTime = times[0] } catch { finish(null) }
    }
    v.onseeked = () => {
      // laisse le décodeur peindre l'image avant de la lire (sinon image noire sur certains navigateurs)
      setTimeout(() => {
        try {
          const w = 360, h = Math.round(w * (v.videoHeight / Math.max(1, v.videoWidth))) || 640
          const c = document.createElement('canvas'); c.width = w; c.height = h
          const ctx = c.getContext('2d')!; ctx.drawImage(v, 0, 0, w, h)
          const px = ctx.getImageData(0, 0, w, h).data
          let sum = 0, n = 0
          for (let i = 0; i < px.length; i += 4 * 37) { sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; n++ }
          const lum = sum / Math.max(1, n)
          c.toBlob(b => {
            if (b && (!best || lum > best.lum)) best = { blob: b, lum }
            if (lum >= 22 || ++k >= times.length) { clearTimeout(timer); finish(best ? { blob: best.blob, duration: Math.round(v.duration || 0) } : null); return }
            try { v.currentTime = times[k] } catch { finish(null) }
          }, 'image/jpeg', 0.8)
        } catch { clearTimeout(timer); finish(best ? { blob: best.blob, duration: Math.round(v.duration || 0) } : null) }
      }, 120)
    }
    v.src = url
  })
}

// Miniature déjà en ligne trop sombre (quasi noire) ? Lue en petit, luminosité moyenne.
export function isDarkImage(src: string, threshold = 12): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 24; c.height = 40
        const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0, 24, 40)
        const px = ctx.getImageData(0, 0, 24, 40).data
        let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
        resolve(sum / (px.length / 4) < threshold)
      } catch { resolve(false) }
    }
    img.onerror = () => resolve(false)
    img.src = src
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
