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
    title: 'Ressources',
    links: [
      { label: 'Instagram & TikTok', href: '#features' },
      { label: 'Comparatif des offres', href: '#pricing' },
      { label: 'Questions fréquentes', href: '#faq' },
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
      {/* Halo de fond discret */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-10 left-1/2 h-[520px] w-[880px] max-w-full -translate-x-1/2 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(ellipse, #818CF8, transparent 70%)', filter: 'blur(90px)' }}
        />
      </div>

      <div className="mx-auto max-w-6xl">
        {/* ── CTA banner ─────────────────────────────────────────────────── */}
        <div className="reveal gradient-ring relative overflow-hidden rounded-[28px]">
          {/* Aurora + halos internes */}
          <div
            className="pointer-events-none absolute -top-28 left-1/2 h-72 w-[560px] max-w-full -translate-x-1/2 rounded-full animate-aurora opacity-30"
            style={{ background: 'radial-gradient(ellipse, rgba(129,140,248,0.9), transparent 70%)', filter: 'blur(70px)' }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full animate-aurora opacity-20"
            style={{ background: 'radial-gradient(circle, #5EEAD4, transparent 70%)', filter: 'blur(64px)', animationDelay: '-7s' }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-16 h-64 w-64 rounded-full animate-aurora opacity-20"
            style={{ background: 'radial-gradient(circle, #C084FC, transparent 70%)', filter: 'blur(64px)', animationDelay: '-12s' }}
            aria-hidden="true"
          />
          {/* Grille très subtile */}
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.02]" aria-hidden="true" />

          <div className="relative px-7 py-14 text-center sm:px-12 sm:py-20">
            <span className="section-label">C'est le moment</span>
            <h2 className="font-display h-section mx-auto max-w-2xl">
              Prêt à <span className="gradient-text">passer à l'échelle&nbsp;?</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-text2 sm:text-lg">
              Connecte ton GeeLark, charge tes vidéos et lance ton premier mass post aujourd'hui —
              sur <strong className="font-semibold text-text">Instagram</strong> comme sur{' '}
              <strong className="font-semibold text-text">TikTok</strong>. Des dizaines de comptes,
              un seul clic.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={APP_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-primary w-full !px-8 !py-3.5 !text-[15px] sm:w-auto"
              >
                Commencer gratuitement
                <IconArrowRight width={17} height={17} />
              </a>
              <a
                href={DOWNLOAD_URL}
                className="btn-secondary w-full !px-8 !py-3.5 !text-[15px] sm:w-auto"
              >
                <IconDownload width={17} height={17} />
                Télécharger
              </a>
            </div>

            <p className="mt-6 text-xs text-muted">
              Sans carte bancaire · Windows, Mac &amp; Web · Setup en &lt; 5 min
            </p>
          </div>
        </div>

        {/* ── Footer proper ──────────────────────────────────────────────── */}
        <div className="relative mt-20">
          <div className="hairline" aria-hidden="true" />
          <div className="grid grid-cols-2 gap-10 pt-14 sm:grid-cols-3 lg:grid-cols-6">
            <div className="col-span-2 lg:col-span-3">
              <Logo />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-text2">
                La plateforme de mass posting Instagram &amp; TikTok pour créateurs, agences et
                growth hackers. Pilote des centaines de comptes via GeeLark, depuis un seul dashboard.
              </p>
              <div className="mt-6 flex items-center gap-3">
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
        </div>

        {/* ── Bottom bar ─────────────────────────────────────────────────── */}
        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted">© {new Date().getFullYear()} ScaleFlow. Tous droits réservés.</p>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            Conçu en France <span aria-label="drapeau français">🇫🇷</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
