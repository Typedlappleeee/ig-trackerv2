import { useState, useEffect, useRef } from 'react'
import { AuthPage } from '@/components/auth/AuthPage'
import { supabase } from '@/lib/supabase'

const TELEGRAM_URL = 'https://t.me/justquentin'
const LAUNCH_DATE  = new Date('2026-06-01T00:00:00')

const REEL_PHOTOS = [
  '/reels/reel-1.png',
  '/reels/reel-2.png',
  '/reels/reel-3.png',
  '/reels/reel-4.png',
  '/reels/reel-5.png',
]

// ── Lucide-style inline icon set ──────────────────────────────────────────────
// Single reusable helper — maps a name to clean SVG paths (stroke-based, color
// inherited via currentColor). Decorative by default (aria-hidden); pass a label
// for icon-only buttons.
type IconName =
  | 'zap' | 'send' | 'users' | 'bot' | 'clapperboard' | 'bar-chart-3'
  | 'calendar' | 'timer' | 'folder-archive' | 'shuffle' | 'smartphone'
  | 'crown' | 'building-2' | 'eye' | 'eye-off' | 'alert-triangle' | 'check'

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  zap:              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />,
  send:            (<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>),
  users:           (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  bot:             (<><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></>),
  clapperboard:    (<><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>),
  'bar-chart-3':   (<><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>),
  calendar:        (<><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>),
  timer:           (<><path d="M10 2h4" /><path d="M12 14v-4" /><circle cx="12" cy="14" r="8" /></>),
  'folder-archive':(<><circle cx="15" cy="19" r="2" /><path d="M20.9 19.8A2 2 0 0 0 22 18V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11" /><path d="M15 11v-1" /><path d="M15 17v-2" /></>),
  shuffle:         (<><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" /><path d="m18 2 4 4-4 4" /><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" /><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" /><path d="m18 14 4 4-4 4" /></>),
  smartphone:      (<><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></>),
  crown:           (<><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.52l4.276 3.664a1 1 0 0 0 1.516-.294z" /><path d="M5 21h14" /></>),
  'building-2':    (<><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></>),
  eye:             (<><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></>),
  'eye-off':       (<><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></>),
  'alert-triangle':(<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>),
  check:            <path d="M20 6 9 17l-5-5" />,
}

function Icon({ name, size = 16, label, style }: { name: IconName; size?: number; label?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

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
          <span style={{ fontSize: 9, color: 'rgba(148,163,184,0.35)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={10} /> Programmer</span>
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
            { iconName: 'zap' as IconName, label: 'MASS POSTING', c: '#a78bfa' },
            { iconName: 'users' as IconName, label: 'MULTI-COMPTES', c: '#60a5fa' },
            { iconName: 'bot' as IconName, label: 'AUTOMATION', c: '#34d399' },
            { iconName: 'clapperboard' as IconName, label: 'REELS & STORIES', c: '#f472b6' },
          ].map(f => (
            <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${f.c}20`, borderRadius: 10, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <span style={{ color: f.c, display: 'flex' }}><Icon name={f.iconName} size={16} /></span>
              <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.08em', color: f.c }}>{f.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
          {[
            { iconName: 'bar-chart-3' as IconName, label: 'ANALYTIQUES', c: '#fbbf24' },
            { iconName: 'timer' as IconName, label: 'GAIN DE TEMPS', c: '#4ade80' },
            { iconName: 'calendar' as IconName, label: 'SCHEDULER', c: '#e879f9' },
          ].map(f => (
            <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${f.c}20`, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ color: f.c, display: 'flex' }}><Icon name={f.iconName} size={14} /></span>
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

// ── Site hero (discover page full-screen marketing hero) ──────────────────────
function SiteHero({ onStudio }: { onStudio: () => void }) {
  const CARDS = [
    { x: -32, y: -22, rot: -8,  views: '870K', g1: '#c084fc', g2: '#7c3aed', seed: 0 },
    { x:  -8, y: -28, rot: -2,  views: '680K', g1: '#f472b6', g2: '#db2777', seed: 1 },
    { x:  24, y: -20, rot:  6,  views: '1.1M', g1: '#60a5fa', g2: '#2563eb', seed: 2 },
    { x: -26, y:  20, rot: -5,  views: '920K', g1: '#4ade80', g2: '#16a34a', seed: 3 },
    { x:  30, y:  16, rot:  7,  views: '990K', g1: '#fb923c', g2: '#ea580c', seed: 4 },
  ]
  const cW = 130, cH = 185

  return (
    <section style={{ position: 'relative', height: 'calc(100vh - 60px)', overflow: 'hidden', background: '#06050f' }}>
      {/* Purple glow */}
      <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(109,40,217,0.16), transparent)', filter: 'blur(80px)', pointerEvents: 'none' }} />

      {/* Floating phone cards */}
      {CARDS.map((c, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `calc(50% + ${c.x}% - ${cW / 2}px)`,
          top: `calc(50% + ${c.y}% - ${cH / 2}px)`,
          width: cW, height: cH,
          transform: `rotate(${c.rot}deg)`,
          borderRadius: 18, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
          animation: `sf-float ${4.5 + i * 0.6}s ease-in-out ${i * 0.9}s infinite`,
          zIndex: 2,
        }}>
          <img src={REEL_PHOTOS[i]} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '78%', objectFit: 'cover', display: 'block' }} loading="lazy" />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '78%', background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, transparent 40%, rgba(0,0,0,0.18) 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 10px', background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="rgba(255,255,255,0.8)"><path d="M8 5v14l11-7z"/></svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{c.views}</span>
          </div>
          <div style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'rgba(255,255,255,0.55)' }}>✕</div>
        </div>
      ))}

      {/* Instagram icon — top left */}
      <div style={{ position: 'absolute', top: '12%', left: '8%', width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 40px rgba(253,29,29,0.35),0 4px 12px rgba(0,0,0,0.5)', animation: 'sf-float-slow 5s ease-in-out infinite', zIndex: 3 }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
      </div>

      {/* Telegram — bottom left */}
      <div style={{ position: 'absolute', bottom: '16%', left: '6%', width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg,#229ED9,#1a7ab5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 40px rgba(34,158,217,0.3),0 4px 12px rgba(0,0,0,0.5)', animation: 'sf-float-slow 6s ease-in-out 1.2s infinite', zIndex: 3 }}>
        <svg viewBox="0 0 24 24" width="30" height="30" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/></svg>
      </div>

      {/* Video icon — top right */}
      <div style={{ position: 'absolute', top: '14%', right: '10%', width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg,#1d4ed8,#60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 40px rgba(59,130,246,0.3),0 4px 12px rgba(0,0,0,0.5)', animation: 'sf-float-slow 5.5s ease-in-out 2s infinite', zIndex: 3 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
      </div>

      {/* Rocket — bottom right */}
      <div style={{ position: 'absolute', bottom: '18%', right: '8%', width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 40px rgba(124,58,237,0.3),0 4px 12px rgba(0,0,0,0.5)', animation: 'sf-float-slow 7s ease-in-out 0.5s infinite', zIndex: 3, fontSize: 28 }}>🚀</div>

      {/* Center content */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', zIndex: 10, width: '100%', maxWidth: 700, padding: '0 24px', boxSizing: 'border-box' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 16px', borderRadius: 99, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.22)', marginBottom: 22, animation: 'sf-fade-up 0.6s ease both' }}>
          <span style={{ color: 'rgba(196,181,253,0.9)', display: 'flex' }}><Icon name="zap" size={13} /></span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(196,181,253,0.8)', textTransform: 'uppercase' }}>Automatise · Gagne du Temps · Scale</span>
        </div>
        <div style={{ fontSize: 'clamp(58px,9vw,102px)', fontWeight: 900, letterSpacing: '-0.045em', color: '#F2F0FF', lineHeight: 0.88, fontFamily: "'Inter','Arial Black',sans-serif", animation: 'sf-fade-up 0.6s ease 0.08s both', filter: 'drop-shadow(0 0 50px rgba(167,139,250,0.22))' }}>ScaleFlow</div>
        <div style={{ marginTop: 18, fontSize: 'clamp(17px,2.2vw,24px)', fontWeight: 800, color: 'rgba(241,240,247,0.88)', lineHeight: 1.2, animation: 'sf-fade-up 0.6s ease 0.15s both' }}>L'automatisation Instagram à grande échelle.</div>
        <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.48)', margin: '12px auto 28px', lineHeight: 1.65, maxWidth: 440, animation: 'sf-fade-up 0.6s ease 0.22s both' }}>
          Mass posting, multi-comptes, planification avancée,<br />reels & stories et bien plus.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', animation: 'sf-fade-up 0.6s ease 0.3s both' }}>
          <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F2F0FF', fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'background 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.11)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
            <TGIcon size={14} /> Acheter une clé
          </a>
          <button onClick={onStudio}
            style={{ padding: '13px 26px', borderRadius: 10, background: 'linear-gradient(130deg,#7c3aed,#ec4899)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s', boxShadow: '0 6px 24px rgba(124,58,237,0.35)' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            Se connecter →
          </button>
        </div>
      </div>

      {/* Bottom feature strip */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '14px 0', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.06)', zIndex: 5 }}>
        {[
          { iconName: 'send' as IconName, label: 'MASS POSTING' },
          { iconName: 'users' as IconName, label: 'MULTI-COMPTES' },
          { iconName: 'bot' as IconName, label: 'AUTOMATISATION AVANCÉE' },
          { iconName: 'clapperboard' as IconName, label: 'REELS & STORIES' },
        ].map((f, i, a) => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 28px', borderRight: i < a.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
            <span style={{ color: 'rgba(196,181,253,0.6)', display: 'flex' }}><Icon name={f.iconName} size={14} /></span>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.11em', color: 'rgba(196,181,253,0.5)', textTransform: 'uppercase' }}>{f.label}</span>
          </div>
        ))}
      </div>
    </section>
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
const FEATURES: { iconName: IconName; title: string; color: string; text: string }[] = [
  { iconName: 'zap',            title: 'Mass Posting',      color: '#a78bfa', text: 'Poste sur des dizaines de comptes en parallèle. Sélectionne tes vidéos, lance — chaque téléphone se ferme après sa publication.' },
  { iconName: 'folder-archive', title: 'Banque de contenu', color: '#ec4899', text: 'Organise et stocke tes vidéos dans le cloud. Import drag & drop, miniatures auto, partage par organisation.' },
  { iconName: 'shuffle',        title: 'Remix & CloneVid',  color: '#38bdf8', text: 'Génère des copies uniques via FFmpeg : zoom, couleurs, crop, overlay texte. Anti duplicate content à grande échelle.' },
  { iconName: 'bot',            title: 'Outils IA',         color: '#34d399', text: 'Scripts, hooks, captions virales, analyse thumbnail. Powered by Groq Llama & Claude Vision.' },
  { iconName: 'calendar',       title: 'Programmation',     color: '#fbbf24', text: "Planifie tes posts. Le scheduler s'exécute même app fermée via Supabase Edge Functions." },
  { iconName: 'smartphone',     title: 'Suivi téléphones',  color: '#f472b6', text: "Status temps réel de chaque GéeLark phone, sync auto, gestion par groupes et sessions Instagram." },
]

// ── Pricing ───────────────────────────────────────────────────────────────────
type PlanFeature = { text: string; included: boolean }
interface PlanDef {
  name: string; tagline: string; iconName: IconName
  credits: string; creditsColor: string; accent: string
  monthlyPrice: string; yearlyPrice: string
  originalMonthly: string; discount: string; yearlyBilled: string
  popular?: boolean; bestValue?: boolean
  btnLabel: string
  features: PlanFeature[]
}
const PLANS: PlanDef[] = [
  {
    name: 'Standard', tagline: 'Pour débuter', iconName: 'zap',
    credits: '2 500 crédits / mois', creditsColor: '#60a5fa', accent: '#3b82f6',
    monthlyPrice: '49,99$', yearlyPrice: '49,99$',
    originalMonthly: '', discount: '', yearlyBilled: '',
    btnLabel: "S'abonner à Standard",
    features: [
      { text: 'Accès aux outils de base',       included: true  },
      { text: 'Fonctionnalités sélectives',      included: true  },
      { text: 'Mass Posting (10 comptes max)',   included: true  },
      { text: 'Support prioritaire',             included: false },
      { text: 'Remix & CloneVid',                included: false },
      { text: 'Organisations multi-membres',     included: false },
    ],
  },
  {
    name: 'Pro', tagline: 'Scale ton output', iconName: 'crown',
    credits: '5 500 crédits / mois', creditsColor: '#a78bfa', accent: '#7c3aed',
    monthlyPrice: '99,99$', yearlyPrice: '59,99$',
    originalMonthly: '99,99$', discount: '40% OFF', yearlyBilled: '719,88$ facturé annuellement',
    popular: true,
    btnLabel: "S'abonner à Pro",
    features: [
      { text: 'Accès à tous les outils',         included: true  },
      { text: 'Toutes les fonctionnalités',       included: true  },
      { text: 'Mass Posting illimité',            included: true  },
      { text: 'Support prioritaire',              included: true  },
      { text: 'Remix & CloneVid',                 included: true  },
      { text: 'Organisations multi-membres',      included: false },
    ],
  },
  {
    name: 'Organisation', tagline: 'Puissance illimitée', iconName: 'building-2',
    credits: '11 000 crédits / mois', creditsColor: '#f59e0b', accent: '#f59e0b',
    monthlyPrice: '149,99$', yearlyPrice: '89,99$',
    originalMonthly: '149,99$', discount: '40% OFF', yearlyBilled: '1 079,88$ facturé annuellement',
    bestValue: true,
    btnLabel: "S'abonner à Organisation",
    features: [
      { text: 'Accès à tous les outils',         included: true  },
      { text: 'Toutes les fonctionnalités',       included: true  },
      { text: 'Mass Posting illimité',            included: true  },
      { text: 'Support prioritaire',              included: true  },
      { text: 'Remix & CloneVid',                 included: true  },
      { text: 'Organisations multi-membres',      included: true  },
    ],
  },
]

const CREDIT_PACKS = [
  { name: 'Mini Pack',  credits: '1 000',  price: '19$',   popular: false, bestValue: false },
  { name: 'Mega Pack',  credits: '5 000',  price: '79$',   popular: true,  bestValue: false },
  { name: 'Giga Pack',  credits: '15 000', price: '179$',  popular: false, bestValue: false },
  { name: 'Ultra Pack', credits: '50 000', price: '499$',  popular: false, bestValue: true  },
]

// ── Pricing section component (needs local state for toggle) ────────────────
function PricingSection() {
  const [yearly, setYearly] = useState(true)

  return (
    <section id="pricing" style={{ position: 'relative', zIndex: 1, padding: '80px 24px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>

        {/* Header */}
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 12px' }}>Tarifs</p>
            <h2 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 28px', color: '#F2F0FF' }}>
              Choisis ton{' '}
              <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>plan.</span>
            </h2>
            {/* Billing toggle */}
            <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 99, padding: 4, gap: 2 }}>
              <button onClick={() => setYearly(false)} style={{ padding: '7px 22px', borderRadius: 99, fontSize: 13, fontWeight: 600, background: !yearly ? 'rgba(255,255,255,0.1)' : 'transparent', color: !yearly ? '#ffffff' : 'rgba(148,163,184,0.55)', border: 'none', cursor: 'pointer', transition: 'all 0.18s' }}>
                Mensuel
              </button>
              <button onClick={() => setYearly(true)} style={{ padding: '7px 22px', borderRadius: 99, fontSize: 13, fontWeight: 600, background: yearly ? 'rgba(255,255,255,0.1)' : 'transparent', color: yearly ? '#ffffff' : 'rgba(148,163,184,0.55)', border: 'none', cursor: 'pointer', transition: 'all 0.18s', display: 'flex', alignItems: 'center', gap: 8 }}>
                Annuel
                <span style={{ fontSize: 10, fontWeight: 700, background: 'linear-gradient(90deg,#22d3ee,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', border: '1px solid rgba(34,211,238,0.3)', padding: '1px 7px', borderRadius: 99 }}>
                  Économise
                </span>
              </button>
            </div>
          </div>
        </FadeIn>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 80 }}>
          {PLANS.map((p, i) => (
            <FadeIn key={p.name} delay={i * 0.08}>
              <div
                style={{
                  position: 'relative',
                  background: p.popular ? '#0d0b1e' : p.bestValue ? '#0c100a' : '#0b0b15',
                  borderRadius: 18,
                  border: p.popular ? '1.5px solid rgba(124,58,237,0.45)' : p.bestValue ? '1.5px solid rgba(245,158,11,0.45)' : '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', flexDirection: 'column',
                  overflow: 'hidden',
                  boxShadow: p.popular ? '0 0 60px rgba(124,58,237,0.14),0 20px 60px rgba(0,0,0,0.6)' : p.bestValue ? '0 0 60px rgba(245,158,11,0.08),0 20px 60px rgba(0,0,0,0.6)' : '0 20px 60px rgba(0,0,0,0.4)',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = '' }}
              >
                {p.popular && <div style={{ background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', padding: '7px 0', textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#fff' }}>MOST POPULAR</div>}
                {p.bestValue && <div style={{ background: 'linear-gradient(90deg,#d97706,#f59e0b)', padding: '7px 0', textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#fff' }}>BEST VALUE</div>}

                <div style={{ padding: '22px 22px 26px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  {/* Icon + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: p.popular ? 'rgba(124,58,237,0.15)' : p.bestValue ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.1)', border: `1px solid ${p.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.accent }}>
                      <Icon name={p.iconName} size={20} />
                    </div>
                    <div>
                      <p style={{ fontSize: 17, fontWeight: 800, color: '#F2F0FF', margin: 0, letterSpacing: '-0.02em' }}>{p.name}</p>
                      <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', margin: 0, marginTop: 1 }}>{p.tagline}</p>
                    </div>
                  </div>

                  {/* Credits badge */}
                  <div style={{ display: 'inline-block', marginBottom: 18, background: `${p.accent}18`, border: `1px solid ${p.accent}30`, borderRadius: 8, padding: '5px 12px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: p.creditsColor }}>{p.credits}</span>
                  </div>

                  {/* Price row */}
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      {yearly && p.originalMonthly && <span style={{ fontSize: 14, color: 'rgba(148,163,184,0.35)', textDecoration: 'line-through' }}>{p.originalMonthly}</span>}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontSize: 40, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.04em', lineHeight: 1 }}>{yearly ? p.yearlyPrice : p.monthlyPrice}</span>
                        <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)' }}>/mo</span>
                      </div>
                      {yearly && p.discount && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: p.popular ? 'rgba(124,58,237,0.2)' : p.bestValue ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)', color: p.popular ? '#a78bfa' : p.bestValue ? '#f59e0b' : '#60a5fa', border: `1px solid ${p.accent}25` }}>
                          {p.discount}
                        </span>
                      )}
                    </div>
                    {yearly && p.yearlyBilled && <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.28)', margin: 0 }}>{p.yearlyBilled}</p>}
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '16px 0' }} />

                  {/* Features */}
                  <ul style={{ listStyle: 'none', margin: '0 0 auto', padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {p.features.map(f => (
                      <li key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {f.included ? (
                          <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: `${p.accent}1a`, border: `1px solid ${p.accent}35`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke={p.creditsColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                        ) : (
                          <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="2.5" stroke="rgba(148,163,184,0.22)" strokeWidth="1.2"/></svg>
                          </span>
                        )}
                        <span style={{ fontSize: 13, color: f.included ? 'rgba(241,240,247,0.8)' : 'rgba(148,163,184,0.3)', textDecoration: f.included ? 'none' : 'line-through' }}>{f.text}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div style={{ marginTop: 24 }}>
                    <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                      style={{ display: 'block', textAlign: 'center', padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'opacity 0.15s, transform 0.15s', ...(p.popular ? { background: 'linear-gradient(130deg,#4f46e5,#7c3aed)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' } : p.bestValue ? { background: 'linear-gradient(130deg,#d97706,#f59e0b)', color: '#fff', boxShadow: '0 4px 20px rgba(245,158,11,0.3)' } : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#F2F0FF' }) }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = '' }}>
                      {p.btnLabel}
                    </a>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* ── Credit packs ── */}
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h3 style={{ fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#F2F0FF', margin: '0 0 8px' }}>Credit Packs</h3>
            <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)', margin: 0 }}>Recharge à tout moment · Les crédits n'expirent jamais.</p>
          </div>
        </FadeIn>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {CREDIT_PACKS.map((pack, i) => (
            <FadeIn key={pack.name} delay={i * 0.07}>
              <div
                style={{
                  position: 'relative', background: pack.popular ? '#0d0b1e' : pack.bestValue ? '#0c100a' : '#0c0c18',
                  borderRadius: 16,
                  border: pack.popular ? '1.5px solid rgba(124,58,237,0.45)' : pack.bestValue ? '1.5px solid rgba(245,158,11,0.45)' : '1px solid rgba(255,255,255,0.08)',
                  overflow: 'hidden', display: 'flex', flexDirection: 'column',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = '' }}
              >
                {pack.popular && <div style={{ background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', padding: '5px 0', textAlign: 'center', fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', color: '#fff' }}>MOST POPULAR</div>}
                {pack.bestValue && <div style={{ background: 'linear-gradient(90deg,#d97706,#f59e0b)', padding: '5px 0', textAlign: 'center', fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', color: '#fff' }}>BEST VALUE</div>}
                <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, marginBottom: 12, background: pack.popular ? 'rgba(124,58,237,0.15)' : pack.bestValue ? 'rgba(245,158,11,0.12)' : 'rgba(139,92,246,0.08)', border: pack.popular ? '1px solid rgba(124,58,237,0.3)' : pack.bestValue ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1.5l1.6 4.9H15l-4.2 3 1.6 4.9L8 11.3l-4.4 3.1 1.6-4.9L1 6.4h5.4z" fill={pack.popular ? '#a78bfa' : pack.bestValue ? '#f59e0b' : 'rgba(139,92,246,0.55)'}/>
                    </svg>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#F2F0FF', margin: '0 0 10px', letterSpacing: '-0.02em' }}>{pack.name}</p>
                  <p style={{ fontSize: 30, fontWeight: 900, color: '#F2F0FF', margin: '0 0 2px', letterSpacing: '-0.03em', lineHeight: 1 }}>{pack.credits}</p>
                  <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.38)', margin: '0 0 14px' }}>crédits</p>
                  <p style={{ fontSize: 26, fontWeight: 900, color: '#F2F0FF', margin: '0 0 auto', letterSpacing: '-0.03em' }}>{pack.price}</p>
                  <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                    style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 18, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', transition: 'opacity 0.15s', ...(pack.popular ? { background: 'linear-gradient(130deg,#4f46e5,#7c3aed)', color: '#fff' } : pack.bestValue ? { background: 'linear-gradient(130deg,#d97706,#f59e0b)', color: '#fff' } : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#F2F0FF' }) }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                    Acheter
                  </a>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(148,163,184,0.18)', marginTop: 28 }}>
          Activation via Telegram · Crypto ou virement bancaire · Activation immédiate
        </p>
      </div>
    </section>
  )
}

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
  @keyframes sf-tile-float {
    0%,100% { transform: translateY(0px); }
    50%     { transform: translateY(-10px); }
  }
  @keyframes sf-tile-in {
    from { opacity: 0; transform: translateY(18px) scale(0.94); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes sf-entry-brand {
    from { opacity: 0; transform: translateY(10px); filter: blur(8px); }
    to   { opacity: 1; transform: translateY(0); filter: blur(0); }
  }
  @keyframes sf-entry-sub {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sf-enter-btn {
    0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
    50%     { box-shadow: 0 0 0 6px rgba(255,255,255,0.08); }
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

// Fill with real image URLs when available — 16 slots (top×4, left×4, right×4, bottom×4)
export const ENTRY_IMAGES: (string | null)[] = Array(16).fill(null)

interface EntryTile {
  key: string; w: number; h: number
  top?: string; bottom?: string; left?: string; right?: string
  ry: number; rx: number; delay: number; bg: string
}

// 4-wall layout: top / left / right / bottom — matching the ScaleFlow reference
const ENTRY_TILES: EntryTile[] = [
  // ── TOP wall (4 tiles, tilt tops away = positive rx) ─────────────────────────
  { key:'t1', w:265, h:162, top:'2%',  left:'1%',   ry:-18, rx:32, delay:0,    bg:'#0d0d1a' },
  { key:'t2', w:240, h:148, top:'1%',  left:'27%',  ry:-5,  rx:35, delay:0.1,  bg:'#0e0e1b' },
  { key:'t3', w:240, h:148, top:'1%',  left:'53%',  ry:5,   rx:35, delay:0.2,  bg:'#0d0d1a' },
  { key:'t4', w:265, h:162, top:'2%',  right:'1%',  ry:18,  rx:32, delay:0.3,  bg:'#0e0e1b' },
  // ── LEFT wall (4 tiles, alternating near/far) ─────────────────────────────────
  { key:'l1', w:290, h:178, top:'16%', left:'-2%',  ry:-22, rx:3,  delay:0.05, bg:'#0c0c19' },
  { key:'l2', w:215, h:132, top:'27%', left:'15%',  ry:-26, rx:0,  delay:0.18, bg:'#0f0f1c' },
  { key:'l3', w:285, h:175, top:'50%', left:'-2%',  ry:-21, rx:-3, delay:0.32, bg:'#0d0d1a' },
  { key:'l4', w:215, h:132, top:'62%', left:'15%',  ry:-24, rx:-6, delay:0.46, bg:'#0e0e1b' },
  // ── RIGHT wall (mirror of left) ───────────────────────────────────────────────
  { key:'r1', w:290, h:178, top:'16%', right:'-2%', ry:22,  rx:3,  delay:0.08, bg:'#0f0f1c' },
  { key:'r2', w:215, h:132, top:'27%', right:'15%', ry:26,  rx:0,  delay:0.22, bg:'#0c0c19' },
  { key:'r3', w:285, h:175, top:'50%', right:'-2%', ry:21,  rx:-3, delay:0.36, bg:'#0e0e1b' },
  { key:'r4', w:215, h:132, top:'62%', right:'15%', ry:24,  rx:-6, delay:0.5,  bg:'#0d0d1a' },
  // ── BOTTOM wall (4 tiles, tilt bottoms away = negative rx) ───────────────────
  { key:'b1', w:265, h:162, bottom:'2%', left:'1%',  ry:-18, rx:-32, delay:0.15, bg:'#0e0e1b' },
  { key:'b2', w:240, h:148, bottom:'1%', left:'27%', ry:-5,  rx:-35, delay:0.25, bg:'#0d0d1a' },
  { key:'b3', w:240, h:148, bottom:'1%', left:'53%', ry:5,   rx:-35, delay:0.35, bg:'#0e0e1b' },
  { key:'b4', w:265, h:162, bottom:'2%', right:'1%', ry:18,  rx:-32, delay:0.45, bg:'#0c0c19' },
]

// ── Entry hero — ScaleFlow reference style ────────────────────────────────────
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
      position: 'fixed', inset: 0,
      overflow: 'hidden',
      background: '#06060F',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>

      {/* ── Perspective grid lines from center ── */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }} preserveAspectRatio="none">
        {/* Corner lines */}
        <line x1="50%" y1="50%" x2="0%"   y2="0%"   stroke="rgba(139,92,246,0.12)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="100%" y2="0%"   stroke="rgba(139,92,246,0.12)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="0%"   y2="100%" stroke="rgba(139,92,246,0.12)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="100%" y2="100%" stroke="rgba(139,92,246,0.12)" strokeWidth="1" />
        {/* Edge midpoint lines */}
        <line x1="50%" y1="50%" x2="50%"  y2="0%"   stroke="rgba(139,92,246,0.07)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="50%"  y2="100%" stroke="rgba(139,92,246,0.07)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="0%"   y2="50%"  stroke="rgba(139,92,246,0.07)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="100%" y2="50%"  stroke="rgba(139,92,246,0.07)" strokeWidth="1" />
        {/* Intermediate lines for denser grid feel */}
        <line x1="50%" y1="50%" x2="25%"  y2="0%"   stroke="rgba(139,92,246,0.05)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="75%"  y2="0%"   stroke="rgba(139,92,246,0.05)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="25%"  y2="100%" stroke="rgba(139,92,246,0.05)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="75%"  y2="100%" stroke="rgba(139,92,246,0.05)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="0%"   y2="25%"  stroke="rgba(139,92,246,0.05)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="0%"   y2="75%"  stroke="rgba(139,92,246,0.05)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="100%" y2="25%"  stroke="rgba(139,92,246,0.05)" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="100%" y2="75%"  stroke="rgba(139,92,246,0.05)" strokeWidth="1" />
      </svg>

      {/* ── Purple ambient glow at center ── */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 600, height: 400,
        background: 'radial-gradient(ellipse closest-side, rgba(109,40,217,0.22), transparent)',
        filter: 'blur(60px)', pointerEvents: 'none', zIndex: 1,
      }} />

      {/* ── Image tiles (4-wall layout) ── */}
      {ENTRY_TILES.map((tile, idx) => (
        <div
          key={tile.key}
          style={{
            position: 'absolute',
            top: tile.top, bottom: tile.bottom,
            left: tile.left, right: tile.right,
            animation: `sf-tile-float ${7 + idx * 0.25}s ease-in-out ${tile.delay}s infinite, sf-tile-in 0.8s ease ${tile.delay + 0.1}s both`,
            zIndex: 2,
          }}
        >
          <div style={{
            width: tile.w, height: tile.h,
            transform: `perspective(1100px) rotateY(${tile.ry}deg) rotateX(${tile.rx}deg)`,
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid rgba(139,92,246,0.18)',
            boxShadow: '0 8px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(139,92,246,0.1)',
          }}>
            {ENTRY_IMAGES[idx]
              ? <img src={ENTRY_IMAGES[idx]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: '100%', height: '100%', background: tile.bg }} />
            }
          </div>
        </div>
      ))}

      {/* ── Radial vignette to keep center readable ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        background: 'radial-gradient(ellipse 52% 55% at 50% 50%, transparent 0%, rgba(6,6,15,0.8) 100%)',
      }} />

      {/* ── Brand (centered via flexbox) ── */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', userSelect: 'none', animation: 'sf-entry-brand 1s cubic-bezier(0.16,1,0.3,1) 0.3s both' }}>
        <h1 style={{
          fontSize: 'clamp(68px, 10vw, 136px)',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: '#ffffff',
          margin: '0 0 10px',
          fontFamily: "'Inter', 'Arial Black', system-ui, sans-serif",
          display: 'inline-flex', alignItems: 'baseline', gap: '0.06em',
        }}>
          ScaleFlow<span style={{ color: '#7C3AED', fontSize: '0.85em', lineHeight: 1 }}>.</span>
        </h1>
        <p style={{
          fontSize: 11, color: 'rgba(255,255,255,0.38)',
          letterSpacing: '0.28em', textTransform: 'uppercase',
          margin: '0 0 36px', fontWeight: 600,
          animation: 'sf-entry-sub 1s ease 0.9s both',
        }}>
          Instagram Automation
        </p>

        {/* ENTER — centered within the brand block */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={onEnter}
            style={{
              padding: '13px 52px', borderRadius: 99,
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(12px)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              border: '1.5px solid rgba(255,255,255,0.28)', cursor: 'pointer',
              animation: 'sf-tile-in 0.6s ease 1.3s both, sf-enter-btn 3s ease-in-out 2.5s infinite',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(124,58,237,0.25)'
              e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'
              e.currentTarget.style.transform = ''
            }}
          >
            ENTER
          </button>
        </div>
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
      {/* ── Left panel — Marketing ─────────────────────────────────────────── */}
      <div style={{ flex: '0 0 55%', background: '#05030f', position: 'relative', overflow: 'hidden' }}>
        {/* Glow */}
        <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side,rgba(109,40,217,0.18),transparent)', filter: 'blur(70px)', pointerEvents: 'none' }} />

        {/* Floating phone cards */}
        {[
          { x: -34, y: -22, rot: -8,  views: '870K', g: '#c084fc' },
          { x:  -6, y: -28, rot: -2,  views: '680K', g: '#f472b6' },
          { x:  26, y: -20, rot:  6,  views: '1.1M', g: '#60a5fa' },
          { x: -26, y:  20, rot: -5,  views: '920K', g: '#4ade80' },
          { x:  28, y:  16, rot:  7,  views: '990K', g: '#fb923c' },
        ].map((c, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `calc(50% + ${c.x}% - 55px)`, top: `calc(50% + ${c.y}% - 80px)`,
            width: 110, height: 160, transform: `rotate(${c.rot}deg)`,
            borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            animation: `sf-float ${4.5 + i * 0.6}s ease-in-out ${i * 0.9}s infinite`, zIndex: 2,
          }}>
            <img src={REEL_PHOTOS[i % REEL_PHOTOS.length]} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '78%', objectFit: 'cover', display: 'block' }} loading="lazy" />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '78%', background: 'linear-gradient(to bottom, rgba(0,0,0,0.06) 0%, transparent 40%, rgba(0,0,0,0.15) 100%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="rgba(255,255,255,0.8)"><path d="M8 5v14l11-7z"/></svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{c.views}</span>
            </div>
            <div style={{ position: 'absolute', top: 5, right: 5, width: 15, height: 15, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'rgba(255,255,255,0.55)' }}>✕</div>
          </div>
        ))}

        {/* Instagram icon */}
        <div style={{ position: 'absolute', top: '10%', left: '8%', width: 54, height: 54, borderRadius: 15, background: 'linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 32px rgba(253,29,29,0.35)', animation: 'sf-float-slow 5s ease-in-out infinite', zIndex: 3 }}>
          <svg width="27" height="27" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        </div>

        {/* Telegram icon */}
        <div style={{ position: 'absolute', bottom: '18%', left: '6%', width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg,#229ED9,#1a7ab5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 32px rgba(34,158,217,0.3)', animation: 'sf-float-slow 6s ease-in-out 1.2s infinite', zIndex: 3 }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/></svg>
        </div>

        {/* Video icon */}
        <div style={{ position: 'absolute', top: '12%', right: '8%', width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg,#1d4ed8,#60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 32px rgba(59,130,246,0.3)', animation: 'sf-float-slow 5.5s ease-in-out 2s infinite', zIndex: 3 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>

        {/* Rocket icon */}
        <div style={{ position: 'absolute', bottom: '20%', right: '7%', width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 32px rgba(124,58,237,0.3)', animation: 'sf-float-slow 7s ease-in-out 0.5s infinite', zIndex: 3, fontSize: 22 }}>🚀</div>

        {/* Center text */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', zIndex: 10, width: '90%', pointerEvents: 'none' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 99, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.22)', marginBottom: 16 }}>
            <span style={{ color: 'rgba(196,181,253,0.9)', display: 'flex' }}><Icon name="zap" size={12} /></span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(196,181,253,0.8)', textTransform: 'uppercase' }}>Automatise · Gagne du Temps · Scale</span>
          </div>
          <div style={{ fontSize: 'clamp(36px,4.5vw,62px)', fontWeight: 900, letterSpacing: '-0.045em', color: '#F2F0FF', lineHeight: 0.88, fontFamily: "'Inter','Arial Black',sans-serif", filter: 'drop-shadow(0 0 40px rgba(167,139,250,0.22))' }}>ScaleFlow</div>
          <div style={{ marginTop: 14, fontSize: 'clamp(14px,1.6vw,18px)', fontWeight: 800, color: 'rgba(241,240,247,0.85)', lineHeight: 1.25 }}>L'automatisation Instagram</div>
          <div style={{ fontSize: 'clamp(14px,1.6vw,18px)', fontWeight: 800, color: 'rgba(241,240,247,0.85)', lineHeight: 1.25, marginBottom: 10 }}>à grande échelle.</div>
          <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', margin: '0 auto', lineHeight: 1.6, maxWidth: 320 }}>Mass posting, multi-comptes, planification avancée, reels & stories.</p>
        </div>

        {/* Bottom feature strip */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', padding: '10px 0', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.06)', gap: 0, zIndex: 5 }}>
          {[{ iconName: 'send' as IconName, label: 'MASS POSTING' }, { iconName: 'users' as IconName, label: 'MULTI-COMPTES' }, { iconName: 'clapperboard' as IconName, label: 'REELS & STORIES' }].map((f, i, a) => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', borderRight: i < a.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
              <span style={{ color: 'rgba(196,181,253,0.6)', display: 'flex' }}><Icon name={f.iconName} size={12} /></span>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(196,181,253,0.5)', textTransform: 'uppercase' }}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Back button */}
        <button onClick={onBack} style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(148,163,184,0.6)', fontSize: 12, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.06em', transition: 'background 0.2s', zIndex: 20 }}
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
                  aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.4)', padding: 0, display: 'flex', alignItems: 'center' }}>
                  <Icon name={showPw ? 'eye-off' : 'eye'} size={18} label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} />
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
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(240,61,85,0.08)', border: '1px solid rgba(240,61,85,0.22)', color: '#f87171', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, display: 'flex', marginTop: 1 }}><Icon name="alert-triangle" size={15} /></span><span>{error}</span>
              </div>
            )}
            {success && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.22)', color: '#34d399', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, display: 'flex', marginTop: 1 }}><Icon name="check" size={15} /></span><span>{success}</span>
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
type Stage = 'tunnel' | 'reveal' | 'site' | 'studio'

function stageFromHash(): Stage {
  const h = window.location.hash
  if (h === '#discover') return 'site'
  if (h === '#studio')   return 'studio'
  return 'tunnel'
}

export function Landing() {
  const [stage,   setStageRaw] = useState<Stage>(stageFromHash)
  const [faqOpen, setFaqOpen]  = useState<number | null>(null)
  useGlobalCSS()

  // Keep hash in sync with stage
  const goTo = (s: Stage) => {
    if (s === 'site')   window.location.hash = '#discover'
    else if (s === 'studio') window.location.hash = '#studio'
    else history.pushState(null, '', window.location.pathname)
    setStageRaw(s)
  }

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => setStageRaw(stageFromHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  // Lock scroll while not on the main site
  useEffect(() => {
    document.body.style.overflow = stage === 'site' ? '' : 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [stage])

  // Scroll to top when arriving on discover
  useEffect(() => {
    if (stage === 'site') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [stage])

  const onDiscover = () => goTo('site')
  const onStudio   = () => goTo('studio')

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

      {stage === 'reveal' && <RevealScreen onDiscover={onDiscover} onStudio={onStudio} />}
      {stage === 'studio' && <StudioAuth onBack={() => goTo('reveal')} />}

      {/* Tunnel — only rendered on tunnel stage */}
      {stage === 'tunnel' && <TunnelHero onEnter={() => goTo('reveal')} />}

      {/* ── Nav (hidden while tunnel is fullscreen) ──────────────────────────── */}
      {stage === 'site' && (
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(6,6,15,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo — clicking returns to tunnel */}
          <button onClick={() => goTo('tunnel')} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <SFMark size={28} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#F2F0FF', letterSpacing: '-0.3px' }}>ScaleFlow</span>
          </button>
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
            <button onClick={onStudio}
              style={{ padding: '7px 16px', borderRadius: 9, background: 'linear-gradient(130deg,#7c3aed,#a855f7)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s', animation: 'sf-pulse-glow 3s ease-in-out infinite' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Studio →
            </button>
          </div>
        </div>
      </nav>
      )}

      {/* ── Site content — only rendered when stage==='site' ─────────────────── */}
      {stage === 'site' && <>

      {/* ── Site hero ────────────────────────────────────────────────────────── */}
      <SiteHero onStudio={onStudio} />

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
                  <div style={{ width: 42, height: 42, borderRadius: 11, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.color, background: `${f.color}10`, border: `1px solid ${f.color}20` }}><Icon name={f.iconName} size={20} /></div>
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

      {/* ── Pricing ── */}
      <PricingSection />

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

      </>} {/* end stage === 'site' */}
    </div>
  )
}
