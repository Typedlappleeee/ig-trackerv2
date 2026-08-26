import { useEffect, useRef, useState } from 'react'

/**
 * BootOverlay — animation d'entrée de l'app (ANIMATIONS.md §3).
 * Overlay plein écran ~1,9 s : le logo maquette (tuile violette + 2 barres) arrive
 * en sfBoot, deux anneaux pulsent, une barre se remplit, puis fondu.
 * Animations 100 % CSS. Respecte prefers-reduced-motion.
 */

const BOOT_CSS = `
@keyframes sfBoot{0%{opacity:0;transform:scale(.55);filter:blur(14px)}55%{opacity:1;filter:blur(0)}70%{transform:scale(1.04)}100%{opacity:1;transform:scale(1);filter:blur(0)}}
@keyframes sfBootRing{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}25%{opacity:.85}100%{transform:translate(-50%,-50%) scale(2.6);opacity:0}}
@keyframes sfBootLine{0%{transform:scaleX(0);opacity:0}30%{opacity:1}100%{transform:scaleX(1);opacity:0}}
@keyframes sfBootFade{0%,74%{opacity:1;visibility:visible}100%{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion: reduce){
  .sf-boot,.sf-boot *{animation:none !important}
}
`

function BootLogo() {
  // Logo maquette : tuile violette + deux barres blanches en biais.
  return (
    <svg width={84} height={84} viewBox="0 0 100 100" fill="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="boot-tile" x1="14" y1="4" x2="86" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="26" fill="url(#boot-tile)" />
      <rect x="4.75" y="4.75" width="90.5" height="90.5" rx="25.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      <g transform="translate(50 43)"><rect x="-23" y="-5.5" width="46" height="10.5" rx="5.25" fill="#fff" transform="skewX(-14)" /></g>
      <g transform="translate(50 61)"><rect x="-23" y="-5.5" width="46" height="10.5" rx="5.25" fill="#fff" transform="skewX(14)" /></g>
    </svg>
  )
}

export function BootOverlay({ onDone }: { onDone: () => void }) {
  const [phones, setPhones] = useState(0)
  const doneRef = useRef(false)

  useEffect(() => {
    // compteur "phones détectés" (cosmétique, 0 → 52)
    const start = Date.now() + 200
    const iv = setInterval(() => {
      const p = Math.min(1, Math.max(0, (Date.now() - start) / 1300))
      setPhones(Math.round(p * 52))
      if (p >= 1) clearInterval(iv)
    }, 60)
    const t = setTimeout(() => { if (!doneRef.current) { doneRef.current = true; onDone() } }, 1900)
    return () => { clearInterval(iv); clearTimeout(t) }
  }, [onDone])

  return (
    <div className="sf-boot" style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: '#040409',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26,
      animation: 'sfBootFade 1.9s cubic-bezier(0.76,0,0.24,1) forwards',
    }}>
      <style>{BOOT_CSS}</style>

      {/* Logo + anneaux */}
      <div style={{ position: 'relative', width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', width: 84, height: 84, borderRadius: '50%', border: '1px solid rgba(168,85,247,0.55)', transform: 'translate(-50%,-50%)', animation: 'sfBootRing 2s cubic-bezier(0.16,1,0.3,1) infinite' }} />
        <span aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', width: 84, height: 84, borderRadius: '50%', border: '1px solid rgba(103,232,249,0.4)', transform: 'translate(-50%,-50%)', animation: 'sfBootRing 2s cubic-bezier(0.16,1,0.3,1) -0.55s infinite' }} />
        <div style={{ animation: 'sfBoot 1.9s cubic-bezier(0.76,0,0.24,1) both', filter: 'drop-shadow(0 12px 30px rgba(124,58,237,0.6))' }}><BootLogo /></div>
      </div>

      {/* Wordmark */}
      <div style={{ fontFamily: "'Space Grotesk','Manrope',sans-serif", fontSize: 15, letterSpacing: '0.34em', color: '#F2F0FF', paddingLeft: '0.34em', animation: 'sfBoot 1.9s cubic-bezier(0.76,0,0.24,1) 0.1s both' }}>
        <span style={{ fontWeight: 500 }}>SCALE</span><span style={{ fontWeight: 700 }}>FLOW</span>
      </div>

      {/* Barre de progression */}
      <div style={{ width: 160, height: 2, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', transformOrigin: 'left', background: 'linear-gradient(90deg,#A855F7,#67E8F9)', animation: 'sfBootLine 1.5s cubic-bezier(0.3,0,0.2,1) 0.2s both' }} />
      </div>

      {/* Statut mono */}
      <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, fontWeight: 600, color: 'rgba(196,181,253,0.6)', letterSpacing: '0.04em' }}>
        connexion à GeeLark · {phones} phones détectés
      </div>
    </div>
  )
}
