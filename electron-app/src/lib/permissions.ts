import type { OrgRole, PermOverrides, PageKey, ActionKey } from './supabase'

// Default tab access per role.
// Note: `settings` here means "can access the Connexions sub-panel of Settings"
// (where API keys live). The Settings page itself is always reachable so members
// can edit their profile / see organisation info.
const ROLE_TABS: Record<OrgRole, Record<PageKey, boolean>> = {
  owner: {
    phones: true,
    posting: true, massposting: true, scheduler: true, tasks: true, storylink: true, bank: true, captionbank: true, warmup: true, aitools: true,
    remix: true, repurpose: true, montage: true, mixer: true,
    settings: true,
  },
  admin: {
    phones: true,
    posting: true, massposting: true, scheduler: true, tasks: true, storylink: true, bank: true, captionbank: true, warmup: true, aitools: true,
    remix: true, repurpose: true, montage: true, mixer: true,
    settings: true,
  },
  member: {
    phones: true,
    posting: true, massposting: true, scheduler: true, tasks: true, storylink: true, bank: true, captionbank: true, warmup: true, aitools: true,
    remix: true, repurpose: true, montage: true, mixer: true,
    settings: false,
  },
  viewer: {
    phones: true,
    posting: false, massposting: false, scheduler: false, tasks: false, storylink: false, bank: true, captionbank: true, warmup: false, aitools: false,
    remix: false, repurpose: false, montage: false, mixer: false,
    settings: false,
  },
}

export function canSeeTab(role: OrgRole, overrides: PermOverrides | undefined, tab: PageKey): boolean {
  const o = overrides?.tabs?.[tab]
  if (typeof o === 'boolean') return o
  return ROLE_TABS[role][tab]
}

export function canAccessBankFolder(
  role: OrgRole,
  overrides: PermOverrides | undefined,
  folder: string | null,
): boolean {
  if (role === 'owner' || role === 'admin') return true
  const f = overrides?.bank_folders
  if (!f || f.mode === 'all') return true
  const name = folder ?? '(racine)'
  if (f.mode === 'allow') return f.list.includes(name)
  if (f.mode === 'deny')  return !f.list.includes(name)
  return true
}

export function canAccessPhoneGroup(
  role: OrgRole,
  overrides: PermOverrides | undefined,
  group: string | null,
): boolean {
  if (role === 'owner' || role === 'admin') return true
  const f = overrides?.phone_groups
  if (!f || f.mode === 'all') return true
  const name = group ?? '(sans groupe)'
  return f.list.includes(name)
}

export function canWrite(role: OrgRole): boolean {
  return role !== 'viewer'
}

export function canManageOrg(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin'
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner:  'Propriétaire',
  admin:  'Admin',
  member: 'Membre',
  viewer: 'Lecteur',
}

// Default action permissions per role (true = allowed, false = blocked)
const ROLE_ACTIONS: Record<OrgRole, Record<ActionKey, boolean>> = {
  owner:  { bank_upload: true,  bank_delete: true,  bank_move: true,  bank_folder_create: true,  phone_add: true,  phone_delete: true,  phone_edit: true,  posting_launch: true,  scheduler_write: true  },
  admin:  { bank_upload: true,  bank_delete: true,  bank_move: true,  bank_folder_create: true,  phone_add: true,  phone_delete: true,  phone_edit: true,  posting_launch: true,  scheduler_write: true  },
  member: { bank_upload: true,  bank_delete: false, bank_move: false, bank_folder_create: false, phone_add: false, phone_delete: false, phone_edit: true,  posting_launch: true,  scheduler_write: true  },
  viewer: { bank_upload: false, bank_delete: false, bank_move: false, bank_folder_create: false, phone_add: false, phone_delete: false, phone_edit: false, posting_launch: false, scheduler_write: false },
}

export function canDoAction(role: OrgRole, overrides: PermOverrides | undefined, action: ActionKey): boolean {
  const o = overrides?.actions?.[action]
  if (typeof o === 'boolean') return o
  return ROLE_ACTIONS[role][action]
}

// Tabs shown in the per-member permission editor.
// `settings` represents the *Connexions sub-panel* (API keys), not the whole page.
export const ALL_TABS: { key: PageKey; label: string; icon: string }[] = [
  { key: 'phones',      label: 'Téléphones',                          icon: '📱' },
  { key: 'posting',     label: 'Posting',                             icon: '🚀' },
  { key: 'massposting', label: 'Mass Posting',                        icon: '⚡' },
  { key: 'scheduler',   label: 'Programmation',                       icon: '📅' },
  { key: 'bank',        label: 'Banque',                              icon: '🗂' },
  { key: 'captionbank', label: 'Banque de Captions',                  icon: '💬' },
  { key: 'warmup',      label: 'Warmup',                              icon: '🔥' },
  { key: 'aitools',     label: 'Outils IA',                           icon: '🔧' },
  { key: 'remix',       label: 'Remix',                               icon: '🔀' },
  { key: 'repurpose',   label: 'CloneVid',                            icon: '⚡' },
  { key: 'mixer',       label: 'Mixer',                               icon: '🎞️' },
  { key: 'settings',    label: 'Paramètres → Connexions (clés API)', icon: '🔑' },
]

export const ALL_ACTIONS: { key: ActionKey; label: string; icon: string; group: string }[] = [
  { key: 'bank_upload',        label: 'Upload dans la banque',    icon: '⬆️', group: 'Banque' },
  { key: 'bank_delete',        label: 'Supprimer de la banque',   icon: '🗑', group: 'Banque' },
  { key: 'bank_move',          label: 'Déplacer / renommer',      icon: '✂️', group: 'Banque' },
  { key: 'bank_folder_create', label: 'Créer des dossiers',       icon: '📁', group: 'Banque' },
  { key: 'phone_add',          label: 'Ajouter des téléphones',   icon: '➕', group: 'Téléphones' },
  { key: 'phone_delete',       label: 'Supprimer des téléphones', icon: '🗑', group: 'Téléphones' },
  { key: 'phone_edit',         label: 'Modifier les téléphones',  icon: '✏️', group: 'Téléphones' },
  { key: 'posting_launch',     label: 'Lancer le posting',        icon: '🚀', group: 'Actions' },
  { key: 'scheduler_write',    label: 'Éditer le scheduler',      icon: '📅', group: 'Actions' },
]
