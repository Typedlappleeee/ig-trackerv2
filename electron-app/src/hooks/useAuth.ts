import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { rememberCurrentAccount } from '@/lib/recentAccounts'

interface AuthState {
  user:               User | null
  loading:            boolean
  isPasswordRecovery: boolean
  clearPasswordRecovery: () => void
}

export function useAuth(): AuthState {
  const [user, setUser]                         = useState<User | null>(null)
  const [loading, setLoading]                   = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    // Filet de sécurité : l'app ne doit JAMAIS charger à l'infini. Si getSession()
    // coince (token, réseau…), on débloque au bout de 4 s (état déconnecté → la
    // page de connexion s'affiche au lieu d'un spinner sans fin).
    let settled = false
    const safety = setTimeout(() => { if (!settled) { settled = true; setLoading(false) } }, 4000)

    // 1. Vérifie si une session existe déjà (utilisateur déjà connecté)
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        settled = true; clearTimeout(safety)
        setUser(session?.user ?? null)
        setLoading(false)
      })
      .catch(() => { settled = true; clearTimeout(safety); setUser(null); setLoading(false) })

    // 2. Écoute les changements d'état (connexion, déconnexion, refresh token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Don't set user — show the reset form instead of the main app
        setIsPasswordRecovery(true)
        setLoading(false)
        return
      }
      setUser(session?.user ?? null)
      setLoading(false)
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        rememberCurrentAccount()
      }
    })

    return () => { clearTimeout(safety); subscription.unsubscribe() }
  }, [])

  return { user, loading, isPasswordRecovery, clearPasswordRecovery: () => setIsPasswordRecovery(false) }
}
