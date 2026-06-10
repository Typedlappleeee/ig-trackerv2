import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { IconMenu, IconClose, IconDownload } from './Icons'

const DOWNLOAD_URL =
  'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'

const LINKS = [
  { href: '#features', label: 'Fonctionnalités' },
  { href: '#pricing', label: 'Tarifs' },
  { href: '#faq', label: 'FAQ' },
]

export function Nav() {
  const [open, setOpen] = useState(false)

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:px-5 glass-strong"
        aria-label="Navigation principale"
      >
        <a href="#top" className="flex items-center rounded-lg" aria-label="ScaleFlow, accueil">
          <Logo />
        </a>

        <div className="hidden items-center gap-8 text-sm text-text2 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="cursor-pointer transition-colors duration-200 hover:text-text"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://scaleflow-fvtu.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary hidden !px-4 !py-2 text-xs sm:inline-flex"
          >
            Ouvrir l'app
          </a>
          <a href={DOWNLOAD_URL} className="btn-primary !px-4 !py-2 text-xs">
            <IconDownload width={16} height={16} />
            Télécharger
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="ml-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-text2 transition-colors duration-200 hover:bg-white/10 hover:text-text md:hidden"
          >
            {open ? <IconClose width={20} height={20} /> : <IconMenu width={20} height={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div
          id="mobile-menu"
          className="mx-auto mt-2 max-w-6xl rounded-2xl p-3 glass-strong md:hidden"
        >
          <div className="flex flex-col">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-lg px-4 py-3 text-sm font-medium text-text2 transition-colors duration-200 hover:bg-white/[0.06] hover:text-text"
              >
                {l.label}
              </a>
            ))}
            <a
              href="https://scaleflow-fvtu.vercel.app/"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded-lg px-4 py-3 text-sm font-medium text-text2 transition-colors duration-200 hover:bg-white/[0.06] hover:text-text"
            >
              Ouvrir l'app dans le navigateur
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
