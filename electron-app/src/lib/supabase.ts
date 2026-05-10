import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = (import.meta.env.VITE_SUPABASE_URL  as string) || 'https://fvmkmkspfksscgqyvysl.supabase.co'
const supabaseKey  = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_hip63djbBYnu3EsSx2gA4w_0tgjweEo'

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
  | 'dashboard' | 'phones' | 'stats' | 'posting' | 'massposting'
  | 'bank' | 'autocomment' | 'aitools' | 'montage' | 'settings'

// Per-member overrides on top of role defaults.
// tabs: explicit per-tab allow (true) / deny (false). Missing = use role default.
// bank_folders.mode='all' grants every folder; 'allow' restricts to list; 'deny' blocks list.
export interface PermOverrides {
  tabs?:         Partial<Record<PageKey, boolean>>
  bank_folders?: { mode: 'all' } | { mode: 'allow'; list: string[] } | { mode: 'deny'; list: string[] }
  phone_groups?: { mode: 'all' } | { mode: 'allow'; list: string[] }
}

export interface Organization {
  id:         string
  name:       string
  owner_id:   string
  created_at: string
}

export interface OrgMember {
  id:             string
  org_id:         string
  user_id:        string
  role:           OrgRole
  perm_overrides: PermOverrides
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
  synced_at:    string
  created_at:   string
}

export interface ContentItem {
  id:            string
  user_id:       string
  org_id:        string | null
  folder:        string | null
  title:         string
  file_url:      string | null
  thumbnail_url: string | null
  duration:      number | null
  tags:          string[]
  notes:         string
  used_count:    number
  created_at:    string
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
