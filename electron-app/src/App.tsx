import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth }           from '@/hooks/useAuth'
import { supabase }          from '@/lib/supabase'
import { AuthPage }          from '@/components/auth/AuthPage'
import { Onboarding }        from '@/components/Onboarding'
import { Layout, type Page } from '@/components/Layout'

// ── Beta popup (shown once per device after onboarding is complete) ───────────
function BetaPopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0d1120] border border-accent/30 rounded-2xl p-8 w-full max-w-md shadow-2xl text-center space-y-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 bg-[#e0245e]/10 border border-[#e0245e]/30 rounded-full px-4 py-1.5 text-[#e0245e] text-xs font-bold uppercase tracking-widest mb-3">
            🔴 BÊTA
          </div>
          <h2 className="text-2xl font-bold text-text">IG Tracker <span className="text-accent">v2.0</span></h2>
          <p className="text-text2 text-sm">Bienvenue dans la nouvelle version de l'application !</p>
        </div>

        <div className="text-left space-y-2.5">
          {[
            { icon: '⚡', text: 'Interface entièrement redessinée en React + Electron' },
            { icon: '✨', text: 'Génération de captions IA via Groq Llama 3.3' },
            { icon: '🤖', text: 'Mass Posting et automatisation de commentaires' },
            { icon: '📊', text: 'Dashboard avec historique de vues' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3 bg-surface2/50 rounded-xl px-4 py-2.5">
              <span className="text-lg flex-shrink-0">{icon}</span>
              <span className="text-sm text-text2">{text}</span>
            </div>
          ))}
        </div>

        <div className="bg-warn/10 border border-warn/20 rounded-xl px-4 py-3 text-left">
          <p className="text-warn text-xs font-semibold mb-0.5">⚠ Version bêta</p>
          <p className="text-text2 text-xs">Certaines fonctionnalités sont encore en développement. Les bugs peuvent être signalés via Paramètres.</p>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-accent hover:bg-accent2 text-white font-bold py-3 rounded-xl transition-colors text-sm"
        >
          🚀 Entrer dans l'application
        </button>
      </div>
    </div>
  )
}
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

const BETA_KEY = 'ig-tracker-beta-v2-seen'

function AppContent({ user }: { user: User }) {
  const [page, setPage]               = useState<Page>('dashboard')
  const [onboarding, setOnboarding]   = useState<boolean | null>(null)
  const [showBeta, setShowBeta]       = useState(false)
  const [phoneCount, setPhoneCount]   = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    supabase.from('app_config').select('bearer_token').eq('user_id', user.id).single()
      .then(({ data }) => {
        const hasBearer = !!data?.bearer_token
        setOnboarding(!hasBearer)
        // Show beta popup once for returning users (who have already set up)
        if (hasBearer && !localStorage.getItem(BETA_KEY)) {
          setShowBeta(true)
        }
      })
    supabase.from('phones').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => setPhoneCount(count ?? 0))
  }, [user.id])

  function dismissBeta() {
    localStorage.setItem(BETA_KEY, '1')
    setShowBeta(false)
  }

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
    <>
      {showBeta && <BetaPopup onClose={dismissBeta} />}
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
    </>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (!user)   return <AuthPage />
  return <AppContent user={user} />
}
