import { createClient } from '@supabase/supabase-js'

// Credentials intégrés directement (anon key = clé publique, safe à exposer)
// Peuvent être surchargés via .env en développement
const supabaseUrl  = (import.meta.env.VITE_SUPABASE_URL  as string) || 'https://fvmkmkspfksscgqyvysl.supabase.co'
const supabaseKey  = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_hip63djbBYnu3EsSx2gA4w_0tgjweEo'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:    true,   // Session sauvegardée → reste connecté après redémarrage
    autoRefreshToken:  true,   // Renouvelle le token automatiquement
    detectSessionInUrl: false, // Pas de détection dans l'URL (app desktop)
    storage:           localStorage, // Stocke la session dans localStorage
  },
})

// ── Types TypeScript pour tes tables Supabase ─────────────────────────────────

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
