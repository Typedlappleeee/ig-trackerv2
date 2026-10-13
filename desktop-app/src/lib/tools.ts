// Catalogue UNIQUE des outils de ScaleFlow : alimente Explorer, la palette ⌘K et la
// section « Lancer » de l'accueil. Chaque outil ouvre une page (et éventuellement un
// onglet / format précis via openTool → takeOpenArg).
import type { PageKey } from '@/Shell'
import type { InfraKey } from '@/lib/theme'
import { isReleased, type ReleaseKey } from '@/lib/releases'

export type ToolCat = 'publish' | 'create' | 'accounts' | 'analyze' | 'bank'
export type ToolBadge = 'Nouveau' | 'Populaire' | 'Bêta'
export interface Tool {
  id: string; label: string; desc: string; cat: ToolCat
  page: PageKey; arg?: Record<string, unknown>
  icon: string; a: string; b: string
  badge?: ToolBadge; cost?: string
  gate?: 'admin' | `release:${ReleaseKey}`
  infra?: InfraKey[]
}

export const CATS: { k: ToolCat; label: string }[] = [
  { k: 'publish', label: 'Publier' },
  { k: 'create', label: 'Créer' },
  { k: 'accounts', label: 'Comptes' },
  { k: 'analyze', label: 'Analyser' },
  { k: 'bank', label: 'Banque' },
]

const I = {
  send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
  link: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1',
  photo: 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21',
  tiktok: 'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2',
  cal: 'M3 4h18v18H3z|M16 2v4|M8 2v4|M3 10h18',
  layers: 'M12 2l10 5-10 5L2 7l10-5z|M2 17l10 5 10-5|M2 12l10 5 10-5',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M20 4L8.12 15.88|M14.47 14.48L20 20|M8.12 8.12L12 12',
  type: 'M4 7V4h16v3|M9 20h6|M12 4v16',
  shuffle: 'M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6|M4 4l5 5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  image: 'M3 3h18v18H3z|M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z|M21 15l-5-5L5 21',
  cc: 'M3 5h18v14H3z|M7 12h4|M13 12h4|M7 15h10',
  wand: 'M15 4V2|M15 16v-2|M8 9h2|M20 9h2|M17.8 11.8L19 13|M15 9h.01|M17.8 6.2L19 5|M3 21l9-9|M12.2 6.2L11 5',
  sparkle: 'M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z',
  pen: 'M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  at: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8',
  key: 'M15 7a2 2 0 0 1 2 2m4-2a6 6 0 0 1-7.7 5.7L10 16H8v2H6v2H2v-4l6.3-6.3A6 6 0 1 1 21 7z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  flame: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z',
  flow: 'M5 3h4v4H5z|M15 17h4v4h-4z|M7 7v4a2 2 0 0 0 2 2h6a2 2 0 0 1 2 2v2',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01',
  pulse: 'M2 12h4l3-9 6 18 3-9h4',
  chart: 'M3 3v18h18|M7 15l4-6 4 3 5-8',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  video: 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  quote: 'M3 21c3 0 7-1 7-8V5H3v7h4c0 4-2 6-4 6|M14 21c3 0 7-1 7-8V5h-7v7h4c0 4-2 6-4 6',
}

const GL: InfraKey[] = ['geelark']
export const TOOLS: Tool[] = [
  // ── Publier
  { id: 'reels', label: 'Reels Instagram', desc: 'Une vidéo sur des dizaines de comptes, en parallèle.', cat: 'publish', page: 'publish', arg: { mode: 'reels' }, icon: I.send, a: '#F58529', b: '#8134AF', badge: 'Populaire', cost: '2 cr / compte', infra: GL },
  { id: 'story', label: 'Story avec lien', desc: 'Une image et un sticker lien propre à chaque compte.', cat: 'publish', page: 'publish', arg: { mode: 'story' }, icon: I.link, a: '#EC4899', b: '#7C3AED', cost: '1 cr / compte', infra: GL },
  { id: 'tiktok', label: 'Vidéo TikTok', desc: 'Publie sur tous tes comptes TikTok d’un coup.', cat: 'publish', page: 'publish', arg: { mode: 'tiktok' }, icon: I.tiktok, a: '#25F4EE', b: '#FE2C55', badge: 'Nouveau', cost: '2 cr / compte', infra: GL },
  { id: 'photo', label: 'Post photo', desc: 'Photo ou carrousel + légende dans le feed.', cat: 'publish', page: 'publish', arg: { mode: 'photo' }, icon: I.photo, a: '#F97316', b: '#DB2777', cost: '2 cr / compte', gate: 'admin', infra: GL },
  { id: 'cross', label: 'Cross-posting', desc: 'Facebook, Shorts, X, Threads, Reddit, Pinterest.', cat: 'publish', page: 'publish', arg: { mode: 'cross' }, icon: I.globe, a: '#38BDF8', b: '#1E3A8A', cost: '2 cr / réseau', gate: 'admin', infra: GL },
  { id: 'scheduled', label: 'Posts programmés', desc: 'Tout ce qui part plus tard, annulable et remboursé.', cat: 'publish', page: 'scheduled', arg: { view: 'list' }, icon: I.clock, a: '#60A5FA', b: '#312E81', infra: GL },
  { id: 'calendar', label: 'Calendrier', desc: 'Semaine / mois, glisse un post pour le décaler.', cat: 'publish', page: 'scheduled', arg: { view: 'calendar' }, icon: I.cal, a: '#34D399', b: '#065F46', infra: GL },
  // ── Créer
  { id: 'remix', label: 'Remix', desc: 'Une vidéo → jusqu’à 24 variantes uniques.', cat: 'create', page: 'studio', arg: { tool: 'remix' }, icon: I.shuffle, a: '#FB923C', b: '#9F1239', badge: 'Populaire', cost: 'gratuit' },
  { id: 'spoof', label: 'Spoof vidéo', desc: 'Anti-empreinte : device, GPS et EXIF réécrits.', cat: 'create', page: 'studio', arg: { tool: 'spoof' }, icon: I.shield, a: '#4ADE80', b: '#14532D', cost: 'gratuit' },
  { id: 'imgspoof', label: 'Spoof image', desc: 'Des photos rendues uniques en .jpg.', cat: 'create', page: 'studio', arg: { tool: 'imgspoof' }, icon: I.image, a: '#86EFAC', b: '#166534', cost: 'gratuit' },
  { id: 'subs', label: 'Sous-titres auto', desc: 'Sous-titres mot par mot, incrustés automatiquement.', cat: 'create', page: 'studio', arg: { tool: 'subs' }, icon: I.cc, a: '#FDE047', b: '#A16207', cost: 'gratuit' },
  { id: 'overlay', label: 'Incrustation', desc: 'Place une photo ou une vidéo par-dessus ta vidéo.', cat: 'create', page: 'studio', arg: { tool: 'overlay' }, icon: I.layers, a: '#93C5FD', b: '#1E40AF', cost: 'gratuit' },
  { id: 'montage', label: 'Montage', desc: 'Coupe, ordonne, transitions simples.', cat: 'create', page: 'studio', arg: { tool: 'montage' }, icon: I.scissors, a: '#FCA5A5', b: '#991B1B', cost: 'gratuit' },
  { id: 'mixer', label: 'Texte sur vidéo', desc: 'Une légende incrustée par-dessus ta vidéo.', cat: 'create', page: 'studio', arg: { tool: 'mixer' }, icon: I.type, a: '#C4B5FD', b: '#4C1D95', cost: 'gratuit' },
  { id: 'genjutsu', label: 'Genjutsu IA', desc: 'Recrée un Reel avec tes images de référence (Higgsfield).', cat: 'create', page: 'genjutsu', icon: I.wand, a: '#C4B5FD', b: '#7C3AED', badge: 'Nouveau', cost: 'IA', gate: 'admin' },
  { id: 'autocontent', label: 'Auto-contenu', desc: 'Une source → des variantes uniques avec légendes.', cat: 'create', page: 'blowContent', icon: I.wand, a: '#F0ABFC', b: '#86198F', badge: 'Bêta', cost: 'gratuit' },
  // ── Comptes
  { id: 'warmup', label: 'Warmup', desc: 'Sessions de scroll, likes et follows pour chauffer tes comptes.', cat: 'accounts', page: 'warmup', arg: { tab: 'warm' }, icon: I.flame, a: '#FB923C', b: '#7C2D12', badge: 'Populaire', infra: GL },
  { id: 'mass-edit', label: 'Édition en masse', desc: '@, photo, nom, bio et lien sur tous tes comptes.', cat: 'accounts', page: 'warmup', arg: { tab: 'edit' }, icon: I.user, a: '#818CF8', b: '#312E81', gate: 'release:massEdit', infra: GL },
  { id: 'auto-login', label: 'Connexion auto', desc: 'Connecte tes comptes Instagram sur les téléphones (2FA géré).', cat: 'accounts', page: 'warmup', arg: { tab: 'login' }, icon: I.key, a: '#94A3B8', b: '#1E293B', infra: GL },
  { id: 'flow-builder', label: 'Flow Builder', desc: 'Enchaîne les actions bloc par bloc, sur tous tes comptes.', cat: 'accounts', page: 'flowBuilder', icon: I.flow, a: '#A78BFA', b: '#1E1B4B', gate: 'release:flowBuilder', infra: GL },
  { id: 'phones', label: 'Téléphones', desc: 'Tes cloud phones : état, allumage, comptes associés.', cat: 'accounts', page: 'phones', icon: I.phone, a: '#64748B', b: '#0F172A', infra: GL },
  // ── Analyser
  { id: 'viral', label: 'Veille Reels', desc: 'Les Reels qui explosent en ce moment, FR et US.', cat: 'analyze', page: 'viral', arg: { tab: 'public' }, icon: I.pulse, a: '#F97316', b: '#7F1D1D', badge: 'Nouveau' },
  { id: 'viral-mine', label: 'Suivi de mes comptes', desc: 'Quelles vidéos marchent le mieux sur tes comptes.', cat: 'analyze', page: 'viral', arg: { tab: 'mine' }, icon: I.chart, a: '#FDBA74', b: '#9A3412' },
  { id: 'links', label: 'Liens trackés', desc: 'Visites, clics et taux de clic par compte, en direct.', cat: 'analyze', page: 'links', arg: { tab: 'dash' }, icon: I.link, a: '#F472B6', b: '#831843', badge: 'Nouveau' },
  { id: 'link-pages', label: 'Pages de liens', desc: 'Ta page façon Linktree, animée et 100 % perso.', cat: 'analyze', page: 'links', arg: { tab: 'pages' }, icon: I.sparkle, a: '#FDA4AF', b: '#BE185D' },
  { id: 'activity', label: 'Activité', desc: 'Historique de chaque run, relance des échecs en 1 clic.', cat: 'analyze', page: 'activity', icon: I.activity, a: '#A1A1AA', b: '#27272A' },
  // ── Banque
  { id: 'bank-videos', label: 'Vidéos', desc: 'Ta banque de vidéos, rangée par dossiers.', cat: 'bank', page: 'bank', arg: { tab: 'video' }, icon: I.video, a: '#60A5FA', b: '#1E3A8A' },
  { id: 'bank-images', label: 'Images', desc: 'Photos de profil, stories, posts.', cat: 'bank', page: 'bank', arg: { tab: 'image' }, icon: I.image, a: '#5EEAD4', b: '#134E4A' },
  { id: 'bank-captions', label: 'Légendes', desc: 'Ta réserve de légendes réutilisables.', cat: 'bank', page: 'bank', arg: { tab: 'caption' }, icon: I.quote, a: '#FCD34D', b: '#78350F' },
]

/** Outils visibles pour cette infra et ce rôle (dates de sortie respectées, admin voit tout). */
export function visibleTools(infra: InfraKey, isAdmin: boolean, now = new Date()): Tool[] {
  return TOOLS.filter(t => {
    if (t.infra && !t.infra.includes(infra)) return false
    if (t.gate === 'admin') return isAdmin
    if (t.gate?.startsWith('release:')) return isAdmin || isReleased(t.gate.slice(8) as ReleaseKey, now)
    return true
  })
}

/** Recherche plein texte (sans accents). */
export function searchTools(list: Tool[], q: string): Tool[] {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const k = n(q.trim())
  if (!k) return list
  return list.filter(t => n(`${t.label} ${t.desc}`).includes(k))
}
