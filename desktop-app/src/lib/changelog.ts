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
    id: '2026-10-09g',
    date: '2026-10-09',
    title: { fr: 'Téléphones éteints automatiquement + historique fiable', en: 'Phones turned off automatically + reliable history' },
    items: {
      fr: [
        'Garde-fou : un téléphone allumé sans tâche en cours est éteint au bout de 10 min, même si l’app est fermée (warmup respecté).',
        'Téléphones : bouton d’alimentation au début de chaque ligne pour éteindre un téléphone, et « Tout éteindre ».',
        'Activité : chaque post apparaît dès son lancement (« En cours », puis « Interrompu » si l’app a été fermée) et le vrai résultat est retrouvé chez GeeLark.',
        'Activité : « Récupérer les dernières 24 h » reconstitue les runs qui n’avaient pas été enregistrés.',
      ],
      en: [
        'Safeguard: a phone left on with no running task is turned off after 10 min, even when the app is closed (Warmup is respected).',
        'Phones: power button at the start of each row to turn a phone off, plus “Turn all off”.',
        'Activity: every post shows up as soon as it starts (“In progress”, then “Interrupted” if the app was closed) and its real result is fetched from GeeLark.',
        'Activity: “Recover the last 24 h” rebuilds runs that were never saved.',
      ],
    },
  },
  {
    id: '2026-10-09f',
    date: '2026-10-09',
    title: { fr: 'Banque : sélection rapide', en: 'Library: quick selection' },
    items: {
      fr: [
        'Reste appuyé sur une vidéo pour la sélectionner, puis glisse sur les autres pour en cocher plein d’un coup.',
        'Dès qu’une vidéo est cochée, un simple clic coche les suivantes ; rectangle de sélection sur un espace vide.',
        'Raccourcis : Ctrl+A tout sélectionner, Suppr pour supprimer, Échap pour annuler.',
        'Nouveautés : « Voir toutes les mises à jour » affiche tout l’historique, mois par mois.',
      ],
      en: [
        'Press and hold a video to select it, then drag across the others to select many at once.',
        'Once one is selected, a simple click selects more; drag a box on empty space to select a group.',
        'Shortcuts: Ctrl+A select all, Delete to remove, Esc to cancel.',
        'What’s new: “See all updates” shows the full history, month by month.',
      ],
    },
  },
  {
    id: '2026-10-09e',
    date: '2026-10-09',
    title: { fr: 'Plus simple à prendre en main', en: 'Easier to get started' },
    items: {
      fr: [
        'Nouveau guide « Bien démarrer » sur l’accueil : 4 étapes cochées automatiquement (GeeLark, téléphones, contenu, 1er Reel).',
        'Publier un Reel : barre en bas avec le récap (comptes, vidéos, crédits) et ce qu’il manque pour continuer.',
        'Chargements plus fluides, confirmations et messages intégrés à l’app (plus de fenêtres du navigateur).',
      ],
      en: [
        'New “Get started” guide on Home: 4 steps checked off automatically (GeeLark, phones, content, first Reel).',
        'Post a Reel: bottom bar with the summary (accounts, videos, credits) and what’s missing to continue.',
        'Smoother loading, built-in confirmations and messages (no more browser pop-ups).',
      ],
    },
  },
  {
    id: '2026-10-09d',
    date: '2026-10-09',
    title: { fr: 'Nouvelle interface', en: 'New interface' },
    items: {
      fr: [
        'Design entièrement revu : plus sobre, plus net et plus lisible sur toutes les pages.',
        'Nouvelle police (Inter) intégrée à l’app, boutons, champs et tableaux harmonisés.',
        'Meilleur affichage sur petit écran : barre latérale repliée et barre du haut simplifiée.',
      ],
      en: [
        'Fully redesigned: cleaner, sharper and easier to read on every page.',
        'New built-in font (Inter), consistent buttons, fields and tables.',
        'Better on small screens: collapsed sidebar and a simpler top bar.',
      ],
    },
  },
  {
    id: '2026-10-09c',
    date: '2026-10-09',
    title: { fr: 'Correctif : fin des stories', en: 'Fix: finishing Stories' },
    items: {
      fr: [
        'La story se publie maintenant même quand Instagram affiche une flèche « Suivant » puis « Partager » au lieu de « Your story ».',
        'Fonctionne aussi quand Instagram est en français sur le téléphone (« Votre story », « Ta story »).',
        'Aucun risque de double publication : l’app n’agit que si la story n’est pas encore partie.',
      ],
      en: [
        'Stories now get published even when Instagram shows a “Next” arrow then “Share” instead of “Your story”.',
        'Also works when Instagram is in French on the phone (“Votre story”, “Ta story”).',
        'No risk of posting twice: the app only acts if the Story hasn’t gone out yet.',
      ],
    },
  },
  {
    id: '2026-10-09b',
    date: '2026-10-09',
    title: { fr: 'Correctif : proxy rotatif', en: 'Fix: rotating proxy' },
    items: {
      fr: [
        'Les proxys rotatifs restent bien enregistrés après un rechargement (ils semblaient s’effacer sur les comptes perso).',
        'La rotation d’IP est de nouveau appliquée avant chaque téléphone (posting, story, warmup).',
        'Message clair si tu n’as pas le droit de modifier les proxys de ton organisation.',
      ],
      en: [
        'Rotating proxies now stay saved after a reload (they seemed to disappear on personal accounts).',
        'IP rotation is applied again before each phone (posting, Story, Warmup).',
        'Clear message if you’re not allowed to change your organization’s proxies.',
      ],
    },
  },
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
