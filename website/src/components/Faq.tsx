import { useState } from 'react'
import { useReveal } from '../hooks/useReveal'
import { IconPlus, IconTelegram } from './Icons'
import { TELEGRAM_URL } from '../lib/links'

const QA = [
  { q: "C'est quoi ScaleFlow exactement ?", a: "Une app pour gérer en masse tes comptes Instagram : poster automatiquement sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives." },
  { q: 'Ça marche aussi pour TikTok ?', a: "Oui. Le mass posting, la programmation des posts et le warmup gèrent Instagram ET TikTok depuis le même dashboard. Tu pilotes tes deux réseaux côte à côte, sans changer d'outil ni dupliquer ton flux de travail." },
  { q: "J'ai besoin de quoi pour l'utiliser ?", a: "Un abonnement GeeLark (cloud phones) avec ton bearer token. ScaleFlow se connecte à ton compte GeeLark pour piloter tes téléphones virtuels. Niveau machine, n'importe quel Mac/PC moderne suffit." },
  { q: 'Différence entre Standard et Pro ?', a: "Le Standard donne 2 500 crédits/mois (utilisés pour l'IA) et tous les outils de base. Le Pro donne 5 500 crédits/mois + organisations multi-membres + auto-warmup + auto-commentaires + support 24/7." },
  { q: 'Téléphones illimités vraiment ?', a: "Les téléphones illimités arrivent dès le plan Organisation. La seule limite c'est ce que GeeLark accepte sur ton compte côté eux." },
  { q: "C'est risqué pour mes comptes Instagram ?", a: "ScaleFlow utilise GeeLark qui simule de vrais devices avec leurs propres IPs/sessions. Tant que tu respectes les rythmes humains (notre auto-warmup le fait pour toi), le risque est très faible. Aucune méthode n'est 100% sans risque." },
  { q: 'Je peux annuler quand je veux ?', a: "Oui, depuis tes paramètres ou directement via Stripe. Tu gardes l'accès jusqu'à la fin de la période payée." },
  { q: 'Version web ou téléchargement ?', a: "Les deux. Le téléchargement Electron (.dmg pour Mac, .exe pour Windows) est plus rapide et permet l'accès aux fichiers locaux. La version web est utile pour dépanner ou bosser depuis un autre poste." },
  { q: 'Comment je contacte le support ?', a: "Via Telegram en priorité (@justquentin), ou via le système de tickets directement dans l'app." },
]

function FaqItem({ item, isOpen, onToggle, index }: {
  item: { q: string; a: string }; isOpen: boolean; onToggle: () => void; index: number
}) {
  const panelId = `faq-panel-${index}`
  const btnId = `faq-button-${index}`
  return (
    <div
      className="overflow-hidden rounded-2xl transition-all duration-300"
      style={{
        background: isOpen
          ? 'linear-gradient(160deg, rgba(129,140,248,0.10), rgba(255,255,255,0.02))'
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isOpen ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.09)'}`,
      }}
    >
      <h3 className="m-0">
        <button
          id={btnId} type="button" onClick={onToggle}
          aria-expanded={isOpen} aria-controls={panelId}
          className="flex w-full cursor-pointer items-center justify-between gap-4 px-5.5 py-4.5 text-left text-[15px] font-extrabold text-text"
        >
          {item.q}
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.04] transition-transform duration-300"
            style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)', color: isOpen ? '#818CF8' : 'rgba(196,181,253,0.6)' }}
          >
            <IconPlus width={15} height={15} strokeWidth={2.4} />
          </span>
        </button>
      </h3>
      <div
        id={panelId} role="region" aria-labelledby={btnId}
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="m-0 px-5.5 pb-4.5 text-sm leading-[1.7] text-text2">{item.a}</p>
        </div>
      </div>
    </div>
  )
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  const ref = useReveal<HTMLElement>()

  return (
    <section id="faq" className="relative z-[1] mx-auto max-w-[780px] px-6 pt-5 pb-[110px]" ref={ref}>
      <div className="reveal text-center">
        <span className="section-label">FAQ</span>
        <h2 className="font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-[46px]">
          On répond à <span className="gradient-text-warm">tout.</span>
        </h2>
        <p className="mx-auto mt-4.5 max-w-[440px] text-base leading-relaxed text-text2">
          Les questions qu'on nous pose le plus souvent avant de passer au mass posting.
        </p>
      </div>

      <div className="mt-12 flex flex-col gap-2.5">
        {QA.map((item, i) => (
          <div key={item.q} className="reveal" style={{ transitionDelay: `${Math.min(i, 5) * 0.06}s` }}>
            <FaqItem item={item} index={i} isOpen={open === i} onToggle={() => setOpen(open === i ? null : i)} />
          </div>
        ))}
      </div>

      <div
        className="reveal mt-13 rounded-[22px] p-0.5"
        style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.5), rgba(129,140,248,0.5), rgba(168,85,247,0.5))' }}
      >
        <div className="rounded-[20px] px-8 py-11 text-center" style={{ background: '#0A0A1C' }}>
          <h3 className="m-0 font-display text-[26px] font-bold text-text">
            Encore une <span className="gradient-text">question ?</span>
          </h3>
          <p className="mx-auto mb-6.5 mt-3 max-w-[360px] text-sm leading-relaxed text-text2">
            Écris-nous directement sur Telegram. Réponse en moins d'une heure, en moyenne.
          </p>
          <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="btn-primary !px-7 !py-3.5">
            <IconTelegram width={16} height={16} /> Contacter sur Telegram
          </a>
        </div>
      </div>
    </section>
  )
}
