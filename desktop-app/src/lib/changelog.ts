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
    id: '2026-10-30b',
    date: '2026-10-30',
    title: { fr: '✦ Genjutsu, version propre', en: '✦ Genjutsu, clean version' },
    items: {
      fr: [
        'Genjutsu est maintenant une vraie page ScaleFlow en 3 étapes : choisis ta modèle (sa photo de référence), colle les liens des reels, lance — chaque vidéo est refaite avec sa tête.',
        'Nouvelle modèle en 1 clic (1 à 4 photos), partagée avec le générateur ; options simples pour le prompt (plusieurs filles, garder les textes, autre tenue) ; 480p par défaut.',
        'Résultats en direct (8 à la fois par compte), raison claire en cas de refus, bouton Relancer, et spoof auto en X versions rangées dans la Banque (un dossier par modèle).',
      ],
      en: [
        'Genjutsu is now a real 3-step ScaleFlow page: pick your model (her reference photo), paste the reel links, launch — every video is remade with her face.',
        'New model in 1 click (1 to 4 photos), shared with the generator; simple prompt options (several girls, keep texts, different outfit); 480p by default.',
        'Live results (8 at a time per account), clear reason when rejected, Retry button, and auto-spoof into X versions saved in the Bank (one folder per model).',
      ],
    },
  },
  {
    id: '2026-10-30',
    date: '2026-10-30',
    title: { fr: '✦ Genjutsu dans ScaleFlow (accès Blowsome)', en: '✦ Genjutsu inside ScaleFlow (Blowsome access)' },
    items: {
      fr: [
        'Nouvelle page Genjutsu : le générateur (mouvement d’une vidéo transféré sur ta référence, Higgsfield) directement dans l’app — réservée aux comptes avec l’accès Blowsome, sans mot de passe à taper.',
        'Spoof auto : chaque génération réussie est déclinée en X versions uniques (iPhone 15 · France par défaut) et rangée dans la Banque — un dossier fixe ou un dossier par modèle.',
      ],
      en: [
        'New Genjutsu page: the generator (a video’s motion transferred onto your reference, Higgsfield) right inside the app — for accounts with Blowsome access, no password to type.',
        'Auto-spoof: every successful generation becomes X unique versions (iPhone 15 · France by default) saved in the Bank — one fixed folder or one folder per model.',
      ],
    },
  },
  {
    id: '2026-10-29b',
    date: '2026-10-29',
    title: { fr: '🎭 API : Spoof et Remix à distance + appareil enfin écrit dans les vidéos', en: '🎭 API: remote Spoof and Remix + device finally written into videos' },
    items: {
      fr: [
        'API ScaleFlow : /tools/spoof (vidéos et photos) et /tools/remix — mêmes réglages que le Studio, faits par le serveur, résultat rangé dans la banque.',
        'Spoof : l’appareil choisi (iPhone 15 Pro, Galaxy S23…) est maintenant vraiment écrit dans la vidéo (avant, seul le GPS l’était).',
        'API : marquer une vidéo « utilisée », la déplacer, la mettre à la corbeille, ou ne lister que les jamais utilisées.',
        'Réglages › Intégrations › Activité de l’API : chaque appel reçu, réussi ou refusé, avec la raison (clé mal copiée, appel depuis une page web…).',
      ],
      en: [
        'ScaleFlow API: /tools/spoof (videos and photos) and /tools/remix — same settings as the Studio, done by the server, result saved in the bank.',
        'Spoof: the chosen device (iPhone 15 Pro, Galaxy S23…) is now really written into the video (before, only the GPS was).',
        'API: mark a video as “used”, move it, send it to the trash, or list only never-used ones.',
        'Settings › Integrations › API activity: every call received, succeeded or refused, with the reason (badly copied key, call from a web page…).',
      ],
    },
  },
  {
    id: '2026-10-29',
    date: '2026-10-29',
    title: { fr: '🔗 API ScaleFlow : relie ta banque à ton autre site', en: '🔗 ScaleFlow API: link your bank to your other site' },
    items: {
      fr: [
        'Réglages › Intégrations › API ScaleFlow : crée une clé pour que ton autre site (ex. celui du staff) voie ta banque, récupère les vidéos et t’envoie du contenu.',
        'Site partenaire : sa banque apparaît dans la Banque (bouton à son nom), séparée de la tienne ; importe ses vidéos dans le dossier de ton choix.',
        'Sélectionne des médias › « Envoyer vers … » : ils sont copiés directement dans le dossier voulu chez lui, tous en même temps.',
        'Studio vidéo et Auto-contenu : « Envoyer direct vers » — chaque montage terminé part tout seul dans le dossier choisi chez lui.',
      ],
      en: [
        'Settings › Integrations › ScaleFlow API: create a key so your other site (e.g. your staff’s) sees your bank, grabs videos and sends you content.',
        'Partner site: their bank shows in the Bank (button with their name), separate from yours; import their videos into the folder you want.',
        'Select media › “Send to …”: they are copied straight into the folder you choose on their side, all at once.',
        'Video Studio and Auto-content: “Send straight to” — every finished edit goes on its own into the chosen folder on their side.',
      ],
    },
  },
  {
    id: '2026-10-28',
    date: '2026-10-28',
    title: { fr: '📱 iRemoTech : temps réel, Instagram toujours trouvé, Story fiable', en: '📱 iRemoTech: real time, Instagram always found, reliable Story' },
    items: {
      fr: [
        'Les containers de chaque iPhone sont partagés dans l’agence et se mettent à jour en direct (fini les « 0c » sur un autre PC).',
        'La liste et l’état des iPhones (point vert / rouge) s’actualisent tout seuls toutes les 15 s.',
        'Ouverture d’Instagram plus fiable : l’icône est trouvée par son NOM, même sur un fond d’écran clair ou coloré, et une autre appli (ex. Instacart) n’est plus ouverte par erreur.',
        'Story : la vidéo est choisie via la vignette en bas à gauche (la plus récente), et les effets de la caméra ne sont plus touchés par erreur.',
        'Posting : publication via POST (galerie directe → dernière vidéo → Suivant → légende → Partager) au lieu de la caméra Reel ; rien n’est publié si l’écran de légende n’est pas atteint.',
      ],
      en: [
        'Each iPhone’s containers are shared across the agency and update live (no more “0c” on another PC).',
        'The iPhone list and status (green / red dot) refresh on their own every 15 s.',
        'More reliable Instagram opening: the icon is found by its NAME, even on a light or colorful wallpaper, and another app (e.g. Instacart) is no longer opened by mistake.',
        'Story: the video is picked through the bottom-left thumbnail (the most recent one), and camera effects are no longer touched by mistake.',
        'Posting: published through POST (gallery → latest video → Next → caption → Share) instead of the Reel camera; nothing is posted if the caption screen isn’t reached.',
      ],
    },
  },
  {
    id: '2026-10-14d',
    date: '2026-10-14',
    title: { fr: '🎨 Travail sur l’interface de ScaleFlow', en: '🎨 Work on the ScaleFlow interface' },
    items: {
      fr: ['Travail sur l’interface de ScaleFlow : Explorer, Tableau de bord, Studio vidéo et tous les onglets.'],
      en: ['Work on the ScaleFlow interface: Explore, Dashboard, Video Studio and every tab.'],
    },
  },
  {
    id: '2026-10-14',
    date: '2026-10-14',
    title: { fr: '📸 Veille Reels : les profils comme sur Instagram', en: '📸 Reels Watch: profiles just like Instagram' },
    items: {
      fr: [
        'Clique sur un @ (carte, fiche, ronds des comptes) : tu arrives sur son profil comme sur Instagram — photo, bio, abonnés, posts « à la une », grille Reels / Publications.',
        'Sur chaque profil, l’analyse ScaleFlow : vues habituelles, meilleur Reel, Reels viraux, engagement et rythme de publication.',
        'Nouvelle fiche d’un Reel : vidéo en grand, légende, analyse, et « Plus de @compte » pour enchaîner ses autres vidéos.',
      ],
      en: [
        'Click an @ (card, detail, account circles) to land on their profile just like Instagram — photo, bio, followers, highlights, Reels / Posts grid.',
        'On every profile, the ScaleFlow analysis: usual views, best Reel, viral Reels, engagement and posting pace.',
        'New Reel detail: big video, caption, analysis, and “More from @account” to binge their other videos.',
      ],
    },
  },
  {
    id: '2026-10-13',
    date: '2026-10-13',
    title: { fr: '✨ Refonte de l’application', en: '✨ App redesign' },
    items: { fr: ['Refonte de l’application.'], en: ['App redesign.'] },
  },
  {
    id: '2026-10-11c',
    date: '2026-10-11',
    title: { fr: '🔥 Nouveau : la Veille Reels', en: '🔥 New: Reels Watch' },
    items: {
      fr: [
        'Les Reels qui explosent en ce moment, classés par vues, avec le badge « ×N la normale » quand un Reel fait bien plus que d’habitude.',
        'Filtres FR / US, période, niche et compte. Sur chaque Reel : vues, likes, commentaires, légende, téléchargement de la vidéo et lien.',
        '« Mes comptes » : suis tes propres comptes pour voir quelles vidéos marchent le mieux. Menu Analyse → Veille Reels.',
      ],
      en: [
        'Reels blowing up right now, ranked by views, with a “×N normal” badge when a Reel does far better than usual.',
        'FR / US, period, niche and account filters. On each Reel: views, likes, comments, caption, video download and link.',
        '“My accounts”: track your own accounts to see which videos perform best. Menu Analytics → Reels Watch.',
      ],
    },
  },
  {
    id: '2026-10-11b',
    date: '2026-10-11',
    title: { fr: '🔗 Les Liens ScaleFlow sont arrivés', en: '🔗 ScaleFlow Links are here' },
    items: {
      fr: [
        'Ta page de liens façon Linktree : photo, badge vérifié, fonds et effets animés, boutons et cartes image, animations.',
        'Un lien suivi par compte, créé automatiquement pour tous tes comptes (avec leurs liens OF / MYM).',
        'Tableau de bord : visites, clics, taux de clic, en direct, pays, meilleurs comptes. Menu Analyse → Liens.',
      ],
      en: [
        'Your Linktree-style link page: photo, verified badge, animated backgrounds and effects, buttons and image cards, animations.',
        'One tracked link per account, created automatically for all your accounts (with their OF / MYM links).',
        'Dashboard: visits, clicks, click-through rate, live, countries, top accounts. Menu Analytics → Links.',
      ],
    },
  },
  {
    id: '2026-10-11',
    date: '2026-10-11',
    title: { fr: 'Relancer les échecs + calendrier', en: 'Retry failures + calendar' },
    items: {
      fr: [
        'Activité : « Relancer » rouvre la publication avec seulement les comptes échoués et les mêmes vidéos, déjà sélectionnés.',
        'Programmé : nouvelle vue Calendrier (semaine / mois). Glisse un post en attente sur un autre jour pour le décaler.',
        'Publier un Reel : bouton « Miniature » bien visible sur chaque vidéo, et choix des miniatures possible à l’étape Lancement.',
      ],
      en: [
        'Activity: “Retry” reopens posting with only the failed accounts and the same videos, already selected.',
        'Scheduled: new Calendar view (week / month). Drag a pending post onto another day to move it.',
        'Post a Reel: clear “Thumbnail” button on each video, and thumbnails can be picked at the Launch step.',
      ],
    },
  },
  {
    id: '2026-10-10c',
    date: '2026-10-10',
    title: { fr: 'Publication TikTok', en: 'TikTok posting' },
    items: {
      fr: ['Publication : nouveau format « Vidéo TikTok » (même parcours que les Reels), et formats rangés par réseau — Instagram, TikTok, autres réseaux — pour ne plus se tromper.'],
      en: ['Posting: new “TikTok video” format (same flow as Reels), and formats grouped by network — Instagram, TikTok, other networks — so you never mix them up.'],
    },
  },
  {
    id: '2026-10-10b',
    date: '2026-10-10',
    title: { fr: 'Aperçu du Reel', en: 'Reel preview' },
    items: {
      fr: ['Publier un Reel : l’aperçu montre le Reel comme sur Instagram (vidéo, compte et légende tirés au hasard, bouton « Autre aperçu »).'],
      en: ['Post a Reel: the preview shows the Reel like on Instagram (random video, account and caption, “Another preview” button).'],
    },
  },
  {
    id: '2026-10-10',
    date: '2026-10-10',
    title: { fr: 'Mise à jour Flow Builder', en: 'Flow Builder update' },
    items: {
      fr: [
        'Mise à jour du Flow Builder.',
        'Interface plus nette partout : champs, interrupteurs et onglets harmonisés, chargements plus fluides, meilleur affichage sur mobile.',
      ],
      en: [
        'Flow Builder update.',
        'Cleaner interface everywhere: consistent fields, switches and tabs, smoother loading, better on mobile.',
      ],
    },
  },
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
