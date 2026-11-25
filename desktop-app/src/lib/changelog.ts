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
    id: '2026-11-25n',
    date: '2026-11-25',
    title: { fr: 'iRemoTech : reprise propre après un post raté', en: 'iRemoTech: clean restart after a failed post' },
    items: {
      fr: ['Post raté : il est abandonné (jamais retenté) et Instagram est fermé tout de suite ; le post suivant repart d’un Instagram propre (réouvert, compte vérifié). Vaut aussi pour les containers.', 'Une erreur inattendue pendant un post n’arrête plus toute la session de l’iPhone.'],
      en: ['Failed post: it is dropped (never retried) and Instagram is closed at once; the next post starts from a clean Instagram (reopened, account checked). Also for containers.', 'An unexpected error during a post no longer stops the whole iPhone session.'],
    },
  },
  {
    id: '2026-11-25m',
    date: '2026-11-25',
    title: { fr: 'iRemoTech : aperçu plein écran de la vidéo fermé', en: 'iRemoTech: full-screen video preview closed' },
    items: {
      fr: ['Quand Instagram ouvre la vidéo en plein écran avec un bouton « Done » (tap sur la miniature de la page de partage), ScaleFlow tape Done et continue le post au lieu de rester bloqué.'],
      en: ['When Instagram opens the video full screen with a “Done” button (tap on the share-page thumbnail), ScaleFlow taps Done and carries on with the post instead of getting stuck.'],
    },
  },
  {
    id: '2026-11-25l',
    date: '2026-11-25',
    title: { fr: 'Posting : un seul marché pour tous les comptes', en: 'Posting: one market for all accounts' },
    items: {
      fr: ['Plus de « Marché de chaque compte » dans le Posting : le marché choisi (ex. 🇩🇪 Allemagne) sert pour toutes les descriptions et localisations du posting.'],
      en: ['No more “Market of each account” in Posting: the chosen market (e.g. 🇩🇪 Germany) is used for every caption and location of the posting.'],
    },
  },
  {
    id: '2026-11-25k',
    date: '2026-11-25',
    title: { fr: 'Téléchargeur Insta : choix du dossier', en: 'Insta downloader: folder choice' },
    items: {
      fr: ['Le dossier de la Banque se choisit dans la liste des dossiers existants (ou « + Nouveau dossier… ») ; « Téléchargements Insta » reste le défaut. Option pour tout ranger directement dans le dossier, sans les sous-dossiers Reels / Photos.'],
      en: ['The Bank folder is picked from the existing folders (or “+ New folder…”); “Téléchargements Insta” stays the default. Option to save everything straight into the folder, without the Reels / Photos subfolders.'],
    },
  },
  {
    id: '2026-11-25j',
    date: '2026-11-25',
    title: { fr: 'Descriptions de Reels beaucoup plus rapides', en: 'Much faster Reel captions' },
    items: {
      fr: ['Les descriptions sont préparées à l’avance en fond (jusqu’à 60, seulement pour le ou les marchés du dernier posting) : au lancement elles sont prêtes tout de suite.', 'Tous les marchés (FR / US / DE) et tous les modèles Groq travaillent en même temps, par lots de 15.', 'Corrigé : un modèle retiré par Groq (« llama-3.3-70b-versatile does not exist ») bloquait tout pendant 5 min. ScaleFlow lit maintenant la liste des modèles disponibles pour ta clé et n’utilise que ceux-là.', 'Un modèle dont le quota du jour est épuisé est mis de côté tout de suite (plus d’attente de 30 min dessus) : les autres modèles continuent.'],
      en: ['Captions are prepared in the background ahead of time (up to 60, only for the market(s) of the last posting): they are ready instantly at launch.', 'All markets (FR / US / DE) and all Groq models work at the same time, in batches of 15.', 'Fixed: a model retired by Groq (“llama-3.3-70b-versatile does not exist”) blocked everything for 5 min. ScaleFlow now reads the models available for your key and only uses those.', 'A model whose daily quota is used up is set aside at once (no more 30-min wait on it): the other models carry on.'],
    },
  },
  {
    id: '2026-11-25i',
    date: '2026-11-25',
    title: { fr: 'iRemoTech : écran « We removed some content » fermé', en: 'iRemoTech: “We removed some content” screen closed' },
    items: {
      fr: ['Quand Instagram affiche « What happened · We removed some content or messages », ScaleFlow le ferme par la croix en haut à droite et continue.'],
      en: ['When Instagram shows “What happened · We removed some content or messages”, ScaleFlow closes it with the top-right ✕ and carries on.'],
    },
  },
  {
    id: '2026-11-25h',
    date: '2026-11-25',
    title: { fr: 'Descriptions IA : en quantité illimitée', en: 'AI captions: unlimited amounts' },
    items: {
      fr: ['Génération refaite pour tenir 100 descriptions et plus : plusieurs modèles Groq en parallèle (un quota chacun), attente du délai exact quand Groq limite, requêtes plus légères, plus de délai maximum fixe (arrêt seulement si Groq ne répond plus pendant 5 min). Les descriptions en trop sont gardées en réserve pour la prochaine fois, jamais servies deux fois.'],
      en: ['Generation rebuilt to handle 100+ captions: several Groq models in parallel (one quota each), waits exactly as long as Groq asks when rate-limited, lighter requests, no more fixed time limit (stops only if Groq stops answering for 5 min). Extra captions are kept in reserve for next time, never served twice.'],
    },
  },
  {
    id: '2026-11-25g',
    date: '2026-11-25',
    title: { fr: 'iRemoTech : jamais deux fois la même vidéo', en: 'iRemoTech: never the same video twice' },
    items: {
      fr: [
        'Reels et carrousels : seules les vidéos jamais publiées sont prises (mode dossier), chacune une seule fois ; un compte ne reçoit jamais deux versions de la même vidéo (« kenz 122 », « kenz 122 · v1 », « · copie 2 »). Pas assez de médias → rien ne part, avec le nombre manquant.',
        'Nouvelle option « 🗑 Supprimer de la Banque une fois publiée » pour les Reels (décochée par défaut).',
        'Légende validée plus vite (la coche est tapée directement, plus de recherche du mot « OK »).',
      ],
      en: [
        'Reels and carousels: only never-posted videos are picked (folder mode), each only once; an account never gets two versions of the same video (“kenz 122”, “kenz 122 · v1”, “· copie 2”). Not enough media → nothing starts, with the missing count.',
        'New “🗑 Delete from the Bank once posted” option for Reels (off by default).',
        'Caption confirmed faster (the checkmark is tapped directly, no more searching for the word “OK”).',
      ],
    },
  },
  {
    id: '2026-11-25f',
    date: '2026-11-25',
    title: { fr: 'iRemoTech : bouton AssistiveTouch et captures refusées gérés', en: 'iRemoTech: AssistiveTouch button and refused captures handled' },
    items: {
      fr: [
        'Le rond gris AssistiveTouch d’iOS posé sur le « + » d’Instagram ouvrait le sélecteur d’apps (plus aucun post possible, vu en vrai sur STEVIE10) : ScaleFlow le repère et le fait glisser sur le bord droit avant de publier.',
        'Capture d’écran refusée par iRemoTech (beaucoup d’iPhones en même temps) : réessayée partout au lieu d’abandonner le post (« écran illisible »).',
        'Localisation un peu plus rapide (attentes raccourcies). Testé en vrai sur STEVIE10 jusqu’au bouton Share, sans publier.',
      ],
      en: [
        'iOS’s grey AssistiveTouch button sitting on Instagram’s “+” opened the app switcher (no more posting possible, seen live on STEVIE10): ScaleFlow finds it and drags it to the right edge before posting.',
        'Screen capture refused by iRemoTech (many iPhones at once): retried everywhere instead of dropping the post (“unreadable screen”).',
        'Slightly faster location (shorter waits). Tested live on STEVIE10 up to the Share button, without posting.',
      ],
    },
  },
  {
    id: '2026-11-25d',
    date: '2026-11-25',
    title: { fr: 'iRemoTech : plus de compte « perdu » (STEVIE1)', en: 'iRemoTech: no more “lost” account (STEVIE1)' },
    items: {
      fr: [
        'Instagram resté sur le profil d’un autre compte (ouvert par erreur pendant le scroll) : ScaleFlow revient en arrière au lieu de taper sur la grille de vidéos ; la bascule de compte remarche (testé sur STEVIE1 : @kenzliannah, @viktoria.blume, @miyy.asternchen).',
        'Fermeture complète d’Instagram entre deux comptes plus jamais sautée (capture réessayée) ; si ScaleFlow ne retrouve plus l’accueil ou le profil, Instagram est fermé puis rouvert sur l’accueil.',
        'Scroll : démarre toujours depuis le fil d’accueil ; alerte iOS « Location Services » fermée (Cancel).',
      ],
      en: [
        'Instagram stuck on another account’s profile (opened by mistake while scrolling): ScaleFlow goes back instead of tapping the video grid; account switching works again (tested on STEVIE1: @kenzliannah, @viktoria.blume, @miyy.asternchen).',
        'Full Instagram close between accounts is never skipped anymore (capture retried); if ScaleFlow can’t find home or the profile, Instagram is closed and reopened on home.',
        'Scrolling always starts from the home feed; iOS “Location Services” alert dismissed (Cancel).',
      ],
    },
  },
  {
    id: '2026-11-25c',
    date: '2026-11-25',
    title: { fr: 'iRemoTech : sessions plus fiables', en: 'iRemoTech: more reliable sessions' },
    items: {
      fr: [
        'Bascule de compte : si le profil n’est pas reconnu, essai direct sur le nom du compte en haut.',
        'Localisation : ligne « Add location » trouvée sous « Tag people » même si son texte n’est pas lu ; lieu déjà posé reconnu même page défilée (plus de 2e essai inutile).',
      ],
      en: [
        'Account switch: if the profile isn’t recognised, the account name at the top is tried directly.',
        'Location: the “Add location” row is found under “Tag people” even when its text isn’t read; a set location is recognised even when the page is scrolled (no more pointless 2nd attempt).',
      ],
    },
  },
  {
    id: '2026-11-25b',
    date: '2026-11-25',
    title: { fr: 'Comptes iRemoTech : marché, NEW, lien CTA, Story · Spoof : dossier au choix', en: 'iRemoTech accounts: market, NEW, CTA link, Story · Spoof: choose folder' },
    items: {
      fr: [
        'iPhones dans l’ordre (1, 2, 3… 10) partout, aussi dans l’étape « Où ? » (par groupe puis par nom) ; liste des comptes : filtre par marché, badge NEW sur les comptes ajoutés il y a moins de 24 h.',
        'Lien CTA de chaque compte modifiable directement dans la liste (partagé avec l’équipe et repris par la Story CTA en masse).',
        'Story CTA : « en ligne · il y a 2 h » si une Story CTA publiée par ScaleFlow a moins de 24 h, sinon la date de la dernière.',
        'Banque › Spoofer en copies : choix du dossier où ranger les copies (existant ou nouveau).',
      ],
      en: [
        'iPhones in order (1, 2, 3… 10) everywhere, including the “Where?” step (by group then by name); accounts list: market filter, NEW badge on accounts added less than 24 h ago.',
        'Each account’s CTA link editable right in the list (shared with the team and used by mass CTA Stories).',
        'CTA Story: “live · 2 h ago” if a CTA Story posted by ScaleFlow is under 24 h old, otherwise the date of the last one.',
        'Bank › Spoof into copies: choose the folder for the copies (existing or new).',
      ],
    },
  },
  {
    id: '2026-11-25a',
    date: '2026-11-25',
    title: { fr: 'iRemoTech : plus d’attente sur la page de partage', en: 'iRemoTech: no more waiting on the share page' },
    items: {
      fr: ['Lieu posé reconnu tout de suite (même si le bouton Share est caché par le panneau iRemoTech) : plus de faux « non confirmé », de glissements inutiles ni de 2e essai qui défile pour rien. La ville est choisie avant les lieux qui portent son nom (« Frankfurt, Germany » plutôt que « Frankfurt Germany Temple »).'],
      en: ['A set location is recognised right away (even when the Share button is hidden by the iRemoTech panel): no more false “not confirmed”, useless swipes or a pointless 2nd attempt. The city is picked before places named after it (“Frankfurt, Germany” rather than “Frankfurt Germany Temple”).'],
    },
  },
  {
    id: '2026-11-24m',
    date: '2026-11-24',
    title: { fr: 'iRemoTech : corrections après la grosse session', en: 'iRemoTech: fixes after the big session' },
    items: {
      fr: [
        'Localisation : la ville n’est plus retapée pendant la frappe (« Stuttgart, GermanyStuttgart… » ne donnait aucun résultat) ; lieu confirmé aussi par le nom de la ville.',
        'Page de partage plus prise pour l’éditeur de légende (fini les « ✓ » en boucle puis « Add location introuvable »).',
        'Offre « Meta Verified » par-dessus le créateur → fermée (aucun abonnement) ; feuille « accès aux photos » qui restait → bouton bleu repéré à sa couleur.',
        'Journal : un post raté relancé sur le même compte est indiqué comme tel.',
      ],
      en: [
        'Location: the city is no longer retyped mid-typing (“Stuttgart, GermanyStuttgart…” gave no results); location also confirmed by the city name.',
        'The share page is no longer mistaken for the caption editor (no more looping “✓” then “Add location not found”).',
        '“Meta Verified” offer over the creator → closed (no subscription); stuck “photo access” sheet → blue button found by colour.',
        'Log: a failed post retried on the same account is labelled as such.',
      ],
    },
  },
  {
    id: '2026-11-24l',
    date: '2026-11-24',
    title: { fr: 'iRemoTech et GeeLark : nouvelles bannières', en: 'iRemoTech and GeeLark: new banners' },
    items: {
      fr: ['Chaque onglet iRemoTech (Accueil, Téléphones, Posting, Story CTA, Warm-up, Création de compte, Setup) et les pages GeeLark (Publication, Téléphones, Warmup, Programmé) ont une bannière photo réaliste, avec le titre et les infos par-dessus.'],
      en: ['Every iRemoTech tab (Home, Phones, Posting, Story CTA, Warm-up, Account creation, Setup) and the GeeLark pages (Publishing, Phones, Warmup, Scheduled) get a realistic photo banner, with the title and info on top.'],
    },
  },
  {
    id: '2026-11-24k',
    date: '2026-11-24',
    title: { fr: 'iRemoTech : la localisation ne bloque plus la session', en: 'iRemoTech: location no longer blocks the session' },
    items: {
      fr: ['Feuille « Locations » restée ouverte (champ vide) : ScaleFlow retape la ville, et en cas d’échec ferme la feuille par la croix ✕ (ou en la glissant), vérifié, puis publie sans lieu au lieu de bloquer toute la session.'],
      en: ['“Locations” sheet left open (empty field): ScaleFlow retypes the city and, if it still fails, closes the sheet with the ✕ (or by swiping it down), verified, then posts without a location instead of blocking the whole session.'],
    },
  },
  {
    id: '2026-11-24j',
    date: '2026-11-24',
    title: { fr: 'iRemoTech : bascule de compte réparée', en: 'iRemoTech: account switching fixed' },
    items: {
      fr: ['Sur certains iPhones, la barre d’onglets flottante est plus étroite : le tap sur « Profil » tombait au bord et la bascule de compte échouait. ScaleFlow vise maintenant l’icône dans les deux barres (testé en vrai sur STEVIE10).', 'Session de posts : sur un compte, post → scroll → retour VÉRIFIÉ au fil d’accueil (le « + ») → post… ; une fois ses posts finis, Instagram est fermé, l’IP change (mode avion) et on passe au compte suivant. Plus de scroll avant le 1er post d’un compte.'],
      en: ['On some iPhones the floating tab bar is narrower: the “Profile” tap landed on the edge and account switching failed. ScaleFlow now targets the icon in both bars (tested live on STEVIE10).', 'Post sessions: on one account, post → scroll → VERIFIED return to the home feed (the “+”) → post…; once its posts are done, Instagram is closed, the IP changes (airplane mode) and the next account starts. No more scrolling before an account’s first post.'],
    },
  },
  {
    id: '2026-11-24i',
    date: '2026-11-24',
    title: { fr: 'Genjutsu : rendus partagés dans l’agence', en: 'Genjutsu: renders shared across the agency' },
    items: {
      fr: ['Quand le stockage du navigateur était plein, les derniers rendus Genjutsu n’étaient plus enregistrés et disparaissaient au rechargement. ScaleFlow allège maintenant les anciens rendus terminés pour toujours garder les nouveaux. Jusqu’à 500 rendus gardés.', 'La liste des rendus est maintenant sur le serveur, partagée avec toute l’agence (avec le nom de qui l’a lancé) ; chaque rendu avance sur le navigateur qui l’a lancé.'],
      en: ['When the browser storage was full, the latest Genjutsu renders were no longer saved and disappeared on reload. ScaleFlow now slims down old finished renders to always keep the new ones. Up to 500 renders kept.', 'The render list now lives on the server, shared with the whole agency (with who launched it); each render progresses in the browser that launched it.'],
    },
  },
  {
    id: '2026-11-24h',
    date: '2026-11-24',
    title: { fr: 'Descriptions IA : plus de « aucun modèle disponible »', en: 'AI captions: no more “no model available”' },
    items: {
      fr: ['Descriptions générées par lots de 10 (au lieu de 20) sans renvoyer tout l’historique : la limite de débit de Groq n’est plus dépassée. Si un modèle est saturé, ScaleFlow passe au suivant ; si tout échoue, la vraie raison s’affiche.', 'Toutes les descriptions sont générées : un lot raté est relancé (pauses croissantes, lots plus petits) jusqu’à les avoir toutes ; jamais de posting avec des descriptions réutilisées.'],
      en: ['Captions generated in batches of 10 (instead of 20) without resending the whole history: Groq’s rate limit is no longer exceeded. If a model is saturated, ScaleFlow moves to the next one; if all fail, the real reason is shown.', 'All captions are generated: a failed batch is retried (growing pauses, smaller batches) until all are ready; never a run with reused captions.'],
    },
  },
  {
    id: '2026-11-24g',
    date: '2026-11-24',
    title: { fr: 'Accueil et Explorer : nouveaux visuels', en: 'Home and Explore: new visuals' },
    items: {
      fr: ['Nouvelles photos façon contenu de créatrice (scènes du quotidien filmées au téléphone) pour les aperçus des outils, à la une et les cartes, quand ton feed n’a pas encore assez de photos.'],
      en: ['New creator-style photos (everyday scenes shot on a phone) for tool previews, featured tiles and cards, when your feed doesn’t have enough photos yet.'],
    },
  },
  {
    id: '2026-11-24f',
    date: '2026-11-24',
    title: { fr: 'iRemoTech : légende validée avec la nouvelle coche', en: 'iRemoTech: caption confirmed with the new checkmark' },
    items: {
      fr: ['Instagram a remplacé le bouton « OK » de l’éditeur de légende par une coche bleue en haut à droite : ScaleFlow la tape et vérifie que l’éditeur est fermé avant de publier (coche repérée à sa couleur, aussi quand la liste des hashtags suggérés est ouverte). Plus de défilement dans cette liste pendant la recherche de « Add location ». Testé en vrai sur STEVIE2 : l’éditeur est reconnu à sa coche bleue (le titre « Caption » sur fond gris n’était pas lu).'],
      en: ['Instagram replaced the caption editor’s “OK” button with a blue checkmark at the top right: ScaleFlow taps it and checks the editor is closed before posting (checkmark found by its colour, even when the suggested hashtags list is open). No more scrolling in that list while looking for “Add location”. Tested live on STEVIE2: the editor is recognised by its blue checkmark (the “Caption” title on grey wasn’t read).'],
    },
  },
  {
    id: '2026-11-24e',
    date: '2026-11-24',
    title: { fr: 'iRemoTech : popups Instagram gérés', en: 'iRemoTech: Instagram popups handled' },
    items: {
      fr: ['Si Instagram affiche « Finish setting up your profile » (pendant le scroll entre deux posts ou avant un post), ScaleFlow tape « Not now » et continue le posting.', 'Écran « Allow Instagram to access your camera and microphone » → Continue, puis Allow sur les alertes iOS caméra / micro.', 'Écrans Meta « pub » (UE) : Get started → « Use free of charge with ads » (jamais l’abonnement payant) → Continue → Agree → OK.'],
      en: ['If Instagram shows “Finish setting up your profile” (while scrolling between posts or before a post), ScaleFlow taps “Not now” and keeps posting.', '“Allow Instagram to access your camera and microphone” screen → Continue, then Allow on the iOS camera / microphone alerts.', 'Meta “ads” screens (EU): Get started → “Use free of charge with ads” (never the paid subscription) → Continue → Agree → OK.'],
    },
  },
  {
    id: '2026-11-24d',
    date: '2026-11-24',
    title: { fr: 'Nouvelle page d’accueil', en: 'New home page' },
    items: {
      fr: ['Page publique refaite : plus sobre, photos d’une vraie ferme de téléphones, vignettes de Reels du quotidien (plus de visages de banque d’images), titres plus lisibles, mise en page éditoriale. L’écran de connexion prend le même style.'],
      en: ['Public page redesigned: more understated, photos of a real phone farm, everyday Reel thumbnails (no more stock faces), more readable headings, editorial layout. The sign-in screen gets the same style.'],
    },
  },
  {
    id: '2026-11-24c',
    date: '2026-11-24',
    title: { fr: 'iRemoTech : groupes, marchés et comptes plus clairs', en: 'iRemoTech: groups, markets and clearer accounts' },
    items: {
      fr: [
        'Groupes : bouton « ＋ Créer un groupe », menu pour mettre chaque iPhone dans un groupe (ou tous les iPhones cochés d’un coup), puis filtre par groupe dans Posting, Story, Warm-up… Marché par iPhone aussi. Tout est partagé avec l’équipe.',
        'Comptes détectés automatiquement toutes les 12 h : un compte déconnecté disparaît, 5 comptes max par iPhone.',
        'Statuts des comptes retirés (iRemoTech ne donne pas ceux du tableau de bord) : plus d’icônes rouges trompeuses.',
        'Story CTA : pool de textes CTA de l’équipe et lien CTA de chaque compte enregistré pour tous, pré-rempli à chaque Story.',
      ],
      en: [
        'Groups: “＋ Create a group” button, a menu to put each iPhone in a group (or all selected iPhones at once), then filter by group in Posting, Story, Warm-up… Market per iPhone too. Everything is shared with the team.',
        'Accounts detected automatically every 12 h: a logged-out account disappears, 5 accounts max per iPhone.',
        'Account statuses removed (iRemoTech doesn’t provide the dashboard ones): no more misleading red icons.',
        'Story CTA: team CTA text pool, and each account’s CTA link saved for everyone and pre-filled for every Story.',
      ],
    },
  },
  {
    id: '2026-11-24b',
    date: '2026-11-24',
    title: { fr: 'iRemoTech : plus de page noire', en: 'iRemoTech: no more black page' },
    items: {
      fr: ['Si la page iRemoTech rencontre une erreur, elle affiche le message exact (bouton « Copier l’erreur ») avec « Réessayer » et « Réinitialiser les réglages iRemoTech de ce navigateur », au lieu d’une page noire. Après une mise à jour, la page se recharge seule si besoin.'],
      en: ['If the iRemoTech page hits an error, it shows the exact message (“Copy the error” button) with “Retry” and “Reset this browser’s iRemoTech settings”, instead of a black page. After an update, the page reloads itself if needed.'],
    },
  },
  {
    id: '2026-11-24a',
    date: '2026-11-24',
    title: { fr: 'iRemoTech : page noire corrigée', en: 'iRemoTech: black page fixed' },
    items: {
      fr: ['Corrigé : l’onglet iRemoTech pouvait planter (page noire) au chargement, depuis l’ajout des journaux de lancements.'],
      en: ['Fixed: the iRemoTech tab could crash (black page) on load, since run logs were added.'],
    },
  },
  {
    id: '2026-11-23c',
    date: '2026-11-23',
    title: { fr: 'iRemoTech : nouvelle barre d’Instagram et bascule de compte sûre', en: 'iRemoTech: new Instagram bar and safe account switching' },
    items: {
      fr: [
        'Compatible avec la nouvelle barre d’onglets flottante d’Instagram (l’onglet Profil n’était plus touché : « compte non atteint »). Testé sur un iPhone à 5 comptes : bascule réussie sur chacun.',
        'Bascule vérifiée par le nom en haut du profil ; aucun tap n’est envoyé si la liste des comptes s’est refermée (un tap pouvait tomber sur un compte suggéré).',
        'Un profil connecté n’est plus pris pour l’écran « Join Instagram ». Les journaux disent « compte » (et non « container ») sur un iPhone normal.',
      ],
      en: [
        'Works with Instagram’s new floating tab bar (the Profile tab wasn’t hit anymore: “account not reached”). Tested on an iPhone with 5 accounts: switched to each one.',
        'Switch verified by the name at the top of the profile; no tap is sent if the account list closed (a tap could land on a suggested account).',
        'A logged-in profile is no longer mistaken for the “Join Instagram” screen. Logs say “account” (not “container”) on a regular iPhone.',
      ],
    },
  },
  {
    id: '2026-11-23b',
    date: '2026-11-23',
    title: { fr: 'iRemoTech : journaux des lancements gardés', en: 'iRemoTech: run logs kept' },
    items: {
      fr: ['Chaque lancement garde son journal complet (20 derniers, même après rafraîchissement) : « 📜 Journaux des lancements précédents » pour savoir pourquoi un post a échoué, et « 📋 Copier le journal » pour l’envoyer.'],
      en: ['Each run keeps its full log (last 20, even after a refresh): “📜 Logs of previous runs” to see why a post failed, and “📋 Copy log” to send it.'],
    },
  },
  {
    id: '2026-11-23a',
    date: '2026-11-23',
    title: { fr: 'iRemoTech : plus d’iPhone bloqué en mode avion', en: 'iRemoTech: no more iPhone stuck in airplane mode' },
    items: {
      fr: ['Après le changement d’IP, le moteur vérifie à l’écran que le mode avion est vraiment coupé (opérateur visible dans la barre d’état) et renvoie l’ordre sinon. Un iPhone resté en mode avion faisait échouer les publications.'],
      en: ['After the IP change, the engine checks on screen that airplane mode is really off (carrier visible in the status bar) and resends the command otherwise. An iPhone left in airplane mode made posts fail.'],
    },
  },
  {
    id: '2026-11-22t',
    date: '2026-11-22',
    title: { fr: 'Téléchargeur Insta : Reels et photos séparés', en: 'Insta downloader: Reels and photos separated' },
    items: {
      fr: ['Les vidéos téléchargées vont dans le sous-dossier « Reels » et les photos dans « Photos » du dossier choisi.', 'Corrigé : une vidéo pouvait ne pas être enregistrée (création de la miniature bloquée) ; « Voir dans la Banque » affiche maintenant tous les types (le filtre « Images » cachait les vidéos).'],
      en: ['Downloaded videos go to the “Reels” subfolder and photos to “Photos” of the chosen folder.', 'Fixed: a video could fail to be saved (stuck thumbnail); “See in the Bank” now shows all types (the “Images” filter hid videos).'],
    },
  },
  {
    id: '2026-11-22s',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : Instagram ouvert directement (plus d’Apple Music)', en: 'iRemoTech: Instagram opened directly (no more Apple Music)' },
    items: {
      fr: ['iPhones normaux : Instagram est ouvert par l’action iRemoTech « open_app », où que soit son icône (le tap sur l’icône ouvrait parfois Apple Music). L’icône reste le secours, et pour les jailbreaks (sélecteur Crane). Étalonnage du toucher attendu ~12 s.'],
      en: ['Regular iPhones: Instagram is opened with the iRemoTech “open_app” action, wherever its icon is (tapping the icon sometimes opened Apple Music). The icon remains the fallback, and is used for jailbreaks (Crane picker). Touch calibration now waits ~12 s.'],
    },
  },
  {
    id: '2026-11-22r',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : ouverture d’Instagram vérifiée', en: 'iRemoTech: Instagram opening verified' },
    items: {
      fr: ['Si une autre app s’ouvre à la place d’Instagram (ex. Apple Music), le moteur revient à l’accueil, réétalonne le toucher et réessaie.'],
      en: ['If another app opens instead of Instagram (e.g. Apple Music), the engine goes back home, recalibrates touch and tries again.'],
    },
  },
  {
    id: '2026-11-22q',
    date: '2026-11-22',
    title: { fr: 'Descriptions IA : plus de réponse vide', en: 'AI captions: no more empty answers' },
    items: {
      fr: ['Corrigé « aucune description reçue de l’IA » : le modèle qui « raisonne » renvoyait une réponse vide. Une réponse vide passe maintenant au modèle suivant, et les modèles qui écrivent directement sont essayés en premier.'],
      en: ['Fixed “no caption received from the AI”: the “reasoning” model returned an empty answer. An empty answer now moves on to the next model, and models that write directly are tried first.'],
    },
  },
  {
    id: '2026-11-22p',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : durée de scroll aléatoire', en: 'iRemoTech: random scroll length' },
    items: {
      fr: ['Le scroll entre deux posts dure un temps aléatoire à chaque fois : entre 80 % et 180 % du réglage (ex. 3 min → 2,4 à 5,4 min), jamais moins d’1 min.'],
      en: ['Scrolling between two posts lasts a random time each time: between 80% and 180% of the setting (e.g. 3 min → 2.4 to 5.4 min), never under 1 min.'],
    },
  },
  {
    id: '2026-11-22o',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : session sans sortir d’Instagram, localisation fiabilisée', en: 'iRemoTech: session without leaving Instagram, more reliable location' },
    items: {
      fr: [
        'Entre deux posts d’un même compte : plus de sortie d’Instagram, de mode avion ni de réouverture — le scroll démarre directement après le post.',
        'Localisation : alerte iOS « utiliser votre position » refusée automatiquement, fenêtres Instagram fermées, champ « Search » retrouvé même mal lu, et 2e essai si besoin.',
        'Ouverture d’Instagram : le moteur sort aussi de la page des widgets.',
      ],
      en: [
        'Between two posts of the same account: no more leaving Instagram, airplane mode or reopening — scrolling starts right after the post.',
        'Location: iOS “use your location” alert declined automatically, Instagram sheets closed, “Search” field found even when misread, and a 2nd attempt if needed.',
        'Opening Instagram: the engine also leaves the widgets page.',
      ],
    },
  },
  {
    id: '2026-11-22n',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : session = posts par compte', en: 'iRemoTech: session = posts per account' },
    items: {
      fr: ['« Posts par compte » : chaque compte coché publie N fois d’affilée (vidéo, description et lieu différents à chaque fois), avec le scroll entre deux posts — même s’il est seul sur son iPhone.'],
      en: ['“Posts per account”: each ticked account posts N times in a row (different video, caption and place each time), with scrolling between two posts — even if it is alone on its iPhone.'],
    },
  },
  {
    id: '2026-11-22m',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : toujours la dernière vidéo envoyée', en: 'iRemoTech: always the last video sent' },
    items: {
      fr: ['Corrigé : un Reel pouvait partir avec une ancienne vidéo (la pré-sélection d’Instagram). Le moteur tape maintenant toujours la case juste après l’appareil photo = la vidéo qu’on vient d’envoyer.'],
      en: ['Fixed: a Reel could go out with an old video (Instagram’s pre-selection). The engine now always taps the cell right after the camera = the video just sent.'],
    },
  },
  {
    id: '2026-11-22l',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : Setup compte (photo de profil + bio) et Story CTA à usage unique', en: 'iRemoTech: Account setup (profile picture + bio) and single-use CTA Story' },
    items: {
      fr: [
        'Nouvel onglet « Setup compte » : pour chaque compte, une photo de profil unique créée par le générateur rose (dégradé, paillettes, cœurs) et une bio de 3 lignes générée avec le prompt du marché du compte (FR / US / DE), posées sur l’iPhone et vérifiées.',
        'Story CTA : « 🧬 Métadonnées uniques » (chaque photo rendue unique : micro-recadrage + EXIF d’iPhone) et « 🗑 Usage unique » (la photo du dossier est supprimée de la Banque une fois publiée).',
      ],
      en: [
        'New “Account setup” tab: for each account, a unique profile picture from the pink generator (gradient, glitter, hearts) and a 3-line bio generated with the account’s market prompt (FR / US / DE), set on the iPhone and verified.',
        'CTA Story: “🧬 Unique metadata” (each photo made unique: micro-crop + iPhone EXIF) and “🗑 Single use” (the folder photo is deleted from the Bank once posted).',
      ],
    },
  },
  {
    id: '2026-11-22k',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : scroll dans l’onglet Reels', en: 'iRemoTech: scrolling in the Reels tab' },
    items: {
      fr: ['Warm-up et scroll entre deux posts : ouverture du vrai onglet Reels (2e icône, Instagram l’a déplacé) au lieu de Rechercher ; après le scroll d’une session, on reste dans Instagram et le post suivant part bien (testé : 2 Reels d’affilée avec 1 min de scroll).'],
      en: ['Warm-up and scrolling between two posts: opens the real Reels tab (2nd icon, Instagram moved it) instead of Search; after a session scroll we stay in Instagram and the next post goes out (tested: 2 Reels in a row with 1 min of scrolling).'],
    },
  },
  {
    id: '2026-11-22j',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : vrais crédits sur l’Accueil', en: 'iRemoTech: real credits on Home' },
    items: {
      fr: ['Accueil : dépensé ce mois / plafond, actions, images et envois gratuits restants aujourd’hui, utilisation du jour et warm-ups (jetons) du mois. Le solde de jetons n’est pas fourni par l’API iRemoTech.'],
      en: ['Home: spent this month / cap, free actions, frames and uploads left today, today’s usage and this month’s warm-ups (tokens). The token balance is not provided by the iRemoTech API.'],
    },
  },
  {
    id: '2026-11-22i',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : Accueil et Posting regroupé', en: 'iRemoTech: Home and grouped Posting' },
    items: {
      fr: [
        'Nouvelle page Accueil : crédits iRemoTech restants (actions, minutes, captures, envois, remise à zéro), iPhones en ligne, comptes sains / à surveiller / éligibles Trial, comptes créés.',
        'Posting regroupé comme sur GeeLark : sous-onglets 🎬 Reels · 🖼 Carrousel · 📸 Story CTA (la Story n’a plus son entrée à part).',
      ],
      en: [
        'New Home page: remaining iRemoTech credits (actions, minutes, screenshots, uploads, reset), iPhones online, healthy / to-watch / Trial-eligible accounts, created accounts.',
        'Posting grouped like on GeeLark: 🎬 Reels · 🖼 Carousel · 📸 CTA Story sub-tabs (Story no longer has its own entry).',
      ],
    },
  },
  {
    id: '2026-11-22h',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : sessions de posts, crédits restants, éligibilité Trial', en: 'iRemoTech: post sessions, remaining credits, Trial eligibility' },
    items: {
      fr: [
        'Crédits iRemoTech restants affichés en haut : actions, minutes, captures, envois et heure de remise à zéro (mis à jour après chaque lancement).',
        'Session de posts : N posts max par iPhone (1 par défaut) et 3 min par défaut entre deux posts (minimum 1), passées à scroller sur le compte avant son post (évite le flag robot).',
        'Comptes Instagram : badge « Trial ✓ / Pas Trial » d’après le statut iRemoTech (compte professionnel ou non).',
      ],
      en: [
        'Remaining iRemoTech credits shown at the top: actions, minutes, screenshots, uploads and reset time (refreshed after each run).',
        'Post session: N posts max per iPhone (1 by default) and 3 min by default between two posts (minimum 1), spent scrolling the account before its post (avoids the bot flag).',
        'Instagram accounts: “Trial ✓ / No Trial” badge from the iRemoTech status (professional account or not).',
      ],
    },
  },
  {
    id: '2026-11-22g',
    date: '2026-11-22',
    title: { fr: 'Descriptions IA : modèle Groq de secours', en: 'AI captions: fallback Groq model' },
    items: {
      fr: ['Corrigé : « The model llama-3.3-70b-versatile does not exist ». Si Groq retire un modèle, ScaleFlow passe automatiquement au suivant (gpt-oss, Llama 4, Kimi, Qwen…) et retient celui qui marche.'],
      en: ['Fixed: “The model llama-3.3-70b-versatile does not exist”. If Groq retires a model, ScaleFlow automatically switches to the next one (gpt-oss, Llama 4, Kimi, Qwen…) and remembers the one that works.'],
    },
  },
  {
    id: '2026-11-22f',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : localisation selon le marché du compte', en: 'iRemoTech: location based on the account’s market' },
    items: {
      fr: [
        '« 📍 Localisation selon le marché » (Posting › Description auto) : chaque Reel / carrousel reçoit une grande ville du pays du compte (France, USA, Allemagne), choisie au hasard.',
        'Le bon lieu est vérifié : la ligne doit commencer par la ville et porter le pays ou l’État (« Paris, France », jamais « Paris Las Vegas » ni « West Miami »). Sans lieu trouvé, la publication part quand même, sans localisation.',
      ],
      en: [
        '“📍 Location by market” (Posting › Auto caption): each Reel / carousel gets a big city in the account’s country (France, USA, Germany), picked at random.',
        'The right place is verified: the row must start with the city and carry the country or state (“Paris, France”, never “Paris Las Vegas” or “West Miami”). If no place is found, the post still goes out, without location.',
      ],
    },
  },
  {
    id: '2026-11-22e',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : descriptions avec accents et emojis, publication vérifiée', en: 'iRemoTech: captions with accents and emojis, verified posting' },
    items: {
      fr: [
        'Les descriptions avec accents, emojis, ü, ß… sont collées telles quelles (presse-papiers de l’iPhone) : avant, « vous êtes là ou pas ? 🙈 » devenait « vous tes l ou pas ? ».',
        'Après « Share », la publication est vérifiée : la fenêtre « Update on your original audio » est validée, et un Share sans effet n’est plus jamais annoncé comme publié.',
        'Le + d’Instagram ouvre maintenant une feuille « Create » ou le dernier mode utilisé : le moteur passe par « Post », ou ferme la galerie Story rouverte.',
      ],
      en: [
        'Captions with accents, emojis, ü, ß… are pasted exactly (iPhone clipboard): before, “vous êtes là ou pas ? 🙈” became “vous tes l ou pas ?”.',
        'After “Share”, posting is verified: the “Update on your original audio” sheet is confirmed, and a Share with no effect is never reported as posted again.',
        'Instagram’s + now opens a “Create” sheet or the last mode used: the engine goes through “Post”, or closes the reopened Story gallery.',
      ],
    },
  },
  {
    id: '2026-11-22d',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : description de Reel auto selon le marché de chaque compte', en: 'iRemoTech: auto Reel caption based on each account’s market' },
    items: {
      fr: [
        'Posting › Description › « 🤖 Auto par marché » : chaque compte a son marché (🇫🇷 France, 🇺🇸 USA, 🇩🇪 Allemagne) et reçoit au lancement une description de Reel différente, générée par l’IA avec le prompt de SON marché.',
        'Marché par défaut, « Tous en 🇫🇷/🇺🇸/🇩🇪 », aperçu de 5 descriptions et prompt de chaque marché modifiable. Les descriptions sur plusieurs lignes (hashtags dessous) sont tapées telles quelles.',
      ],
      en: [
        'Posting › Caption › “🤖 Auto by market”: each account has its market (🇫🇷 France, 🇺🇸 USA, 🇩🇪 Germany) and gets a different Reel caption at launch, generated by AI with ITS market’s prompt.',
        'Default market, “All in 🇫🇷/🇺🇸/🇩🇪”, 5-caption preview and editable prompt per market. Multi-line captions (hashtags below) are typed as is.',
      ],
    },
  },
  {
    id: '2026-11-22c',
    date: '2026-11-22',
    title: { fr: '« Comptes créés » = simple journal', en: '“Created accounts” = a plain log' },
    items: {
      fr: ['« Comptes créés » n’est plus lié aux containers : identifiant, mot de passe, numéro, pays, date et log de chaque compte créé (copie et export CSV sans iPhone ni container).'],
      en: ['“Created accounts” is no longer tied to containers: username, password, number, country, date and log of each created account (copy and CSV export without iPhone or container).'],
    },
  },
  {
    id: '2026-11-22b',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : statut des comptes vérifié automatiquement', en: 'iRemoTech: account status checked automatically' },
    items: {
      fr: [
        'Nouveau bouton « ✅ Vérifier tous les comptes » (Comptes Instagram) : la vérification du statut iRemoTech est lancée sur tous les comptes, un par un, et le statut s’affiche au fur et à mesure.',
        'Statut automatique (activé par défaut) : ScaleFlow fait relire les comptes de chaque iPhone et revérifier chaque compte par iRemoTech toutes les 24 h — gratuit, jamais pendant une publication.',
      ],
      en: [
        'New “✅ Check all accounts” button (Instagram accounts): the iRemoTech status check is launched on every account, one by one, and the status shows up as results arrive.',
        'Automatic status (on by default): ScaleFlow has iRemoTech re-read each iPhone’s accounts and re-check each account every 24 h — free, never during a post.',
      ],
    },
  },
  {
    id: '2026-11-22a',
    date: '2026-11-22',
    title: { fr: 'iRemoTech : plus de faux « Jailbreak », comptes repris d’iRemoTech', en: 'iRemoTech: no more false “Jailbreak”, accounts taken from iRemoTech' },
    items: {
      fr: [
        'Un iPhone n’est marqué « Jailbreak » que si le sélecteur de containers Crane a vraiment été lu. Une liste douteuse (ancienne détection, saisie à la main) affiche « ❓ À vérifier » : clique ↻ pour relire l’iPhone.',
        'Les comptes déjà lus par iRemoTech (lecture des comptes du tableau de bord) deviennent automatiquement les comptes de l’iPhone, avec leur statut, sans détection à l’écran.',
        'Corrigé : la détection des containers prenait des chiffres d’Instagram (compteurs, pastilles) pour des containers sur un iPhone normal. Elle exige maintenant la ligne « Default » du vrai sélecteur Crane.',
      ],
      en: [
        'An iPhone is marked “Jailbreak” only if the Crane container picker was really read. A doubtful list (old detection, typed by hand) shows “❓ To check”: click ↻ to re-read the iPhone.',
        'Accounts already read by iRemoTech (dashboard account scan) automatically become the iPhone’s accounts, with their status, without on-screen detection.',
        'Fixed: container detection took Instagram numbers (counters, badges) for containers on a regular iPhone. It now requires the “Default” row of the real Crane picker.',
      ],
    },
  },
  {
    id: '2026-11-21m',
    date: '2026-11-21',
    title: { fr: 'Studio : Téléchargeur Insta', en: 'Studio: Insta downloader' },
    items: {
      fr: ['Nouvel outil du Studio « Téléchargeur Insta » : colle un ou plusieurs liens Instagram (Reel, photo, carrousel) — vidéos en .mp4 et photos en .jpg rangées directement dans un dossier de la Banque (« Téléchargements Insta » par défaut), ouvert d’un clic avec « Voir dans la Banque ».'],
      en: ['New Studio tool “Insta downloader”: paste one or more Instagram links (Reel, photo, carousel) — videos as .mp4 and photos as .jpg saved straight into a Bank folder (“Téléchargements Insta” by default), opened in one click with “See in the Bank”.'],
    },
  },
  {
    id: '2026-11-21l',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : containers vérifiés à l’écran', en: 'iRemoTech: containers checked on screen' },
    items: {
      fr: [
        'Création de comptes : ScaleFlow ne se fie plus à la liste « Comptes créés » pour savoir quels containers remplir. Il ouvre chaque container et lit ce qu’il contient vraiment : vide, @compte connecté, ou bloqué (« Confirm you’re human »).',
        'Nouveau bouton « 🔎 Vérifier les containers » (sans rien acheter) ; chaque container affiche son état (@compte / vide / 🤖) et « Cocher les containers vides » s’en sert.',
        'Ouverture d’Instagram plus fiable : si l’iPhone est resté sur la Bibliothèque d’apps, le moteur revient aux pages d’accueil.',
      ],
      en: [
        'Account creation: ScaleFlow no longer relies on the “Created accounts” list to know which containers to fill. It opens each container and reads what it really holds: empty, logged-in @account, or blocked (“Confirm you’re human”).',
        'New “🔎 Check the containers” button (buys nothing); each container shows its state (@account / empty / 🤖) and “Tick the empty containers” uses it.',
        'More reliable Instagram opening: if the iPhone was left on the App Library, the engine goes back to the home pages.',
      ],
    },
  },
  {
    id: '2026-11-21k',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : création de comptes en boucle (option)', en: 'iRemoTech: account creation loop (option)' },
    items: {
      fr: [
        'Nouvelle option « 🔁 Boucle » (Création de comptes, iPhones jailbreakés) : dans chaque container, un compte est créé, rangé dans « Comptes créés », déconnecté (Profil › ☰ › Log out), puis « Create new account » pour le suivant.',
        'Garde-fous : comptes max par container, pause aléatoire entre deux comptes, budget numéros max, mode avion avant chaque compte, et arrêt de l’iPhone au premier refus ou captcha d’Instagram.',
        'Le compte déjà présent dans un container n’est déconnecté que si la case « Déconnecter aussi le compte déjà présent » est cochée.',
      ],
      en: [
        'New “🔁 Loop” option (Account creation, jailbroken iPhones): in each container an account is created, saved in “Created accounts”, logged out (Profile › ☰ › Log out), then “Create new account” for the next one.',
        'Safeguards: max accounts per container, random pause between accounts, max number budget, airplane mode before each account, and the iPhone stops at Instagram’s first refusal or captcha.',
        'The account already in a container is only logged out if “Also log out the account already there” is ticked.',
      ],
    },
  },
  {
    id: '2026-11-21j',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : sticker lien en bas à droite', en: 'iRemoTech: link sticker at the bottom right' },
    items: {
      fr: [
        'Story CTA : le sticker lien est lu à l’écran puis glissé dans le coin bas-droite, et sa position est vérifiée (jusqu’à 3 essais).',
        'Publication depuis l’onglet Profil : la feuille « Create » ouverte par le + est fermée et le moteur repasse par le fil (Story, Reel et carrousel).',
      ],
      en: [
        'CTA Story: the link sticker is read on screen, dragged into the bottom-right corner and its position is checked (up to 3 tries).',
        'Posting from the Profile tab: the “Create” sheet opened by + is closed and the engine goes back through the feed (Story, Reel and carousel).',
      ],
    },
  },
  {
    id: '2026-11-21i',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : Story CTA fiabilisée', en: 'iRemoTech: more reliable CTA Story' },
    items: {
      fr: [
        'Story : la photo choisie est toujours la dernière envoyée (galerie « Add to story » lue par position ; la vignette de la caméra montrait parfois une ancienne photo).',
        'Sticker lien : la puce « Link » est visée sous l’intitulé « Stickers » et l’écran « Add link » est vérifié (URL / Customize) ; s’il n’est pas atteint, rien n’est publié (plus de Story sans lien).',
        'Correction automatique du clavier iOS coupée une fois par iPhone avant les publications (« Clique ici » ne devient plus « Clique I I », légendes françaises intactes).',
        'Fenêtres « Introducing story-to-story sharing » et « Stories archive » fermées seules ; la feuille Musique ouverte par erreur est refermée.',
      ],
      en: [
        'Story: the chosen photo is always the last one sent (“Add to story” gallery read by position; the camera thumbnail sometimes showed an older photo).',
        'Link sticker: the “Link” chip is targeted under the “Stickers” heading and the “Add link” screen is verified (URL / Customize); if it is not reached nothing is published (no more Story without a link).',
        'iOS keyboard auto-correction turned off once per iPhone before posting (“Clique ici” no longer becomes “Clique I I”, French captions stay intact).',
        '“Introducing story-to-story sharing” and “Stories archive” windows closed on their own; the Music sheet opened by mistake is closed again.',
      ],
    },
  },
  {
    id: '2026-11-21h',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : carrousel photo avec musique', en: 'iRemoTech: photo carousel posts with music' },
    items: {
      fr: [
        'Posting › « 🖼 Carrousel photo » : chaque compte coché publie un post de 2 à 6 photos différentes (pool ou dossier de la Banque) avec une légende de la liste.',
        'Les photos sont injectées dans l’ordre puis cochées une à une en sélection multiple ; chaque coche est vérifiée à l’écran avant la suivante (jamais de double tap qui décocherait).',
        'Fenêtres « première fois » d’Instagram passées seules (« Share more », « Find your vibe », « Sharing posts ») ; si Instagram n’a pas accès aux photos, ScaleFlow coche « All Photos » dans les Réglages iOS puis reprend.',
        'ScaleFlow attend la fin de « Posting… » avant de quitter Instagram.',
        '🎵 Musique obligatoire sur le carrousel : la musique suggérée par Instagram est ajoutée (sinon un des premiers morceaux « For you »), vérifiée à l’écran ; sans musique, rien n’est publié. Case « 🎵 Musique (obligatoire) » pour la couper.',
      ],
      en: [
        'Posting › “🖼 Photo carousel”: each checked account publishes a post of 2 to 6 different photos (pool or Bank folder) with a caption from the list.',
        'Photos are injected in order then checked one by one in multiple selection; each check is verified on screen before the next one (never a double tap that would uncheck).',
        'Instagram “first time” windows handled on their own (“Share more”, “Find your vibe”, “Sharing posts”); if Instagram has no photo access, ScaleFlow selects “All Photos” in iOS Settings then resumes.',
        'ScaleFlow waits for “Posting…” to finish before leaving Instagram.',
        '🎵 Music required on carousels: Instagram\'s suggested music is added (otherwise one of the first “For you” tracks) and verified on screen; without music nothing is published. “🎵 Music (required)” checkbox to turn it off.',
      ],
    },
  },
  {
    id: '2026-11-21g',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : un cerveau IA pour les écrans inconnus', en: 'iRemoTech: an AI brain for unknown screens' },
    items: {
      fr: [
        'Quand l’automatisation tombe sur un écran qu’elle ne connaît pas, elle montre la capture à une IA vision (clé Groq de l’espace, Réglages › IA) qui choisit le bon bouton parmi ceux lus à l’écran, avec sa raison dans le journal (« 🧠 IA : … »).',
        'Garde-fous codés en dur : jamais « Allow » contacts / notifications / localisation, jamais « Follow », supprimer, se déconnecter ni payer ; captcha → container suivant.',
        'Utilisé en fin de création de compte et pour revenir au fil Instagram depuis n’importe quel écran.',
        'Posting : l’éditeur vidéo (Audio / Text / Captions, « Next → » en bas à droite) est reconnu et passé à coup sûr (bouton repéré à sa couleur, vérifié, double tap si besoin).',
        'Mode avion seulement hors d’Instagram : ScaleFlow revient sur l’écran d’accueil avant de couper le réseau, puis ouvre Instagram sur le compte / container suivant.',
        'Bascule de compte : si Instagram demande une vérification humaine ou revient sur « Join Instagram », le compte est passé (journal clair) au lieu de tourner en rond.',
        'Story : le tiroir des stickers est vérifié avant de taper « link » (plus de « Link » écrit en texte quand l’icône est décalée : l’outil Texte est refermé sans rien écrire et l’icône suivante est essayée) ; le sticker lien est glissé plus bas à droite.',
      ],
      en: [
        'When the automation hits a screen it does not know, it shows the screenshot to a vision AI (the workspace Groq key, Settings › AI) that picks the right button among those read on screen, with its reason in the log (“🧠 AI: …”).',
        'Hard-coded guardrails: never “Allow” contacts / notifications / location, never “Follow”, delete, log out or pay; captcha → next container.',
        'Used at the end of account creation and to get back to the Instagram feed from any screen.',
        'Posting: the video editor (Audio / Text / Captions, “Next →” at the bottom right) is recognised and passed reliably (button found by its colour, checked, double tap if needed).',
        'Airplane mode only outside Instagram: ScaleFlow goes back to the home screen before cutting the network, then opens Instagram on the next account / container.',
        'Account switch: if Instagram asks for a human check or goes back to “Join Instagram”, the account is skipped (clear log) instead of looping.',
        'Story: the sticker tray is checked before typing “link” (no more “Link” written as text when the icon is offset: the Text tool is closed without typing and the next icon is tried); the link sticker is dragged further to the bottom right.',
      ],
    },
  },
  {
    id: '2026-11-21f',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : comptes signalés en rouge, faux comptes retirés', en: 'iRemoTech: flagged accounts in red, fake accounts removed' },
    items: {
      fr: [
        '« ! » rouge sur les comptes signalés par le statut iRemoTech (non recommandé aux non-abonnés, contenu supprimé…) : dans l’étape « Où ? » et dans Comptes Instagram.',
        'Les lignes « 1 notification », « 3 likes and 4 more »… sous un compte ne sont plus prises pour des comptes ; ceux déjà enregistrés sont retirés automatiquement.',
      ],
      en: [
        'Red “!” on accounts flagged by the iRemoTech status (not recommended to non-followers, removed content…): in the “Where?” step and in Instagram accounts.',
        'The “1 notification”, “3 likes and 4 more”… lines under an account are no longer taken for accounts; those already saved are removed automatically.',
      ],
    },
  },
  {
    id: '2026-11-21e',
    date: '2026-11-21',
    title: { fr: 'Comptes Instagram : vue compacte pour beaucoup d’iPhones', en: 'Instagram accounts: compact view for many iPhones' },
    items: {
      fr: [
        'Une ligne par compte (photo, posts, abonnés, abonnements, statut, activité), groupes par iPhone repliables ou liste simple, filtre par iPhone.',
        'Les iPhones sans compte connu sont regroupés en une seule ligne en bas.',
        'Posts / abonnés / abonnements lus directement sur l’écran de l’iPhone (bouton « 📊 Relire », et à chaque posting).',
        '« Monétisation » n’est plus compté comme un problème : c’est juste un compte non professionnel.',
        'Étape « Où ? » (Posting, Story, Warm-up) : une ligne par iPhone au lieu de grandes cartes, recherche d’un iPhone ou d’un compte, iPhones pas encore détectés masqués.',
      ],
      en: [
        'One line per account (picture, posts, followers, following, status, activity), collapsible groups per iPhone or a plain list, iPhone filter.',
        'iPhones with no known account are grouped into a single line at the bottom.',
        'Posts / followers / following read directly on the iPhone screen (“📊 Re-read” button, and on every post).',
        '“Monetization” no longer counts as a problem: it just means a non-professional account.',
        '“Where?” step (Posting, Story, Warm-up): one line per iPhone instead of big cards, search for an iPhone or an account, iPhones not detected yet hidden.',
      ],
    },
  },
  {
    id: '2026-11-21d',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : sélection des comptes corrigée, identifiants visibles', en: 'iRemoTech: account selection fixed, credentials shown' },
    items: {
      fr: [
        'Cliquer sur un compte ne sélectionne plus tous les comptes de l’iPhone : seulement celui-là. La case de l’iPhone coche / décoche tout (état « – » si partiel).',
        'Création de comptes : seuls les iPhones jailbreakés sont proposés.',
        'Comptes créés : identifiant et mot de passe dans deux colonnes (copie en un clic, clé 2FA si présente) et bouton « Importer des comptes » (identifiant:motdepasse[:2FA]).',
        'Comptes Instagram : mot de passe affiché pour les comptes connus ; publications / abonnés aussi relus via le relais iRemoTech quand la fonction serveur n’est pas disponible.',
      ],
      en: [
        'Clicking an account no longer selects every account of the iPhone: only that one. The iPhone box ticks / unticks everything (“–” when partial).',
        'Account creation: only jailbroken iPhones are offered.',
        'Created accounts: username and password in two columns (one-click copy, 2FA key if any) and an “Import accounts” button (username:password[:2FA]).',
        'Instagram accounts: password shown for known accounts; posts / followers also read through the iRemoTech relay when the server function is unavailable.',
      ],
    },
  },
  {
    id: '2026-11-21c',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : nouvel onglet « Comptes Instagram »', en: 'iRemoTech: new “Instagram accounts” tab' },
    items: {
      fr: [
        'Tous les comptes de tes iPhones, rangés par iPhone : photo, publications, abonnés, abonnements, statut Instagram et derniers warm-ups.',
        'Scan des comptes par iRemoTech (sur un iPhone ou tous) : les comptes trouvés deviennent des cibles de posting sur les iPhones normaux.',
        'Vérifier le statut (6 indicateurs : non recommandé aux non-abonnés, contenu supprimé…) et lancer des warm-ups iRemoTech (5 à 20 min), à l’unité ou en lot.',
        'Tout est relu depuis l’historique iRemoTech : partagé avec toute l’équipe.',
      ],
      en: [
        'All the accounts on your iPhones, grouped by iPhone: picture, posts, followers, following, Instagram status and latest warm-ups.',
        'Account scan by iRemoTech (one iPhone or all): accounts found become posting targets on regular iPhones.',
        'Check the status (6 indicators: not recommended to non-followers, removed content…) and start iRemoTech warm-ups (5 to 20 min), one by one or in bulk.',
        'Everything is read back from the iRemoTech history: shared with the whole team.',
      ],
    },
  },
  {
    id: '2026-11-21b',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : iPhones normaux et jailbreakés bien distingués', en: 'iRemoTech: regular and jailbroken iPhones clearly told apart' },
    items: {
      fr: [
        'Chaque iPhone affiche son type : « 📱 iPhone normal » (comptes Instagram connectés) ou « 🔓 Jailbreak » (containers Crane), et compte ses cibles dans la bonne unité.',
        '« Détecter » va directement à la bonne méthode une fois le type connu (plus de recherche de containers inutile sur un iPhone normal) ; à la 1re détection, il essaie Crane puis lit les comptes.',
        'Résumés « 3 containers · 2 comptes » dans les étapes ; la création de comptes indique que les iPhones normaux n’y servent pas.',
      ],
      en: [
        'Each iPhone shows its type: “📱 Regular iPhone” (logged-in Instagram accounts) or “🔓 Jailbreak” (Crane containers), and counts its targets in the right unit.',
        '“Detect” goes straight to the right method once the type is known (no more useless container search on a regular iPhone); on the first detection it tries Crane, then reads the accounts.',
        '“3 containers · 2 accounts” summaries in the steps; account creation says regular iPhones are not used for it.',
      ],
    },
  },
  {
    id: '2026-11-21a',
    date: '2026-11-21',
    title: { fr: 'iRemoTech : posting sur iPhones normaux avec plusieurs comptes', en: 'iRemoTech: posting on regular iPhones with several accounts' },
    items: {
      fr: [
        '« 🔍 Détecter » sur un iPhone non jailbreaké lit les comptes Instagram connectés (Profil → nom en haut) et les ajoute comme cibles « @nom ».',
        'Posting, Story et Warm-up : pour une cible « @nom », ScaleFlow bascule sur ce compte et vérifie qu’il est bien actif (coche bleue) avant de publier.',
        'La création de comptes ignore les iPhones non jailbreakés.',
        'Posting sur iPhone normal fiabilisé : popup « Allow iRemotech … ifconfig.me » autorisée, attente du réseau après le mode avion, accès aux photos accordé (« Allow Full Access »), autres alertes iOS gérées, retour automatique au fil (créateur, Reel plein écran, popup « shared as reels »), dernière vidéo choisie par sa durée (la 1re case est l’appareil photo), « Next » en haut à droite.',
      ],
      en: [
        '“🔍 Detect” on a non-jailbroken iPhone reads the logged-in Instagram accounts (Profile → name at the top) and adds them as “@name” targets.',
        'Posting, Story and Warm-up: for an “@name” target, ScaleFlow switches to that account and checks it is active (blue tick) before posting.',
        'Account creation skips non-jailbroken iPhones.',
        'More reliable posting on regular iPhones: “Allow iRemotech … ifconfig.me” popup allowed, wait for the network after airplane mode, photo access granted (“Allow Full Access”), other iOS alerts handled, automatic return to the feed (creator, full-screen Reel, “shared as reels” popup), latest video picked by its duration (the first cell is the camera), “Next” at the top right.',
      ],
    },
  },
  {
    id: '2026-11-20g',
    date: '2026-11-20',
    title: { fr: 'iRemoTech : création de comptes testée en vrai et corrigée', en: 'iRemoTech: account creation tested live and fixed' },
    items: {
      fr: [
        'Détection des containers : la liste est lue sans faire défiler le sélecteur (un défilement ouvrait un container au hasard). Le bon container est ouvert, et on vérifie que le sélecteur s’est bien fermé.',
        'Un container dont l’inscription avait été commencée puis abandonnée est reconnu comme vierge et repris à l’écran du numéro.',
        'Le nom d’utilisateur choisi est bien saisi ; si Instagram garde sa propre suggestion, c’est celle-ci qui est enregistrée dans les identifiants.',
        'Refus d’Instagram (« We couldn’t create an account for you ») détecté : le compte n’est plus marqué créé, et aucun autre numéro n’est acheté pour ce container.',
        'Écran des cookies accepté automatiquement (Instagram redémarré s’il ne répond pas).',
        'Mode avion : l’arrêt du mode avion est renvoyé jusqu’à ce qu’iRemoTech l’accepte (il pouvait rester activé).',
        'Prix max SMSPool par défaut : 1 $ (un numéro USA coûte environ 0,42 $).',
        'Après un essai raté, le container restait sur l’écran du code : il est maintenant remis à zéro (« Stop creating account ») avant le numéro suivant.',
        'Page « Create a password » : le champ est visé au bon endroit (plus la ligne d’erreur), le mot de passe est bien saisi.',
        'Création de comptes : mode avion (nouvelle IP) TOUJOURS fait avant chaque container.',
        'Fin d’inscription pilotée par l’écran : chaque écran connu a son action (popups iOS « Don’t Allow », galerie photo, Skip en haut ou en bas, cookies, « Save login info »…) jusqu’au fil Instagram prêt à poster ; on ne quitte plus le container en cours de route.',
        'Vérification humaine (« Confirm you’re human ») : pas résolue, on passe au container suivant.',
        '« Follow 5 or more people » sans Skip : tous les comptes pré-cochés sont décochés puis « Next ».',
        'Comptes créés : la clé 2FA (si activée) est copiée au format username:password:2fa et exportée en CSV.',
        'Si le mot de passe n’est pas pris, ScaleFlow retape le champ (3 essais) au lieu de continuer à l’aveugle ; sinon le compte est marqué échoué. Fini les comptes « password:… » marqués créés à tort.',
      ],
      en: [
        'Container detection: the list is read without scrolling the picker (scrolling opened a random container). The right container is opened, and we check that the picker actually closed.',
        'A container whose signup was started then abandoned is recognised as blank and resumed at the phone number screen.',
        'The chosen username is now typed correctly; if Instagram keeps its own suggestion, that one is saved in the credentials.',
        'Instagram refusal (“We couldn’t create an account for you”) detected: the account is no longer marked as created, and no other number is bought for that container.',
        'Cookie screen accepted automatically (Instagram restarted if it does not respond).',
        'Airplane mode: turning airplane mode off is resent until iRemoTech accepts it (it could stay on).',
        'Default SMSPool max price: $1 (a US number costs about $0.42).',
        'After a failed attempt, the container stayed on the code screen: it is now reset (“Stop creating account”) before the next number.',
        '“Create a password” page: the field is targeted at the right place (no longer the error line), the password is typed correctly.',
        'Account creation: airplane mode (new IP) ALWAYS done before each container.',
        'Screen-driven end of signup: each known screen has its action (iOS “Don’t Allow” popups, photo gallery, Skip at the top or bottom, cookies, “Save login info”…) until the Instagram feed is ready to post; the container is no longer left midway.',
        'Human check (“Confirm you’re human”): not solved, we move to the next container.',
        '“Follow 5 or more people” without Skip: every pre-ticked account is unticked, then “Next”.',
        'Created accounts: the 2FA key (if enabled) is copied as username:password:2fa and exported to CSV.',
        'If the password is not taken, ScaleFlow types the field again (3 attempts) instead of carrying on blind; otherwise the account is marked failed. No more “password:…” accounts wrongly marked as created.',
      ],
    },
  },
  {
    id: '2026-11-20f',
    date: '2026-11-20',
    title: { fr: 'iRemoTech : nouvelle IP par le mode avion natif', en: 'iRemoTech: new IP through native airplane mode' },
    items: {
      fr: ['La rotation d’IP entre deux containers utilise maintenant l’action « mode avion » d’iRemoTech (plus de Centre de contrôle à ouvrir à l’écran) : plus rapide et plus fiable. L’IP est lue avant et après, et le journal prévient si elle n’a pas changé. Ancienne méthode en secours si l’action est refusée.'],
      en: ['IP rotation between two containers now uses iRemoTech’s “airplane mode” action (no more opening the Control Center on screen): faster and more reliable. The IP is read before and after, and the log warns if it did not change. The old method is the fallback if the action is refused.'],
    },
  },
  {
    id: '2026-11-20e',
    date: '2026-11-20',
    title: { fr: 'iRemoTech : iPhones de nouveau « en ligne » + champ pour la clé', en: 'iRemoTech: iPhones “online” again + a field for the key' },
    items: {
      fr: ['iRemoTech ne renvoie plus l’état des iPhones : ScaleFlow les croyait tous hors ligne (« 0 en ligne »). Ils sont maintenant considérés joignables, et le nom que tu leur as donné dans iRemoTech est affiché.', 'Nouveau bouton « ⚙ Clé iRemoTech » (étape 1) : colle ta clé, ScaleFlow la vérifie (nombre d’iPhones trouvés) puis l’enregistre pour toi et pour l’agence.'],
      en: ['iRemoTech no longer returns the iPhones’ state: ScaleFlow thought they were all offline (“0 online”). They are now considered reachable, and the name you gave them in iRemoTech is shown.', 'New “⚙ iRemoTech key” button (step 1): paste your key, ScaleFlow checks it (number of iPhones found) then saves it for you and for the agency.'],
    },
  },
  {
    id: '2026-11-20d',
    date: '2026-11-20',
    title: { fr: 'iRemoTech : tous les iPhones de l’agence', en: 'iRemoTech: every agency iPhone' },
    items: {
      fr: ['Dans une agence, ScaleFlow utilise maintenant la clé iRemoTech de l’agence en priorité : une ancienne clé perso ne cache plus les nouveaux iPhones. Bouton « ↻ Actualiser » et rappel de la clé utilisée (4 derniers caractères) pour voir tout de suite ce qui est chargé.'],
      en: ['In an agency, ScaleFlow now uses the agency’s iRemoTech key first: an old personal key no longer hides new iPhones. “↻ Refresh” button and a reminder of the key in use (last 4 characters) to see right away what is loaded.'],
    },
  },
  {
    id: '2026-11-20c',
    date: '2026-11-20',
    title: { fr: 'iRemoTech refait pour être ultra simple', en: 'iRemoTech redesigned to be dead simple' },
    items: {
      fr: ['Chaque onglet se lit en étapes numérotées : 1 · Où ? (tes iPhones en cartes, avec leurs containers à cocher et « Détecter »), 2 · Quoi ?, puis Lancer (résumé de ce qui va se passer, options en clair, gros bouton).', 'Cocher un iPhone coche tous ses containers ; « Tous les iPhones en ligne » sélectionne tout d’un clic.', 'Pendant un lancement : une ligne par container avec son statut (en cours, réussi, échec, passé) et sa dernière étape ; le journal détaillé reste disponible.'],
      en: ['Every tab reads as numbered steps: 1 · Where? (your iPhones as cards, with their containers to tick and “Detect”), 2 · What?, then Launch (summary of what will happen, plain options, big button).', 'Ticking an iPhone ticks all its containers; “All online iPhones” selects everything in one click.', 'During a run: one line per container with its status (running, done, failed, skipped) and its last step; the detailed log is still there.'],
    },
  },
  {
    id: '2026-11-20b',
    date: '2026-11-20',
    title: { fr: 'iRemoTech : containers détectés automatiquement', en: 'iRemoTech: containers detected automatically' },
    items: {
      fr: ['Bouton « 🔍 Détecter » sur chaque iPhone : ScaleFlow ouvre le sélecteur Crane, lit tous les containers (Default, 1, 2, 3…) et met la liste à jour, sans rien taper.', 'Création de compte « Tout auto » (activé par défaut) : choisis tes iPhones et lance, ScaleFlow détecte les containers puis crée un compte dans chacun de ceux qui n’en ont pas encore.'],
      en: ['“🔍 Detect” button on each iPhone: ScaleFlow opens the Crane picker, reads every container (Default, 1, 2, 3…) and updates the list, nothing to type.', '“Fully automatic” account creation (on by default): pick your iPhones and launch, ScaleFlow detects the containers then creates an account in each one that doesn’t have one yet.'],
    },
  },
  {
    id: '2026-11-20',
    date: '2026-11-20',
    title: { fr: 'iRemoTech : création de comptes container par container, sans gaspiller de numéros', en: 'iRemoTech: account creation container by container, without wasting numbers' },
    items: {
      fr: ['Chaque iPhone enchaîne ses containers : un compte créé, puis le container suivant, jusqu’au dernier. Avec « Téléphones en parallèle », tous les iPhones avancent en même temps.', 'Un container déjà connecté est repéré AVANT l’achat du numéro et passé (avant, un numéro était acheté puis annulé en boucle).', 'Nombre d’essais maximum par container (3 par défaut) puis container suivant, au lieu de réessayer sans fin. Bouton « Cocher les containers sans compte » pour remplir d’un coup tous les containers vides. Bilan en fin de série.'],
      en: ['Each iPhone goes through its containers: one account created, then the next container, up to the last one. With “Phones in parallel”, all iPhones move forward at the same time.', 'A container that is already logged in is detected BEFORE buying a number and skipped (before, a number was bought then cancelled in a loop).', 'Max attempts per container (3 by default) then next container, instead of retrying forever. “Tick the containers without an account” button to fill every empty container at once. Summary at the end.'],
    },
  },
  {
    id: '2026-11-19',
    date: '2026-11-19',
    title: { fr: 'Genjutsu : tes propres presets de prompt', en: 'Genjutsu: your own prompt presets' },
    items: {
      fr: ['Écris ou modifie un prompt, puis « Enregistrer ce prompt comme preset » : il apparaît dans le menu Prompt (« Presets de l’équipe ») pour toute l’agence. Même nom = preset remplacé (avec confirmation) ; « Supprimer ce preset » pour l’enlever.'],
      en: ['Write or edit a prompt, then “Save this prompt as a preset”: it shows up in the Prompt menu (“Team presets”) for the whole agency. Same name = preset replaced (after confirmation); “Delete this preset” removes it.'],
    },
  },
  {
    id: '2026-11-18b',
    date: '2026-11-18',
    title: { fr: 'Spoof : l’original est toujours gardé', en: 'Spoof: the original is always kept' },
    items: {
      fr: ['Genjutsu : quand le spoof est activé, la vidéo d’origine est maintenant rangée dans la Banque en plus des versions spoofées (avant, seules les versions y allaient). Aucun outil de spoof ne supprime ni ne remplace l’original.'],
      en: ['Genjutsu: when spoofing is on, the original video is now saved to the Library on top of the spoofed versions (before, only the versions were saved). No spoof tool ever deletes or replaces the original.'],
    },
  },
  {
    id: '2026-11-18',
    date: '2026-11-18',
    title: { fr: 'Banque : spoofer une image en plusieurs copies', en: 'Library: spoof an image into several copies' },
    items: {
      fr: ['Dans la Banque, sélectionne une ou plusieurs images (ou vidéos) puis « Spoofer en copies » : choisis le nombre de copies (jusqu’à 20 par média), l’appareil (aléatoire par défaut, un différent par copie) et la position GPS. Chaque copie est unique et arrive dans le même dossier que l’original.'],
      en: ['In the Library, select one or more images (or videos) then “Spoof into copies”: choose how many copies (up to 20 per media), the device (random by default, a different one per copy) and the GPS location. Each copy is unique and lands in the same folder as the original.'],
    },
  },
  {
    id: '2026-11-15b',
    date: '2026-11-15',
    title: { fr: 'DuoPlus : publication de Reels et création de comptes', en: 'DuoPlus: Reels posting and account creation' },
    items: {
      fr: ['Publier des Reels sur tes téléphones DuoPlus : vidéos de la Banque (une par téléphone), légende avec accents et emojis, ville propre à chaque compte. Les téléphones éteints peuvent être allumés pour l’occasion puis éteints à la fin. Mode « Test sans publier » pour tout vérifier avant.', 'Créer des comptes Instagram (bêta) : numéro US acheté sur SMSPool, code SMS saisi tout seul, mot de passe, date de naissance et nom générés. Le numéro est annulé et remboursé si le SMS n’arrive pas.'],
      en: ['Post Reels on your DuoPlus phones: Library videos (one per phone), caption with accents and emojis, a city per account. Phones that are off can be turned on for the run and turned off at the end. “Test without posting” mode to check everything first.', 'Create Instagram accounts (beta): US number bought on SMSPool, SMS code entered automatically, generated password, birthday and name. The number is cancelled and refunded if the SMS does not arrive.'],
    },
  },
  {
    id: '2026-11-15',
    date: '2026-11-15',
    title: { fr: 'DuoPlus dans l’espace Blowsome', en: 'DuoPlus in the Blowsome workspace' },
    items: {
      fr: ['Nouvel onglet DuoPlus (Blowsome › Parc) : relie ton compte DuoPlus avec sa clé API (gardée sur le serveur, jamais dans le navigateur), vois tous tes téléphones virtuels et leur état, allume-les ou éteins-les, un par un ou en groupe. Les admins peuvent envoyer une commande ADB de test.'],
      en: ['New DuoPlus tab (Blowsome › Farm): link your DuoPlus account with its API key (kept on the server, never in the browser), see all your virtual phones and their state, turn them on or off one by one or in bulk. Admins can send a test ADB command.'],
    },
  },
  {
    id: '2026-11-14b',
    date: '2026-11-14',
    title: { fr: 'WAN 3.0 : nouveau prompt par défaut', en: 'WAN 3.0: new default prompt' },
    items: {
      fr: ['Le prompt automatique de WAN 3.0 (une modèle) est celui de l’équipe : remplacement complet du personnage, fidélité stricte à la vidéo (gestes, angles, tenue et niveau de couverture), textes de la vidéo gardés, seuls les filigranes et logos retirés. « Garder les textes écrits de la vidéo » est maintenant coché par défaut.'],
      en: ['The automatic WAN 3.0 prompt (one model) is now the team’s: full character replacement, strict fidelity to the video (gestures, angles, outfit and level of coverage), on-screen texts kept, only watermarks and logos removed. “Keep the on-screen texts” is now ticked by default.'],
    },
  },
  {
    id: '2026-11-14',
    date: '2026-11-14',
    title: { fr: 'Genjutsu : même rangement des modèles pour toute l’agence', en: 'Genjutsu: same model layout for the whole agency' },
    items: {
      fr: ['Les mini-dossiers de modèles (« Kenza · 5 »…) et les modèles masquées sont maintenant partagés dans l’espace : tous les membres de l’agence voient le même rangement, mis à jour toutes les minutes. Le rangement déjà fait sur un ordinateur est envoyé à l’espace à la première ouverture.', 'Les liens Instagram collés sans « https:// » (instagram.com/reel/…, www.instagram.com/…, instagr.am/…) sont acceptés.'],
      en: ['Model folders (“Kenza · 5”…) and hidden models are now shared in the workspace: every member of the agency sees the same layout, refreshed every minute. A layout already made on a computer is sent to the workspace the first time it opens.', 'Instagram links pasted without “https://” (instagram.com/reel/…, www.instagram.com/…, instagr.am/…) are accepted.'],
    },
  },
  {
    id: '2026-11-12b',
    date: '2026-11-12',
    title: { fr: 'Téléchargements réparés et au format iPhone', en: 'Downloads fixed, in iPhone format' },
    items: {
      fr: ['Les médias téléchargés depuis la Banque (un par un, dans un dossier ou en ZIP) sont nommés comme sur un iPhone : IMG_4821.MOV, IMG_4822.JPG… avec des numéros qui se suivent.', 'Gros téléchargements réparés (dossier et ZIP) : un fichier dont la connexion se bloque est relancé tout seul au lieu de geler tout le lot, et un refus passager du stockage est réessayé (jusqu’à 4 fois). Sur Brave, Firefox ou Safari, plus de 10 fichiers partent automatiquement en ZIP.'],
      en: ['Media downloaded from the Library (one by one, to a folder or as a ZIP) are named like on an iPhone: IMG_4821.MOV, IMG_4822.JPG… with consecutive numbers.', 'Large downloads fixed (folder and ZIP): a file whose connection stalls is restarted on its own instead of freezing the whole batch, and a temporary storage refusal is retried (up to 4 times). On Brave, Firefox or Safari, more than 10 files go into a ZIP automatically.'],
    },
  },
  {
    id: '2026-11-12',
    date: '2026-11-12',
    title: { fr: 'WAN 3.0 : vidéos de plus de 15 s coupées automatiquement', en: 'WAN 3.0: videos over 15s trimmed automatically' },
    items: {
      fr: ['Une vidéo de référence de plus de 15 s n’est plus refusée : ScaleFlow garde ses 15 premières secondes et lance la génération. La carte du résultat indique « Coupée à 15 s ».'],
      en: ['A reference video longer than 15s is no longer rejected: ScaleFlow keeps its first 15 seconds and starts the generation. The result card shows “Trimmed to 15s”.'],
    },
  },
  {
    id: '2026-11-10b',
    date: '2026-11-10',
    title: { fr: 'Reels Facebook sur tes Pages, sans téléphone', en: 'Facebook Reels on your Pages, no phone needed' },
    items: {
      fr: [
        'Publication › Reels Facebook : connecte tes Pages Facebook, choisis des vidéos de la Banque et publie sur toutes les Pages en même temps, par l’API officielle de Meta.',
        'Une vidéo différente par Page ou toutes les vidéos sur chaque Page ; commentaire automatique posté sous chaque Reel ; suivi en direct et crédits remboursés en cas d’échec.',
      ],
      en: [
        'Publishing › Facebook Reels: connect your Facebook Pages, pick videos from the Library and publish to every Page at once through Meta’s official API.',
        'A different video per Page or every video on each Page; an automatic comment posted under each Reel; live tracking and credits refunded on failure.',
      ],
    },
  },
  {
    id: '2026-11-10',
    date: '2026-11-10',
    title: { fr: 'Interface plus nette', en: 'A cleaner interface' },
    items: {
      fr: [
        'Le bandeau de mise à jour tient sur une seule ligne (au lieu d’un bloc en haut de chaque page).',
        'Auto-contenu, Genjutsu et iRemoTech ont les mêmes grands titres que le reste de l’app ; petits textes gris plus lisibles ; chargements animés.',
      ],
      en: [
        'The update bar now fits on a single line (instead of a block at the top of every page).',
        'Auto-content, Genjutsu and iRemoTech use the same large titles as the rest of the app; small grey text is easier to read; animated loading states.',
      ],
    },
  },
  {
    id: '2026-11-09',
    date: '2026-11-09',
    title: { fr: '🎵 Banque unique avec les sons, favoris, et son remplacé dans Auto-contenu', en: '🎵 One library with sounds, favorites, and sound replacement in Auto-content' },
    items: {
      fr: [
        'Banque : une seule liste « Médias » (vidéos, images et sons ensemble) avec un filtre Tout / Vidéos / Images / Sons et un badge de type sur chaque vignette. Tu peux maintenant importer des sons (mp3, m4a, wav…).',
        'Favoris ★ : étoile sur chaque média (Banque et sélecteurs) et dossier « Favoris » ; clic droit sur un dossier → « Épingler en favori » : il apparaît en premier partout. Partagé avec toute l’équipe.',
        'Sélecteur de la Banque plus simple : seulement les sous-dossiers du dossier ouvert, un fil « Banque › US › Kenza », et le dernier dossier ouvert est retenu.',
        'Auto-contenu : nouvelle option « Remplacer le son » — le son d’origine est coupé et remplacé par un son de ta banque (sons choisis ou dossier de sons, aléatoire ou dans l’ordre, volume réglable), un son différent par variante.',
        'Sécurité posting : un sélecteur de vidéos ne propose plus jamais d’images ni de sons (avant, une banque sans vidéo affichait tout).',
      ],
      en: [
        'Library: a single “Media” list (videos, images and sounds together) with an All / Videos / Images / Sounds filter and a type badge on each tile. You can now import sounds (mp3, m4a, wav…).',
        'Favorites ★: a star on every media (Library and pickers) and a “Favorites” folder; right-click a folder → “Pin as favorite”: it shows first everywhere. Shared with the whole team.',
        'Simpler Library picker: only the subfolders of the open folder, a “Library › US › Kenza” trail, and the last opened folder is remembered.',
        'Auto-content: new “Replace the sound” option — the original sound is muted and replaced by a sound from your library (chosen sounds or a sounds folder, random or in order, adjustable volume), a different sound per variant.',
        'Posting safety: a video picker never offers images or sounds anymore (before, a library with no videos showed everything).',
      ],
    },
  },
  {
    id: '2026-11-08',
    date: '2026-11-08',
    title: { fr: '✨ Genjutsu : moteur WAN 3.0, mode duo et crédits affichés', en: '✨ Genjutsu: WAN 3.0 engine, duo mode and credits shown' },
    items: {
      fr: [
        'Nouveau moteur WAN 3.0 (≈ 35 % moins cher) à côté de Genjutsu : photo de la modèle + vidéo de référence de 15 s max, rendu de la même durée, 9:16.',
        'Mode duo : 2 filles à l’écran — modèle 1 à gauche, modèle 2 à droite.',
        'Crédits : coût estimé sur le bouton Lancer, et crédits réellement utilisés affichés sur chaque vidéo.',
        'WAN 3.0 est maintenant le moteur par défaut, et le spoof est réglé par défaut sur 🇩🇪 Allemagne (aléatoire : un point au hasard n’importe où dans le pays) — nouvelle localisation aussi disponible dans le Studio et Auto-contenu.',
      ],
      en: [
        'New WAN 3.0 engine (≈ 35% cheaper) next to Genjutsu: model photo + reference video up to 15s, same-length render, 9:16.',
        'Duo mode: 2 girls on screen — model 1 on the left, model 2 on the right.',
        'Credits: estimated cost on the Launch button, and the credits actually used shown on each video.',
        'WAN 3.0 is now the default engine, and spoofing defaults to 🇩🇪 Germany (random: a random point anywhere in the country) — the new location is also available in the Studio and Auto-content.',
      ],
    },
  },
  {
    id: '2026-11-07',
    date: '2026-11-07',
    title: { fr: '🎙 Auto-contenu : le pool de légendes choisi selon la voix', en: '🎙 Auto-content: caption pool picked from the voice' },
    items: {
      fr: ['Nouvelle option « Pool selon la voix » : ScaleFlow détecte si c’est un homme ou une femme qui parle en premier dans chaque vidéo (avec la clé Groq, seules les vraies paroles comptent, la musique est ignorée ; si la voix n’est pas nette, c’est la personne qu’on voit le plus à l’écran qui décide) et prend le pool de légendes qui va avec — chaque vidéo a toujours une légende. Chaque vidéo peut aussi être mise à la main en version Homme ou Femme (ou « Tout » d’un coup) : le choix passe avant la détection et reste gardé.'],
      en: ['New “Pool by voice” option: ScaleFlow detects whether a man or a woman speaks first in each video (with the Groq key, only real speech counts, music is ignored; if the voice is unclear, the person seen most on screen decides) and uses the matching caption pool — every video always gets a caption. Each video can also be set by hand to the Male or Female version (or “All” at once): the choice overrides detection and is remembered.'],
    },
  },
  {
    id: '2026-11-04',
    date: '2026-11-04',
    title: { fr: '📸 Photos HEIC converties en JPG automatiquement', en: '📸 HEIC photos converted to JPG automatically' },
    items: {
      fr: ['Les photos iPhone (.heic / .heif) importées dans la Banque, le Studio ou un sélecteur sont converties en JPG toutes seules — plus besoin de passer par un site de conversion.'],
      en: ['iPhone photos (.heic / .heif) imported into the Bank, the Studio or a picker are converted to JPG automatically — no conversion website needed.'],
    },
  },
  {
    id: '2026-11-01',
    date: '2026-11-01',
    title: { fr: '✂️ Spoof : micro-coupe début/fin · variantes par vidéo', en: '✂️ Spoof: start/end micro-trim · variants per video' },
    items: {
      fr: [
        'Le spoof coupe maintenant au hasard 0,1 à 0,8 s au début ET à la fin de chaque version (Studio, Genjutsu et API) : chaque copie a sa propre durée.',
        'Studio (spoof, remix, photos) : un compteur « − ×3 + » sous chaque vidéo pour choisir son nombre de variantes ; sinon le réglage commun s’applique.',
      ],
      en: [
        'Spoof now randomly trims 0.1 to 0.8 s at the start AND end of each version (Studio, Genjutsu and API): every copy has its own length.',
        'Studio (spoof, remix, photos): a “− ×3 +” counter under each video to set its own number of variants; otherwise the common setting applies.',
      ],
    },
  },
  {
    id: '2026-10-30d',
    date: '2026-10-30',
    title: { fr: '🔐 Higgsfield sur ce PC (appli PC)', en: '🔐 Higgsfield on this PC (desktop app)' },
    items: {
      fr: [
        'Genjutsu › « Sur ce PC » : connecte chaque compte Higgsfield une fois dans la vraie page Higgsfield (email, mot de passe, code 2FA) ; la session reste sur ton PC, ScaleFlow ne voit aucun identifiant.',
        '« Calibrer » : enregistre les appels du site pendant une génération faite à la main (sans jetons) pour brancher la génération en local.',
      ],
      en: [
        'Genjutsu › “On this PC”: sign in each Higgsfield account once on the real Higgsfield page (email, password, 2FA code); the session stays on your PC, ScaleFlow never sees any credentials.',
        '“Calibrate”: records the site’s calls during a generation made by hand (no tokens) to wire local generation.',
      ],
    },
  },
  {
    id: '2026-10-30c',
    date: '2026-10-30',
    title: { fr: '📁 Sous-dossiers dans la Banque · Genjutsu : un dossier par modèle', en: '📁 Subfolders in the Bank · Genjutsu: one folder per model' },
    items: {
      fr: [
        'Banque : des dossiers dans les dossiers. Clic droit sur un dossier → « Nouveau sous-dossier » (ou « Nouveau dossier » → Dans…), flèche pour replier, et ouvrir un dossier montre aussi ses sous-dossiers. Renommer ou supprimer suit les sous-dossiers.',
        'Genjutsu : chaque modèle a son dossier de la Banque (par défaut « Genjutsu › Prénom », modifiable) — ses vidéos, spoofées ou telles quelles, y vont directement.',
        'Genjutsu : vérification de l’accès Blowsome au démarrage, et les comptes Higgsfield s’ajoutent, se choisissent et se reconnectent directement dans l’onglet.',
      ],
      en: [
        'Bank: folders inside folders. Right-click a folder → “New subfolder” (or “New folder” → In…), arrow to collapse, and opening a folder also shows its subfolders. Rename or delete follows the subfolders.',
        'Genjutsu: each model has its own Bank folder (default “Genjutsu › Name”, editable) — her videos, spoofed or as is, go straight into it.',
        'Genjutsu: Blowsome access check at startup, and Higgsfield accounts are added, picked and reconnected right in the tab.',
      ],
    },
  },
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
