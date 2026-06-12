import { useEffect, useRef, useState } from 'react'
import { AppMockup } from './AppMockup'

const WINDOWS_URL = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'
const MAC_URL     = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow.dmg'
const APP_URL     = 'https://scaleflow-fvtu.vercel.app/'

const WORDS = ['grande échelle.', 'des centaines.', 'l\'automatique.', 'zéro effort.']

function useTypewriter(words: string[], speed = 60, pause = 2200) {
  const [text,    setText]    = useState('')
  const [wIdx,    setWIdx]    = useState(0)
  const [cIdx,    setCIdx]    = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const word = words[wIdx]
    let delay = deleting ? speed / 2 : speed
    if (!deleting && cIdx === word.length)  delay = pause
    if (deleting  && cIdx === 0)            delay = 300

    const t = setTimeout(() => {
      if (!deleting && cIdx === word.length) { setDeleting(true); return }
      if (deleting && cIdx === 0)            { setDeleting(false); setWIdx(i => (i + 1) % words.length); return }
      setCIdx(i => i + (deleting ? -1 : 1))
      setText(word.slice(0, cIdx + (deleting ? -1 : 1)))
    }, delay)
    return () => clearTimeout(t)
  }, [text, cIdx, wIdx, deleting, words, speed, pause])

  return text
}

function StatCounter({ target, suffix = '', label }: { target: number; suffix?: string; label: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true
        const start = Date.now()
        const duration = 1400
        const tick = () => {
          const elapsed = Date.now() - start
          const progress = Math.min(elapsed / duration, 1)
          const ease = 1 - Math.pow(1 - progress, 3)
          setCount(Math.round(ease * target))
          if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [target])

  return (
    <div ref={ref} className="text-center">
      <div className="stat-value text-3xl font-black text-text sm:text-4xl">
        {count.toLocaleString('fr-FR')}{suffix}
      </div>
      <div className="mt-1.5 text-xs text-text2 leading-snug">{label}</div>
    </div>
  )
}

export function Hero() {
  const word = useTypewriter(WORDS)

  return (
    <section className="relative overflow-hidden px-5 pt-32 pb-12 sm:pt-36">
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute -top-32 left-1/2 h-[900px] w-[900px] -translate-x-1/2 rounded-full animate-float-slow opacity-[0.18]"
          style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)', filter: 'blur(100px)' }}
        />
        <div
          className="absolute top-1/4 -left-40 h-[600px] w-[600px] rounded-full animate-float-slow2 opacity-[0.12]"
          style={{ background: 'radial-gradient(circle, #22D3EE 0%, transparent 70%)', filter: 'blur(90px)' }}
        />
        <div
          className="absolute top-1/3 -right-32 h-[500px] w-[500px] rounded-full opacity-[0.1]"
          style={{ background: 'radial-gradient(circle, #EC4899 0%, transparent 70%)', filter: 'blur(100px)' }}
        />
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="mx-auto max-w-6xl">
        {/* Badge */}
        <div className="flex justify-center">
          <span className="eyebrow animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            Automatisation Instagram multi-comptes
          </span>
        </div>

        {/* Headline */}
        <div className="mx-auto mt-6 max-w-4xl text-center animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <h1 className="text-5xl font-black leading-[1.0] text-text sm:text-6xl lg:text-7xl">
            Pilote ton Instagram
            <br />
            <span className="gradient-text">à {word}</span>
            <span
              className="ml-0.5 inline-block h-[0.85em] w-[3px] align-middle"
              style={{
                background: 'linear-gradient(180deg, #22D3EE, #A855F7)',
                animation: 'pulseDot 1s ease-in-out infinite',
                borderRadius: 2,
              }}
            />
          </h1>
        </div>

        {/* Sub */}
        <p
          className="mx-auto mt-6 max-w-2xl text-center text-base text-text2 sm:text-lg animate-fade-up"
          style={{ animationDelay: '0.2s' }}
        >
          Mass posting, programmation, warmup, IA et remix vidéo réunis dans{' '}
          <strong className="text-text font-semibold">un seul poste de pilotage</strong>.
          {' '}La seule app pensée pour gérer des centaines de comptes sans t'éparpiller.
        </p>

        {/* CTAs */}
        <div
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up"
          style={{ animationDelay: '0.3s' }}
        >
          <a href={WINDOWS_URL} className="btn-primary w-full sm:w-auto !px-8 !py-3.5 !text-sm !rounded-2xl">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Télécharger gratuitement — Windows
          </a>
          <a href={APP_URL} target="_blank" rel="noreferrer" className="btn-secondary w-full sm:w-auto !px-8 !py-3.5 !text-sm !rounded-2xl">
            Tester dans le navigateur
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
          </a>
        </div>

        {/* Micro links */}
        <div
          className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-text2 animate-fade-up"
          style={{ animationDelay: '0.35s' }}
        >
          <a href={MAC_URL} className="cursor-pointer underline-offset-2 transition-colors duration-200 hover:text-text hover:underline">
            Version Mac (.dmg)
          </a>
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            Gratuit à tester · Aucune carte requise
          </span>
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            Mac & Windows
          </span>
        </div>

        {/* Stats */}
        <div
          className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-4 sm:gap-6 animate-fade-up"
          style={{ animationDelay: '0.4s' }}
        >
          {[
            { target: 100, suffix: '+', label: 'comptes pilotés en parallèle' },
            { target: 1_000_000, suffix: '+', label: 'posts publiés via ScaleFlow' },
            { target: 24, suffix: '/7', label: 'support inclus' },
          ].map(s => (
            <div
              key={s.label}
              className="glass-card rounded-2xl px-3 py-5 text-center"
            >
              <StatCounter target={s.target} suffix={s.suffix} label={s.label} />
            </div>
          ))}
        </div>

        {/* App mockup */}
        <div
          className="relative mt-14 animate-fade-up"
          style={{ animationDelay: '0.5s' }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 -top-12 mx-auto h-64 max-w-4xl rounded-full opacity-50 blur-3xl"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,.2), rgba(129,140,248,.2), rgba(168,85,247,.2))' }}
          />
          <AppMockup />
        </div>
      </div>
    </section>
  )
}
