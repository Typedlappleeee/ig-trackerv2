import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Nettoyage quand le composant est démonté
    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
