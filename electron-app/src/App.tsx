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
import { ScaleFlowIcon }     from '@/components/ui/ScaleFlowLogo'

// ── Static ember positions ────────────────────────────────────────────────────
const EMBERS = [
  { x: 10, dx: -12, dy:-110, dur:3.2, delay:0.0, size:2.5 },
  { x: 25, dx:  18, dy:-130, dur:2.8, delay:0.9, size:2.0 },
  { x: 42, dx: -14, dy:-120, dur:3.6, delay:1.6, size:3.0 },
  { x: 58, dx:  20, dy:-115, dur:3.0, delay:0.4, size:2.5 },
  { x: 73, dx: -16, dy:-125, dur:2.6, delay:1.2, size:2.0 },
  { x: 88, dx:  14, dy:-118, dur:3.4, delay:2.0, size:2.5 },
]

// ── 67 robot character ────────────────────────────────────────────────────────
function SixSevenBot({ flipped = false }: { flipped?: boolean }) {
  const b1 = '#1e9eff', b2 = '#0d6bcc', b3 = '#073d8c'
  const g1 = '#b4bcd0', g2 = '#7a8499'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', transform: flipped ? 'scaleX(-1)' : undefined }}>
      {/* Arms + body row */}
      <div style={{ display:'flex', alignItems:'center' }}>
        {/* Left arm */}
        <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'flex-end', paddingTop:6 }}>
          <div style={{ width:10, height:5, background:`linear-gradient(90deg,${b2},${b1})`, borderRadius:2, boxShadow:`1px 1px 0 ${b3}` }} />
          <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
            {[0,1,2].map(i=><div key={i} style={{ width:7, height:3, background:g1, borderRadius:1, boxShadow:`1px 1px 0 ${g2}` }}/>)}
          </div>
        </div>
        {/* Body */}
        <div style={{
          width:44, height:30, position:'relative',
          background:`linear-gradient(145deg,#4dc8ff 0%,${b1} 45%,${b2} 100%)`,
          border:`2px solid ${b3}`, borderRadius:7,
          boxShadow:`3px 3px 0 ${b3}, inset 0 2px 8px rgba(255,255,255,0.18)`,
          display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden',
        }}>
          {/* Eyes */}
          {[{left:5},{right:5}].map((pos,i)=>(
            <div key={i} style={{
              position:'absolute', top:4, ...pos,
              width:12, height:12, borderRadius:'50%',
              background:'white', border:`1.5px solid ${b3}`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:b2 }}/>
            </div>
          ))}
          {/* Subtle 67 text */}
          <span style={{ fontWeight:900, fontSize:11, color:'rgba(255,255,255,0.13)', fontFamily:'monospace', letterSpacing:2, userSelect:'none' }}>67</span>
          {/* Chest stripe */}
          <div style={{ position:'absolute', bottom:4, left:8, right:8, height:3, background:b3, borderRadius:2, opacity:0.5 }}/>
        </div>
        {/* Right arm */}
        <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'flex-start', paddingTop:6 }}>
          <div style={{ width:10, height:5, background:`linear-gradient(90deg,${b1},${b2})`, borderRadius:2, boxShadow:`1px 1px 0 ${b3}` }} />
          <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
            {[0,1,2].map(i=><div key={i} style={{ width:7, height:3, background:g1, borderRadius:1, boxShadow:`1px 1px 0 ${g2}` }}/>)}
          </div>
        </div>
      </div>
      {/* Legs */}
      <div style={{ display:'flex', gap:5 }}>
        {[0,1].map(i=>(
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{ width:11, height:13, background:`linear-gradient(180deg,${b1} 55%,${b2} 100%)`, boxShadow:`2px 2px 0 ${b3}` }}/>
            <div style={{ width:15, height:6, background:`linear-gradient(180deg,${g1} 30%,${g2} 100%)`, borderRadius:'0 0 3px 3px', boxShadow:`1px 1px 0 #444`, marginLeft: i===0 ? 2 : -2 }}/>
          </div>
        ))}
      </div>
    </div>
  )
}

// Corner bot positions: [vertical-edge, horizontal-edge, flipped, wander-anim, walk-delay]
const CORNER_BOTS = [
  { v:'bottom', vv:10, h:'left',  hh:12, flip:false, wander:'bot-wander-r', delay:0.0 },
  { v:'bottom', vv:10, h:'right', hh:12, flip:true,  wander:'bot-wander-l', delay:1.2 },
  { v:'top',    vv:10, h:'left',  hh:12, flip:false, wander:'bot-wander-r', delay:2.1 },
  { v:'top',    vv:10, h:'right', hh:12, flip:true,  wander:'bot-wander-l', delay:0.7 },
] as const

// ── Flame overlay component ───────────────────────────────────────────────────
function FlameOverlay() {
  const [on, setOn]     = useState(false)
  const [show, setShow] = useState(false)
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    <div className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 498, opacity: on ? 1 : 0, transition: 'opacity 0.8s ease' }}
    >
      {/* SVG turbulence filter */}
      <svg style={{ position:'absolute', width:0, height:0 }}>
        <defs>
          <filter id="fire-warp" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.013 0.09" numOctaves="4" result="noise">
              <animate attributeName="baseFrequency" values="0.013 0.09;0.019 0.13;0.013 0.09" dur="2.6s" repeatCount="indefinite"/>
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        </defs>
      </svg>

      {/* ── Bottom flames — reduced intensity ── */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:60,
        background:'linear-gradient(to top, rgba(255,30,0,0.50) 0%, rgba(255,90,0,0.28) 40%, rgba(255,160,0,0.08) 75%, transparent 100%)',
        filter:'url(#fire-warp) blur(4px)', transformOrigin:'bottom center',
        animation:'flame-rise-a 1.65s ease-in-out infinite' }} />
      <div style={{ position:'absolute', bottom:0, left:'6%', right:'6%', height:38,
        background:'linear-gradient(to top, rgba(255,60,0,0.38) 0%, rgba(255,140,0,0.18) 55%, transparent 100%)',
        filter:'url(#fire-warp) blur(6px)', transformOrigin:'bottom center',
        animation:'flame-rise-b 2.15s ease-in-out infinite' }} />

      {/* ── Side edges ── */}
      <div style={{ position:'absolute', top:'10%', bottom:'10%', left:0, width:45,
        background:'linear-gradient(to right, rgba(255,40,0,0.35) 0%, rgba(255,110,0,0.14) 50%, transparent 100%)',
        filter:'url(#fire-warp) blur(5px)', transformOrigin:'left center',
        animation:'flame-side-l 1.95s ease-in-out infinite' }} />
      <div style={{ position:'absolute', top:'10%', bottom:'10%', right:0, width:45,
        background:'linear-gradient(to left, rgba(255,40,0,0.35) 0%, rgba(255,110,0,0.14) 50%, transparent 100%)',
        filter:'url(#fire-warp) blur(5px)', transformOrigin:'right center',
        animation:'flame-side-r 2.30s ease-in-out infinite' }} />

      {/* ── Vignette glow ── */}
      <div style={{ position:'absolute', inset:0,
        boxShadow:'inset 0 0 80px 16px rgba(255,35,0,0.10)',
        animation:'flame-vignette 2.2s ease-in-out infinite' }} />

      {/* ── Embers ── */}
      {EMBERS.map((e, i) => (
        <div key={i} style={{
          position:'absolute', bottom:'1%', left:`${e.x}%`,
          width:e.size, height:e.size, borderRadius:'50%',
          background:'radial-gradient(circle, #ffffa0 0%, #ff8800 60%, transparent 100%)',
          boxShadow:`0 0 ${e.size*2}px ${e.size}px rgba(255,110,0,0.7)`,
          ['--edx' as string]:`${e.dx}px`, ['--edy' as string]:`${e.dy}px`,
          animation:`ember-float ${e.dur}s ${e.delay}s ease-out infinite, ember-glow ${e.dur*0.7}s ${e.delay}s ease-in-out infinite`,
        }}/>
      ))}

      {/* ── 67 corner bots ── */}
      {CORNER_BOTS.map((b, i) => (
        <div key={i} style={{
          position:'absolute',
          [b.v]: b.vv, [b.h]: b.hh,
          animation:`${b.wander} ${5.5 + i * 0.7}s ${b.delay}s ease-in-out infinite`,
        }}>
          <div style={{ animation:`bot-bob 0.55s ${b.delay}s ease-in-out infinite` }}>
            <SixSevenBot flipped={b.flip} />
          </div>
        </div>
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
  const canvasRef                 = useRef<HTMLCanvasElement>(null)
  const fullText                  = 'Gestion de comptes Instagram'

  // Play jingle once on mount
  useEffect(() => { playSplash() }, [])

  // Canvas starfield — twinkling stars + shooting stars
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    type Star    = { x: number; y: number; r: number; phase: number; speed: number }
    type Shooter = { x: number; y: number; len: number; spd: number; alpha: number; angle: number }

    const stars: Star[] = Array.from({ length: 200 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.12,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.007 + 0.003,
    }))

    const shooters: Shooter[] = []
    let frame = 0
    let rafId = 0

    const spawnShooter = () => {
      shooters.push({
        x:     Math.random() * canvas.width  * 0.72,
        y:     Math.random() * canvas.height * 0.42,
        len:   Math.random() * 130 + 80,
        spd:   Math.random() * 6   + 5,
        alpha: 1,
        angle: Math.PI / 5 + (Math.random() - 0.5) * 0.4,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const t = frame * 0.016

      for (const s of stars) {
        const a = 0.18 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed * 60 + s.phase))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(180,210,255,${a})`
        ctx.fill()
      }

      for (let i = shooters.length - 1; i >= 0; i--) {
        const ss = shooters[i]
        ss.x    += Math.cos(ss.angle) * ss.spd
        ss.y    += Math.sin(ss.angle) * ss.spd
        ss.alpha -= 0.016
        const x0 = ss.x - Math.cos(ss.angle) * ss.len
        const y0 = ss.y - Math.sin(ss.angle) * ss.len
        const g  = ctx.createLinearGradient(x0, y0, ss.x, ss.y)
        g.addColorStop(0,   'rgba(79,158,255,0)')
        g.addColorStop(0.6, `rgba(126,184,255,${ss.alpha * 0.5})`)
        g.addColorStop(1,   `rgba(255,255,255,${ss.alpha})`)
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(ss.x, ss.y)
        ctx.strokeStyle = g
        ctx.lineWidth   = 1.6
        ctx.stroke()
        if (ss.alpha <= 0) shooters.splice(i, 1)
      }

      frame++
      if (frame % 260 === 0 && Math.random() > 0.3) spawnShooter()
      rafId = requestAnimationFrame(draw)
    }

    spawnShooter()
    const t1 = setTimeout(spawnShooter, 900)
    const t2 = setTimeout(spawnShooter, 2000)
    draw()
    return () => { cancelAnimationFrame(rafId); clearTimeout(t1); clearTimeout(t2) }
  }, [])

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
      {/* ── Starfield canvas ── */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* ── Nebula corner glows ── */}
      <div style={{ position: 'absolute', top: '-10%', left: '-8%',  width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,158,255,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-12%', right: '-10%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(126,80,255,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '30%', right: '-5%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,158,255,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

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

      {/* ── Logo ── */}
      <div className="splash-logo" style={{ position: 'relative', marginBottom: 36 }}>
        {/* Radar rings */}
        {(['splash-ring-1', 'splash-ring-2', 'splash-ring-3'] as const).map(cls => (
          <div key={cls} className={cls} style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            border: '1.5px solid rgba(124,58,237,0.6)',
            pointerEvents: 'none',
          }} />
        ))}
        <ScaleFlowIcon size={108} />
      </div>

      {/* ── Title ── */}
      <div className="splash-title" style={{ textAlign: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px' }}>
          Scale
        </span>
        <span style={{ fontSize: 30, fontWeight: 800,
          background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Flow</span>
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
          <h2 className="text-2xl font-bold text-text">ScaleFlow <span className="text-accent">v2.0</span></h2>
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

const BETA_KEY = 'scaleflow-beta-v2-seen'

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
