// Blowsome — intro cinématique « le sceau » jouée à l'entrée dans la sous-app.
// Séquence ~3,5 s, tout en CSS pur (React efface l'inline style au re-render) :
// monogramme ✦ → 8 pétales qui jaillissent → BLOWSOME qui se resserre → filet or →
// AGENCE VIP → ouverture en VOLETS HORIZONTAUX. `onDone` tombe à 3,5 s.
// Le deep-link #pf-fs= saute l'intro en amont (BlowsomeApp ne monte pas ce composant).
import { useEffect, useRef, type CSSProperties } from 'react'
import { useTr } from '@/lib/i18n'

const DURATION = 3500

const CSS = `
@keyframes bSealIn{0%{opacity:0;transform:scale(.35) rotate(-120deg)}40%{opacity:1;transform:scale(1) rotate(0)}72%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.7)}}
@keyframes bSealGlow{0%{opacity:0;transform:scale(.3)}30%{opacity:.9}70%{opacity:.55}100%{opacity:0;transform:scale(2.4)}}
@keyframes bPetal{0%{opacity:0;transform:rotate(var(--a)) translateY(0) scaleY(.2)}34%{opacity:1;transform:rotate(var(--a)) translateY(-34px) scaleY(1)}70%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateY(-90px) scaleY(.4)}}
@keyframes bWord{0%{opacity:0;transform:translateY(16px);filter:blur(10px);letter-spacing:0.9em}55%{opacity:1;filter:blur(0)}100%{opacity:1;transform:translateY(0);filter:blur(0);letter-spacing:0.42em}}
@keyframes bGold{0%{opacity:0;transform:scaleX(0)}40%{opacity:1}100%{opacity:1;transform:scaleX(1)}}
@keyframes bVeilOut{0%,72%{opacity:1;visibility:visible}100%{opacity:0;visibility:hidden}}
@keyframes bIris{0%,64%{clip-path:inset(0 0 0 0)}100%{clip-path:inset(50% 0 50% 0)}}
@keyframes bTag{0%{opacity:0;transform:translateY(9px)}100%{opacity:1;transform:translateY(0)}}
`

export function BlowIntro({ onDone }: { onDone: () => void }) {
  const tr = useTr()
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
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

  // 8 pétales qui jaillissent du centre, une tous les 50 ms, alternant or / magenta.
  // opacity:0 INLINE obligatoire : sinon l'élément s'affiche en statique pendant son délai.
  const petals = Array.from({ length: 8 }, (_, i) => {
    const style: CSSProperties = {
      position: 'absolute', top: '50%', left: '50%',
      width: 2, height: 22, marginLeft: -1, marginTop: -11,
      borderRadius: 99, transformOrigin: 'center bottom', opacity: 0,
      background: i % 2
        ? 'linear-gradient(180deg, transparent, rgba(233,196,106,0.9))'
        : 'linear-gradient(180deg, transparent, rgba(236,72,153,0.95))',
      animation: `bPetal 3.1s cubic-bezier(0.16,1,0.3,1) ${(0.3 + i * 0.05).toFixed(2)}s both`,
      ['--a' as any]: `${i * 45}deg`,
    }
    return <span key={i} aria-hidden style={style} />
  })

  return (
    <div
      aria-hidden
      onClick={finish}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, cursor: 'pointer', overflow: 'hidden',
        background: '#08070d',
        animation: 'bVeilOut 3.5s cubic-bezier(0.76,0,0.24,1) forwards, bIris 3.5s cubic-bezier(0.76,0,0.24,1) forwards',
      }}
    >
      {/* Halo magenta derrière le sceau */}
      <span aria-hidden style={{
        position: 'absolute', top: '50%', left: '50%', width: 520, height: 520, margin: '-260px 0 0 -260px',
        borderRadius: '50%', filter: 'blur(70px)',
        background: 'radial-gradient(circle, rgba(236,72,153,0.5), rgba(168,85,247,0.28) 44%, transparent 72%)',
        animation: 'bSealGlow 3.2s cubic-bezier(0.3,0,0.4,1) 0.15s both',
      }} />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        {/* Monogramme + pétales */}
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 96, height: 96 }}>
          {petals}
          <span style={{
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 19,
            background: 'linear-gradient(100deg,#EC4899,#A855F7,#6366F1)',
            boxShadow: '0 0 80px -6px rgba(168,85,247,0.95), inset 0 1px 0 rgba(255,255,255,0.4)',
            color: '#fff', fontSize: 30, fontWeight: 900,
            animation: 'bSealIn 3.3s cubic-bezier(0.16,1,0.3,1) 0.1s both',
          }}>✦</span>
        </span>

        {/* BLOWSOME qui se resserre depuis un flou */}
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(15px,2.2vw,26px)', fontWeight: 700,
          letterSpacing: '0.42em', color: '#ECE9F5',
          animation: 'bWord 2s cubic-bezier(0.16,1,0.3,1) 0.75s both',
        }}>BLOWSOME</span>

        {/* Filet or */}
        <span style={{
          width: 'clamp(120px,18vw,220px)', height: 1, transformOrigin: 'center',
          background: 'linear-gradient(90deg, transparent, #E9C46A, transparent)',
          animation: 'bGold 1.5s cubic-bezier(0.16,1,0.3,1) 1.3s both',
        }} />

        {/* AGENCE VIP */}
        <span style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: '0.4em', textTransform: 'uppercase',
          color: 'rgba(233,196,106,0.75)',
          animation: 'bTag 1.2s cubic-bezier(0.16,1,0.3,1) 1.6s both',
        }}>{tr('Agence VIP', 'VIP Agency')}</span>
      </div>
    </div>
  )
}

export default BlowIntro
