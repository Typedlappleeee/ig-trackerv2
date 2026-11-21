/** Code d'un post Instagram dans un lien (reel, reels, p, tv ; avec ou sans https://, avec le compte
 *  devant ou des paramètres derrière). null si ce n'est pas un lien de post. Pure. */
export function igCodeFromLink(link: string): string | null {
  const m = link.trim().match(/instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,40})/i)
  return m ? m[1] : null
}
