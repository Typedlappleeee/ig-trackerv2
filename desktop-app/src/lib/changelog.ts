// Notes de mise à jour affichées aux utilisateurs (plus récente en premier).
// Chaque mise à jour visible de l'app = une entrée ici, en français ET en anglais.
// La plus récente déclenche la notif « ScaleFlow mis à jour » une fois par
// utilisateur ; les 3 premières sont listées au clic sur la pastille « MAJ »
// et publiées dans version.json (récap affiché avant même de rafraîchir).
export interface ChangelogEntry {
  id: string                 // unique, ex. date ISO (+ suffixe si plusieurs le même jour)
  date: string               // AAAA-MM-JJ
  title: { fr: string; en: string }
  items: { fr: string[]; en: string[] }
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-09',
    date: '2026-10-09',
    title: { fr: 'ScaleFlow en anglais + nouveautés', en: 'ScaleFlow in English + release notes' },
    items: {
      fr: [
        "L'application est disponible en anglais : bouton FR / EN en haut à droite (et dans Réglages).",
        'Après chaque mise à jour, un récap des nouveautés s’affiche en haut de l’écran.',
        'Clique sur la pastille « MAJ » pour revoir les changements des 3 dernières mises à jour.',
      ],
      en: [
        'The app is now available in English: FR / EN switch at the top right (and in Settings).',
        'After each update, a summary of what’s new shows up at the top of the screen.',
        'Click the “Updated” pill to see the changes from the last 3 updates.',
      ],
    },
  },
  {
    id: '2026-10-07',
    date: '2026-10-07',
    title: { fr: 'Stats Instagram plus fiables', en: 'More reliable Instagram stats' },
    items: {
      fr: [
        'Nouveau fournisseur de stats (HikerAPI) avec bascule automatique sur l’ancien en cas de panne.',
        'Les stats ne s’arrêtent plus sans prévenir quand un fournisseur ne répond pas.',
        'Moins de requêtes par compte : synchronisation plus rapide.',
      ],
      en: [
        'New stats provider (HikerAPI) with automatic fallback to the previous one if it goes down.',
        'Stats no longer stop silently when a provider doesn’t respond.',
        'Fewer requests per account: faster syncing.',
      ],
    },
  },
  {
    id: '2026-10-06',
    date: '2026-10-06',
    title: { fr: 'Édition de profil en masse', en: 'Bulk profile editing' },
    items: {
      fr: [
        'Nom affiché et nom d’utilisateur (@) sont maintenant deux champs séparés.',
        'Photo de profil en masse depuis ta banque (une photo différente par compte possible).',
        'Correctif : changer le @ ne modifie plus le nom affiché par erreur.',
        'Flow Builder et édition en masse : disponibles pour tous le 11/10.',
      ],
      en: [
        'Display name and username (@) are now two separate fields.',
        'Bulk profile pictures from your Library (a different photo per account if you want).',
        'Fix: changing the @ no longer changes the display name by mistake.',
        'Flow Builder and bulk editing: available to everyone on Oct 11.',
      ],
    },
  },
  {
    id: '2026-10-05',
    date: '2026-10-05',
    title: { fr: 'Toujours à jour', en: 'Always up to date' },
    items: {
      fr: [
        'La date de la dernière mise à jour est affichée en haut.',
        'Un bandeau te prévient quand une nouvelle version est en ligne, avec un bouton « Rafraîchir ».',
        'Si une page ne s’ouvre plus après une mise à jour, l’app se recharge toute seule.',
      ],
      en: [
        'The date of the latest update is shown at the top.',
        'A banner tells you when a new version is live, with a “Refresh” button.',
        'If a page fails to open after an update, the app reloads by itself.',
      ],
    },
  },
  {
    id: '2026-10-03',
    date: '2026-10-03',
    title: { fr: 'Fiabilité et vitesse', en: 'Reliability and speed' },
    items: {
      fr: [
        'Les téléphones s’éteignent automatiquement après un échec ou à la fin d’une tâche, et au bout de 10 min s’ils restent allumés (sauf warmup).',
        'Remboursements de crédits fiabilisés (annulations, échecs).',
        'Chargement de l’app près de 3× plus léger.',
      ],
      en: [
        'Phones now turn off automatically after a failure or when a task ends, and after 10 min if left on (except Warmup).',
        'More reliable credit refunds (cancellations, failures).',
        'The app loads with a bundle almost 3× lighter.',
      ],
    },
  },
]

export const LATEST = CHANGELOG[0]
