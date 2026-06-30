import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const TELEGRAM_URL = 'https://t.me/justquentin'

const REEL_PHOTOS = [
  '/reels/reel-1.png',
  '/reels/reel-2.png',
  '/reels/reel-3.png',
  '/reels/reel-4.png',
  '/reels/reel-5.png',
]

// ── Design tokens — "ScaleFlow Noir" ─────────────────────────────────────────
const SERIF = "'Inter', 'Times New Roman', Georgia, serif"
const SANS  = "'Inter', system-ui, sans-serif"
const BG    = '#0A0B0E'
const IVORY = '#E9EAF0'
const MUTED = 'rgba(233,234,240,0.42)'
const FAINT = 'rgba(233,234,240,0.22)'
const HAIR  = 'rgba(233,234,240,0.09)'
const GOLD  = '#6366F1'
const VIOLET = '#6366F1'

// ── Lucide-style inline icon set ──────────────────────────────────────────────
type IconName =
  | 'zap' | 'send' | 'users' | 'bot' | 'clapperboard' | 'bar-chart-3'
  | 'calendar' | 'timer' | 'folder-archive' | 'shuffle' | 'smartphone'
  | 'crown' | 'building-2' | 'eye' | 'eye-off' | 'alert-triangle' | 'check'
  | 'arrow-right' | 'arrow-up-right'

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
function Wordmark({ size = 17, onClick }: { size?: number; onClick?: () => void }) {
  const inner = (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', color: IVORY }}>SCALE</span>
      <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: size * 1.12, color: GOLD, marginLeft: 1 }}>Flow</span>
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

// ── Fond noir + fumée douce qui dérive (nappes floues, naturel) ───────────────
function SmokeBackground({ tint = false, subtle = false }: { tint?: boolean; subtle?: boolean }) {
  const indigo = tint ? 'rgba(99,102,241,0.07)' : 'rgba(120,120,150,0.07)'
  const k = subtle ? 0.45 : 1   // facteur d'intensité (version discrète)
  const wisp = (a: number) => `rgba(150,150,175,${(a * k).toFixed(3)})`
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1, background: '#040405' }}>
      {/* Nappes de fumée — grandes, très floues, lentes → effet vapeur naturel.
          Pas de texture granuleuse (ça faisait du « bruit » pas naturel). */}
      <div style={{ position: 'absolute', top: '4%',  left: '4%',  width: 760, height: 760, borderRadius: '50%', background: `radial-gradient(circle, ${wisp(0.10)}, transparent 64%)`, filter: 'blur(95px)', animation: 'sf-smoke-a 34s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '-4%', right: '2%', width: 860, height: 860, borderRadius: '50%', background: `radial-gradient(circle, ${wisp(0.09)}, transparent 64%)`, filter: 'blur(110px)', animation: 'sf-smoke-b 42s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '30%', left: '38%', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle, ${indigo}, transparent 64%)`, filter: 'blur(100px)', animation: 'sf-smoke-rise 48s ease-in-out infinite' }} />
      {!subtle && <div style={{ position: 'absolute', top: '52%', left: '14%', width: 620, height: 620, borderRadius: '50%', background: `radial-gradient(circle, ${wisp(0.07)}, transparent 64%)`, filter: 'blur(95px)', animation: 'sf-smoke-c 38s ease-in-out infinite' }} />}
      {!subtle && <div style={{ position: 'absolute', top: '8%', right: '20%', width: 560, height: 560, borderRadius: '50%', background: `radial-gradient(circle, ${wisp(0.06)}, transparent 64%)`, filter: 'blur(90px)', animation: 'sf-smoke-a 52s ease-in-out infinite reverse' }} />}
    </div>
  )
}

// Vidéos affichées dans les téléphones de la démo. Dépose tes fichiers dans
// electron-app/public/showcase/ (1.mp4 … 8.mp4) et ils s'affichent ici.
// Si un fichier manque, on retombe proprement sur le dégradé.
const SHOWCASE_VIDEOS: string[] = [
  '/showcase/1.mp4', '/showcase/2.mp4', '/showcase/3.mp4', '/showcase/4.mp4',
  '/showcase/5.mp4', '/showcase/6.mp4', '/showcase/7.mp4', '/showcase/8.mp4',
]

// ── Mini-téléphone qui poste tout seul ───────────────────────────────────────
function AutoPhone({ i, grad, handle }: { i: number; grad: string; handle: string }) {
  const cycle = 6                       // durée d'un cycle (s)
  const delay = -(i * 0.85)             // décalage → effet de vague
  const a = (name: string) => `${name} ${cycle}s linear ${delay}s infinite`
  const [videoOk, setVideoOk] = useState(true)
  const src = SHOWCASE_VIDEOS[i % SHOWCASE_VIDEOS.length]
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
            <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 4, letterSpacing: '0.03em' }}>PUBLICATION…</div>
            <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#6366F1,#a855f7)', animation: a('sf-upbar') }} />
            </div>
          </div>
          {/* statut "publié" */}
          <div style={{ position: 'absolute', bottom: 12, left: 8, right: 8, display: 'flex', alignItems: 'center', gap: 5, animation: a('sf-posted') }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#22c55e' }}>Publié</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AutoPostShowcase() {
  const grads = [
    'linear-gradient(160deg,#3b2f6b,#1a1733)', 'linear-gradient(160deg,#5b2350,#231024)',
    'linear-gradient(160deg,#22405e,#0e1c2b)', 'linear-gradient(160deg,#4a2d63,#1d1230)',
    'linear-gradient(160deg,#5e3a22,#2b1a0e)', 'linear-gradient(160deg,#264e3a,#0e1f17)',
    'linear-gradient(160deg,#3a2d63,#15122e)', 'linear-gradient(160deg,#5e2240,#280f1d)',
  ]
  const handles = ['@luna.fit', '@kayavibes', '@mia.daily', '@nora.x', '@ava.glow', '@zoe.life', '@lea.studio', '@emma.co']
  const phones = Array.from({ length: 8 }, (_, i) => ({ i, grad: grads[i % grads.length], handle: handles[i % handles.length] }))
  return (
    <section style={{ position: 'relative', padding: '110px 0 120px', overflow: 'hidden', background: BG }}>
      {/* glow */}
      <div aria-hidden style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 500, background: 'radial-gradient(ellipse closest-side, rgba(99,102,241,0.10), transparent)', filter: 'blur(70px)', pointerEvents: 'none' }} />
      <FadeIn>
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 56px', padding: '0 24px', position: 'relative' }}>
          <MicroLabel color="rgba(99,102,241,0.6)" style={{ marginBottom: 22 }}>Automatisation en direct</MicroLabel>
          <h2 style={{ margin: '0 0 14px', lineHeight: 1.04 }}>
            <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(30px,4.4vw,54px)', letterSpacing: '-0.03em', color: IVORY }}>Des dizaines de comptes.<br /></span>
            <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(32px,4.6vw,58px)', color: GOLD }}>Ça poste tout seul.</span>
          </h2>
          <p style={{ fontFamily: SANS, fontSize: 'clamp(14px,1.4vw,17px)', color: FAINT, lineHeight: 1.6, maxWidth: 540, margin: '0 auto' }}>
            Tu choisis tes vidéos, tu lances. ScaleFlow pilote tous tes cloud phones et publie sur Instagram — en parallèle, sans surveillance.
          </p>
        </div>
      </FadeIn>
      {/* Bande défilante de téléphones */}
      <div style={{ position: 'relative', maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)' }}>
        <div style={{ display: 'flex', gap: 26, width: 'max-content', padding: '0 26px', animation: 'sf-conveyor 38s linear infinite' }}>
          {[...phones, ...phones].map((p, idx) => <AutoPhone key={idx} i={idx} grad={p.grad} handle={p.handle} />)}
        </div>
      </div>
    </section>
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
  const stats = [
    { to: 500, suffix: '+', label: 'comptes pilotés en parallèle' },
    { to: 1200, suffix: '+', label: 'publications automatisées / jour' },
    { to: 100, suffix: '%', label: 'autonome — même PC éteint' },
    { to: 24, suffix: '/7', label: 'cloud phones qui tournent' },
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

      {/* Wall tiles — monochrome */}
      {ENTRY_TILES.map((tile, idx) => (
        <div
          key={tile.key}
          style={{
            position: 'absolute',
            top: tile.top, bottom: tile.bottom,
            left: tile.left, right: tile.right,
            animation: `sf-float ${7 + idx * 0.25}s ease-in-out ${tile.delay}s infinite, sf-tile-in 1s cubic-bezier(0.16,1,0.3,1) ${tile.delay + 0.1}s both`,
            zIndex: 2,
          }}
        >
          <div style={{
            width: tile.w, height: tile.h,
            ['--ry' as string]: `${tile.ry}deg`, ['--rx' as string]: `${tile.rx}deg`,
            animation: `sf-tile-rot ${14 + idx * 0.5}s ease-in-out ${tile.delay}s infinite`,
            borderRadius: 4,
            overflow: 'hidden',
            border: `1px solid ${HAIR}`,
            background: 'linear-gradient(160deg, #0B0B0E 0%, #0C0D11 100%)',
            boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
          }}>
            {ENTRY_IMAGES[idx] && <img src={ENTRY_IMAGES[idx]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'grayscale(0.7) brightness(0.6)' }} />}
          </div>
        </div>
      ))}

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        background: `radial-gradient(ellipse 50% 52% at 50% 50%, transparent 0%, rgba(6,6,8,0.88) 100%)`,
      }} />

      {/* Brand */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', userSelect: 'none' }}>
        <div style={{ animation: 'sf-blur-in 1.1s cubic-bezier(0.16,1,0.3,1) 0.2s both' }}>
          <MicroLabel style={{ marginBottom: 30 }}>Instagram Automation Studio</MicroLabel>
        </div>

        <h1 style={{
          margin: '0 0 8px',
          lineHeight: 0.92,
          animation: 'sf-blur-in 1.2s cubic-bezier(0.16,1,0.3,1) 0.45s both',
          position: 'relative', overflow: 'hidden', padding: '0 0.1em',
        }}>
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(64px, 11vw, 150px)', letterSpacing: '-0.05em', color: IVORY }}>SCALE</span>
          <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(66px, 11.5vw, 158px)', letterSpacing: '-0.02em', color: GOLD, marginLeft: '0.02em' }}>Flow</span>
          {/* light sweep */}
          <span aria-hidden style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '34%',
            background: 'linear-gradient(90deg, transparent, rgba(233,234,240,0.07), transparent)',
            animation: 'sf-beam 4.5s ease-in-out 1.8s infinite',
            pointerEvents: 'none',
          }} />
        </h1>

        <p style={{
          fontFamily: SERIF, fontStyle: 'normal', fontSize: 'clamp(15px, 1.6vw, 19px)',
          color: MUTED, margin: '14px 0 52px', letterSpacing: '0.01em',
          animation: 'sf-fade-in 1.4s ease 1s both',
        }}>
          L’usine de contenu des marques qui dominent Instagram.
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
            Entrer
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

      {half(hoverTop, setHoverTop, onDiscover, '— 01', 'DÉCOUVRIR', 'ScaleFlow', 'Manifeste · Fonctionnalités · Tarifs', '0.15s')}

      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${HAIR} 20%, rgba(99,102,241,0.35) 50%, ${HAIR} 80%, transparent)`, flexShrink: 0, zIndex: 10 }} />

      {half(hoverBot, setHoverBot, onStudio, '— 02', 'LE', 'Studio', 'Connexion · Mass Posting · Cloud Phones', '0.28s')}
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
  const [ctaHover, setCtaHover] = useState(false)

  const CARDS = [
    { x: -36, y: -16, rot: -7, views: '870K' },
    { x:  32, y: -18, rot:  6, views: '1.1M' },
    { x: -30, y:  22, rot: -4, views: '920K' },
    { x:  34, y:  20, rot:  5, views: '990K' },
  ]
  const cW = 128, cH = 182

  return (
    <section style={{ position: 'relative', minHeight: 'calc(100vh - 64px)', overflow: 'hidden', background: BG, display: 'flex', flexDirection: 'column' }}>
      {/* glow */}
      <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 700, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(99,102,241,0.04), transparent)', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)', width: 560, height: 420, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(99,102,241,0.05), transparent)', filter: 'blur(70px)', pointerEvents: 'none' }} />

      {/* Floating reels — refined monochrome frames */}
      {CARDS.map((c, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `calc(50% + ${c.x}% - ${cW / 2}px)`,
          top: `calc(48% + ${c.y}% - ${cH / 2}px)`,
          width: cW, height: cH,
          transform: `rotate(${c.rot}deg)`,
          borderRadius: 6, overflow: 'hidden',
          border: `1px solid rgba(233,234,240,0.14)`,
          boxShadow: '0 32px 80px rgba(0,0,0,0.85)',
          animation: `sf-float ${5 + i * 0.7}s ease-in-out ${i * 0.8}s infinite`,
          zIndex: 2, opacity: 0.85,
        }}>
          <img src={REEL_PHOTOS[i % REEL_PHOTOS.length]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'saturate(0.85) brightness(0.82)' }} loading="lazy" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 55%, rgba(6,6,8,0.85) 100%)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill={GOLD}><path d="M8 5v14l11-7z"/></svg>
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: IVORY, letterSpacing: '0.04em' }}>{c.views}</span>
            <span style={{ fontFamily: SANS, fontSize: 8, fontWeight: 600, color: FAINT, letterSpacing: '0.18em', marginLeft: 'auto', textTransform: 'uppercase' }}>vues</span>
          </div>
        </div>
      ))}

      {/* vignette to keep center readable */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, background: 'radial-gradient(ellipse 46% 50% at 50% 48%, rgba(6,6,8,0.82) 0%, rgba(6,6,8,0.25) 55%, transparent 100%)' }} />

      {/* Center content */}
      <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '64px 24px 40px' }}>
        <FadeIn>
          <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 34 }}>Le studio nouvelle génération</MicroLabel>
        </FadeIn>

        <FadeIn delay={0.08}>
          <h1 style={{ margin: 0, lineHeight: 1.02, letterSpacing: '-0.04em', maxWidth: 980 }}>
            <span style={{ display: 'block', fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(42px, 7vw, 96px)', color: IVORY }}>
              L’automatisation
            </span>
            <span style={{ display: 'block', fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(42px, 7vw, 96px)', color: IVORY }}>
              Instagram, <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, color: GOLD, letterSpacing: '-0.01em' }}>élevée au rang d’art.</span>
            </span>
          </h1>
        </FadeIn>

        <FadeIn delay={0.16}>
          <p style={{ fontFamily: SANS, fontSize: 15, color: MUTED, margin: '30px auto 44px', lineHeight: 1.8, maxWidth: 480, fontWeight: 400 }}>
            Des dizaines de comptes. Des centaines de publications.
            Une seule interface — pensée pour ceux qui voient grand.
          </p>
        </FadeIn>

        <FadeIn delay={0.24}>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onStudio}
              onMouseEnter={() => setCtaHover(true)}
              onMouseLeave={() => setCtaHover(false)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 12,
                padding: '17px 38px',
                background: ctaHover ? GOLD : IVORY,
                border: `1px solid ${ctaHover ? GOLD : IVORY}`,
                color: '#0F1014',
                fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
              }}>
              Entrer au Studio <Icon name="arrow-right" size={14} />
            </button>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="sf-shine"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 12,
                padding: '17px 38px',
                background: 'transparent',
                border: `1px solid rgba(233,234,240,0.25)`,
                color: IVORY,
                fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase',
                textDecoration: 'none',
                transition: 'all 0.35s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(233,234,240,0.6)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(233,234,240,0.25)' }}>
              Acheter une clé
            </a>
          </div>
        </FadeIn>

        {/* Stats row — chiffres animés au scroll */}
        <FadeIn delay={0.34}>
          <div style={{ display: 'flex', gap: 0, marginTop: 70, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { node: <CountUp to={50} suffix="+" />,  l: 'Téléphones pilotés en parallèle' },
              { node: <CountUp to={10} suffix="K" />,  l: 'Publications chaque mois' },
              { node: <>24/7</>,                        l: 'Scheduler autonome dans le cloud' },
            ].map((s, i, a) => (
              <div key={i} style={{ padding: '0 44px', textAlign: 'center', borderRight: i < a.length - 1 ? `1px solid ${HAIR}` : 'none' }}>
                <div style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 'clamp(30px, 3.4vw, 44px)', color: IVORY, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.node}</div>
                <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: FAINT, marginTop: 10, maxWidth: 170 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>

      {/* Marquee bottom */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        <Marquee items={['Mass Posting', 'Précision', 'Multi-Comptes', 'Élégance', 'Reels & Stories', 'Échelle', 'Cloud Phones', 'Autonomie', 'Intelligence Artificielle', 'Vitesse']} />
      </div>
    </section>
  )
}

// ── Features — liste éditoriale numérotée ────────────────────────────────────
const FEATURES: { num: string; title: string; serif: string; text: string; icon: IconName }[] = [
  { num: '01', title: 'Mass',      serif: 'Posting',   icon: 'send',            text: "Des dizaines de comptes publient en parallèle. Sélectionne, lance — chaque téléphone s’éteint après sa publication. Sans surveillance." },
  { num: '02', title: 'Banque de', serif: 'contenu',   icon: 'folder-archive',  text: 'Ta vidéothèque cloud, organisée par dossiers et partagée avec ton organisation. Import drag & drop, miniatures automatiques.' },
  { num: '03', title: 'Remix &',   serif: 'Spoof',     icon: 'shuffle',         text: 'Des copies uniques générées par FFmpeg : luminosité, grain, zoom, recadrage, teinte. Le duplicate content ne te concerne plus.' },
  { num: '04', title: 'Outils',    serif: 'IA',        icon: 'bot',             text: 'Scripts, hooks, captions virales, analyse de miniatures. Llama et Claude Vision intégrés directement dans ton flux de travail.' },
  { num: '05', title: 'Program',   serif: 'mation',    icon: 'calendar',        text: "Planifie tes publications à l’avance. Le scheduler s’exécute dans le cloud, même application fermée." },
  { num: '06', title: 'Suivi',     serif: 'temps réel',icon: 'smartphone',      text: 'Le statut de chaque cloud phone, en direct. Sessions Instagram, groupes, batteries — tout sous contrôle.' },
]

function FeatureRow({ f, index }: { f: typeof FEATURES[number]; index: number }) {
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
          display: 'grid',
          gridTemplateColumns: '80px 1fr 110px',
          alignItems: 'center',
          gap: 28,
          padding: hover ? '38px 28px' : '32px 28px',
          borderBottom: `1px solid ${HAIR}`,
          background: hover ? 'rgba(233,234,240,0.025)' : 'transparent',
          transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
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
        {/* gold line indicator */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: GOLD, transform: hover ? 'scaleY(1)' : 'scaleY(0)', transformOrigin: 'top', transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1)', zIndex: 1 }} />

        <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 19, color: hover ? GOLD : FAINT, transition: 'color 0.3s' }}>{f.num}</span>

        <div>
          <h3 style={{ margin: '0 0 8px', lineHeight: 1, whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 'clamp(22px, 2.6vw, 34px)', letterSpacing: '-0.03em', color: IVORY }}>{f.title}</span>
            <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(24px, 2.8vw, 37px)', color: hover ? GOLD : 'rgba(99,102,241,0.75)', marginLeft: '0.18em', transition: 'color 0.3s' }}>{f.serif}</span>
          </h3>
          <p style={{
            fontFamily: SANS, fontSize: 13.5, color: MUTED, lineHeight: 1.75, margin: 0, maxWidth: 560,
            opacity: hover ? 1 : 0.65, transition: 'opacity 0.35s',
          }}>{f.text}</p>
        </div>

        <div style={{
          justifySelf: 'end',
          width: 54, height: 54, borderRadius: '50%',
          border: `1px solid ${hover ? 'rgba(99,102,241,0.5)' : HAIR}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: hover ? GOLD : FAINT,
          transform: hover ? 'rotate(0deg) scale(1.06)' : 'rotate(-8deg) scale(1)',
          transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <Icon name={f.icon} size={21} />
        </div>
      </div>
    </FadeIn>
  )
}

// ── Pricing data ──────────────────────────────────────────────────────────────
type PlanFeature = { text: string; included: boolean }
interface PlanDef {
  name: string; tagline: string
  credits: string
  perAccount: string
  monthlyPrice: string; yearlyPrice: string
  originalMonthly: string; discount: string; yearlyBilled: string
  popular?: boolean; bestValue?: boolean
  btnLabel: string
  features: PlanFeature[]
}
const PLANS: PlanDef[] = [
  {
    name: 'Standard', tagline: 'Pour débuter',
    credits: '3 750 crédits / mois',
    perAccount: '≈ 25 comptes · 2,00$ / compte',
    monthlyPrice: '49,99$', yearlyPrice: '49,99$',
    originalMonthly: '', discount: '', yearlyBilled: '',
    btnLabel: 'Choisir Standard',
    features: [
      { text: '100 téléphones max',              included: true  },
      { text: 'Accès aux outils de base',       included: true  },
      { text: 'Mass Posting (10 comptes max)',   included: true  },
      { text: 'Création de contenu (Remix, Spoof…)', included: false },
      { text: 'Support prioritaire',             included: false },
      { text: 'Organisations multi-membres',     included: false },
    ],
  },
  {
    name: 'Pro', tagline: 'Scale ton agence',
    credits: '11 250 crédits / mois',
    perAccount: '≈ 75 comptes · 1,33$ / compte',
    monthlyPrice: '99,99$', yearlyPrice: '59,99$',
    originalMonthly: '99,99$', discount: '−40%', yearlyBilled: '719,88$ facturé annuellement',
    popular: true,
    btnLabel: 'Choisir Pro',
    features: [
      { text: '200 téléphones max',              included: true  },
      { text: 'Accès à tous les outils',         included: true  },
      { text: 'Création de contenu (Remix, Spoof…) — gratuit', included: true  },
      { text: 'Mass Posting illimité',            included: true  },
      { text: 'Support prioritaire',              included: true  },
      { text: 'Organisations multi-membres',      included: true  },
    ],
  },
  {
    name: 'Organisation', tagline: 'Puissance illimitée',
    credits: '22 500 crédits / mois',
    perAccount: '150 comptes · 1,00$ / compte',
    monthlyPrice: '149,99$', yearlyPrice: '89,99$',
    originalMonthly: '149,99$', discount: '−40%', yearlyBilled: '1 079,88$ facturé annuellement',
    bestValue: true,
    btnLabel: 'Choisir Organisation',
    features: [
      { text: 'Téléphones illimités',            included: true  },
      { text: 'Accès à tous les outils',         included: true  },
      { text: 'Création de contenu (Remix, Spoof…) — gratuit', included: true  },
      { text: 'Mass Posting illimité',            included: true  },
      { text: 'Support prioritaire 24/7',         included: true  },
      { text: 'Organisations multi-membres',      included: true  },
    ],
  },
]

const CREDIT_PACKS = [
  { name: 'Mini',  credits: '1 000',  price: '12,99$',  note: '~6 comptes / mois'   },
  { name: 'Plus',  credits: '2 500',  price: '27,99$',  note: '~16 comptes / mois'  },
  { name: 'Mega',  credits: '6 000',  price: '54,99$',  note: '40 comptes · Populaire' },
  { name: 'Giga',  credits: '15 000', price: '119,99$', note: '100 comptes / mois'  },
  { name: 'Ultra', credits: '40 000', price: '289,99$', note: '266 comptes · Top valeur' },
]

// ── Pricing — luxe : carte "Pro" inversée en ivoire ──────────────────────────
function PricingSection() {
  const [yearly, setYearly] = useState(false)

  return (
    <section id="pricing" style={{ position: 'relative', zIndex: 1, padding: '120px 24px', overflow: 'hidden' }}>
      <Aurora />
      <div style={{ maxWidth: 1080, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 26 }}>Investissement</MicroLabel>
            <h2 style={{ margin: '0 0 34px', lineHeight: 1, letterSpacing: '-0.04em' }}>
              <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(34px, 5vw, 62px)', color: IVORY }}>Trois plans. </span>
              <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(36px, 5.3vw, 66px)', color: GOLD }}>Zéro limite.</span>
            </h2>
            {/* Billing toggle */}
            <div style={{ display: 'inline-flex', border: `1px solid ${HAIR}`, padding: 3, gap: 0 }}>
              {[
                { v: false, label: 'Mensuel' },
                { v: true,  label: 'Annuel · −40%' },
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

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 1, background: HAIR, border: `1px solid ${HAIR}`, marginBottom: 100 }}>
          {PLANS.map((p, i) => {
            const inverted = p.popular
            return (
              <FadeIn key={p.name} delay={i * 0.08} style={{ display: 'flex', flex: 1 }}>
                <div
                  className="sf-plan-card"
                  style={{
                    position: 'relative',
                    background: inverted ? IVORY : BG,
                    display: 'flex', flexDirection: 'column',
                    padding: '40px 34px',
                    flex: 1,
                  }}
                >
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
                        {p.popular ? 'Le plus choisi' : 'Meilleure valeur'}
                      </span>
                    )}
                  </div>

                  <h3 style={{ margin: '0 0 4px', fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: inverted ? '#0F1014' : IVORY }}>{p.name}</h3>
                  <p style={{ margin: '0 0 30px', fontFamily: SERIF, fontStyle: 'normal', fontSize: 15, color: inverted ? 'rgba(10,10,12,0.55)' : MUTED }}>{p.tagline}</p>

                  {/* Price */}
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    {yearly && p.originalMonthly && (
                      <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 17, color: inverted ? 'rgba(10,10,12,0.35)' : FAINT, textDecoration: 'line-through' }}>{p.originalMonthly}</span>
                    )}
                    <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 52, letterSpacing: '-0.05em', lineHeight: 1, color: inverted ? '#0F1014' : IVORY }}>
                      {yearly ? p.yearlyPrice : p.monthlyPrice}
                    </span>
                    <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 16, color: inverted ? 'rgba(10,10,12,0.5)' : MUTED }}>/mois</span>
                    {yearly && p.discount && (
                      <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: inverted ? '#0F1014' : GOLD }}>{p.discount}</span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 6px', fontFamily: SANS, fontSize: 11, color: inverted ? 'rgba(10,10,12,0.45)' : FAINT, minHeight: 14 }}>
                    {yearly && p.yearlyBilled ? p.yearlyBilled : ' '}
                  </p>
                  <p style={{ margin: '0 0 8px', fontFamily: SANS, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: inverted ? 'rgba(10,10,12,0.6)' : 'rgba(99,102,241,0.7)' }}>
                    {p.credits}
                  </p>
                  <div style={{
                    margin: '0 0 10px', padding: '9px 12px', borderRadius: 10,
                    background: inverted ? 'rgba(10,10,12,0.06)' : 'rgba(99,102,241,0.12)',
                    border: `1px solid ${inverted ? 'rgba(10,10,12,0.15)' : 'rgba(99,102,241,0.3)'}`,
                  }}>
                    <p style={{ margin: 0, fontFamily: SANS, fontSize: 15, fontWeight: 900, color: inverted ? '#0F1014' : IVORY, lineHeight: 1.2 }}>
                      {p.perAccount}
                    </p>
                  </div>
                  <p style={{ margin: '0 0 24px', fontFamily: SANS, fontSize: 10.5, color: inverted ? 'rgba(10,10,12,0.5)' : FAINT, lineHeight: 1.4 }}>
                    Base : 2 posts + 1 story / jour / compte
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
                        }}>{f.text}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="sf-shine"
                    style={{
                      display: 'block', textAlign: 'center', marginTop: 34,
                      padding: '15px',
                      fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase',
                      textDecoration: 'none',
                      background: inverted ? '#0F1014' : 'transparent',
                      color: inverted ? IVORY : IVORY,
                      border: `1px solid ${inverted ? '#0F1014' : 'rgba(233,234,240,0.3)'}`,
                      transition: 'all 0.3s',
                    }}
                    onMouseEnter={e => {
                      if (inverted) { e.currentTarget.style.background = GOLD; e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = '#0F1014' }
                      else { e.currentTarget.style.background = IVORY; e.currentTarget.style.color = '#0F1014'; e.currentTarget.style.borderColor = IVORY }
                    }}
                    onMouseLeave={e => {
                      if (inverted) { e.currentTarget.style.background = '#0F1014'; e.currentTarget.style.borderColor = '#0F1014'; e.currentTarget.style.color = IVORY }
                      else { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = IVORY; e.currentTarget.style.borderColor = 'rgba(233,234,240,0.3)' }
                    }}>
                    {p.btnLabel}
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
              Estimation comptes basée sur une <strong style={{ color: GOLD }}>utilisation standard : 2 posts + 1 story par jour et par compte</strong> (≈ 150 crédits/compte/mois — 2 crédits/post, 1 crédit/story). Les outils vidéo (Remix, Spoof) sont <strong style={{ color: GOLD }}>gratuits</strong>, et les crédits non utilisés <strong style={{ color: GOLD }}>se cumulent</strong> d'un mois sur l'autre.
            </p>
          </div>
        </FadeIn>

        {/* ── Credit packs — ligne éditoriale ── */}
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h3 style={{ margin: '0 0 10px', lineHeight: 1 }}>
              <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(24px, 3.4vw, 40px)', letterSpacing: '-0.03em', color: IVORY }}>Packs de </span>
              <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(26px, 3.6vw, 43px)', color: GOLD }}>crédits</span>
            </h3>
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: MUTED, margin: 0 }}>Recharge à tout moment — les crédits n’expirent jamais.</p>
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
                  {pack.note || pack.name}
                </p>
                <p style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 42, color: IVORY, margin: '0 0 2px', lineHeight: 1 }}>{pack.credits}</p>
                <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: FAINT, margin: '0 0 22px' }}>crédits</p>
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
                  Acheter <Icon name="arrow-up-right" size={11} />
                </a>
              </div>
            </FadeIn>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontFamily: SANS, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: FAINT, marginTop: 32 }}>
          Activation via Telegram · Crypto ou virement · Immédiat
        </p>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const QA = [
  { q: "C’est quoi ScaleFlow ?",          a: "Une app pour gérer en masse tes comptes Instagram : poster sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives." },
  { q: "J’ai besoin de quoi ?",           a: "Un abonnement GéeLark (cloud phones) + ton bearer token. ScaleFlow se connecte à GéeLark pour piloter tes téléphones virtuels." },
  { q: "Différence Standard vs Pro ?",   a: "Standard = 3 750 crédits/mois + outils de base. Pro = 11 250 crédits + Mass Posting illimité + organisations multi-membres + support prioritaire." },
  { q: "C’est risqué pour mes comptes ?", a: "ScaleFlow utilise GéeLark qui simule de vrais devices avec leurs propres IPs/sessions. Warmup intégré pour respecter les rythmes humains." },
  { q: "Version web ou téléchargement ?", a: "Les deux. L’Electron (.exe/.dmg) est plus rapide. La version web est accessible depuis n’importe où." },
  { q: "Comment contacter le support ?",  a: "Via Telegram (@justquentin), réponse en moins d'1h. Ou via les tickets dans l’app." },
]

// ── Telegram icon ─────────────────────────────────────────────────────────────
const TGIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
  </svg>
)

// ── Studio auth — split cinématique ───────────────────────────────────────────
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
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="arrow-right" size={13} /></span> Retour
          </button>

          <div>
            <MicroLabel style={{ marginBottom: 28 }}>Le Studio</MicroLabel>
            <h2 style={{ margin: 0, lineHeight: 1.04, letterSpacing: '-0.04em' }}>
              <span style={{ display: 'block', fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(34px, 3.8vw, 58px)', color: IVORY }}>Là où les marques</span>
              <span style={{ display: 'block', fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(36px, 4vw, 62px)', color: GOLD }}>passent à l’échelle.</span>
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 13.5, color: MUTED, lineHeight: 1.8, maxWidth: 380, margin: '24px 0 0' }}>
              Mass posting, cloud phones, banque de contenu, IA — l’arsenal complet, derrière une seule porte.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Wordmark size={13} />
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: FAINT }} />
            <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: FAINT }}>Accès privé</span>
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
              {tab === 'login' ? '— 01 / Connexion' : '— 02 / Inscription'}
            </p>
            <h2 style={{ margin: '0 0 10px', fontFamily: SANS, fontWeight: 900, fontSize: 34, letterSpacing: '-0.04em', color: IVORY, lineHeight: 1.05 }}>
              {tab === 'login' ? 'Bon retour.' : 'Bienvenue.'}
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
              {tab === 'login' ? 'Le Studio t’attend.' : 'Crée ton accès en quelques secondes.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div>
              <label style={fieldLabel} htmlFor="sf-email">Email</label>
              <input id="sf-email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="vous@exemple.com" style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderBottomColor = GOLD)}
                onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(233,234,240,0.18)')} />
            </div>

            <div>
              <label style={fieldLabel} htmlFor="sf-pass">Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input id="sf-pass" type={showPw ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" style={{ ...inputStyle, paddingRight: 40 }}
                  onFocus={e => (e.currentTarget.style.borderBottomColor = GOLD)}
                  onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(233,234,240,0.18)')} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 4, display: 'flex', alignItems: 'center' }}>
                  <Icon name={showPw ? 'eye-off' : 'eye'} size={17} label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} />
                </button>
              </div>
            </div>

            {tab === 'register' && (
              <div>
                <label style={fieldLabel} htmlFor="sf-confirm">Confirmer</label>
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
              {loading ? '· · ·' : tab === 'login' ? 'Entrer au Studio' : 'Créer mon accès'}
            </button>
          </form>

          <div style={{ marginTop: 36, paddingTop: 24, borderTop: `1px solid ${HAIR}`, textAlign: 'center' }}>
            <span style={{ fontFamily: SANS, fontSize: 12, color: FAINT }}>
              {tab === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
            </span>
            <button onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setError(null); setSuccess(null); setPassword(''); setConfirm('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 10,
                fontFamily: SERIF, fontStyle: 'normal', fontSize: 15, color: GOLD,
                borderBottom: '1px solid rgba(99,102,241,0.4)',
              }}>
              {tab === 'login' ? "S’inscrire" : 'Se connecter'}
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
  if (h === '#discover') return 'site'
  if (h === '#studio')   return 'studio'
  return 'tunnel'
}

export function Landing() {
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
          <Wordmark size={16} onClick={() => goTo('tunnel')} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[['#manifesto','Manifeste'], ['#features','Fonctionnalités'], ['#pricing','Tarifs'], ['#faq','FAQ']].map(([href, label]) => (
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
              <TGIcon size={12} /> Clé
            </a>
            <button onClick={onStudio}
              style={{ padding: '9px 22px', background: IVORY, border: `1px solid ${IVORY}`, color: '#0F1014', fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.3s' }}
              onMouseEnter={e => { e.currentTarget.style.background = GOLD; e.currentTarget.style.borderColor = GOLD }}
              onMouseLeave={e => { e.currentTarget.style.background = IVORY; e.currentTarget.style.borderColor = IVORY }}>
              Studio
            </button>
          </div>
        </div>
      </nav>
      )}

      {/* ── Site content ──────────────────────────────────────────────────────── */}
      {stage === 'site' && <>

      <SiteHero onStudio={onStudio} />

      {/* ── Manifeste ────────────────────────────────────────────────────────── */}
      <section id="manifesto" style={{ position: 'relative', zIndex: 1, padding: '140px 24px', overflow: 'hidden' }}>
        <Aurora />
        <div style={{ maxWidth: 880, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <FadeIn>
            <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 38 }}>Manifeste</MicroLabel>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 3.4vw, 40px)', lineHeight: 1.45, color: 'rgba(233,234,240,0.85)', margin: 0, fontWeight: 400 }}>
              Pendant que d’autres publient un post par jour,
              <span style={{ fontStyle: 'normal', color: GOLD }}> nos studios en orchestrent des centaines</span> —
              sur des dizaines de comptes, sans lever le petit doigt.
            </p>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p style={{ fontFamily: SANS, fontSize: 13, letterSpacing: '0.24em', textTransform: 'uppercase', color: FAINT, marginTop: 44 }}>
              Le volume est une stratégie. ScaleFlow est l’outil.
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
                <span style={{ display: 'block', fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(36px, 5.4vw, 66px)', color: IVORY }}>L’arsenal</span>
                <span style={{ display: 'block', fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(38px, 5.7vw, 70px)', color: GOLD }}>complet.</span>
              </h2>
              <p style={{ fontFamily: SANS, fontSize: 12.5, color: MUTED, maxWidth: 300, lineHeight: 1.7, margin: 0, paddingBottom: 8 }}>
                Six pôles d’outils. Une interface. Plus besoin de jongler entre dix applications.
              </p>
            </div>
          </FadeIn>
          <div style={{ borderTop: `1px solid ${HAIR}` }}>
            {FEATURES.map((f, i) => <FeatureRow key={f.num} f={f} index={i} />)}
          </div>
        </div>
      </section>

      <Marquee items={['Standard', 'Pro', 'Organisation', 'Crédits', 'Activation immédiate', 'Support 24/7']} dark />

      {/* ── Pricing ── */}
      <PricingSection />

      {/* ── Telegram CTA ─────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '40px 24px 140px' }}>
        <FadeIn>
          <div style={{ maxWidth: 1080, margin: '0 auto', border: `1px solid ${HAIR}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse closest-side, rgba(99,102,241,0.06), transparent)', filter: 'blur(50px)', pointerEvents: 'none' }} />
            <div style={{ padding: '90px 40px', textAlign: 'center', position: 'relative' }}>
              <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 30 }}>Accès</MicroLabel>
              <h3 style={{ margin: '0 0 18px', lineHeight: 1.04, letterSpacing: '-0.04em' }}>
                <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(30px, 4.6vw, 56px)', color: IVORY }}>Ta clé. </span>
                <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(32px, 4.9vw, 60px)', color: GOLD }}>Ton empire.</span>
              </h3>
              <p style={{ fontFamily: SANS, fontSize: 13.5, color: MUTED, margin: '0 0 44px', lineHeight: 1.8 }}>
                Activation immédiate après paiement — crypto ou virement.<br />Réponse en moins d’une heure.
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
                <TGIcon size={14} /> Obtenir ma clé
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
              <MicroLabel color="rgba(99,102,241,0.55)" style={{ marginBottom: 26 }}>Questions</MicroLabel>
              <h2 style={{ margin: 0, lineHeight: 1, letterSpacing: '-0.04em' }}>
                <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(30px, 4.4vw, 52px)', color: IVORY }}>On répond à </span>
                <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontWeight: 400, fontSize: 'clamp(32px, 4.7vw, 56px)', color: GOLD }}>tout.</span>
              </h2>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ borderTop: `1px solid ${HAIR}` }}>
              {QA.map((item, i) => (
                <div key={i} style={{ borderBottom: `1px solid ${HAIR}` }}>
                  <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                    aria-expanded={faqOpen === i}
                    style={{ width: '100%', padding: '26px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 18 }}>
                      <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 14, color: faqOpen === i ? GOLD : FAINT, transition: 'color 0.25s', flexShrink: 0 }}>0{i + 1}</span>
                      <span style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em', color: IVORY }}>{item.q}</span>
                    </span>
                    <span aria-hidden style={{ color: faqOpen === i ? GOLD : FAINT, fontSize: 22, lineHeight: 1, flexShrink: 0, transition: 'transform 0.3s, color 0.3s', display: 'inline-block', transform: faqOpen === i ? 'rotate(45deg)' : 'none', fontWeight: 300 }}>+</span>
                  </button>
                  {faqOpen === i && (
                    <div style={{ padding: '0 8px 28px 50px', fontFamily: SANS, fontSize: 13.5, color: MUTED, lineHeight: 1.85, animation: 'sf-fade-up 0.3s ease both' }}>
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: `1px solid ${HAIR}`, overflow: 'hidden' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 28px 40px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 60 }}>
            <div>
              <Wordmark size={18} />
              <p style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 14, color: MUTED, margin: '14px 0 0', maxWidth: 260, lineHeight: 1.6 }}>
                L’usine de contenu des marques qui dominent Instagram.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 36 }}>
              {[['#manifesto','Manifeste'], ['#features','Fonctionnalités'], ['#pricing','Tarifs'], ['#faq','FAQ'], [TELEGRAM_URL,'Telegram']].map(([href, label]) => (
                <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                  style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: FAINT, textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = IVORY)} onMouseLeave={e => (e.currentTarget.style.color = FAINT as string)}>
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontFamily: SANS, fontSize: 10.5, letterSpacing: '0.14em', color: FAINT, margin: 0 }}>© {new Date().getFullYear()} SCALEFLOW — TOUS DROITS RÉSERVÉS</p>
            <p style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 13, color: 'rgba(99,102,241,0.5)', margin: 0 }}>La révolution commence.</p>
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
