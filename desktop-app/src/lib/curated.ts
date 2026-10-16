// Photos « maison » (public/site, licence libre, même style que le site) utilisées pour tous
// les visuels de l'app : bandeaux, aperçus d'outils, collage de l'accueil. Toujours propres,
// contrairement aux miniatures de la Banque / Veille prises au hasard.
export const CURATED_COUNT = 13
export const curated = (n: number): string => `${import.meta.env.BASE_URL}site/c${(((n - 1) % CURATED_COUNT) + CURATED_COUNT) % CURATED_COUNT + 1}.webp`
/** onError d'une <img> : si l'image ne charge pas (lien expiré, fichier absent…), elle est
 *  REMPLACÉE par une photo maison — jamais d'image qui disparaît ni de cadre noir. */
export const imgFallback = (k: number) => (e: { currentTarget: HTMLImageElement }) => {
  const el = e.currentTarget
  if (el.dataset.fb) return                     // déjà remplacée : pas de boucle
  el.dataset.fb = '1'
  el.style.display = ''
  el.src = curated(k)
}
/** Ordre d'affichage (portraits les plus forts d'abord). */
export const CURATED: string[] = [3, 9, 13, 6, 11, 4, 1, 10, 2, 12, 7, 5, 8].map(curated)
