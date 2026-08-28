/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

// URL + clé publishable PUBLIQUES (par design, déjà embarquées côté client).
// Identiques à celles de login.dc.html → la session posée par la page de login
// (localStorage['sb-fvmkmkspfksscgqyvysl-auth-token']) est reprise ici sans
// nouvelle authentification.
const supabaseUrl = 'https://fvmkmkspfksscgqyvysl.supabase.co'
const supabaseKey = 'sb_publishable_hip63djbBYnu3EsSx2gA4w_0tgjweEo'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: localStorage,
    // MÊME clé que le login → session partagée.
    storageKey: 'sb-fvmkmkspfksscgqyvysl-auth-token',
  },
})

// ── Types (sous-ensemble aligné sur electron-app/src/lib/supabase.ts) ──────────
export interface Organization {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  perm_overrides: PermOverrides
}

export interface PermOverrides {
  phone_groups?: { mode: 'all' } | { mode: 'allow'; list: string[] }
}

export interface ScheduledPost {
  id: string
  status: string
  type?: string
  caption: string | null
  phones: unknown
  scheduled_at: string
  executed_at: string | null
  created_at: string
}

export interface PostRun {
  id: string
  type: string
  ok_count: number
  err_count: number
  total: number
  created_at: string
}
