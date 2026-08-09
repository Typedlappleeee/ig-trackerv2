import { useEffect } from 'react'
import { useTr } from '@/lib/i18n'

// Onglet Blowsome — exclusif agence VIP (clé avec add-on blowsome).
// Page "à venir" : grosse animation avec le mot BLOWSOME.
const CSS = `
@keyframes blow-grad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes blow-shine { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes blow-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
@keyframes blow-rise { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
@keyframes blow-orb-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(60px,40px) scale(1.15)} }
@keyframes blow-orb-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-50px,50px) scale(0.9)} }
@keyframes blow-pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
@keyframes blow-letter { 0%{opacity:0;transform:translateY(40px) rotateX(-90deg)} 100%{opacity:1;transform:translateY(0) rotateX(0)} }
`

function Letters({ word }: { word: string }) {
  return (
    <span style={{ display: 'inline-flex', perspective: 600 }}>
      {word.split('').map((ch, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            animation: `blow-letter 0.7s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.07}s both`,
            backgroundImage: 'linear-gradient(90deg,#EC4899,#8B5CF6,#6366F1,#EC4899)',
            backgroundSize: '300% auto',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animationName: 'blow-letter',
          }}
        >
          <span style={{ animation: `blow-grad 6s ease infinite`, backgroundImage: 'inherit', backgroundSize: '300% auto', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {ch}
          </span>
        </span>
      ))}
    </span>
  )
}

export function Blowsome() {
  const tr = useTr()
  useEffect(() => {
    const id = 'sf-blowsome-css'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id; el.textContent = CSS
      document.head.appendChild(el)
    }
  }, [])

  return (
    <div style={{ position: 'relative', minHeight: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 20%, #12071c 0%, #07070c 60%)', padding: 32, boxSizing: 'border-box' }}>

      {/* Orbes lumineux animés */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '12%', left: '18%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.28), transparent 65%)', filter: 'blur(60px)', animation: 'blow-orb-a 16s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '14%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.26), transparent 66%)', filter: 'blur(66px)', animation: 'blow-orb-b 20s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '40%', left: '50%', width: 300, height: 300, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle, rgba(139,92,246,0.22), transparent 68%)', filter: 'blur(50px)', animation: 'blow-pulse 5s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 720 }}>

        {/* Badge VIP */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderRadius: 999, marginBottom: 28, background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.35)', animation: 'blow-rise 0.6s cubic-bezier(0.16,1,0.3,1) both' }}>
          <span style={{ fontSize: 13 }}>✦</span>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#F472B6' }}>{tr('Agence VIP', 'VIP Agency')}</span>
        </div>

        {/* Titre géant */}
        <h1 style={{ margin: 0, fontSize: 'clamp(52px, 12vw, 128px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.95, animation: 'blow-float 6s ease-in-out infinite', filter: 'drop-shadow(0 20px 60px rgba(236,72,153,0.35))' }}>
          <Letters word="BLOWSOME" />
        </h1>

        {/* Sous-titre "à venir" */}
        <div style={{ marginTop: 30, animation: 'blow-rise 0.7s cubic-bezier(0.16,1,0.3,1) 0.8s both' }}>
          <p style={{
            display: 'inline-block', margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '0.06em',
            padding: '10px 22px', borderRadius: 999,
            color: '#fff',
            background: 'linear-gradient(90deg, rgba(236,72,153,0.25), rgba(99,102,241,0.25))',
            border: '1px solid rgba(255,255,255,0.12)',
            backgroundSize: '200% auto', animation: 'blow-shine 4s linear infinite',
          }}>
            {tr('🚀 Bientôt disponible', '🚀 Coming soon')}
          </p>
          <p style={{ margin: '20px auto 0', maxWidth: 460, fontSize: 14.5, lineHeight: 1.6, color: 'rgba(226,226,240,0.7)', animation: 'blow-rise 0.7s cubic-bezier(0.16,1,0.3,1) 1s both' }}>
            {tr(
              "Une expérience exclusive réservée aux agences Blowsome. Quelque chose de grand se prépare — reste connecté.",
              'An exclusive experience reserved for Blowsome agencies. Something big is coming — stay tuned.',
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

export default Blowsome
