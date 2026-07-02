import { useEffect, useState } from 'react'
import { Logo } from './Logo'

const DOWNLOAD_URL = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'
const APP_URL      = 'https://scaleflow-fvtu.vercel.app/'

const LINKS = [
  { href: '#features', label: 'Fonctionnalités' },
  { href: '#how',      label: 'Comment ça marche' },
  { href: '#pricing',  label: 'Tarifs' },
  { href: '#faq',      label: 'FAQ' },
]

export function Nav() {
  const [open,     setOpen]     = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const s = window.scrollY
      setScrolled(s > 40)
      const doc = document.documentElement
      const total = doc.scrollHeight - doc.clientHeight
      setProgress(total > 0 ? Math.min(100, (s / total) * 100) : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Scroll progress line */}
      <div
        className="fixed top-0 left-0 z-[60] h-[2px] transition-all duration-100"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #22D3EE, #818CF8, #A855F7)',
          opacity: scrolled ? 1 : 0,
        }}
      />

      <header className="fixed inset-x-0 top-3 z-50 px-4">
        {/* Voile plein largeur : masque le contenu qui défile sous la barre
            (la barre est une pastille centrée, le texte passait sur les côtés). */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 h-24 -z-10 transition-opacity duration-300"
          style={{
            opacity: scrolled ? 1 : 0,
            background: 'linear-gradient(180deg, rgba(6,6,14,0.92) 0%, rgba(6,6,14,0.75) 45%, rgba(6,6,14,0) 100%)',
          }}
        />
        <nav
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl px-4 py-2.5 sm:px-5"
          style={{
            background: scrolled ? 'rgba(6,6,14,0.92)' : 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.09)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
            boxShadow: scrolled ? '0 8px 32px -8px rgba(0,0,0,0.6)' : 'none',
          }}
          aria-label="Navigation principale"
        >
          <a href="#top" className="flex items-center gap-2.5 rounded-lg" aria-label="ScaleFlow, accueil">
            <Logo />
          </a>

          {/* Desktop links */}
          <div className="hidden items-center gap-7 text-sm text-text2 md:flex">
            {LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                className="cursor-pointer transition-colors duration-200 hover:text-text"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="flex items-center gap-2">
            <a
              href={APP_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex btn-ghost !px-4 !py-2 !text-xs !rounded-xl"
            >
              Ouvrir l'app
            </a>
            <a
              href={DOWNLOAD_URL}
              className="btn-primary !px-4 !py-2 !text-xs !rounded-xl"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Télécharger
            </a>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={open}
              className="ml-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-text2 transition-colors duration-200 hover:bg-white/10 hover:text-text md:hidden"
            >
              {open ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              )}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {open && (
          <div
            className="mx-auto mt-2 max-w-6xl overflow-hidden rounded-2xl p-2"
            style={{
              background: 'rgba(6,6,14,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex cursor-pointer items-center rounded-xl px-4 py-3 text-sm font-medium text-text2 transition-colors duration-200 hover:bg-white/[0.05] hover:text-text"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-white/[0.06] p-2 pt-3">
              <a
                href={APP_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="btn-secondary w-full !justify-center !py-2.5 !text-sm"
              >
                Ouvrir l'app dans le navigateur
              </a>
              <a
                href={DOWNLOAD_URL}
                onClick={() => setOpen(false)}
                className="btn-primary w-full !justify-center !py-2.5 !text-sm"
              >
                Télécharger gratuitement
              </a>
            </div>
          </div>
        )}
      </header>
    </>
  )
}
