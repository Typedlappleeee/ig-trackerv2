import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-12 px-6 mt-12">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2">
            <Logo />
            <p className="text-text2 text-sm mt-4 max-w-xs leading-relaxed">
              L'app tout-en-un pour scaler ton Instagram à des dizaines, des centaines de comptes.
            </p>
            <div className="flex gap-3 mt-4">
              <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
                 className="w-9 h-9 rounded-lg flex items-center justify-center glass hover:bg-white/10 transition-colors">
                <span className="text-sm">✈</span>
              </a>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-3">Produit</div>
            <ul className="space-y-2 text-sm text-text2">
              <li><a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a></li>
              <li><a href="#pricing"  className="hover:text-white transition-colors">Tarifs</a></li>
              <li><a href="#faq"      className="hover:text-white transition-colors">FAQ</a></li>
              <li><a href="https://scaleflow-fvtu.vercel.app/" className="hover:text-white transition-colors">Ouvrir l'app</a></li>
            </ul>
          </div>

          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-3">Légal</div>
            <ul className="space-y-2 text-sm text-text2">
              <li><a href="#" className="hover:text-white transition-colors">CGU</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Confidentialité</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Mentions légales</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border/30 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>© {new Date().getFullYear()} ScaleFlow — Tous droits réservés</span>
          <span>Made with ⚡ in France</span>
        </div>
      </div>
    </footer>
  )
}
