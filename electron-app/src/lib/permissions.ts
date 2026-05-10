import type { OrgRole, PermOverrides, PageKey } from './supabase'

// Default tab access per role.
// Note: `settings` here means "can access the Connexions sub-panel of Settings"
// (where API keys live). The Settings page itself is always reachable so members
// can edit their profile / see organisation info.
const ROLE_TABS: Record<OrgRole, Record<PageKey, boolean>> = {
  owner: {
    dashboard: true, phones: true, stats: true, posting: true, massposting: true,
    bank: true, autocomment: true, aitools: true, montage: true, settings: true,
  },
  admin: {
    dashboard: true, phones: true, stats: true, posting: true, massposting: true,
    bank: true, autocomment: true, aitools: true, montage: true, settings: true,
  },
  member: {
    dashboard: true, phones: true, stats: true, posting: true, massposting: true,
    bank: true, autocomment: true, aitools: true, montage: true, settings: false,
  },
  viewer: {
    dashboard: true, phones: true, stats: true, posting: false, massposting: false,
    bank: true, autocomment: false, aitools: false, montage: false, settings: false,
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

// Tabs shown in the per-member permission editor.
// `settings` represents the *Connexions sub-panel* (API keys), not the whole page.
export const ALL_TABS: { key: PageKey; label: string; icon: string }[] = [
  { key: 'dashboard',   label: 'Dashboard',                            icon: '📊' },
  { key: 'phones',      label: 'Téléphones',                           icon: '📱' },
  { key: 'stats',       label: 'Stats',                                icon: '📈' },
  { key: 'posting',     label: 'Posting',                              icon: '🚀' },
  { key: 'massposting', label: 'Mass Posting',                         icon: '⚡' },
  { key: 'bank',        label: 'Banque',                               icon: '🗂' },
  { key: 'autocomment', label: 'Commentaires',                         icon: '💬' },
  { key: 'aitools',     label: 'Outils IA',                            icon: '🔧' },
  { key: 'montage',     label: 'Montage',                              icon: '✂' },
  { key: 'settings',    label: 'Paramètres → Connexions (clés API)',  icon: '🔑' },
]
