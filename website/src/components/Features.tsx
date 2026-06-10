import type { ComponentType, SVGProps } from 'react'
import {
  IconLayers,
  IconCalendar,
  IconSparkles,
  IconFlame,
  IconScissors,
  IconSmartphone,
  IconUsers,
  IconCoins,
} from './Icons'

type Feature = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  text: string
  accent: string
  /** Tailwind column-span classes for the bento grid (lg breakpoint). */
  span: string
}

const FEATURES: Feature[] = [
  {
    icon: IconLayers,
    title: 'Mass Posting',
    text: "Publie sur des dizaines de comptes en parallèle. Choisis un dossier de vidéos, lance, et chaque appareil se libère dès sa publication terminée.",
    accent: '#A855F7',
    span: 'lg:col-span-2',
  },
  {
    icon: IconCalendar,
    title: 'Programmation',
    text: "Planifie tes posts à l'avance sur un calendrier visuel. Files d'attente par compte, fuseaux horaires et créneaux récurrents.",
    accent: '#22D3EE',
    span: 'lg:col-span-1',
  },
  {
    icon: IconSparkles,
    title: 'Captions IA',
    text: "Génère captions, hashtags et idées de contenu en un clic. Propulsé par Claude & Groq via ton solde de crédits.",
    accent: '#818CF8',
    span: 'lg:col-span-1',
  },
  {
    icon: IconScissors,
    title: 'Remix & Repurpose vidéo',
    text: "Mixe, recoupe et réinvente tes vidéos pour multiplier les variantes uniques. Sous-titres, watermarks et préréglages réutilisables pour produire en masse.",
    accent: '#F472B6',
    span: 'lg:col-span-2',
  },
  {
    icon: IconFlame,
    title: 'Auto-Warmup',
    text: "Chauffe automatiquement tes nouveaux comptes : likes, follows et vues à rythme humain. Routines configurables par groupe.",
    accent: '#FB923C',
    span: 'lg:col-span-1',
  },
  {
    icon: IconSmartphone,
    title: 'Multi-comptes & Appareils',
    text: "Pilote tes cloud phones GeeLark depuis un seul tableau de bord. Statut en temps réel, IP et sessions isolées par appareil.",
    accent: '#34D399',
    span: 'lg:col-span-1',
  },
  {
    icon: IconUsers,
    title: 'Collaboration d\'équipe',
    text: "Invite ton organisation, attribue des rôles (admin, membre, viewer) et restreins les accès par dossier ou groupe d'appareils.",
    accent: '#60A5FA',
    span: 'lg:col-span-1',
  },
  {
    icon: IconCoins,
    title: 'Système de crédits',
    text: "Un solde unique pour l'IA et les actions automatisées. Recharge à la demande, transparent et partagé par organisation.",
    accent: '#FBBF24',
    span: 'lg:col-span-1',
  },
]

function FeatureCard({ feature }: { feature: Feature }) {
  const { icon: Icon, title, text, accent, span } = feature
  return (
    <article
      className={`group glass flex flex-col rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 hover:border-white/15 hover:bg-white/[0.06] ${span}`}
    >
      <span
        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: `${accent}1A`, border: `1px solid ${accent}33`, color: accent }}
      >
        <Icon width={22} height={22} />
      </span>
      <h3 className="text-base font-bold text-text">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text2">{text}</p>
    </article>
  )
}

export function Features() {
  return (
    <section id="features" className="relative px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-label">Tout pour scaler</p>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-5xl">
            Une seule app, <span className="gradient-text">tout dedans.</span>
          </h2>
          <p className="mt-4 text-text2">
            Fini de jongler entre dix outils. ScaleFlow réunit publication, automatisation et
            production de contenu pour faire grandir ton empire Instagram.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </div>
    </section>
  )
}
