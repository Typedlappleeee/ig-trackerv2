/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = (import.meta.env.VITE_SUPABASE_URL  as string) || 'https://fvmkmkspfksscgqyvysl.supabase.co'

// Clé API publishable (nouveau format Supabase). Publique par design (déjà
// embarquée côté client), donc la coder en dur est sûr.
// IMPORTANT : Supabase désactive progressivement les anciennes clés JWT (eyJ…).
// Si la variable d'env contient encore une ancienne clé legacy (ou est vide),
// on l'IGNORE et on utilise la nouvelle clé qui marche — sinon la PROD casse
// (login OK mais aucune donnée ne charge) alors que l'utilisateur n'a rien
// changé. Testée OK sur /rest/v1 (HTTP 200).
const PUBLISHABLE_KEY = 'sb_publishable_hip63djbBYnu3EsSx2gA4w_0tgjweEo'
const envKey       = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabaseKey  = (envKey && envKey.startsWith('sb_')) ? envKey : PUBLISHABLE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
    storage:            localStorage,
  },
})

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
