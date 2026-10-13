// Genjutsu — helpers purs (testés).
/** Code d'un Reel depuis un lien Instagram (reel / reels / p / tv). Le reste est refusé. */
export function reelCodeFrom(s: string): string | null {
  const t = s.trim()
  const m = t.match(/instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,40})/i)
  return m ? m[1] : null
}
