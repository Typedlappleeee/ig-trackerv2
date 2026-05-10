import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth }           from '@/hooks/useAuth'
import { supabase }          from '@/lib/supabase'
import { AuthPage }          from '@/components/auth/AuthPage'
import { Onboarding }        from '@/components/Onboarding'
import { Layout, type Page } from '@/components/Layout'
import { Dashboard }         from '@/pages/Dashboard'
import { Phones }            from '@/pages/Phones'
import { Stats }             from '@/pages/Stats'
import { Posting }           from '@/pages/Posting'
import { Bank }              from '@/pages/Bank'
import { Montage }           from '@/pages/Montage'
import { AiTools }           from '@/pages/AiTools'
import { Autocomment }       from '@/pages/Autocomment'
import { Settings }          from '@/pages/Settings'
import { MassPosting }       from '@/pages/MassPosting'
import { FullPageLoader }    from '@/components/ui/Spinner'

function AppContent({ user }: { user: User }) {
  const [page, setPage]               = useState<Page>('dashboard')
  const [onboarding, setOnboarding]   = useState<boolean | null>(null)
  const [phoneCount, setPhoneCount]   = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    supabase.from('app_config').select('bearer_token').eq('user_id', user.id).single()
      .then(({ data }) => { setOnboarding(!data?.bearer_token) })
    supabase.from('phones').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => setPhoneCount(count ?? 0))
  }, [user.id])

  function handleRefresh() {
    setLastRefresh(new Date())
    setRefreshTick(t => t + 1)
  }

  if (onboarding === null) return <FullPageLoader />
  if (onboarding) return <Onboarding user={user} onComplete={() => setOnboarding(false)} />

  const content = (() => {
    switch (page) {
      case 'dashboard':    return <Dashboard   user={user} key={refreshTick} />
      case 'phones':       return <Phones      user={user} key={refreshTick} />
      case 'stats':        return <Stats       user={user} key={refreshTick} />
      case 'posting':      return <Posting     user={user} />
      case 'massposting':  return <MassPosting user={user} />
      case 'bank':         return <Bank        user={user} />
      case 'autocomment':  return <Autocomment user={user} />
      case 'montage':      return <Montage     user={user} />
      case 'aitools':      return <AiTools     user={user} />
      case 'settings':     return <Settings    user={user} />
    }
  })()

  return (
    <Layout
      user={user}
      page={page}
      onNavigate={setPage}
      onRefresh={handleRefresh}
      phoneCount={phoneCount}
      lastRefresh={lastRefresh}
    >
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
