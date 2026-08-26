import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useTr } from '@/lib/i18n'

const TELEGRAM_URL = 'https://t.me/justquentin'

const REEL_PHOTOS = [
  '/reels/reel-1.png',
  '/reels/reel-2.png',
  '/reels/reel-3.png',
  '/reels/reel-4.png',
  '/reels/reel-5.png',
]

// ── Design tokens — "ScaleFlow Noir" ─────────────────────────────────────────
const SERIF   = "'Instrument Serif', 'Times New Roman', Georgia, serif"
const SANS    = "'Manrope', 'Inter', system-ui, sans-serif"
const DISPLAY = "'Space Grotesk', 'Manrope', sans-serif"
const BG    = '#0A0B0E'
const IVORY = '#E9EAF0'
// Contraste relevé : les anciens 0.42 / 0.22 échouaient WCAG AA (illisibles).
const MUTED = 'rgba(233,234,240,0.60)'
const FAINT = 'rgba(233,234,240,0.40)'
const HAIR  = 'rgba(233,234,240,0.10)'
const GOLD  = '#818CF8'
const VIOLET = '#6366F1'

// ── Lucide-style inline icon set ──────────────────────────────────────────────
type IconName =
  | 'zap' | 'send' | 'users' | 'bot' | 'clapperboard' | 'bar-chart-3'
  | 'calendar' | 'timer' | 'folder-archive' | 'shuffle' | 'smartphone'
  | 'crown' | 'building-2' | 'eye' | 'eye-off' | 'alert-triangle' | 'check'
  | 'arrow-right' | 'arrow-up-right' | 'download'

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
  'arrow-right':   (<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
  'arrow-up-right':(<><path d="M7 7h10v10" /><path d="M7 17 17 7" /></>),
  download:        (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></>),
}

function Icon({ name, size = 16, label, style }: { name: IconName; size?: number; label?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
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
  @keyframes sf-fade-up {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sf-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sf-blur-in {
    from { opacity: 0; transform: translateY(14px); filter: blur(10px); }
    to   { opacity: 1; transform: translateY(0); filter: blur(0); }
  }
  @keyframes sf-line-grow {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }
  @keyframes sf-marquee {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  @keyframes sf-beam {
    0%   { transform: translateX(-120%) skewX(-18deg); }
    100% { transform: translateX(280%) skewX(-18deg); }
  }
  @keyframes sf-float {
    0%,100% { transform: translateY(0px); }
    50%     { transform: translateY(-10px); }
  }
  @keyframes sf-tile-rot {
    0%,100% { transform: perspective(1100px) rotateY(var(--ry)) rotateX(var(--rx)); }
    50%     { transform: perspective(1100px) rotateY(calc(var(--ry) + 10deg)) rotateX(calc(var(--rx) - 4deg)); }
  }
  /* Animation "le téléphone poste tout seul" */
  @keyframes sf-upbar   { 0%{width:0%} 40%{width:100%} 100%{width:100%} }
  @keyframes sf-uploading { 0%,38%{opacity:1} 44%,100%{opacity:0} }
  @keyframes sf-posted  { 0%,40%{opacity:0;transform:translateY(4px) scale(0.85)} 47%,90%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0} }
  @keyframes sf-phone-flash {
    0%,40% { box-shadow: 0 14px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06); }
    48%    { box-shadow: 0 14px 40px rgba(0,0,0,0.6), 0 0 26px 1px rgba(34,197,94,0.55); }
    72%,100%{ box-shadow: 0 14px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06); }
  }
  @keyframes sf-float-soft { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  @keyframes sf-conveyor { from{transform:translateX(0)} to{transform:translateX(-50%)} }
  .sf-plan-card { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), box-shadow 0.4s; }
  .sf-plan-card:hover { transform: translateY(-12px); box-shadow: 0 36px 80px -24px rgba(99,102,241,0.45); z-index: 2; }
  @keyframes sf-aurora-a { 0%,100%{transform:translate(-12%,-8%) scale(1)} 50%{transform:translate(14%,10%) scale(1.25)} }
  @keyframes sf-aurora-b { 0%,100%{transform:translate(10%,6%) scale(1.1)} 50%{transform:translate(-14%,-10%) scale(0.9)} }
  @keyframes sf-smoke-a { 0%{transform:translate(-6%,4%) scale(1) rotate(0deg);opacity:0.5} 50%{transform:translate(16%,-12%) scale(1.45) rotate(8deg);opacity:1} 100%{transform:translate(-6%,4%) scale(1) rotate(0deg);opacity:0.5} }
  @keyframes sf-smoke-b { 0%{transform:translate(6%,-3%) scale(1.2) rotate(0deg);opacity:0.55} 50%{transform:translate(-18%,12%) scale(0.9) rotate(-10deg);opacity:1} 100%{transform:translate(6%,-3%) scale(1.2) rotate(0deg);opacity:0.55} }
  @keyframes sf-smoke-c { 0%{transform:translateX(-30%) scale(1.1);opacity:0.4} 50%{transform:translateX(30%) scale(1.3);opacity:0.9} 100%{transform:translateX(-30%) scale(1.1);opacity:0.4} }
  @keyframes sf-smoke-rise { 0%{transform:translateY(12%) scale(1);opacity:0.3} 50%{transform:translateY(-14%) scale(1.35);opacity:0.85} 100%{transform:translateY(12%) scale(1);opacity:0.3} }
  .sf-shine { position: relative; overflow: hidden; }
  .sf-shine::after { content:''; position:absolute; top:0; bottom:0; left:0; width:60%; pointer-events:none;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,0.28), transparent);
    transform: translateX(-200%) skewX(-18deg); }
  .sf-shine:hover::after { animation: sf-beam 0.85s cubic-bezier(0.16,1,0.3,1); }
  .sf-flow-text { background: linear-gradient(90deg,#818CF8,#a855f7,#ec4899,#818CF8); background-size: 220% auto; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; animation: sf-flow-move 7s linear infinite; }
  @keyframes sf-flow-move { to { background-position: 220% center; } }
  /* Shimmer serif élégant pour les accents dorés (cohérent avec l'app) */
  .sf-serif-shimmer { background: linear-gradient(100deg,#a5b4fc 8%,#c4b5fd 42%,#818CF8 66%,#6ee7b7 100%); background-size: 220% auto; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; animation: sf-serif-shim 7s linear infinite; }
  @keyframes sf-serif-shim { to { background-position: 220% center; } }
  @keyframes sf-tile-in {
    from { opacity: 0; transform: translateY(18px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes sf-grain {
    0%, 100% { transform: translate(0, 0); }
    10% { transform: translate(-2%, -3%); }
    30% { transform: translate(3%, -2%); }
    50% { transform: translate(-3%, 2%); }
    70% { transform: translate(2%, 3%); }
    90% { transform: translate(-2%, 1%); }
  }
  @keyframes reveal-in {
    from { opacity: 0; transform: scale(1.03); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes sf-pulse-dot {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.3; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
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

// ── Film grain overlay ────────────────────────────────────────────────────────
function Grain({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: '-100px', zIndex: 999, pointerEvents: 'none', overflow: 'hidden' }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, animation: 'sf-grain 0.9s steps(6) infinite' }}>
        <filter id="sf-noise"><feTurbulence type="fractalNoise" baseFrequency="0.74" numOctaves="2" stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#sf-noise)" />
      </svg>
    </div>
  )
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
    <div ref={ref} style={{ opacity: visible ? 1 : 0, animation: visible ? `sf-fade-up 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}s both` : 'none', ...style }}>
      {children}
    </div>
  )
}

// ── Wordmark ──────────────────────────────────────────────────────────────────
// Nouveau logo : tuile violette + 2 barres blanches inclinées en sens opposés.
function LogoMark({ size = 32 }: { size?: number }) {
  const w = Math.round(size * 0.44)
  const h = Math.max(2, Math.round(size * 0.095))
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: Math.max(2, Math.round(size * 0.1)), borderRadius: Math.round(size * 0.25),
      background: 'linear-gradient(145deg,#A855F7,#7C3AED)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
    }}>
      <span style={{ width: w, height: h, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
      <span style={{ width: w, height: h, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
    </span>
  )
}

function Wordmark({ size = 17, onClick }: { size?: number; onClick?: () => void }) {
  const inner = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.5), whiteSpace: 'nowrap' }}>
      <LogoMark size={Math.round(size * 1.7)} />
      <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: size, letterSpacing: '-0.03em' }}>
        <span style={{ color: IVORY }}>scale</span><span style={{ color: '#A855F7' }}>flow</span>
      </span>
    </span>
  )
  if (!onClick) return inner
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      {inner}
    </button>
  )
}

// ── Micro label — "— LABEL —" éditorial ──────────────────────────────────────
function MicroLabel({ children, color = FAINT, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, ...style }}>
      <span style={{ display: 'block', width: 36, height: 1, background: color }} />
      <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color }}>{children}</span>
      <span style={{ display: 'block', width: 36, height: 1, background: color }} />
    </div>
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
      hovering.current = !!(e.target as HTMLElement).closest('button, a, [role="button"], input')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseover', onOver)

    const tick = () => {
      ring.current.x += (pos.current.x - ring.current.x) * 0.12
      ring.current.y += (pos.current.y - ring.current.y) * 0.12
      const scale = hovering.current ? 1.7 : 1
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x - 4}px,${pos.current.y - 4}px)`
        dotRef.current.style.opacity   = hovering.current ? '0.4' : '1'
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${ring.current.x - 17}px,${ring.current.y - 17}px) scale(${scale})`
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
        width: 8, height: 8, borderRadius: '50%', background: IVORY,
        mixBlendMode: 'difference', willChange: 'transform',
      }} />
      <div ref={ringRef} style={{
        position: 'fixed', top: 0, left: 0, zIndex: 99998, pointerEvents: 'none',
        width: 34, height: 34, borderRadius: '50%',
        border: `1px solid rgba(233,234,240,0.65)`,
        mixBlendMode: 'difference', willChange: 'transform',
        transition: 'transform 0.07s ease',
      }} />
    </>
  )
}

// ── Entry tiles (perspective tunnel walls) ────────────────────────────────────
export const ENTRY_IMAGES: (string | null)[] = Array(16).fill(null)

interface EntryTile {
  key: string; w: number; h: number
  top?: string; bottom?: string; left?: string; right?: string
  ry: number; rx: number; delay: number
}

const ENTRY_TILES: EntryTile[] = [
  { key:'t1', w:265, h:162, top:'2%',  left:'1%',   ry:-18, rx:32,  delay:0    },
  { key:'t2', w:240, h:148, top:'1%',  left:'27%',  ry:-5,  rx:35,  delay:0.1  },
  { key:'t3', w:240, h:148, top:'1%',  left:'53%',  ry:5,   rx:35,  delay:0.2  },
  { key:'t4', w:265, h:162, top:'2%',  right:'1%',  ry:18,  rx:32,  delay:0.3  },
  { key:'l1', w:290, h:178, top:'16%', left:'-2%',  ry:-22, rx:3,   delay:0.05 },
  { key:'l2', w:215, h:132, top:'27%', left:'15%',  ry:-26, rx:0,   delay:0.18 },
  { key:'l3', w:285, h:175, top:'50%', left:'-2%',  ry:-21, rx:-3,  delay:0.32 },
  { key:'l4', w:215, h:132, top:'62%', left:'15%',  ry:-24, rx:-6,  delay:0.46 },
  { key:'r1', w:290, h:178, top:'16%', right:'-2%', ry:22,  rx:3,   delay:0.08 },
  { key:'r2', w:215, h:132, top:'27%', right:'15%', ry:26,  rx:0,   delay:0.22 },
  { key:'r3', w:285, h:175, top:'50%', right:'-2%', ry:21,  rx:-3,  delay:0.36 },
  { key:'r4', w:215, h:132, top:'62%', right:'15%', ry:24,  rx:-6,  delay:0.5  },
  { key:'b1', w:265, h:162, bottom:'2%', left:'1%',  ry:-18, rx:-32, delay:0.15 },
  { key:'b2', w:240, h:148, bottom:'1%', left:'27%', ry:-5,  rx:-35, delay:0.25 },
  { key:'b3', w:240, h:148, bottom:'1%', left:'53%', ry:5,   rx:-35, delay:0.35 },
  { key:'b4', w:265, h:162, bottom:'2%', right:'1%', ry:18,  rx:-32, delay:0.45 },
]

// ── Fond noir + fumée SOMBRE qui dérive (charbon, l'écran reste noir) ──────────
function SmokeBackground({ tint = false, subtle = false }: { tint?: boolean; subtle?: boolean }) {
  const k = subtle ? 0.6 : 1
  // Charbon foncé MAIS visible sur le noir → fumée sombre. Pas de vignette
  // (elle masquait la fumée qui est sur les bords).
  const smoke = (a: number) => `rgba(64,66,86,${(a * k).toFixed(3)})`
  const tinted = tint ? `rgba(78,72,120,${(0.85 * k).toFixed(3)})` : smoke(0.85)
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1, background: '#040405' }}>
      <div style={{ position: 'absolute', top: '0%',  left: '0%',  width: 820, height: 820, borderRadius: '50%', background: `radial-gradient(circle, ${smoke(0.95)}, transparent 68%)`, filter: 'blur(75px)', animation: 'sf-smoke-a 34s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '-4%', right: '2%', width: 900, height: 900, borderRadius: '50%', background: `radial-gradient(circle, ${smoke(0.9)}, transparent 68%)`, filter: 'blur(80px)', animation: 'sf-smoke-b 42s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '30%', left: '38%', width: 760, height: 760, borderRadius: '50%', background: `radial-gradient(circle, ${tinted}, transparent 68%)`, filter: 'blur(78px)', animation: 'sf-smoke-rise 48s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '48%', left: '10%', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle, ${smoke(0.8)}, transparent 68%)`, filter: 'blur(75px)', animation: 'sf-smoke-c 38s ease-in-out infinite' }} />
      {!subtle && <div style={{ position: 'absolute', top: '8%', right: '18%', width: 640, height: 640, borderRadius: '50%', background: `radial-gradient(circle, ${smoke(0.75)}, transparent 68%)`, filter: 'blur(70px)', animation: 'sf-smoke-a 52s ease-in-out infinite reverse' }} />}
    </div>
  )
}

// Vidéos affichées dans les téléphones de la démo. Pour les activer, dépose tes
// fichiers dans electron-app/public/showcase/ (1.mp4 … 8.mp4) PUIS ajoute leurs
// chemins ci-dessous. Laissé vide par défaut → jolis dégradés animés, sans 404.
const SHOWCASE_VIDEOS: string[] = []

// ── Mini-téléphone qui poste tout seul ───────────────────────────────────────
function AutoPhone({ i, grad, handle }: { i: number; grad: string; handle: string }) {
  const tr = useTr()
  const cycle = 6                       // durée d'un cycle (s)
  const delay = -(i * 0.85)             // décalage → effet de vague
  const a = (name: string) => `${name} ${cycle}s linear ${delay}s infinite`
  const [videoOk, setVideoOk] = useState(true)
  const src = SHOWCASE_VIDEOS.length ? SHOWCASE_VIDEOS[i % SHOWCASE_VIDEOS.length] : undefined
  return (
    <div style={{ animation: `sf-float-soft ${7 + (i % 4)}s ease-in-out ${i * 0.3}s infinite`, flexShrink: 0 }}>
      <div style={{
        width: 132, height: 270, borderRadius: 22, padding: 6, position: 'relative',
        background: 'linear-gradient(160deg,#141318,#0c0c10)', border: '1px solid rgba(255,255,255,0.07)',
        animation: a('sf-phone-flash'),
      }}>
        {/* écran */}
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', background: '#0a0a0d' }}>
          {/* reel — vraie vidéo si dispo, sinon dégradé */}
          <div style={{ position: 'absolute', inset: 0, background: grad }} />
          {videoOk && src && (
            <video
              src={src} autoPlay muted loop playsInline
              onError={() => setVideoOk(false)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.35), transparent 30%, transparent 60%, rgba(0,0,0,0.7))' }} />
          {/* play (uniquement sur le dégradé) */}
          {!(videoOk && src) && (
            <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 12, marginLeft: 2 }}>▶</span>
            </div>
          )}
          {/* top bar IG */}
          <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#a855f7)' }} />
            <span style={{ fontSize: 8.5, fontWeight: 700, color: '#fff' }}>{handle}</span>
          </div>
          {/* statut "en cours" */}
          <div style={{ position: 'absolute', bottom: 10, left: 8, right: 8, animation: a('sf-uploading') }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 4, letterSpacing: '0.03em' }}>{tr('PUBLICATION…', 'POSTING…')}</div>
            <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#6366F1,#a855f7)', animation: a('sf-upbar') }} />
            </div>
          </div>
          {/* statut "publié" */}
          <div style={{ position: 'absolute', bottom: 12, left: 8, right: 8, display: 'flex', alignItems: 'center', gap: 5, animation: a('sf-posted') }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#22c55e' }}>{tr('Publié', 'Posted')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Fond aurora animé (dégradés qui dérivent) ─────────────────────────────────
function Aurora() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ position: 'absolute', top: '-20%', left: '5%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.18), transparent 65%)', filter: 'blur(40px)', animation: 'sf-aurora-a 18s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '-25%', right: '0%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.15), transparent 65%)', filter: 'blur(50px)', animation: 'sf-aurora-b 22s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '30%', right: '30%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.10), transparent 65%)', filter: 'blur(40px)', animation: 'sf-aurora-a 26s ease-in-out infinite reverse' }} />
    </div>
  )
}

// ── Compteur qui s'incrémente quand il entre à l'écran ────────────────────────
function CountUp({ to, prefix = '', suffix = '', duration = 1900 }: { to: number; prefix?: string; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const start = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1)
          const eased = 1 - Math.pow(1 - p, 3)
          setVal(Math.round(eased * to))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        obs.disconnect()
      }
    }, { threshold: 0.4 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [to, duration])
  return <span ref={ref}>{prefix}{val.toLocaleString('fr-FR')}{suffix}</span>
}

// ── Bandeau de stats animées ──────────────────────────────────────────────────
function StatsBanner() {
  const tr = useTr()
  const stats = [
    { to: 500, suffix: '+', label: tr('comptes pilotés en parallèle', 'accounts driven in parallel') },
    { to: 1200, suffix: '+', label: tr('publications automatisées / jour', 'automated posts / day') },
    { to: 100, suffix: '%', label: tr('autonome — même PC éteint', 'autonomous — even with your PC off') },
    { to: 24, suffix: '/7', label: tr('cloud phones qui tournent', 'cloud phones running') },
  ]
  return (
    <section style={{ position: 'relative', padding: '70px 24px', background: BG, borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 120% at 50% 0%, rgba(99,102,241,0.08), transparent)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, position: 'relative' }}>
        {stats.map((s, i) => (
          <FadeIn key={i} delay={i * 0.08}>
            <div style={{ textAlign: 'center', padding: '8px 12px' }}>
              <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(34px,4.6vw,56px)', letterSpacing: '-0.03em', lineHeight: 1, background: 'linear-gradient(135deg,#E9EAF0,#818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontVariantNumeric: 'tabular-nums' }}>
                <CountUp to={s.to} suffix={s.suffix} />
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: FAINT, marginTop: 10, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}

// ── Stage 1 — Entrée cinématique ─────────────────────────────────────────────
function TunnelHero({ onEnter }: { onEnter: () => void }) {
  const tr = useTr()
  const [hover, setHover] = useState(false)

  return (
    <section style={{
      position: 'fixed', inset: 0,
      overflow: 'hidden',
      background: BG,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>

      {/* Fond noir + fumée */}
      <SmokeBackground />

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 700, height: 440,
        background: 'radial-gradient(ellipse closest-side, rgba(99,102,241,0.07), transparent)',
        filter: 'blur(60px)', pointerEvents: 'none', zIndex: 1,
      }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        background: `radial-gradient(ellipse 50% 52% at 50% 50%, transparent 0%, rgba(6,6,8,0.88) 100%)`,
      }} />

      {/* Brand */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', userSelect: 'none' }}>
        <div style={{ animation: 'sf-blur-in 1.1s cubic-bezier(0.16,1,0.3,1) 0.2s both' }}>
          <MicroLabel style={{ marginBottom: 30 }}>Instagram &amp; TikTok Automation Studio</MicroLabel>
        </div>

        {/* Halo qui respire derrière le wordmark */}
        <div aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', width: 'min(720px, 90vw)', height: 360, transform: 'translate(-50%,-50%)', background: 'radial-gradient(ellipse at center, rgba(129,140,248,0.16), transparent 68%)', filter: 'blur(50px)', pointerEvents: 'none', animation: 'sf-float 9s ease-in-out infinite' }} />
        <h1 style={{
          margin: '0 0 8px', position: 'relative',
          lineHeight: 0.92,
          animation: 'sf-blur-in 1.2s cubic-bezier(0.16,1,0.3,1) 0.45s both',
          overflow: 'hidden', padding: '0 0.1em',
        }}>
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(64px, 11vw, 150px)', letterSpacing: '-0.05em', color: IVORY }}>SCALE</span>
          <span className="sf-serif-shimmer" style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(66px, 11.5vw, 158px)', letterSpacing: '-0.02em', color: GOLD, marginLeft: '0.02em' }}>Flow</span>
          {/* light sweep */}
          <span aria-hidden style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '34%',
            background: 'linear-gradient(90deg, transparent, rgba(233,234,240,0.07), transparent)',
            animation: 'sf-beam 4.5s ease-in-out 1.8s infinite',
            pointerEvents: 'none',
          }} />
        </h1>

        <p style={{
          fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(17px, 1.8vw, 22px)',
          color: MUTED, margin: '16px 0 52px', letterSpacing: '0.01em',
          animation: 'sf-fade-in 1.4s ease 1s both',
        }}>
          {tr('L’usine de contenu des marques qui dominent Instagram & TikTok.', 'The content factory behind the brands that dominate Instagram & TikTok.')}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', animation: 'sf-fade-up 0.9s cubic-bezier(0.16,1,0.3,1) 1.25s both' }}>
          <button
            onClick={onEnter}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              position: 'relative', overflow: 'hidden',
              padding: '17px 66px', borderRadius: 0,
              background: hover ? IVORY : 'transparent',
              color: hover ? '#0F1014' : IVORY,
              fontFamily: SANS, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.34em', textTransform: 'uppercase',
              border: `1px solid ${hover ? IVORY : 'rgba(233,234,240,0.35)'}`,
              cursor: 'pointer',
              transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {tr('Entrer', 'Enter')}
          </button>
        </div>
      </div>

      {/* Footer line */}
      <div style={{
        position: 'absolute', bottom: 30, left: 0, right: 0, zIndex: 10,
        display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center',
        animation: 'sf-fade-in 1.5s ease 1.6s both',
      }}>
        <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: FAINT }}>Paris — Worldwide</span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: FAINT }} />
        <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: FAINT }}>MMXXVI</span>
      </div>
    </section>
  )
}

// ── Stage 2 — Choix (Découvrir / Studio) avec inversion ivoire ───────────────
function RevealScreen({ onDiscover, onStudio }: { onDiscover: () => void; onStudio: () => void }) {
  const tr = useTr()
  const [hoverTop, setHoverTop] = useState(false)
  const [hoverBot, setHoverBot] = useState(false)
  const [visible,  setVisible]  = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 30); return () => clearTimeout(t) }, [])

  const half = (
    hovered: boolean,
    setHovered: (v: boolean) => void,
    onClick: () => void,
    num: string,
    word: string,
    serifWord: string,
    sub: string,
    delay: string,
  ) => (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick() }}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hovered ? '#D6D7DE' : 'transparent',
        cursor: 'none', position: 'relative', overflow: 'hidden', zIndex: 1,
        transition: 'background 0.55s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Number — corner */}
      <span style={{
        position: 'absolute', top: 26, left: 38,
        fontFamily: SERIF, fontStyle: 'normal', fontSize: 17,
        color: hovered ? 'rgba(10,10,12,0.4)' : FAINT,
        transition: 'color 0.4s',
        opacity: visible ? 1 : 0,
      }}>{num}</span>

      <div style={{
        textAlign: 'center',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(26px)',
        transition: `opacity 0.7s ${delay}, transform 0.7s ${delay} cubic-bezier(0.16,1,0.3,1)`,
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ lineHeight: 0.92, userSelect: 'none', whiteSpace: 'nowrap' }}>
          <span style={{
            fontFamily: SANS, fontWeight: 900, letterSpacing: '-0.04em',
            fontSize: 'clamp(40px, 7.5vw, 104px)',
            color: hovered ? '#0F1014' : IVORY,
            transition: 'color 0.45s',
          }}>{word}</span>
          <span className={hovered ? undefined : 'sf-flow-text'} style={{
            fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400,
            fontSize: 'clamp(42px, 7.9vw, 112px)', letterSpacing: '-0.01em',
            color: hovered ? '#0F1014' : GOLD,
            transition: 'color 0.45s',
            marginLeft: '0.13em',
          }}>{serifWord}</span>
        </div>
        <div style={{
          marginTop: 20, fontFamily: SANS, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.3em', textTransform: 'uppercase',
          color: hovered ? 'rgba(10,10,12,0.55)' : FAINT,
          transition: 'color 0.45s',
        }}>
          {sub}
        </div>
      </div>

      {/* Arrow */}
      <div style={{
        position: 'absolute', right: 54,
        color: hovered ? '#0F1014' : FAINT,
        opacity: hovered ? 1 : 0,
        transform: hovered ? 'translateX(0)' : 'translateX(-14px)',
        transition: 'opacity 0.35s, transform 0.35s, color 0.35s', zIndex: 2,
      }}>
        <Icon name="arrow-right" size={30} />
      </div>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column',
      animation: 'reveal-in 0.55s cubic-bezier(0.16,1,0.3,1) both',
      overflow: 'hidden', cursor: 'none',
      background: BG,
    }}>
      {/* Fond fumée discret */}
      <SmokeBackground tint subtle />

      {/* Brand top center */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, display: 'flex', justifyContent: 'center', padding: '24px 0', pointerEvents: 'none', opacity: visible ? 1 : 0, transition: 'opacity 0.5s 0.1s' }}>
        <Wordmark size={14} />
      </div>

      {half(hoverTop, setHoverTop, onDiscover, '— 01', tr('DÉCOUVRIR', 'DISCOVER'), 'ScaleFlow', tr('Manifeste · Fonctionnalités · Tarifs', 'Manifesto · Features · Pricing'), '0.15s')}

      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${HAIR} 20%, rgba(99,102,241,0.35) 50%, ${HAIR} 80%, transparent)`, flexShrink: 0, zIndex: 10 }} />

      {half(hoverBot, setHoverBot, onStudio, '— 02', tr('LE', 'THE'), 'Studio', tr('Connexion · Mass Posting · Cloud Phones', 'Login · Mass Posting · Cloud Phones'), '0.28s')}
    </div>
  )
}

// ── Marquee strip ─────────────────────────────────────────────────────────────
function Marquee({ items, dark = false }: { items: string[]; dark?: boolean }) {
  const row = [...items, ...items, ...items, ...items]
  return (
    <div style={{ overflow: 'hidden', borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}`, padding: '20px 0', background: dark ? '#050507' : 'transparent' }}>
      <div style={{ display: 'flex', gap: 0, width: 'max-content', animation: 'sf-marquee 36s linear infinite' }}>
        {row.map((it, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 28, paddingRight: 28 }}>
            <span style={{
              fontFamily: i % 2 === 0 ? SANS : SERIF,
              fontStyle: i % 2 === 0 ? 'normal' : 'italic',
              fontWeight: i % 2 === 0 ? 800 : 400,
              fontSize: i % 2 === 0 ? 13 : 15,
              letterSpacing: i % 2 === 0 ? '0.22em' : '0.02em',
              textTransform: i % 2 === 0 ? 'uppercase' : 'none',
              color: i % 2 === 0 ? FAINT : 'rgba(99,102,241,0.5)',
              whiteSpace: 'nowrap',
            }}>{it}</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(99,102,241,0.35)', flexShrink: 0 }} />
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Hero du site (page Découvrir) ────────────────────────────────────────────
function SiteHero({ onStudio }: { onStudio: () => void }) {
  const tr = useTr()
  const [ctaHover, setCtaHover] = useState(false)

  // Dégradés de marque (maquette) — cyan pour « 100+ comptes », indigo→rose pour « un seul clic ».
  const CYAN_GRAD   = 'linear-gradient(90deg,#22D3EE,#67E8F9)'
  const CLICK_GRAD  = 'linear-gradient(90deg,#818CF8,#C4B5FD 55%,#F472B6)'
  const BRAND_GRAD  = 'linear-gradient(120deg,#22D3EE,#818CF8 46%,#A855F7)'
  const gradText = (g: string): React.CSSProperties => ({ background: g, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' })

  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: BG, display: 'flex', flexDirection: 'column' }}>
      {/* Halo d'ambiance centré (aurora douce) */}
      <div aria-hidden style={{ position: 'absolute', top: -80, left: '50%', width: 900, height: 620, transform: 'translateX(-50%)', background: 'radial-gradient(ellipse 60% 55% at 50% 30%, rgba(124,58,237,0.22), transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Contenu centré */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '96px 24px 40px', maxWidth: 1000, margin: '0 auto' }}>
        {/* Badge pill */}
        <FadeIn>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 16px', borderRadius: 99, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, marginBottom: 34 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 10px #34D399', animation: 'sf-status-pulse 2.4s ease-in-out infinite' }} />
            <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: 'rgba(226,222,255,0.85)' }}>{tr('Automatisation Instagram & TikTok multi-comptes', 'Multi-account Instagram & TikTok automation')}</span>
          </div>
        </FadeIn>

        {/* H1 maquette */}
        <FadeIn delay={0.08}>
          <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(44px, 7.2vw, 82px)', lineHeight: 1.02, letterSpacing: '-0.03em', color: IVORY, maxWidth: 900 }}>
            {tr('Publie sur ', 'Post to ')}
            <span style={gradText(CYAN_GRAD)}>{tr('100+ comptes', '100+ accounts')}</span><br />
            {tr('en ', 'in ')}<span style={gradText(CLICK_GRAD)}>{tr('un seul clic', 'a single click')}</span>.
          </h1>
        </FadeIn>

        {/* Sous-titre */}
        <FadeIn delay={0.16}>
          <p style={{ fontFamily: SANS, fontSize: 17, color: MUTED, margin: '26px auto 40px', lineHeight: 1.65, maxWidth: 560, fontWeight: 400 }}>
            {tr('Mass posting, programmation, warmup et remix vidéo réunis dans ', 'Mass posting, scheduling, warmup and video remix in ')}
            <span style={{ color: IVORY, fontWeight: 600 }}>{tr('un seul poste de pilotage', 'one control center')}</span>.
            {tr(' Ce qui te prenait la semaine se fait en 5 minutes.', ' What used to take a week now takes 5 minutes.')}
          </p>
        </FadeIn>

        {/* CTAs */}
        <FadeIn delay={0.24}>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onStudio}
              onMouseEnter={() => setCtaHover(true)} onMouseLeave={() => setCtaHover(false)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, padding: '15px 30px', borderRadius: 12,
                background: BRAND_GRAD, border: 'none', color: '#0A0A16',
                fontFamily: SANS, fontSize: 14.5, fontWeight: 800, cursor: 'pointer',
                boxShadow: ctaHover ? '0 0 44px -6px rgba(129,140,248,1)' : '0 0 28px -8px rgba(129,140,248,0.7)',
                transform: ctaHover ? 'translateY(-1px)' : 'none',
                transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
              }}>
              {tr('Commencer gratuitement', 'Start for free')} <Icon name="arrow-right" size={16} />
            </button>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, padding: '15px 30px', borderRadius: 12,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, color: IVORY,
                fontFamily: SANS, fontSize: 14.5, fontWeight: 700, textDecoration: 'none', transition: 'all 0.25s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = HAIR as string; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}>
              <Icon name="download" size={16} /> {tr('Télécharger pour Windows', 'Download for Windows')}
            </a>
          </div>
        </FadeIn>

        {/* Micro-réassurances */}
        <FadeIn delay={0.3}>
          <div style={{ display: 'flex', gap: 22, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            {[tr('Sans carte bancaire', 'No credit card'), tr('Windows, Mac & Web', 'Windows, Mac & Web'), tr('Setup en < 5 min', 'Setup in < 5 min')].map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: 'rgba(196,181,253,0.6)' }}>
                <span style={{ color: '#34D399' }}>✓</span> {t}
              </span>
            ))}
          </div>
        </FadeIn>

        {/* Stats maquette : 100+ / 1 M+ / 15h */}
        <FadeIn delay={0.4}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, marginTop: 64, width: '100%', maxWidth: 680 }}>
            {[
              { node: <CountUp to={100} suffix="+" />, l: tr('comptes en parallèle', 'accounts in parallel') },
              { node: <>1 M+</>,                        l: tr('posts publiés', 'posts published') },
              { node: <>15h</>,                         l: tr('gagnées / semaine', 'saved / week') },
            ].map((s, i) => (
              <div key={i} style={{ padding: '20px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.025)', border: `1px solid ${HAIR}` }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(24px, 3.2vw, 34px)', color: IVORY, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{s.node}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: MUTED, marginTop: 8 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>

      {/* Marquee bas */}
      <div style={{ position: 'relative', zIndex: 10, marginTop: 40 }}>
        <Marquee items={[tr('Mass Posting', 'Mass Posting'), tr('Précision', 'Precision'), tr('Multi-Comptes', 'Multi-Account'), tr('Élégance', 'Elegance'), tr('Reels & Stories', 'Reels & Stories'), tr('Échelle', 'Scale'), tr('Cloud Phones', 'Cloud Phones'), tr('Autonomie', 'Autonomy'), tr('Intelligence Artificielle', 'Artificial Intelligence'), tr('Vitesse', 'Speed')]} />
      </div>
    </section>
  )
}

// ── Features — liste éditoriale numérotée ────────────────────────────────────
const FEATURES: { num: string; title: string; titleEn: string; serif: string; serifEn: string; text: string; textEn: string; icon: IconName }[] = [
  { num: '01', title: 'Mass',      titleEn: 'Mass',       serif: 'Posting',    serifEn: 'Posting',    icon: 'send',            text: "Des dizaines de comptes Instagram & TikTok publient en parallèle. Sélectionne, lance — chaque téléphone s’éteint après sa publication. Sans surveillance.", textEn: 'Dozens of Instagram & TikTok accounts post in parallel. Select, launch — each phone shuts down after its post. No supervision.' },
  { num: '02', title: 'Banque de', titleEn: 'Content',    serif: 'contenu',    serifEn: 'bank',       icon: 'folder-archive',  text: 'Ta vidéothèque cloud, organisée par dossiers et partagée avec ton organisation. Import drag & drop, miniatures automatiques.', textEn: 'Your cloud video library, organized by folders and shared with your organization. Drag & drop import, automatic thumbnails.' },
  { num: '03', title: 'Remix &',   titleEn: 'Remix &',    serif: 'Spoof',      serifEn: 'Spoof',      icon: 'shuffle',         text: 'Des copies uniques générées par FFmpeg : luminosité, grain, zoom, recadrage, teinte. Le duplicate content ne te concerne plus.', textEn: 'Unique copies generated by FFmpeg: brightness, grain, zoom, cropping, hue. Duplicate content is no longer your problem.' },
  { num: '04', title: 'Outils',    titleEn: 'AI',         serif: 'IA',         serifEn: 'tools',      icon: 'bot',             text: 'Scripts, hooks, captions virales, analyse de miniatures. Llama et Claude Vision intégrés directement dans ton flux de travail.', textEn: 'Scripts, hooks, viral captions, thumbnail analysis. Llama and Claude Vision built right into your workflow.' },
  { num: '05', title: 'Programmation', titleEn: 'Scheduling', serif: '',          serifEn: '',           icon: 'calendar',        text: "Planifie tes publications à l’avance. Le scheduler s’exécute dans le cloud, même application fermée.", textEn: 'Schedule your posts in advance. The scheduler runs in the cloud, even with the app closed.' },
  { num: '06', title: 'Suivi',     titleEn: 'Real-time',  serif: 'temps réel', serifEn: 'monitoring', icon: 'smartphone',      text: 'Le statut de chaque cloud phone, en direct. Sessions Instagram, groupes, batteries — tout sous contrôle.', textEn: 'The status of every cloud phone, live. Instagram sessions, groups, batteries — all under control.' },
]

function FeatureRow({ f, index }: { f: typeof FEATURES[number]; index: number }) {
  const tr = useTr()
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  return (
    <FadeIn delay={index * 0.05}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
        }}
        style={{
          display: 'flex', flexDirection: 'column', gap: 14,
          height: '100%',
          padding: '26px 24px', borderRadius: 18,
          background: 'rgba(255,255,255,0.025)',
          border: `1px solid ${hover ? 'rgba(139,92,246,0.3)' : HAIR}`,
          transform: hover ? 'translateY(-4px)' : 'none',
          boxShadow: hover ? '0 22px 50px -22px rgba(0,0,0,0.65)' : 'none',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
          cursor: 'default',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* spotlight qui suit le curseur */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(420px circle at ${pos.x}% ${pos.y}%, rgba(99,102,241,0.14), transparent 60%)`,
          opacity: hover ? 1 : 0, transition: 'opacity 0.3s',
        }} />
        {/* Icon tile — dégradé de marque */}
        <div style={{
          width: 46, height: 46, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
          boxShadow: '0 8px 20px -8px rgba(139,92,246,0.6)',
          transform: hover ? 'scale(1.06) rotate(-4deg)' : 'none', transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
          position: 'relative', zIndex: 1,
        }}>
          <Icon name={f.icon} size={20} />
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(129,140,248,0.7)', marginBottom: 8 }}>{f.num}</div>
          <h3 style={{ margin: '0 0 8px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em', color: IVORY }}>
            {tr(f.title, f.titleEn)} {tr(f.serif, f.serifEn)}
          </h3>
          <p style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0 }}>{tr(f.text, f.textEn)}</p>
        </div>
      </div>
    </FadeIn>
  )
}

// ── Pricing data ──────────────────────────────────────────────────────────────
type PlanFeature = { text: string; textEn: string; included: boolean }
interface PlanDef {
  name: string; nameEn: string; tagline: string; taglineEn: string
  credits: string; creditsEn: string
  perAccount: string; perAccountEn: string
  monthlyPrice: string; yearlyPrice: string
  originalMonthly: string; discount: string; yearlyBilled: string; yearlyBilledEn: string
  popular?: boolean; bestValue?: boolean
  btnLabel: string; btnLabelEn: string
  features: PlanFeature[]
}
const PLANS: PlanDef[] = [
  {
    name: 'Standard', nameEn: 'Standard', tagline: 'Pour débuter', taglineEn: 'To get started',
    credits: '3 750 crédits / mois', creditsEn: '3,750 credits / month',
    perAccount: '≈ 25 comptes · 2,00$ / compte', perAccountEn: '≈ 25 accounts · $2.00 / account',
    monthlyPrice: '49,99$', yearlyPrice: '49,99$',
    originalMonthly: '', discount: '', yearlyBilled: '', yearlyBilledEn: '',
    btnLabel: 'Choisir Standard', btnLabelEn: 'Choose Standard',
    features: [
      { text: '100 téléphones max',              textEn: 'Up to 100 phones',            included: true  },
      { text: 'Accès aux outils de base',       textEn: 'Access to core tools',        included: true  },
      { text: 'Mass Posting (10 comptes max)',   textEn: 'Mass Posting (up to 10 accounts)', included: true  },
      { text: 'Création de contenu (Remix, Spoof…)', textEn: 'Content creation (Remix, Spoof…)', included: false },
      { text: 'Support prioritaire',             textEn: 'Priority support',            included: false },
      { text: 'Organisations multi-membres',     textEn: 'Multi-member organizations',  included: false },
    ],
  },
  {
    name: 'Pro', nameEn: 'Pro', tagline: 'Scale ton agence', taglineEn: 'Scale your agency',
    credits: '11 250 crédits / mois', creditsEn: '11,250 credits / month',
    perAccount: '≈ 75 comptes · 1,33$ / compte', perAccountEn: '≈ 75 accounts · $1.33 / account',
    monthlyPrice: '99,99$', yearlyPrice: '59,99$',
    originalMonthly: '99,99$', discount: '−40%', yearlyBilled: '719,88$ facturé annuellement', yearlyBilledEn: '$719.88 billed annually',
    popular: true,
    btnLabel: 'Choisir Pro', btnLabelEn: 'Choose Pro',
    features: [
      { text: '200 téléphones max',              textEn: 'Up to 200 phones',            included: true  },
      { text: 'Accès à tous les outils',         textEn: 'Access to all tools',         included: true  },
      { text: 'Création de contenu (Remix, Spoof…) — gratuit', textEn: 'Content creation (Remix, Spoof…) — free', included: true  },
      { text: 'Mass Posting illimité',            textEn: 'Unlimited Mass Posting',      included: true  },
      { text: 'Support prioritaire',              textEn: 'Priority support',            included: true  },
      { text: 'Organisations multi-membres',      textEn: 'Multi-member organizations',  included: true  },
    ],
  },
  {
    name: 'Organisation', nameEn: 'Organization', tagline: 'Puissance illimitée', taglineEn: 'Unlimited power',
    credits: '22 500 crédits / mois', creditsEn: '22,500 credits / month',
    perAccount: '150 comptes · 1,00$ / compte', perAccountEn: '150 accounts · $1.00 / account',
    monthlyPrice: '149,99$', yearlyPrice: '89,99$',
    originalMonthly: '149,99$', discount: '−40%', yearlyBilled: '1 079,88$ facturé annuellement', yearlyBilledEn: '$1,079.88 billed annually',
    bestValue: true,
    btnLabel: 'Choisir Organisation', btnLabelEn: 'Choose Organization',
    features: [
      { text: 'Téléphones illimités',            textEn: 'Unlimited phones',            included: true  },
      { text: 'Accès à tous les outils',         textEn: 'Access to all tools',         included: true  },
      { text: 'Création de contenu (Remix, Spoof…) — gratuit', textEn: 'Content creation (Remix, Spoof…) — free', included: true  },
      { text: 'Mass Posting illimité',            textEn: 'Unlimited Mass Posting',      included: true  },
      { text: 'Support prioritaire 24/7',         textEn: '24/7 priority support',       included: true  },
      { text: 'Organisations multi-membres',      textEn: 'Multi-member organizations',  included: true  },
    ],
  },
]

const CREDIT_PACKS = [
  { name: 'Mini',  credits: '1 000',  price: '12,99$',  note: '~6 comptes / mois',   noteEn: '~6 accounts / month'   },
  { name: 'Plus',  credits: '2 500',  price: '27,99$',  note: '~16 comptes / mois',  noteEn: '~16 accounts / month'  },
  { name: 'Mega',  credits: '6 000',  price: '54,99$',  note: '40 comptes · Populaire', noteEn: '40 accounts · Popular' },
  { name: 'Giga',  credits: '15 000', price: '119,99$', note: '100 comptes / mois',  noteEn: '100 accounts / month'  },
  { name: 'Ultra', credits: '40 000', price: '289,99$', note: '266 comptes · Top valeur', noteEn: '266 accounts · Best value' },
]

// ── Pricing — luxe : carte "Pro" inversée en ivoire ──────────────────────────
function PricingSection() {
  const tr = useTr()
  const [yearly, setYearly] = useState(false)

  return (
    <section id="pricing" style={{ position: 'relative', zIndex: 1, padding: '120px 24px', overflow: 'hidden' }}>
      <Aurora />
      <div style={{ maxWidth: 1080, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 26 }}>{tr('Investissement', 'Investment')}</MicroLabel>
            <h2 style={{ margin: '0 0 34px', lineHeight: 1, letterSpacing: '-0.04em' }}>
              <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(34px, 5vw, 62px)', color: IVORY }}>{tr('Trois plans. ', 'Three plans. ')}</span>
              <span className="sf-serif-shimmer" style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(36px, 5.3vw, 66px)', color: GOLD }}>{tr('Zéro limite.', 'Zero limits.')}</span>
            </h2>
            {/* Billing toggle */}
            <div style={{ display: 'inline-flex', border: `1px solid ${HAIR}`, padding: 3, gap: 0 }}>
              {[
                { v: false, label: tr('Mensuel', 'Monthly') },
                { v: true,  label: tr('Annuel · −40%', 'Yearly · −40%') },
              ].map(opt => (
                <button key={String(opt.v)} onClick={() => setYearly(opt.v)} style={{
                  padding: '9px 26px', fontSize: 11, fontWeight: 700,
                  fontFamily: SANS, letterSpacing: '0.18em', textTransform: 'uppercase',
                  background: yearly === opt.v ? IVORY : 'transparent',
                  color: yearly === opt.v ? '#0F1014' : MUTED,
                  border: 'none', cursor: 'pointer', transition: 'all 0.3s',
                }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Plan cards — maquette : cartes séparées arrondies, Pro en bordure dégradée */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 100 }}>
          {PLANS.map((p, i) => {
            const inverted = false  // maquette : toutes les cartes sombres
            return (
              <FadeIn key={p.name} delay={i * 0.08} style={{ display: 'flex', flex: 1 }}>
                <div
                  className="sf-plan-card"
                  style={{
                    position: 'relative',
                    borderRadius: 20,
                    background: p.popular
                      ? 'linear-gradient(#0A0A1C,#0A0A1C) padding-box, linear-gradient(135deg,#22D3EE,#818CF8,#A855F7) border-box'
                      : 'rgba(255,255,255,0.025)',
                    border: p.popular ? '1.5px solid transparent' : `1px solid ${HAIR}`,
                    boxShadow: p.popular ? '0 30px 80px -30px rgba(124,58,237,0.5)' : 'none',
                    display: 'flex', flexDirection: 'column',
                    padding: '40px 34px',
                    flex: 1,
                  }}
                >
                  {p.popular && (
                    <span style={{
                      position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                      padding: '5px 16px', borderRadius: 99,
                      background: 'linear-gradient(120deg,#22D3EE,#818CF8 46%,#A855F7)', color: '#0A0A16',
                      fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>{tr('Populaire', 'Popular')}</span>
                  )}
                  {/* Tag */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 30 }}>
                    <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 17, color: inverted ? 'rgba(10,10,12,0.5)' : FAINT }}>0{i + 1}</span>
                    {(p.popular || p.bestValue) && (
                      <span style={{
                        fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase',
                        color: inverted ? '#0F1014' : GOLD,
                        borderBottom: `1px solid ${inverted ? '#0F1014' : 'rgba(99,102,241,0.5)'}`,
                        paddingBottom: 3,
                      }}>
                        {p.popular ? tr('Le plus choisi', 'Most chosen') : tr('Meilleure valeur', 'Best value')}
                      </span>
                    )}
                  </div>

                  <h3 style={{ margin: '0 0 4px', fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: inverted ? '#0F1014' : IVORY }}>{tr(p.name, p.nameEn)}</h3>
                  <p style={{ margin: '0 0 30px', fontFamily: SERIF, fontStyle: 'normal', fontSize: 15, color: inverted ? 'rgba(10,10,12,0.55)' : MUTED }}>{tr(p.tagline, p.taglineEn)}</p>

                  {/* Price */}
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    {yearly && p.originalMonthly && (
                      <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 17, color: inverted ? 'rgba(10,10,12,0.35)' : FAINT, textDecoration: 'line-through' }}>{p.originalMonthly}</span>
                    )}
                    <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 52, letterSpacing: '-0.05em', lineHeight: 1, color: inverted ? '#0F1014' : IVORY }}>
                      {yearly ? p.yearlyPrice : p.monthlyPrice}
                    </span>
                    <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 16, color: inverted ? 'rgba(10,10,12,0.5)' : MUTED }}>{tr('/mois', '/month')}</span>
                    {yearly && p.discount && (
                      <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: inverted ? '#0F1014' : GOLD }}>{p.discount}</span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 6px', fontFamily: SANS, fontSize: 11, color: inverted ? 'rgba(10,10,12,0.45)' : FAINT, minHeight: 14 }}>
                    {yearly && p.yearlyBilled ? tr(p.yearlyBilled, p.yearlyBilledEn) : ' '}
                  </p>
                  <p style={{ margin: '0 0 8px', fontFamily: SANS, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: inverted ? 'rgba(10,10,12,0.6)' : 'rgba(99,102,241,0.7)' }}>
                    {tr(p.credits, p.creditsEn)}
                  </p>
                  <div style={{
                    margin: '0 0 10px', padding: '9px 12px', borderRadius: 10,
                    background: inverted ? 'rgba(10,10,12,0.06)' : 'rgba(99,102,241,0.12)',
                    border: `1px solid ${inverted ? 'rgba(10,10,12,0.15)' : 'rgba(99,102,241,0.3)'}`,
                  }}>
                    <p style={{ margin: 0, fontFamily: SANS, fontSize: 15, fontWeight: 900, color: inverted ? '#0F1014' : IVORY, lineHeight: 1.2 }}>
                      {tr(p.perAccount, p.perAccountEn)}
                    </p>
                  </div>
                  <p style={{ margin: '0 0 24px', fontFamily: SANS, fontSize: 10.5, color: inverted ? 'rgba(10,10,12,0.5)' : FAINT, lineHeight: 1.4 }}>
                    {tr('Base : 2 posts + 1 story / jour / compte', 'Basis: 2 posts + 1 story / day / account')}
                  </p>

                  <div style={{ height: 1, background: inverted ? 'rgba(10,10,12,0.12)' : HAIR, marginBottom: 24 }} />

                  {/* Features */}
                  <ul style={{ listStyle: 'none', margin: '0 0 auto', padding: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
                    {p.features.map(f => (
                      <li key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ flexShrink: 0, color: f.included ? (inverted ? '#0F1014' : GOLD) : (inverted ? 'rgba(10,10,12,0.25)' : 'rgba(233,234,240,0.15)'), display: 'flex' }}>
                          {f.included
                            ? <Icon name="check" size={13} />
                            : <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M5 12h14" /></svg>}
                        </span>
                        <span style={{
                          fontFamily: SANS, fontSize: 13,
                          color: f.included ? (inverted ? 'rgba(10,10,12,0.85)' : 'rgba(233,234,240,0.78)') : (inverted ? 'rgba(10,10,12,0.3)' : FAINT),
                        }}>{tr(f.text, f.textEn)}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA — Pro en dégradé de marque, les autres en contour */}
                  <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                    style={{
                      display: 'block', textAlign: 'center', marginTop: 34,
                      padding: '15px', borderRadius: 12,
                      fontFamily: SANS, fontSize: 13, fontWeight: p.popular ? 800 : 700, letterSpacing: '0.02em',
                      textDecoration: 'none',
                      background: p.popular ? 'linear-gradient(120deg,#22D3EE,#818CF8 46%,#A855F7)' : 'rgba(255,255,255,0.03)',
                      color: p.popular ? '#0A0A16' : IVORY,
                      border: p.popular ? 'none' : `1px solid ${HAIR}`,
                      boxShadow: p.popular ? '0 0 28px -8px rgba(129,140,248,0.7)' : 'none',
                      transition: 'all 0.25s',
                    }}
                    onMouseEnter={e => {
                      if (p.popular) { e.currentTarget.style.boxShadow = '0 0 44px -6px rgba(129,140,248,1)'; e.currentTarget.style.transform = 'translateY(-1px)' }
                      else { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }
                    }}
                    onMouseLeave={e => {
                      if (p.popular) { e.currentTarget.style.boxShadow = '0 0 28px -8px rgba(129,140,248,0.7)'; e.currentTarget.style.transform = 'none' }
                      else { e.currentTarget.style.borderColor = HAIR as string; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }
                    }}>
                    {tr(p.btnLabel, p.btnLabelEn)}
                  </a>
                </div>
              </FadeIn>
            )
          })}
        </div>

        {/* Hypothèse d'usage pour l'estimation « comptes » — bien mise en avant */}
        <FadeIn>
          <div style={{
            margin: '0 auto 56px', maxWidth: 680, padding: '18px 22px', borderRadius: 14,
            background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.35)',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>📊</span>
            <p style={{ textAlign: 'left', margin: 0, fontFamily: SANS, fontSize: 14, color: IVORY, lineHeight: 1.6 }}>
              {tr('Estimation comptes basée sur une ', 'Account estimate based on ')}<strong style={{ color: GOLD }}>{tr('utilisation standard : 2 posts + 1 story par jour et par compte', 'standard usage: 2 posts + 1 story per day per account')}</strong>{tr(' (≈ 150 crédits/compte/mois — 2 crédits/post, 1 crédit/story). Les outils vidéo (Remix, Spoof) sont ', ' (≈ 150 credits/account/month — 2 credits/post, 1 credit/story). Video tools (Remix, Spoof) are ')}<strong style={{ color: GOLD }}>{tr('gratuits', 'free')}</strong>{tr(', et les crédits non utilisés ', ', and unused credits ')}<strong style={{ color: GOLD }}>{tr('se cumulent', 'roll over')}</strong>{tr(' d\'un mois sur l\'autre.', ' from one month to the next.')}
            </p>
          </div>
        </FadeIn>

        {/* ── Credit packs — ligne éditoriale ── */}
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h3 style={{ margin: '0 0 10px', lineHeight: 1 }}>
              <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(24px, 3.4vw, 40px)', letterSpacing: '-0.03em', color: IVORY }}>{tr('Packs de ', 'Credit ')}</span>
              <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(26px, 3.6vw, 43px)', color: GOLD }}>{tr('crédits', 'packs')}</span>
            </h3>
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: MUTED, margin: 0 }}>{tr('Recharge à tout moment — les crédits n’expirent jamais.', 'Top up anytime — credits never expire.')}</p>
          </div>
        </FadeIn>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1, background: HAIR, border: `1px solid ${HAIR}` }}>
          {CREDIT_PACKS.map((pack, i) => (
            <FadeIn key={pack.name} delay={i * 0.06} style={{ display: 'flex' }}>
              <div
                style={{ background: BG, padding: '34px 26px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'background 0.3s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(233,234,240,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = BG)}
              >
                <p style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: pack.note ? GOLD : FAINT, margin: '0 0 18px', minHeight: 12 }}>
                  {pack.note ? tr(pack.note, pack.noteEn) : pack.name}
                </p>
                <p style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 42, color: IVORY, margin: '0 0 2px', lineHeight: 1 }}>{pack.credits}</p>
                <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: FAINT, margin: '0 0 22px' }}>{tr('crédits', 'credits')}</p>
                <p style={{ fontFamily: SANS, fontWeight: 900, fontSize: 26, letterSpacing: '-0.03em', color: IVORY, margin: '0 0 24px' }}>{pack.price}</p>
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                  style={{
                    marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8,
                    fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase',
                    color: IVORY, textDecoration: 'none', borderBottom: `1px solid rgba(233,234,240,0.3)`, paddingBottom: 4,
                    transition: 'color 0.25s, border-color 0.25s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = GOLD; e.currentTarget.style.borderColor = GOLD }}
                  onMouseLeave={e => { e.currentTarget.style.color = IVORY; e.currentTarget.style.borderColor = 'rgba(233,234,240,0.3)' }}>
                  {tr('Acheter', 'Buy')} <Icon name="arrow-up-right" size={11} />
                </a>
              </div>
            </FadeIn>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontFamily: SANS, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: FAINT, marginTop: 32 }}>
          {tr('Activation via Telegram · Crypto ou virement · Immédiat', 'Activation via Telegram · Crypto or bank transfer · Instant')}
        </p>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const QA = [
  { q: "C’est quoi ScaleFlow ?",          qEn: 'What is ScaleFlow?',                a: "Une app pour gérer en masse tes comptes Instagram : poster sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives.", aEn: 'An app to manage your Instagram accounts at scale: post on dozens of phones in parallel, organize your video bank, see live stats, and automate repetitive tasks.' },
  { q: "J’ai besoin de quoi ?",           qEn: 'What do I need?',                   a: "Un abonnement GéeLark (cloud phones) + ton bearer token. ScaleFlow se connecte à GéeLark pour piloter tes téléphones virtuels.", aEn: 'A GeeLark subscription (cloud phones) + your bearer token. ScaleFlow connects to GeeLark to drive your virtual phones.' },
  { q: "Différence Standard vs Pro ?",   qEn: 'Standard vs Pro difference?',       a: "Standard = 3 750 crédits/mois + outils de base. Pro = 11 250 crédits + Mass Posting illimité + organisations multi-membres + support prioritaire.", aEn: 'Standard = 3,750 credits/month + core tools. Pro = 11,250 credits + unlimited Mass Posting + multi-member organizations + priority support.' },
  { q: "C’est risqué pour mes comptes ?", qEn: 'Is it risky for my accounts?',      a: "ScaleFlow utilise GéeLark qui simule de vrais devices avec leurs propres IPs/sessions. Warmup intégré pour respecter les rythmes humains.", aEn: 'ScaleFlow uses GeeLark, which simulates real devices with their own IPs/sessions. Built-in warmup to respect human rhythms.' },
  { q: "Version web ou téléchargement ?", qEn: 'Web version or download?',          a: "Les deux. L’Electron (.exe/.dmg) est plus rapide. La version web est accessible depuis n’importe où.", aEn: 'Both. The Electron app (.exe/.dmg) is faster. The web version is accessible from anywhere.' },
  { q: "Comment contacter le support ?",  qEn: 'How do I contact support?',         a: "Via Telegram (@justquentin), réponse en moins d'1h. Ou via les tickets dans l’app.", aEn: 'Via Telegram (@justquentin), reply in under 1h. Or through the in-app tickets.' },
]

// ── Telegram icon ─────────────────────────────────────────────────────────────
const TGIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
  </svg>
)

// ── Studio auth — split cinématique ───────────────────────────────────────────
function StudioAuth({ onBack }: { onBack: () => void }) {
  const tr = useTr()
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
        if (password !== confirm) throw new Error(tr('Les mots de passe ne correspondent pas.', 'Passwords do not match.'))
        if (password.length < 6) throw new Error(tr('Mot de passe trop court (6 caractères min).', 'Password too short (6 characters min).'))
        const { data, error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        if (data.user && !data.session) setSuccess(tr('Compte créé ! Vérifie ta boîte mail.', 'Account created! Check your inbox.'))
      }
    } catch (err: any) {
      const raw = err instanceof Error ? err.message : String(err)
      const r = raw.toLowerCase()
      setError(
        r.includes('invalid login') || r.includes('invalid credentials') ? tr('Email ou mot de passe incorrect.', 'Incorrect email or password.') :
        r.includes('email not confirmed') ? tr('Email non confirmé — vérifie ta boîte mail.', 'Email not confirmed — check your inbox.') :
        r.includes('already registered') ? tr('Un compte existe déjà avec cet email.', 'An account already exists with this email.') :
        r.includes('rate limit') ? tr('Trop de tentatives. Réessaie dans quelques minutes.', 'Too many attempts. Try again in a few minutes.') :
        raw
      )
    } finally { setLoading(false) }
  }

  async function handleForgot() {
    setError(null); setSuccess(null)
    if (!email.trim()) { setError(tr('Entre ton email d’abord, puis clique sur « Mot de passe oublié ».', 'Enter your email first, then click "Forgot password".')); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
      if (err) throw err
      setSuccess(tr('Email de réinitialisation envoyé. Vérifie ta boîte mail.', 'Reset email sent. Check your inbox.'))
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setLoading(false) }
  }

  const fieldLabel: React.CSSProperties = {
    display: 'block', fontFamily: SANS, fontSize: 9.5, fontWeight: 700,
    letterSpacing: '0.3em', textTransform: 'uppercase', color: FAINT, marginBottom: 10,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '13px 2px',
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid rgba(233,234,240,0.18)`,
    borderRadius: 0,
    color: IVORY,
    fontSize: 15,
    fontFamily: SANS,
    outline: 'none',
    transition: 'border-color 0.25s',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex',
      animation: 'reveal-in 0.5s cubic-bezier(0.16,1,0.3,1) both',
      background: BG,
    }}>
      {/* ── Left — panneau cinématique ─────────────────────────────────────── */}
      <div style={{ flex: '0 0 52%', position: 'relative', overflow: 'hidden', borderRight: `1px solid ${HAIR}`, display: window.innerWidth < 860 ? 'none' : 'block' }}>
        {/* image collage discret */}
        {[
          { x: '12%', y: '12%', rot: -6, idx: 0 },
          { x: '58%', y: '8%',  rot:  5, idx: 2 },
          { x: '8%',  y: '58%', rot: -4, idx: 3 },
          { x: '62%', y: '55%', rot:  6, idx: 4 },
        ].map((c, i) => (
          <div key={i} style={{
            position: 'absolute', left: c.x, top: c.y,
            width: 150, height: 210,
            transform: `rotate(${c.rot}deg)`,
            overflow: 'hidden',
            border: `1px solid rgba(233,234,240,0.1)`,
            opacity: 0.3,
            animation: `sf-float ${6 + i}s ease-in-out ${i * 0.7}s infinite`,
          }}>
            <img src={REEL_PHOTOS[c.idx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(0.9) brightness(0.55)' }} loading="lazy" />
          </div>
        ))}

        {/* vignette */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 65% at 50% 50%, rgba(6,6,8,0.55) 0%, rgba(6,6,8,0.92) 100%)' }} />

        {/* contenu */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '44px 52px', zIndex: 5 }}>
          <button onClick={onBack} style={{
            alignSelf: 'flex-start',
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase',
            color: MUTED, transition: 'color 0.25s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = IVORY)}
            onMouseLeave={e => (e.currentTarget.style.color = MUTED as string)}>
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="arrow-right" size={13} /></span> {tr('Retour', 'Back')}
          </button>

          <div>
            <MicroLabel style={{ marginBottom: 28 }}>{tr('Le Studio', 'The Studio')}</MicroLabel>
            <h2 style={{ margin: 0, lineHeight: 1.04, letterSpacing: '-0.04em' }}>
              <span style={{ display: 'block', fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(34px, 3.8vw, 58px)', color: IVORY }}>{tr('Là où les marques', 'Where brands')}</span>
              <span style={{ display: 'block', fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(36px, 4vw, 62px)', color: GOLD }}>{tr('passent à l’échelle.', 'go to scale.')}</span>
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 13.5, color: MUTED, lineHeight: 1.8, maxWidth: 380, margin: '24px 0 0' }}>
              {tr('Mass posting, cloud phones, banque de contenu, IA — l’arsenal complet, derrière une seule porte.', 'Mass posting, cloud phones, content bank, AI — the full arsenal, behind a single door.')}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Wordmark size={13} />
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: FAINT }} />
            <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: FAINT }}>{tr('Accès privé', 'Private access')}</span>
          </div>
        </div>
      </div>

      {/* ── Right — formulaire ─────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px',
        overflowY: 'auto',
        position: 'relative',
      }}>
        {/* back (mobile) */}
        <button onClick={onBack} style={{
          position: 'absolute', top: 24, right: 28,
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: FAINT, transition: 'color 0.25s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = IVORY)}
          onMouseLeave={e => (e.currentTarget.style.color = FAINT as string)}>
          Esc
        </button>

        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 44 }}>
            <p style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 16, color: GOLD, margin: '0 0 14px' }}>
              {tab === 'login' ? tr('— 01 / Connexion', '— 01 / Login') : tr('— 02 / Inscription', '— 02 / Sign up')}
            </p>
            <h2 style={{ margin: '0 0 10px', fontFamily: SANS, fontWeight: 900, fontSize: 34, letterSpacing: '-0.04em', color: IVORY, lineHeight: 1.05 }}>
              {tab === 'login' ? tr('Bon retour.', 'Welcome back.') : tr('Bienvenue.', 'Welcome.')}
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
              {tab === 'login' ? tr('Le Studio t’attend.', 'The Studio awaits.') : tr('Crée ton accès en quelques secondes.', 'Create your access in seconds.')}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div>
              <label style={fieldLabel} htmlFor="sf-email">{tr('Email', 'Email')}</label>
              <input id="sf-email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder={tr('vous@exemple.com', 'you@example.com')} style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderBottomColor = GOLD)}
                onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(233,234,240,0.18)')} />
            </div>

            <div>
              <label style={fieldLabel} htmlFor="sf-pass">{tr('Mot de passe', 'Password')}</label>
              <div style={{ position: 'relative' }}>
                <input id="sf-pass" type={showPw ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" style={{ ...inputStyle, paddingRight: 40 }}
                  onFocus={e => (e.currentTarget.style.borderBottomColor = GOLD)}
                  onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(233,234,240,0.18)')} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? tr('Masquer le mot de passe', 'Hide password') : tr('Afficher le mot de passe', 'Show password')}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 4, display: 'flex', alignItems: 'center' }}>
                  <Icon name={showPw ? 'eye-off' : 'eye'} size={17} label={showPw ? tr('Masquer le mot de passe', 'Hide password') : tr('Afficher le mot de passe', 'Show password')} />
                </button>
              </div>
              {tab === 'login' && (
                <button type="button" onClick={handleForgot} disabled={loading}
                  style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: SANS, fontSize: 11.5, color: MUTED, transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = IVORY)}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED as string)}>
                  {tr('Mot de passe oublié ?', 'Forgot password?')}
                </button>
              )}
            </div>

            {tab === 'register' && (
              <div>
                <label style={fieldLabel} htmlFor="sf-confirm">{tr('Confirmer', 'Confirm')}</label>
                <input id="sf-confirm" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••" style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderBottomColor = GOLD)}
                  onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(233,234,240,0.18)')} />
              </div>
            )}

            {error && (
              <div style={{ padding: '12px 16px', background: 'rgba(240,61,85,0.06)', borderLeft: '2px solid rgba(240,61,85,0.6)', color: '#f0a0ab', fontSize: 13, fontFamily: SANS, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, display: 'flex', marginTop: 1 }}><Icon name="alert-triangle" size={14} /></span><span>{error}</span>
              </div>
            )}
            {success && (
              <div style={{ padding: '12px 16px', background: 'rgba(52,211,153,0.05)', borderLeft: '2px solid rgba(52,211,153,0.6)', color: '#7fd9b8', fontSize: 13, fontFamily: SANS, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, display: 'flex', marginTop: 1 }}><Icon name="check" size={14} /></span><span>{success}</span>
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '17px', marginTop: 6,
                border: `1px solid ${IVORY}`, cursor: loading ? 'wait' : 'pointer',
                background: IVORY, color: '#0F1014',
                fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase',
                transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
                opacity: loading ? 0.55 : 1,
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = GOLD; e.currentTarget.style.borderColor = GOLD } }}
              onMouseLeave={e => { e.currentTarget.style.background = IVORY; e.currentTarget.style.borderColor = IVORY }}>
              {loading ? '· · ·' : tab === 'login' ? tr('Entrer au Studio', 'Enter the Studio') : tr('Créer mon accès', 'Create my access')}
            </button>
          </form>

          <div style={{ marginTop: 36, paddingTop: 24, borderTop: `1px solid ${HAIR}`, textAlign: 'center' }}>
            <span style={{ fontFamily: SANS, fontSize: 12, color: FAINT }}>
              {tab === 'login' ? tr('Pas encore de compte ?', 'No account yet?') : tr('Déjà un compte ?', 'Already have an account?')}
            </span>
            <button onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setError(null); setSuccess(null); setPassword(''); setConfirm('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 10,
                fontFamily: SERIF, fontStyle: 'normal', fontSize: 15, color: GOLD,
                borderBottom: '1px solid rgba(99,102,241,0.4)',
              }}>
              {tab === 'login' ? tr('S’inscrire', 'Sign up') : tr('Se connecter', 'Log in')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
type Stage = 'tunnel' | 'reveal' | 'site' | 'studio'

function stageFromHash(): Stage {
  const h = window.location.hash
  if (h === '#studio')  return 'studio'
  if (h === '#intro')   return 'tunnel'    // ancienne intro « ENTRER » (accessible si besoin)
  if (h === '#choix')   return 'reveal'
  // Par défaut : la nouvelle landing Claude Design s'affiche DIRECTEMENT.
  return 'site'
}

// ── Mockup de l'app — fenêtre macOS (maquette) ───────────────────────────────
function SiteAppMockup() {
  const tr = useTr()
  const ROWS = [
    { name: '@brand.paris',   st: tr('Publié', 'Posted'),    c: '#34D399', dot: false },
    { name: '@studio.crea',   st: tr('En cours', 'Running'), c: '#FB923C', dot: true  },
    { name: '@ugc.factory',   st: tr('En cours', 'Running'), c: '#FB923C', dot: true  },
    { name: '@growth.media',  st: tr('En file', 'Queued'),   c: 'rgba(196,181,253,0.5)', dot: false },
  ]
  const NAV = [tr('Accueil', 'Home'), tr('Téléphones', 'Phones'), tr('Publication', 'Post'), tr('Banque', 'Bank'), tr('Studio', 'Studio')]
  return (
    <section style={{ position: 'relative', zIndex: 1, padding: '20px 24px 120px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', position: 'relative' }}>
        {/* halo */}
        <div aria-hidden style={{ position: 'absolute', top: -40, left: '50%', width: '80%', height: 200, transform: 'translateX(-50%)', background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.28), transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
        <FadeIn>
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: `1px solid rgba(255,255,255,0.1)`, background: '#0B0B16', boxShadow: '0 40px 100px -30px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
            {/* Barre de titre macOS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FF5F57' }} />
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FEBC2E' }} />
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28C840' }} />
              <span style={{ marginLeft: 12, fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: MUTED }}>ScaleFlow — {tr('Mass Posting', 'Mass Posting')}</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: '#34D399' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 8px #34D399' }} /> 52 {tr('phones en ligne', 'phones online')}
              </span>
            </div>
            {/* Corps */}
            <div style={{ display: 'flex', minHeight: 320 }}>
              {/* Sidebar */}
              <div style={{ width: 168, flexShrink: 0, borderRight: `1px solid ${HAIR}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: IVORY, padding: '4px 8px 12px' }}>Scale<span style={{ color: '#818CF8' }}>Flow</span></div>
                {NAV.map((n, i) => (
                  <div key={n} style={{ padding: '8px 10px', borderRadius: 8, fontFamily: SANS, fontSize: 12, fontWeight: i === 2 ? 800 : 600,
                    color: i === 2 ? '#E9D5FF' : 'rgba(196,181,253,0.6)',
                    background: i === 2 ? 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(34,211,238,0.10))' : 'transparent',
                    border: i === 2 ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent' }}>{n}</div>
                ))}
                <div style={{ marginTop: 'auto', padding: '12px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}` }}>
                  <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>{tr('Crédits', 'Credits')}</div>
                  <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: '68%', height: '100%', background: 'linear-gradient(90deg,#22D3EE,#818CF8,#A855F7)' }} />
                  </div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: IVORY, marginTop: 8 }}>3 740</div>
                </div>
              </div>
              {/* Main */}
              <div style={{ flex: 1, padding: '20px 22px' }}>
                {/* stepper */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 11, fontWeight: 800, color: i <= 1 ? '#0A0A16' : MUTED, background: i <= 1 ? 'linear-gradient(120deg,#22D3EE,#818CF8)' : 'rgba(255,255,255,0.06)' }}>{i + 1}</span>
                      {i < 2 && <span style={{ width: 40, height: 2, background: i < 1 ? '#818CF8' : 'rgba(255,255,255,0.08)' }} />}
                    </div>
                  ))}
                  <span style={{ marginLeft: 8, fontFamily: SANS, fontSize: 12, color: MUTED }}>{tr('Diffusion en cours', 'Broadcasting')}</span>
                </div>
                {/* phone rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ROWS.map(r => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: `1px solid ${HAIR}` }}>
                      <span style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: IVORY }}>{r.name}</span>
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: r.c }}>
                        {r.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.c, animation: 'sf-status-pulse 1.6s ease-in-out infinite' }} />}
                        {r.st}
                      </span>
                    </div>
                  ))}
                </div>
                <button style={{ marginTop: 18, width: '100%', padding: '13px', borderRadius: 11, border: 'none', cursor: 'default',
                  background: 'linear-gradient(120deg,#22D3EE,#818CF8 46%,#A855F7)', color: '#0A0A16',
                  fontFamily: SANS, fontSize: 13, fontWeight: 800, boxShadow: '0 0 28px -8px rgba(129,140,248,0.7)' }}>
                  ⚡ {tr('Lancer la diffusion sur 52 comptes', 'Launch broadcast on 52 accounts')}
                </button>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ── Cloud Phones — auto-hébergé (maquette) ───────────────────────────────────
function SiteCloudPhones() {
  const tr = useTr()
  const POINTS = [
    tr('Tes propres appareils Android, sur ton serveur — plus de dépendance à GeeLark.', 'Your own Android devices, on your server — no more GeeLark dependency.'),
    tr('Comptes illimités : ajoute autant de cloud phones que ta machine peut en faire tourner.', 'Unlimited accounts: add as many cloud phones as your machine can run.'),
    tr('Un proxy propre par appareil, contrôle ADB en direct, démarrage / arrêt à la demande.', 'A clean proxy per device, live ADB control, start / stop on demand.'),
  ]
  const DEV = [
    { n: 'sf-cloud-01', s: tr('Démarré', 'Started'), c: '#34D399' },
    { n: 'sf-cloud-02', s: tr('Démarré', 'Started'), c: '#34D399' },
    { n: 'sf-cloud-03', s: tr('Démarrage', 'Booting'), c: '#FB923C' },
    { n: 'sf-cloud-04', s: tr('Arrêté', 'Stopped'), c: 'rgba(196,181,253,0.5)' },
  ]
  return (
    <section id="cloud" style={{ position: 'relative', zIndex: 1, padding: '40px 24px 120px', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>
        <FadeIn>
          <div>
            <MicroLabel color="rgba(52,211,153,0.6)" style={{ marginBottom: 20 }}>{tr('Infrastructure', 'Infrastructure')}</MicroLabel>
            <h2 style={{ margin: '0 0 20px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(30px, 4.4vw, 48px)', letterSpacing: '-0.03em', color: IVORY, lineHeight: 1.05 }}>
              {tr('Tes ', 'Your ')}<span style={{ background: 'linear-gradient(120deg,#34D399,#22D3EE)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Cloud Phones</span>{tr('.', '.')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {POINTS.map(p => (
                <div key={p} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, marginTop: 3, color: '#34D399' }}><Icon name="check" size={16} /></span>
                  <span style={{ fontFamily: SANS, fontSize: 14, color: MUTED, lineHeight: 1.65 }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div style={{ borderRadius: 18, border: `1px solid rgba(52,211,153,0.28)`, background: 'linear-gradient(120deg, rgba(52,211,153,0.08), rgba(255,255,255,0.015))', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 18 }}>🖥</span>
              <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: '#34D399' }}>{tr('Agent connecté', 'Agent connected')}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11, color: MUTED }}>v1.4 · 18 ms</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DEV.map(d => (
                <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: `1px solid ${HAIR}` }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg,#10B981,#059669)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: IVORY }}>{d.n}</span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: d.c }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.c }} /> {d.s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ── Comment ça marche — 3 étapes (maquette) ──────────────────────────────────
function SiteHowItWorks() {
  const tr = useTr()
  const STEPS = [
    { n: '01', t: tr('Connecte tes comptes', 'Connect your accounts'), d: tr('Relie tes cloud phones GeeLark ou ton serveur auto-hébergé. Tes comptes Instagram & TikTok apparaissent dans le dashboard.', 'Link your GeeLark cloud phones or your self-hosted server. Your Instagram & TikTok accounts show up in the dashboard.') },
    { n: '02', t: tr('Prépare ton contenu', 'Prepare your content'), d: tr('Importe tes vidéos, génère des variantes uniques (Remix, Spoof), écris tes captions — ou laisse l\'IA le faire.', 'Import your videos, generate unique variants (Remix, Spoof), write your captions — or let the AI do it.') },
    { n: '03', t: tr('Publie en un clic', 'Publish in one click'), d: tr('Sélectionne tes comptes, lance. Chaque téléphone publie en parallèle et s\'éteint tout seul. Suivi en direct.', 'Select your accounts, launch. Each phone posts in parallel and shuts down on its own. Live tracking.') },
  ]
  return (
    <section id="how" style={{ position: 'relative', zIndex: 1, padding: '40px 24px 120px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 20 }}>{tr('Comment ça marche', 'How it works')}</MicroLabel>
            <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(30px, 4.4vw, 48px)', letterSpacing: '-0.03em', color: IVORY }}>{tr('Trois étapes. ', 'Three steps. ')}<span style={{ background: 'linear-gradient(90deg,#818CF8,#F472B6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{tr('C\'est tout.', 'That\'s it.')}</span></h2>
          </div>
        </FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {STEPS.map((s, i) => (
            <FadeIn key={s.n} delay={i * 0.1}>
              <div style={{ height: '100%', padding: '30px 26px', borderRadius: 18, background: 'rgba(255,255,255,0.025)', border: `1px solid ${HAIR}` }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, lineHeight: 1, background: 'linear-gradient(120deg,#22D3EE,#818CF8 55%,#A855F7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.n}</div>
                <h3 style={{ margin: '18px 0 10px', fontFamily: DISPLAY, fontWeight: 700, fontSize: 20, color: IVORY }}>{s.t}</h3>
                <p style={{ margin: 0, fontFamily: SANS, fontSize: 13.5, color: MUTED, lineHeight: 1.7 }}>{s.d}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Témoignages — au nom d'agences (maquette) ────────────────────────────────
// Lecteur de message vocal maison (forme d'onde qui se remplit à la lecture).
function VoiceNote() {
  const tr = useTr()
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [pct, setPct] = useState(0)
  const [time, setTime] = useState('0:00')
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {}); else { a.pause(); setPlaying(false) } }
  return (
    <figure style={{ gridColumn: '1 / -1', margin: 0, display: 'flex', alignItems: 'center', gap: 18, padding: 20, borderRadius: 20, border: '1px solid rgba(52,211,153,0.28)', background: 'linear-gradient(120deg, rgba(52,211,153,0.09), rgba(255,255,255,0.03))' }}>
      <button type="button" onClick={toggle} aria-label={playing ? tr('Pause', 'Pause') : tr('Écouter', 'Play')}
        style={{ width: 52, height: 52, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#04140C', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#34D399,#10B981)', boxShadow: '0 0 30px -8px rgba(52,211,153,0.8)' }}>
        {playing ? '❚❚' : '▶'}
      </button>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 30 }}>
          {Array.from({ length: 56 }, (_, i) => { const seed = Math.abs(Math.sin(i * 2.7) * Math.cos(i * 0.9)); return (
            <span key={i} style={{ flex: 1, borderRadius: 99, height: `${22 + seed * 68}%`, background: i / 56 <= pct ? '#34D399' : 'rgba(255,255,255,0.16)', transition: 'background 0.15s' }} />
          )})}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: MUTED }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'rgba(226,222,255,0.88)' }}>{tr('Message vocal d\'un client', 'A client\'s voice note')}</span>
          <span style={{ fontFamily: 'monospace' }}>{time}</span>
          <span style={{ marginLeft: 'auto' }}>Telegram</span>
        </span>
      </span>
      <audio ref={audio} src="/avis/avis-vocal.ogg" preload="metadata" style={{ display: 'none' }}
        onTimeUpdate={e => { const a = e.currentTarget; if (!a.duration || !isFinite(a.duration)) return; setPct(a.currentTime / a.duration); setTime(`${fmt(a.currentTime)} / ${fmt(a.duration)}`) }}
        onEnded={() => { setPlaying(false); setPct(0); setTime('0:00') }} />
    </figure>
  )
}

// Avis clients — captures Telegram brutes + message vocal (v3).
function SiteTestimonials() {
  const tr = useTr()
  const REVIEWS = [
    { name: 'Francis', date: '19 juin', src: '/avis/avis-francis.png', glow: 'rgba(34,211,238,0.32)' },
    { name: 'France Killian', date: '19 juin', src: '/avis/avis-france-killian.png', glow: 'rgba(168,85,247,0.35)' },
    { name: 'Leon', date: '20 juin', src: '/avis/avis-leon.png', glow: 'rgba(52,211,153,0.3)' },
    { name: 'Alx', date: '4 juillet', src: '/avis/avis-alx.png', glow: 'rgba(129,140,248,0.32)' },
    { name: 'Njmoss', date: '6 juillet', src: '/avis/avis-njmoss.png', glow: 'rgba(245,158,11,0.3)' },
  ]
  return (
    <section id="testimonials" style={{ position: 'relative', zIndex: 1, padding: '100px 24px', background: 'rgba(124,58,237,0.04)', borderTop: `1px solid rgba(139,92,246,0.18)`, borderBottom: `1px solid rgba(139,92,246,0.18)` }}>
      <div style={{ maxWidth: 1140, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 52, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
            <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 20 }}>Social proof</MicroLabel>
            <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(30px, 4.4vw, 46px)', letterSpacing: '-0.02em', color: IVORY }}>{tr('Ils font tourner ', 'They run ')}<span style={{ background: 'linear-gradient(90deg,#F472B6,#C4B5FD 55%,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ScaleFlow.</span></h2>
            <p style={{ marginTop: 16, fontFamily: SANS, fontSize: 15, color: MUTED }}>{tr('Les messages reçus, tels quels. Rien de réécrit.', 'The messages we received, as they are. Nothing rewritten.')}</p>
          </div>
        </FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, alignItems: 'start' }}>
          {REVIEWS.map((r, i) => (
            <FadeIn key={r.name} delay={i * 0.06}>
              <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: 16, borderRadius: 20, background: 'rgba(255,255,255,0.035)', border: `1px solid rgba(255,255,255,0.1)`, transition: 'transform 0.3s, box-shadow 0.3s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 26px 60px -22px ${r.glow}` }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                <img src={r.src} alt={tr(`Avis de ${r.name} sur Telegram`, `${r.name}'s review on Telegram`)} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 12 }} />
                <figcaption style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', padding: '0 4px 4px' }}>
                  <span style={{ letterSpacing: 1.5, fontSize: 12, color: '#FBBF24' }}>★★★★★</span>
                  <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 800, color: 'rgba(226,222,255,0.88)' }}>{r.name}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: SANS, fontSize: 11, fontWeight: 700, color: MUTED }}>Telegram · {r.date}</span>
                </figcaption>
              </figure>
            </FadeIn>
          ))}
          <VoiceNote />
        </div>
      </div>
    </section>
  )
}

export function Landing() {
  const tr = useTr()
  const [stage,   setStageRaw] = useState<Stage>(stageFromHash)
  const [faqOpen, setFaqOpen]  = useState<number | null>(null)
  useGlobalCSS()

  const goTo = (s: Stage) => {
    if (s === 'site')   window.location.hash = '#discover'
    else if (s === 'studio') window.location.hash = '#studio'
    else history.pushState(null, '', window.location.pathname)
    setStageRaw(s)
  }

  useEffect(() => {
    const handler = () => setStageRaw(stageFromHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  useEffect(() => {
    document.body.style.overflow = stage === 'site' ? '' : 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [stage])

  useEffect(() => {
    if (stage === 'site') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [stage])

  const onDiscover = () => goTo('site')
  const onStudio   = () => goTo('studio')

  return (
    <div style={{ minHeight: '100vh', background: BG, color: IVORY, overflowX: 'hidden', fontFamily: SANS, cursor: stage === 'site' ? 'auto' : 'none' }}>
      {stage !== 'site' && <CustomCursor />}
      <Grain opacity={0.045} />

      {stage === 'reveal' && <RevealScreen onDiscover={onDiscover} onStudio={onStudio} />}
      {stage === 'studio' && <StudioAuth onBack={() => goTo('reveal')} />}
      {stage === 'tunnel' && <TunnelHero onEnter={() => goTo('reveal')} />}

      {/* ── Nav ───────────────────────────────────────────────────────────────── */}
      {stage === 'site' && (
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(6,6,8,0.85)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark size={16} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[['#manifesto',tr('Manifeste','Manifesto')], ['#features',tr('Fonctionnalités','Features')], ['#pricing',tr('Tarifs','Pricing')], ['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, textDecoration: 'none', padding: '8px 14px', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = IVORY)} onMouseLeave={e => (e.currentTarget.style.color = MUTED as string)}>
                {label}
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', background: 'transparent', border: `1px solid rgba(233,234,240,0.2)`, color: IVORY, textDecoration: 'none', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(233,234,240,0.55)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(233,234,240,0.2)')}>
              <TGIcon size={12} /> {tr('Clé', 'Key')}
            </a>
            <button onClick={onStudio}
              style={{ padding: '9px 22px', background: IVORY, border: `1px solid ${IVORY}`, color: '#0F1014', fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.3s' }}
              onMouseEnter={e => { e.currentTarget.style.background = GOLD; e.currentTarget.style.borderColor = GOLD }}
              onMouseLeave={e => { e.currentTarget.style.background = IVORY; e.currentTarget.style.borderColor = IVORY }}>
              {tr('Studio', 'Studio')}
            </button>
          </div>
        </div>
      </nav>
      )}

      {/* ── Site content ──────────────────────────────────────────────────────── */}
      {stage === 'site' && <>

      <SiteHero onStudio={onStudio} />

      {/* ── Mockup de l'app ──────────────────────────────────────────────────── */}
      <SiteAppMockup />

      {/* ── Manifeste ────────────────────────────────────────────────────────── */}
      <section id="manifesto" style={{ position: 'relative', zIndex: 1, padding: '140px 24px', overflow: 'hidden' }}>
        <Aurora />
        <div style={{ maxWidth: 880, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <FadeIn>
            <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 38 }}>{tr('Manifeste', 'Manifesto')}</MicroLabel>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 3.4vw, 40px)', lineHeight: 1.45, color: 'rgba(233,234,240,0.85)', margin: 0, fontWeight: 400 }}>
              {tr('Pendant que d’autres publient un post par jour,', 'While others publish one post a day,')}
              <span style={{ fontStyle: 'normal', color: GOLD }}>{tr(' nos studios en orchestrent des centaines', ' our studios orchestrate hundreds')}</span> —
              {tr(' sur des dizaines de comptes, sans lever le petit doigt.', ' across dozens of accounts, without lifting a finger.')}
            </p>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p style={{ fontFamily: SANS, fontSize: 13, letterSpacing: '0.24em', textTransform: 'uppercase', color: FAINT, marginTop: 44 }}>
              {tr('Le volume est une stratégie. ScaleFlow est l’outil.', 'Volume is a strategy. ScaleFlow is the tool.')}
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '40px 24px 140px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 30, flexWrap: 'wrap', gap: 16 }}>
              <h2 style={{ margin: 0, lineHeight: 1, letterSpacing: '-0.04em' }}>
                <span style={{ display: 'block', fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(36px, 5.4vw, 66px)', color: IVORY }}>{tr('L’arsenal', 'The complete')}</span>
                <span style={{ display: 'block', fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(38px, 5.7vw, 70px)', color: GOLD }}>{tr('complet.', 'arsenal.')}</span>
              </h2>
              <p style={{ fontFamily: SANS, fontSize: 12.5, color: MUTED, maxWidth: 300, lineHeight: 1.7, margin: 0, paddingBottom: 8 }}>
                {tr('Six pôles d’outils. Une interface. Plus besoin de jongler entre dix applications.', 'Six tool hubs. One interface. No more juggling ten apps.')}
              </p>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {FEATURES.map((f, i) => <FeatureRow key={f.num} f={f} index={i} />)}
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <SiteHowItWorks />

      {/* ── Cloud Phones ── */}
      <SiteCloudPhones />

      {/* ── Témoignages ── */}
      <SiteTestimonials />

      <Marquee items={[tr('Standard', 'Standard'), tr('Pro', 'Pro'), tr('Organisation', 'Organization'), tr('Crédits', 'Credits'), tr('Activation immédiate', 'Instant activation'), tr('Support 24/7', '24/7 Support')]} dark />

      {/* ── Pricing ── */}
      <PricingSection />

      {/* ── Telegram CTA ─────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '40px 24px 140px' }}>
        <FadeIn>
          <div style={{ maxWidth: 1080, margin: '0 auto', border: `1px solid ${HAIR}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse closest-side, rgba(99,102,241,0.06), transparent)', filter: 'blur(50px)', pointerEvents: 'none' }} />
            <div style={{ padding: '90px 40px', textAlign: 'center', position: 'relative' }}>
              <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 30 }}>{tr('Accès', 'Access')}</MicroLabel>
              <h3 style={{ margin: '0 0 18px', lineHeight: 1.04, letterSpacing: '-0.04em' }}>
                <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(30px, 4.6vw, 56px)', color: IVORY }}>{tr('Ta clé. ', 'Your key. ')}</span>
                <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(32px, 4.9vw, 60px)', color: GOLD }}>{tr('Ton empire.', 'Your empire.')}</span>
              </h3>
              <p style={{ fontFamily: SANS, fontSize: 13.5, color: MUTED, margin: '0 0 44px', lineHeight: 1.8 }}>
                {tr('Activation immédiate après paiement — crypto ou virement.', 'Instant activation after payment — crypto or bank transfer.')}<br />{tr('Réponse en moins d’une heure.', 'Reply in under an hour.')}
              </p>
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 14, padding: '18px 46px',
                  background: IVORY, color: '#0F1014', textDecoration: 'none',
                  fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase',
                  border: `1px solid ${IVORY}`,
                  transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = GOLD; e.currentTarget.style.borderColor = GOLD }}
                onMouseLeave={e => { e.currentTarget.style.background = IVORY; e.currentTarget.style.borderColor = IVORY }}>
                <TGIcon size={14} /> {tr('Obtenir ma clé', 'Get my key')}
              </a>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ position: 'relative', zIndex: 1, padding: '0 24px 140px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 54 }}>
              <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 26 }}>{tr('Questions', 'Questions')}</MicroLabel>
              <h2 style={{ margin: 0, lineHeight: 1, letterSpacing: '-0.04em' }}>
                <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(30px, 4.4vw, 52px)', color: IVORY }}>{tr('On répond à ', 'We answer ')}</span>
                <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(32px, 4.7vw, 56px)', color: GOLD }}>{tr('tout.', 'everything.')}</span>
              </h2>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div>
              {QA.map((item, i) => {
                const open = faqOpen === i
                return (
                <div key={i} style={{
                  marginBottom: 10, borderRadius: 14, overflow: 'hidden',
                  background: open ? 'linear-gradient(160deg, rgba(129,140,248,0.10), rgba(255,255,255,0.02))' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${open ? 'rgba(129,140,248,0.4)' : HAIR}`,
                  transition: 'background 0.25s, border-color 0.25s',
                }}>
                  <button onClick={() => setFaqOpen(open ? null : i)}
                    aria-expanded={open}
                    style={{ width: '100%', padding: '22px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 16 }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: open ? '#A5B4FC' : FAINT, transition: 'color 0.25s', flexShrink: 0 }}>0{i + 1}</span>
                      <span style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', color: IVORY }}>{tr(item.q, item.qEn)}</span>
                    </span>
                    <span aria-hidden style={{ color: open ? '#A5B4FC' : FAINT, fontSize: 22, lineHeight: 1, flexShrink: 0, transition: 'transform 0.3s, color 0.3s', display: 'inline-block', transform: open ? 'rotate(45deg)' : 'none', fontWeight: 300 }}>+</span>
                  </button>
                  {open && (
                    <div style={{ padding: '0 20px 24px 51px', fontFamily: SANS, fontSize: 13.5, color: MUTED, lineHeight: 1.8, animation: 'sf-fade-up 0.3s ease both' }}>
                      {tr(item.a, item.aEn)}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: `1px solid ${HAIR}`, overflow: 'hidden' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 28px 40px' }}>
          {/* Colonnes façon maquette : marque + Produit / Ressources / Légal */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) repeat(3, 1fr)', gap: 40, marginBottom: 56 }}>
            <div>
              <Wordmark size={18} />
              <p style={{ fontFamily: SANS, fontSize: 13.5, color: MUTED, margin: '14px 0 0', maxWidth: 280, lineHeight: 1.7 }}>
                {tr('L’usine de contenu des marques qui dominent Instagram & TikTok.', 'The content factory behind the brands that dominate Instagram & TikTok.')}
              </p>
            </div>
            {[
              { title: tr('Produit', 'Product'), links: [['#features', tr('Fonctionnalités', 'Features')], ['#pricing', tr('Tarifs', 'Pricing')], ['#manifesto', tr('Manifeste', 'Manifesto')]] as [string, string][] },
              { title: tr('Ressources', 'Resources'), links: [['#faq', 'FAQ'], [TELEGRAM_URL, 'Telegram']] as [string, string][] },
              { title: tr('Légal', 'Legal'), links: [['#faq', tr('Mentions légales', 'Legal notice')], ['#faq', tr('Confidentialité', 'Privacy')]] as [string, string][] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(129,140,248,0.7)', marginBottom: 16 }}>{col.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {col.links.map(([href, label]) => (
                    <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                      style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: MUTED, textDecoration: 'none', transition: 'color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = IVORY)} onMouseLeave={e => (e.currentTarget.style.color = MUTED as string)}>
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '0.1em', color: FAINT, margin: 0 }}>© {new Date().getFullYear()} {tr('SCALEFLOW — Tous droits réservés', 'SCALEFLOW — All rights reserved')}</p>
            <p style={{ fontFamily: SANS, fontSize: 11.5, color: MUTED, margin: 0 }}>{tr('Conçu en France', 'Made in France')} 🇫🇷</p>
          </div>
        </div>
        {/* Giant ghost wordmark */}
        <div aria-hidden style={{ textAlign: 'center', lineHeight: 0.72, userSelect: 'none', pointerEvents: 'none', marginBottom: -30 }}>
          <span style={{
            fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(80px, 14.5vw, 230px)', letterSpacing: '-0.05em',
            color: 'transparent', WebkitTextStroke: '1px rgba(233,234,240,0.07)',
          }}>SCALEFLOW</span>
        </div>
      </footer>

      </>} {/* end stage === 'site' */}
    </div>
  )
}
