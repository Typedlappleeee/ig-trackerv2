import { useAuth }        from '@/hooks/useAuth'
import { AuthPage }       from '@/components/auth/AuthPage'
import { Dashboard }      from '@/pages/Dashboard'
import { FullPageLoader } from '@/components/ui/Spinner'

export default function App() {
  const { user, loading } = useAuth()

  // Pendant la vérification de la session → spinner plein écran
  if (loading) return <FullPageLoader />

  // Pas connecté → page de connexion/inscription
  if (!user) return <AuthPage />

  // Connecté → dashboard avec les données de l'utilisateur
  return <Dashboard user={user} />
}
