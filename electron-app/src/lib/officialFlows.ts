// Flows d'automatisation OFFICIELS (maintenus par ScaleFlow), exprimés en donnée
// et exécutés par `runFlow`. Les flows utilisateurs (workshop) auront le même
// format et seront stockés en base — ce même interpréteur les jouera.
import type { Flow } from './flowRunner'

export const OFFICIAL_FLOWS: Flow[] = [
  {
    id: 'ig-post-reel',
    name: 'Poster un Reel — Instagram',
    official: true,
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
]

export function findFlow(id: string): Flow | undefined {
  return OFFICIAL_FLOWS.find(f => f.id === id)
}
