import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth }           from '@/hooks/useAuth'
import { AuthPage }          from '@/components/auth/AuthPage'
import { Layout, type Page } from '@/components/Layout'
import { Dashboard }         from '@/pages/Dashboard'
import { Phones }            from '@/pages/Phones'
import { Stats }             from '@/pages/Stats'
import { Posting }           from '@/pages/Posting'
import { Bank }              from '@/pages/Bank'
import { AiTools }           from '@/pages/AiTools'
import { Settings }          from '@/pages/Settings'
import { FullPageLoader }    from '@/components/ui/Spinner'

function AppContent({ user }: { user: User }) {
  const [page, setPage] = useState<Page>('dashboard')

  const content = (() => {
    switch (page) {
      case 'dashboard': return <Dashboard user={user} />
      case 'phones':    return <Phones    user={user} />
      case 'stats':     return <Stats     user={user} />
      case 'posting':   return <Posting   user={user} />
      case 'bank':      return <Bank      user={user} />
      case 'aitools':   return <AiTools   user={user} />
      case 'settings':  return <Settings  user={user} />
    }
  })()

  return (
    <Layout user={user} page={page} onNavigate={setPage}>
      {content}
    </Layout>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (!user)   return <AuthPage />
  return <AppContent user={user} />
}
