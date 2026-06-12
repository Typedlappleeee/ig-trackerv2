import { useEffect, useRef } from 'react'
import { Logo } from './Logo'
import { IconTelegram, IconDownload, IconArrowRight, IconGlobe } from './Icons'

const APP_URL = 'https://scaleflow-fvtu.vercel.app/'
const DOWNLOAD_URL = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'
const TELEGRAM_URL = 'https://t.me/justquentin'

const COLUMNS = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '#features' },
      { label: 'Comment ça marche', href: '#how' },
      { label: 'Tarifs', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
      { label: 'Ouvrir l\'app', href: APP_URL, external: true },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'Conditions d\'utilisation', href: APP_URL, external: true },
      { label: 'Politique de confidentialité', href: APP_URL, external: true },
      { label: 'Contact', href: TELEGRAM_URL, external: true },
    ],
  },
]

function useReveal() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    el.querySelectorAll('.reveal').forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [])
  return ref
}

export function Footer() {
  const ref = useReveal()

  return (
    <footer ref={ref} className="relative px-5 pb-10 pt-12">
      <div className="mx-auto max-w-6xl">
        {/* ── CTA banner ─────────────────────────────────────────────────── */}
        <div className="reveal gradient-ring relative overflow-hidden rounded-3xl">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[480px] -translate-x-1/2 rounded-full opacity-25"
            style={{ background: 'radial-gradient(ellipse, #818CF8, transparent)', filter: 'blur(50px)' }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #22D3EE, transparent)', filter: 'blur(50px)' }}
            aria-hidden="true"
          />

          <div className="relative px-7 py-12 text-center sm:px-12 sm:py-16">
            <span className="section-label">C'est le moment</span>
            <h2 className="text-3xl font-black text-text sm:text-5xl">
              Prêt à <span className="gradient-text">scaler ?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-text2">
              Connecte ton GeeLark, charge tes vidéos et lance ton premier mass post aujourd'hui.
              Des dizaines de comptes, un seul clic.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={DOWNLOAD_URL} className="btn-primary cursor-pointer">
                <IconDownload width={18} height={18} />
                Télécharger pour Windows
              </a>
              <a href={APP_URL} target="_blank" rel="noreferrer" className="btn-secondary cursor-pointer">
                <IconGlobe width={18} height={18} />
                Ouvrir l'app web
                <IconArrowRight width={16} height={16} />
              </a>
            </div>
            <p className="mt-5 text-xs text-muted">Gratuit à télécharger · Compte requis pour publier</p>
          </div>
        </div>

        {/* ── Footer proper ──────────────────────────────────────────────── */}
        <div className="mt-16 grid grid-cols-1 gap-10 border-t border-border pt-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-text2">
              La plateforme de mass posting Instagram pour créateurs, agences et growth hackers.
              Pilote des centaines de comptes via GeeLark, depuis un seul dashboard.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Telegram"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border bg-white/[0.03] text-text2 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan/40 hover:text-cyan"
              >
                <IconTelegram />
              </a>
              <a
                href={APP_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Application web"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border bg-white/[0.03] text-text2 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet/40 hover:text-indigo"
              >
                <IconGlobe width={20} height={20} />
              </a>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-text">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...('external' in link && link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className="cursor-pointer text-sm text-text2 transition-colors duration-200 hover:text-text"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* ── Bottom bar ─────────────────────────────────────────────────── */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted">© {new Date().getFullYear()} ScaleFlow. Tous droits réservés.</p>
          <p className="text-xs text-muted">
            Conçu en France <span aria-label="drapeau français">🇫🇷</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
