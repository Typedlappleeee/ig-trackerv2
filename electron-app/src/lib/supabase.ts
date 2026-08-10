/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

// URL + clé publishable forcées en dur (valeurs PUBLIQUES par design, déjà
// embarquées côté client → aucun risque de sécurité). On IGNORE volontairement
// les variables d'env Vercel : la prod avait une ancienne clé legacy (eyJ…) que
// Supabase a désactivée → login OK mais zéro donnée. Ces valeurs sont testées
// OK (/rest/v1 → HTTP 200) et identiques à la preview qui fonctionne.
const supabaseUrl  = 'https://fvmkmkspfksscgqyvysl.supabase.co'
const supabaseKey  = 'sb_publishable_hip63djbBYnu3EsSx2gA4w_0tgjweEo'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
    storage:            localStorage,
  },
})

// PostgREST/Supabase plafonne chaque requête à ~1000 lignes. Au-delà (grosses
// orgs : >1000 téléphones/vidéos), des lignes disparaissent SILENCIEUSEMENT des
// sélecteurs. Ce helper boucle par pages de 1000 pour tout charger. `makeQuery`
// doit reconstruire une requête FRAÎCHE avec .range(from,to) à chaque page.
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  // Garde-fou : borne dure pour éviter une boucle infinie si une page renvoie une
  // taille inattendue.
  for (let guard = 0; guard < 1000; guard++) {
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Profile {
  id:           string
  email:        string
  display_name: string | null
  full_name:    string | null
  created_at:   string
  updated_at:   string
}

export interface UserItem {
  id:         string
  user_id:    string
  title:      string
  content:    string
  created_at: string
  updated_at: string
}

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer'

export type PageKey =
  | 'phones'
  | 'posting' | 'massposting' | 'scheduler' | 'tasks' | 'bank' | 'captionbank' | 'warmup' | 'aitools' | 'storylink'
  | 'remix' | 'repurpose' | 'montage' | 'mixer' | 'subtitles' | 'spoof'
  | 'history' | 'library' | 'reports'
  | 'settings'

// Granular action permissions (on top of tab visibility).
export type ActionKey =
  | 'bank_upload'        // can upload files to the bank
  | 'bank_delete'        // can delete files/folders from the bank
  | 'bank_move'          // can move/rename files & folders
  | 'bank_folder_create' // can create new bank folders
  | 'phone_add'          // can add new phones
  | 'phone_delete'       // can delete phones
  | 'phone_edit'         // can edit phone info (name, group, session…)
  | 'posting_launch'     // can launch posting / mass-posting jobs
  | 'scheduler_write'    // can create / edit / delete scheduler jobs

// Per-member overrides on top of role defaults.
// tabs: explicit per-tab allow (true) / deny (false). Missing = use role default.
// bank_folders.mode='all' grants every folder; 'allow' restricts to list; 'deny' blocks list.
// actions: explicit action allow (true) / deny (false). Missing = follow role default.
export interface PermOverrides {
  tabs?:         Partial<Record<PageKey, boolean>>
  bank_folders?: { mode: 'all' } | { mode: 'allow'; list: string[] } | { mode: 'deny'; list: string[] }
  phone_groups?: { mode: 'all' } | { mode: 'allow'; list: string[] }
  actions?:      Partial<Record<ActionKey, boolean>>
}

// Reusable permission template created by org admins/owners
export interface OrgRoleTemplate {
  id:             string
  org_id:         string
  name:           string
  color:          string
  perm_overrides: PermOverrides
  created_by:     string | null
  created_at:     string
}

export interface Organization {
  id:              string
  name:            string
  owner_id:        string
  created_at:      string
  name_updated_at: string | null
}

export interface OrgMember {
  id:             string
  org_id:         string
  user_id:        string
  role:           OrgRole
  perm_overrides: PermOverrides
  custom_role_id: string | null
  invited_by:     string | null
  joined_at:      string
}

export interface OrgInvite {
  id:             string
  org_id:         string
  email:          string
  token:          string
  role:           Exclude<OrgRole, 'owner'>
  perm_overrides: PermOverrides
  custom_role_id: string | null
  invited_by:     string | null
  expires_at:     string
  accepted_at:    string | null
  created_at:     string
}

export interface Phone {
  id:           string
  user_id:      string
  org_id:       string | null
  geelark_id:   string
  serial_no:    string | null
  phone_name:   string
  group_name:   string | null
  status:       string
  ig_username:  string | null
  ig_sessionid: string | null
  ig_status:    string | null  // 'active'|'error'|'rate_limited'|'unknown'
  followers:    number
  following:    number
  total_views:  number
  video_count:  number
  bio:          string | null
  pp_url?:        string | null    // photo de profil (sync stats)
  last_post_at?:  string | null    // date du dernier reel
  account_state?: string | null    // 'ok' | 'banned' | 'shadow'
  remark:       string | null
  link:         string | null
  synced_at:    string
  created_at:   string
}

export interface ContentItem {
  id:             string
  user_id:        string
  org_id:         string | null
  folder:         string | null
  title:          string
  file_url:       string | null   // Legacy local filesystem path (still set for non-migrated rows)
  storage_path:   string | null   // Supabase Storage path inside the "content" bucket (e.g. videos/users/<id>/<uuid>.mp4)
  thumbnail_path: string | null   // Same scheme, in thumbs/ folder
  thumbnail_url:  string | null
  duration:       number | null
  tags:           string[]
  notes:          string
  description?:   string   // légende propre à la vidéo — pré-remplit le post
  used_count:     number
  created_at:     string
  updated_at:     string
  source?:              'upload' | 'drive' | null  // provenance de l'item
  drive_file_id?:       string | null              // ID du fichier Google Drive d'origine
  drive_connection_id?: string | null              // connexion Drive ayant importé l'item
}

// Connexion à un dossier Google Drive synchronisé vers la banque.
export interface DriveConnection {
  id:            string
  user_id:       string
  org_id:        string | null
  name:          string
  folder_id:     string
  target_folder: string | null
  recursive:     boolean
  status:        'active' | 'paused' | 'error'
  last_sync_at:  string | null
  last_error:    string | null
  synced_count:  number
  created_at:    string
  updated_at:    string
}

// Connexions partagées par organisation (lues à la place de AppConfig en mode orga).
export interface OrgConfig {
  org_id:        string
  bearer_token:  string
  groq_api_key:  string
  ig_sessionid:  string | null
  proxy:         string | null
  updated_at:    string
}

export interface AppConfig {
  user_id:       string
  bearer_token:  string
  groq_api_key:  string
  theme:         string
  lang:          string
  profile_name:  string
  profile_niche: string
  updated_at:    string
}

export interface ViewsHistory {
  id:          string
  user_id:     string
  phone_id:    string
  views:       number
  recorded_at: string
}
