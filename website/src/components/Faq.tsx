import { useState } from 'react'
import { IconPlus, IconTelegram } from './Icons'

const QA = [
  {
    q: "C'est quoi ScaleFlow exactement ?",
    a: "Une app pour gérer en masse tes comptes Instagram : poster automatiquement sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives.",
  },
  {
    q: "J'ai besoin de quoi pour l'utiliser ?",
    a: "Un abonnement GeeLark (cloud phones) avec ton bearer token. ScaleFlow se connecte à ton compte GeeLark pour piloter tes téléphones virtuels. Niveau machine, n'importe quel Mac/PC moderne suffit.",
  },
  {
    q: 'Différence entre Standard et Pro ?',
    a: "Le Standard donne 2 500 crédits/mois (utilisés pour l'IA) et tous les outils de base. Le Pro donne 5 500 crédits/mois + organisations multi-membres + auto-warmup + auto-commentaires + support 24/7.",
  },
  {
    q: 'Téléphones illimités vraiment ?',
    a: "Les téléphones illimités arrivent dès le plan Organisation. La seule limite c'est ce que GeeLark accepte sur ton compte côté eux.",
  },
  {
    q: 'C\'est risqué pour mes comptes Instagram ?',
    a: "ScaleFlow utilise GeeLark qui simule de vrais devices avec leurs propres IPs/sessions. Tant que tu respectes les rythmes humains (notre auto-warmup le fait pour toi), le risque est très faible. Aucune méthode n'est 100% sans risque.",
  },
  {
    q: 'Je peux annuler quand je veux ?',
    a: 'Oui, depuis tes paramètres ou directement via Stripe. Tu gardes l\'accès jusqu\'à la fin de la période payée.',
  },
  {
    q: 'Version web ou téléchargement ?',
    a: "Les deux. Le téléchargement Electron (.dmg pour Mac, .exe pour Windows) est plus rapide et permet l'accès aux fichiers locaux. La version web est utile pour dépanner ou bosser depuis un autre poste.",
  },
  {
    q: 'Comment je contacte le support ?',
    a: 'Via Telegram en priorité (@justquentin), ou via le système de tickets directement dans l\'app.',
  },
]

function FaqItem({ item, isOpen, onToggle, index }: {
  item: { q: string; a: string }
  isOpen: boolean
  onToggle: () => void
  index: number
}) {
  const panelId = `faq-panel-${index}`
  const btnId = `faq-button-${index}`
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <h3>
        <button
          id={btnId}
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition-colors duration-200 hover:bg-white/[0.03]"
        >
          <span className="text-sm font-semibold text-text">{item.q}</span>
          <IconPlus
            width={18}
            height={18}
            className="shrink-0 text-text2 transition-transform duration-300"
            style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-sm leading-relaxed text-text2">{item.a}</p>
        </div>
      </div>
    </div>
  )
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="relative px-5 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <p className="section-label">FAQ</p>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-5xl">
            On répond à <span className="gradient-text">tout.</span>
          </h2>
        </div>

        <div className="space-y-3">
          {QA.map((item, i) => (
            <FaqItem
              key={item.q}
              item={item}
              index={i}
              isOpen={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
            />
          ))}
        </div>

        <div className="glass-strong mt-12 rounded-3xl p-8 text-center">
          <h3 className="text-xl font-bold text-text">Une autre question ?</h3>
          <p className="mb-6 mt-2 text-sm text-text2">
            Réponse en moins d'1h sur Telegram, en moyenne.
          </p>
          <a
            href="https://t.me/justquentin"
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            <IconTelegram />
            Contacter sur Telegram
          </a>
        </div>
      </div>
    </section>
  )
}
