import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconTelegram } from './Icons'

const QA = [
  {
    q: "C'est quoi ScaleFlow exactement ?",
    a: "Une app pour gérer en masse tes comptes Instagram : poster automatiquement sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives.",
  },
  {
    q: 'Ça marche aussi pour TikTok ?',
    a: "Oui. Le mass posting, la programmation des posts et le warmup gèrent Instagram ET TikTok depuis le même dashboard. Tu pilotes tes deux réseaux côte à côte, sans changer d'outil ni dupliquer ton flux de travail.",
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
    q: "C'est risqué pour mes comptes Instagram ?",
    a: "ScaleFlow utilise GeeLark qui simule de vrais devices avec leurs propres IPs/sessions. Tant que tu respectes les rythmes humains (notre auto-warmup le fait pour toi), le risque est très faible. Aucune méthode n'est 100% sans risque.",
  },
  {
    q: 'Je peux annuler quand je veux ?',
    a: "Oui, depuis tes paramètres ou directement via Stripe. Tu gardes l'accès jusqu'à la fin de la période payée.",
  },
  {
    q: 'Version web ou téléchargement ?',
    a: "Les deux. Le téléchargement Electron (.dmg pour Mac, .exe pour Windows) est plus rapide et permet l'accès aux fichiers locaux. La version web est utile pour dépanner ou bosser depuis un autre poste.",
  },
  {
    q: 'Comment je contacte le support ?',
    a: "Via Telegram en priorité (@justquentin), ou via le système de tickets directement dans l'app.",
  },
]

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    el.querySelectorAll('.reveal').forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [])
  return ref
}

function FaqItem({
  item,
  isOpen,
  onToggle,
  index,
}: {
  item: { q: string; a: string }
  isOpen: boolean
  onToggle: () => void
  index: number
}) {
  const panelId = `faq-panel-${index}`
  const btnId = `faq-button-${index}`
  return (
    <div
      className="glass-card overflow-hidden rounded-2xl"
      style={{
        borderLeft: isOpen ? '2.5px solid transparent' : undefined,
        borderImage: isOpen ? 'linear-gradient(180deg, #5EEAD4, #818CF8, #C084FC) 1' : undefined,
        background: isOpen ? 'linear-gradient(160deg, rgba(129,140,248,0.10) 0%, rgba(255,255,255,0.02) 100%)' : undefined,
      }}
    >
      <h3>
        <button
          id={btnId}
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition-colors duration-200 hover:bg-white/[0.03]"
        >
          <span className={`text-[15px] font-semibold transition-colors duration-300 ${isOpen ? 'gradient-text' : 'text-text'}`}>
            {item.q}
          </span>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out"
            style={{
              background: isOpen ? 'rgba(129,140,248,0.18)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isOpen ? 'rgba(129,140,248,0.45)' : 'rgba(255,255,255,0.1)'}`,
              transform: isOpen ? 'rotate(135deg)' : 'rotate(0deg)',
              boxShadow: isOpen ? '0 0 16px -4px rgba(129,140,248,0.6)' : 'none',
            }}
          >
            <IconPlus width={15} height={15} className={isOpen ? 'text-indigo' : 'text-text2'} />
          </span>
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
          <p className="px-5 pb-5 text-sm leading-relaxed text-text2">{item.a}</p>
        </div>
      </div>
    </div>
  )
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  const ref = useReveal()

  return (
    <section id="faq" className="relative px-5 py-28" ref={ref}>
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute right-1/4 top-1/4 h-[440px] w-[440px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #A855F7, transparent)', filter: 'blur(90px)' }}
        />
        <div className="absolute inset-0 bg-grid opacity-[0.018]" />
      </div>

      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center reveal">
          <span className="section-label">FAQ</span>
          <h2 className="font-display h-section">
            On répond à <span className="gradient-text">tout.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-text2">
            Les questions qu'on nous pose le plus souvent avant de passer au mass posting.
          </p>
        </div>

        <div className="space-y-3">
          {QA.map((item, i) => (
            <div key={item.q} className="reveal" style={{ transitionDelay: `${Math.min(i, 5) * 0.06}s` }}>
              <FaqItem item={item} index={i} isOpen={open === i} onToggle={() => setOpen(open === i ? null : i)} />
            </div>
          ))}
        </div>

        {/* CTA card */}
        <div className="reveal relative mt-14 overflow-hidden rounded-3xl gradient-ring p-8 text-center sm:p-10">
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full opacity-25"
            style={{ background: 'radial-gradient(ellipse, #818CF8, transparent)', filter: 'blur(44px)' }}
            aria-hidden="true"
          />
          <h3 className="font-display text-2xl font-bold text-text">
            Encore une <span className="gradient-text">question ?</span>
          </h3>
          <p className="mx-auto mb-7 mt-2 max-w-sm text-sm text-text2">
            Écris-nous directement sur Telegram. Réponse en moins d'une heure, en moyenne.
          </p>
          <a
            href="https://t.me/justquentin"
            target="_blank"
            rel="noreferrer"
            className="btn-primary !px-7 !py-3.5"
          >
            <IconTelegram />
            Contacter sur Telegram
          </a>
        </div>
      </div>
    </section>
  )
}
