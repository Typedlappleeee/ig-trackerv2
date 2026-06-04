import { useState, useEffect, useRef } from 'react'
import { AuthPage } from '@/components/auth/AuthPage'

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

// ── Mockup fallback (SVG UI) shown when mockup.png not yet uploaded ───────────
function MockupFallback() {
  return (
    <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(139,92,246,0.22)', boxShadow: '0 40px 100px rgba(0,0,0,0.75)', background: '#08080f' }}>
      {/* Chrome bar */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.045)', display: 'flex', alignItems: 'center', gap: 8, background: '#0b0b16' }}>
        {['#ef4444','#f59e0b','#22c55e'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.5 }} />)}
        <div style={{ flex: 1, margin: '0 10px', height: 20, borderRadius: 5, background: 'rgba(255,255,255,0.035)', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
          <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.22)' }}>scaleflow-fvtu.vercel.app</span>
        </div>
      </div>
      <div style={{ display: 'flex', height: 480 }}>
        {/* Sidebar */}
        <div style={{ width: 200, background: '#07070c', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', padding: '16px 10px', gap: 2, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 12 }}>
            <SFMark size={22} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#F2F0FF' }}>ScaleFlow</span>
          </div>
          {[{ icon: '📊', label: 'Dashboard', active: false }, { icon: '📱', label: 'Téléphones', active: false }, { icon: '⚡', label: 'Mass Posting', active: true }, { icon: '📅', label: 'Programmation', active: false }, { icon: '🗂', label: 'Banque vidéos', active: false }, { icon: '🔀', label: 'Remix vidéo', active: false }, { icon: '🤖', label: 'Outils IA', active: false }].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, fontSize: 12, background: item.active ? 'rgba(124,58,237,0.15)' : 'transparent', color: item.active ? '#a78bfa' : 'rgba(148,163,184,0.45)', borderLeft: item.active ? '2px solid #7c3aed' : '2px solid transparent' }}>
              <span style={{ fontSize: 13 }}>{item.icon}</span>
              <span style={{ fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
            </div>
          ))}
        </div>
        {/* Main */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#07070c', minWidth: 0 }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', margin: 0 }}>Mass Posting</p>
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', margin: '2px 0 0' }}>Poster sur plusieurs comptes en parallèle</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>Paramètres</div>
              <div style={{ padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(130deg,#7c3aed,#ec4899)', fontSize: 11, color: '#fff', fontWeight: 700 }}>▶ Lancer</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', padding: 20, gap: 14, overflow: 'hidden' }}>
            <div style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.3)', margin: '0 0 6px' }}>12 Téléphones</p>
              {[{ n:'Phone_001',g:'Groupe A',o:true,s:true},{n:'Phone_002',g:'Groupe A',o:true,s:true},{n:'Phone_003',g:'Groupe B',o:false,s:false},{n:'Phone_004',g:'Groupe B',o:true,s:true},{n:'Phone_005',g:'Groupe A',o:true,s:true},{n:'Phone_006',g:'Groupe C',o:false,s:false}].map(p => (
                <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 7, background: p.s ? 'rgba(124,58,237,0.10)' : 'transparent', border: p.s ? '1px solid rgba(124,58,237,0.18)' : '1px solid transparent' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.o ? '#22c55e' : 'rgba(148,163,184,0.2)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: p.s ? '#c4b5fd' : 'rgba(148,163,184,0.45)', margin: 0 }}>{p.n}</p>
                    <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.28)', margin: 0 }}>{p.g}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.3)', margin: '0 0 8px' }}>Vidéos — 3</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#7c3aed','#ec4899','#3b82f6'].map((c,i) => <div key={i} style={{ width: 52, height: 52, borderRadius: 8, background: `${c}18`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎬</div>)}
                </div>
              </div>
              <div style={{ flex: 1, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.3)', margin: '0 0 6px' }}>Live log</p>
                {[{t:'14:22:01',m:'✅ Phone_001 — Publication réussie',c:'#22c55e'},{t:'14:22:03',m:'✅ Phone_002 — Publication réussie',c:'#22c55e'},{t:'14:22:05',m:'⏳ Phone_004 — Upload en cours…',c:'#a78bfa'},{t:'14:22:07',m:'✅ Phone_005 — Publication réussie',c:'#22c55e'}].map((l,i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                    <span style={{ color: 'rgba(148,163,184,0.25)', flexShrink: 0 }}>{l.t}</span>
                    <span style={{ color: l.c }}>{l.m}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
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
const PLANS = [
  { name: 'Standard', price: '49,99$', period: '/mois', accent: '#60a5fa', features: ['2 500 crédits / mois', '50 téléphones max', 'Toutes les fonctionnalités', 'Mass Posting — 10 comptes max', 'Support 24/7'] },
  { name: 'Pro', price: '59,99$', originalPrice: '99,99$', period: '/mois', accent: '#c084fc', popular: true, features: ['5 500 crédits / mois', '200 téléphones max', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7'] },
  { name: 'Organisation', price: '89,99$', originalPrice: '149,99$', period: '/mois', accent: '#34d399', features: ['11 000 crédits / mois', 'Téléphones illimités', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support prioritaire', "Suggestions d'ajouts avec les devs"] },
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

// ── Reveal screen (after ENTER) ───────────────────────────────────────────────
const REVEAL_LINES = ['MASS', 'POSTING', 'AUTOMATION', 'INSTAGRAM']

function RevealScreen({ onDiscover, onStudio }: { onDiscover: () => void; onStudio: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        animation: 'reveal-in 0.55s cubic-bezier(0.16,1,0.3,1) both',
        overflow: 'hidden',
      }}
    >
      {/* Subtle background grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: [
          'linear-gradient(rgba(0,0,0,1) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(0,0,0,1) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '48px 48px',
        pointerEvents: 'none',
      }} />

      {/* Top label */}
      <div style={{
        position: 'absolute', top: 40, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10,
        animation: 'reveal-sub 0.8s ease 0.2s both',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'linear-gradient(130deg,#7c3aed,#a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 200 200" fill="none">
            <text x="100" y="148" textAnchor="middle"
              fontFamily="'Arial Black',Helvetica,sans-serif"
              fontWeight="900" fontSize="148" fill="#fff">S</text>
          </svg>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 800, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)',
        }}>ScaleFlow</span>
      </div>

      {/* Main stacked words */}
      <div style={{ position: 'relative', textAlign: 'center', lineHeight: 0.88 }}>
        {REVEAL_LINES.map((word, i) => (
          <div
            key={word}
            style={{
              fontSize: 'clamp(52px, 11.5vw, 148px)',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              color: i === REVEAL_LINES.length - 1 ? 'transparent' : '#0a0a0a',
              WebkitTextStroke: i === REVEAL_LINES.length - 1 ? '2px #0a0a0a' : undefined,
              fontFamily: "'Inter','Arial Black','Helvetica Neue',Arial,sans-serif",
              display: 'block',
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0) skewY(0deg)' : 'translateY(40px) skewY(2deg)',
              transition: `opacity 0.65s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.1}s, transform 0.65s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.1}s`,
            }}
          >
            {word}
          </div>
        ))}

        {/* Accent bar under MASS */}
        <div style={{
          position: 'absolute', left: '10%', right: '10%',
          bottom: -18, height: 3,
          background: 'linear-gradient(90deg, #7c3aed, #ec4899)',
          borderRadius: 99,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.5s ease 0.6s',
        }} />
      </div>

      {/* Subtitle */}
      <p style={{
        marginTop: 52,
        fontSize: 13,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'rgba(0,0,0,0.3)',
        fontWeight: 600,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease 0.55s',
      }}>
        Instagram · Cloud Phones · Scale
      </p>

      {/* Two CTA buttons */}
      <div style={{
        marginTop: 56,
        display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease 0.7s',
      }}>
        {/* Discover — outline */}
        <button
          onClick={onDiscover}
          style={{
            padding: '14px 36px',
            borderRadius: 99,
            background: 'transparent',
            color: '#0a0a0a',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            border: '2px solid #0a0a0a',
            cursor: 'pointer',
            transition: 'background 0.2s, color 0.2s, transform 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0a0a0a'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#0a0a0a'; e.currentTarget.style.transform = '' }}
        >
          Découvrir ScaleFlow
        </button>
        {/* Studio — filled gradient */}
        <button
          onClick={onStudio}
          style={{
            padding: '14px 36px',
            borderRadius: 99,
            background: 'linear-gradient(130deg,#7c3aed,#ec4899)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 8px 28px rgba(124,58,237,0.35)',
            transition: 'opacity 0.2s, transform 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = '' }}
        >
          Studio →
        </button>
      </div>

      {/* Bottom label */}
      <p style={{
        position: 'absolute', bottom: 32,
        fontSize: 11, color: 'rgba(0,0,0,0.18)',
        letterSpacing: '0.1em', fontWeight: 600,
        textTransform: 'uppercase',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease 0.8s',
      }}>
        © {new Date().getFullYear()} ScaleFlow
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function Landing() {
  const [stage,    setStage]   = useState<'tunnel' | 'reveal' | 'site'>('tunnel')
  const [showAuth, setShowAuth] = useState(false)
  const [faqOpen, setFaqOpen]   = useState<number | null>(null)
  useGlobalCSS()

  // Lock body scroll while on tunnel / reveal screens
  useEffect(() => {
    document.body.style.overflow = stage === 'site' ? '' : 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [stage])

  return (
    <div style={{ minHeight: '100vh', background: '#06060f', color: '#F2F0FF', overflowX: 'hidden', fontFamily: "'Inter', system-ui, sans-serif" }}>
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
          onDiscover={() => setStage('site')}
          onStudio={() => { setStage('site'); setShowAuth(true) }}
        />
      )}

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
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a78bfa', margin: '0 0 14px' }}>Tarifs</p>
              <h2 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', color: '#F2F0FF' }}>
                Choisis ton{' '}
                <span style={{ background: 'linear-gradient(120deg,#a78bfa,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>plan.</span>
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(148,163,184,0.5)' }}>Tout est inclus dès le Standard. Activation via Telegram.</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '8px 18px', borderRadius: 99, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)' }}>
                <span style={{ fontSize: 16 }}>🔥</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#fb923c' }}>-40% sur Pro &amp; Organisation jusqu'au 1er juillet</span>
              </div>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(265px,1fr))', gap: 14 }}>
            {PLANS.map((p, i) => (
              <FadeIn key={p.name} delay={i * 0.1}>
                <div style={{ position: 'relative', background: '#0a0a14', borderRadius: 18, padding: '28px 24px', border: p.popular ? '1.5px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', boxShadow: p.popular ? '0 0 50px rgba(124,58,237,0.1)' : 'none', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = p.popular ? '0 20px 60px rgba(124,58,237,0.2)' : '0 12px 40px rgba(0,0,0,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = p.popular ? '0 0 50px rgba(124,58,237,0.1)' : 'none' }}>
                  {p.popular && <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 99, fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: '0.1em', background: 'linear-gradient(130deg,#7c3aed,#ec4899)', whiteSpace: 'nowrap' }}>POPULAIRE</div>}
                  <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: p.accent, margin: '0 0 8px' }}>{p.name}</p>
                  <div style={{ marginBottom: 22 }}>
                    {(p as any).originalPrice && (
                      <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.35)', textDecoration: 'line-through' }}>{(p as any).originalPrice}</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: 38, fontWeight: 900, color: '#F2F0FF', letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}>{p.price}</span>
                      <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.38)', whiteSpace: 'nowrap' }}>{p.period}</span>
                    </div>
                  </div>
                  <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'rgba(196,181,253,0.65)' }}>
                        <span style={{ color: p.accent, flexShrink: 0 }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                    style={{ display: 'block', textAlign: 'center', padding: '11px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', transition: 'opacity 0.15s', ...(p.popular ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' } : { background: 'rgba(255,255,255,0.04)', border: `1px solid ${p.accent}28`, color: '#F2F0FF' }) }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                    Choisir {p.name} →
                  </a>
                </div>
              </FadeIn>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(148,163,184,0.25)', marginTop: 24 }}>Paiement via Telegram · Crypto ou virement · Activation immédiate</p>
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
