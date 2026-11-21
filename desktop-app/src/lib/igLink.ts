import { supabase } from './supabase'

/** Code d'un post Instagram dans un lien (reel, reels, p, tv ; avec ou sans https://, avec le compte
 *  devant ou des paramètres derrière). null si ce n'est pas un lien de post. Pure. */
export function igCodeFromLink(link: string): string | null {
  const m = link.trim().match(/instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,40})/i)
  return m ? m[1] : null
}

// ── Téléchargement d'un post Instagram (Reel, photo, carrousel) ─────────────────────────────────────
// Lecture du post par l'edge function (HikerAPI, déjà utilisée par la Veille), puis octets récupérés via
// ses proxys publics du CDN Instagram (?vid= vidéo, ?img= image) : le navigateur ne peut pas lire le CDN.

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'

export interface IgMediaFile { bytes: Uint8Array; ext: 'mp4' | 'jpg'; index: number }
export interface IgPost { code: string; caption: string; files: IgMediaFile[] }

async function getBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`média indisponible (HTTP ${r.status})`)
  return new Uint8Array(await r.arrayBuffer())
}

/** Lien Instagram → fichiers du post (vidéo .mp4, ou photo(s) .jpg pour une photo / un carrousel). */
export async function downloadIgPost(link: string): Promise<IgPost> {
  const code = igCodeFromLink(link)
  if (!code) throw new Error('lien Instagram non reconnu (instagram.com/reel/… ou /p/…)')
  const { data: s } = await supabase.auth.getSession()
  const res = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify({ viral: 'media', code }) })
  const j = await res.json().catch(() => null) as { ok?: boolean; videoUrl?: string | null; caption?: string; images?: string[]; thumb?: string | null; error?: string } | null
  if (!j?.ok) throw new Error(j?.error === 'reel introuvable' || !j?.error ? 'post introuvable (supprimé, compte privé ?)' : j.error)
  if (j.videoUrl) return { code, caption: j.caption ?? '', files: [{ bytes: await getBytes(`${FN_URL}?vid=${encodeURIComponent(j.videoUrl)}`), ext: 'mp4', index: 0 }] }
  const pics = j.images?.length ? j.images : j.thumb ? [j.thumb] : []
  if (!pics.length) throw new Error('aucun média dans ce post')
  const files: IgMediaFile[] = []
  for (let i = 0; i < pics.length; i++) files.push({ bytes: await getBytes(`${FN_URL}?img=${encodeURIComponent(pics[i])}`), ext: 'jpg', index: i })
  return { code, caption: j.caption ?? '', files }
}

/** Liens collés (un par ligne, ou séparés par des espaces) → liens de posts distincts. Pure. */
export function igLinksFrom(text: string): string[] {
  const seen = new Set<string>(), out: string[] = []
  for (const part of text.split(/[\s,]+/)) {
    const code = igCodeFromLink(part)
    if (code && !seen.has(code)) { seen.add(code); out.push(part.trim()) }
  }
  return out
}
