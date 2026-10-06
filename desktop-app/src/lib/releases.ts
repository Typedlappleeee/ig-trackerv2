// Fonctions en attente de sortie : verrouillées pour les clients jusqu'à la date,
// puis débloquées automatiquement (heure locale), sans redéploiement.
// Le super-admin garde l'accès pour tester.
export const RELEASES = {
  flowBuilder: '2026-10-11',
  massEdit: '2026-10-11',
} as const
export type ReleaseKey = keyof typeof RELEASES

function releaseDate(key: ReleaseKey): Date {
  const [y, m, d] = RELEASES[key].split('-').map(Number)
  return new Date(y, m - 1, d)   // minuit, heure locale
}

export function isReleased(key: ReleaseKey, now: Date = new Date()): boolean {
  return now.getTime() >= releaseDate(key).getTime()
}

/** « 11/10 » */
export function releaseLabel(key: ReleaseKey): string {
  const d = releaseDate(key)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
