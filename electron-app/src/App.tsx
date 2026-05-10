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
import { startMusic, stopMusic, isMusicEnabled, subscribeMusicState } from '@/lib/music'

// ── Static ember positions (outside component to avoid re-render randomness) ──
const EMBERS: { x: number; dx: number; dy: number; dur: number; delay: number; size: number }[] = [
  { x:  4, dx: -18, dy:-155, dur:3.2, delay:0.0, size:3.5 },
  { x: 12, dx:  22, dy:-140, dur:2.8, delay:0.6, size:2.5 },
  { x: 19, dx: -10, dy:-170, dur:3.6, delay:1.1, size:4.0 },
  { x: 27, dx:  30, dy:-130, dur:2.5, delay:0.3, size:2.0 },
  { x: 35, dx: -25, dy:-160, dur:3.9, delay:1.8, size:3.0 },
  { x: 43, dx:  15, dy:-175, dur:3.1, delay:0.8, size:4.5 },
  { x: 51, dx: -32, dy:-145, dur:2.7, delay:2.1, size:2.5 },
  { x: 58, dx:  28, dy:-165, dur:4.0, delay:0.4, size:3.5 },
  { x: 66, dx: -20, dy:-150, dur:3.3, delay:1.5, size:2.0 },
  { x: 74, dx:  18, dy:-180, dur:2.9, delay:0.9, size:3.0 },
  { x: 82, dx: -14, dy:-135, dur:3.7, delay:1.3, size:4.0 },
  { x: 89, dx:  25, dy:-158, dur:3.0, delay:2.4, size:2.5 },
  { x: 95, dx: -22, dy:-172, dur:2.6, delay:0.7, size:3.5 },
  // side embers
  { x:  2, dx:-120, dy: -80, dur:3.4, delay:1.0, size:2.5 },
  { x: 97, dx: 120, dy: -90, dur:2.8, delay:1.7, size:2.5 },
]

// ── Flame overlay component ───────────────────────────────────────────────────
function FlameOverlay() {
  const [on, setOn]       = useState(false)
  const [show, setShow]   = useState(false)
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return subscribeMusicState((running, track) => {
      const active = running && track === 3
      if (active) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setShow(true)
        requestAnimationFrame(() => setOn(true))
      } else {
        setOn(false)
        timerRef.current = setTimeout(() => setShow(false), 900)
      }
    })
  }, [])

  if (!show) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{
        zIndex: 498,
        opacity: on ? 1 : 0,
        transition: 'opacity 0.8s ease',
      }}
    >
      {/* SVG turbulence filter — makes gradients look like real fire */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="fire-warp" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.013 0.09" numOctaves="4" result="noise">
              <animate attributeName="baseFrequency"
                values="0.013 0.09;0.019 0.13;0.013 0.09"
                dur="2.6s" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="22"
              xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* ── Bottom flames (3 layers, main) ── */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0, height:110,
        background:'linear-gradient(to top, rgba(255,25,0,0.95) 0%, rgba(255,85,0,0.72) 22%, rgba(255,160,0,0.38) 55%, rgba(255,200,0,0.10) 80%, transparent 100%)',
        filter:'url(#fire-warp) blur(3px)',
        transformOrigin:'bottom center',
        animation:'flame-rise-a 1.65s ease-in-out infinite',
      }} />
      <div style={{
        position:'absolute', bottom:0, left:'3%', right:'3%', height:75,
        background:'linear-gradient(to top, rgba(255,55,0,0.85) 0%, rgba(255,130,0,0.55) 40%, rgba(255,200,50,0.18) 75%, transparent 100%)',
        filter:'url(#fire-warp) blur(5px)',
        transformOrigin:'bottom center',
        animation:'flame-rise-b 2.15s ease-in-out infinite',
      }} />
      <div style={{
        position:'absolute', bottom:0, left:'8%', right:'8%', height:50,
        background:'linear-gradient(to top, rgba(255,200,0,0.70) 0%, rgba(255,120,0,0.40) 50%, transparent 100%)',
        filter:'blur(6px)',
        transformOrigin:'bottom center',
        animation:'flame-rise-c 2.70s ease-in-out infinite',
      }} />

      {/* ── Left edge ── */}
      <div style={{
        position:'absolute', top:'5%', bottom:'5%', left:0, width:80,
        background:'linear-gradient(to right, rgba(255,35,0,0.80) 0%, rgba(255,100,0,0.50) 35%, rgba(255,150,0,0.18) 65%, transparent 100%)',
        filter:'url(#fire-warp) blur(4px)',
        transformOrigin:'left center',
        animation:'flame-side-l 1.95s ease-in-out infinite',
      }} />

      {/* ── Right edge ── */}
      <div style={{
        position:'absolute', top:'5%', bottom:'5%', right:0, width:80,
        background:'linear-gradient(to left, rgba(255,35,0,0.80) 0%, rgba(255,100,0,0.50) 35%, rgba(255,150,0,0.18) 65%, transparent 100%)',
        filter:'url(#fire-warp) blur(4px)',
        transformOrigin:'right center',
        animation:'flame-side-r 2.30s ease-in-out infinite',
      }} />

      {/* ── Top glow ── */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, height:55,
        background:'linear-gradient(to bottom, rgba(255,50,0,0.55) 0%, rgba(255,80,0,0.25) 50%, transparent 100%)',
        filter:'blur(10px)',
        animation:'flame-rise-b 2.80s ease-in-out infinite',
      }} />

      {/* ── Corner hotspots ── */}
      {([
        { s: 'bottom:0;left:0',  bg:'radial-gradient(ellipse at 0% 100%, rgba(255,50,0,0.70) 0%, transparent 65%)' },
        { s: 'bottom:0;right:0', bg:'radial-gradient(ellipse at 100% 100%, rgba(255,50,0,0.70) 0%, transparent 65%)' },
        { s: 'top:0;left:0',     bg:'radial-gradient(ellipse at 0% 0%,   rgba(255,30,0,0.40) 0%, transparent 60%)' },
        { s: 'top:0;right:0',    bg:'radial-gradient(ellipse at 100% 0%, rgba(255,30,0,0.40) 0%, transparent 60%)' },
      ] as const).map((c, i) => (
        <div key={i} style={{
          position:'absolute',
          ...Object.fromEntries(c.s.split(';').map(p => { const [k,v]=p.split(':'); return [k,v] })),
          width:160, height:160,
          background: c.bg,
          animation:`flame-vignette ${1.5 + i * 0.28}s ease-in-out infinite`,
        }} />
      ))}

      {/* ── Vignette pulse (whole screen) ── */}
      <div style={{
        position:'absolute', inset:0,
        boxShadow:'inset 0 0 120px 30px rgba(255,35,0,0.20)',
        animation:'flame-vignette 2.2s ease-in-out infinite',
      }} />

      {/* ── Ember particles ── */}
      {EMBERS.map((e, i) => (
        <div key={i} style={{
          position:'absolute',
          bottom: i >= 13 ? `${15 + (i-13)*5}%` : `${2 + Math.abs(e.dy % 5)}%`,
          left: `${e.x}%`,
          width: e.size, height: e.size,
          borderRadius:'50%',
          background:'radial-gradient(circle, #ffffa0 0%, #ff8800 55%, transparent 100%)',
          boxShadow:`0 0 ${e.size*2}px ${e.size}px rgba(255,120,0,0.8)`,
          ['--edx' as string]: `${e.dx}px`,
          ['--edy' as string]: `${e.dy}px`,
          animation:`ember-float ${e.dur}s ${e.delay}s ease-out infinite, ember-glow ${e.dur*0.7}s ${e.delay}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

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

  // Background music — start on login if enabled, stop cleanly on signout
  useEffect(() => {
    if (isMusicEnabled()) startMusic()
    return () => stopMusic(true)
  }, [])

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
      <FlameOverlay />
    </>
  )
}
