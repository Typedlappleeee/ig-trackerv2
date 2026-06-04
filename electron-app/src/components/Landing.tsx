import { useState, useEffect, useRef } from 'react'
import { AuthPage } from '@/components/auth/AuthPage'
import { supabase } from '@/lib/supabase'

const TELEGRAM_URL = 'https://t.me/justquentin'
const LAUNCH_DATE  = new Date('2026-06-01T00:00:00')

// ── CSS Keyframes (injected once) ─────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes sf-float {
    0%,100% { transform: translateY(0px) rotate(0deg); }
    50%      { transform: translateY(-12px) rotate(0.3deg); }
  }
  @keyframes sf-float-slow {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-6px); }
  }
  @keyframes sf-fade-up {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sf-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sf-pulse-glow {
    0%,100% { box-shadow: 0 8px 32px rgba(124,58,237,0.35); }
    50%     { box-shadow: 0 8px 48px rgba(124,58,237,0.65), 0 0 80px rgba(236,72,153,0.2); }
  }
  @keyframes sf-shoot {
    0%   { transform: translateX(0) translateY(0) scaleX(0); opacity: 0; }
    5%   { opacity: 1; transform: scaleX(1); }
    90%  { opacity: 0.7; }
    100% { transform: translateX(520px) translateY(180px) scaleX(1); opacity: 0; }
  }
  @keyframes sf-orbit {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes sf-nebula {
    0%,100% { opacity: 0.5; transform: scale(1); }
    50%     { opacity: 0.75; transform: scale(1.08); }
  }
  @keyframes sf-glow-ring {
    0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
    50%     { box-shadow: 0 0 0 8px rgba(124,58,237,0.06); }
  }
  @keyframes sf-badge-pulse {
    0%,100% { border-color: rgba(239,68,68,0.16); }
    50%     { border-color: rgba(239,68,68,0.38); }
  }
  @keyframes sf-count-tick {
    0%  { transform: translateY(-6px); opacity: 0; }
    30% { transform: translateY(0);    opacity: 1; }
    100%{ transform: translateY(0);    opacity: 1; }
  }
`

function useGlobalCSS() {
  useEffect(() => {
    const id = 'sf-global-css'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id; el.textContent = GLOBAL_CSS
      document.head.appendChild(el)
    }
  }, [])
}

// ── Scroll-triggered fade-in ──────────────────────────────────────────────────
function FadeIn({ children, delay = 0, style = {} }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold: 0.1 })
    obs.observe(el); return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, animation: visible ? `sf-fade-up 0.7s ease ${delay}s both` : 'none', ...style }}>
      {children}
    </div>
  )
}

// ── Logo SVG — glowing S ──────────────────────────────────────────────────────
function SFMark({ size = 32 }: { size?: number }) {
  const id = `sfm-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}-g`} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%"   stopColor="#60aaff"/>
          <stop offset="50%"  stopColor="#8866ff"/>
          <stop offset="100%" stopColor="#aa44ff"/>
        </linearGradient>
        <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" result="b"/>
          <feColorMatrix in="b" type="matrix" values="1 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0 1  0 0 0 1 0" result="c"/>
          <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id={`${id}-bloom`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="16" result="b2"/>
          <feColorMatrix in="b2" type="matrix" values="1 0 0 0 0.3  0 0 0 0 0.15  0 0 0 0 1  0 0 0 0.5 0"/>
        </filter>
      </defs>
      {/* bloom layer */}
      <text x="100" y="148" textAnchor="middle"
        fontFamily="'Arial Rounded MT Bold','Arial Black','Helvetica Neue',Arial,sans-serif"
        fontWeight="900" fontSize="148" fill={`url(#${id}-g)`}
        filter={`url(#${id}-bloom)`}>S</text>
      {/* main S */}
      <text x="100" y="148" textAnchor="middle"
        fontFamily="'Arial Rounded MT Bold','Arial Black','Helvetica Neue',Arial,sans-serif"
        fontWeight="900" fontSize="148" fill={`url(#${id}-g)`}
        filter={`url(#${id}-glow)`}>S</text>
    </svg>
  )
}

// ── Drawn phrase ──────────────────────────────────────────────────────────────
function DrawnPhrase() {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <svg viewBox="0 0 420 52" width="420" height="52" style={{ maxWidth: '90vw', display: 'block', overflow: 'visible' }}>
        <defs>
          <filter id="rough" x="-5%" y="-20%" width="110%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03 0.06" numOctaves="3" seed="5" result="noise"/>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        </defs>
        <text x="210" y="34" textAnchor="middle"
          style={{ fontSize: 28, fontWeight: 700, fontStyle: 'italic', fill: 'rgba(196,181,253,0.82)', letterSpacing: '0.04em', fontFamily: "'Georgia','Times New Roman',serif" }}
          filter="url(#rough)">
          La révolution commence.
        </text>
        <path d="M 32,44 C 60,41 90,47 120,43 C 150,39 180,46 210,44 C 240,42 270,47 300,43 C 330,39 360,46 388,44"
          fill="none" stroke="rgba(167,139,250,0.45)" strokeWidth="1.8" strokeLinecap="round" filter="url(#rough)"/>
        <path d="M 14,26 L 16,20 L 18,26 L 24,26 L 19,30 L 21,36 L 16,32 L 11,36 L 13,30 L 8,26 Z"
          fill="none" stroke="rgba(236,72,153,0.4)" strokeWidth="1.2" strokeLinejoin="round" filter="url(#rough)"/>
        <path d="M 406,26 L 408,20 L 410,26 L 416,26 L 411,30 L 413,36 L 408,32 L 403,36 L 405,30 L 400,26 Z"
          fill="none" stroke="rgba(167,139,250,0.4)" strokeWidth="1.2" strokeLinejoin="round" filter="url(#rough)"/>
      </svg>
    </div>
  )
}

// ── Star canvas ───────────────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize(); window.addEventListener('resize', resize)
    type Star = { x: number; y: number; r: number; alpha: number; speed: number; phase: number }
    const stars: Star[] = Array.from({ length: 220 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.1 + 0.1,
      alpha: Math.random() * 0.55 + 0.07,
      speed: Math.random() * 0.006 + 0.002,
      phase: Math.random() * Math.PI * 2,
    }))
    // shooting stars
    type Shoot = { x: number; y: number; len: number; angle: number; speed: number; life: number; maxLife: number }
    const shoots: Shoot[] = []
    const spawnShoot = () => {
      shoots.push({ x: Math.random() * canvas.width * 0.7, y: Math.random() * canvas.height * 0.5, len: 80 + Math.random() * 120, angle: Math.PI / 5 + (Math.random() - 0.5) * 0.3, speed: 8 + Math.random() * 6, life: 0, maxLife: 40 + Math.random() * 20 })
    }
    let shootTimer = 0
    let frame = 0, raf: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height); frame++
      // stars
      for (const s of stars) {
        const a = s.alpha * (0.5 + 0.5 * Math.sin(s.phase + frame * s.speed))
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,190,255,${a})`; ctx.fill()
      }
      // shooting stars
      shootTimer++
      if (shootTimer > 160 + Math.random() * 120) { spawnShoot(); shootTimer = 0 }
      for (let i = shoots.length - 1; i >= 0; i--) {
        const s = shoots[i]
        const progress = s.life / s.maxLife
        const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.7 ? (1 - progress) / 0.3 : 1
        const cx = s.x + Math.cos(s.angle) * s.speed * s.life
        const cy = s.y + Math.sin(s.angle) * s.speed * s.life
        const grad = ctx.createLinearGradient(cx - Math.cos(s.angle) * s.len, cy - Math.sin(s.angle) * s.len, cx, cy)
        grad.addColorStop(0, `rgba(200,190,255,0)`)
        grad.addColorStop(1, `rgba(220,210,255,${alpha * 0.85})`)
        ctx.beginPath()
        ctx.moveTo(cx - Math.cos(s.angle) * s.len, cy - Math.sin(s.angle) * s.len)
        ctx.lineTo(cx, cy)
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.stroke()
        s.life++
        if (s.life > s.maxLife) shoots.splice(i, 1)
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.7 }} />
}

// ── Orbit decoration ──────────────────────────────────────────────────────────
function OrbitRing({ size, duration, opacity, color = 'rgba(139,92,246,0.12)', offset = 0 }: { size: number; duration: number; opacity: number; color?: string; offset?: number }) {
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', width: size, height: size, marginLeft: -size / 2 + offset, marginTop: -size / 2, borderRadius: '50%', border: `1px solid ${color}`, opacity, animation: `sf-orbit ${duration}s linear infinite`, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: -3, left: '50%', width: 6, height: 6, marginLeft: -3, borderRadius: '50%', background: color.replace('0.12', '0.6') }} />
    </div>
  )
}

// ── Auth modal ────────────────────────────────────────────────────────────────
function AuthModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 420, animation: 'sf-fade-up 0.35s ease both' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: -14, right: -14, zIndex: 10, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12121c', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(148,163,184,0.7)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        <AuthPage />
      </div>
    </div>
  )
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function useCountdown() {
  const calc = () => {
    const diff = LAUNCH_DATE.getTime() - Date.now()
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, launched: true }
    return { days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000), minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000), launched: false }
  }
  const [t, setT] = useState(calc)
  useEffect(() => { const id = setInterval(() => setT(calc()), 1000); return () => clearInterval(id) }, [])
  return t
}

function CountdownBlock() {
  const { days, hours, minutes, seconds, launched } = useCountdown()
  if (launched) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const unit = (v: number, label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 76, height: 76, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.18)', fontSize: 34, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums', animation: 'sf-glow-ring 3s ease-in-out infinite' }}>{pad(v)}</div>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(148,163,184,0.32)' }}>{label}</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, margin: '52px 0 0', animation: 'sf-fade-up 0.8s ease 0.6s both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 14px', borderRadius: 99, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.16)', animation: 'sf-badge-pulse 2.5s ease-in-out infinite' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ouverture le 1er Juin 2026</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {unit(days, 'jours')}
        <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(139,92,246,0.25)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(hours, 'heures')}
        <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(139,92,246,0.25)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(minutes, 'min')}
        <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(139,92,246,0.25)', marginTop: 20, lineHeight: 1 }}>:</span>
        {unit(seconds, 'sec')}
      </div>
    </div>
  )
}

// ── Hero mockup composition ────────────────────────────────────────────────────
function MockupFallback() {
  const panel: React.CSSProperties = {
    background: 'rgba(10,9,20,0.92)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    backdropFilter: 'blur(12px)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
  }
  const phoneScreen: React.CSSProperties = {
    width: 130, height: 220, borderRadius: 16,
    background: '#0a0910', border: '6px solid #1a1828',
    overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
    flexShrink: 0,
  }
  const ig = (color: string, label: string) => (
    <div style={{ width: '100%', height: '100%', background: `linear-gradient(160deg, ${color}22, #0a0910)`, display: 'flex', flexDirection: 'column', padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, #ec4899)` }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
      </div>
      <div style={{ flex: 1, borderRadius: 8, background: `linear-gradient(160deg, ${color}40, ${color}15)`, marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-around' }}>
        {['♥','💬','✈️','🔖'].map(ic => <span key={ic} style={{ fontSize: 11 }}>{ic}</span>)}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'relative', width: '100%', height: 560, overflow: 'hidden', borderRadius: 20 }}>
      {/* Background */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0c0918 0%, #08060f 50%, #100a1e 100%)' }} />
      <div style={{ position: 'absolute', top: '20%', left: '35%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(124,58,237,0.2), transparent)', filter: 'blur(60px)' }} />
      <div style={{ position: 'absolute', top: '40%', right: '10%', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(236,72,153,0.12), transparent)', filter: 'blur(40px)' }} />

      {/* Phone — left edge */}
      <div style={{ position: 'absolute', left: -20, top: 60, ...phoneScreen, transform: 'rotate(-6deg)' }}>
        {ig('#a78bfa', 'lifestyle.ig')}
      </div>

      {/* Nouveau post panel — left */}
      <div style={{ position: 'absolute', left: 120, top: 40, width: 230, ...panel, padding: 14, zIndex: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#F2F0FF', margin: '0 0 10px' }}>Nouveau post</p>
        <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.45)', margin: '0 0 6px' }}>Publier sur</p>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {['#7c3aed','#ec4899','#3b82f6','#34d399','#f59e0b'].map((c,i) => (
            <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: `linear-gradient(135deg,${c},${c}88)`, border: '2px solid #0a0910' }} />
          ))}
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>+</div>
        </div>
        <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.45)', margin: '0 0 6px' }}>Média</p>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {['#7c3aed','#ec4899','#3b82f6'].map((c,i) => (
            <div key={i} style={{ width: 52, height: 52, borderRadius: 8, background: `linear-gradient(135deg,${c}30,${c}10)`, border: `1px solid ${c}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎬</div>
          ))}
        </div>
        <div style={{ height: 28, borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 10, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
          <span style={{ fontSize: 9, color: 'rgba(148,163,184,0.25)' }}>Écrire une légende...</span>
        </div>
        <div style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: 'rgba(148,163,184,0.35)' }}>📅 Programmer</span>
          <span style={{ fontSize: 9, color: 'rgba(148,163,184,0.35)' }}>28/05/2024 · 18:45</span>
        </div>
        <div style={{ marginTop: 8, padding: '9px 0', borderRadius: 9, background: 'linear-gradient(130deg,#7c3aed,#ec4899)', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
          Ajouter à la file
        </div>
      </div>

      {/* Central — brand + feature grid */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#F2F0FF', marginBottom: 4 }}>ScaleFlow</div>
        <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.4)', margin: '0 0 28px' }}>Instagram Automation</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 260, margin: '0 auto' }}>
          {[
            { icon: '⚡', label: 'MASS POSTING', c: '#a78bfa' },
            { icon: '👥', label: 'MULTI-COMPTES', c: '#60a5fa' },
            { icon: '🤖', label: 'AUTOMATION', c: '#34d399' },
            { icon: '🎬', label: 'REELS & STORIES', c: '#f472b6' },
          ].map(f => (
            <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${f.c}20`, borderRadius: 10, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 16 }}>{f.icon}</span>
              <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.08em', color: f.c }}>{f.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
          {[
            { icon: '📊', label: 'ANALYTIQUES', c: '#fbbf24' },
            { icon: '⏱', label: 'GAIN DE TEMPS', c: '#4ade80' },
            { icon: '📅', label: 'SCHEDULER', c: '#e879f9' },
          ].map(f => (
            <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${f.c}20`, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14 }}>{f.icon}</span>
              <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.08em', color: f.c }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats panel — right */}
      <div style={{ position: 'absolute', right: 120, top: 50, width: 200, ...panel, padding: 14, zIndex: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#F2F0FF', margin: '0 0 14px' }}>Statistiques</p>
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.4)', margin: '0 0 3px' }}>Vue d'ensemble</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#F2F0FF', margin: 0, letterSpacing: '-0.04em' }}>128,4K</p>
          <p style={{ fontSize: 9, color: '#34d399', margin: '2px 0 0' }}>+72% ↑</p>
        </div>
        {/* Sparkline */}
        <svg width="100%" height="44" viewBox="0 0 176 44" fill="none">
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d="M0,38 L22,30 L44,34 L66,20 L88,22 L110,10 L132,14 L154,6 L176,2" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" fill="none"/>
          <path d="M0,38 L22,30 L44,34 L66,20 L88,22 L110,10 L132,14 L154,6 L176,2 L176,44 L0,44Z" fill="url(#sparkGrad)"/>
        </svg>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
          {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => (
            <span key={d} style={{ fontSize: 7, color: 'rgba(148,163,184,0.3)' }}>{d}</span>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: '#F2F0FF', margin: '0 0 8px' }}>Audience</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6"/>
              <circle cx="20" cy="20" r="16" fill="none" stroke="#7c3aed" strokeWidth="6" strokeDasharray="78 22" strokeDashoffset="25" strokeLinecap="round"/>
              <circle cx="20" cy="20" r="16" fill="none" stroke="#ec4899" strokeWidth="6" strokeDasharray="22 78" strokeDashoffset="-53" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(196,181,253,0.7)', marginBottom: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed' }} /> Non-abonnés 78%
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(244,114,182,0.7)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ec4899' }} /> Abonnés 22%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Queue panel — bottom center */}
      <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', width: 280, ...panel, padding: 12, zIndex: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#F2F0FF', margin: '0 0 8px' }}>File de publications</p>
        {[
          { label: 'Reel — Outfit of the day', time: '28 Mai 2024 à 18:45', c: '#a78bfa' },
          { label: 'Story — New collection', time: '29 Mai 2024 à 20:30', c: '#60a5fa' },
          { label: 'Reel — Lifestyle', time: '30 Mai 2024 à 12:00', c: '#34d399' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: `${item.c}18`, border: `1px solid ${item.c}25`, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: 'rgba(241,240,247,0.8)', margin: 0 }}>{item.label}</p>
              <p style={{ fontSize: 8, color: 'rgba(148,163,184,0.35)', margin: 0 }}>{item.time}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Phone — right edge */}
      <div style={{ position: 'absolute', right: -20, top: 80, ...phoneScreen, transform: 'rotate(5deg)' }}>
        {ig('#60a5fa', 'fashion.daily')}
      </div>
      {/* Phone — right bottom */}
      <div style={{ position: 'absolute', right: 60, bottom: 20, width: 100, height: 170, borderRadius: 12, background: '#0a0910', border: '5px solid #1a1828', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.7)', transform: 'rotate(-3deg)' }}>
        {ig('#34d399', 'beauty.tips')}
      </div>
    </div>
  )
}

// ── App mockup (screenshot) ───────────────────────────────────────────────────
function AppMockup() {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto', position: 'relative' }}>
      {/* outer nebula glow */}
      <div style={{ position: 'absolute', inset: '-40px', borderRadius: 40, background: 'radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.22) 0%, rgba(236,72,153,0.06) 50%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none', animation: 'sf-nebula 6s ease-in-out infinite' }} />

      {/* floating wrapper */}
      <div style={{ position: 'relative', animation: 'sf-float 7s ease-in-out infinite', transformOrigin: 'center bottom' }}>
        {!imgFailed ? (
          <img
            src="/mockup.webp"
            alt="ScaleFlow — Mass Posting UI"
            onError={() => setImgFailed(true)}
            style={{ width: '100%', height: 'auto', borderRadius: 18, border: '1px solid rgba(139,92,246,0.28)', boxShadow: '0 40px 100px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04), 0 0 80px rgba(124,58,237,0.15)', display: 'block' }}
          />
        ) : (
          <MockupFallback />
        )}
        {/* inner top shine */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, borderRadius: '18px 18px 0 0', background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)', pointerEvents: 'none' }} />
      </div>

      {/* floating stat cards */}
      <div style={{ position: 'absolute', bottom: -28, left: 24, display: 'flex', gap: 10, animation: 'sf-float-slow 5s ease-in-out infinite' }}>
        {[
          { label: 'Publiés',             value: '4/6',  color: '#22c55e' },
          { label: 'En cours',            value: '1',    color: '#a78bfa' },
          { label: 'Téléphones en ligne', value: '9/12', color: '#38bdf8' },
        ].map(c => (
          <div key={c.label} style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(8,8,18,0.92)', border: '1px solid rgba(255,255,255,0.09)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 28px rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0, boxShadow: `0 0 6px ${c.color}` }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F2F0FF' }}>{c.value}</span>
            <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)' }}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '⚡', title: 'Mass Posting',      color: '#a78bfa', text: 'Poste sur des dizaines de comptes en parallèle. Sélectionne tes vidéos, lance — chaque téléphone se ferme après sa publication.' },
  { icon: '🗂', title: 'Banque de contenu', color: '#ec4899', text: 'Organise et stocke tes vidéos dans le cloud. Import drag & drop, miniatures auto, partage par organisation.' },
  { icon: '🔀', title: 'Remix & CloneVid',  color: '#38bdf8', text: 'Génère des copies uniques via FFmpeg : zoom, couleurs, crop, overlay texte. Anti duplicate content à grande échelle.' },
  { icon: '🤖', title: 'Outils IA',         color: '#34d399', text: 'Scripts, hooks, captions virales, analyse thumbnail. Powered by Groq Llama & Claude Vision.' },
  { icon: '📅', title: 'Programmation',     color: '#fbbf24', text: "Planifie tes posts. Le scheduler s'exécute même app fermée via Supabase Edge Functions." },
  { icon: '📱', title: 'Suivi téléphones',  color: '#f472b6', text: "Status temps réel de chaque GéeLark phone, sync auto, gestion par groupes et sessions Instagram." },
]

// ── Pricing ───────────────────────────────────────────────────────────────────
type PlanFeature = { text: string; included: boolean }
interface Plan {
  name: string; icon: string; tagline: string; credits: string; creditsColor: string
  price: string; originalPrice?: string; accent: string; popular?: boolean; bestValue?: boolean
  features: PlanFeature[]
}
const PLANS: Plan[] = [
  {
    name: 'Standard', icon: '⚡', tagline: 'Pour débuter', credits: '2 500 crédits / mois', creditsColor: '#60a5fa',
    price: '49,99$', accent: '#60a5fa',
    features: [
      { text: 'Accès à tous les outils',       included: false },
      { text: 'Toutes les fonctionnalités',     included: false },
      { text: 'Mass Posting (10 comptes max)',  included: true  },
      { text: '50 téléphones max',              included: true  },
      { text: 'Support prioritaire',            included: false },
      { text: 'Remix & CloneVid',               included: false },
      { text: 'Banque vidéos + Captions',       included: true  },
    ],
  },
  {
    name: 'Pro', icon: '👑', tagline: 'Scale ton output', credits: '5 500 crédits / mois', creditsColor: '#a78bfa',
    price: '59,99$', originalPrice: '99,99$', accent: '#a78bfa', popular: true,
    features: [
      { text: 'Accès à tous les outils',       included: true  },
      { text: 'Toutes les fonctionnalités',     included: true  },
      { text: 'Mass Posting illimité',          included: true  },
      { text: '200 téléphones max',             included: true  },
      { text: 'Support prioritaire',            included: true  },
      { text: 'Remix & CloneVid',               included: true  },
      { text: 'Banque vidéos + Captions',       included: true  },
    ],
  },
  {
    name: 'Organisation', icon: '🏢', tagline: 'Puissance illimitée', credits: '11 000 crédits / mois', creditsColor: '#34d399',
    price: '89,99$', originalPrice: '149,99$', accent: '#34d399', bestValue: true,
    features: [
      { text: 'Accès à tous les outils',       included: true  },
      { text: 'Toutes les fonctionnalités',     included: true  },
      { text: 'Mass Posting illimité',          included: true  },
      { text: 'Téléphones illimités',           included: true  },
      { text: 'Support prioritaire',            included: true  },
      { text: 'Remix & CloneVid',               included: true  },
      { text: "Suggestions d'ajouts avec les devs", included: true  },
    ],
  },
]

// ── FAQ ───────────────────────────────────────────────────────────────────────
const QA = [
  { q: "C'est quoi ScaleFlow ?",          a: "Une app pour gérer en masse tes comptes Instagram : poster sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives." },
  { q: "J'ai besoin de quoi ?",           a: "Un abonnement GéeLark (cloud phones) + ton bearer token. ScaleFlow se connecte à GéeLark pour piloter tes téléphones virtuels." },
  { q: "Différence Standard vs Pro ?",   a: "Standard = 2 500 crédits/mois + outils de base. Pro = 5 500 crédits + Mass Posting illimité + organisations multi-membres + support prioritaire." },
  { q: "C'est risqué pour mes comptes ?", a: "ScaleFlow utilise GéeLark qui simule de vrais devices avec leurs propres IPs/sessions. Warmup intégré pour respecter les rythmes humains." },
  { q: "Version web ou téléchargement ?", a: "Les deux. L'Electron (.exe/.dmg) est plus rapide. La version web est accessible depuis n'importe où." },
  { q: "Comment contacter le support ?",  a: "Via Telegram (@justquentin), réponse en moins d'1h. Ou via les tickets dans l'app." },
]

// ── Divider ───────────────────────────────────────────────────────────────────
const Divider = () => <div style={{ maxWidth: 1100, margin: '0 auto', height: 1, background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.12), transparent)' }} />

// ── Telegram icon ─────────────────────────────────────────────────────────────
const TGIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
  </svg>
)

const TUNNEL_CSS = `
  @keyframes orbit-spin    { from { transform: rotate(0deg); }    to { transform: rotate(360deg); } }
  @keyframes orbit-upright { from { transform: rotate(0deg); }    to { transform: rotate(-360deg); } }
  @keyframes orbit-card-glow {
    0%,100% { box-shadow: 0 4px 18px rgba(0,0,0,0.55); }
    50%     { box-shadow: 0 4px 28px rgba(0,0,0,0.75); }
  }
  @keyframes tunnel-drift {
    0%   { transform: translateZ(0px) rotateX(0deg); }
    100% { transform: translateZ(60px) rotateX(0.4deg); }
  }
  @keyframes tunnel-card-float {
    0%,100% { opacity: var(--base-op); }
    50%      { opacity: calc(var(--base-op) + 0.08); }
  }
  @keyframes enter-btn-pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.15); }
    50%     { box-shadow: 0 0 28px 4px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.15); }
  }
  @keyframes brand-appear {
    from { opacity: 0; letter-spacing: 0.5em; filter: blur(12px); }
    to   { opacity: 1; letter-spacing: -0.03em; filter: blur(0); }
  }
  @keyframes reveal-in {
    from { opacity: 0; transform: scale(1.04); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes reveal-word {
    from { opacity: 0; transform: translateY(40px) skewY(2deg); }
    to   { opacity: 1; transform: translateY(0) skewY(0deg); }
  }
  @keyframes reveal-sub {
    from { opacity: 0; }
    to   { opacity: 0.3; }
  }
`

// ── 3D tunnel card positions ───────────────────────────────────────────────────
// Each card: left%, top%, rotateY, rotateX, translateZ, width, height, image seed, base opacity
const TUNNEL_CARDS = [
  // ── Left wall, far ──
  { x:-42, y:-26, ry: 44, rx:-8,  tz:-280, w:200, h:130, s: 10, op:0.55 },
  { x:-50, y: -4, ry: 48, rx: 0,  tz:-180, w:240, h:158, s: 20, op:0.70 },
  { x:-44, y: 18, ry: 42, rx: 8,  tz:-230, w:210, h:140, s: 30, op:0.60 },
  // ── Left wall, near ──
  { x:-58, y:-16, ry: 55, rx:-5,  tz: -60, w:280, h:190, s: 40, op:0.85 },
  { x:-62, y: 26, ry: 52, rx: 7,  tz: -90, w:260, h:172, s: 50, op:0.80 },
  // ── Left floor-ish ──
  { x:-36, y: 42, ry: 30, rx: 22, tz:-160, w:230, h:148, s: 60, op:0.65 },
  { x:-50, y: 52, ry: 38, rx: 30, tz: -80, w:270, h:170, s: 70, op:0.75 },
  // ── Right wall, far ──
  { x: 42, y:-26, ry:-44, rx:-8,  tz:-280, w:200, h:130, s: 80, op:0.55 },
  { x: 50, y: -4, ry:-48, rx: 0,  tz:-180, w:240, h:158, s:100, op:0.70 },
  { x: 44, y: 18, ry:-42, rx: 8,  tz:-230, w:210, h:140, s:110, op:0.60 },
  // ── Right wall, near ──
  { x: 58, y:-16, ry:-55, rx:-5,  tz: -60, w:280, h:190, s:120, op:0.85 },
  { x: 62, y: 26, ry:-52, rx: 7,  tz: -90, w:260, h:172, s:130, op:0.80 },
  // ── Right floor-ish ──
  { x: 36, y: 42, ry:-30, rx: 22, tz:-160, w:230, h:148, s:140, op:0.65 },
  { x: 50, y: 52, ry:-38, rx: 30, tz: -80, w:270, h:170, s:150, op:0.75 },
  // ── Top center ──
  { x: -8, y:-48, ry:  4, rx:-38, tz:-200, w:190, h:120, s:160, op:0.55 },
  { x:  6, y:-52, ry: -6, rx:-42, tz:-120, w:220, h:140, s:170, op:0.65 },
  // ── Center far ──
  { x:-10, y:-10, ry:  8, rx: 4,  tz:-380, w:170, h:110, s:180, op:0.40 },
  { x:  8, y:  6, ry: -5, rx:-3,  tz:-350, w:150, h: 96, s:190, op:0.35 },
]

// ── 3D Tunnel hero ─────────────────────────────────────────────────────────────
function TunnelHero({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const id = 'sf-tunnel-css'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id; el.textContent = TUNNEL_CSS
      document.head.appendChild(el)
    }
  }, [])

  return (
    <section style={{
      position: 'relative', height: '100vh', overflow: 'hidden',
      cursor: 'none',
      background: '#000',
      backgroundImage: [
        'linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)',
      ].join(','),
      backgroundSize: '52px 52px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Subtle radial vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.72) 100%)', pointerEvents: 'none', zIndex: 2 }} />

      {/* 3D perspective scene */}
      <div style={{
        position: 'absolute', inset: 0,
        perspective: '900px',
        perspectiveOrigin: '50% 50%',
        overflow: 'visible',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          transformStyle: 'preserve-3d',
          animation: 'tunnel-drift 8s ease-in-out infinite alternate',
        }}>
          {TUNNEL_CARDS.map((c, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `calc(50% + ${c.x}vw - ${c.w / 2}px)`,
                top:  `calc(50% + ${c.y}vh - ${c.h / 2}px)`,
                width:  c.w,
                height: c.h,
                transform: `rotateY(${c.ry}deg) rotateX(${c.rx}deg) translateZ(${c.tz}px)`,
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
                ['--base-op' as any]: c.op,
                opacity: c.op,
                animation: `tunnel-card-float ${5 + (i % 4)}s ease-in-out ${(i * 0.4) % 3}s infinite`,
                willChange: 'transform, opacity',
              }}
            >
              <img
                src={`https://picsum.photos/seed/${c.s}/${c.w * 2}/${c.h * 2}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(0.75) saturate(0.9)' }}
                loading="lazy"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Center content */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', userSelect: 'none' }}>
        <h1 style={{
          fontSize: 'clamp(64px, 11vw, 130px)',
          fontWeight: 900,
          letterSpacing: '-0.045em',
          lineHeight: 1,
          margin: '0 0 6px',
          fontFamily: "'Inter', 'Arial Black', system-ui, sans-serif",
          animation: 'brand-appear 1.2s cubic-bezier(0.16,1,0.3,1) 0.2s both',
          background: 'linear-gradient(135deg, #ffffff 0%, rgba(200,180,255,0.9) 50%, #ffffff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 40px rgba(167,139,250,0.35))',
        }}>
          ScaleFlow
        </h1>
        <p style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          margin: '0 0 48px',
          animation: 'sf-fade-in 1s ease 1s both',
          fontWeight: 500,
        }}>
          Instagram Automation
        </p>

        {/* Dot indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 40, animation: 'sf-fade-in 1s ease 1.1s both' }}>
          {[1, 0, 0].map((active, i) => (
            <div key={i} style={{ width: active ? 20 : 6, height: 6, borderRadius: 99, background: active ? '#fff' : 'rgba(255,255,255,0.2)', transition: 'width 0.3s' }} />
          ))}
        </div>

        {/* Enter button */}
        <button
          onClick={onEnter}
          style={{
            display: 'inline-block',
            padding: '13px 44px',
            borderRadius: 99,
            border: '1.5px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            animation: 'sf-fade-in 0.8s ease 1.3s both, enter-btn-pulse 3s ease-in-out 2s infinite',
            transition: 'background 0.2s, border-color 0.2s, transform 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.14)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.55)'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
            e.currentTarget.style.transform = ''
          }}
        >
          ENTER
        </button>
      </div>
    </section>
  )
}

// ── Custom cursor ─────────────────────────────────────────────────────────────
function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const pos     = useRef({ x: -100, y: -100 })
  const ring    = useRef({ x: -100, y: -100 })
  const hovering = useRef(false)

  useEffect(() => {
    let raf: number
    const onMove = (e: MouseEvent) => { pos.current = { x: e.clientX, y: e.clientY } }
    const onOver = (e: MouseEvent) => {
      hovering.current = !!(e.target as HTMLElement).closest('button, a, [role="button"]')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseover', onOver)

    const tick = () => {
      ring.current.x += (pos.current.x - ring.current.x) * 0.11
      ring.current.y += (pos.current.y - ring.current.y) * 0.11
      const scale = hovering.current ? 1.6 : 1
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x - 5}px,${pos.current.y - 5}px)`
        dotRef.current.style.opacity   = hovering.current ? '0.5' : '1'
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${ring.current.x - 18}px,${ring.current.y - 18}px) scale(${scale})`
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseover', onOver)
    }
  }, [])

  return (
    <>
      <div ref={dotRef} style={{
        position: 'fixed', top: 0, left: 0, zIndex: 99999, pointerEvents: 'none',
        width: 10, height: 10, borderRadius: '50%', background: '#fff',
        mixBlendMode: 'difference', willChange: 'transform',
      }} />
      <div ref={ringRef} style={{
        position: 'fixed', top: 0, left: 0, zIndex: 99998, pointerEvents: 'none',
        width: 36, height: 36, borderRadius: '50%',
        border: '1.5px solid rgba(255,255,255,0.6)',
        mixBlendMode: 'difference', willChange: 'transform',
        transition: 'transform 0.08s ease',
      }} />
    </>
  )
}

// ── Reveal screen — unified dark two-halves ────────────────────────────────────
function RevealScreen({ onDiscover, onStudio }: { onDiscover: () => void; onStudio: () => void }) {
  const [hoverTop, setHoverTop] = useState(false)
  const [hoverBot, setHoverBot] = useState(false)
  const [visible,  setVisible]  = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 30); return () => clearTimeout(t) }, [])

  const baseText: React.CSSProperties = {
    fontFamily: "'Inter','Arial Black','Helvetica Neue',Arial,sans-serif",
    fontWeight: 900,
    letterSpacing: '-0.045em',
    lineHeight: 0.88,
    userSelect: 'none',
    transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
  }
  const grid: React.CSSProperties = {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)',
    backgroundSize: '56px 56px',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column',
      animation: 'reveal-in 0.5s cubic-bezier(0.16,1,0.3,1) both',
      overflow: 'hidden', cursor: 'none',
      background: '#07060e',
    }}>
      {/* Shared background glow */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(124,58,237,0.1), transparent)', filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ScaleFlow label — top-left, shared */}
      <div style={{ position: 'absolute', top: 28, left: 36, zIndex: 20, display: 'flex', alignItems: 'center', gap: 8, opacity: visible ? 1 : 0, transition: 'opacity 0.5s 0.1s' }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(130deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 200 200" fill="none"><text x="100" y="148" textAnchor="middle" fontFamily="'Arial Black',sans-serif" fontWeight="900" fontSize="148" fill="#fff">S</text></svg>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>ScaleFlow</span>
      </div>

      {/* Top half — Découvrir ScaleFlow */}
      <div
        onClick={onDiscover}
        onMouseEnter={() => setHoverTop(true)}
        onMouseLeave={() => setHoverTop(false)}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hoverTop ? 'rgba(124,58,237,0.08)' : 'transparent',
          cursor: 'none', position: 'relative', overflow: 'hidden', zIndex: 1,
          transition: 'background 0.4s',
        }}
      >
        <div style={grid} />
        {hoverTop && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 70% at 50% 50%, rgba(124,58,237,0.12), transparent)', pointerEvents: 'none' }} />}

        <div style={{ textAlign: 'center', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.6s 0.12s, transform 0.6s 0.12s cubic-bezier(0.16,1,0.3,1)', position: 'relative', zIndex: 2 }}>
          <div style={{ ...baseText, fontSize: 'clamp(44px,9vw,120px)', color: '#F2F0FF', transform: hoverTop ? 'translateX(8px)' : 'none' }}>
            DÉCOUVRIR
          </div>
          <div style={{ ...baseText, fontSize: 'clamp(44px,9vw,120px)', color: 'transparent', WebkitTextStroke: '2px rgba(255,255,255,0.35)', transform: hoverTop ? 'translateX(-8px)' : 'none' }}>
            SCALEFLOW
          </div>
          <div style={{ marginTop: 18, fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
            Présentation · Fonctionnalités · Tarifs
          </div>
        </div>
        <div style={{ position: 'absolute', right: 52, fontSize: 24, color: 'rgba(255,255,255,0.2)', opacity: hoverTop ? 1 : 0, transform: hoverTop ? 'translateX(0)' : 'translateX(-12px)', transition: 'opacity 0.3s, transform 0.3s', zIndex: 2 }}>→</div>
      </div>

      {/* Divider — with gradient line */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 30%, rgba(124,58,237,0.4) 50%, rgba(255,255,255,0.12) 70%, transparent)', flexShrink: 0, zIndex: 10 }} />

      {/* Bottom half — Studio */}
      <div
        onClick={onStudio}
        onMouseEnter={() => setHoverBot(true)}
        onMouseLeave={() => setHoverBot(false)}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hoverBot ? 'rgba(236,72,153,0.05)' : 'transparent',
          cursor: 'none', position: 'relative', overflow: 'hidden', zIndex: 1,
          transition: 'background 0.4s',
        }}
      >
        <div style={grid} />
        {hoverBot && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 70% at 50% 50%, rgba(236,72,153,0.1), transparent)', pointerEvents: 'none' }} />}

        <div style={{ textAlign: 'center', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.6s 0.22s, transform 0.6s 0.22s cubic-bezier(0.16,1,0.3,1)', position: 'relative', zIndex: 2 }}>
          <div style={{ ...baseText, fontSize: 'clamp(56px,12vw,155px)', background: 'linear-gradient(130deg,#fff 0%,rgba(196,181,253,0.8) 60%,rgba(236,72,153,0.7) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', transform: hoverBot ? 'translateX(8px)' : 'none' }}>
            STUDIO
          </div>
          <div style={{ marginTop: 18, fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
            Connexion · Mass Posting · Cloud Phones
          </div>
        </div>
        <div style={{ position: 'absolute', right: 52, fontSize: 24, color: 'rgba(255,255,255,0.2)', opacity: hoverBot ? 1 : 0, transform: hoverBot ? 'translateX(0)' : 'translateX(-12px)', transition: 'opacity 0.3s, transform 0.3s', zIndex: 2 }}>→</div>
      </div>
    </div>
  )
}

// ── Orbit ring — Studio auth left panel ───────────────────────────────────────
const ORBIT_COLORS = [
  ['#c084fc','#7c3aed'], ['#f472b6','#db2777'], ['#60a5fa','#2563eb'],
  ['#34d399','#059669'], ['#fb923c','#ea580c'], ['#a78bfa','#7c3aed'],
  ['#f9a8d4','#ec4899'], ['#93c5fd','#3b82f6'], ['#6ee7b7','#10b981'],
  ['#fcd34d','#f59e0b'], ['#c4b5fd','#8b5cf6'], ['#fbcfe8','#db2777'],
  ['#bfdbfe','#3b82f6'], ['#d9f99d','#65a30d'],
]
const ORBIT_RADIUS = 190
const ORBIT_DURATION = 28

function OrbitPhoto({ index, total, color1, color2 }: { index: number; total: number; color1: string; color2: string }) {
  const angleDeg = (360 / total) * index
  const w = 72, h = 88
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      marginTop: -h / 2, marginLeft: -w / 2,
      transform: `rotate(${angleDeg}deg) translateY(-${ORBIT_RADIUS}px)`,
    }}>
      <div style={{
        width: w, height: h,
        animation: `orbit-upright ${ORBIT_DURATION}s linear infinite`,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${color1}, ${color2})`,
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* inner glow accent */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 60%)', borderRadius: 12 }} />
        {/* subtle pattern */}
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }} />
      </div>
    </div>
  )
}

// ── Studio auth — AIGNCY-style split layout ───────────────────────────────────
function StudioAuth({ onBack }: { onBack: () => void }) {
  const [tab,      setTab]      = useState<'login'|'register'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string|null>(null)
  const [success,  setSuccess]  = useState<string|null>(null)

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn)
  }, [onBack])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSuccess(null); setLoading(true)
    try {
      if (tab === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
      } else {
        if (password !== confirm) throw new Error('Les mots de passe ne correspondent pas.')
        if (password.length < 6) throw new Error('Mot de passe trop court (6 caractères min).')
        const { data, error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        if (data.user && !data.session) setSuccess('Compte créé ! Vérifie ta boîte mail.')
      }
    } catch (err: any) {
      const raw = err instanceof Error ? err.message : String(err)
      const r = raw.toLowerCase()
      setError(
        r.includes('invalid login') || r.includes('invalid credentials') ? 'Email ou mot de passe incorrect.' :
        r.includes('email not confirmed') ? 'Email non confirmé — vérifie ta boîte mail.' :
        r.includes('already registered') ? 'Un compte existe déjà avec cet email.' :
        r.includes('rate limit') ? 'Trop de tentatives. Réessaie dans quelques minutes.' :
        raw
      )
    } finally { setLoading(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 10,
    color: '#F2F0FF',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex',
      animation: 'reveal-in 0.45s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      {/* ── Left panel — Orbit ─────────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 55%',
        background: '#05030f',
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Subtle grid */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.035, backgroundImage: 'linear-gradient(rgba(139,92,246,1) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,1) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />
        {/* Nebula glow */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(109,40,217,0.18), transparent)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        {/* Orbit container */}
        <div style={{
          position: 'relative', width: ORBIT_RADIUS * 2 + 80, height: ORBIT_RADIUS * 2 + 80,
          animation: `orbit-spin ${ORBIT_DURATION}s linear infinite`,
          flexShrink: 0,
        }}>
          {ORBIT_COLORS.map((c, i) => (
            <OrbitPhoto key={i} index={i} total={ORBIT_COLORS.length} color1={c[0]} color2={c[1]} />
          ))}
        </div>

        {/* Center text (stays fixed, not in orbit container) */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none', zIndex: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.6)', margin: '0 0 12px' }}>ScaleFlow</p>
          <div style={{ fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 0.92, fontFamily: "'Inter','Arial Black',sans-serif" }}>
            <div>Poste.</div>
            <div>Automatise.</div>
            <div style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Scale.</div>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', margin: '14px 0 0', letterSpacing: '0.02em' }}>
            Automatisation Instagram à grande échelle.
          </p>
        </div>

        {/* Back button */}
        <button onClick={onBack} style={{ position: 'absolute', top: 24, left: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(148,163,184,0.6)', fontSize: 12, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.06em', transition: 'background 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
          ← Retour
        </button>
      </div>

      {/* ── Right panel — Form ─────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        background: '#08060f',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
        overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, marginBottom: 32, border: '1px solid rgba(255,255,255,0.07)' }}>
            {(['login','register'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(null); setSuccess(null); setPassword(''); setConfirm('') }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 7, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  ...(tab === t
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 12px rgba(124,58,237,0.4)' }
                    : { background: 'transparent', color: 'rgba(148,163,184,0.5)' }
                  ),
                }}>
                {t === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: '#F2F0FF', margin: '0 0 6px', letterSpacing: '-0.03em' }}>
              {tab === 'login' ? 'Welcome back' : 'Créer un compte'}
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)', margin: 0 }}>
              {tab === 'login' ? 'Connecte-toi à ton compte ScaleFlow.' : 'Rejoins ScaleFlow en quelques secondes.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)', marginBottom: 7 }}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')} />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)' }}>Password</label>
              </div>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.4)', fontSize: 16, padding: 0 }}>
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {tab === 'register' && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)', marginBottom: 7 }}>Confirmer</label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••" style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')} />
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(240,61,85,0.08)', border: '1px solid rgba(240,61,85,0.22)', color: '#f87171', fontSize: 13, display: 'flex', gap: 8 }}>
                <span style={{ flexShrink: 0 }}>⚠</span><span>{error}</span>
              </div>
            )}
            {success && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.22)', color: '#34d399', fontSize: 13, display: 'flex', gap: 8 }}>
                <span style={{ flexShrink: 0 }}>✓</span><span>{success}</span>
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 10, border: 'none', cursor: loading ? 'wait' : 'pointer',
                background: loading ? 'rgba(124,58,237,0.5)' : 'linear-gradient(130deg,#7c3aed,#ec4899)',
                color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: '0.02em',
                boxShadow: '0 4px 20px rgba(124,58,237,0.35)', marginTop: 4,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              {loading ? '...' : tab === 'login' ? 'Sign In' : 'Créer mon compte'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'rgba(148,163,184,0.35)' }}>
            {tab === 'login' ? "Pas encore de compte ? " : "Déjà un compte ? "}
            <button onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setError(null); setPassword(''); setConfirm('') }}
              style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 12, cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', padding: 0 }}>
              {tab === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function Landing() {
  const [stage,    setStage]   = useState<'tunnel' | 'reveal' | 'site' | 'studio'>('tunnel')
  const [showAuth, setShowAuth] = useState(false)
  const [faqOpen, setFaqOpen]   = useState<number | null>(null)
  useGlobalCSS()

  // Lock body scroll while not on the main site
  useEffect(() => {
    document.body.style.overflow = stage === 'site' ? '' : 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [stage])

  return (
    <div style={{ minHeight: '100vh', background: '#06060f', color: '#F2F0FF', overflowX: 'hidden', fontFamily: "'Inter', system-ui, sans-serif", cursor: stage === 'site' ? 'auto' : 'none' }}>
      {stage !== 'site' && <CustomCursor />}
      <StarField />


      {/* Nebula glows — animated */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-15%', left: '30%', width: 1000, height: 1000, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(109,40,217,0.13), transparent)', filter: 'blur(50px)', animation: 'sf-nebula 8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '40%', right: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(236,72,153,0.08), transparent)', filter: 'blur(50px)', animation: 'sf-nebula 11s ease-in-out infinite 2s' }} />
        <div style={{ position: 'absolute', bottom: '5%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(56,189,248,0.05), transparent)', filter: 'blur(50px)', animation: 'sf-nebula 14s ease-in-out infinite 4s' }} />
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {stage === 'reveal' && (
        <RevealScreen
          onDiscover={() => { setStage('site'); setTimeout(() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }), 250) }}
          onStudio={() => setStage('studio')}
        />
      )}
      {stage === 'studio' && <StudioAuth onBack={() => setStage('reveal')} />}

      {/* ── Tunnel intro (full screen) ───────────────────────────────────────── */}
      <TunnelHero onEnter={() => setStage('reveal')} />

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(6,6,15,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <SFMark size={28} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.3px' }}>ScaleFlow</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {[['#features','Fonctionnalités'], ['#pricing','Tarifs'], ['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 13, color: 'rgba(148,163,184,0.55)', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F2F0FF')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.55)')}>
                {label}
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#F2F0FF', textDecoration: 'none', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
              <TGIcon /> Acheter une clé
            </a>
            <button onClick={() => setShowAuth(true)}
              style={{ padding: '7px 16px', borderRadius: 9, background: 'linear-gradient(130deg,#7c3aed,#a855f7)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s', animation: 'sf-pulse-glow 3s ease-in-out infinite' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Se connecter →
            </button>
          </div>
        </div>
      </nav>

      {/* ── App mockup ───────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px 100px' }}>
        <FadeIn>
          <AppMockup />
        </FadeIn>
      </section>

      <Divider />

      {/* ── Features ──────────────────────────────────────────────────────────── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '90px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>Tout pour scaler</p>
              <h2 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 16px', color: '#F2F0FF' }}>
                Une seule app,{' '}
                <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout dedans.</span>
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(148,163,184,0.5)', maxWidth: 460, margin: '0 auto' }}>Plus besoin de jongler entre 10 outils différents.</p>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
            {FEATURES.map((f, i) => (
              <FadeIn key={f.title} delay={i * 0.07}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: '22px', height: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${f.color}35`; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 16px 40px rgba(0,0,0,0.3)` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `${f.color}10`, border: `1px solid ${f.color}20` }}>{f.icon}</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', margin: '0 0 7px' }}>{f.title}</p>
                  <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', margin: 0, lineHeight: 1.65 }}>{f.text}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Telegram CTA ─────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <FadeIn>
          <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ borderRadius: 22, padding: '48px 36px', background: 'linear-gradient(135deg,rgba(124,58,237,0.08),rgba(236,72,153,0.05))', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 0 60px rgba(124,58,237,0.07)', transition: 'border-color 0.3s, box-shadow 0.3s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)'; e.currentTarget.style.boxShadow = '0 0 80px rgba(124,58,237,0.14)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'; e.currentTarget.style.boxShadow = '0 0 60px rgba(124,58,237,0.07)' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(130deg,rgba(124,58,237,0.2),rgba(236,72,153,0.15))', border: '1px solid rgba(139,92,246,0.3)' }}>
                <TGIcon size={24} />
              </div>
              <h3 style={{ fontSize: 26, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.03em', margin: '0 0 10px' }}>Acheter une clé ScaleFlow</h3>
              <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.5)', margin: '0 0 28px', lineHeight: 1.6 }}>Activation immédiate après paiement.<br />Paiement via Telegram — crypto ou virement.</p>
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '14px 32px', borderRadius: 12, background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', fontSize: 15, fontWeight: 800, textDecoration: 'none', animation: 'sf-pulse-glow 3s ease-in-out infinite', transition: 'opacity 0.15s, transform 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = '' }}>
                <TGIcon size={16} /> Rejoindre sur Telegram
              </a>
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.28)', marginTop: 18 }}>Réponse en moins d'1h · Support inclus avec chaque plan</p>
            </div>
          </div>
        </FadeIn>
      </section>

      <Divider />

      {/* ── Pricing ───────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>Tarifs</p>
              <h2 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', color: '#F2F0FF' }}>
                Choisis ton{' '}
                <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>plan.</span>
              </h2>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '7px 18px', borderRadius: 99, background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)' }}>
                <span style={{ fontSize: 14 }}>🔥</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#fb923c' }}>-40% sur Pro & Organisation jusqu'au 1er juillet</span>
              </div>
            </div>
          </FadeIn>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
            {PLANS.map((p, i) => (
              <FadeIn key={p.name} delay={i * 0.1}>
                <div
                  style={{
                    position: 'relative',
                    background: p.popular ? 'rgba(124,58,237,0.06)' : p.bestValue ? 'rgba(52,211,153,0.04)' : '#0b0b15',
                    borderRadius: 20,
                    border: p.popular ? '1.5px solid rgba(124,58,237,0.35)' : p.bestValue ? '1.5px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.07)',
                    display: 'flex', flexDirection: 'column',
                    boxSizing: 'border-box',
                    boxShadow: p.popular ? '0 0 60px rgba(124,58,237,0.12)' : p.bestValue ? '0 0 60px rgba(52,211,153,0.08)' : 'none',
                    overflow: 'hidden',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; if (!p.popular && !p.bestValue) e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = p.popular ? '0 0 60px rgba(124,58,237,0.12)' : p.bestValue ? '0 0 60px rgba(52,211,153,0.08)' : 'none' }}
                >
                  {/* Badge */}
                  {(p.popular || p.bestValue) && (
                    <div style={{ background: p.popular ? 'linear-gradient(90deg,#7c3aed,#a855f7)' : 'linear-gradient(90deg,#059669,#34d399)', padding: '6px 0', textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.15em', color: '#fff' }}>
                      {p.popular ? 'MOST POPULAR' : 'BEST VALUE'}
                    </div>
                  )}

                  <div style={{ padding: '24px 24px 28px' }}>
                    {/* Plan header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `${p.accent}12`, border: `1px solid ${p.accent}25`, flexShrink: 0 }}>
                        {p.icon}
                      </div>
                      <div>
                        <p style={{ fontSize: 16, fontWeight: 800, color: '#F2F0FF', margin: 0, letterSpacing: '-0.02em' }}>{p.name}</p>
                        <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', margin: 0 }}>{p.tagline}</p>
                      </div>
                    </div>

                    {/* Credits badge */}
                    <div style={{ background: `${p.creditsColor}12`, border: `1px solid ${p.creditsColor}25`, borderRadius: 8, padding: '7px 12px', marginBottom: 20, display: 'inline-block' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: p.creditsColor }}>{p.credits}</span>
                    </div>

                    {/* Price */}
                    <div style={{ marginBottom: 24 }}>
                      {p.originalPrice && <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.3)', textDecoration: 'line-through', marginBottom: 2 }}>{p.originalPrice} /mois</div>}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 42, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.04em', lineHeight: 1 }}>{p.price}</span>
                        <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)' }}>/mois</span>
                      </div>
                    </div>

                    {/* Features */}
                    <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {p.features.map(f => (
                        <li key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                          {f.included ? (
                            <span style={{ width: 18, height: 18, borderRadius: 5, background: `${p.accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke={p.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          ) : (
                            <span style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </span>
                          )}
                          <span style={{ color: f.included ? 'rgba(241,240,247,0.75)' : 'rgba(148,163,184,0.3)', textDecoration: f.included ? 'none' : 'line-through' }}>{f.text}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                        textDecoration: 'none', transition: 'opacity 0.15s, transform 0.15s',
                        ...(p.popular
                          ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }
                          : p.bestValue
                          ? { background: 'linear-gradient(130deg,#059669,#34d399)', color: '#fff', boxShadow: '0 4px 20px rgba(52,211,153,0.25)' }
                          : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F2F0FF' }
                        ),
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = '' }}>
                      Get Started →
                    </a>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(148,163,184,0.22)', marginTop: 28 }}>All plans require activation via Telegram · Crypto or bank transfer · Immediate activation</p>
        </div>
      </section>

      <Divider />

      {/* ── FAQ ───────────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>FAQ</p>
              <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0, color: '#F2F0FF' }}>
                On répond à{' '}
                <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout.</span>
              </h2>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {QA.map((item, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)')}>
                  <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: '100%', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#F2F0FF' }}>{item.q}</span>
                    <span style={{ color: 'rgba(167,139,250,0.45)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'transform 0.25s', display: 'inline-block', transform: faqOpen === i ? 'rotate(45deg)' : 'none' }}>+</span>
                  </button>
                  {faqOpen === i && (
                    <div style={{ padding: '0 18px 16px', fontSize: 13, color: 'rgba(148,163,184,0.55)', lineHeight: 1.7, animation: 'sf-fade-up 0.25s ease both' }}>
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      <Divider />

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 1, padding: '32px 24px 44px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><SFMark size={26} /><span style={{ fontSize: 15, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.3px' }}>ScaleFlow</span></div>
            <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
              {[['#features','Fonctionnalités'], ['#pricing','Tarifs'], ['#faq','FAQ'], [TELEGRAM_URL,'Telegram']].map(([href, label]) => (
                <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                  style={{ color: 'rgba(148,163,184,0.35)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.75)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.35)')}>
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.22)', margin: 0 }}>© {new Date().getFullYear()} ScaleFlow. Tous droits réservés.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <DrawnPhrase />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
