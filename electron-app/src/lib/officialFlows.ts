// Flows d'automatisation OFFICIELS (maintenus par ScaleFlow), exprimés en donnée
// et exécutés par `runFlow`. Les flows utilisateurs (workshop) auront le même
// format et seront stockés en base — ce même interpréteur les jouera.
import type { Flow } from './flowRunner'

export const OFFICIAL_FLOWS: Flow[] = [
  {
    id: 'ig-post-carousel',
    name: 'Publier une galerie — Instagram',
    official: true,
    category: '📤 Publication',
    app: 'com.instagram.android',
    description: 'Publie plusieurs photos en galerie/carrousel, avec légende. (Version cœur : sans tags IA ni audio.)',
    inputs: [
      { key: 'caption', label: 'Légende', placeholder: 'Légende (emoji ok)', optional: true },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 3000 }, { do: 'popups' },
      { do: 'action', name: 'post_carousel', params: { caption: '{{caption}}', count: '{{count}}' } },
    ],
  },

  {
    id: 'ig-login',
    name: 'Connexion automatique — Instagram',
    official: true,
    category: '👤 Profil',
    app: 'com.instagram.android',
    description: 'Connecte chaque téléphone à son compte (identifiant + mot de passe). Sans 2FA.',
    perAccount: true,
    inputs: [
      { key: 'account',  label: 'Identifiant / e-mail', placeholder: 'pseudo ou email', optional: false },
      { key: 'password', label: 'Mot de passe',         placeholder: 'mot de passe',    type: 'password', optional: false },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 4000 }, { do: 'popups' },
      { do: 'action', name: 'login', params: { account: '{{account}}', password: '{{password}}' } },
    ],
  },

  {
    id: 'ig-login-2fa',
    name: 'Connexion automatique + 2FA — Instagram',
    official: true,
    category: '👤 Profil',
    app: 'com.instagram.android',
    description: 'Connecte chaque téléphone à son compte AVEC 2FA (app d’authentification). Le code est généré en local depuis le secret 2FA (base32) — aucun service tiers. Les défis e-mail / captcha ne sont pas franchissables.',
    perAccount: true,
    inputs: [
      { key: 'account',  label: 'Identifiant / e-mail', placeholder: 'pseudo ou email',              optional: false },
      { key: 'password', label: 'Mot de passe',         placeholder: 'mot de passe',                 type: 'password', optional: false },
      { key: 'totpKey',  label: 'Clé 2FA (base32)',     placeholder: 'ex : RJK3CWRDDVSOMGWSXHZ6…',   type: 'password', optional: false },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 4000 }, { do: 'popups' },
      { do: 'action', name: 'login_2fa', params: { account: '{{account}}', password: '{{password}}', totpKey: '{{totpKey}}' } },
    ],
  },

  {
    id: 'ig-bulk-follow',
    name: 'Abonnement en masse — Instagram',
    official: true,
    category: '🔥 Warmup & engagement',
    app: 'com.instagram.android',
    description: 'S’abonne à une liste de comptes (un pseudo par ligne). Ne re-clique jamais un compte déjà suivi.',
    inputs: [
      { key: 'usernames', label: 'Comptes à suivre', placeholder: 'un pseudo par ligne (sans @)', type: 'textarea', optional: false },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 3000 }, { do: 'popups' },
      { do: 'action', name: 'bulk_follow', params: { usernames: '{{usernames}}' } },
    ],
  },

  {
    id: 'ig-send-dm',
    name: 'Message privé en masse — Instagram',
    official: true,
    category: '📈 Croissance',
    app: 'com.instagram.android',
    description: 'Envoie le même message privé (DM) à une liste de comptes (un pseudo par ligne). Ignore les profils sans bouton « Message ».',
    inputs: [
      { key: 'usernames', label: 'Comptes à contacter', placeholder: 'un pseudo par ligne (sans @)', type: 'textarea', optional: false },
      { key: 'content',   label: 'Message',             placeholder: 'Le message à envoyer',          type: 'textarea', optional: false },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 3000 }, { do: 'popups' },
      { do: 'action', name: 'send_dm', params: { usernames: '{{usernames}}', content: '{{content}}' } },
    ],
  },

  {
    id: 'ig-insights',
    name: 'Lire les statistiques — Instagram',
    official: true,
    category: '📈 Croissance',
    app: 'com.instagram.android',
    description: 'Ouvre le tableau de bord Insights et lit les chiffres clés (vues, interactions, nouveaux abonnés) dans le journal. Lecture seule. Nécessite un compte pro/créateur.',
    inputs: [],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 2000 }, { do: 'popups' },
      { do: 'action', name: 'read_insights' },
    ],
  },

  {
    id: 'ig-set-privacy',
    name: 'Confidentialité du compte — Instagram',
    official: true,
    category: '👤 Profil',
    app: 'com.instagram.android',
    description: 'Bascule le compte en public ou en privé (ne change rien s’il est déjà dans l’état voulu).',
    inputs: [
      { key: 'public', label: 'Compte public (sinon privé)', type: 'boolean', optional: true },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 3000 }, { do: 'popups' },
      { do: 'action', name: 'set_privacy', params: { public: '{{public}}' } },
    ],
  },

  {
    id: 'ig-warmup',
    name: 'Warmup de compte — Instagram',
    official: true,
    category: '🔥 Warmup & engagement',
    app: 'com.instagram.android',
    description: 'Regarde des Reels avec un engagement humain aléatoire (like / follow) pour chauffer le compte. Mots-clés optionnels pour cibler des thématiques.',
    inputs: [
      { key: 'count',    label: 'Nombre de vidéos à regarder', placeholder: 'ex : 15',                          optional: false },
      { key: 'keywords', label: 'Mots-clés (optionnel)',       placeholder: 'un par ligne (ex : fitness, mode)', optional: true },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 3000 }, { do: 'popups' },
      { do: 'action', name: 'warmup_reels', params: { count: '{{count}}', keywords: '{{keywords}}' } },
    ],
  },

  {
    id: 'ig-edit-profile',
    name: 'Modifier le profil — Instagram',
    official: true,
    category: '👤 Profil',
    app: 'com.instagram.android',
    description: 'Modifie le nom, le pseudo, la bio et le lien du profil (les champs laissés vides ne sont pas touchés).',
    inputs: [
      { key: 'nickname',  label: 'Nom',           placeholder: 'Nom affiché',              optional: true },
      { key: 'username',  label: 'Pseudo',        placeholder: '@pseudo (sans @)',         optional: true },
      { key: 'biography', label: 'Bio',           placeholder: 'Bio du profil',            optional: true },
      { key: 'linkUrl',   label: 'Lien (URL)',    placeholder: 'https://…',                optional: true },
      { key: 'linkTitle', label: 'Titre du lien', placeholder: 'Titre affiché (optionnel)',optional: true },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 3000 }, { do: 'popups' },
      { do: 'action', name: 'edit_profile', params: { nickname: '{{nickname}}', username: '{{username}}', biography: '{{biography}}', linkUrl: '{{linkUrl}}', linkTitle: '{{linkTitle}}' } },
    ],
  },

  {
    id: 'ig-post-reel',
    name: 'Poster un Reel — Instagram',
    official: true,
    category: '📤 Publication',
    app: 'com.instagram.android',
    description: 'Poste la 1ʳᵉ vidéo de la galerie en Reel, avec légende optionnelle.',
    inputs: [{ key: 'caption', label: 'Légende', placeholder: 'Légende (emoji ok)', optional: true }],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 1000 }, { do: 'popups' },
      { do: 'tap', label: 'Ouvrir « Créer »', any: [{ id: 'creation_tab' }, { desc: 'Créer' }, { desc: 'Create' }, { contains: 'Nouvelle publication' }] },
      { do: 'wait', ms: 1500 }, { do: 'popups' },
      { do: 'tap', label: 'Choisir « Reel »', required: false, any: [{ text: 'REEL' }, { contains: 'Reel' }] },
      { do: 'wait', ms: 1500 }, { do: 'popups' },
      { do: 'pickFirstMedia' },
      { do: 'wait', ms: 1500 }, { do: 'popups' },
      { do: 'tap', label: 'Suivant', any: [{ id: 'creation_next_button' }, { id: 'next_button_textview' }, { text: 'Suivant' }, { text: 'Next' }] },
      { do: 'wait', ms: 2200 }, { do: 'popups' },
      { do: 'tap', label: 'Suivant (2)', required: false, any: [{ id: 'creation_next_button' }, { text: 'Suivant' }, { text: 'Next' }] },
      { do: 'wait', ms: 2200 }, { do: 'popups' },
      { do: 'tap', label: 'Champ légende', required: false, any: [{ id: 'caption_input_text_view' }, { contains: 'Ajouter une légende' }, { contains: 'légende' }, { contains: 'caption' }] },
      { do: 'wait', ms: 800 },
      { do: 'type', var: 'caption' },
      { do: 'key', key: 'back' },
      { do: 'wait', ms: 800 },
      { do: 'tap', label: 'Partager', any: [{ id: 'share_footer_button' }, { id: 'share_button' }, { text: 'Partager' }, { text: 'Share' }] },
    ],
  },

  {
    id: 'yt-post-short',
    name: 'Publier un Short — YouTube',
    official: true,
    category: '📤 Publication',
    app: 'com.google.android.youtube',
    description: 'Publie la 1ʳᵉ vidéo de la galerie en YouTube Short, avec légende optionnelle. La vidéo doit déjà être sur le téléphone.',
    inputs: [{ key: 'title', label: 'Légende / titre', placeholder: 'Titre du Short', type: 'textarea', optional: true }],
    steps: [
      { do: 'open', pkg: 'com.google.android.youtube' },
      { do: 'wait', ms: 4000 }, { do: 'popups' },
      { do: 'action', name: 'youtube_short', params: { title: '{{title}}' } },
    ],
  },

  {
    id: 'ig-warmup-browse',
    name: 'Warmup — navigation (Instagram)',
    official: true,
    category: '🔥 Warmup & engagement',
    app: 'com.instagram.android',
    description: 'Simule une navigation humaine (scroll feed + explorer) pour « chauffer » le compte et l’IP. Sans risque : aucun like/follow, que du défilement.',
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 2000 }, { do: 'popups' },
      { do: 'swipe', x1: 540, y1: 1500, x2: 540, y2: 500, ms: 400 }, { do: 'wait', ms: 2600 },
      { do: 'swipe', x1: 540, y1: 1500, x2: 540, y2: 500, ms: 400 }, { do: 'wait', ms: 3200 },
      { do: 'swipe', x1: 540, y1: 1500, x2: 540, y2: 500, ms: 400 }, { do: 'wait', ms: 2400 },
      { do: 'swipe', x1: 540, y1: 1500, x2: 540, y2: 500, ms: 400 }, { do: 'wait', ms: 2800 },
      { do: 'link', url: 'instagram://explore' }, { do: 'wait', ms: 2500 }, { do: 'popups' },
      { do: 'swipe', x1: 540, y1: 1500, x2: 540, y2: 600, ms: 400 }, { do: 'wait', ms: 2600 },
      { do: 'swipe', x1: 540, y1: 1500, x2: 540, y2: 600, ms: 400 }, { do: 'wait', ms: 2600 },
      { do: 'link', url: 'instagram://feed' }, { do: 'wait', ms: 1500 },
    ],
  },

  {
    id: 'ig-follow-profile',
    name: 'Suivre un profil (Instagram)',
    official: true,
    category: '📈 Croissance',
    app: 'com.instagram.android',
    description: 'Ouvre un profil (par deep link) et clique « Suivre ».',
    inputs: [{ key: 'username', label: 'Compte à suivre', placeholder: 'ex : nike (sans @)' }],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 1500 }, { do: 'popups' },
      { do: 'link', url: 'instagram://user?username={{username}}' },
      { do: 'wait', ms: 3000 }, { do: 'popups' },
      { do: 'tap', label: 'Suivre', any: [{ text: 'Suivre' }, { text: 'Follow' }, { id: 'follow_button' }, { id: 'button_text' }] },
    ],
  },

  // ── Engagement (moteur GramAddict : resource-ids IG maintenus) ─────────────
  {
    id: 'ig-warmup-plus',
    name: 'Warmup + likes & stories (Instagram)',
    official: true,
    category: '🔥 Warmup & engagement',
    app: 'com.instagram.android',
    description: 'Regarde quelques stories, scroll le feed et like des posts. Rythme humain (pauses aléatoires).',
    inputs: [{ key: 'likes', label: 'Nombre de likes', placeholder: 'ex : 5', optional: true }],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 2000 }, { do: 'popups' },
      { do: 'action', name: 'watch_stories', params: { count: 3 } },
      { do: 'wait', ms: 1500 },
      { do: 'action', name: 'like_feed', params: { count: '{{likes}}' } },
    ],
  },
  {
    id: 'ig-watch-reels',
    name: 'Regarder des reels (Instagram)',
    official: true,
    category: '🔥 Warmup & engagement',
    app: 'com.instagram.android',
    description: 'Ouvre l’onglet Reels et en regarde plusieurs (swipe), avec like optionnel. Warmup naturel.',
    inputs: [
      { key: 'count', label: 'Nombre de reels', placeholder: 'ex : 8', optional: true },
      { key: 'like', label: 'Liker certains reels ? (oui/non)', placeholder: 'non', optional: true },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 2000 }, { do: 'popups' },
      { do: 'action', name: 'watch_reels', params: { count: '{{count}}', like: '{{like}}' } },
    ],
  },
  {
    id: 'ig-watch-stories',
    name: 'Regarder des stories (Instagram)',
    official: true,
    category: '🔥 Warmup & engagement',
    app: 'com.instagram.android',
    description: 'Ouvre et regarde des stories du feed (warmup doux).',
    inputs: [{ key: 'count', label: 'Nombre de stories', placeholder: 'ex : 5', optional: true }],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 2000 }, { do: 'popups' },
      { do: 'action', name: 'watch_stories', params: { count: '{{count}}' } },
    ],
  },
  {
    id: 'ig-follow-followers',
    name: 'Suivre les abonnés d’un compte (Instagram)',
    official: true,
    category: '📈 Croissance',
    app: 'com.instagram.android',
    description: 'Ouvre un compte cible et suit ses abonnés (lead gen / croissance). Rythme humain.',
    inputs: [
      { key: 'target', label: 'Compte cible', placeholder: 'ex : nike (sans @)' },
      { key: 'count', label: 'Combien en suivre', placeholder: 'ex : 10', optional: true },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 1500 }, { do: 'popups' },
      { do: 'action', name: 'follow_followers', params: { target: '{{target}}', count: '{{count}}' } },
    ],
  },
]

// Catégories officielles dans l'ordre d'apparition (pour regrouper l'UI).
export function officialCategories(): string[] {
  const seen: string[] = []
  for (const f of OFFICIAL_FLOWS) { const c = f.category ?? '📦 Autres'; if (!seen.includes(c)) seen.push(c) }
  return seen
}

export function findFlow(id: string): Flow | undefined {
  return OFFICIAL_FLOWS.find(f => f.id === id)
}
