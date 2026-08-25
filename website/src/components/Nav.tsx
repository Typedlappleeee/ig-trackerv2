import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { IconArrowRight, IconMenu, IconClose } from './Icons'
import { APP_URL, WINDOWS_URL } from '../lib/links'

const LINKS = [
  { href: '#features', label: 'Fonctionnalités' },
  { href: '#cloud',    label: 'Cloud Phones', soon: true },
  { href: '#how',      label: 'Comment ça marche' },
  { href: '#pricing',  label: 'Tarifs' },
  { href: '#faq',      label: 'FAQ' },
]

export function Nav({ progress = 0 }: { progress?: number }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <header className="sticky top-0 z-50 px-4 py-3.5">
      {/* Barre de progression de scroll */}
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 h-0.5 transition-[width] duration-100"
        style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#22D3EE,#818CF8,#A855F7)' }}
      />
      <nav
        className="mx-auto flex max-w-[1140px] items-center justify-between gap-6 rounded-[18px] px-5 py-3"
        style={{
          background: 'rgba(10,10,24,0.72)',
          border: '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px -12px rgba(0,0,0,0.6)',
        }}
        aria-label="Navigation principale"
      >
        <a href="#top" aria-label="ScaleFlow, accueil"><Logo /></a>

        <div className="hidden items-center gap-7 text-sm font-semibold text-text2 md:flex">
          {LINKS.map(l => (
            <a key={l.href} href={l.href} className="inline-flex items-center gap-1.5 transition-colors duration-200 hover:text-text">
              {l.label}
              {'soon' in l && l.soon && (
                <span className="rounded-full border border-cyan/35 bg-cyan/[0.14] px-1.5 py-px text-[9px] font-extrabold tracking-[0.08em] text-[#67E8F9]">
                  SOON
                </span>
              )}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <a href={WINDOWS_URL} className="hidden rounded-full border border-white/[0.14] px-4 py-2.5 text-[13px] font-bold text-text transition-colors duration-200 hover:border-white/40 sm:inline-flex">
            Télécharger
          </a>
          <a
            href={APP_URL} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-[18px] py-2.5 text-[13px] font-extrabold text-[#0A0A16] transition-shadow duration-200"
            style={{ background: 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)', boxShadow: '0 0 28px -6px rgba(129,140,248,0.7)' }}
          >
            Commencer <IconArrowRight width={14} height={14} strokeWidth={2.4} />
          </a>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            className="ml-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-text2 transition-colors duration-200 hover:bg-white/10 hover:text-text md:hidden"
          >
            {open ? <IconClose width={20} height={20} /> : <IconMenu width={20} height={20} />}
          </button>
        </div>
      </nav>

      {open && (
        <div
          className="mx-auto mt-2 max-w-[1140px] overflow-hidden rounded-2xl p-2"
          style={{ background: 'rgba(10,10,24,0.95)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)' }}
        >
          {LINKS.map(l => (
            <a
              key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="flex cursor-pointer items-center rounded-xl px-4 py-3 text-sm font-semibold text-text2 transition-colors duration-200 hover:bg-white/[0.05] hover:text-text"
            >
              {l.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-white/[0.06] p-2 pt-3">
            <a href={APP_URL} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="btn-primary w-full !justify-center !py-2.5 !text-sm">
              Commencer gratuitement
            </a>
            <a href={WINDOWS_URL} onClick={() => setOpen(false)} className="btn-secondary w-full !justify-center !py-2.5 !text-sm">
              Télécharger l'app
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
