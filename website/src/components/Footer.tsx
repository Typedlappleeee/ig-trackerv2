import { Logo } from './Logo'
import { IconTelegram } from './Icons'

const COLUMNS = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '#features' },
      { label: 'Tarifs', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
      { label: "Ouvrir l'app", href: 'https://scaleflow-fvtu.vercel.app/' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'CGU', href: '#' },
      { label: 'Confidentialité', href: '#' },
      { label: 'Mentions légales', href: '#' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="relative mt-12 border-t border-border px-5 py-14">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-text2">
              Le poste de pilotage premium pour faire grandir ton Instagram à des dizaines, des
              centaines de comptes.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="https://t.me/justquentin"
                target="_blank"
                rel="noreferrer"
                aria-label="ScaleFlow sur Telegram"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-text2 transition-colors duration-200 glass hover:text-text"
              >
                <IconTelegram />
              </a>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-text">
                {col.title}
              </div>
              <ul className="space-y-2.5 text-sm text-text2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="cursor-pointer transition-colors duration-200 hover:text-text"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-8 text-xs text-muted">
          <span>© {new Date().getFullYear()} ScaleFlow — Tous droits réservés</span>
          <span>Conçu en France</span>
        </div>
      </div>
    </footer>
  )
}
