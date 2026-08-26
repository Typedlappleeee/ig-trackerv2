import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/**
 * EntreeScreen — l'écran de choix « les deux portes » de ScaleFlow.
 * Reproduction fidèle de prototypes/entree.dc.html.
 *
 * Deux bandes horizontales empilées, séparées par une couture 1px animée :
 *   - Bande haute « Découvrir ScaleFlow » (cyan) → onDiscover
 *   - Bande basse « Ouvrir le Studio »    (violet) → onStudio
 */

const KEYFRAMES = `
@keyframes eGrain{0%,100%{transform:translate(0,0)}20%{transform:translate(-2%,1%)}40%{transform:translate(1%,-2%)}60%{transform:translate(-1%,2%)}80%{transform:translate(2%,-1%)}}
@keyframes eGlow{0%,100%{opacity:.28}50%{opacity:.72}}
@keyframes eRise{from{opacity:0;transform:translateY(118%)}to{opacity:1;transform:translateY(0)}}
@keyframes eFade{from{opacity:0}to{opacity:1}}
@keyframes eUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes eSeam{from{transform:translateX(-120%)}to{transform:translateX(120%)}}
@keyframes ePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}
@keyframes eDrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(4%,-4%) scale(1.1)}}
@keyframes eWipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes eFloat{0%,100%{transform:translateY(0) rotate(-7deg)}50%{transform:translateY(-16px) rotate(-7deg)}}
@keyframes eScan{0%{transform:translateY(-100%)}100%{transform:translateY(800%)}}
@keyframes eOrbit{to{transform:rotate(360deg)}}
@keyframes eSlant{0%,100%{transform:skewX(-16deg) translateX(0)}50%{transform:skewX(-16deg) translateX(30px)}}
@keyframes eFloatB{0%,100%{transform:translateY(0) rotate(4deg)}50%{transform:translateY(-14px) rotate(4deg)}}
@keyframes eMarq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes eCursor{0%,100%{transform:translate(0,0)}30%{transform:translate(26px,-16px)}55%{transform:translate(26px,-16px) scale(0.85)}70%{transform:translate(38px,4px)}}
@media (prefers-reduced-motion: reduce){
  .sf-entree *{animation:none !important;transition:none !important;}
}
`

const RINGS = [{ n: 8, r: 30 }, { n: 13, r: 47 }, { n: 18, r: 63 }]
const NAMES = ['brand.paris', 'studio.crea', 'ugc.factory', 'growth.lab', 'viral.fr', 'daily.motiv']

type Hover = 'site' | 'app' | null

/** Diffusion radiale — 39 comptes sur 3 orbites dans un viewBox 160×160. */
function Burst({ done, t }: { done: number; t: number }) {
  const seats: { x: number; y: number }[] = []
  RINGS.forEach((ring, ri) => {
    for (let k = 0; k < ring.n; k++) {
      const a = ((-90 + (k / ring.n) * 360 + ri * 11) * Math.PI) / 180
      seats.push({ x: 80 + Math.cos(a) * ring.r, y: 80 + Math.sin(a) * ring.r })
    }
  })
  const order = seats.map((_, i) => (i * 13 + 4) % seats.length)
  const cut = Math.round((done / 52) * seats.length)

  const rays: JSX.Element[] = []
  const dots: JSX.Element[] = []
  seats.forEach((s2, i) => {
    const rank = order.indexOf(i)
    const isDone = rank < cut
    const isLive = rank === cut
    rays.push(
      <line
        key={'r' + i}
        x1={80}
        y1={80}
        x2={s2.x.toFixed(1)}
        y2={s2.y.toFixed(1)}
        stroke={isLive ? '#F0ABFC' : isDone ? '#C084FC' : '#fff'}
        strokeOpacity={isLive ? 0.85 : isDone ? 0.26 : 0.055}
        strokeWidth={isLive ? 1.3 : 0.8}
      />
    )
    if (isLive) {
      dots.push(
        <circle key={'h' + i} cx={s2.x.toFixed(1)} cy={s2.y.toFixed(1)} r={7} fill="#F0ABFC" fillOpacity={0.18} />
      )
    }
    dots.push(
      <circle
        key={'d' + i}
        cx={s2.x.toFixed(1)}
        cy={s2.y.toFixed(1)}
        r={isLive ? 3.4 : isDone ? 2.5 : 1.8}
        fill={isLive ? '#F0ABFC' : isDone ? '#C084FC' : 'rgba(255,255,255,0.22)'}
        style={{ transition: 'r .4s cubic-bezier(0.16,1,0.3,1), fill .4s ease' }}
      />
    )
  })

  return (
    <svg viewBox="0 0 160 160" width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <radialGradient id="eCore">
          <stop offset="0%" stopColor="#A855F7" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#A855F7" stopOpacity={0} />
        </radialGradient>
      </defs>
      {RINGS.map((ring, i) => (
        <circle key={'o' + i} cx={80} cy={80} r={ring.r} fill="none" stroke="#fff" strokeOpacity={0.05} strokeDasharray="1.5 4" />
      ))}
      <circle cx={80} cy={80} r={36} fill="url(#eCore)" />
      <g>{rays}</g>
      <g>{dots}</g>
      <circle
        cx={80}
        cy={80}
        r={12 + (t % 4) * 16}
        fill="none"
        stroke="#C084FC"
        strokeWidth={0.9}
        strokeOpacity={Math.max(0, 0.45 - (t % 4) * 0.12)}
      />
      <rect x={71} y={66} width={18} height={28} rx={5} fill="#0D0A1C" stroke="#C084FC" strokeWidth={1.1} />
      <path d="M77.5 74.5 L84 80 L77.5 85.5 Z" fill="#E9D5FF" />
    </svg>
  )
}

export function EntreeScreen({ onDiscover, onStudio }: { onDiscover: () => void; onStudio: () => void }) {
  const reduced = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [hover, setHover] = useState<Hover>(null)
  const [live, setLive] = useState(18420)
  const [t, setT] = useState(0)

  useEffect(() => {
    if (reduced.current) return
    const id = setInterval(() => {
      setLive((v) => v + 1)
      setT((v) => v + 1)
    }, 1500)
    return () => clearInterval(id)
  }, [])

  const h = hover
  const done = 18 + (t % 35)
  const pct = Math.round((done / 52) * 100) + '%'
  const nm = (i: number) => NAMES[i % NAMES.length]
  const logA = '@' + nm(t) + ' · publié'
  const logB = '@' + nm(t + 1) + ' · upload…'
  const liveFr = live.toLocaleString('fr-FR')

  // Échange au survol
  const siteFlex = h === 'site' ? 1.55 : h === 'app' ? 0.62 : 1
  const appFlex = h === 'app' ? 1.55 : h === 'site' ? 0.62 : 1
  const siteType = h === 'site' ? 'clamp(42px,6vw,86px)' : h === 'app' ? 'clamp(26px,3vw,40px)' : 'clamp(34px,4.4vw,60px)'
  const appType = h === 'app' ? 'clamp(42px,6vw,86px)' : h === 'site' ? 'clamp(26px,3vw,40px)' : 'clamp(34px,4.4vw,60px)'
  const siteArt = h === 'app' ? 0.25 : 1
  const siteArtOpacity = h === 'app' ? 0.3 : 1
  const siteArtShift = h === 'site' ? 'translateY(0) scale(1.06)' : h === 'app' ? 'translateY(14px) scale(0.9)' : 'translateY(0) scale(1)'
  const phoneOpacity = h === 'site' ? 0.3 : 1
  const phoneShift = h === 'app' ? 'translateY(0) scale(1.06)' : h === 'site' ? 'translateY(14px) scale(0.9)' : 'translateY(0) scale(1)'
  const siteRing = h === 'site' ? 'rgba(103,232,249,0.75)' : 'rgba(255,255,255,0.16)'
  const siteRingBg = h === 'site' ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.03)'
  const siteArrow = h === 'site' ? 'translateX(7px)' : 'translateX(0)'
  const siteLabel = h === 'site' ? '#67E8F9' : 'rgba(226,222,255,0.58)'
  const appRing = h === 'app' ? 'rgba(216,180,254,0.75)' : 'rgba(255,255,255,0.16)'
  const appRingBg = h === 'app' ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.03)'
  const appArrow = h === 'app' ? 'translateX(7px)' : 'translateX(0)'
  const appLabel = h === 'app' ? '#D8B4FE' : 'rgba(226,222,255,0.58)'

  const grid: CSSProperties = {
    position: 'absolute',
    inset: 0,
    opacity: 0.05,
    backgroundImage:
      'linear-gradient(rgba(255,255,255,0.85) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.85) 1px, transparent 1px)',
    backgroundSize: '64px 64px',
    WebkitMaskImage: 'radial-gradient(ellipse 55% 90% at 22% 50%, #000 5%, transparent 74%)',
    maskImage: 'radial-gradient(ellipse 55% 90% at 22% 50%, #000 5%, transparent 74%)',
  }

  return (
    <div
      className="sf-entree"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: '#06060E',
        fontFamily: "'Manrope',system-ui,sans-serif",
        color: '#F2F0FF',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* grain + scanlines */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '-50%',
          zIndex: 40,
          pointerEvents: 'none',
          opacity: 0.032,
          animation: 'eGrain 1.1s steps(4) infinite',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 39,
          pointerEvents: 'none',
          opacity: 0.45,
          background: 'repeating-linear-gradient(180deg, transparent 0 2px, rgba(255,255,255,0.012) 2px 3px)',
        }}
      />

      {/* marque */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 11,
          padding: '24px 0',
          animation: 'eFade 1s ease 0.15s both',
        }}
      >
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            width: 32,
            height: 32,
            borderRadius: 9,
            background: 'linear-gradient(145deg,#A855F7,#7C3AED)',
            flexShrink: 0,
            boxShadow: '0 8px 22px -8px rgba(168,85,247,0.75), inset 0 1px 0 rgba(255,255,255,0.28)',
          }}
        >
          <span style={{ width: 14, height: 3, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
          <span style={{ width: 14, height: 3, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
        </span>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 600, letterSpacing: '-0.03em' }}>
          <span style={{ color: '#fff' }}>scale</span>
          <span style={{ color: '#A855F7' }}>flow</span>
        </span>
      </div>

      {/* ═══ BANDE 01 · le site ═══ */}
      <div
        onClick={onDiscover}
        onMouseEnter={() => setHover('site')}
        onMouseLeave={() => setHover(null)}
        style={{
          position: 'relative',
          flex: siteFlex,
          minHeight: 0,
          overflow: 'hidden',
          cursor: 'pointer',
          background: 'linear-gradient(118deg,#13111f 0%,#08080f 62%)',
          transition: 'flex 0.95s cubic-bezier(0.22,1,0.28,1)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-30%',
            left: '8%',
            width: 620,
            height: 620,
            borderRadius: '99em',
            filter: 'blur(100px)',
            background: 'radial-gradient(circle, rgba(34,211,238,0.2), transparent 68%)',
            animation: 'eGlow 9s ease-in-out infinite, eDrift 24s ease-in-out infinite',
          }}
        />
        <span aria-hidden="true" style={grid} />

        {/* orbites, côté droit */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            right: '11%',
            width: 340,
            height: 340,
            marginTop: -170,
            borderRadius: '99em',
            border: '1px solid rgba(34,211,238,0.12)',
            borderTopColor: 'rgba(103,232,249,0.45)',
            animation: 'eOrbit 28s linear infinite',
            opacity: siteArt,
            transition: 'opacity 0.8s ease',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            right: '11%',
            width: 220,
            height: 220,
            margin: '-110px -60px 0 0',
            borderRadius: '99em',
            border: '1px solid rgba(34,211,238,0.1)',
            borderBottomColor: 'rgba(103,232,249,0.32)',
            animation: 'eOrbit 19s linear infinite reverse',
            opacity: siteArt,
            transition: 'opacity 0.8s ease',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            right: '19%',
            width: 130,
            height: 11,
            marginTop: -14,
            borderRadius: 99,
            background: 'rgba(34,211,238,0.15)',
            animation: 'eSlant 14s ease-in-out infinite',
            opacity: siteArt,
            transition: 'opacity 0.8s ease',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            right: '19%',
            width: 130,
            height: 11,
            marginTop: 6,
            borderRadius: 99,
            background: 'rgba(34,211,238,0.08)',
            animation: 'eSlant 14s ease-in-out infinite',
            animationDelay: '-7s',
            opacity: siteArt,
            transition: 'opacity 0.8s ease',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(24px,4vw,60px)',
            padding: '0 clamp(40px,7vw,116px)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, animation: 'eUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.5s both' }}>
              <span style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 17, fontStyle: 'italic', color: 'rgba(103,232,249,0.8)' }}>01</span>
              <span style={{ width: 54, height: 1, background: 'rgba(103,232,249,0.4)', animation: 'eWipe 1s cubic-bezier(0.16,1,0.3,1) 0.7s both' }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)' }}>Le site</span>
            </div>

            <h2
              style={{
                margin: '14px 0 0',
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.28em',
                flexWrap: 'wrap',
                fontSize: siteType,
                lineHeight: 0.96,
                letterSpacing: '-0.045em',
                transition: 'font-size 0.95s cubic-bezier(0.22,1,0.28,1)',
              }}
            >
              <span style={{ display: 'block', overflow: 'hidden', paddingBottom: 2 }}>
                <span style={{ display: 'block', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: '#F2F0FF', animation: 'eRise 1.05s cubic-bezier(0.16,1,0.3,1) 0.55s both' }}>Découvrir</span>
              </span>
              <span style={{ display: 'block', overflow: 'hidden', paddingBottom: 8 }}>
                <span
                  style={{
                    display: 'block',
                    fontFamily: "'Instrument Serif',Georgia,serif",
                    fontWeight: 400,
                    background: 'linear-gradient(94deg,#22D3EE,#67E8F9 44%,#A5B4FC)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    animation: 'eRise 1.05s cubic-bezier(0.16,1,0.3,1) 0.66s both',
                  }}
                >
                  ScaleFlow
                </span>
              </span>
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, animation: 'eUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.86s both' }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 50,
                    height: 50,
                    borderRadius: 99,
                    border: `1px solid ${siteRing}`,
                    background: siteRingBg,
                    color: '#67E8F9',
                    fontSize: 17,
                    transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
                    transform: siteArrow,
                  }}
                >
                  →
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.03em', color: siteLabel, transition: 'color 0.4s ease' }}>Visiter le site</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  flexWrap: 'wrap',
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(148,163,184,0.45)',
                  animation: 'eUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.94s both',
                }}
              >
                <span>Manifeste</span>
                <span style={{ opacity: 0.3 }}>·</span>
                <span>Tarifs</span>
                <span style={{ opacity: 0.3 }}>·</span>
                <span style={{ color: '#67E8F9' }}>Cloud Phones</span>
              </div>
            </div>
          </div>

          {/* fenêtre du site */}
          <div
            aria-hidden="true"
            style={{
              position: 'relative',
              flexShrink: 0,
              width: 'clamp(190px,23vw,330px)',
              opacity: siteArtOpacity,
              transform: siteArtShift,
              transition: 'opacity 0.85s ease, transform 0.95s cubic-bezier(0.22,1,0.28,1)',
              animation: 'eFade 1.1s ease 0.85s both',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: -38,
                borderRadius: 52,
                filter: 'blur(50px)',
                background: 'radial-gradient(circle, rgba(34,211,238,0.34), transparent 68%)',
                animation: 'eGlow 7s ease-in-out infinite',
              }}
            />
            <div style={{ position: 'relative', animation: 'eFloatB 10s ease-in-out infinite' }}>
              <div
                style={{
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: 'rgba(8,9,18,0.96)',
                  border: '1px solid rgba(255,255,255,0.11)',
                  boxShadow: '0 38px 84px -30px rgba(34,211,238,0.5), inset 0 1px 0 rgba(255,255,255,0.09)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '7px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: 'rgba(255,95,87,0.85)' }} />
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: 'rgba(254,188,46,0.85)' }} />
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: 'rgba(40,200,64,0.85)' }} />
                  <span
                    style={{
                      marginLeft: 6,
                      flex: 1,
                      padding: '2.5px 7px',
                      borderRadius: 99,
                      background: 'rgba(255,255,255,0.05)',
                      fontFamily: 'monospace',
                      fontSize: 5.5,
                      color: 'rgba(196,181,253,0.55)',
                    }}
                  >
                    scaleflow.company
                  </span>
                </div>

                <div style={{ position: 'relative', padding: '16px 14px 13px', overflow: 'hidden' }}>
                  <span
                    style={{
                      position: 'absolute',
                      top: -30,
                      left: '20%',
                      width: 150,
                      height: 110,
                      borderRadius: '99em',
                      filter: 'blur(30px)',
                      background: 'radial-gradient(circle, rgba(124,58,237,0.4), transparent 70%)',
                    }}
                  />
                  <span
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 6px',
                      borderRadius: 99,
                      border: '1px solid rgba(139,92,246,0.35)',
                      background: 'rgba(139,92,246,0.09)',
                      fontSize: 4.5,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      color: '#C4B5FD',
                    }}
                  >
                    <span style={{ width: 2, height: 2, borderRadius: 99, background: '#34D399' }} />
                    {liveFr} POSTS AUJOURD'HUI
                  </span>

                  <div
                    style={{
                      position: 'relative',
                      marginTop: 8,
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontSize: 17,
                      fontWeight: 700,
                      letterSpacing: '-0.045em',
                      lineHeight: 0.94,
                    }}
                  >
                    <div>Un clic.</div>
                    <div>Cent</div>
                    <div
                      style={{
                        background: 'linear-gradient(94deg,#22D3EE,#818CF8 46%,#C084FC)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      comptes.
                    </div>
                  </div>

                  <div style={{ position: 'relative', display: 'flex', gap: 4, marginTop: 9 }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 99,
                        background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)',
                        color: '#0A0A16',
                        fontSize: 4.5,
                        fontWeight: 800,
                      }}
                    >
                      Commencer
                    </span>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 99,
                        border: '1px solid rgba(255,255,255,0.16)',
                        fontSize: 4.5,
                        fontWeight: 700,
                        color: 'rgba(226,222,255,0.7)',
                      }}
                    >
                      Télécharger
                    </span>
                  </div>

                  <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginTop: 11 }}>
                    {[
                      ['100+', 'COMPTES'],
                      ['1 M+', 'POSTS'],
                      ['15 h', 'GAGNÉES'],
                    ].map(([big, small]) => (
                      <span
                        key={small}
                        style={{
                          padding: '5px 4px',
                          borderRadius: 5,
                          background: 'rgba(255,255,255,0.035)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ display: 'block', fontFamily: "'Space Grotesk',sans-serif", fontSize: 8, fontWeight: 700 }}>{big}</span>
                        <span style={{ display: 'block', marginTop: 1, fontSize: 3.5, fontWeight: 700, color: 'rgba(148,163,184,0.6)' }}>{small}</span>
                      </span>
                    ))}
                  </div>

                  <div style={{ position: 'relative', marginTop: 9, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div
                      style={{
                        display: 'flex',
                        width: 'max-content',
                        gap: 9,
                        whiteSpace: 'nowrap',
                        animation: 'eMarq 16s linear infinite',
                        fontSize: 4,
                        fontWeight: 800,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'rgba(148,163,184,0.5)',
                      }}
                    >
                      <span>Mass posting</span><span style={{ color: '#22D3EE' }}>·</span><span>Programmation</span><span style={{ color: '#818CF8' }}>·</span><span>Auto-warmup</span><span style={{ color: '#C084FC' }}>·</span><span>Remix vidéo</span><span style={{ color: '#22D3EE' }}>·</span>
                      <span>Mass posting</span><span style={{ color: '#22D3EE' }}>·</span><span>Programmation</span><span style={{ color: '#818CF8' }}>·</span><span>Auto-warmup</span><span style={{ color: '#C084FC' }}>·</span><span>Remix vidéo</span><span style={{ color: '#22D3EE' }}>·</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* curseur */}
              <span style={{ position: 'absolute', bottom: '26%', left: '24%', width: 9, height: 9, animation: 'eCursor 5s ease-in-out infinite' }}>
                <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
                  <path d="M1 1 L1 9.5 L3.4 7.2 L5.1 11 L6.8 10.2 L5.1 6.5 L8.6 6.5 Z" fill="#fff" stroke="rgba(0,0,0,0.4)" strokeWidth="0.6" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ COUTURE ═══ */}
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          height: 1,
          flexShrink: 0,
          zIndex: 20,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 14%, rgba(255,255,255,0.2) 86%, transparent)',
          overflow: 'visible',
        }}
      >
        <span style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <span style={{ position: 'absolute', insetBlock: 0, width: '26%', background: 'linear-gradient(90deg, transparent, #C084FC, transparent)', animation: 'eSeam 5s linear infinite' }} />
        </span>
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 6,
            height: 6,
            margin: '-3px 0 0 -3px',
            borderRadius: 99,
            background: '#A855F7',
            boxShadow: '0 0 20px 5px rgba(168,85,247,0.65)',
            animation: 'ePulse 3s ease-in-out infinite',
          }}
        />
      </div>

      {/* ═══ BANDE 02 · l'app ═══ */}
      <div
        onClick={onStudio}
        onMouseEnter={() => setHover('app')}
        onMouseLeave={() => setHover(null)}
        style={{
          position: 'relative',
          flex: appFlex,
          minHeight: 0,
          overflow: 'hidden',
          cursor: 'pointer',
          background: 'linear-gradient(292deg,#1b1332 0%,#0a0714 62%)',
          transition: 'flex 0.95s cubic-bezier(0.22,1,0.28,1)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: '-34%',
            right: '9%',
            width: 640,
            height: 640,
            borderRadius: '99em',
            filter: 'blur(102px)',
            background: 'radial-gradient(circle, rgba(168,85,247,0.24), transparent 68%)',
            animation: 'eGlow 11s ease-in-out infinite, eDrift 28s ease-in-out infinite',
          }}
        />
        <span aria-hidden="true" style={grid} />

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(24px,4vw,60px)',
            padding: '0 clamp(40px,7vw,116px)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, animation: 'eUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.62s both' }}>
              <span style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 17, fontStyle: 'italic', color: 'rgba(216,180,254,0.8)' }}>02</span>
              <span style={{ width: 54, height: 1, background: 'rgba(168,85,247,0.45)', animation: 'eWipe 1s cubic-bezier(0.16,1,0.3,1) 0.82s both' }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)' }}>L'application</span>
            </div>

            <h2
              style={{
                margin: '14px 0 0',
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.28em',
                flexWrap: 'wrap',
                fontSize: appType,
                lineHeight: 0.96,
                letterSpacing: '-0.045em',
                transition: 'font-size 0.95s cubic-bezier(0.22,1,0.28,1)',
              }}
            >
              <span style={{ display: 'block', overflow: 'hidden', paddingBottom: 2 }}>
                <span style={{ display: 'block', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: '#F2F0FF', animation: 'eRise 1.05s cubic-bezier(0.16,1,0.3,1) 0.67s both' }}>Ouvrir le</span>
              </span>
              <span style={{ display: 'block', overflow: 'hidden', paddingBottom: 8 }}>
                <span
                  style={{
                    display: 'block',
                    fontFamily: "'Instrument Serif',Georgia,serif",
                    fontWeight: 400,
                    background: 'linear-gradient(94deg,#C084FC,#A855F7 44%,#818CF8)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    animation: 'eRise 1.05s cubic-bezier(0.16,1,0.3,1) 0.78s both',
                  }}
                >
                  Studio
                </span>
              </span>
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, animation: 'eUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.98s both' }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 50,
                    height: 50,
                    borderRadius: 99,
                    border: `1px solid ${appRing}`,
                    background: appRingBg,
                    color: '#D8B4FE',
                    fontSize: 17,
                    transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
                    transform: appArrow,
                  }}
                >
                  →
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.03em', color: appLabel, transition: 'color 0.4s ease' }}>Entrer dans l'app</span>
              </div>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(196,181,253,0.6)', animation: 'eUp 0.9s cubic-bezier(0.16,1,0.3,1) 1.06s both' }}>Ton poste de pilotage.</span>
            </div>
          </div>

          {/* téléphone */}
          <div
            aria-hidden="true"
            style={{
              position: 'relative',
              flexShrink: 0,
              width: 'clamp(120px,13vw,190px)',
              opacity: phoneOpacity,
              transform: phoneShift,
              transition: 'opacity 0.85s ease, transform 0.95s cubic-bezier(0.22,1,0.28,1)',
              animation: 'eFade 1.1s ease 0.9s both',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: -40,
                borderRadius: 56,
                filter: 'blur(52px)',
                background: 'radial-gradient(circle, rgba(168,85,247,0.42), transparent 68%)',
                animation: 'eGlow 6s ease-in-out infinite',
              }}
            />
            <div style={{ position: 'relative', animation: 'eFloat 9s ease-in-out infinite' }}>
              <div
                style={{
                  borderRadius: 30,
                  padding: 8,
                  background: 'linear-gradient(160deg, rgba(216,180,254,0.5), rgba(139,92,246,0.3) 46%, rgba(8,6,18,0.94))',
                  boxShadow: '0 40px 90px -30px rgba(168,85,247,0.6), 0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 0 rgba(255,255,255,0.26)',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 23,
                    overflow: 'hidden',
                    background: '#08060F',
                    border: '1px solid rgba(255,255,255,0.07)',
                    aspectRatio: '9/18',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <span style={{ position: 'absolute', top: 7, left: '50%', marginLeft: -19, width: 38, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.13)', zIndex: 3 }} />
                  <span style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'linear-gradient(118deg, rgba(255,255,255,0.1) 0%, transparent 32%, transparent 68%, rgba(255,255,255,0.05) 100%)' }} />
                  <span style={{ position: 'absolute', left: 0, right: 0, height: 70, zIndex: 2, background: 'linear-gradient(180deg, transparent, rgba(168,85,247,0.13), transparent)', animation: 'eScan 4s linear infinite' }} />

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '18px 9px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                          width: 17,
                          height: 17,
                          borderRadius: 5,
                          background: 'linear-gradient(145deg,#A855F7,#7C3AED)',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ width: 8, height: 2, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
                        <span style={{ width: 8, height: 2, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 5px',
                          borderRadius: 99,
                          background: 'rgba(52,211,153,0.14)',
                          color: '#34D399',
                          fontSize: 5.5,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                        }}
                      >
                        <span style={{ width: 2.5, height: 2.5, borderRadius: 99, background: '#34D399', animation: 'ePulse 1.6s ease-in-out infinite' }} />
                        LIVE
                      </span>
                    </div>

                    <span style={{ display: 'block', marginTop: 12, fontSize: 5.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.55)', textAlign: 'center' }}>
                      Diffusion en cours
                    </span>

                    <div style={{ position: 'relative', marginTop: 2 }}>
                      <Burst done={done} t={t} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3, marginTop: -2 }}>
                      <span
                        style={{
                          fontFamily: "'Space Grotesk',sans-serif",
                          fontSize: 21,
                          fontWeight: 700,
                          letterSpacing: '-0.04em',
                          background: 'linear-gradient(94deg,#C084FC,#818CF8)',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}
                      >
                        {done}
                      </span>
                      <span style={{ fontSize: 6.5, fontWeight: 700, color: 'rgba(148,163,184,0.55)' }}>/ 52 comptes</span>
                    </div>

                    <span style={{ display: 'block', margin: '7px 4px 0', height: 2.5, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
                      <span style={{ display: 'block', height: '100%', width: pct, borderRadius: 99, background: 'linear-gradient(90deg,#C084FC,#818CF8)', transition: 'width .5s linear' }} />
                    </span>

                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 6px',
                          borderRadius: 6,
                          background: 'rgba(52,211,153,0.09)',
                          border: '1px solid rgba(52,211,153,0.2)',
                          fontFamily: 'monospace',
                          fontSize: 5,
                          color: 'rgba(167,243,208,0.9)',
                        }}
                      >
                        <span style={{ width: 2.5, height: 2.5, borderRadius: 99, background: '#34D399' }} />
                        {logA}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 6px',
                          borderRadius: 6,
                          background: 'rgba(192,132,252,0.09)',
                          border: '1px solid rgba(192,132,252,0.2)',
                          fontFamily: 'monospace',
                          fontSize: 5,
                          color: 'rgba(216,180,254,0.9)',
                        }}
                      >
                        <span style={{ width: 2.5, height: 2.5, borderRadius: 99, background: '#C084FC', animation: 'ePulse 1.2s ease-in-out infinite' }} />
                        {logB}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* pied */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px clamp(24px,4vw,46px)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: 'rgba(148,163,184,0.4)',
          animation: 'eFade 1s ease 1.2s both',
        }}
      >
        <span>Instagram &amp; TikTok · multi-comptes</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: '#34D399', animation: 'ePulse 2.4s ease-in-out infinite' }} />
          {liveFr} posts publiés aujourd'hui
        </span>
        <span>Conçu en France</span>
      </div>
    </div>
  )
}
