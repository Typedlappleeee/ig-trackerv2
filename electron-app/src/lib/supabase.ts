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
  id:         string
  email:      string
  full_name:  string | null
  created_at: string
  updated_at: string
}

export interface UserItem {
  id:         string
  user_id:    string
  title:      string
  content:    string
  created_at: string
  updated_at: string
}

export interface Phone {
  id:          string
  user_id:     string
  geelark_id:  string
  serial_no:   string | null
  phone_name:  string
  group_name:  string | null
  status:      string
  ig_username: string | null
  followers:   number
  total_views: number
  video_count: number
  remark:      string | null
  synced_at:   string
  created_at:  string
}

export interface ContentItem {
  id:            string
  user_id:       string
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
  user_id:      string
  bearer_token: string
  theme:        string
  lang:         string
  updated_at:   string
}
