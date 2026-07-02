import { useEffect, useRef, useState } from 'react'
import { AppMockup } from './AppMockup'

const WINDOWS_URL = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'
const MAC_URL     = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow.dmg'
const APP_URL     = 'https://scaleflow-fvtu.vercel.app/'

function useIsMac() {
  const [mac, setMac] = useState(false)
  useEffect(() => {
    const p = (navigator.platform || navigator.userAgent || '').toLowerCase()
    setMac(p.includes('mac'))
  }, [])
  return mac
}

function StatCounter({ target, suffix = '', label, compact = false }: { target: number; suffix?: string; label: string; compact?: boolean }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const fmt = (n: number) => compact
    ? new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: n >= target ? 0 : 1 }).format(n)
    : n.toLocaleString('fr-FR')

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
      <div className="stat-value font-display text-2xl font-bold leading-tight tracking-tight text-text sm:text-4xl">
        {fmt(count)}{suffix}
      </div>
      <div className="mt-1.5 text-[11px] leading-snug text-text2 sm:text-xs">{label}</div>
    </div>
  )
}

// Petits logos de plateformes / stack (SVG inline, honnêtes)
const TrustStrip = () => (
  <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] font-medium text-text2 animate-fade-up" style={{ animationDelay: '0.42s' }}>
    <span className="text-muted">Propulsé par</span>
    <span className="inline-flex items-center gap-1.5 text-text">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GeeLark
    </span>
    <span className="text-muted">·</span>
    <span className="inline-flex items-center gap-2 text-text">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>
      Instagram
    </span>
    <span className="text-muted">·</span>
    <span className="inline-flex items-center gap-1.5 text-text">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 3c.4 2.4 2 4.1 4.5 4.4v3c-1.7.1-3.2-.4-4.6-1.3v6.2c0 3.6-2.7 5.9-6 5.9-3.2 0-5.6-2.5-5.6-5.5 0-3.4 2.9-5.9 6.4-5.3v3.1c-.4-.1-.9-.2-1.3-.2-1.4 0-2.4 1-2.4 2.4 0 1.4 1 2.4 2.5 2.4 1.6 0 2.6-1.1 2.6-2.9V3h3.9z"/></svg>
      TikTok
    </span>
    <span className="text-muted">·</span>
    <span className="text-text">IA Claude &amp; Groq</span>
  </div>
)

export function Hero() {
  const isMac = useIsMac()
  const dlUrl   = isMac ? MAC_URL : WINDOWS_URL
  const dlLabel = isMac ? 'Télécharger pour Mac' : 'Télécharger pour Windows'

  return (
    <section className="relative overflow-hidden px-5 pt-36 pb-14 sm:pt-40">
      {/* Fonds : aurora animée + halo + grille */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 h-[860px] w-[860px] -translate-x-1/2 rounded-full animate-aurora"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 68%)', filter: 'blur(90px)' }}
        />
        <div
          className="absolute top-[18%] -left-44 h-[560px] w-[560px] rounded-full animate-aurora"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.14) 0%, transparent 70%)', filter: 'blur(90px)', animationDelay: '-6s' }}
        />
        <div
          className="absolute top-[26%] -right-36 h-[520px] w-[520px] rounded-full animate-aurora"
          style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.10) 0%, transparent 70%)', filter: 'blur(100px)', animationDelay: '-11s' }}
        />
        <div className="absolute inset-0 bg-grid opacity-[0.022]" />
        {/* Fondu bas pour fondre dans la section suivante */}
        <div className="absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(180deg, transparent, #06060E)' }} />
      </div>

      <div className="mx-auto max-w-6xl">
        {/* Badge */}
        <div className="flex justify-center">
          <span className="eyebrow animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            Automatisation Instagram &amp; TikTok multi-comptes
          </span>
        </div>

        {/* Headline */}
        <h1
          className="mx-auto mt-7 max-w-4xl text-center text-[2.7rem] font-bold leading-[1.02] text-text animate-fade-up sm:text-6xl lg:text-[4.6rem]"
          style={{ animationDelay: '0.08s' }}
        >
          Publie sur <span className="shine-text">100+ comptes</span>
          <br className="hidden sm:block" />{' '}
          en <span className="gradient-text">un seul clic</span>.
        </h1>

        {/* Sub */}
        <p
          className="mx-auto mt-6 max-w-2xl text-center text-base leading-relaxed text-text2 animate-fade-up sm:text-lg"
          style={{ animationDelay: '0.18s' }}
        >
          Mass posting, programmation, warmup et remix vidéo réunis dans{' '}
          <strong className="font-semibold text-text">un seul poste de pilotage</strong>. Ce qui te
          prenait la semaine se fait en 5 minutes.
        </p>

        {/* CTAs */}
        <div
          className="mt-9 flex flex-col items-center justify-center gap-3 animate-fade-up sm:flex-row"
          style={{ animationDelay: '0.28s' }}
        >
          <a href={APP_URL} target="_blank" rel="noreferrer" className="btn-primary w-full !px-8 !py-3.5 !text-[15px] sm:w-auto">
            Commencer gratuitement
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </a>
          <a href={dlUrl} className="btn-secondary w-full !px-8 !py-3.5 !text-[15px] sm:w-auto">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {dlLabel}
          </a>
        </div>

        {/* Micro reassurance */}
        <div
          className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-text2 animate-fade-up"
          style={{ animationDelay: '0.34s' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" strokeWidth="2.6" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            Sans carte bancaire
          </span>
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" strokeWidth="2.6" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            Windows, Mac &amp; Web
          </span>
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" strokeWidth="2.6" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            Setup en &lt; 5 min
          </span>
        </div>

        <TrustStrip />

        {/* Stats */}
        <div
          className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-2.5 animate-fade-up sm:gap-6"
          style={{ animationDelay: '0.5s' }}
        >
          {[
            { target: 100, suffix: '+', label: 'comptes en parallèle', compact: false },
            { target: 1_000_000, suffix: '+', label: 'posts publiés', compact: true },
            { target: 15, suffix: 'h', label: 'gagnées / semaine', compact: false },
          ].map(s => (
            <div key={s.label} className="glass-card overflow-hidden rounded-2xl px-2 py-4 text-center sm:px-3 sm:py-5">
              <StatCounter target={s.target} suffix={s.suffix} label={s.label} compact={s.compact} />
            </div>
          ))}
        </div>

        {/* App mockup */}
        <div className="relative mt-16 animate-fade-up" style={{ animationDelay: '0.6s' }}>
          <div
            className="pointer-events-none absolute inset-x-0 -top-14 mx-auto h-64 max-w-4xl rounded-full opacity-60 blur-3xl"
            style={{ background: 'linear-gradient(120deg, rgba(94,234,212,0.18), rgba(129,140,248,0.22), rgba(192,132,252,0.18))' }}
          />
          <AppMockup />
        </div>
      </div>
    </section>
  )
}
