// Banque : utilitaires partagés — lecture paginée (au-delà de 1000 lignes, Supabase coupe
// en silence : les plus anciens médias « disparaissaient »), quota d'espace par
// abonnement (RPC bank_usage), miniatures générées à l'envoi.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { putLocal } from './localMedia'

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

// ── Miniature + durée d'une vidéo, générées dans le navigateur ───────────────────
/** Capture une image d'une vidéo (fichier local OU URL signée) : JPEG 360 px + durée.
 *  null si le navigateur ne décode pas la vidéo (ex. .MOV HEVC d'iPhone). Une URL
 *  distante est lue en CORS (canvas non « teinté ») avec une URL distincte, pour ne pas
 *  empoisonner le cache de la lecture normale. */
export function frameOf(src: Blob | string, at = 0.6): Promise<{ blob: Blob; duration: number } | null> {
  return new Promise(resolve => {
    const local = typeof src !== 'string'
    const url = local ? URL.createObjectURL(src) : src + (src.includes('?') ? '&' : '?') + 'sf_frame=1'
    const v = document.createElement('video')
    let done = false
    const finish = (r: { blob: Blob; duration: number } | null) => { if (done) return; done = true; if (local) URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(r) }
    const timer = setTimeout(() => finish(null), local ? 12_000 : 20_000)
    v.muted = true; v.playsInline = true; v.preload = 'metadata'
    if (!local) v.crossOrigin = 'anonymous'
    v.onerror = () => { clearTimeout(timer); finish(null) }   // ex. HEVC non décodable : pas de miniature, pas grave
    v.onloadedmetadata = () => { try { v.currentTime = Math.min(at, Math.max(0, (v.duration || 1) / 2)) } catch { finish(null) } }
    v.onseeked = () => {
      try {
        if (!v.videoWidth) { clearTimeout(timer); finish(null); return }
        const w = 360, h = Math.round(w * (v.videoHeight / Math.max(1, v.videoWidth))) || 640
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d')!.drawImage(v, 0, 0, w, h)
        c.toBlob(b => { clearTimeout(timer); finish(b ? { blob: b, duration: Math.round(v.duration || 0) } : null) }, 'image/jpeg', 0.8)
      } catch { clearTimeout(timer); finish(null) }
    }
    v.src = url
  })
}
/** Miniature + durée d'un fichier vidéo local (à l'envoi). */
export const videoThumb = (file: Blob, at = 0.6) => frameOf(file, at)

export const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
const MIME: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' }
/** Chemin de la miniature d'un média : à côté du fichier, suffixe _thumb.jpg. */
export const thumbPathFor = (storagePath: string) => storagePath.replace(/\.[a-z0-9]+$/i, '') + '_thumb.jpg'

/** Ajoute un fichier à la banque (bucket content + ligne content_bank) AVEC sa miniature et
 *  sa durée pour une vidéo. Seul point d'entrée : import Banque, Studio, sélecteur, Auto-contenu,
 *  sorties générées (avant, seules les vidéos importées depuis la Banque avaient une miniature
 *  → vignettes et aperçus noirs pour tout le reste). Si la ligne est refusée, les fichiers sont
 *  retirés du stockage (pas d'orphelins). */
export async function addToBank(o: { userId: string; orgId: string | null; file: Blob; name: string; title?: string; ext?: string; folder?: string | null }): Promise<{ id: string | null; storagePath: string | null; error?: string }> {
  const scopeFolder = o.orgId ? `orgs/${o.orgId}` : `users/${o.userId}`
  let ext = (o.ext ?? o.name.split('.').pop() ?? '').toLowerCase()
  if (!ext || ext.length > 5) ext = o.file.type.startsWith('image') ? 'jpg' : 'mp4'
  const isImage = o.file.type.startsWith('image') || IMG_EXT.includes(ext)
  const id = crypto.randomUUID()
  const storagePath = `videos/${scopeFolder}/${id}.${ext}`
  const up = await supabase.storage.from('content').upload(storagePath, o.file, { contentType: o.file.type || MIME[ext] || undefined, upsert: false })
  if (up.error) return { id: null, storagePath: null, error: /row-level security|policy/i.test(up.error.message) ? 'espace plein ou accès refusé' : up.error.message }
  let thumbPath: string | null = null, duration: number | null = null
  if (!isImage) {
    const th = await frameOf(o.file)
    if (th) {
      duration = th.duration || null
      const tp = thumbPathFor(storagePath)
      const tu = await supabase.storage.from('content').upload(tp, th.blob, { contentType: 'image/jpeg', upsert: false })
      if (!tu.error) thumbPath = tp
    }
  }
  const ins = await supabase.from('content_bank').insert({
    user_id: o.userId, org_id: o.orgId, title: o.title ?? o.name.replace(/\.[a-z0-9]+$/i, ''), storage_path: storagePath, thumbnail_path: thumbPath,
    file_url: null, folder: o.folder || null, duration, tags: [], notes: null, used_count: 0,
  }).select('id').maybeSingle()
  if (ins.error) {
    await supabase.storage.from('content').remove([storagePath, ...(thumbPath ? [thumbPath] : [])]).catch(() => {})
    return { id: null, storagePath: null, error: ins.error.message }
  }
  // Copie locale immédiate : aperçus et générations instantanés, sans retéléchargement.
  void putLocal(storagePath, o.file)
  return { id: (ins.data as { id?: string } | null)?.id ?? null, storagePath }
}

// ── Auto-réparation : miniature créée pour un ancien média qui n'en a pas ────────
// Quand une vignette arrive à décoder la vidéo, on capture une image, on l'enregistre à côté
// du média et on renseigne thumbnail_path : la fois suivante, la vignette est instantanée.
// Une à la fois, en silence ; chaque média n'est tenté qu'une fois par session.
const tried = new Set<string>()
let chain: Promise<void> = Promise.resolve()
// Suspendues pendant qu'une vidéo est lue (lecteur ouvert) : la connexion lui est réservée.
let paused = 0
const waitResume = async () => { while (paused > 0) await new Promise(r => setTimeout(r, 500)) }
/** Suspend les créations de miniatures ; renvoie la fonction qui les relance. */
export function pauseRepairs(): () => void {
  paused++
  let done = false
  return () => { if (!done) { done = true; paused-- } }
}
/** Vide la file (on quitte la Banque) : rien ne tourne en arrière-plan sur les autres pages. */
let gen = 0
export function cancelRepairs(): void { gen++ }
export function repairThumb(id: string, storagePath: string, url: string, onDone?: (thumbPath: string) => void): void {
  if (tried.has(id)) return
  tried.add(id)
  const mine = gen
  chain = chain.then(async () => {
    await waitResume()
    if (mine !== gen) { tried.delete(id); return }
    const th = await frameOf(url)
    if (!th) return
    const tp = thumbPathFor(storagePath)
    const up = await supabase.storage.from('content').upload(tp, th.blob, { contentType: 'image/jpeg', upsert: false })
    if (up.error && !/exist|duplicate/i.test(up.error.message)) return
    const { error } = await supabase.from('content_bank').update({ thumbnail_path: tp }).eq('id', id).is('thumbnail_path', null)
    if (!error) onDone?.(tp)
  }).catch(() => {})
}
