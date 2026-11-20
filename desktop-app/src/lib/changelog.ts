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
