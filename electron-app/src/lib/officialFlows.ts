// Flows d'automatisation OFFICIELS (maintenus par ScaleFlow), exprimés en donnée
// et exécutés par `runFlow`. Les flows utilisateurs (workshop) auront le même
// format et seront stockés en base — ce même interpréteur les jouera.
import type { Flow } from './flowRunner'

export const OFFICIAL_FLOWS: Flow[] = [
  {
    id: 'ig-login',
    name: 'Connexion à un compte — Instagram',
    official: true,
    category: '🔐 Compte',
    app: 'com.instagram.android',
    description: 'Ouvre Instagram et saisit identifiant + mot de passe. (2FA/checkpoint non gérés — à venir avec email/SMS.) Nécessite ADBKeyBoard.',
    inputs: [
      { key: 'username', label: 'Identifiant (@pseudo ou email)', placeholder: 'ex : mon.compte' },
      { key: 'password', label: 'Mot de passe', placeholder: '••••••••' },
    ],
    steps: [
      { do: 'open', pkg: 'com.instagram.android' },
      { do: 'wait', ms: 1800 }, { do: 'popups' },
      // écran d'accueil : aller sur l'écran de connexion
      { do: 'tap', label: 'Écran de connexion', required: false, any: [{ contains: 'J’ai déjà un compte' }, { contains: 'I already have' }, { contains: 'Se connecter' }, { contains: 'Log in' }, { contains: 'Connexion' }] },
      { do: 'wait', ms: 1800 }, { do: 'popups' },
      { do: 'tap', label: 'Champ identifiant', any: [{ id: 'login_username' }, { contains: 'Nom d’utilisateur' }, { contains: 'e-mail' }, { contains: 'Username' }, { contains: 'phone' }] },
      { do: 'type', var: 'username' },
      { do: 'tap', label: 'Champ mot de passe', any: [{ id: 'password' }, { contains: 'Mot de passe' }, { contains: 'Password' }] },
      { do: 'type', var: 'password' },
      { do: 'key', key: 'back' },   // ferme le clavier
      { do: 'wait', ms: 600 },
      { do: 'tap', label: 'Bouton Se connecter', any: [{ id: 'button_text' }, { text: 'Se connecter' }, { text: 'Log in' }, { text: 'Connexion' }] },
      { do: 'wait', ms: 3000 }, { do: 'popups' },
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
