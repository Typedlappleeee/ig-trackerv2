import { useState } from 'react'

const QA = [
  {
    q: "C'est quoi ScaleFlow exactement ?",
    a: "Une app pour gérer en masse tes comptes Instagram : poster automatiquement sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives.",
  },
  {
    q: "J'ai besoin de quoi pour l'utiliser ?",
    a: "Un abonnement GéeLark (cloud phones) avec ton bearer token. ScaleFlow se connecte à ton compte GéeLark pour piloter tes téléphones virtuels. Niveau machine, n'importe quel Mac/PC moderne suffit.",
  },
  {
    q: "Différence entre Standard et Pro ?",
    a: "Le Standard donne 2 000 crédits/mois (utilisés pour l'IA), tous les outils de base. Le Pro donne 5 500 crédits/mois + organisations multi-membres + auto-warmup + auto-commentaires + support 24/7.",
  },
  {
    q: "Téléphones illimités vraiment ?",
    a: "Oui, dès le plan Standard. La seule limite c'est ce que GéeLark accepte sur ton compte côté eux.",
  },
  {
    q: "C'est risqué pour mes comptes Instagram ?",
    a: "ScaleFlow utilise GéeLark qui simule des vrais devices avec leurs propres IPs/sessions. Tant que tu respectes les rythmes humains (notre auto-warmup le fait pour toi), le risque est très faible. Aucune méthode n'est 100% sans risque.",
  },
  {
    q: "Je peux annuler quand je veux ?",
    a: "Oui, depuis tes paramètres ou directement via Stripe. Tu gardes l'accès jusqu'à la fin de la période payée.",
  },
  {
    q: "Version web ou téléchargement ?",
    a: "Les deux. Le téléchargement Electron (.dmg pour Mac, .exe pour Windows) est plus rapide et permet l'accès aux fichiers locaux. La version web est utile pour dépanner ou bosser depuis un autre poste.",
  },
  {
    q: "Comment je contacte le support ?",
    a: "Via Telegram en priorité (@justquentin), ou via le système de tickets directement dans l'app.",
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[11px] text-accent uppercase tracking-widest mb-3 font-semibold">FAQ</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            On répond à <span className="gradient-text">tout.</span>
          </h2>
        </div>

        <div className="space-y-3">
          {QA.map((item, i) => (
            <div key={i} className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="text-sm font-semibold text-white">{item.q}</span>
                <span className="text-text2 text-lg font-light flex-shrink-0 ml-3 transition-transform" style={{ transform: open === i ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
              </button>
              {open === i && (
                <div className="px-5 pb-4 text-sm text-text2 leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 text-center glass rounded-2xl p-8">
          <h3 className="text-xl font-bold text-white mb-2">Une autre question ?</h3>
          <p className="text-text2 text-sm mb-5">Réponse en moins d'1h sur Telegram, en moyenne.</p>
          <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
             className="btn-primary">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
            </svg>
            Contacter sur Telegram
          </a>
        </div>
      </div>
    </section>
  )
}
