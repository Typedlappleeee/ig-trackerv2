import { Logo } from './Logo'
import { useReveal } from '../hooks/useReveal'
import { IconArrowRight, IconDownload } from './Icons'
import { APP_URL, WINDOWS_URL, TELEGRAM_URL } from '../lib/links'

const COLUMNS = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '#features' },
      { label: 'Comment ça marche', href: '#how' },
      { label: 'Tarifs', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
      { label: "Ouvrir l'app", href: APP_URL, external: true },
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
      { label: "Conditions d'utilisation", href: APP_URL, external: true },
      { label: 'Politique de confidentialité', href: APP_URL, external: true },
      { label: 'Contact', href: TELEGRAM_URL, external: true },
    ],
  },
]

export function Footer() {
  const ref = useReveal<HTMLElement>()

  return (
    <footer className="relative z-[1] border-t border-white/[0.07]" ref={ref}>
      <div className="mx-auto max-w-[1140px] px-6 pb-11 pt-25">
        <div className="reveal mx-auto max-w-[680px] text-center">
          <span className="section-label">C'est le moment</span>
          <h2 className="font-display text-[2.2rem] font-bold leading-[1.08] tracking-[-0.02em] text-text sm:text-[52px]">
            Prêt à <span className="gradient-text-warm">passer à l'échelle&nbsp;?</span>
          </h2>
          <p className="mx-auto mt-5.5 max-w-[540px] text-base leading-[1.7] text-text2">
            Connecte ton GeeLark, charge tes vidéos et lance ton premier mass post aujourd'hui — sur{' '}
            <strong className="font-bold text-text">Instagram</strong> comme sur{' '}
            <strong className="font-bold text-text">TikTok</strong>. Des dizaines de comptes, un seul clic.
          </p>
          <div className="mt-9.5 flex flex-wrap items-center justify-center gap-3.5">
            <a href={APP_URL} target="_blank" rel="noreferrer" className="btn-primary !px-8 !py-4 !text-[15px] !font-extrabold">
              Commencer gratuitement <IconArrowRight width={17} height={17} strokeWidth={2.3} />
            </a>
            <a href={WINDOWS_URL} className="btn-secondary !px-8 !py-4 !text-[15px] !font-bold">
              <IconDownload width={17} height={17} /> Télécharger
            </a>
          </div>
          <p className="mt-6.5 text-xs font-semibold text-muted">
            Sans carte bancaire · Windows, Mac &amp; Web · Setup en &lt; 5 min
          </p>
        </div>

        <div className="mt-23 grid grid-cols-2 gap-10 border-t border-white/[0.08] pt-12 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 flex flex-col gap-4">
            <Logo size={30} />
            <p className="m-0 max-w-[320px] text-[13.5px] leading-[1.7] text-text2">
              La plateforme de mass posting Instagram &amp; TikTok pour créateurs, agences et growth hackers.
              Pilote des centaines de comptes via GeeLark, depuis un seul dashboard.
            </p>
          </div>

          {COLUMNS.map(col => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3">
              <h3 className="m-0 mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-text">{col.title}</h3>
              {col.links.map(link => (
                <a
                  key={link.label} href={link.href}
                  {...('external' in link && link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className="text-[13.5px] font-semibold text-text2 transition-colors duration-200 hover:text-text"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-white/[0.08] pt-6 text-xs font-semibold text-muted sm:flex-row">
          <p className="m-0">© {new Date().getFullYear()} ScaleFlow. Tous droits réservés.</p>
          <p className="m-0 inline-flex items-center gap-1.5">
            Conçu en France <span aria-label="drapeau français">🇫🇷</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
