import { Logo } from './Logo'

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: 'rgba(3,3,7,0.6)', borderBottom: '1px solid rgba(139,92,246,0.10)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center">
          <Logo />
        </a>
        <div className="hidden md:flex items-center gap-8 text-sm text-text2">
          <a href="#features"  className="hover:text-text transition-colors">Fonctionnalités</a>
          <a href="#showcase"  className="hover:text-text transition-colors">Aperçu</a>
          <a href="#pricing"   className="hover:text-text transition-colors">Tarifs</a>
          <a href="#faq"       className="hover:text-text transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-2">
          <a href="https://app.scaleflow.io" className="hidden sm:inline-flex btn-secondary !py-2 !px-4 !text-xs">Ouvrir l'app →</a>
          <a href="#pricing" className="btn-primary !py-2 !px-4 !text-xs">Commencer</a>
        </div>
      </div>
    </nav>
  )
}
