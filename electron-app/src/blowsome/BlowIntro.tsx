// Blowsome — intro cinématique premium jouée à l'entrée dans la sous-app.
// Séquence multi-phases (~6 s) : burst lumineux → révélation lettre par lettre du
// mot BLOWSOME → shine + tagline → barre de progression → fondu de sortie.
// Skippable via "Entrer".
import { useEffect, useRef, useState } from 'react'

const DURATION = 6000
const WORD = 'BLOWSOME'

const CSS = `
@keyframes bi-burst{0%{opacity:0;transform:scale(.4)}40%{opacity:.9}100%{opacity:.25;transform:scale(1.6)}}
@keyframes bi-ring{0%{opacity:0;transform:scale(.6)}30%{opacity:.8}100%{opacity:0;transform:scale(2.4)}}
@keyframes bi-letter{0%{opacity:0;transform:translateY(46px) rotateX(-90deg);filter:blur(6px)}100%{opacity:1;transform:translateY(0) rotateX(0);filter:blur(0)}}
@keyframes bi-grad{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes bi-shine{0%{transform:translateX(-140%) skewX(-18deg)}100%{transform:translateX(240%) skewX(-18deg)}}
@keyframes bi-tag{0%{opacity:0;letter-spacing:.6em}100%{opacity:1;letter-spacing:.32em}}
@keyframes bi-line{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes bi-orb{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(50px,40px) scale(1.2)}}
@keyframes bi-particle{0%{opacity:0;transform:translateY(30px) scale(.4)}20%{opacity:1}100%{opacity:0;transform:translateY(-80px) scale(1)}}
@keyframes bi-exit{to{opacity:0;transform:scale(1.06)}}
@keyframes bi-skip{0%{opacity:0}100%{opacity:1}}
`

export function BlowIntro({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false)
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setExiting(true)
    window.setTimeout(onDone, 620)
  }

  useEffect(() => {
    const id = 'sf-blow-intro-css'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id; el.textContent = CSS
      document.head.appendChild(el)
    }
    const t = window.setTimeout(finish, DURATION)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Particules déterministes (pas de Math.random au render pour rester stable).
  const particles = Array.from({ length: 18 }, (_, i) => ({
    left: (i * 53) % 100,
    delay: (i % 9) * 0.35,
    size: 3 + (i % 4),
  }))

  return (
    <div
      onClick={finish}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, cursor: 'pointer', overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 46%, #1a0a2b 0%, #0a0613 58%, #050409 100%)',
        display: 'grid', placeItems: 'center',
        animation: exiting ? 'bi-exit .6s cubic-bezier(.16,1,.3,1) both' : undefined,
      }}
    >
      {/* Burst + rings */}
      <div aria-hidden style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.4), transparent 62%)', animation: 'bi-burst 2.4s cubic-bezier(.16,1,.3,1) both' }} />
      {[0, 0.5, 1].map(d => (
        <div key={d} aria-hidden style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', border: '1px solid rgba(236,72,153,0.5)', animation: `bi-ring 2.8s ease-out ${d}s both` }} />
      ))}
      <div aria-hidden style={{ position: 'absolute', top: '20%', left: '24%', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.22), transparent 66%)', filter: 'blur(60px)', animation: 'bi-orb 12s ease-in-out infinite' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: '18%', right: '20%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.2), transparent 66%)', filter: 'blur(64px)', animation: 'bi-orb 15s ease-in-out infinite reverse' }} />

      {/* Particules montantes */}
      {particles.map((p, i) => (
        <span key={i} aria-hidden style={{
          position: 'absolute', bottom: '30%', left: `${p.left}%`, width: p.size, height: p.size, borderRadius: 99,
          background: i % 2 ? '#EC4899' : '#A855F7', boxShadow: '0 0 8px 1px currentColor',
          animation: `bi-particle ${3 + (i % 3)}s ease-in ${p.delay}s infinite`,
        }} />
      ))}

      {/* Contenu central */}
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 2 }}>
        {/* Wordmark */}
        <div style={{ position: 'relative', display: 'inline-flex', perspective: 700, overflow: 'hidden' }}>
          {WORD.split('').map((ch, i) => (
            <span key={i} style={{ display: 'inline-block', fontSize: 'clamp(44px, 10vw, 104px)', fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1,
              animation: `bi-letter .8s cubic-bezier(.16,1,.3,1) ${0.6 + i * 0.11}s both` }}>
              <span style={{
                backgroundImage: 'linear-gradient(100deg,#EC4899,#A855F7,#6366F1,#EC4899)', backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
                animation: 'bi-grad 5s linear infinite', display: 'inline-block',
                filter: 'drop-shadow(0 12px 40px rgba(168,85,247,0.5))',
              }}>{ch}</span>
            </span>
          ))}
          {/* Shine sweep */}
          <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)', width: '40%', animation: 'bi-shine 1.5s cubic-bezier(.5,0,.3,1) 1.9s both', pointerEvents: 'none' }} />
        </div>

        {/* Ligne + tagline */}
        <div style={{ height: 2, width: 220, margin: '26px auto 16px', background: 'linear-gradient(90deg, transparent, #A855F7, transparent)', transformOrigin: 'center', animation: 'bi-line .9s cubic-bezier(.16,1,.3,1) 2.1s both' }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: '#E9C46A', animation: 'bi-tag 1s ease 2.4s both' }}>
          ✦ Espace VIP
        </p>
      </div>

      {/* Barre de progression bas d'écran */}
      <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', transformOrigin: 'left', background: 'linear-gradient(90deg,#EC4899,#A855F7,#6366F1)', animation: `bi-line ${DURATION}ms linear both` }} />
      </div>

      {/* Skip */}
      <button
        onClick={(e) => { e.stopPropagation(); finish() }}
        style={{
          position: 'absolute', bottom: 30, right: 34, display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 999, cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
          animation: 'bi-skip .6s ease 1.4s both',
        }}
      >
        Entrer <span style={{ fontSize: 15 }}>→</span>
      </button>
    </div>
  )
}

export default BlowIntro
