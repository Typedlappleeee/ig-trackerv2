// Photos « maison » (public/site, licence libre, même style que le site) utilisées pour tous
// les visuels de l'app : bandeaux, aperçus d'outils, collage de l'accueil. Toujours propres,
// contrairement aux miniatures de la Banque / Veille prises au hasard.
export const CURATED_COUNT = 13
export const curated = (n: number): string => `${import.meta.env.BASE_URL}site/c${(((n - 1) % CURATED_COUNT) + CURATED_COUNT) % CURATED_COUNT + 1}.webp`
/** Ordre d'affichage (portraits les plus forts d'abord). */
export const CURATED: string[] = [3, 9, 13, 6, 11, 4, 1, 10, 2, 12, 7, 5, 8].map(curated)
