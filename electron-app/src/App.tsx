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
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" overflow="visible" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sp-g" x1="50" y1="5" x2="50" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#60a5fa"/>
          <stop offset="45%"  stopColor="#818cf8"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <filter id="sp-glow" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
          <feColorMatrix in="blur" type="matrix"
            values="0 0 0 0 0.38  0 0 0 0 0.25  0 0 0 0 1   0 0 0 1 0" result="colored"/>
          <feMerge><feMergeNode in="colored"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Outer glow halo */}
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="#7c3aed" strokeWidth="24" strokeLinecap="round" fill="none" opacity="0.3"
      />
      {/* Main S */}
      <path
        pathLength="1"
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#sp-g)" strokeWidth="16" strokeLinecap="round" fill="none"
        filter="url(#sp-glow)"
        className={draw ? 'sf-draw-path' : undefined}
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

// ── Splash screen — 6-stage cinematic animation ───────────────────────────────
const SPLASH_DURATION = 8200

// Feature icons for Stage 2 connexion
const SP_FEATURES = [
  { angle: 315, label: 'Posting',    color: '#8b5cf6',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 8l6 4-6 4V8z"/></svg> },
  { angle: 45,  label: 'Automatise', color: '#60a5fa',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
  { angle: 135, label: 'Communauté', color: '#ec4899',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { angle: 225, label: 'Planifie',   color: '#a855f7',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
]

// 12 acceleration rays at different angles
const SP_RAYS = [0,30,60,90,120,150,180,210,240,270,300,330].map((a, i) => ({
  angle: a, delay: i * 0.04,
  color: ['#7c3aed','#60a5fa','#a855f7','#ec4899','#3b82f6','#8b5cf6'][i % 6],
  length: 220 + (i % 3) * 60, width: i % 2 === 0 ? 2 : 1.5,
}))

function SplashLogoBox({ size = 110, spin = true }: { size?: number; spin?: boolean }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {spin && <div className="logo-neon-ring" style={{ position:'absolute', inset:-3, borderRadius:Math.round(size*0.24), animationDuration:'2.2s' }} />}
      <div style={{ position:'absolute', inset:-size*0.16, borderRadius:size*0.35, background:'radial-gradient(circle,rgba(124,58,237,0.4) 0%,transparent 70%)', filter:'blur(14px)' }} />
      <div style={{ position:'absolute', inset:0, borderRadius:Math.round(size*0.24), background:'linear-gradient(145deg,#0d0820 0%,#100626 50%,#160b30 100%)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.07)' }} />
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <ScaleFlowLogoSVG size={Math.round(size * 0.73)} />
      </div>
    </div>
  )
}

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [stage, setStage]   = useState(1)
  const [fading, setFading] = useState(false)
  const doneRef             = useRef(false)

  useEffect(() => { playSplash() }, [])

  useEffect(() => {
    const schedule: [number, () => void][] = [
      [1500, () => setStage(2)],
      [2900, () => setStage(3)],
      [4000, () => setStage(4)],
      [5100, () => setStage(5)],
      [6300, () => setStage(6)],
      [7500, () => setFading(true)],
      [8200, () => { if (!doneRef.current) { doneRef.current = true; onDone() } }],
    ]
    const timers = schedule.map(([ms, fn]) => setTimeout(fn, ms))
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  const BG = '#030307'

  return (
    <div className={fading ? 'sp-fade-out' : ''}
      style={{ position:'fixed', inset:0, zIndex:9999, background:BG, overflow:'hidden', pointerEvents: fading ? 'none' : 'all' }}>

      {/* ── Stage 1 – ÉMERGENCE ─────────────────────────────────── */}
      {stage === 1 && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', animation:'sp-fade-in 0.4s ease-out' }}>
          {/* Deep radial glow behind logo */}
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-55%)', width:500, height:300, borderRadius:'50%', background:'radial-gradient(ellipse,rgba(88,28,220,0.55) 0%,rgba(60,10,130,0.25) 40%,transparent 70%)', filter:'blur(40px)', animation:'sp-glow-emerge 1.4s ease-out both' }} />
          {/* Neon floor glow */}
          <div style={{ position:'absolute', top:'calc(50% + 80px)', left:'50%', transform:'translateX(-50%)', height:12, background:'linear-gradient(90deg,transparent,#7c3aed,#a855f7,#7c3aed,transparent)', borderRadius:99, animation:'sp-neon-floor 1.2s ease-out 0.2s both' }} />
          {/* Logo */}
          <div style={{ animation:'sp-logo-emerge 1.2s cubic-bezier(.22,1,.36,1) 0.1s both', marginBottom:44 }}>
            <SplashLogoBox size={120} />
          </div>
          {/* Title */}
          <div style={{ display:'flex', alignItems:'baseline', gap:0, animation:'sp-title-emerge 0.8s ease-out 0.7s both', opacity:0 }}>
            <span style={{ fontSize:44, fontWeight:900, color:'#f0eeff', letterSpacing:'-1.5px', fontFamily:'Inter,system-ui,sans-serif', lineHeight:1 }}>Scale</span>
            <span style={{ fontSize:44, fontWeight:900, letterSpacing:'-1.5px', fontFamily:'Inter,system-ui,sans-serif', lineHeight:1, background:'linear-gradient(130deg,#8b5cf6 30%,#ec4899 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Flow</span>
          </div>
        </div>
      )}

      {/* ── Stage 2 – CONNEXION ──────────────────────────────────── */}
      {stage === 2 && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', animation:'sp-fade-in 0.4s ease-out' }}>
          {/* BG glow */}
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(88,28,220,0.18) 0%,transparent 65%)', filter:'blur(30px)' }} />

          {/* SVG orbit lines */}
          <svg style={{ position:'absolute', top:'50%', left:'50%', overflow:'visible', pointerEvents:'none' }} width="0" height="0">
            {SP_FEATURES.map((f, i) => {
              const rad = (f.angle - 90) * Math.PI / 180
              const R = 148
              const x2 = Math.cos(rad) * R, y2 = Math.sin(rad) * R
              return (
                <line key={i} x1="0" y1="0" x2={x2} y2={y2}
                  stroke={f.color} strokeWidth="1" strokeDasharray="120" strokeDashoffset="120" strokeOpacity="0.5"
                  style={{ animation:`sp-line-draw 0.6s ease-out ${i * 0.15}s both` }} />
              )
            })}
          </svg>

          {/* Orbit rings */}
          {[148, 148].map((r, i) => (
            <div key={i} style={{ position:'absolute', width:r*2, height:r*2, borderRadius:'50%', border:`1px solid rgba(139,92,246,${0.12 - i*0.04})`, top:'50%', left:'50%', transform:'translate(-50%,-50%)' }} />
          ))}

          {/* Feature icons */}
          {SP_FEATURES.map((f, i) => {
            const rad = (f.angle - 90) * Math.PI / 180
            const R = 148
            const x = Math.cos(rad) * R, y = Math.sin(rad) * R
            return (
              <div key={i} style={{
                position:'absolute', top:'50%', left:'50%',
                transform:`translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                animation:`sp-scale-in 0.5s cubic-bezier(.22,1,.36,1) ${0.15 + i*0.12}s both`,
              }}>
                <div style={{
                  width:46, height:46, borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center',
                  background:`linear-gradient(135deg,${f.color}22,${f.color}11)`,
                  border:`1px solid ${f.color}55`,
                  boxShadow:`0 0 18px 4px ${f.color}44`,
                  color: f.color,
                  animation:`sp-pulse-conn 2s ease-in-out ${i*0.3}s infinite`,
                  ['--c' as string]: f.color + '44',
                }}>
                  {f.icon}
                </div>
                <p style={{ textAlign:'center', fontSize:9, fontWeight:700, color:'rgba(196,181,253,0.6)', marginTop:5, letterSpacing:'0.05em', textTransform:'uppercase' }}>{f.label}</p>
              </div>
            )
          })}

          {/* Center logo */}
          <div style={{ position:'relative', zIndex:10 }}>
            <SplashLogoBox size={110} />
          </div>
        </div>
      )}

      {/* ── Stage 3 – ACCÉLÉRATION ───────────────────────────────── */}
      {stage === 3 && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', animation:'sp-fade-in 0.3s ease-out' }}>
          {/* Background intensification */}
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 80% 80% at 50% 50%,rgba(88,28,220,0.35) 0%,transparent 70%)', animation:'sp-glow-emerge 0.5s ease-out both' }} />

          {/* Neon rays */}
          {SP_RAYS.map((ray, i) => (
            <div key={i} style={{
              position:'absolute', top:'50%', left:'50%',
              transformOrigin:'left center',
              height: ray.width,
              width: ray.length,
              background:`linear-gradient(90deg,${ray.color},${ray.color}88,transparent)`,
              borderRadius:99,
              filter:`blur(${i%3===0?1.5:0.8}px)`,
              boxShadow:`0 0 6px 1px ${ray.color}66`,
              animation:`sp-ray-shoot 1.1s ease-out ${ray.delay}s both`,
              ['--a' as string]: `${ray.angle}deg`,
            }} />
          ))}

          {/* Center burst ring */}
          <div style={{ position:'absolute', top:'50%', left:'50%', width:180, height:180, marginLeft:-90, marginTop:-90, borderRadius:'50%', border:'2px solid rgba(139,92,246,0.8)', animation:'sp-center-burst 0.9s ease-out both' }} />
          <div style={{ position:'absolute', top:'50%', left:'50%', width:100, height:100, marginLeft:-50, marginTop:-50, borderRadius:'50%', border:'1.5px solid rgba(168,85,247,0.9)', animation:'sp-center-burst 0.9s ease-out 0.15s both' }} />

          {/* Logo center glow */}
          <div style={{ position:'relative', zIndex:10, animation:`sp-logo-pulse-accel 0.8s ease-in-out infinite` }}>
            <SplashLogoBox size={110} />
          </div>

          {/* Speed lines caption */}
          <div style={{ position:'absolute', bottom:80, left:'50%', transform:'translateX(-50%)', whiteSpace:'nowrap', fontSize:11, fontWeight:700, letterSpacing:'0.35em', textTransform:'uppercase', color:'rgba(139,92,246,0.55)', animation:'sp-fade-in 0.5s ease-out 0.3s both', opacity:0 }}>
            Accélération
          </div>
        </div>
      )}

      {/* ── Stage 4 – OUVERTURE ──────────────────────────────────── */}
      {stage === 4 && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', animation:'sp-fade-in 0.35s ease-out' }}>
          {/* BG glow */}
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(88,28,220,0.22) 0%,transparent 65%)', filter:'blur(50px)' }} />

          {/* Door frame */}
          <div style={{ position:'relative', width:260, height:340, overflow:'visible' }}>
            {/* Neon door outline */}
            <div style={{ position:'absolute', inset:0, border:'2px solid rgba(139,92,246,0.7)', borderRadius:12, boxShadow:'0 0 20px 4px rgba(139,92,246,0.4), inset 0 0 30px rgba(139,92,246,0.1)', animation:'sp-door-logo-in 0.5s ease-out both' }} />

            {/* Left door panel */}
            <div style={{ position:'absolute', top:0, left:0, width:'50%', height:'100%', background:'linear-gradient(90deg,rgba(5,2,20,0.95),rgba(10,4,30,0.9))', borderRadius:'12px 0 0 12px', animation:'sp-door-left 0.8s cubic-bezier(.22,1,.36,1) 0.3s both', transformOrigin:'left center' }}>
              <div style={{ position:'absolute', right:0, top:0, bottom:0, width:1, background:'linear-gradient(180deg,transparent,#7c3aed,#a855f7,transparent)', animation:'sp-door-glow 0.8s ease-out 0.3s both' }} />
            </div>
            {/* Right door panel */}
            <div style={{ position:'absolute', top:0, right:0, width:'50%', height:'100%', background:'linear-gradient(270deg,rgba(5,2,20,0.95),rgba(10,4,30,0.9))', borderRadius:'0 12px 12px 0', animation:'sp-door-right 0.8s cubic-bezier(.22,1,.36,1) 0.3s both', transformOrigin:'right center' }}>
              <div style={{ position:'absolute', left:0, top:0, bottom:0, width:1, background:'linear-gradient(180deg,transparent,#a855f7,#7c3aed,transparent)', animation:'sp-door-glow 0.8s ease-out 0.3s both' }} />
            </div>

            {/* Light burst from door center */}
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle,rgba(139,92,246,0.6) 0%,rgba(88,28,220,0.15) 40%,transparent 70%)', filter:'blur(20px)', animation:'sp-door-glow 0.7s ease-out 0.5s both', opacity:0 }} />

            {/* Logo in door center */}
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:10, animation:'sp-door-logo-in 0.5s cubic-bezier(.22,1,.36,1) 0.1s both' }}>
              <SplashLogoBox size={100} />
            </div>
          </div>

          {/* "Enter the cockpit" */}
          <div style={{ position:'absolute', bottom:90, left:'50%', transform:'translateX(-50%)', whiteSpace:'nowrap', fontSize:11, fontWeight:700, letterSpacing:'0.35em', textTransform:'uppercase', color:'rgba(196,181,253,0.5)', animation:'sp-door-title 0.5s ease-out 0.6s both', opacity:0 }}>
            Bienvenue dans ton cockpit
          </div>
        </div>
      )}

      {/* ── Stage 5 – RÉVÉLATION ─────────────────────────────────── */}
      {stage === 5 && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', animation:'sp-fade-in 0.4s ease-out' }}>
          {/* BG */}
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 70% 60% at 50% 45%,rgba(60,20,140,0.25) 0%,transparent 70%)', filter:'blur(20px)' }} />

          {/* App window mockup */}
          <div style={{
            width:480, borderRadius:16, overflow:'hidden',
            background:'linear-gradient(145deg,#08080F,#0B0B14)',
            border:'1px solid rgba(139,92,246,0.2)',
            boxShadow:'0 0 80px 20px rgba(124,58,237,0.18), 0 40px 80px rgba(0,0,0,0.8)',
            animation:'sp-ui-slide-up 0.8s cubic-bezier(.22,1,.36,1) 0.1s both, sp-ui-glow 2s ease-in-out 0.9s infinite',
          }}>
            {/* Window titlebar */}
            <div style={{ height:40, background:'rgba(255,255,255,0.03)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:26, height:26, borderRadius:8, background:'linear-gradient(135deg,#7c3aed,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <ScaleFlowLogoSVG size={18} />
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.85)' }}>ScaleFlow</span>
                <span style={{ fontSize:10, color:'rgba(34,197,94,0.8)', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:99, padding:'2px 7px', fontWeight:600 }}>● Live</span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {['#ef4444','#f59e0b','#22c55e'].map((c,i) => <div key={i} style={{ width:10, height:10, borderRadius:'50%', background:c, opacity:0.6 }} />)}
              </div>
            </div>
            {/* App content */}
            <div style={{ display:'flex', height:220 }}>
              {/* Sidebar */}
              <div style={{ width:130, background:'rgba(0,0,0,0.4)', borderRight:'1px solid rgba(255,255,255,0.05)', padding:'12px 0' }}>
                {['Tableau de bord','Téléphones','Posting','Mass Posting','Banque vidéos','Programmation','Warmup','Outils IA'].map((item, i) => (
                  <div key={i} style={{ padding:'6px 12px', fontSize:10, color: i===0 ? '#C4B5FD' : 'rgba(148,163,184,0.45)', fontWeight: i===0 ? 700 : 400, background: i===0 ? 'rgba(139,92,246,0.12)' : 'transparent', borderLeft: i===0 ? '2px solid #8B5CF6' : '2px solid transparent', display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background: i===0 ? '#8B5CF6' : 'rgba(148,163,184,0.2)' }} />
                    {item}
                  </div>
                ))}
              </div>
              {/* Main */}
              <div style={{ flex:1, padding:'14px 16px' }}>
                <p style={{ fontSize:14, fontWeight:800, color:'rgba(255,255,255,0.9)', marginBottom:4 }}>Bienvenue sur ScaleFlow 🔥</p>
                <p style={{ fontSize:9, color:'rgba(148,163,184,0.5)', marginBottom:12 }}>Prêt à faire passer ta gestion de contenu au niveau supérieur ?</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:12 }}>
                  {[['312','Téléphones','En ligne','#00ccaa'],['24','Postes programmés','Aujourd\'hui','#60a5fa'],['1 248','Vidéos','Dans la banque','#a855f7']].map(([v,l,s,c],i) => (
                    <div key={i} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'8px 10px' }}>
                      <p style={{ fontSize:16, fontWeight:900, color: c as string, lineHeight:1 }}>{v}</p>
                      <p style={{ fontSize:8, color:'rgba(148,163,184,0.7)', marginTop:2 }}>{l}</p>
                      <p style={{ fontSize:8, color: c as string, marginTop:1 }}>{s}</p>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize:9, fontWeight:600, color:'rgba(148,163,184,0.4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.1em' }}>Activité récente</p>
                {[['Post Instagram','Programmé'],['Mass Posting','Terminé'],['Remix vidéo','Terminé']].map(([a,s],i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:18, height:18, borderRadius:5, background:['rgba(139,92,246,0.2)','rgba(37,99,235,0.2)','rgba(239,68,68,0.2)'][i], display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <div style={{ width:6, height:6, borderRadius:1, background:['#a78bfa','#60a5fa','#f87171'][i] }} />
                      </div>
                      <span style={{ fontSize:9, color:'rgba(226,232,240,0.7)', fontWeight:600 }}>{a}</span>
                    </div>
                    <span style={{ fontSize:8, color:s==='Terminé'?'#34d399':'#60a5fa', background:s==='Terminé'?'rgba(52,211,153,0.1)':'rgba(96,165,250,0.1)', borderRadius:99, padding:'2px 6px' }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Caption */}
          <div style={{ position:'absolute', bottom:60, left:'50%', transform:'translateX(-50%)', whiteSpace:'nowrap', fontSize:11, fontWeight:600, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(196,181,253,0.45)', animation:'sp-fade-in 0.5s ease-out 0.5s both', opacity:0 }}>
            Ton interface. Ton cockpit.
          </div>
        </div>
      )}

      {/* ── Stage 6 – PRÊT À PERFORMER ───────────────────────────── */}
      {stage === 6 && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', animation:'sp-ready-bg 0.5s ease-out both' }}>
          {/* Wave background */}
          <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ position:'absolute', bottom: -80 + i*60, left:'-10%', right:'-10%', height:120, background:`linear-gradient(90deg,transparent,${['rgba(124,58,237,0.15)','rgba(168,85,247,0.1)','rgba(96,165,250,0.08)'][i]},transparent)`, borderRadius:'50%', filter:'blur(30px)', animation:`sp-wave ${3+i*0.7}s ease-in-out ${i*0.4}s infinite alternate` }} />
            ))}
          </div>
          {/* Deep glow */}
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:700, height:400, borderRadius:'50%', background:'radial-gradient(ellipse,rgba(88,28,220,0.2) 0%,transparent 70%)', filter:'blur(40px)' }} />

          {/* Content */}
          <div style={{ display:'flex', alignItems:'center', gap:48, zIndex:10 }}>
            {/* Logo */}
            <div style={{ animation:'sp-ready-logo 0.7s cubic-bezier(.22,1,.36,1) both', flexShrink:0 }}>
              <SplashLogoBox size={96} />
            </div>
            {/* Text */}
            <div style={{ animation:'sp-ready-title 0.7s cubic-bezier(.22,1,.36,1) 0.1s both', opacity:0 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:0, marginBottom:8 }}>
                <span style={{ fontSize:52, fontWeight:900, color:'#f0eeff', letterSpacing:'-2px', fontFamily:'Inter,system-ui,sans-serif', lineHeight:1 }}>Scale</span>
                <span style={{ fontSize:52, fontWeight:900, letterSpacing:'-2px', fontFamily:'Inter,system-ui,sans-serif', lineHeight:1, background:'linear-gradient(130deg,#8b5cf6 30%,#ec4899 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Flow</span>
              </div>
              <div style={{ animation:'sp-ready-tagline 0.6s ease-out 0.35s both', opacity:0 }}>
                {['Automatise.','Planifie.','Développe.'].map((w, i) => (
                  <span key={i} style={{ fontSize:16, fontWeight:600, color: i===0?'#a78bfa':i===1?'#818cf8':'rgba(196,181,253,0.6)', marginRight:10, animation:`sp-fade-in 0.4s ease-out ${0.5+i*0.12}s both`, display:'inline-block', opacity:0 }}>{w}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Progress bar (all stages) ────────────────────────────── */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:'rgba(255,255,255,0.04)' }}>
        <div className="sp-progress-bar" style={{ height:'100%', background:'linear-gradient(90deg,#3b82f6,#8b5cf6,#ec4899)', borderRadius:2, ['--dur' as string]:`${SPLASH_DURATION / 1000}s` }} />
      </div>
    </div>
  )
}

// ── Welcome popup (shown once per device after onboarding) ───────────────────
function BugScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[70vh] gap-6 select-none">
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <span className="text-5xl">🐛</span>
        </div>
        <div className="absolute -inset-4 rounded-[40px] opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 70%)' }} />
      </div>
      <div className="text-center space-y-2 max-w-xs">
        <p className="text-xl font-black text-white">Bug rencontré</p>
        <p className="text-sm" style={{ color: 'rgba(212,220,240,0.45)' }}>
          Cette section est temporairement indisponible.<br />Nous travaillons dessus.
        </p>
      </div>
      <div className="px-4 py-2 rounded-xl text-xs font-semibold"
        style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
        En cours de correction
      </div>
    </div>
  )
}

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
import { Scheduler }         from '@/pages/Scheduler'
import { Warmup }            from '@/pages/Warmup'
import { TextCopy }          from '@/pages/TextCopy'
import { Licences }          from '@/pages/Licences'
import { Support }           from '@/pages/Support'
import { Community }         from '@/pages/Community'
import LiveMonitorOverlay    from '@/components/LiveMonitor'

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
      case 'dashboard':    return <Dashboard   user={user} onNavigate={p => handleNavigate(p as Page)} />
      case 'phones':       return <Phones      user={user} key={refreshTick} />

      case 'posting':      return <Posting     user={user} />
      case 'massposting':  return <MassPosting user={user} />
      case 'scheduler':    return <Scheduler   user={user} onNavigate={p => handleNavigate(p as Page)} />
      case 'bank':         return <Bank        user={user} />
      case 'warmup':       return <Warmup      user={user} />
      case 'montage':      return <Montage     user={user} />
      case 'remix':        return <Remix       user={user} />
      case 'textcopy':     return <TextCopy    user={user} />
      case 'aitools':      return <AiTools     user={user} />
      case 'settings':     return <Settings    user={user} initialPanel={settingsPanel as any} />
      case 'community':    return <Community    user={user} onNavigate={handleNavigate} />
      case 'support':      return <Support      user={user} />
      case 'licences':     return <Licences    user={user} />
    }
  })()

  return (
    <LicenseContext.Provider value={license}>
    <CreditContext.Provider value={{ balance: creditBalance, loading: creditLoading, refresh: refreshCredits, ownerId: creditOwnerId }}>
      {showBeta && <BetaPopup onClose={dismissBeta} />}
      <LiveMonitorOverlay bearer={conns.bearer ?? ''} />
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
