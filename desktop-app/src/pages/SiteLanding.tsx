import { useEffect, useRef, useState } from 'react'
import type { ReactNode, CSSProperties, MouseEvent as ReactMouseEvent } from 'react'

/**
 * SiteLanding — page publique de scaleflow.company (affichée avant connexion).
 *
 * index.html fige html/body/#root à 100 % de hauteur avec overflow:hidden (shell de l'app) :
 * la landing est donc SON PROPRE conteneur de défilement (.sfl-root, 100dvh, overflow-y:auto),
 * et les ancres (#features, #pricing…) défilent en douceur à l'intérieur de ce conteneur.
 * Styles : un bloc <style> préfixé « sfl- » (responsive + survols) + quelques styles inline.
 */

const APP_URL = './login.dc.html'
const WIN_URL = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'
const TG_URL = 'https://t.me/justquentin'

// ── Icônes (trait 1.8, style Lucide) ─────────────────────────────────────────
type IconName =
  | 'zap' | 'calendar' | 'sparkles' | 'film' | 'flame' | 'phone' | 'users' | 'coins' | 'home' | 'folder'
  | 'clapper' | 'cloud' | 'download' | 'arrow' | 'check' | 'menu' | 'close' | 'plus' | 'clock' | 'shield'
  | 'infinity' | 'lock' | 'play' | 'pause' | 'link' | 'repeat' | 'bot' | 'send' | 'calc' | 'message'
  | 'sliders' | 'upload' | 'star' | 'grid' | 'layers'

const PATHS: Record<IconName, ReactNode> = {
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></>,
  sparkles: <><path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z" /><path d="M19 3v4M17 5h4M18.5 16v3M17 17.5h3" /></>,
  film: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M7.5 3v18M16.5 3v18M3 8h4.5M3 16h4.5M16.5 8H21M16.5 16H21M3 12h18" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  coins: <><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" /></>,
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  clapper: <><path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8z" /><path d="m4 11-.88-2.87a2 2 0 0 1 1.33-2.5l11.48-3.5a2 2 0 0 1 2.5 1.32l.87 2.87L4 11z" /><path d="m6.6 5 3.38 4.2M11.86 3.38l3.38 4.2" /></>,
  cloud: <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  infinity: <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />,
  pause: <path d="M8 5v14M16 5v14" />,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="2.5" /><path d="M12 8V4.5M9 13v2M15 13v2" /></>,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  calc: <><rect x="5" y="2" width="14" height="20" rx="2.5" /><path d="M9 6.5h6M9 11h.01M12 11h.01M15 11h.01M9 14.5h.01M12 14.5h.01M15 14.5h.01M9 18h6" /></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  upload: <path d="M12 21V9M7 14l5-5 5 5M5 3h14" />,
  star: <path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor" stroke="none" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  layers: <><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>,
}

function Ico({ n, s = 16, className, style }: { n: IconName; s?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[n]}
    </svg>
  )
}

/** Délai de révélation (stagger) passé en variable CSS. */
const dl = (ms: number) => ({ '--d': ms + 'ms' } as CSSProperties)

// ── Contenu ──────────────────────────────────────────────────────────────────
const TOTAL = 52
const order: number[] = []
for (let i = 0; i < TOTAL; i++) order.push((i * 17 + 6) % TOTAL)
const rankOf: number[] = []
order.forEach((seat, rank) => { rankOf[seat] = rank })
const RINGS = [{ n: 10, r: 62 }, { n: 16, r: 96 }, { n: 26, r: 130 }]
const seats: { x: number; y: number }[] = []
RINGS.forEach((ring, ri) => {
  for (let k = 0; k < ring.n; k++) {
    const a = (-90 + (k / ring.n) * 360 + ri * 9) * Math.PI / 180
    seats.push({ x: +(160 + Math.cos(a) * ring.r).toFixed(1), y: +(160 + Math.sin(a) * ring.r).toFixed(1) })
  }
})
const NAMES = ['brand.paris', 'studio.creatif', 'ugc.factory', 'growth.lab', 'viral.fr', 'daily.motiv', 'clip.master', 'fit.life']

const NAV: [string, string][] = [['#showcase', "L'app"], ['#features', 'Fonctionnalités'], ['#cloud', 'Cloud Phones'], ['#pricing', 'Tarifs'], ['#faq', 'FAQ']]

const MARQUEE: { ic: IconName; label: string }[] = [
  { ic: 'zap', label: 'Mass Posting' }, { ic: 'layers', label: 'Instagram + TikTok' }, { ic: 'calendar', label: 'Programmation' },
  { ic: 'flame', label: 'Auto-Warmup' }, { ic: 'film', label: 'Remix vidéo' }, { ic: 'sparkles', label: 'Captions IA' },
  { ic: 'cloud', label: 'Cloud Phones' }, { ic: 'link', label: 'Stories automatiques' }, { ic: 'grid', label: 'Multi-comptes' },
  { ic: 'users', label: "Collaboration d'équipe" },
]

type Feat = { ic: IconName; title: string; text: string; size: 'f1' | 'f2' | 'f2x' | 'f3'; viz?: 'mass' | 'remix' | 'credits' }
const FEATURES: Feat[] = [
  { ic: 'zap', title: 'Mass Posting', size: 'f2', viz: 'mass', text: 'Publie simultanément sur des dizaines de comptes Instagram ET TikTok. Chaque phone se libère dès que sa publication est terminée.' },
  { ic: 'calendar', title: 'Programmation', size: 'f1', text: "Calendrier visuel, files d'attente par compte, fuseaux horaires et créneaux récurrents." },
  { ic: 'sparkles', title: 'Captions IA', size: 'f1', text: 'Génère captions, hashtags et idées de contenu. Propulsé par Claude & Groq.' },
  { ic: 'film', title: 'Remix & Repurpose vidéo', size: 'f2x', viz: 'remix', text: 'Mixe, recoupe et réinvente tes vidéos. Sous-titres, watermarks et préréglages pour produire en masse.' },
  { ic: 'flame', title: 'Auto-Warmup', size: 'f1', text: 'Chauffe tes nouveaux comptes automatiquement : likes, follows à rythme humain. Routines configurables.' },
  { ic: 'phone', title: 'Cloud Phones', size: 'f1', text: 'Pilote tes cloud phones depuis un seul dashboard. Statut en temps réel, IP et sessions isolées.' },
  { ic: 'users', title: "Collaboration d'équipe", size: 'f1', text: 'Invite ton organisation, attribue des rôles (admin, membre, viewer) et restreins les accès.' },
  { ic: 'coins', title: 'Crédits à la demande', size: 'f3', viz: 'credits', text: "Un solde unique pour l'IA et les automatisations. Recharge à la demande, partagé par organisation." },
]

const STEPS: { n: string; ic: IconName; title: string; text: string }[] = [
  { n: '01', ic: 'link', title: 'Connecte ton GeeLark', text: 'Colle ton bearer token, ScaleFlow détecte tous tes cloud phones et leurs comptes en quelques secondes.' },
  { n: '02', ic: 'upload', title: 'Charge tes vidéos', text: "Importe ta banque de contenu, remixe-la si besoin, et laisse l'IA générer captions et hashtags." },
  { n: '03', ic: 'zap', title: 'Lance la diffusion', text: 'Un clic, et tes posts partent en parallèle sur tous tes comptes. Suis tout en temps réel.' },
]

const REVIEWS = [
  { name: 'Francis', date: '19 juin', src: '/avis/avis-francis.png', alt: 'Avis de Francis sur Telegram : très bon CRM, staff réduit de 90 %, très bon service, je recommande.' },
  { name: 'France Killian', date: '19 juin', src: '/avis/avis-france-killian.png', alt: 'Avis de France Killian sur Telegram : comptes augmentés de 300 % en réduisant le staff, je recommande à fond.' },
  { name: 'Leon', date: '20 juin', src: '/avis/avis-leon.png', alt: 'Avis de Leon sur Telegram : logiciel performant et intuitif, accompagnement irréprochable.' },
  { name: 'Alx', date: '4 juillet', src: '/avis/avis-alx.png', alt: "Avis d'Alx sur Telegram : tout est regroupé en une seule app, le meilleur outil GeeLark." },
  { name: 'Njmoss', date: '6 juillet', src: '/avis/avis-njmoss.png', alt: 'Avis de Njmoss sur Telegram : logiciel propre, beaucoup de choses automatisées, gain de temps.' },
]

const PLANS = [
  { name: 'Standard', price: '49,99$', desc: 'Pour démarrer sérieusement ta première ferme de comptes.', cta: 'Choisir Standard', pro: false, items: ['2 500 crédits / mois', '50 phones max', 'Toutes les fonctionnalités', 'Mass Posting 10 comptes max', 'Support 24/7'] },
  { name: 'Pro', price: '99,99$', desc: 'Le sweet spot des agences et growth hackers qui scalent.', cta: 'Choisir Pro', pro: true, items: ['5 500 crédits / mois', '200 phones max', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7'] },
  { name: 'Organisation', price: '149,99$', desc: 'Pour les structures qui pilotent des centaines de comptes.', cta: 'Choisir Organisation', pro: false, items: ['11 000 crédits / mois', 'Phones illimités', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7 prioritaire', "Proposition d'ajouts avec les devs"] },
]

const CREDITS: { ic: IconName; label: string; unit: string; cost: string; free?: boolean }[] = [
  { ic: 'film', label: 'Publication', unit: 'par téléphone', cost: '2 cr' },
  { ic: 'zap', label: 'Mass Posting', unit: 'par téléphone', cost: '2 cr' },
  { ic: 'link', label: 'Story', unit: 'par téléphone', cost: '1 cr' },
  { ic: 'sliders', label: 'Remix & Spoof', unit: 'par vidéo', cost: 'Gratuit', free: true },
  { ic: 'bot', label: 'Tâche automatique', unit: 'par jour, tâche active', cost: '50 cr' },
  { ic: 'repeat', label: 'Exécution de tâche', unit: 'par téléphone', cost: '2 cr' },
]

const PACKS = [
  { credits: '500', price: '19,99$' }, { credits: '1 200', price: '39,99$' }, { credits: '2 500', price: '74,99$' },
  { credits: '6 000', price: '164,99$' }, { credits: '15 000', price: '374,99$' },
]

const QA = [
  { q: "C'est quoi ScaleFlow exactement ?", a: 'Une app pour gérer en masse tes comptes Instagram : poster automatiquement sur des dizaines de téléphones en parallèle, organiser ta banque de vidéos, voir les stats en temps réel, et automatiser les tâches répétitives.' },
  { q: 'Ça marche aussi pour TikTok ?', a: 'Oui. Le mass posting, la programmation des posts et le warmup gèrent Instagram ET TikTok depuis le même dashboard.' },
  { q: 'Et les Cloud Phones ScaleFlow ?', a: "Ils arrivent au Q4 2026. Tu pourras héberger tes propres appareils Android sur ton serveur, sans passer par GeeLark ni subir de quota. Inscris-toi sur la liste d'attente pour un accès prioritaire." },
  { q: "J'ai besoin de quoi pour l'utiliser ?", a: "Un abonnement GeeLark (cloud phones) avec ton bearer token. Niveau machine, n'importe quel Mac/PC moderne suffit." },
  { q: 'Différence entre Standard et Pro ?', a: 'Le Standard donne 2 500 crédits/mois et tous les outils de base. Le Pro donne 5 500 crédits/mois + organisations multi-membres + auto-warmup + support 24/7.' },
  { q: "C'est risqué pour mes comptes Instagram ?", a: "ScaleFlow utilise des devices avec leurs propres IPs/sessions. Tant que tu respectes les rythmes humains (notre auto-warmup le fait pour toi), le risque est très faible. Aucune méthode n'est 100% sans risque." },
  { q: 'Je peux annuler quand je veux ?', a: "Oui, depuis tes paramètres ou directement via Stripe. Tu gardes l'accès jusqu'à la fin de la période payée." },
  { q: 'Version web ou téléchargement ?', a: "Les deux. Le téléchargement est plus rapide et permet l'accès aux fichiers locaux. La version web est utile pour dépanner depuis un autre poste." },
  { q: 'Comment je contacte le support ?', a: 'Via Telegram en priorité (@justquentin), ou via le système de tickets directement dans l\'app.' },
]

const SHOTS: { id: 'mass' | 'hub' | 'bank' | 'studio'; ic: IconName; label: string }[] = [
  { id: 'mass', ic: 'zap', label: 'Mass Posting' },
  { id: 'hub', ic: 'home', label: 'Tableau de bord' },
  { id: 'bank', ic: 'folder', label: 'Banque de contenu' },
  { id: 'studio', ic: 'clapper', label: 'Studio vidéo' },
]
type ShotId = typeof SHOTS[number]['id']

const APP_NAV: { id: string; ic: IconName; label: string }[] = [
  { id: 'hub', ic: 'home', label: 'Accueil' },
  { id: 'phones', ic: 'phone', label: 'Téléphones' },
  { id: 'bank', ic: 'folder', label: 'Banque' },
  { id: 'mass', ic: 'zap', label: 'Publication' },
  { id: 'sched', ic: 'calendar', label: 'Automatisation' },
  { id: 'studio', ic: 'clapper', label: 'Studio vidéo' },
  { id: 'cloud', ic: 'cloud', label: 'Cloud Phones' },
]

const FOOT_COLS: { h: string; links: [string, string][] }[] = [
  { h: 'Produit', links: [['#showcase', "L'app"], ['#cloud', 'Cloud Phones'], ['#features', 'Fonctionnalités'], ['#pricing', 'Tarifs']] },
  { h: 'Ressources', links: [['#faq', 'Questions fréquentes'], ['#how', 'Comment ça marche'], [APP_URL, "Ouvrir l'app"]] },
  { h: 'Légal', links: [[APP_URL, "Conditions d'utilisation"], [APP_URL, 'Confidentialité'], [TG_URL, 'Contact']] },
]

// ── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
.sfl-root{--bg:#0A0A0B;--s1:#111113;--s2:#161618;--b:rgba(255,255,255,0.07);--b2:rgba(255,255,255,0.1);--b3:rgba(255,255,255,0.14);--t1:#EDEDEF;--t2:#A1A1AA;--t3:#8B8B94;--t4:#71717A;--ac:#8B7CF6;--ac2:#B3A8FA;--ok:#4ADE80;--amb:#FBBF24;--e:cubic-bezier(0.16,1,0.3,1);
  position:relative;height:100vh;height:100dvh;overflow-x:hidden;overflow-y:auto;scroll-behavior:smooth;overscroll-behavior-y:none;-webkit-overflow-scrolling:touch;
  background:var(--bg);color:var(--t1);font-size:15px;line-height:1.5;letter-spacing:-0.006em}
.sfl-root *,.sfl-root *::before,.sfl-root *::after{box-sizing:border-box}
.sfl-root a{color:inherit;text-decoration:none}
.sfl-root img{max-width:100%;display:block}
.sfl-root button{font-family:inherit}
.sfl-wrap{width:100%;max-width:1160px;margin:0 auto;padding:0 24px}
.sfl-sec{position:relative;padding:120px 0;scroll-margin-top:60px}
.sfl-bt{border-top:1px solid var(--b)}
.sfl-mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-feature-settings:normal;letter-spacing:0}
.sfl-num{font-variant-numeric:tabular-nums}

/* Header */
.sfl-hdr{position:sticky;top:0;z-index:50;height:60px;background:rgba(10,10,11,0.55);-webkit-backdrop-filter:saturate(1.5) blur(14px);backdrop-filter:saturate(1.5) blur(14px);border-bottom:1px solid transparent;transition:border-color .3s ease,background-color .3s ease}
.sfl-hdr.sfl-scrolled{border-bottom-color:var(--b);background:rgba(10,10,11,0.78)}
.sfl-hdr-in{height:100%;display:flex;align-items:center;gap:20px}
.sfl-brand{display:inline-flex;align-items:center;gap:10px;font-size:15.5px;font-weight:600;letter-spacing:-0.025em;color:var(--t1);flex-shrink:0}
.sfl-nav{display:flex;align-items:center;gap:2px;margin-left:16px}
.sfl-nav a{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 11px;border-radius:7px;font-size:13.5px;color:var(--t2);transition:color .15s ease,background-color .15s ease}
.sfl-nav a:hover{color:var(--t1);background:rgba(255,255,255,0.045)}
.sfl-soon{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;background:rgba(139,124,246,0.12);border:1px solid rgba(139,124,246,0.22);color:var(--ac2);font-size:10.5px;font-weight:500;letter-spacing:0}
.sfl-hdr-cta{margin-left:auto;display:flex;align-items:center;gap:8px}
.sfl-burger{display:none;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;border:1px solid var(--b2);background:rgba(255,255,255,0.03);color:var(--t1);cursor:pointer}
.sfl-menu{display:none}
@media (max-width:899px){
  .sfl-nav,.sfl-hdr-dl{display:none}
  .sfl-burger{display:inline-flex}
  .sfl-menu{display:block;position:absolute;top:60px;left:0;right:0;padding:8px 16px 18px;background:rgba(10,10,11,0.97);border-bottom:1px solid var(--b);opacity:0;visibility:hidden;translate:0 -6px;pointer-events:none;transition:opacity .2s ease,translate .3s var(--e),visibility .2s}
  .sfl-menu.sfl-open{opacity:1;visibility:visible;translate:none;pointer-events:auto}
  .sfl-menu a.sfl-mlink{display:flex;align-items:center;justify-content:space-between;height:48px;border-bottom:1px solid var(--b);font-size:15px;color:var(--t1)}
  .sfl-menu-cta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}
}

/* Boutons */
.sfl-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border-radius:8px;border:1px solid transparent;font-size:14px;font-weight:500;letter-spacing:-0.01em;white-space:nowrap;cursor:pointer;transition:transform .2s var(--e),background-color .2s ease,border-color .2s ease,color .2s ease}
.sfl-root .sfl-btn-p{background:#EDEDEF;color:#0A0A0B}
.sfl-root .sfl-btn-p:hover{background:#FFFFFF}
.sfl-btn-s{background:rgba(255,255,255,0.03);border-color:var(--b2);color:var(--t1)}
.sfl-btn-s:hover{background:rgba(255,255,255,0.07);border-color:var(--b3)}
.sfl-btn-sm{height:32px;padding:0 12px;font-size:13px;border-radius:7px}
.sfl-btn-lg{height:44px;padding:0 20px;font-size:15px}
.sfl-btn-block{width:100%}
.sfl-btn .sfl-arr{transition:transform .2s var(--e)}
@media (hover:hover){.sfl-btn:hover{transform:translateY(-1px)}.sfl-btn:hover .sfl-arr{transform:translateX(2px)}}
.sfl-btn:active{transform:none}

/* Typo */
.sfl-pill{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px 0 10px;border-radius:99px;border:1px solid var(--b2);background:rgba(255,255,255,0.03);font-size:12.5px;color:var(--t2);max-width:100%}
.sfl-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--ac2)}
.sfl-eyebrow::before{content:'';width:14px;height:1px;background:currentColor;opacity:.6}
.sfl-h1{margin:0;font-size:clamp(40px,5.6vw,68px);line-height:1.02;font-weight:600;letter-spacing:-0.045em;padding-bottom:.06em;background:linear-gradient(180deg,#FFFFFF 25%,#A1A1AA 120%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.sfl-h2{margin:14px 0 0;font-size:clamp(30px,4.2vw,46px);line-height:1.08;font-weight:600;letter-spacing:-0.035em;color:var(--t1)}
.sfl-h2 .sfl-dim{color:var(--t4)}
.sfl-lead{margin:18px 0 0;max-width:560px;font-size:clamp(15px,1.5vw,17px);line-height:1.65;color:var(--t2)}
.sfl-head{max-width:640px}
.sfl-head.sfl-c{margin:0 auto;text-align:center}
.sfl-head.sfl-c .sfl-lead{margin-left:auto;margin-right:auto}

/* Cartes */
.sfl-card{position:relative;background:var(--s1);border:1px solid var(--b);border-radius:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.025);transition:transform .3s var(--e),border-color .3s ease,background-color .3s ease}
@media (hover:hover){.sfl-hov:hover{transform:translateY(-2px);border-color:var(--b3)}}
.sfl-ico{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9px;flex-shrink:0;background:rgba(139,124,246,0.09);border:1px solid rgba(139,124,246,0.2);color:var(--ac2)}
.sfl-ico-n{background:rgba(255,255,255,0.04);border-color:var(--b2);color:var(--t2)}

/* Révélation au défilement */
.sfl-rv{opacity:0;translate:0 12px;transition:opacity .5s var(--e) var(--d,0ms),translate .5s var(--e) var(--d,0ms)}
.sfl-rv.sfl-card{transition:opacity .5s var(--e) var(--d,0ms),translate .5s var(--e) var(--d,0ms),transform .3s var(--e),border-color .3s ease,background-color .3s ease}
.sfl-rv.sfl-in{opacity:1;translate:none}

/* Hero */
.sfl-hero{position:relative;padding:72px 0 104px;overflow:hidden}
.sfl-hero-bg{position:absolute;inset:0;pointer-events:none}
.sfl-glow{position:absolute;left:50%;top:-260px;width:1200px;height:760px;margin-left:-600px;background:radial-gradient(closest-side,rgba(139,124,246,0.15),rgba(139,124,246,0.045) 55%,transparent 100%)}
.sfl-gridbg{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.032) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.032) 1px,transparent 1px);background-size:56px 56px;background-position:center top;-webkit-mask-image:radial-gradient(ellipse 70% 65% at 50% 0%,#000 25%,transparent 75%);mask-image:radial-gradient(ellipse 70% 65% at 50% 0%,#000 25%,transparent 75%)}
.sfl-hero-grid{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:center}
.sfl-hero-sub{margin:24px 0 0;max-width:470px;font-size:clamp(15.5px,1.5vw,17.5px);line-height:1.65;color:var(--t2)}
.sfl-hero-cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:32px}
.sfl-trust{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin-top:40px;padding-top:22px;border-top:1px solid var(--b);font-size:13px;color:var(--t4)}
.sfl-trust b{font-weight:500;color:var(--t2)}
.sfl-trust i{font-style:normal;opacity:.5}
.sfl-pulse{width:6px;height:6px;border-radius:99px;background:var(--ok);flex-shrink:0;animation:sflPulse 2s ease-in-out infinite}
@keyframes sflPulse{0%,100%{opacity:1}50%{opacity:.3}}
.sfl-hero-vis{position:relative}
.sfl-chip{display:inline-flex;align-items:center;gap:10px;padding:10px 14px 10px 10px;border-radius:12px;background:rgba(22,22,24,0.92);border:1px solid var(--b2);box-shadow:0 20px 40px -16px rgba(0,0,0,0.75);white-space:nowrap}
.sfl-chip-t{display:flex;flex-direction:column;line-height:1.25}
.sfl-chip-t b{font-size:14px;font-weight:600;color:var(--t1)}
.sfl-chip-t span{font-size:11.5px;color:var(--t3)}
.sfl-hero-chip{position:absolute;left:-28px;bottom:-22px;animation:sflFloat 9s ease-in-out infinite}
@keyframes sflFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@media (max-width:1023px){.sfl-hero-grid{grid-template-columns:minmax(0,1fr);gap:56px}.sfl-hero-chip{display:none}}

/* Fenêtre d'app */
.sfl-win{position:relative;background:var(--s1);border:1px solid var(--b2);border-radius:14px;overflow:hidden;box-shadow:0 1px 0 rgba(255,255,255,0.04) inset,0 50px 100px -40px rgba(0,0,0,0.8),0 0 0 1px rgba(0,0,0,0.5)}
.sfl-chrome{display:flex;align-items:center;gap:12px;height:42px;padding:0 14px;border-bottom:1px solid var(--b);background:rgba(255,255,255,0.015)}
.sfl-dots{display:flex;gap:6px;flex-shrink:0}
.sfl-dots i{display:block;width:10px;height:10px;border-radius:99px;background:rgba(255,255,255,0.1)}
.sfl-wtitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--t3)}
.sfl-live{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:6px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);color:var(--ok);font-size:10.5px;font-weight:500;letter-spacing:.04em;flex-shrink:0}
.sfl-bar{height:4px;border-radius:99px;background:rgba(255,255,255,0.07);overflow:hidden}
.sfl-bar>i{display:block;height:100%;width:100%;border-radius:99px;background:var(--ok);transform-origin:left center;transition:transform .6s var(--e)}
.sfl-run-top{padding:18px 18px 4px}
.sfl-run-count{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
.sfl-run-count b{font-size:34px;font-weight:600;letter-spacing:-0.035em;color:var(--t1)}
.sfl-run-count b span{color:var(--t4)}
.sfl-run-count>span{font-size:12px;color:var(--t3)}
.sfl-radial{display:block;width:100%;max-height:272px;margin:4px auto 0;overflow:visible}
.sfl-radial circle.sfl-seat{transition:r .35s var(--e),fill .3s ease}
.sfl-legend{display:flex;align-items:center;flex-wrap:wrap;gap:6px 14px;padding:8px 18px 16px;font-size:11.5px;color:var(--t3)}
.sfl-legend>span{display:inline-flex;align-items:center;gap:6px}
.sfl-legend i{display:block;width:7px;height:7px;border-radius:99px}
.sfl-legend .sfl-eta{margin-left:auto;color:var(--t2)}
.sfl-log{display:flex;flex-direction:column;gap:6px;min-height:92px;padding:14px 18px 16px;border-top:1px solid var(--b);background:rgba(0,0,0,0.22);font-size:11.5px;line-height:1.5}
.sfl-log>div{display:flex;align-items:center;gap:10px;animation:sflIn .45s var(--e)}
.sfl-log .sfl-ph{min-width:72px;color:var(--t4)}
.sfl-log .sfl-acc{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)}
@keyframes sflIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

/* Marquee */
.sfl-marq{position:relative;overflow:hidden;padding:18px 0;border-top:1px solid var(--b);border-bottom:1px solid var(--b);-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.sfl-marq-track{display:flex;width:max-content;animation:sflMarq 60s linear infinite}
.sfl-marq:hover .sfl-marq-track{animation-play-state:paused}
.sfl-marq-i{display:inline-flex;align-items:center;gap:9px;padding:0 26px;font-size:14px;color:var(--t4);white-space:nowrap;transition:color .2s ease}
.sfl-marq-i:hover{color:var(--t1)}
@keyframes sflMarq{to{transform:translateX(-50%)}}

/* Showcase */
.sfl-tabs{display:inline-flex;gap:4px;margin-top:36px;padding:4px;border-radius:11px;border:1px solid var(--b);background:var(--s1);max-width:100%}
.sfl-tab{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;padding:0 14px;border-radius:8px;border:0;background:transparent;color:var(--t3);font-size:13.5px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color .2s ease,background-color .2s ease,box-shadow .2s ease}
.sfl-tab:hover{color:var(--t1)}
.sfl-tab[aria-selected="true"]{background:rgba(255,255,255,0.07);color:var(--t1);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.06)}
.sfl-showwin{margin-top:16px}
.sfl-app{display:grid;grid-template-columns:208px minmax(0,1fr);min-height:470px}
.sfl-side{display:flex;flex-direction:column;gap:2px;padding:12px 8px;border-right:1px solid var(--b);background:rgba(0,0,0,0.12)}
.sfl-side-i{display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;border-radius:7px;font-size:13px;color:var(--t3)}
.sfl-side-i.sfl-on{background:rgba(255,255,255,0.06);color:var(--t1)}
.sfl-side-cr{margin-top:auto;padding:12px;border-radius:10px;border:1px solid var(--b);background:rgba(255,255,255,0.02)}
.sfl-appbody{display:flex;flex-direction:column;gap:14px;min-width:0;padding:24px;animation:sflIn .45s var(--e)}
.sfl-ab-h{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sfl-ab-t{font-size:18px;font-weight:600;letter-spacing:-0.02em}
.sfl-badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:6px;font-size:11.5px;font-weight:500;border:1px solid var(--b2);color:var(--t2);background:rgba(255,255,255,0.03);white-space:nowrap}
.sfl-badge.sfl-ok{color:var(--ok);border-color:rgba(74,222,128,0.22);background:rgba(74,222,128,0.07)}
.sfl-mc{padding:14px;border-radius:10px;border:1px solid var(--b);background:rgba(255,255,255,0.02);min-width:0}
.sfl-lbl{font-size:11.5px;color:var(--t4)}
.sfl-kv{margin-top:8px;font-size:22px;font-weight:600;letter-spacing:-0.03em}
.sfl-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.sfl-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;flex:1}
.sfl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;font-size:12.5px}
.sfl-row span:first-child{color:var(--t1);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfl-row span:last-child{color:var(--t3);flex-shrink:0}
.sfl-steps-ui{display:flex;gap:6px;flex-wrap:wrap}
.sfl-step-ui{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 10px 0 6px;border-radius:7px;border:1px solid var(--b);font-size:12px;color:var(--t3)}
.sfl-step-ui i{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:5px;background:rgba(255,255,255,0.06);font-style:normal;font-size:10.5px}
.sfl-step-ui.sfl-on{color:var(--t1);border-color:rgba(139,124,246,0.35);background:rgba(139,124,246,0.07)}
.sfl-step-ui.sfl-on i{background:var(--ac);color:#fff}
.sfl-acc-row{display:flex;align-items:center;gap:12px;height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--b);background:rgba(255,255,255,0.015);font-size:12.5px;animation:sflIn .45s var(--e)}
.sfl-acc-row.sfl-run{border-color:rgba(251,191,36,0.25);background:rgba(251,191,36,0.04)}
.sfl-st{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:500;white-space:nowrap}
.sfl-st i{width:6px;height:6px;border-radius:99px;background:currentColor;display:block}
.sfl-fake-btn{display:flex;align-items:center;justify-content:center;gap:8px;height:40px;border-radius:8px;background:#EDEDEF;color:#0A0A0B;font-size:13px;font-weight:500}
.sfl-thumbs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.sfl-thumb{position:relative;aspect-ratio:9/16;border-radius:8px;border:1px solid var(--b);overflow:hidden}
.sfl-thumb.sfl-sel{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac)}
.sfl-thumb svg{position:absolute;left:50%;top:50%;margin:-7px 0 0 -7px;color:rgba(255,255,255,0.4)}
.sfl-thumb b{position:absolute;left:6px;right:6px;bottom:6px;height:3px;border-radius:9px;background:rgba(255,255,255,0.12)}
.sfl-chipf{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:7px;border:1px solid var(--b);color:var(--t3);font-size:12px}
.sfl-chipf.sfl-on{color:var(--t1);border-color:var(--b3);background:rgba(255,255,255,0.05)}
@media (max-width:767px){.sfl-app{grid-template-columns:minmax(0,1fr);min-height:0}.sfl-side{display:none}.sfl-appbody{padding:16px}}
@media (max-width:639px){.sfl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sfl-thumbs{grid-template-columns:repeat(4,minmax(0,1fr))}.sfl-thumb:nth-child(n+9){display:none}
  .sfl-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}}
@media (max-width:479px){.sfl-two{grid-template-columns:minmax(0,1fr)}}

/* Bento */
.sfl-bento{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:56px}
.sfl-f{display:flex;flex-direction:column;gap:10px;padding:26px;min-height:220px;overflow:hidden}
.sfl-f2,.sfl-f2x{grid-column:span 2}
.sfl-f3{grid-column:span 3}
.sfl-f h3{margin:8px 0 0;font-size:16.5px;font-weight:600;letter-spacing:-0.015em}
.sfl-f p{margin:0;max-width:480px;font-size:14px;line-height:1.62;color:var(--t2)}
.sfl-f-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:center;height:100%}
.sfl-f-txt{display:flex;flex-direction:column;gap:10px}
.sfl-viz-dots{display:grid;grid-template-columns:repeat(13,minmax(0,1fr));gap:6px}
.sfl-viz-dots i{display:block;aspect-ratio:1;border-radius:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.05)}
.sfl-viz-dots i.d{background:rgba(74,222,128,0.2);border-color:rgba(74,222,128,0.4)}
.sfl-viz-dots i.r{background:rgba(251,191,36,0.25);border-color:rgba(251,191,36,0.55);animation:sflPulse 1.6s ease-in-out infinite}
.sfl-viz-frames{display:flex;gap:8px;justify-content:center;align-items:flex-end}
.sfl-viz-frames i{display:block;width:16%;aspect-ratio:9/16;border-radius:7px;border:1px solid var(--b2);background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))}
.sfl-viz-frames i:nth-child(3){border-color:rgba(139,124,246,0.6);background:linear-gradient(180deg,rgba(139,124,246,0.18),rgba(139,124,246,0.03));transform:translateY(-8px)}
.sfl-viz-cr{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:10px;border:1px solid var(--b);background:rgba(0,0,0,0.2)}
.sfl-viz-cr .sfl-bar>i{background:var(--amb)}
@media (max-width:1023px){.sfl-bento{grid-template-columns:repeat(2,minmax(0,1fr))}.sfl-f2x{grid-column:span 1}.sfl-f3{grid-column:span 2}.sfl-f2x .sfl-f-split{grid-template-columns:minmax(0,1fr)}}
@media (max-width:639px){.sfl-bento{grid-template-columns:minmax(0,1fr)}.sfl-f2,.sfl-f2x,.sfl-f3{grid-column:auto}.sfl-f-split{grid-template-columns:minmax(0,1fr);gap:20px}.sfl-f{padding:22px;min-height:0}}

/* Étapes */
.sfl-steps{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:56px}
.sfl-step{padding:26px}
.sfl-step-n{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
.sfl-step-n span{font-size:12.5px;color:var(--t4)}
.sfl-step h3{margin:0;font-size:16.5px;font-weight:600;letter-spacing:-0.015em}
.sfl-step p{margin:10px 0 0;font-size:14px;line-height:1.62;color:var(--t2)}
@media (max-width:899px){.sfl-steps{grid-template-columns:minmax(0,1fr)}}

/* Cloud */
.sfl-cloud{background:linear-gradient(180deg,rgba(255,255,255,0.012),transparent 40%)}
.sfl-cloud-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,0.95fr);gap:64px;align-items:center}
.sfl-cbadge{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 6px 0 10px;border-radius:99px;border:1px solid rgba(251,191,36,0.25);background:rgba(251,191,36,0.06);color:var(--amb);font-size:11.5px;font-weight:500;letter-spacing:.05em}
.sfl-cbadge b{height:20px;display:inline-flex;align-items:center;padding:0 8px;border-radius:99px;background:rgba(251,191,36,0.14);font-weight:500;letter-spacing:0}
.sfl-cbadge .sfl-pulse{background:var(--amb)}
.sfl-points{display:flex;flex-direction:column;gap:18px;margin-top:32px}
.sfl-point{display:flex;gap:14px}
.sfl-point h3{margin:0;font-size:15px;font-weight:600;letter-spacing:-0.01em}
.sfl-point p{margin:4px 0 0;font-size:14px;line-height:1.6;color:var(--t2)}
.sfl-wait{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:36px}
.sfl-wait small{font-size:12.5px;color:var(--t3)}
.sfl-wait small+small{color:var(--t4)}
.sfl-joined{display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:10px 16px;border-radius:8px;border:1px solid rgba(74,222,128,0.28);background:rgba(74,222,128,0.07);color:var(--ok);font-size:14px;font-weight:500;animation:sflIn .45s var(--e)}
.sfl-phone-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:20px;padding:8px 0}
.sfl-phone{position:relative;width:256px;max-width:100%;padding:8px;border-radius:40px;background:#161618;border:1px solid var(--b3);box-shadow:0 60px 100px -40px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,255,255,0.08)}
.sfl-screen{position:relative;display:flex;flex-direction:column;aspect-ratio:9/19;border-radius:32px;overflow:hidden;background:#0C0C0E;border:1px solid var(--b)}
.sfl-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
@media (min-width:1024px){
  .sfl-chips{display:contents}
  .sfl-chips .sfl-chip{position:absolute;z-index:2;animation:sflFloat 10s ease-in-out infinite}
  .sfl-chip-a{top:64px;left:0}
  .sfl-chip-b{top:200px;right:0;animation-delay:-3s!important}
  .sfl-chip-c{bottom:84px;left:12px;animation-delay:-6s!important}
}
.sfl-farm{margin-top:64px;padding:24px}
.sfl-farm-h{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.sfl-tiles{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:6px;margin-top:20px}
.sfl-tile{aspect-ratio:9/15;border-radius:4px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);transition:background-color .35s ease,border-color .35s ease,transform .35s var(--e)}
.sfl-tile.on{background:rgba(74,222,128,0.16);border-color:rgba(74,222,128,0.42)}
.sfl-tile.boot{background:rgba(251,191,36,0.22);border-color:rgba(251,191,36,0.6);transform:scale(1.1)}
@media (max-width:1023px){.sfl-cloud-grid{grid-template-columns:minmax(0,1fr);gap:56px}.sfl-tiles{grid-template-columns:repeat(16,minmax(0,1fr))}}
@media (max-width:639px){.sfl-tiles{grid-template-columns:repeat(12,minmax(0,1fr))}.sfl-farm{padding:18px}.sfl-legend .sfl-eta{margin-left:0;width:100%}}

/* Avis */
.sfl-revs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:56px}
.sfl-rev{display:flex;flex-direction:column;gap:12px;margin:0;padding:12px}
.sfl-rev img{width:100%;height:auto;border-radius:9px}
.sfl-rev figcaption{display:flex;align-items:center;gap:10px;padding:0 4px 2px;font-size:12.5px;white-space:nowrap}
.sfl-stars{display:inline-flex;gap:1px;color:var(--amb)}
.sfl-rev figcaption b{font-weight:500;color:var(--t1)}
.sfl-rev figcaption span:last-child{margin-left:auto;color:var(--t4);font-size:12px}
.sfl-voice{display:flex;align-items:center;gap:14px;padding:16px}
.sfl-play{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border-radius:99px;border:0;background:#EDEDEF;color:#0A0A0B;cursor:pointer;transition:transform .2s var(--e)}
@media (hover:hover){.sfl-play:hover{transform:scale(1.05)}}
.sfl-wave{display:flex;align-items:center;gap:2px;height:28px}
.sfl-wave i{flex:1;border-radius:9px;background:rgba(255,255,255,0.14);transition:background-color .15s linear}
.sfl-wave i.p{background:var(--ok)}
@media (max-width:1023px){.sfl-revs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:639px){.sfl-revs{grid-template-columns:minmax(0,1fr)}}

/* Tarifs */
.sfl-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:56px;align-items:stretch}
.sfl-plan{display:flex;flex-direction:column;padding:28px}
.sfl-plan.sfl-pro{border-color:rgba(139,124,246,0.55);background:linear-gradient(180deg,rgba(139,124,246,0.075),var(--s1) 45%)}
.sfl-plan-name{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;font-weight:500;color:var(--t2)}
.sfl-pop{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;background:rgba(139,124,246,0.14);border:1px solid rgba(139,124,246,0.3);color:var(--ac2);font-size:11.5px;font-weight:500}
.sfl-price{display:flex;align-items:baseline;gap:6px;margin-top:18px}
.sfl-price b{font-size:40px;font-weight:600;letter-spacing:-0.04em;color:var(--t1)}
.sfl-price span{font-size:14px;color:var(--t4)}
.sfl-plan p{margin:10px 0 0;font-size:14px;line-height:1.6;color:var(--t2)}
.sfl-plan ul{margin:24px 0 0;padding:24px 0 0;border-top:1px solid var(--b);list-style:none;display:flex;flex-direction:column;gap:12px;font-size:14px;color:var(--t1)}
.sfl-plan li{display:flex;align-items:flex-start;gap:10px}
.sfl-plan li svg{margin-top:2px;flex-shrink:0;color:var(--t3)}
.sfl-pro li svg{color:var(--ac2)}
.sfl-plan-cta{margin-top:auto;padding-top:28px}
.sfl-box{margin-top:12px;padding:28px}
.sfl-box-h{display:flex;align-items:flex-end;justify-content:space-between;gap:12px 20px;flex-wrap:wrap}
.sfl-box-h h3{margin:0;font-size:17px;font-weight:600;letter-spacing:-0.02em}
.sfl-box-h p{margin:6px 0 0;font-size:14px;color:var(--t2)}
.sfl-packs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:22px}
.sfl-pack{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:16px;border-radius:10px;border:1px solid var(--b);background:rgba(255,255,255,0.015);transition:transform .3s var(--e),border-color .3s ease,background-color .3s ease}
@media (hover:hover){.sfl-pack:hover{transform:translateY(-2px);border-color:var(--b3);background:rgba(255,255,255,0.035)}}
.sfl-pack b{display:flex;align-items:center;gap:7px;font-size:19px;font-weight:600;letter-spacing:-0.03em;color:var(--t1)}
.sfl-pack b small{font-size:12px;font-weight:400;color:var(--t4);letter-spacing:0}
.sfl-pack>span{font-size:13.5px;color:var(--t2)}
.sfl-costs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:22px}
.sfl-cost{display:flex;align-items:center;gap:12px;padding:14px;border-radius:10px;border:1px solid var(--b);background:rgba(255,255,255,0.015)}
.sfl-cost-t{display:flex;flex-direction:column;min-width:0;line-height:1.35}
.sfl-cost-t b{font-size:13.5px;font-weight:500;color:var(--t1)}
.sfl-cost-t span{font-size:12px;color:var(--t4)}
.sfl-cost-v{margin-left:auto;font-size:15px;font-weight:600;letter-spacing:-0.02em;white-space:nowrap;color:var(--amb)}
.sfl-cost-v.sfl-free{color:var(--ok)}
.sfl-example{display:flex;align-items:flex-start;gap:12px;margin-top:16px;padding:14px 16px;border-radius:10px;border:1px solid rgba(139,124,246,0.22);background:rgba(139,124,246,0.05);font-size:13.5px;line-height:1.6;color:var(--t2)}
.sfl-example svg{flex-shrink:0;margin-top:2px;color:var(--ac2)}
.sfl-example strong{font-weight:600;color:var(--t1)}
.sfl-pay{margin:28px 0 0;text-align:center;font-size:13px;color:var(--t4)}
@media (max-width:959px){.sfl-plans{grid-template-columns:minmax(0,1fr);max-width:500px;margin-left:auto;margin-right:auto}}
@media (max-width:899px){.sfl-packs{grid-template-columns:repeat(3,minmax(0,1fr))}.sfl-costs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:559px){.sfl-packs{grid-template-columns:repeat(2,minmax(0,1fr))}.sfl-costs{grid-template-columns:minmax(0,1fr)}.sfl-box{padding:20px}.sfl-plan{padding:22px}}

/* FAQ */
.sfl-faq{display:grid;grid-template-columns:minmax(0,0.8fr) minmax(0,1.2fr);gap:72px;align-items:start}
.sfl-faq-head{position:sticky;top:96px}
.sfl-faq-head a{display:inline-flex;align-items:center;gap:8px;margin-top:24px;font-size:14px;color:var(--t2);transition:color .2s ease}
.sfl-faq-head a:hover{color:var(--t1)}
.sfl-qa{border-bottom:1px solid var(--b)}
.sfl-qa:first-child{border-top:1px solid var(--b)}
.sfl-q{display:flex;align-items:center;justify-content:space-between;gap:20px;width:100%;padding:20px 0;border:0;background:none;color:var(--t1);font-size:15.5px;font-weight:500;letter-spacing:-0.01em;line-height:1.45;text-align:left;cursor:pointer;transition:color .2s ease}
.sfl-q:hover{color:#fff}
.sfl-q svg{flex-shrink:0;color:var(--t3);transition:transform .35s var(--e),color .2s ease}
.sfl-qa.sfl-open .sfl-q svg{transform:rotate(45deg);color:var(--t1)}
.sfl-a{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s var(--e)}
.sfl-qa.sfl-open .sfl-a{grid-template-rows:1fr}
.sfl-a>div{overflow:hidden}
.sfl-a p{margin:0;padding:0 40px 22px 0;font-size:14.5px;line-height:1.7;color:var(--t2);opacity:0;transition:opacity .3s ease}
.sfl-qa.sfl-open .sfl-a p{opacity:1}
@media (max-width:899px){.sfl-faq{grid-template-columns:minmax(0,1fr);gap:36px}.sfl-faq-head{position:static}.sfl-a p{padding-right:0}}

/* CTA final + footer */
.sfl-final{position:relative;overflow:hidden;padding:88px 32px;border-radius:20px;border:1px solid var(--b2);background:var(--s1);text-align:center}
.sfl-final .sfl-gridbg{-webkit-mask-image:radial-gradient(ellipse 60% 80% at 50% 0%,#000 10%,transparent 70%);mask-image:radial-gradient(ellipse 60% 80% at 50% 0%,#000 10%,transparent 70%)}
.sfl-final p{margin:20px auto 0;max-width:540px;font-size:clamp(15px,1.5vw,17px);line-height:1.65;color:var(--t2)}
.sfl-final p strong{font-weight:500;color:var(--t1)}
.sfl-final small{display:block;margin-top:24px;font-size:12.5px;color:var(--t4)}
.sfl-foot{padding:72px 0 36px}
.sfl-foot-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px}
.sfl-foot-grid p{margin:16px 0 0;max-width:320px;font-size:13.5px;line-height:1.65;color:var(--t3)}
.sfl-foot-col{display:flex;flex-direction:column;gap:11px}
.sfl-foot-col h3{margin:0 0 4px;font-size:13px;font-weight:500;color:var(--t1)}
.sfl-foot-col a{font-size:13.5px;color:var(--t3);transition:color .15s ease;width:fit-content}
.sfl-foot-col a:hover{color:var(--t1)}
.sfl-foot-bot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:56px;padding-top:24px;border-top:1px solid var(--b);font-size:12.5px;color:var(--t4)}
.sfl-fr{display:inline-flex;align-items:center;gap:8px}
.sfl-flag{display:inline-flex;width:15px;height:10px;border-radius:2px;overflow:hidden}
.sfl-flag i{flex:1}
@media (max-width:899px){.sfl-foot-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.sfl-foot-brand{grid-column:1/-1}}
@media (max-width:479px){.sfl-foot-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 20px}}

/* Mobile */
@media (max-width:639px){
  .sfl-wrap{padding:0 16px}
  .sfl-sec{padding:80px 0}
  .sfl-hero{padding:44px 0 72px}
  .sfl-hero-cta .sfl-btn{flex:1 1 auto}
  .sfl-final{padding:56px 20px;border-radius:16px}
  .sfl-hdr-in{gap:12px}
  .sfl-step,.sfl-plan{padding:22px}
}
@media (max-width:379px){.sfl-hdr-go{display:none}}

/* Accessibilité : mouvement réduit */
@media (prefers-reduced-motion:reduce){
  .sfl-root{scroll-behavior:auto}
  .sfl-rv{opacity:1;translate:none;transition:none}
  .sfl-root *,.sfl-root *::before,.sfl-root *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
}
`

// ── Petites briques ──────────────────────────────────────────────────────────
function useTick(period = 650, mod = 58) {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setT(v => (v + 1) % mod), period)
    return () => window.clearInterval(id)
  }, [period, mod])
  return t
}

function LogoTile({ s }: { s: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: s * 0.09, width: s, height: s, borderRadius: s * 0.27, background: '#7462E8', flexShrink: 0 }}>
      <span style={{ width: s * 0.44, height: s * 0.088, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
      <span style={{ width: s * 0.44, height: s * 0.088, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
    </span>
  )
}

function Brand() {
  return <span className="sfl-brand"><LogoTile s={26} /><span>ScaleFlow</span></span>
}

function WinChrome({ children }: { children: ReactNode }) {
  return <div className="sfl-chrome"><span className="sfl-dots" aria-hidden="true"><i /><i /><i /></span>{children}</div>
}

function Head({ eyebrow, children, sub, center }: { eyebrow: string; children: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={'sfl-head' + (center ? ' sfl-c' : '')}>
      <div className="sfl-rv"><span className="sfl-eyebrow">{eyebrow}</span></div>
      <h2 className="sfl-h2 sfl-rv" style={dl(60)}>{children}</h2>
      {sub && <p className="sfl-lead sfl-rv" style={dl(120)}>{sub}</p>}
    </div>
  )
}

const ACC_OK = '#4ADE80', ACC_RUN = '#FBBF24'

/** Radial de diffusion : la vidéo au centre, les comptes en orbite. */
function Radial({ t }: { t: number }) {
  const done = Math.max(0, Math.min(TOTAL, Math.floor(t)))
  const active = t < TOTAL ? Math.floor(t) : -1
  const wave = 20 + (Math.floor(t) % 4) * 34
  return (
    <svg className="sfl-radial" viewBox="0 0 320 320" aria-hidden="true">
      {RINGS.map((ring, i) => <circle key={'o' + i} cx={160} cy={160} r={ring.r} fill="none" stroke="#fff" strokeOpacity={0.06} strokeDasharray="2 6" />)}
      <circle cx={160} cy={160} r={44} fill="#8B7CF6" fillOpacity={0.06} />
      {seats.map((s, i) => {
        const rank = rankOf[i]
        const isDone = rank < done, isActive = rank === active
        return <line key={'l' + i} x1={160} y1={160} x2={s.x} y2={s.y} stroke={isActive ? ACC_RUN : isDone ? ACC_OK : '#fff'} strokeOpacity={isActive ? 0.7 : isDone ? 0.16 : 0.04} strokeWidth={isActive ? 1.4 : 1} />
      })}
      {seats.map((s, i) => {
        const rank = rankOf[i]
        const isDone = rank < done, isActive = rank === active
        return <circle key={'d' + i} className="sfl-seat" cx={s.x} cy={s.y} r={isActive ? 6 : isDone ? 4.4 : 3.2} fill={isActive ? ACC_RUN : isDone ? ACC_OK : 'rgba(255,255,255,0.16)'} />
      })}
      <circle cx={160} cy={160} r={wave} fill="none" stroke="#8B7CF6" strokeWidth={1.2} strokeOpacity={Math.max(0, 0.4 - (Math.floor(t) % 4) * 0.1)} />
      <rect x={144} y={136} width={32} height={48} rx={8} fill="#161618" stroke="rgba(255,255,255,0.28)" strokeWidth={1.2} />
      <path d="M156 152 L167 160 L156 168 Z" fill="#EDEDEF" />
    </svg>
  )
}

function appLog(t: number) {
  const done = Math.max(0, Math.min(TOTAL, Math.floor(t)))
  const active = t < TOTAL ? Math.floor(t) : -1
  const lines: { id: string; phone: string; name: string; ok: boolean }[] = []
  for (let k = 2; k >= 0; k--) {
    const r = done - 1 - k
    if (r < 0) continue
    lines.push({ id: 'd' + r, phone: 'iPhone-' + String(order[r] + 1).padStart(2, '0'), name: NAMES[order[r] % NAMES.length], ok: true })
  }
  if (active >= 0 && done < TOTAL) lines.push({ id: 'a' + active, phone: 'iPhone-' + String(order[active] + 1).padStart(2, '0'), name: NAMES[order[active] % NAMES.length], ok: false })
  return lines.slice(-4)
}

function LiveCount() {
  const [live, setLive] = useState(18342)
  useEffect(() => {
    const id = window.setInterval(() => setLive(v => v + Math.floor(2 + Math.random() * 5)), 1300)
    return () => window.clearInterval(id)
  }, [])
  return <span className="sfl-num">{live.toLocaleString('fr-FR')}</span>
}

function HeroRun() {
  const t = useTick()
  const done = Math.max(0, Math.min(TOTAL, Math.floor(t)))
  const remain = Math.max(0, TOTAL - done)
  return (
    <div className="sfl-win">
      <WinChrome>
        <span className="sfl-wtitle">Mass Posting · reel_042.mp4</span>
        <span className="sfl-live"><span className="sfl-pulse" />EN DIRECT</span>
      </WinChrome>
      <div className="sfl-run-top">
        <div className="sfl-run-count">
          <b className="sfl-num">{done}<span> / {TOTAL}</span></b>
          <span>comptes publiés</span>
        </div>
        <div className="sfl-bar"><i style={{ transform: `scaleX(${done / TOTAL})` }} /></div>
      </div>
      <Radial t={t} />
      <div className="sfl-legend">
        <span><i style={{ background: ACC_OK }} />publié</span>
        <span><i style={{ background: ACC_RUN }} />en cours</span>
        <span><i style={{ background: 'rgba(255,255,255,0.18)' }} />en file</span>
        <span className="sfl-eta sfl-mono">{remain > 0 ? '~' + Math.ceil(remain * 0.9) + ' s restantes' : 'diffusion terminée'}</span>
      </div>
      <div className="sfl-log sfl-mono">
        {appLog(t).map(l => (
          <div key={l.id} style={{ opacity: l.ok ? 0.7 : 1 }}>
            <span className="sfl-ph">{l.phone}</span>
            <span className="sfl-acc">@{l.name}</span>
            <span className="sfl-st" style={{ color: l.ok ? ACC_OK : ACC_RUN }}><Ico n={l.ok ? 'check' : 'upload'} s={12} />{l.ok ? 'publié' : 'upload…'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Showcase ─────────────────────────────────────────────────────────────────
function Kpi({ t, v, c }: { t: string; v: string; c?: string }) {
  return <div className="sfl-mc"><div className="sfl-lbl">{t}</div><div className="sfl-kv sfl-num" style={c ? { color: c } : undefined}>{v}</div></div>
}

const THUMB_BG = ['rgba(139,124,246,0.13)', 'rgba(255,255,255,0.05)', 'rgba(74,222,128,0.08)', 'rgba(255,255,255,0.035)', 'rgba(251,191,36,0.08)', 'rgba(255,255,255,0.06)']

function AppBody({ shot }: { shot: ShotId }) {
  const t = useTick()
  const done = Math.max(0, Math.min(TOTAL, Math.floor(t)))
  if (shot === 'hub') {
    return (
      <div className="sfl-appbody" key="hub">
        <div className="sfl-ab-t">Bonjour, Quentin</div>
        <div className="sfl-kpis">
          <Kpi t="Téléphones" v="52" /><Kpi t="Vidéos" v="347" /><Kpi t="Posts · 7j" v="1 284" c={ACC_OK} /><Kpi t="Crédits" v="2 480" c={ACC_RUN} />
        </div>
        <div className="sfl-two">
          <div className="sfl-mc"><div className="sfl-lbl">Posts à venir</div>{[['24 comptes · Morning routine', '18:00'], ['18 comptes · Story + lien', '21:00'], ['Warmup · groupe Nouveaux', 'demain']].map((r, i) => <div key={i} className="sfl-row"><span>{r[0]}</span><span>{r[1]}</span></div>)}</div>
          <div className="sfl-mc"><div className="sfl-lbl">Activité récente</div>{[['52/52 · Mass posting', ACC_OK], ['22/24 · Story', ACC_RUN], ['36/36 · TikTok', ACC_OK]].map((r, i) => <div key={i} className="sfl-row"><span>{r[0]}</span><span style={{ color: r[1] }}><Ico n="check" s={14} /></span></div>)}</div>
        </div>
      </div>
    )
  }
  if (shot === 'bank') {
    return (
      <div className="sfl-appbody" key="bank">
        <div className="sfl-ab-h"><span className="sfl-ab-t">Banque de contenu</span><span className="sfl-badge">347 vidéos</span></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['Motivation', 'Lifestyle', 'Produits'].map((f, i) => <span key={f} className={'sfl-chipf' + (i === 0 ? ' sfl-on' : '')}><Ico n="folder" s={13} />{f}</span>)}</div>
        <div className="sfl-thumbs">{Array.from({ length: 12 }, (_, i) => <div key={i} className={'sfl-thumb' + (i < 2 ? ' sfl-sel' : '')} style={{ background: `linear-gradient(170deg, ${THUMB_BG[i % THUMB_BG.length]}, rgba(255,255,255,0.01))` }}><Ico n="play" s={14} /><b /></div>)}</div>
      </div>
    )
  }
  if (shot === 'studio') {
    const TOOLS: { ic: IconName; name: string; desc: string }[] = [
      { ic: 'film', name: 'Remix', desc: '×24 variantes uniques' },
      { ic: 'shield', name: 'Spoof', desc: 'device · GPS · EXIF' },
      { ic: 'message', name: 'Sous-titres', desc: 'IA Whisper mot à mot' },
      { ic: 'sliders', name: 'Mixer', desc: 'hook incrusté' },
    ]
    return (
      <div className="sfl-appbody" key="studio">
        <div className="sfl-ab-t">Studio vidéo</div>
        <div className="sfl-two">{TOOLS.map(x => <div key={x.name} className="sfl-mc" style={{ padding: 18 }}><span className="sfl-ico"><Ico n={x.ic} s={17} /></span><div style={{ marginTop: 14, fontSize: 14.5, fontWeight: 600 }}>{x.name}</div><div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--t3)' }}>{x.desc}</div></div>)}</div>
      </div>
    )
  }
  const lines = appLog(t)
  return (
    <div className="sfl-appbody" key="mass">
      <div className="sfl-ab-h"><span className="sfl-ab-t">Nouveau mass posting</span><span className="sfl-badge sfl-ok"><span className="sfl-pulse" />52 phones en ligne</span></div>
      <div className="sfl-steps-ui">{['Comptes', 'Vidéos', 'Légende', 'Lancement'].map((s, i) => <span key={s} className={'sfl-step-ui' + (i === 3 ? ' sfl-on' : '')}><i className="sfl-mono">{i + 1}</i>{s}</span>)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 194 }}>
        {lines.map(l => (
          <div key={l.id} className={'sfl-acc-row' + (l.ok ? '' : ' sfl-run')}>
            <span className="sfl-mono" style={{ color: 'var(--t1)', fontSize: 12 }}>{l.phone}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t3)' }}>@{l.name}</span>
            <span className="sfl-st" style={{ color: l.ok ? ACC_OK : ACC_RUN }}><i />{l.ok ? 'publié' : 'en cours'}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="sfl-bar" style={{ flex: 1 }}><i style={{ transform: `scaleX(${done / TOTAL})` }} /></div>
        <span className="sfl-mono sfl-num" style={{ fontSize: 11.5, color: 'var(--t2)' }}>{done}/{TOTAL}</span>
      </div>
      <div className="sfl-fake-btn"><Ico n="zap" s={14} />Lancer la diffusion</div>
    </div>
  )
}

function Showcase() {
  const [shot, setShot] = useState<ShotId>('mass')
  const activeNav = shot === 'hub' ? 'hub' : shot === 'bank' ? 'bank' : shot === 'studio' ? 'studio' : 'mass'
  const shotLabel = (SHOTS.find(s => s.id === shot) || SHOTS[0]).label
  return (
    <section id="showcase" className="sfl-sec">
      <div className="sfl-wrap">
        <Head eyebrow="L'app" sub="Tout ce qu'il te faut pour gérer une ferme de comptes, dans une seule fenêtre. Windows, Mac et web.">Le poste de pilotage.</Head>
        <div className="sfl-rv" style={dl(160)}>
          <div className="sfl-tabs" role="tablist" aria-label="Aperçus de l'app">
            {SHOTS.map(s => <button key={s.id} type="button" role="tab" aria-selected={shot === s.id} className="sfl-tab" onClick={() => setShot(s.id)}><Ico n={s.ic} s={15} />{s.label}</button>)}
          </div>
        </div>
        <div className="sfl-rv sfl-showwin" style={dl(220)}>
          <div className="sfl-win">
            <WinChrome><span className="sfl-wtitle">ScaleFlow — {shotLabel}</span></WinChrome>
            <div className="sfl-app">
              <div className="sfl-side" aria-hidden="true">
                {APP_NAV.map(n => <div key={n.id} className={'sfl-side-i' + (n.id === activeNav ? ' sfl-on' : '')}><Ico n={n.ic} s={15} />{n.label}</div>)}
                <div className="sfl-side-cr">
                  <div className="sfl-lbl">Crédits restants</div>
                  <div className="sfl-num" style={{ marginTop: 4, fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>107 150</div>
                  <div className="sfl-bar" style={{ marginTop: 10 }}><i style={{ transform: 'scaleX(0.72)', background: 'var(--amb)' }} /></div>
                </div>
              </div>
              <AppBody shot={shot} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Fonctionnalités ──────────────────────────────────────────────────────────
function FeatViz({ kind }: { kind: 'mass' | 'remix' | 'credits' }) {
  if (kind === 'mass') {
    return <div className="sfl-viz-dots" aria-hidden="true">{Array.from({ length: 39 }, (_, i) => { const r = (i * 7 + 3) % 39; return <i key={i} className={r < 24 ? 'd' : r < 26 ? 'r' : ''} /> })}</div>
  }
  if (kind === 'remix') {
    return <div className="sfl-viz-frames" aria-hidden="true"><i /><i /><i /><i /><i /></div>
  }
  return (
    <div className="sfl-viz-cr" aria-hidden="true">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span className="sfl-lbl">Crédits</span>
        <span className="sfl-num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.03em' }}>2 480</span>
      </div>
      <div className="sfl-bar"><i style={{ transform: 'scaleX(0.62)' }} /></div>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="sfl-sec sfl-bt">
      <div className="sfl-wrap">
        <Head center eyebrow="Tout pour scaler" sub="Fini de jongler entre dix outils. Publication, automatisation et production de contenu au même endroit.">
          Une seule app, <span className="sfl-dim">tout dedans.</span>
        </Head>
        <div className="sfl-bento">
          {FEATURES.map((f, i) => {
            const txt = <><span className="sfl-ico"><Ico n={f.ic} s={18} /></span><h3>{f.title}</h3><p>{f.text}</p></>
            return (
              <div key={f.title} className={`sfl-card sfl-hov sfl-rv sfl-f sfl-${f.size}`} style={dl((i % 3) * 70)}>
                {f.viz ? <div className="sfl-f-split"><div className="sfl-f-txt">{txt}</div><FeatViz kind={f.viz} /></div> : txt}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Cloud Phones ─────────────────────────────────────────────────────────────
function CloudPhones() {
  const t = useTick()
  const done = Math.max(0, Math.min(TOTAL, Math.floor(t)))
  const [joined, setJoined] = useState(false)
  const [wait, setWait] = useState(8)
  const CTOT = 48
  const cphase = Math.floor(t * 1.6) % (CTOT + 10)
  const cloudOn = Math.max(0, Math.min(CTOT, cphase - 2))
  const POINTS: { ic: IconName; title: string; text: string }[] = [
    { ic: 'zap', title: 'Démarrage instantané', text: 'Un appareil prêt en quelques secondes, pas en minutes. Ta diffusion part sans attendre le boot.' },
    { ic: 'infinity', title: 'Aucune limite', text: "Autant d'appareils que ton serveur peut en tenir. Plus de quota imposé par un tiers." },
    { ic: 'lock', title: 'Chez toi', text: "Tes sessions, tes proxies, tes données. L'agent tourne sur ton propre serveur." },
  ]
  return (
    <section id="cloud" className="sfl-sec sfl-bt sfl-cloud">
      <div className="sfl-wrap">
        <div className="sfl-cloud-grid">
          <div>
            <div className="sfl-rv"><span className="sfl-cbadge"><span className="sfl-pulse" />EN CONSTRUCTION<b>Q4 2026</b></span></div>
            <h2 className="sfl-h2 sfl-rv" style={{ ...dl(60), marginTop: 20 }}>Nos propres <span style={{ color: 'var(--ac2)', whiteSpace: 'nowrap' }}>Cloud Phones</span> arrivent.</h2>
            <p className="sfl-lead sfl-rv" style={dl(120)}>Fini de payer GeeLark. ScaleFlow héberge ses propres appareils Android : tu crées un phone en un clic, il démarre en quelques secondes, et tu n'as plus aucune limite de comptes.</p>
            <div className="sfl-points">
              {POINTS.map((p, i) => <div key={p.title} className="sfl-point sfl-rv" style={dl(160 + i * 70)}><span className="sfl-ico"><Ico n={p.ic} s={17} /></span><div><h3>{p.title}</h3><p>{p.text}</p></div></div>)}
            </div>
            <div className="sfl-wait sfl-rv" style={dl(200)}>
              {!joined ? (
                <button type="button" className="sfl-btn sfl-btn-p sfl-btn-lg" onClick={() => { setJoined(true); setWait(w => w + 1) }}>Rejoindre la liste d'attente<Ico n="arrow" s={16} className="sfl-arr" /></button>
              ) : (
                <span className="sfl-joined" role="status"><Ico n="check" s={16} />Tu es sur la liste — on te prévient au lancement</span>
              )}
              <small>{wait} agences déjà inscrites · accès prioritaire</small>
              <small>Les premières inscrites testent avant tout le monde.</small>
            </div>
          </div>

          <div className="sfl-phone-wrap sfl-rv" style={dl(120)}>
            <div className="sfl-phone">
              <div className="sfl-screen">
                <span aria-hidden="true" style={{ position: 'absolute', top: 10, left: '50%', marginLeft: -28, width: 56, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.12)' }} />
                <div className="sfl-mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 18px 0', fontSize: 10, color: 'var(--t3)' }}>
                  <span>09:41</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>4G<svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true"><rect x="0" y="7" width="2.5" height="3" rx="0.6" fill="currentColor" /><rect x="3.8" y="5" width="2.5" height="5" rx="0.6" fill="currentColor" /><rect x="7.6" y="2.5" width="2.5" height="7.5" rx="0.6" fill="currentColor" /><rect x="11.4" y="0" width="2.5" height="10" rx="0.6" fill="currentColor" /></svg></span>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LogoTile s={30} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="sfl-mono" style={{ fontSize: 11.5, color: 'var(--t1)' }}>sf-cloud-07</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--ok)' }}><span className="sfl-pulse" style={{ width: 5, height: 5 }} />démarré · Android 14</span>
                    </span>
                  </div>
                  <div className="sfl-mc" style={{ padding: 11 }}>
                    <div className="sfl-lbl" style={{ fontSize: 10 }}>Tâche en cours</div>
                    <div style={{ marginTop: 5, fontSize: 12, fontWeight: 500 }}>Publication Reels</div>
                    <div className="sfl-bar" style={{ marginTop: 10 }}><i style={{ transform: `scaleX(${done / TOTAL})` }} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="sfl-mc" style={{ padding: 10 }}><div className="sfl-lbl" style={{ fontSize: 10 }}>Proxy</div><div className="sfl-mono" style={{ marginTop: 4, fontSize: 11, color: 'var(--t1)' }}>FR-07</div></div>
                    <div className="sfl-mc" style={{ padding: 10 }}><div className="sfl-lbl" style={{ fontSize: 10 }}>Boot</div><div className="sfl-mono" style={{ marginTop: 4, fontSize: 11, color: 'var(--ok)' }}>3,2 s</div></div>
                  </div>
                  <div className="sfl-mono" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 9, background: 'rgba(0,0,0,0.35)', border: '1px solid var(--b)', fontSize: 9.5, lineHeight: 1.5, color: 'var(--t3)' }}>
                    <span>adb · connected</span><span>ig · session ok</span><span style={{ color: 'var(--ok)' }}>upload · {done} / {TOTAL}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="sfl-chips">
              <span className="sfl-chip sfl-chip-a"><span className="sfl-ico sfl-ico-n" style={{ width: 30, height: 30 }}><Ico n="zap" s={15} /></span><span className="sfl-chip-t"><b>3,2 s</b><span>au démarrage</span></span></span>
              <span className="sfl-chip sfl-chip-b"><span className="sfl-ico sfl-ico-n" style={{ width: 30, height: 30 }}><Ico n="infinity" s={15} /></span><span className="sfl-chip-t"><b>Illimité</b><span>appareils par serveur</span></span></span>
              <span className="sfl-chip sfl-chip-c"><span className="sfl-ico sfl-ico-n" style={{ width: 30, height: 30 }}><Ico n="lock" s={15} /></span><span className="sfl-chip-t"><b>Tes données</b><span>sur ton serveur</span></span></span>
            </div>
          </div>
        </div>

        <div className="sfl-card sfl-farm sfl-rv">
          <div className="sfl-farm-h">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>Ta ferme, en un écran</span>
              <span style={{ fontSize: 12.5, color: 'var(--t4)' }}>CPU 34 % · RAM 11,2 / 32 Go · latence 18 ms</span>
            </span>
            <span className="sfl-badge sfl-ok"><span className="sfl-pulse" />agent connecté</span>
          </div>
          <div className="sfl-tiles" aria-hidden="true">
            {Array.from({ length: CTOT }, (_, i) => { const rank = (i * 11 + 3) % CTOT; const on = rank < cphase - 2, boot = rank >= cphase - 2 && rank < cphase; return <div key={i} className={'sfl-tile' + (on ? ' on' : boot ? ' boot' : '')} /> })}
          </div>
          <div className="sfl-legend" style={{ padding: '16px 0 0' }}>
            <span><i style={{ background: ACC_OK, borderRadius: 2 }} />démarré</span>
            <span><i style={{ background: ACC_RUN, borderRadius: 2 }} />démarrage</span>
            <span><i style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 2 }} />arrêté</span>
            <span className="sfl-eta sfl-mono">{cloudOn} / 48 appareils démarrés</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Avis ─────────────────────────────────────────────────────────────────────
function Stars() {
  return <span className="sfl-stars" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <Ico key={i} n="star" s={12} />)}</span>
}

function VoiceNote() {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [pct, setPct] = useState(0)
  const [time, setTime] = useState('0:00')
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {}); else { a.pause(); setPlaying(false) } }
  return (
    <figure className="sfl-card sfl-hov sfl-rv sfl-rev sfl-voice" style={{ ...dl(140), margin: 0 }}>
      <button type="button" className="sfl-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Écouter le message vocal'}><Ico n={playing ? 'pause' : 'play'} s={16} /></button>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <span className="sfl-wave" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => { const seed = Math.abs(Math.sin(i * 2.7) * Math.cos(i * 0.9)); return <i key={i} className={i / 40 <= pct && pct > 0 ? 'p' : ''} style={{ height: (22 + seed * 70) + '%' }} /> })}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--t4)', whiteSpace: 'nowrap', minWidth: 0 }}>
          <span style={{ color: 'var(--t1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>Message vocal d’un client</span>
          <span className="sfl-mono sfl-num" style={{ fontSize: 11.5 }}>{time}</span>
          <span style={{ marginLeft: 'auto' }}>Telegram</span>
        </span>
      </span>
      <audio ref={audio} src="/avis/avis-vocal.ogg" preload="metadata" style={{ display: 'none' }}
        onTimeUpdate={e => { const a = e.currentTarget; if (!a.duration || !isFinite(a.duration)) return; setPct(a.currentTime / a.duration); setTime(`${fmt(a.currentTime)} / ${fmt(a.duration)}`) }}
        onEnded={() => { setPlaying(false); setPct(0); setTime('0:00') }} />
    </figure>
  )
}

function Reviews() {
  return (
    <section id="reviews" className="sfl-sec sfl-bt">
      <div className="sfl-wrap">
        <Head center eyebrow="Social proof" sub="Les messages reçus, tels quels. Rien de réécrit.">Ils font tourner <span className="sfl-dim">ScaleFlow.</span></Head>
        <div className="sfl-revs">
          {REVIEWS.map((r, i) => (
            <figure key={r.name} className="sfl-card sfl-hov sfl-rv sfl-rev" style={dl((i % 3) * 70)}>
              <img src={r.src} alt={r.alt} loading="lazy" decoding="async" />
              <figcaption><Stars /><b>{r.name}</b><span>Telegram · {r.date}</span></figcaption>
            </figure>
          ))}
          <VoiceNote />
        </div>
      </div>
    </section>
  )
}

// ── Tarifs ───────────────────────────────────────────────────────────────────
function Pricing() {
  return (
    <section id="pricing" className="sfl-sec sfl-bt">
      <div className="sfl-wrap">
        <Head center eyebrow="Tarifs" sub="Trois plans qui grandissent avec ton volume. Crédits inclus chaque mois, recharge à la demande.">Un prix, <span className="sfl-dim">zéro friction.</span></Head>
        <div className="sfl-plans">
          {PLANS.map((p, i) => (
            <article key={p.name} className={'sfl-card sfl-rv sfl-plan' + (p.pro ? ' sfl-pro' : '')} style={dl(i * 80)}>
              <div className="sfl-plan-name"><span>{p.name}</span>{p.pro && <span className="sfl-pop">Populaire</span>}</div>
              <div className="sfl-price"><b className="sfl-num">{p.price}</b><span>/mois</span></div>
              <p>{p.desc}</p>
              <ul>{p.items.map(x => <li key={x}><Ico n="check" s={15} />{x}</li>)}</ul>
              <div className="sfl-plan-cta">
                <a href={TG_URL} target="_blank" rel="noreferrer" className={'sfl-btn sfl-btn-block ' + (p.pro ? 'sfl-btn-p' : 'sfl-btn-s')}>{p.cta}</a>
              </div>
            </article>
          ))}
        </div>

        <div className="sfl-card sfl-box sfl-rv">
          <div className="sfl-box-h">
            <div><h3>Packs de crédits</h3><p>Recharge ton solde à la demande, sans changer de plan.</p></div>
          </div>
          <div className="sfl-packs">
            {PACKS.map(pk => (
              <a key={pk.credits} href={TG_URL} target="_blank" rel="noreferrer" className="sfl-pack">
                <b className="sfl-num"><Ico n="coins" s={15} style={{ color: 'var(--amb)' }} />{pk.credits}<small> cr</small></b>
                <span className="sfl-num">{pk.price}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="sfl-card sfl-box sfl-rv">
          <div className="sfl-box-h">
            <div><h3>Les crédits, c'est basé sur quoi ?</h3><p>Tu paies à la publication, pas à l'outil. Le studio vidéo est entièrement gratuit.</p></div>
            <span className="sfl-badge sfl-ok">Même tarif en direct, en masse ou programmé</span>
          </div>
          <div className="sfl-costs">
            {CREDITS.map(c => (
              <div key={c.label} className="sfl-cost">
                <span className="sfl-ico sfl-ico-n" style={{ width: 34, height: 34 }}><Ico n={c.ic} s={16} /></span>
                <span className="sfl-cost-t"><b>{c.label}</b><span>{c.unit}</span></span>
                <span className={'sfl-cost-v sfl-num' + (c.free ? ' sfl-free' : '')}>{c.cost}</span>
              </div>
            ))}
          </div>
          <div className="sfl-example">
            <Ico n="calc" s={16} />
            <span>Concrètement : un mass posting sur <strong>52 comptes</strong> coûte <strong>104 crédits</strong>. Avec le plan Pro et ses 5 500 crédits mensuels, ça fait <strong>52 diffusions complètes par mois</strong>.</span>
          </div>
        </div>
        <p className="sfl-pay">Paiement via Telegram · Crypto ou virement · Activation immédiate</p>
      </div>
    </section>
  )
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="sfl-sec sfl-bt">
      <div className="sfl-wrap sfl-faq">
        <div className="sfl-faq-head">
          <div className="sfl-rv"><span className="sfl-eyebrow">FAQ</span></div>
          <h2 className="sfl-h2 sfl-rv" style={dl(60)}>On répond à <span className="sfl-dim">tout.</span></h2>
          <div className="sfl-rv" style={dl(120)}><a href={TG_URL} target="_blank" rel="noreferrer"><Ico n="send" s={15} />Une autre question ? Écris-nous sur Telegram</a></div>
        </div>
        <div className="sfl-rv" style={dl(100)}>
          {QA.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={i} className={'sfl-qa' + (isOpen ? ' sfl-open' : '')}>
                <button type="button" className="sfl-q" aria-expanded={isOpen} aria-controls={'sfl-a-' + i} id={'sfl-q-' + i} onClick={() => setOpen(isOpen ? null : i)}>
                  {item.q}<Ico n="plus" s={18} />
                </button>
                <div className="sfl-a" id={'sfl-a-' + i} role="region" aria-labelledby={'sfl-q-' + i}><div><p>{item.a}</p></div></div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function SiteLanding({ onStudio }: { onStudio: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const scrolledRef = useRef(false)

  // Révélation au défilement : l'observateur a pour racine le conteneur de défilement de la landing.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = Array.from(root.querySelectorAll<HTMLElement>('.sfl-rv'))
    if (typeof IntersectionObserver === 'undefined') { els.forEach(el => el.classList.add('sfl-in')); return }
    const io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('sfl-in'); io.unobserve(en.target) }
    }, { root, rootMargin: '0px 0px -6% 0px', threshold: 0.01 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const onScroll = () => {
    const s = (rootRef.current?.scrollTop ?? 0) > 8
    if (s !== scrolledRef.current) { scrolledRef.current = s; setScrolled(s) }
  }

  // Ancres internes : défilement doux DANS le conteneur (pas de changement d'URL).
  const onRootClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href') ?? ''
    if (!href.startsWith('#')) return
    e.preventDefault()
    setMenu(false)
    const root = rootRef.current
    if (!root) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth'
    const el = href.length > 1 ? document.getElementById(href.slice(1)) : null
    if (!el || href === '#top') root.scrollTo({ top: 0, behavior })
    else el.scrollIntoView({ behavior, block: 'start' })
  }

  return (
    <div ref={rootRef} className="sfl-root" onScroll={onScroll} onClick={onRootClick}>
      <style>{CSS}</style>

      {/* EN-TÊTE */}
      <header className={'sfl-hdr' + (scrolled || menu ? ' sfl-scrolled' : '')}>
        <div className="sfl-wrap sfl-hdr-in">
          <a href="#top" aria-label="ScaleFlow"><Brand /></a>
          <nav className="sfl-nav" aria-label="Navigation principale">
            {NAV.map(([href, label]) => <a key={href} href={href}>{label}{href === '#cloud' && <span className="sfl-soon">Bientôt</span>}</a>)}
          </nav>
          <div className="sfl-hdr-cta">
            <a href={WIN_URL} className="sfl-btn sfl-btn-s sfl-btn-sm sfl-hdr-dl">Télécharger</a>
            <button type="button" className="sfl-btn sfl-btn-p sfl-btn-sm sfl-hdr-go" onClick={onStudio}>Commencer</button>
            <button type="button" className="sfl-burger" aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menu} aria-controls="sfl-menu" onClick={() => setMenu(m => !m)}><Ico n={menu ? 'close' : 'menu'} s={18} /></button>
          </div>
        </div>
        <div id="sfl-menu" className={'sfl-menu' + (menu ? ' sfl-open' : '')}>
          {NAV.map(([href, label]) => <a key={href} href={href} className="sfl-mlink" tabIndex={menu ? 0 : -1}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{label}{href === '#cloud' && <span className="sfl-soon">Bientôt</span>}</span><Ico n="arrow" s={15} style={{ color: 'var(--t4)' }} /></a>)}
          <div className="sfl-menu-cta">
            <a href={WIN_URL} className="sfl-btn sfl-btn-s" tabIndex={menu ? 0 : -1}><Ico n="download" s={15} />Télécharger</a>
            <button type="button" className="sfl-btn sfl-btn-p" tabIndex={menu ? 0 : -1} onClick={() => { setMenu(false); onStudio() }}>Commencer</button>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section id="top" className="sfl-hero">
          <div className="sfl-hero-bg" aria-hidden="true"><div className="sfl-glow" /><div className="sfl-gridbg" /></div>
          <div className="sfl-wrap sfl-hero-grid">
            <div>
              <div className="sfl-rv"><span className="sfl-pill"><span className="sfl-pulse" /><LiveCount /> posts publiés aujourd'hui</span></div>
              <h1 className="sfl-h1 sfl-rv" style={{ ...dl(70), marginTop: 24 }}><span>Un clic.</span><br /><span>Cent</span> <span>comptes.</span></h1>
              <p className="sfl-hero-sub sfl-rv" style={dl(140)}>Mass posting, programmation, warmup et remix vidéo dans un seul poste de pilotage. Ce qui te prenait la semaine se fait en 5 minutes.</p>
              <div className="sfl-hero-cta sfl-rv" style={dl(210)}>
                <button type="button" className="sfl-btn sfl-btn-p sfl-btn-lg" onClick={onStudio}>Commencer gratuitement<Ico n="arrow" s={16} className="sfl-arr" /></button>
                <a href={WIN_URL} className="sfl-btn sfl-btn-s sfl-btn-lg"><Ico n="download" s={16} />Télécharger</a>
              </div>
              <div className="sfl-trust sfl-rv" style={dl(280)}>
                <span>Propulsé par</span>
                <b>GeeLark</b><i>·</i><b>Instagram</b><i>·</i><b>TikTok</b><i>·</i><b>IA Claude &amp; Groq</b>
              </div>
            </div>
            <div className="sfl-hero-vis sfl-rv" style={dl(200)}>
              <HeroRun />
              <div className="sfl-chip sfl-hero-chip">
                <span className="sfl-ico" style={{ width: 32, height: 32 }}><Ico n="clock" s={16} /></span>
                <span className="sfl-chip-t"><b>15 h</b><span>gagnées / semaine</span></span>
              </div>
            </div>
          </div>
        </section>

        {/* BANDEAU */}
        <div className="sfl-marq" aria-hidden="true">
          <div className="sfl-marq-track">
            {[...MARQUEE, ...MARQUEE].map((x, i) => <span key={i} className="sfl-marq-i"><Ico n={x.ic} s={15} />{x.label}</span>)}
          </div>
        </div>

        <Showcase />
        <Features />

        {/* COMMENT ÇA MARCHE */}
        <section id="how" className="sfl-sec sfl-bt">
          <div className="sfl-wrap">
            <Head eyebrow="Comment ça marche" sub="Connecte ton GeeLark, charge tes vidéos et lance ton premier mass post aujourd'hui.">Trois étapes, <span className="sfl-dim">cinq minutes.</span></Head>
            <div className="sfl-steps">
              {STEPS.map((s, i) => (
                <div key={s.n} className="sfl-card sfl-rv sfl-step" style={dl(i * 90)}>
                  <div className="sfl-step-n"><span className="sfl-ico"><Ico n={s.ic} s={17} /></span><span className="sfl-mono">{s.n}</span></div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <CloudPhones />
        <Reviews />
        <Pricing />
        <Faq />

        {/* CTA FINAL */}
        <section className="sfl-sec" style={{ paddingTop: 24 }}>
          <div className="sfl-wrap">
            <div className="sfl-final sfl-rv">
              <div className="sfl-gridbg" aria-hidden="true" />
              <div style={{ position: 'relative' }}>
                <span className="sfl-eyebrow">C'est le moment</span>
                <h2 className="sfl-h2" style={{ fontSize: 'clamp(32px, 5vw, 54px)' }}>Prêt à <span className="sfl-dim">passer à l'échelle ?</span></h2>
                <p>Connecte ton GeeLark, charge tes vidéos et lance ton premier mass post aujourd'hui — sur <strong>Instagram</strong> comme sur <strong>TikTok</strong>.</p>
                <div className="sfl-hero-cta" style={{ justifyContent: 'center' }}>
                  <button type="button" className="sfl-btn sfl-btn-p sfl-btn-lg" onClick={onStudio}>Commencer gratuitement<Ico n="arrow" s={16} className="sfl-arr" /></button>
                  <a href={WIN_URL} className="sfl-btn sfl-btn-s sfl-btn-lg"><Ico n="download" s={16} />Télécharger</a>
                </div>
                <small>Sans carte bancaire · Windows, Mac &amp; Web · Setup en &lt; 5 min</small>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* PIED DE PAGE */}
      <footer className="sfl-foot sfl-bt">
        <div className="sfl-wrap">
          <div className="sfl-foot-grid">
            <div className="sfl-foot-brand">
              <Brand />
              <p>La plateforme de mass posting Instagram &amp; TikTok pour créateurs, agences et growth hackers.</p>
            </div>
            {FOOT_COLS.map(col => (
              <nav key={col.h} className="sfl-foot-col" aria-label={col.h}>
                <h3>{col.h}</h3>
                {col.links.map(([href, label]) => <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{label}</a>)}
              </nav>
            ))}
          </div>
          <div className="sfl-foot-bot">
            <span>© 2026 ScaleFlow. Tous droits réservés.</span>
            <span className="sfl-fr">Conçu en France<span className="sfl-flag" aria-hidden="true"><i style={{ background: '#2B4BA8' }} /><i style={{ background: '#EDEDEF' }} /><i style={{ background: '#D9414B' }} /></span></span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default SiteLanding
