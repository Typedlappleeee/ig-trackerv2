import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { rememberCurrentAccount } from '@/lib/recentAccounts'

interface AuthState {
  user:    User | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Vérifie si une session existe déjà (utilisateur déjà connecté)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // 2. Écoute les changements d'état (connexion, déconnexion, refresh token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
      // Remember signed-in users so the sidebar can offer a quick switch later.
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        rememberCurrentAccount()
      }
    })

    // Nettoyage quand le composant est démonté
    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
