import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth }           from '@/hooks/useAuth'
import { supabase }          from '@/lib/supabase'
import { AuthPage }          from '@/components/auth/AuthPage'
import { Onboarding }        from '@/components/Onboarding'
import { Layout, type Page } from '@/components/Layout'
import { OrgProvider, useOrg } from '@/lib/orgContext'
import { useConnections }    from '@/lib/connections'
import { playSplash }        from '@/lib/sounds'

// ── Splash screen ─────────────────────────────────────────────────────────────
const SPLASH_DURATION = 3400

// Static particles so positions don't change on re-render
const PARTICLES = [
  { x: 38, y: 58, s: 2.5, d: 0.1, dur: 2.8 },
  { x: 62, y: 55, s: 2,   d: 0.4, dur: 3.1 },
  { x: 48, y: 60, s: 1.5, d: 0.7, dur: 2.5 },
  { x: 55, y: 57, s: 3,   d: 0.2, dur: 3.4 },
  { x: 42, y: 56, s: 1.5, d: 1.0, dur: 2.9 },
  { x: 52, y: 59, s: 2,   d: 0.6, dur: 3.2 },
  { x: 46, y: 54, s: 1,   d: 1.3, dur: 2.7 },
  { x: 58, y: 61, s: 2.5, d: 0.3, dur: 3.0 },
  { x: 44, y: 53, s: 1,   d: 0.9, dur: 2.6 },
  { x: 56, y: 62, s: 2,   d: 1.2, dur: 3.3 },
  { x: 40, y: 57, s: 1.5, d: 0.5, dur: 2.4 },
  { x: 60, y: 58, s: 1,   d: 1.5, dur: 3.5 },
]

const STATUS_MSGS = [
  'Initialisation des modules…',
  'Connexion à la base de données…',
  'Chargement de l\'interface…',
  'Tout est prêt ✓',
]

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading]       = useState(false)
  const [typed, setTyped]         = useState('')
  const [statusIdx, setStatusIdx] = useState(0)
  const doneRef                   = useRef(false)
  const fullText                  = 'Gestion de comptes Instagram'

  // Play jingle once on mount
  useEffect(() => { playSplash() }, [])

  // Fade-out timing
  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), SPLASH_DURATION)
    const t2 = setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onDone() }
    }, SPLASH_DURATION + 560)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  // Typewriter effect (starts at 850ms)
  useEffect(() => {
    if (typed.length >= fullText.length) return
    const delay = typed.length === 0 ? 850 : 45
    const t = setTimeout(() => setTyped(fullText.slice(0, typed.length + 1)), delay)
    return () => clearTimeout(t)
  }, [typed])

  // Status message cycle
  useEffect(() => {
    const intervals = [700, 1500, 2400]
    const timers = intervals.map((ms, i) => setTimeout(() => setStatusIdx(i + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div
      className={fading ? 'splash-fade-out' : ''}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(ellipse at 50% 35%, #0e1a3a 0%, #080b14 68%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: fading ? 'none' : 'all',
        overflow: 'hidden',
      }}
    >
      {/* ── Grid overlay ── */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(#4f9eff 1px, transparent 1px), linear-gradient(90deg, #4f9eff 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      {/* ── Floating particles ── */}
      {PARTICLES.map((p, i) => (
        <div key={i} className="splash-particle" style={{
          position: 'absolute',
          left:    `${p.x}%`,
          top:     `${p.y}%`,
          width:    p.s,
          height:   p.s,
          borderRadius: '50%',
          background: '#4f9eff',
          boxShadow: `0 0 ${p.s * 3}px #4f9effaa`,
          animationDelay: `${p.d}s`,
          animationDuration: `${p.dur}s`,
          animationIterationCount: 'infinite',
        }} />
      ))}

      {/* ── Logo with spinning border + glow rings ── */}
      <div className="splash-logo" style={{ position: 'relative', marginBottom: 36 }}>
        {/* Radar rings */}
        {(['splash-ring-1', 'splash-ring-2', 'splash-ring-3'] as const).map(cls => (
          <div key={cls} className={cls} style={{
            position: 'absolute',
            inset: -4,
            borderRadius: 36,
            border: '1.5px solid #4f9eff',
            pointerEvents: 'none',
          }} />
        ))}

        {/* Spinning border wrapper */}
        <div className="splash-border" style={{
          width: 108, height: 108, borderRadius: 32, padding: 2.5,
          background: `conic-gradient(from var(--splash-angle, 0deg), transparent 0%, #4f9eff 35%, #7eb8ff 50%, transparent 65%)`,
        }}>
          {/* Logo inner */}
          <div style={{
            width: '100%', height: '100%', borderRadius: 30,
            background: 'linear-gradient(135deg, #1a2f5e 0%, #0a1428 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 38, fontWeight: 900,
            color: '#4f9eff', letterSpacing: '-2px',
            fontFamily: 'Inter, system-ui, sans-serif',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Shimmer sweep over text */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(105deg, transparent 30%, #ffffff22 50%, transparent 70%)',
              backgroundSize: '200% 100%',
              animation: 'splash-shimmer 2.4s ease-in-out 0.9s infinite',
            }} />
            IG
          </div>
        </div>
      </div>

      {/* ── Title ── */}
      <div className="splash-title" style={{ textAlign: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: '#d4dcf0', letterSpacing: '-0.5px' }}>
          IG Tracker
        </span>
        {' '}
        <span style={{ fontSize: 30, fontWeight: 800,
          background: 'linear-gradient(135deg, #4f9eff, #7eb8ff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>v2</span>
      </div>

      {/* ── Typewriter subtitle ── */}
      <div className="splash-sub" style={{
        color: '#5a6882', fontSize: 13, marginBottom: 52,
        fontFamily: 'monospace', letterSpacing: '0.02em', minHeight: 18,
      }}>
        {typed}<span className="splash-cursor" style={{ color: '#4f9eff', marginLeft: 1 }}>|</span>
      </div>

      {/* ── Status text ── */}
      <div style={{
        position: 'absolute', bottom: 44,
        fontSize: 10, color: '#3a4a66', letterSpacing: '0.08em',
        fontFamily: 'monospace', textTransform: 'uppercase',
        transition: 'opacity 0.4s',
        opacity: fading ? 0 : 1,
      }}>
        {STATUS_MSGS[statusIdx]}
      </div>

      {/* ── Progress bar ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 3, background: '#0f1628',
      }}>
        <div className="splash-bar" style={{
          height: '100%',
          background: 'linear-gradient(90deg, #4f9eff, #7eb8ff, #4f9eff)',
          backgroundSize: '200% 100%',
          borderRadius: 2,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Shimmer on bar */}
          <div className="splash-bar-shimmer" style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent, #ffffff40, transparent)',
            width: '25%',
          }} />
        </div>
      </div>
    </div>
  )
}

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
import { initPoller, stopPoller } from '@/lib/phonePoller'
import { initIgStatsPoller } from '@/lib/igStatsPoller'
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
  const { currentOrg } = useOrg()
  const conns = useConnections(user)
  const [page, setPage]                     = useState<Page>('dashboard')
  const [settingsPanel, setSettingsPanel]   = useState<string | undefined>(undefined)
  const [onboarding, setOnboarding]         = useState<boolean | null>(null)
  const [showBeta, setShowBeta]             = useState(false)
  const [phoneCount, setPhoneCount]         = useState(0)
  const [lastRefresh, setLastRefresh]       = useState<Date | null>(null)
  const [refreshTick, setRefreshTick]       = useState(0)

  // Onboarding gate: only shown once per account, never again — even if the
  // user skipped without entering a bearer. We mark completion via
  // app_config.onboarded_at and fall back to bearer presence for legacy users
  // who finished onboarding before this column existed.
  useEffect(() => {
    supabase.from('app_config').select('bearer_token, onboarded_at').eq('user_id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[app_config] read error:', error)
        const finished = !!(data && (data.onboarded_at || data.bearer_token))
        setOnboarding(!finished)
        if (finished && !localStorage.getItem(BETA_KEY)) setShowBeta(true)
      })
  }, [user.id])

  // Sidebar phone count: 0 when no bearer in scope, org-scoped or solo-scoped otherwise.
  useEffect(() => {
    if (!conns.bearer) { setPhoneCount(0); return }
    let q = supabase.from('phones').select('id', { count: 'exact', head: true })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ count }) => setPhoneCount(count ?? 0))
  }, [currentOrg?.id, user.id, conns.bearer])

  // Re-initialise the GéeLark poller whenever the active bearer changes
  // (org switch, settings save, …).
  useEffect(() => {
    if (conns.loading) return
    if (conns.bearer) {
      initPoller(conns.bearer)
      initIgStatsPoller(user)
    } else {
      // No bearer in the active scope (deleted token, fresh org with no config, …)
      // Stop polling so we don't keep hitting GéeLark with a stale credential.
      stopPoller()
    }
  }, [conns.bearer, conns.loading, user.id])

  function dismissBeta() {
    localStorage.setItem(BETA_KEY, '1')
    setShowBeta(false)
  }

  function handleNavigate(p: Page, tab?: string) {
    setPage(p)
    setSettingsPanel(tab)
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
      case 'settings':     return <Settings    user={user} initialPanel={settingsPanel as any} />
    }
  })()

  return (
    <>
      {showBeta && <BetaPopup onClose={dismissBeta} />}
      <Layout
        user={user}
        page={page}
        onNavigate={handleNavigate}
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
  const [splashDone, setSplashDone] = useState(false)

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      {splashDone && (
        loading        ? <FullPageLoader /> :
        !user          ? <AuthPage />       :
        <OrgProvider user={user}><AppContent user={user} /></OrgProvider>
      )}
    </>
  )
}
