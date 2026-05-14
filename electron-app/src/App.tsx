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
import { checkLicense, LicenseContext, type LicenseStatus } from '@/lib/license'
import { LicenseGate } from '@/components/LicenseGate'
import { CreditContext, fetchBalance, fetchOrgBalance, maybeGrantMonthlyCredits } from '@/lib/credits'

// ── ScaleFlow logo SVG ────────────────────────────────────────────────────────
function ScaleFlowLogoSVG({ size = 96, draw = false }: { size?: number; draw?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sp-main" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1d4ed8"/>
          <stop offset="28%"  stopColor="#3b5af0"/>
          <stop offset="58%"  stopColor="#7c3aed"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <linearGradient id="sp-depth" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0c1f6e"/>
          <stop offset="55%"  stopColor="#2e1065"/>
          <stop offset="100%" stopColor="#3b0764"/>
        </linearGradient>
        <linearGradient id="sp-arr" x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#db2777"/>
          <stop offset="100%" stopColor="#f472b6"/>
        </linearGradient>
      </defs>
      {/* Depth/3D shadow layer */}
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#sp-depth)" strokeWidth="18" strokeLinecap="round" fill="none"
        transform="translate(2.5,4.5)" opacity="0.65"
      />
      {/* Main S ribbon */}
      <path
        pathLength="1"
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#sp-main)" strokeWidth="16" strokeLinecap="round" fill="none"
        className={draw ? 'sf-draw-path' : undefined}
      />
      {/* Arrow diagonal */}
      <line x1="66" y1="22" x2="88" y2="2"
        stroke="url(#sp-arr)" strokeWidth="11" strokeLinecap="round"
        className={draw ? 'sf-arrow' : undefined}
      />
      {/* Arrow L-head horizontal */}
      <line x1="77" y1="1" x2="90" y2="1"
        stroke="#f472b6" strokeWidth="9" strokeLinecap="round"
        className={draw ? 'sf-arrow' : undefined}
      />
      {/* Arrow L-head vertical */}
      <line x1="90" y1="1" x2="90" y2="15"
        stroke="#f472b6" strokeWidth="9" strokeLinecap="round"
        className={draw ? 'sf-arrow' : undefined}
      />
    </svg>
  )
}

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
const SPLASH_DURATION = 3600

// Pre-computed burst particles (angle → px/py offset in px)
const SF_PARTICLES = [
  { px: 90,  py: 0,   size: 4, dur: '0.92s', delay: '0.74s', col: '#ec4899' },
  { px: 70,  py: 28,  size: 2, dur: '0.76s', delay: '0.79s', col: '#8b5cf6' },
  { px: 78,  py: 78,  size: 3, dur: '1.02s', delay: '0.71s', col: '#3b82f6' },
  { px: 30,  py: 74,  size: 2, dur: '0.82s', delay: '0.82s', col: '#ec4899' },
  { px: 0,   py: 95,  size: 4, dur: '0.88s', delay: '0.75s', col: '#8b5cf6' },
  { px: -37, py: 88,  size: 2, dur: '0.93s', delay: '0.84s', col: '#3b82f6' },
  { px: -70, py: 70,  size: 3, dur: '0.79s', delay: '0.73s', col: '#ec4899' },
  { px: -76, py: 31,  size: 2, dur: '0.90s', delay: '0.86s', col: '#8b5cf6' },
  { px: -95, py: 0,   size: 4, dur: '0.84s', delay: '0.77s', col: '#3b82f6' },
  { px: -67, py: -27, size: 2, dur: '0.97s', delay: '0.88s', col: '#ec4899' },
  { px: -75, py: -75, size: 3, dur: '0.77s', delay: '0.72s', col: '#8b5cf6' },
  { px: -29, py: -72, size: 2, dur: '0.91s', delay: '0.80s', col: '#3b82f6' },
  { px: 0,   py: -92, size: 4, dur: '0.85s', delay: '0.78s', col: '#ec4899' },
  { px: 37,  py: -65, size: 2, dur: '0.89s', delay: '0.83s', col: '#8b5cf6' },
  { px: 82,  py: -82, size: 3, dur: '0.94s', delay: '0.70s', col: '#3b82f6' },
  { px: 74,  py: -30, size: 2, dur: '0.87s', delay: '0.76s', col: '#ec4899' },
]

const STATUS_MSGS = [
  'Initialisation des modules…',
  'Connexion sécurisée…',
  'Chargement de l\'interface…',
  'ScaleFlow est prêt ✓',
]

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading]       = useState(false)
  const [statusIdx, setStatusIdx] = useState(0)
  const doneRef                   = useRef(false)

  useEffect(() => { playSplash() }, [])

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), SPLASH_DURATION)
    const t2 = setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onDone() }
    }, SPLASH_DURATION + 620)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  useEffect(() => {
    const timers = [800, 1700, 2600].map((ms, i) => setTimeout(() => setStatusIdx(i + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div
      className={fading ? 'sf-fade-out' : ''}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#030307',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: fading ? 'none' : 'all',
        overflow: 'hidden',
      }}
    >
      {/* ── Deep purple radial glow ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 55% at 50% 44%, #1e0b3a55 0%, #2d1b6920 40%, transparent 70%)',
        animation: 'sf-bg-breathe 3s ease-in-out 1s infinite',
      }} />

      {/* ── Subtle purple grid ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03,
        backgroundImage: 'linear-gradient(#8b5cf6 1px, transparent 1px), linear-gradient(90deg, #8b5cf6 1px, transparent 1px)',
        backgroundSize: '80px 80px',
      }} />

      {/* ── Horizontal scan line ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 1.5, pointerEvents: 'none',
        background: 'linear-gradient(90deg, transparent 0%, #8b5cf622 15%, #8b5cf699 50%, #8b5cf622 85%, transparent 100%)',
        animation: 'sf-scan 5s linear 0.6s infinite',
      }} />

      {/* ── Light beams radiating from logo center ── */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <div key={i} className="sf-beam" style={{
          height: 240,
          transform: `rotate(${angle}deg)`,
          opacity: 0,
          ['--beam-dur' as string]: `${2.0 + (i % 3) * 0.4}s`,
          ['--beam-delay' as string]: `${0.72 + i * 0.08}s`,
          background: `linear-gradient(to bottom, ${i % 2 === 0 ? '#8b5cf6' : '#ec4899'}88, transparent)`,
        }} />
      ))}

      {/* ── Logo area: rings + particles + logo ── */}
      <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 44 }}>

        {/* Expanding rings burst */}
        {(['sf-ring-1', 'sf-ring-2', 'sf-ring-3'] as const).map(cls => (
          <div key={cls} className={cls} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1.5px solid #8b5cf6', pointerEvents: 'none',
          }} />
        ))}

        {/* Burst particles */}
        {SF_PARTICLES.map((p, i) => (
          <div
            key={i}
            className="sf-particle"
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: p.size, height: p.size, borderRadius: '50%',
              background: p.col,
              boxShadow: `0 0 ${p.size * 3}px ${p.size}px ${p.col}88`,
              marginLeft: -p.size / 2, marginTop: -p.size / 2,
              ['--px' as string]: `${p.px}px`,
              ['--py' as string]: `${p.py}px`,
              ['--dur' as string]: p.dur,
              ['--delay' as string]: p.delay,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* ScaleFlow S logo */}
        <div className="sf-logo-anim">
          <ScaleFlowLogoSVG size={110} draw />
        </div>
      </div>

      {/* ── ScaleFlow title ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
        <span className="sf-word-left" style={{
          fontSize: 42, fontWeight: 900, color: '#f0eeff',
          letterSpacing: '-1.5px', fontFamily: 'Inter, system-ui, sans-serif',
          lineHeight: 1,
        }}>Scale</span>
        <span className="sf-word-right" style={{
          fontSize: 42, fontWeight: 900, letterSpacing: '-1.5px',
          fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1,
          background: 'linear-gradient(130deg, #8b5cf6 30%, #ec4899 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Flow</span>
      </div>

      {/* ── Tagline ── */}
      <div className="sf-tagline" style={{
        fontSize: 11, color: '#4a3f7a', letterSpacing: '0.22em',
        textTransform: 'uppercase', fontFamily: 'Inter, system-ui, sans-serif',
        marginBottom: 64,
      }}>
        Automatise ta croissance
      </div>

      {/* ── Status text ── */}
      <div key={statusIdx} style={{
        position: 'absolute', bottom: 42,
        fontSize: 10, color: '#2a1f48', letterSpacing: '0.12em',
        fontFamily: 'monospace', textTransform: 'uppercase',
        transition: 'opacity 0.4s',
        opacity: fading ? 0 : 1,
        animation: 'sf-arrow-in 0.4s ease-out',
      }}>
        {STATUS_MSGS[statusIdx]}
      </div>

      {/* ── Progress bar ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 2, background: '#0d0a1a',
      }}>
        <div className="sf-bar" style={{
          height: '100%',
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
          borderRadius: 2,
        }} />
      </div>
    </div>
  )
}

// ── Welcome popup (shown once per device after onboarding) ───────────────────
function BetaPopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="bg-[#080610] border border-[#8b5cf6]/20 rounded-2xl p-8 w-full max-w-md shadow-2xl shadow-[#8b5cf6]/10 text-center space-y-5 anim-scale-in">
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3">
          <ScaleFlowLogoSVG size={56} />
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Scale<span style={{ background: 'linear-gradient(130deg,#8b5cf6,#ec4899)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Flow</span>
            </h2>
            <p className="text-[#4a3f7a] text-xs uppercase tracking-widest mt-0.5">Automatise ta croissance</p>
          </div>
        </div>

        <div className="text-left space-y-2">
          {[
            { icon: '⚡', text: 'Interface redessinée, rapide et professionnelle' },
            { icon: '✨', text: 'Captions IA via Groq Llama 3.3 70B' },
            { icon: '🚀', text: 'Posting & Mass Posting automatisés sur GéeLark' },
            { icon: '📊', text: 'Dashboard, Stats et historique de vues' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-xl px-4 py-2.5"
              style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
              <span className="text-base flex-shrink-0">{icon}</span>
              <span className="text-sm text-text2">{text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', border: 'none' }}
          className="w-full text-white font-bold py-3 rounded-xl text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-[#7c3aed]/30"
        >
          Entrer dans ScaleFlow →
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
import { Remix }             from '@/pages/Remix'
import { AiTools }           from '@/pages/AiTools'
import { Autocomment }       from '@/pages/Autocomment'
import { Settings }          from '@/pages/Settings'
import { MassPosting }       from '@/pages/MassPosting'
import { Warmup }            from '@/pages/Warmup'
import { Licences }          from '@/pages/Licences'
import { FullPageLoader }    from '@/components/ui/Spinner'

const BETA_KEY = 'scaleflow-v1-seen'

function AppContent({ user }: { user: User }) {
  const { currentOrg, myOrgs, loading: orgLoading, loadError: orgLoadError } = useOrg()
  const conns = useConnections(user)
  const [page, setPage]                     = useState<Page>('dashboard')
  const [settingsPanel, setSettingsPanel]   = useState<string | undefined>(undefined)
  const [onboarding, setOnboarding]         = useState<boolean | null>(null)
  const [showBeta, setShowBeta]             = useState(false)
  const [phoneCount, setPhoneCount]         = useState(0)
  const [lastRefresh, setLastRefresh]       = useState<Date | null>(null)
  const [refreshTick, setRefreshTick]       = useState(0)
  const [license, setLicense]               = useState<LicenseStatus | null>(null)
  const [creditBalance, setCreditBalance]   = useState(0)
  const [creditLoading, setCreditLoading]   = useState(true)

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

  // License check — re-run whenever the org changes
  useEffect(() => {
    checkLicense(user.id, currentOrg?.id ?? null).then(async l => {
      setLicense(l)
      // Grant monthly credits for own account (if applicable)
      if (l.valid && l.plan && l.source === 'own') {
        await maybeGrantMonthlyCredits(user.id, l.plan).catch(() => {})
      }
      // Show org owner's credit pool when in org mode, own balance otherwise
      const bal = currentOrg?.owner_id
        ? await fetchOrgBalance(currentOrg.id)
        : await fetchBalance(user.id)
      setCreditBalance(bal)
      setCreditLoading(false)
    })
  }, [user.id, currentOrg?.id, currentOrg?.owner_id])

  // Poll the license every 3s while it's invalid, so an incoming Stripe webhook
  // auto-unblocks the user without needing a manual refresh.
  useEffect(() => {
    if (license && license.valid) return
    const id = setInterval(() => {
      checkLicense(user.id, currentOrg?.id ?? null).then(l => {
        if (l.valid) setLicense(l)
      })
    }, 3000)
    return () => clearInterval(id)
  }, [license?.valid, user.id, currentOrg?.id])

  function refreshCredits() {
    const p = currentOrg?.owner_id
      ? fetchOrgBalance(currentOrg.id)
      : fetchBalance(user.id)
    p.then(b => setCreditBalance(b))
  }

  // The user_id whose credits are charged: org owner when in org mode, self otherwise
  const creditOwnerId = currentOrg?.owner_id ?? user.id

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

  // Wait for orgs to load first — org members without their own key need currentOrg
  // to be set before checkLicense can return valid:true via the org owner's key.
  if (orgLoading || license === null) return <FullPageLoader />

  if (!license.valid) {
    return (
      <LicenseGate
        userId={user.id}
        email={user.email ?? null}
        onActivated={() => checkLicense(user.id, currentOrg?.id ?? null).then(setLicense)}
      />
    )
  }

  // License valid but no org yet (e.g. just paid via Stripe) — show create org step.
  // Skip if the org query failed (Supabase 500) — fail open rather than blocking the user.
  if (myOrgs.length === 0 && !license.isSuperAdmin && !orgLoadError) {
    return (
      <LicenseGate
        userId={user.id}
        email={user.email ?? null}
        initialStep="create_org"
        onActivated={() => window.location.reload()}
      />
    )
  }

  const content = (() => {
    switch (page) {
      case 'dashboard':    return <Dashboard   user={user} key={refreshTick} />
      case 'phones':       return <Phones      user={user} key={refreshTick} />
      case 'stats':        return <Stats       user={user} key={refreshTick} />
      case 'posting':      return <Posting     user={user} />
      case 'massposting':  return <MassPosting user={user} />
      case 'bank':         return <Bank        user={user} />
      case 'warmup':       return <Warmup      user={user} />
      case 'montage':      return <Montage     user={user} />
      case 'remix':        return <Remix       user={user} />
      case 'aitools':      return <AiTools     user={user} />
      case 'settings':     return <Settings    user={user} initialPanel={settingsPanel as any} />
      case 'licences':     return <Licences    user={user} />
    }
  })()

  return (
    <LicenseContext.Provider value={license}>
    <CreditContext.Provider value={{ balance: creditBalance, loading: creditLoading, refresh: refreshCredits, ownerId: creditOwnerId }}>
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
    </CreditContext.Provider>
    </LicenseContext.Provider>
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
