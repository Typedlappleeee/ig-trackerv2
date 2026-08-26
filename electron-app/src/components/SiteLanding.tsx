import { useEffect, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'

/**
 * SiteLanding — portage fidèle de la maquette Claude Design (_redesign/prototypes/landing.dc.html).
 * Page publique de scaleflow.company. Styles inline autonomes (pas de dépendance aux classes de l'app).
 */

const STG = "'Space Grotesk','Manrope',sans-serif"
const SANS = "'Manrope','Inter',system-ui,sans-serif"
const APP_URL = 'https://scaleflow-fvtu.vercel.app/'
const WIN_URL = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'
const TG_URL = 'https://t.me/justquentin'
const GRAD = 'linear-gradient(135deg,#22D3EE,#818CF8,#A855F7)'

const KEYFRAMES = `
@keyframes vRise{from{opacity:0;transform:translateY(115%) rotate(2.5deg)}to{opacity:1;transform:translateY(0) rotate(0)}}
@keyframes vUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes vFade{from{opacity:0}to{opacity:1}}
@keyframes vGlow{0%,100%{opacity:.55}50%{opacity:.85}}
@keyframes vPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.82)}}
@keyframes vFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes vSweep{0%{transform:translateX(-130%)}100%{transform:translateX(340%)}}
@keyframes vScan{0%{transform:translateY(-100%)}100%{transform:translateY(1500%)}}
@keyframes vRing{0%{transform:scale(.7);opacity:.55}100%{transform:scale(2.1);opacity:0}}
@keyframes vBeam{0%,100%{opacity:.15}50%{opacity:.5}}
@keyframes vMarquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.sfv2-a:hover{color:#F2F0FF !important}
.sfv2-lift{transition:transform .3s ease, box-shadow .3s ease}
.sfv2-lift:hover{transform:translateY(-4px);box-shadow:0 24px 56px -22px rgba(0,0,0,0.65)}
`

const TOTAL = 52
const order: number[] = []
for (let i = 0; i < TOTAL; i++) order.push((i * 17 + 6) % TOTAL)
const RINGS = [{ n: 10, r: 62 }, { n: 16, r: 96 }, { n: 26, r: 130 }]
const seats: { x: number; y: number }[] = []
RINGS.forEach((ring, ri) => {
  for (let k = 0; k < ring.n; k++) {
    const a = (-90 + (k / ring.n) * 360 + ri * 9) * Math.PI / 180
    seats.push({ x: 160 + Math.cos(a) * ring.r, y: 160 + Math.sin(a) * ring.r })
  }
})
const NAMES = ['brand.paris', 'studio.creatif', 'ugc.factory', 'growth.lab', 'viral.fr', 'daily.motiv', 'clip.master', 'fit.life']

const MARQUEE = ['Mass Posting', 'Instagram + TikTok', 'Programmation', 'Auto-Warmup', 'Remix vidéo', 'Captions IA', 'Cloud Phones', 'Stories automatiques', 'Multi-comptes', "Collaboration d'équipe"]

type Feat = { icon: string; title: string; titleColor: string; accent: string; grad: string; text: string; span?: string }
const FEATURES: Feat[] = [
  { icon: '⚡', title: 'Mass Posting', titleColor: '#E9D5FF', accent: '168,85,247', span: 'span 2', grad: 'linear-gradient(135deg,#8B5CF6,#A855F7)', text: 'Publie simultanément sur des dizaines de comptes Instagram ET TikTok. Chaque phone se libère dès que sa publication est terminée.' },
  { icon: '📅', title: 'Programmation', titleColor: '#A5F3FC', accent: '34,211,238', grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', text: "Calendrier visuel, files d'attente par compte, fuseaux horaires et créneaux récurrents." },
  { icon: '✦', title: 'Captions IA', titleColor: '#C7D2FE', accent: '129,140,248', grad: 'linear-gradient(135deg,#818CF8,#A78BFA)', text: 'Génère captions, hashtags et idées de contenu. Propulsé par Claude & Groq.' },
  { icon: '🎞', title: 'Remix & Repurpose vidéo', titleColor: '#FBCFE8', accent: '236,72,153', span: 'span 2', grad: 'linear-gradient(135deg,#F472B6,#EC4899)', text: 'Mixe, recoupe et réinvente tes vidéos. Sous-titres, watermarks et préréglages pour produire en masse.' },
  { icon: '🔥', title: 'Auto-Warmup', titleColor: '#FED7AA', accent: '251,146,60', grad: 'linear-gradient(135deg,#FB923C,#F97316)', text: 'Chauffe tes nouveaux comptes automatiquement : likes, follows à rythme humain. Routines configurables.' },
  { icon: '📱', title: 'Cloud Phones', titleColor: '#A7F3D0', accent: '52,211,153', grad: 'linear-gradient(135deg,#10B981,#059669)', text: 'Pilote tes cloud phones depuis un seul dashboard. Statut en temps réel, IP et sessions isolées.' },
  { icon: '👥', title: "Collaboration d'équipe", titleColor: '#BFDBFE', accent: '96,165,250', grad: 'linear-gradient(135deg,#60A5FA,#3B82F6)', text: 'Invite ton organisation, attribue des rôles (admin, membre, viewer) et restreins les accès.' },
  { icon: '¢', title: 'Crédits à la demande', titleColor: '#FDE68A', accent: '251,191,36', span: 'span 2', grad: 'linear-gradient(135deg,#FBBF24,#F59E0B)', text: "Un solde unique pour l'IA et les automatisations. Recharge à la demande, partagé par organisation." },
]

const STEPS = [
  { n: '01', grad: 'linear-gradient(90deg,#22D3EE,#818CF8)', title: 'Connecte ton GeeLark', text: 'Colle ton bearer token, ScaleFlow détecte tous tes cloud phones et leurs comptes en quelques secondes.' },
  { n: '02', grad: 'linear-gradient(90deg,#818CF8,#C084FC)', title: 'Charge tes vidéos', text: "Importe ta banque de contenu, remixe-la si besoin, et laisse l'IA générer captions et hashtags." },
  { n: '03', grad: 'linear-gradient(90deg,#C084FC,#EC4899)', title: 'Lance la diffusion', text: 'Un clic, et tes posts partent en parallèle sur tous tes comptes. Suis tout en temps réel.' },
]

const REVIEWS = [
  { name: 'Francis', date: '19 juin', src: '/avis/avis-francis.png', glow: 'rgba(34,211,238,0.32)', alt: 'Avis de Francis sur Telegram : très bon CRM, staff réduit de 90 %, très bon service, je recommande.' },
  { name: 'France Killian', date: '19 juin', src: '/avis/avis-france-killian.png', glow: 'rgba(168,85,247,0.35)', alt: 'Avis de France Killian sur Telegram : comptes augmentés de 300 % en réduisant le staff, je recommande à fond.' },
  { name: 'Leon', date: '20 juin', src: '/avis/avis-leon.png', glow: 'rgba(52,211,153,0.3)', alt: 'Avis de Leon sur Telegram : logiciel performant et intuitif, accompagnement irréprochable.' },
  { name: 'Alx', date: '4 juillet', src: '/avis/avis-alx.png', glow: 'rgba(129,140,248,0.32)', alt: "Avis d'Alx sur Telegram : tout est regroupé en une seule app, le meilleur outil GeeLark." },
  { name: 'Njmoss', date: '6 juillet', src: '/avis/avis-njmoss.png', glow: 'rgba(245,158,11,0.3)', alt: 'Avis de Njmoss sur Telegram : logiciel propre, beaucoup de choses automatisées, gain de temps.' },
]

const CREDITS = [
  { icon: '🎬', label: 'Publication', unit: 'par téléphone', cost: '2 cr', accent: '129,140,248', color: '#A5B4FC' },
  { icon: '⚡', label: 'Mass Posting', unit: 'par téléphone', cost: '2 cr', accent: '168,85,247', color: '#D8B4FE' },
  { icon: '🔗', label: 'Story', unit: 'par téléphone', cost: '1 cr', accent: '34,211,238', color: '#67E8F9' },
  { icon: '🎞', label: 'Remix & Spoof', unit: 'par vidéo', cost: 'Gratuit', accent: '52,211,153', color: '#34D399' },
  { icon: '🤖', label: 'Tâche automatique', unit: 'par jour, tâche active', cost: '50 cr', accent: '251,191,36', color: '#FCD34D' },
  { icon: '↻', label: 'Exécution de tâche', unit: 'par téléphone', cost: '2 cr', accent: '251,146,60', color: '#FED7AA' },
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

const SHOTS = [
  { id: 'mass', icon: '⚡', label: 'Mass Posting' },
  { id: 'hub', icon: '🏠', label: 'Tableau de bord' },
  { id: 'bank', icon: '🗂', label: 'Banque de contenu' },
  { id: 'studio', icon: '🎬', label: 'Studio vidéo' },
] as const
type ShotId = typeof SHOTS[number]['id']

const APP_NAV = [
  { id: 'hub', icon: '🏠', label: 'Accueil' },
  { id: 'phones', icon: '📱', label: 'Téléphones' },
  { id: 'bank', icon: '🗂', label: 'Banque' },
  { id: 'mass', icon: '⚡', label: 'Publication' },
  { id: 'sched', icon: '📅', label: 'Automatisation' },
  { id: 'studio', icon: '🎬', label: 'Studio vidéo' },
  { id: 'cloud', icon: '☁️', label: 'Cloud Phones' },
]

const MUT = 'rgba(196,181,253,0.65)'
const MUT2 = 'rgba(148,163,184,0.6)'

function LogoTile({ s }: { s: number }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: s * 0.09, width: s, height: s, borderRadius: s * 0.26, background: 'linear-gradient(145deg,#A855F7,#7C3AED)', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }}>
      <span style={{ width: s * 0.44, height: s * 0.088, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
      <span style={{ width: s * 0.44, height: s * 0.088, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
    </span>
  )
}

/** Radial de diffusion : la vidéo au centre, les comptes en orbite. */
function Radial({ t }: { t: number }) {
  const done = Math.max(0, Math.min(TOTAL, Math.floor(t)))
  const active = t < TOTAL ? Math.floor(t) : -1
  const wave = 20 + (Math.floor(t) % 4) * 34
  return (
    <svg viewBox="0 0 320 320" width="100%" style={{ display: 'block', maxHeight: 286, margin: '0 auto', overflow: 'visible' }}>
      <defs>
        <radialGradient id="sfv2Core">
          <stop offset="0%" stopColor="#818CF8" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#818CF8" stopOpacity={0} />
        </radialGradient>
      </defs>
      {RINGS.map((ring, i) => <circle key={'o' + i} cx={160} cy={160} r={ring.r} fill="none" stroke="#fff" strokeOpacity={0.045} strokeDasharray="2 6" />)}
      <circle cx={160} cy={160} r={74} fill="url(#sfv2Core)" />
      {seats.map((s, i) => {
        const rank = order.indexOf(i)
        const isDone = rank < done, isActive = rank === active
        return <line key={'l' + i} x1={160} y1={160} x2={s.x.toFixed(1)} y2={s.y.toFixed(1)} stroke={isActive ? '#FCD34D' : isDone ? '#34D399' : '#fff'} strokeOpacity={isActive ? 0.75 : isDone ? 0.22 : 0.05} strokeWidth={isActive ? 1.6 : 1} />
      })}
      {seats.map((s, i) => {
        const rank = order.indexOf(i)
        const isDone = rank < done, isActive = rank === active
        const r = isActive ? 6.4 : isDone ? 4.6 : 3.4
        return (
          <g key={'d' + i}>
            {isActive && <circle cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={13} fill="#FCD34D" fillOpacity={0.16} />}
            <circle cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={r} fill={isActive ? '#FCD34D' : isDone ? '#34D399' : 'rgba(255,255,255,0.18)'} stroke={isDone && !isActive ? '#34D399' : 'none'} strokeOpacity={0.4} strokeWidth={4} style={{ transition: 'r .35s cubic-bezier(0.16,1,0.3,1), fill .3s ease' }} />
          </g>
        )
      })}
      <circle cx={160} cy={160} r={wave} fill="none" stroke="#818CF8" strokeWidth={1.4} strokeOpacity={Math.max(0, 0.5 - (Math.floor(t) % 4) * 0.13)} />
      <rect x={143} y={134} width={34} height={52} rx={9} fill="#0D0D22" stroke="#818CF8" strokeWidth={1.6} />
      <path d="M156 152 L168 160 L156 168 Z" fill="#A5B4FC" />
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

function Card({ children, extra }: { children: ReactNode; extra?: CSSProperties }) {
  return <div style={{ borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', padding: 16, ...extra }}>{children}</div>
}
const Lbl = ({ t }: { t: string }) => <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.55)' }}>{t}</div>
const Kpi = ({ t, v, c }: { t: string; v: string; c?: string }) => <Card><Lbl t={t} /><div style={{ marginTop: 9, fontFamily: STG, fontSize: 23, fontWeight: 700, color: c || '#F2F0FF' }}>{v}</div></Card>

function AppBody({ shot, t }: { shot: ShotId; t: number }) {
  const done = Math.max(0, Math.min(TOTAL, Math.floor(t)))
  if (shot === 'hub') {
    return (
      <>
        <div style={{ fontFamily: STG, fontSize: 20, fontWeight: 700 }}>Bonjour, Quentin</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <Kpi t="Téléphones" v="52" /><Kpi t="Vidéos" v="347" /><Kpi t="Posts · 7j" v="1 284" c="#34D399" /><Kpi t="Crédits" v="2 480" c="#FBBF24" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
          <Card extra={{ height: '100%', boxSizing: 'border-box' }}><Lbl t="Posts à venir" />{[['24 comptes · Morning routine', '18:00'], ['18 comptes · Story + lien', '21:00'], ['Warmup · groupe Nouveaux', 'demain']].map((r, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 11, fontSize: 11.5 }}><span style={{ color: 'rgba(226,222,255,0.85)', fontWeight: 700 }}>{r[0]}</span><span style={{ color: MUT2, fontWeight: 700 }}>{r[1]}</span></div>)}</Card>
          <Card extra={{ height: '100%', boxSizing: 'border-box' }}><Lbl t="Activité récente" />{[['52/52 · Mass posting', '#34D399'], ['22/24 · Story', '#FCD34D'], ['36/36 · TikTok', '#34D399']].map((r, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 11, fontSize: 11.5 }}><span style={{ color: 'rgba(226,222,255,0.85)', fontWeight: 700 }}>{r[0]}</span><span style={{ color: r[1], fontWeight: 800 }}>✓</span></div>)}</Card>
        </div>
      </>
    )
  }
  if (shot === 'bank') {
    const HUES = ['129,140,248', '34,211,238', '168,85,247', '236,72,153', '52,211,153', '251,191,36']
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontFamily: STG, fontSize: 18, fontWeight: 700 }}>Banque de contenu</span><span style={{ padding: '3px 10px', borderRadius: 99, background: 'rgba(139,92,246,0.16)', color: '#C4B5FD', fontSize: 10.5, fontWeight: 800 }}>347 vidéos</span></div>
        <div style={{ display: 'flex', gap: 7 }}>{['Motivation', 'Lifestyle', 'Produits'].map((f, i) => <span key={f} style={{ padding: '5px 12px', borderRadius: 99, background: i === 0 ? 'rgba(34,211,238,0.12)' : 'transparent', border: '1px solid ' + (i === 0 ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.1)'), color: i === 0 ? '#67E8F9' : MUT, fontSize: 10.5, fontWeight: 700 }}>📁 {f}</span>)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 9 }}>{Array.from({ length: 12 }, (_, i) => { const h = HUES[i % HUES.length], sel = i < 2; return <div key={i} style={{ aspectRatio: '9/16', borderRadius: 10, border: '2px solid ' + (sel ? '#818CF8' : 'rgba(255,255,255,0.07)'), background: `repeating-linear-gradient(45deg, rgba(${h},0.14), rgba(${h},0.14) 7px, rgba(${h},0.04) 7px, rgba(${h},0.04) 14px)` }} /> })}</div>
      </>
    )
  }
  if (shot === 'studio') {
    const TOOLS = [
      { i: '🎞', t: 'Remix', d: '×24 variantes uniques', g: 'linear-gradient(135deg,#6366F1,#8B5CF6)' },
      { i: '🛡', t: 'Spoof', d: 'device · GPS · EXIF', g: 'linear-gradient(135deg,#8B5CF6,#6366F1)' },
      { i: '💬', t: 'Sous-titres', d: 'IA Whisper mot à mot', g: 'linear-gradient(135deg,#818CF8,#A78BFA)' },
      { i: '🎚', t: 'Mixer', d: 'hook incrusté', g: 'linear-gradient(135deg,#8B5CF6,#A78BFA)' },
    ]
    return (
      <>
        <div style={{ fontFamily: STG, fontSize: 18, fontWeight: 700 }}>Studio vidéo</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>{TOOLS.map(t => <Card key={t.t} extra={{ height: '100%', boxSizing: 'border-box' }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 11, background: t.g, fontSize: 16 }}>{t.i}</span><div style={{ marginTop: 11, fontFamily: STG, fontSize: 14.5, fontWeight: 700 }}>{t.t}</div><div style={{ marginTop: 4, fontSize: 11, color: MUT, fontWeight: 600 }}>{t.d}</div></Card>)}</div>
      </>
    )
  }
  // mass (default)
  const lines = appLog(t)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><span style={{ fontFamily: STG, fontSize: 18, fontWeight: 700 }}>Nouveau mass posting</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 99, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399', fontSize: 10.5, fontWeight: 800 }}>52 phones en ligne</span></div>
      <div style={{ display: 'flex', gap: 6, fontSize: 10.5, fontWeight: 700 }}>{['① Comptes', '② Vidéos', '③ Légende', '④ Lancement'].map((s, i) => <span key={s} style={{ padding: '5px 11px', borderRadius: 99, background: i === 0 ? 'rgba(139,92,246,0.16)' : 'transparent', border: '1px solid ' + (i === 0 ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.09)'), color: i === 0 ? '#E9D5FF' : 'rgba(196,181,253,0.55)' }}>{s}</span>)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>{lines.map(l => <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 11, background: l.ok ? 'rgba(255,255,255,0.02)' : 'rgba(139,92,246,0.06)', border: '1px solid ' + (l.ok ? 'rgba(255,255,255,0.07)' : 'rgba(139,92,246,0.28)'), fontSize: 12 }}><span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#E9D5FF' }}>{l.phone}</span><span style={{ color: MUT, flex: 1 }}>@{l.name}</span><span style={{ color: l.ok ? '#34D399' : '#FCD34D', fontWeight: 800, fontSize: 10.5 }}>{l.ok ? '● publié' : '● en cours'}</span></div>)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><div style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)' }}><div style={{ height: '100%', width: (done / TOTAL) * 100 + '%', borderRadius: 99, background: 'linear-gradient(90deg,#22D3EE,#818CF8,#A855F7)' }} /></div><span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#A5B4FC' }}>{done}/{TOTAL}</span></div>
      <div style={{ padding: 12, borderRadius: 11, textAlign: 'center', background: GRAD, color: '#0A0A16', fontSize: 12.5, fontWeight: 800 }}>⚡ Lancer la diffusion</div>
    </>
  )
}

function VoiceNote() {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [pct, setPct] = useState(0)
  const [time, setTime] = useState('0:00')
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {}); else { a.pause(); setPlaying(false) } }
  return (
    <figure className="sfv2-lift" style={{ gridColumn: '1 / -1', margin: 0, display: 'flex', alignItems: 'center', gap: 18, padding: '20px 22px', borderRadius: 20, background: 'linear-gradient(120deg, rgba(52,211,153,0.09), rgba(255,255,255,0.03))', border: '1px solid rgba(52,211,153,0.28)' }}>
      <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Écouter le message vocal'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, flexShrink: 0, borderRadius: 99, border: 'none', cursor: 'pointer', color: '#04140C', fontSize: 17, background: 'linear-gradient(135deg,#34D399,#10B981)', boxShadow: '0 0 30px -8px rgba(52,211,153,0.8)' }}>{playing ? '❚❚' : '▶'}</button>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 30 }}>{Array.from({ length: 56 }, (_, i) => { const seed = Math.abs(Math.sin(i * 2.7) * Math.cos(i * 0.9)); return <span key={i} style={{ flex: 1, height: (22 + seed * 68) + '%', borderRadius: 99, background: i / 56 <= pct ? '#34D399' : 'rgba(255,255,255,0.16)', transition: 'background .15s linear' }} /> })}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontWeight: 700, color: MUT2 }}><span style={{ color: 'rgba(226,222,255,0.88)', fontWeight: 800, fontSize: 12.5 }}>Message vocal d’un client</span><span style={{ fontFamily: 'monospace' }}>{time}</span><span style={{ marginLeft: 'auto' }}>Telegram</span></span>
      </span>
      <audio ref={audio} src="/avis/avis-vocal.ogg" preload="metadata" style={{ display: 'none' }}
        onTimeUpdate={e => { const a = e.currentTarget; if (!a.duration || !isFinite(a.duration)) return; setPct(a.currentTime / a.duration); setTime(`${fmt(a.currentTime)} / ${fmt(a.duration)}`) }}
        onEnded={() => { setPlaying(false); setPct(0); setTime('0:00') }} />
    </figure>
  )
}

export function SiteLanding({ onStudio }: { onStudio: () => void }) {
  const [t, setT] = useState(0)
  const [live, setLive] = useState(18342)
  const [shot, setShot] = useState<ShotId>('mass')
  const [open, setOpen] = useState<number | null>(0)
  const [joined, setJoined] = useState(false)
  const [wait, setWait] = useState(8)

  useEffect(() => {
    const id = setInterval(() => {
      setT(v => (v + 1) % 58)
      setLive(v => v + Math.floor(2 + Math.random() * 5))
    }, 650)
    return () => clearInterval(id)
  }, [])

  const done = Math.max(0, Math.min(TOTAL, Math.floor(t)))
  const remain = Math.max(0, TOTAL - done)
  const activeNav = shot === 'hub' ? 'hub' : shot === 'bank' ? 'bank' : shot === 'studio' ? 'studio' : 'mass'
  const shotLabel = (SHOTS.find(s => s.id === shot) || SHOTS[0]).label

  // Ferme cloud : 48 tuiles
  const CTOT = 48
  const cphase = Math.floor(t * 1.6) % (CTOT + 10)
  const cloudOn = Math.max(0, Math.min(CTOT, cphase - 2))

  return (
    <div style={{ position: 'relative', background: '#06060E', color: '#F2F0FF', fontFamily: SANS, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{KEYFRAMES}</style>

      {/* Aura de fond */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: -300, left: '50%', marginLeft: -520, width: 1040, height: 720, borderRadius: '99em', filter: 'blur(125px)', background: 'radial-gradient(ellipse, rgba(124,58,237,0.20) 0%, transparent 70%)', animation: 'vGlow 9s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '32%', right: -220, width: 660, height: 660, borderRadius: '99em', filter: 'blur(130px)', background: 'radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 70%)', animation: 'vGlow 11s ease-in-out infinite', animationDelay: '-4s' }} />
        <div style={{ position: 'absolute', bottom: '6%', left: -200, width: 600, height: 600, borderRadius: '99em', filter: 'blur(130px)', background: 'radial-gradient(circle, rgba(236,72,153,0.09) 0%, transparent 70%)', animation: 'vGlow 13s ease-in-out infinite', animationDelay: '-7s' }} />
      </div>

      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(6,6,14,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <nav style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '17px 32px' }}>
          <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
            <LogoTile s={34} />
            <span style={{ fontFamily: STG, fontSize: 21, letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}><span style={{ fontWeight: 500, color: 'rgba(242,240,255,0.92)' }}>Scale</span><span style={{ fontWeight: 700, color: '#fff' }}>Flow</span></span>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 26, fontSize: 13.5, fontWeight: 600 }}>
            <a className="sfv2-a" href="#showcase" style={{ color: MUT, textDecoration: 'none' }}>L'app</a>
            <a className="sfv2-a" href="#cloud" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: MUT, textDecoration: 'none' }}>Cloud Phones <span style={{ padding: '2px 7px', borderRadius: 99, background: 'rgba(34,211,238,0.14)', border: '1px solid rgba(34,211,238,0.35)', color: '#67E8F9', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em' }}>SOON</span></a>
            <a className="sfv2-a" href="#features" style={{ color: MUT, textDecoration: 'none' }}>Fonctionnalités</a>
            <a className="sfv2-a" href="#pricing" style={{ color: MUT, textDecoration: 'none' }}>Tarifs</a>
            <a className="sfv2-a" href="#faq" style={{ color: MUT, textDecoration: 'none' }}>FAQ</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href={WIN_URL} style={{ padding: '9px 17px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.14)', fontSize: 12.5, fontWeight: 700, color: '#F2F0FF', textDecoration: 'none' }}>Télécharger</a>
            <button onClick={onStudio} style={{ padding: '10px 19px', borderRadius: 99, background: GRAD, color: '#0A0A16', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 0 28px -8px rgba(129,140,248,0.75)' }}>Commencer →</button>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section id="top" style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto', padding: '60px 32px 92px', display: 'grid', gridTemplateColumns: '1.02fr 0.98fr', gap: 56, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '7px 8px 7px 14px', borderRadius: 99, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.07)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#34D399', animation: 'vPulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#C4B5FD' }}>{live.toLocaleString('fr-FR')} posts publiés aujourd'hui</span>
            <span style={{ padding: '3px 9px', borderRadius: 99, background: 'rgba(52,211,153,0.14)', color: '#34D399', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em' }}>LIVE</span>
          </div>
          <h1 style={{ margin: '28px 0 0', fontFamily: STG, fontSize: 80, lineHeight: 0.95, fontWeight: 700, letterSpacing: '-0.045em' }}>
            <span style={{ display: 'block' }}>Un clic.</span>
            <span style={{ display: 'block' }}>Cent</span>
            <span style={{ display: 'block', background: 'linear-gradient(94deg,#22D3EE,#818CF8 45%,#C084FC)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>comptes.</span>
          </h1>
          <p style={{ margin: '26px 0 0', maxWidth: 440, fontSize: 17, lineHeight: 1.65, color: 'rgba(196,181,253,0.7)' }}>Mass posting, programmation, warmup et remix vidéo dans un seul poste de pilotage. Ce qui te prenait la semaine se fait en 5 minutes.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 32 }}>
            <button onClick={onStudio} style={{ position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 9, padding: '17px 32px', borderRadius: 99, background: GRAD, color: '#0A0A16', fontSize: 15, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 0 46px -10px rgba(129,140,248,0.85)' }}>Commencer gratuitement →<span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 40, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)', animation: 'vSweep 3.4s ease-in-out infinite' }} /></button>
            <a href={WIN_URL} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '17px 30px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.03)', color: '#F2F0FF', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>↓ Télécharger</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px', marginTop: 34, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 12.5, fontWeight: 600, color: MUT2 }}>
            <span>Propulsé par</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#E7E0F5', fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: 99, background: '#34D399' }} />GeeLark</span>
            <span style={{ opacity: 0.4 }}>·</span><span style={{ color: '#E7E0F5', fontWeight: 700 }}>Instagram</span>
            <span style={{ opacity: 0.4 }}>·</span><span style={{ color: '#E7E0F5', fontWeight: 700 }}>TikTok</span>
            <span style={{ opacity: 0.4 }}>·</span><span style={{ color: '#E7E0F5', fontWeight: 700 }}>IA Claude &amp; Groq</span>
          </div>
        </div>

        {/* Dashboard live */}
        <div style={{ position: 'relative' }}>
          <div aria-hidden style={{ position: 'absolute', inset: -40, borderRadius: 40, filter: 'blur(70px)', background: 'radial-gradient(circle at 50% 40%, rgba(129,140,248,0.28), transparent 70%)', animation: 'vGlow 6s ease-in-out infinite' }} />
          <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: 'rgba(9,9,22,0.9)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 50px 120px -40px rgba(124,58,237,0.55), inset 0 1px 0 rgba(255,255,255,0.07)', backdropFilter: 'blur(18px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 99, background: '#FF5F57' }} /><span style={{ width: 9, height: 9, borderRadius: 99, background: '#FEBC2E' }} /><span style={{ width: 9, height: 9, borderRadius: 99, background: '#28C840' }} /></span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(148,163,184,0.55)' }}>Mass Posting · reel_042.mp4</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 99, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399', fontSize: 10.5, fontWeight: 800 }}><span style={{ width: 5, height: 5, borderRadius: 99, background: '#34D399', animation: 'vPulse 1.6s ease-in-out infinite' }} />EN DIRECT</span>
            </div>
            <div style={{ padding: '20px 20px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: STG, fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em', background: 'linear-gradient(94deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', fontVariantNumeric: 'tabular-nums' }}>{done} / {TOTAL}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: MUT2 }}>comptes publiés</span>
              </div>
              <div style={{ marginTop: 12, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}><div style={{ height: '100%', width: (done / TOTAL) * 100 + '%', borderRadius: 99, background: 'linear-gradient(90deg,#22D3EE,#818CF8,#A855F7)', transition: 'width 0.35s linear' }} /></div>
            </div>
            <div style={{ position: 'relative', padding: '2px 20px 20px' }}>
              <Radial t={t} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, fontSize: 10.5, fontWeight: 700, color: 'rgba(148,163,184,0.55)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: '#34D399' }} />publié</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: '#FCD34D' }} />en cours</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: 'rgba(255,255,255,0.18)' }} />en file</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'monospace', color: 'rgba(196,181,253,0.7)' }}>{remain > 0 ? '~' + Math.ceil(remain * 0.9) + ' s restantes' : 'diffusion terminée'}</span>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px 20px 18px', background: 'rgba(0,0,0,0.25)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.5, minHeight: 66 }}>{appLog(t).map(l => <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center', opacity: l.ok ? 0.65 : 1 }}><span style={{ color: 'rgba(148,163,184,0.5)', minWidth: 62 }}>{l.phone}</span><span style={{ color: 'rgba(196,181,253,0.7)', flex: 1 }}>@{l.name}</span><span style={{ color: l.ok ? '#34D399' : '#FCD34D', fontWeight: 700 }}>{l.ok ? '✓ publié' : '↑ upload…'}</span></div>)}</div>
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: -26, left: -32, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 16, background: 'rgba(12,12,28,0.95)', border: '1px solid rgba(139,92,246,0.35)', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)', animation: 'vFloat 7s ease-in-out infinite' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 11, background: 'linear-gradient(135deg,#F59E0B,#EF4444)', fontSize: 15 }}>⏱</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}><span style={{ fontFamily: STG, fontSize: 17, fontWeight: 700 }}>15 h</span><span style={{ fontSize: 10.5, fontWeight: 700, color: MUT2 }}>gagnées / semaine</span></span>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.012)', padding: '18px 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: 'max-content', whiteSpace: 'nowrap', animation: 'vMarquee 34s linear infinite' }}>
          {[...MARQUEE, ...MARQUEE].map((x, i) => <span key={i} style={{ display: 'flex', alignItems: 'center' }}><span style={{ fontFamily: STG, fontSize: 13.5, fontWeight: 600, color: 'rgba(196,181,253,0.6)' }}>{x}</span><span style={{ margin: '0 24px', width: 5, height: 5, borderRadius: 99, background: 'linear-gradient(135deg,#5EEAD4,#818CF8)', display: 'inline-block' }} /></span>)}
        </div>
      </div>

      {/* SHOWCASE */}
      <section id="showcase" style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto', padding: '110px 32px 40px' }}>
        <div style={{ maxWidth: 660 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>L'app</span>
          <h2 style={{ margin: '16px 0 0', fontFamily: STG, fontSize: 48, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.035em' }}>Le poste de pilotage.</h2>
          <p style={{ margin: '18px 0 0', fontSize: 16.5, lineHeight: 1.65, color: 'rgba(196,181,253,0.68)' }}>Tout ce qu'il te faut pour gérer une ferme de comptes, dans une seule fenêtre. Windows, Mac et web.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 30, flexWrap: 'wrap' }}>
          {SHOTS.map(s => { const on = shot === s.id; return <button key={s.id} onClick={() => setShot(s.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 20px', borderRadius: 13, border: '1px solid ' + (on ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.1)'), background: on ? 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(34,211,238,0.10))' : 'rgba(255,255,255,0.03)', color: on ? '#E9D5FF' : MUT, fontFamily: SANS, fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'all 0.25s ease' }}>{s.icon} {s.label}</button> })}
        </div>
        <div style={{ position: 'relative', marginTop: 22 }}>
          <div aria-hidden style={{ position: 'absolute', inset: '-30px -10px', borderRadius: 36, filter: 'blur(70px)', background: 'linear-gradient(120deg, rgba(94,234,212,0.16), rgba(129,140,248,0.24), rgba(192,132,252,0.16))', animation: 'vGlow 7s ease-in-out infinite' }} />
          <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.11)', background: 'rgba(9,9,22,0.9)', boxShadow: '0 50px 120px -40px rgba(124,58,237,0.5), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 99, background: '#FF5F57' }} /><span style={{ width: 9, height: 9, borderRadius: 99, background: '#FEBC2E' }} /><span style={{ width: 9, height: 9, borderRadius: 99, background: '#28C840' }} /></span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(148,163,184,0.55)' }}>ScaleFlow — {shotLabel}</span>
            </div>
            <div style={{ display: 'flex', minHeight: 440 }}>
              <div style={{ width: 206, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)', padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {APP_NAV.map(n => { const on = n.id === activeNav; return <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 10, background: on ? 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(34,211,238,0.10))' : 'transparent', border: '1px solid ' + (on ? 'rgba(139,92,246,0.35)' : 'transparent'), color: on ? '#E9D5FF' : MUT, fontSize: 12.5, fontWeight: on ? 800 : 600 }}>{n.icon} {n.label}</div> })}
                <div style={{ marginTop: 'auto', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 10, color: MUT2, fontWeight: 700 }}>Crédits restants</div>
                  <div style={{ fontFamily: STG, fontSize: 16, fontWeight: 700, marginTop: 2, background: 'linear-gradient(90deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>107 150</div>
                  <div style={{ marginTop: 8, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)' }}><div style={{ height: '100%', width: '72%', borderRadius: 99, background: GRAD }} /></div>
                </div>
              </div>
              <div style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}><AppBody shot={shot} t={t} /></div>
            </div>
          </div>
        </div>
      </section>

      {/* CLOUD PHONES — TEASER */}
      <section id="cloud" style={{ position: 'relative', zIndex: 1, marginTop: 100, padding: '110px 32px 120px', overflow: 'hidden', borderTop: '1px solid rgba(34,211,238,0.18)', borderBottom: '1px solid rgba(34,211,238,0.18)', background: 'radial-gradient(ellipse 90% 100% at 50% 0%, rgba(34,211,238,0.07), transparent 70%), #05050C' }}>
        {[0, -1.3, -2.6].map((d, i) => <div key={i} aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', width: 520, height: 520, margin: '-260px 0 0 -260px', borderRadius: '99em', border: `1px solid ${['rgba(34,211,238,0.3)', 'rgba(129,140,248,0.25)', 'rgba(168,85,247,0.2)'][i]}`, animation: 'vRing 4s ease-out infinite', animationDelay: d + 's' }} />)}
        <div style={{ position: 'relative', maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 9px 8px 16px', borderRadius: 99, border: '1px solid rgba(34,211,238,0.4)', background: 'rgba(34,211,238,0.08)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: '#22D3EE', animation: 'vPulse 1.8s ease-in-out infinite' }} />
            <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', color: '#67E8F9' }}>EN CONSTRUCTION</span>
            <span style={{ padding: '3px 10px', borderRadius: 99, background: 'rgba(34,211,238,0.18)', color: '#A5F3FC', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em' }}>Q4 2026</span>
          </div>
          <h2 style={{ margin: '28px auto 0', maxWidth: 840, fontFamily: STG, fontSize: 64, lineHeight: 1, fontWeight: 700, letterSpacing: '-0.045em' }}>Nos propres <span style={{ background: 'linear-gradient(94deg,#22D3EE,#67E8F9 40%,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Cloud Phones</span> arrivent.</h2>
          <p style={{ margin: '26px auto 0', maxWidth: 620, fontSize: 17.5, lineHeight: 1.7, color: 'rgba(196,181,253,0.72)' }}>Fini de payer GeeLark. ScaleFlow héberge ses propres appareils Android : tu crées un phone en un clic, il démarre en quelques secondes, et tu n'as plus aucune limite de comptes.</p>

          {/* Téléphone en lévitation */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: 60 }}>
            <div aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', width: 640, height: 340, margin: '-170px 0 0 -320px', borderRadius: '99em', filter: 'blur(90px)', background: 'radial-gradient(ellipse, rgba(34,211,238,0.3), transparent 70%)', animation: 'vGlow 5s ease-in-out infinite' }} />
            <div aria-hidden style={{ position: 'absolute', bottom: -30, left: '50%', width: 300, height: 36, marginLeft: -150, borderRadius: '99em', filter: 'blur(28px)', background: 'rgba(34,211,238,0.28)', animation: 'vBeam 5s ease-in-out infinite' }} />
            <div style={{ position: 'relative', width: 268, animation: 'vFloat 8s ease-in-out infinite' }}>
              <div style={{ position: 'relative', borderRadius: 42, padding: 11, background: 'linear-gradient(160deg, rgba(34,211,238,0.55), rgba(129,140,248,0.35) 45%, rgba(6,6,14,0.9))', boxShadow: '0 60px 120px -40px rgba(34,211,238,0.45), 0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 0 rgba(255,255,255,0.22)' }}>
                <div style={{ position: 'relative', borderRadius: 32, overflow: 'hidden', background: '#07070F', border: '1px solid rgba(255,255,255,0.08)', aspectRatio: '9/19', display: 'flex', flexDirection: 'column' }}>
                  <span aria-hidden style={{ position: 'absolute', top: 11, left: '50%', marginLeft: -30, width: 60, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.14)', zIndex: 2 }} />
                  <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, height: 120, zIndex: 1, background: 'linear-gradient(180deg, transparent, rgba(34,211,238,0.10), transparent)', animation: 'vScan 3.6s linear infinite' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 18px 0', fontFamily: 'monospace', fontSize: 9.5, fontWeight: 700, color: 'rgba(196,181,253,0.65)' }}><span>09:41</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: '#34D399' }}>●</span>4G ▮▮▮</span></div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, padding: '20px 16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><LogoTile s={30} /><span style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}><span style={{ fontFamily: STG, fontSize: 11.5, fontWeight: 700 }}>sf-cloud-07</span><span style={{ fontSize: 9, fontWeight: 700, color: '#34D399' }}>● démarré · Android 14</span></span></div>
                    <div style={{ padding: 11, borderRadius: 12, background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.24)', textAlign: 'left' }}><div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUT2 }}>Tâche en cours</div><div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#E7E0F5' }}>Publication Reels</div><div style={{ marginTop: 9, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}><div style={{ height: '100%', width: (done / TOTAL) * 100 + '%', borderRadius: 99, background: 'linear-gradient(90deg,#22D3EE,#818CF8)', transition: 'width .35s linear' }} /></div></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ padding: 10, borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'left' }}><div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.55)' }}>Proxy</div><div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 9.5, fontWeight: 700, color: '#67E8F9' }}>FR-07</div></div>
                      <div style={{ padding: 10, borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'left' }}><div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.55)' }}>Boot</div><div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 9.5, fontWeight: 700, color: '#34D399' }}>3,2 s</div></div>
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 5, padding: 10, borderRadius: 11, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'monospace', fontSize: 8.5, lineHeight: 1.5, textAlign: 'left', color: MUT }}><span>adb · connected</span><span>ig · session ok</span><span style={{ color: '#34D399' }}>upload · {done} / {TOTAL}</span></div>
                  </div>
                </div>
              </div>
              <div style={{ position: 'absolute', top: 52, left: -186, display: 'flex', alignItems: 'center', gap: 9, padding: '11px 15px', borderRadius: 14, background: 'rgba(10,10,26,0.95)', border: '1px solid rgba(34,211,238,0.35)', boxShadow: '0 20px 50px -18px rgba(0,0,0,0.8)', animation: 'vFloat 6s ease-in-out infinite' }}><span style={{ fontSize: 14 }}>⚡</span><span style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}><span style={{ fontFamily: STG, fontSize: 14, fontWeight: 700, color: '#67E8F9' }}>3,2 s</span><span style={{ fontSize: 9.5, fontWeight: 700, color: MUT2 }}>au démarrage</span></span></div>
              <div style={{ position: 'absolute', bottom: 96, right: -186, display: 'flex', alignItems: 'center', gap: 9, padding: '11px 15px', borderRadius: 14, background: 'rgba(10,10,26,0.95)', border: '1px solid rgba(139,92,246,0.35)', boxShadow: '0 20px 50px -18px rgba(0,0,0,0.8)', animation: 'vFloat 7.5s ease-in-out infinite', animationDelay: '-2s' }}><span style={{ fontSize: 14 }}>∞</span><span style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}><span style={{ fontFamily: STG, fontSize: 14, fontWeight: 700, color: '#C4B5FD' }}>Illimité</span><span style={{ fontSize: 9.5, fontWeight: 700, color: MUT2 }}>appareils par serveur</span></span></div>
              <div style={{ position: 'absolute', top: 196, right: -186, display: 'flex', alignItems: 'center', gap: 9, padding: '11px 15px', borderRadius: 14, background: 'rgba(10,10,26,0.95)', border: '1px solid rgba(52,211,153,0.35)', boxShadow: '0 20px 50px -18px rgba(0,0,0,0.8)', animation: 'vFloat 9s ease-in-out infinite', animationDelay: '-4s' }}><span style={{ fontSize: 14 }}>🔒</span><span style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}><span style={{ fontFamily: STG, fontSize: 14, fontWeight: 700, color: '#A7F3D0' }}>Tes données</span><span style={{ fontSize: 9.5, fontWeight: 700, color: MUT2 }}>sur ton serveur</span></span></div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 70, textAlign: 'left' }}>
            {[
              { i: '⚡', g: 'linear-gradient(135deg,#06B6D4,#3B82F6)', a: '34,211,238', t: 'Démarrage instantané', d: 'Un appareil prêt en quelques secondes, pas en minutes. Ta diffusion part sans attendre le boot.' },
              { i: '∞', g: 'linear-gradient(135deg,#8B5CF6,#6366F1)', a: '139,92,246', t: 'Aucune limite', d: "Autant d'appareils que ton serveur peut en tenir. Plus de quota imposé par un tiers." },
              { i: '🔒', g: 'linear-gradient(135deg,#10B981,#059669)', a: '52,211,153', t: 'Chez toi', d: "Tes sessions, tes proxies, tes données. L'agent tourne sur ton propre serveur." },
            ].map(c => <div key={c.t} style={{ padding: 26, borderRadius: 20, background: `linear-gradient(160deg, rgba(${c.a},0.09), rgba(255,255,255,0.015))`, border: `1px solid rgba(${c.a},0.28)` }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 13, background: c.g, fontSize: 19 }}>{c.i}</span><h3 style={{ margin: '16px 0 0', fontFamily: STG, fontSize: 17, fontWeight: 700 }}>{c.t}</h3><p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: MUT }}>{c.d}</p></div>)}
          </div>

          {/* Aperçu de la ferme */}
          <div style={{ position: 'relative', marginTop: 44, padding: 26, borderRadius: 22, background: 'rgba(9,9,22,0.85)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 100px -40px rgba(34,211,238,0.35)', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontFamily: STG, fontSize: 15, fontWeight: 700 }}>Ta ferme, en un écran</span><span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(148,163,184,0.55)' }}>CPU 34 % · RAM 11,2 / 32 Go · latence 18 ms</span></span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 99, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399', fontSize: 11, fontWeight: 800 }}><span style={{ width: 5, height: 5, borderRadius: 99, background: '#34D399', animation: 'vPulse 1.8s ease-in-out infinite' }} />agent connecté</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16,1fr)', gap: 6, marginTop: 20 }}>{Array.from({ length: CTOT }, (_, i) => { const rank = (i * 11 + 3) % CTOT; const on = rank < cphase - 2, boot = rank >= cphase - 2 && rank < cphase; return <div key={i} style={{ aspectRatio: '9 / 15', borderRadius: 4, background: on ? 'rgba(52,211,153,0.2)' : boot ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (on ? 'rgba(52,211,153,0.5)' : boot ? 'rgba(34,211,238,0.7)' : 'rgba(255,255,255,0.06)'), boxShadow: boot ? '0 0 12px 1px rgba(34,211,238,0.6)' : 'none', transform: boot ? 'scale(1.15)' : 'scale(1)', transition: 'all .35s cubic-bezier(0.16,1,0.3,1)' }} /> })}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 18, fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.5)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: '#34D399' }} />démarré</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: '#22D3EE' }} />démarrage</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'rgba(255,255,255,0.09)' }} />arrêté</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'monospace', color: 'rgba(103,232,249,0.8)' }}>{cloudOn} / 48 appareils démarrés</span>
            </div>
          </div>

          {/* Waitlist */}
          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            {!joined ? (
              <button onClick={() => { setJoined(true); setWait(w => w + 1) }} style={{ position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '18px 36px', borderRadius: 99, border: 'none', background: 'linear-gradient(135deg,#22D3EE,#67E8F9,#818CF8)', color: '#04141A', fontFamily: SANS, fontSize: 15.5, fontWeight: 800, cursor: 'pointer', boxShadow: '0 0 52px -10px rgba(34,211,238,0.85)' }}>Rejoindre la liste d'attente<span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 44, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)', animation: 'vSweep 3s ease-in-out infinite' }} /></button>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '18px 36px', borderRadius: 99, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.4)', color: '#34D399', fontSize: 15.5, fontWeight: 800 }}>✓ Tu es sur la liste — on te prévient au lancement</span>
            )}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(148,163,184,0.55)' }}>{wait} agences déjà inscrites · accès prioritaire</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(148,163,184,0.4)' }}>Les premières inscrites testent avant tout le monde.</span>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto', padding: '110px 32px 60px' }}>
        <div style={{ maxWidth: 660, margin: '0 auto', textAlign: 'center' }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Tout pour scaler</span>
          <h2 style={{ margin: '16px 0 0', fontFamily: STG, fontSize: 48, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.035em' }}>Une seule app, <span style={{ background: 'linear-gradient(90deg,#818CF8,#C084FC,#EC4899)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout dedans.</span></h2>
          <p style={{ margin: '18px auto 0', fontSize: 16.5, lineHeight: 1.65, color: 'rgba(196,181,253,0.68)' }}>Fini de jongler entre dix outils. Publication, automatisation et production de contenu au même endroit.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 52 }}>
          {FEATURES.map(f => <div key={f.title} className="sfv2-lift" style={{ gridColumn: f.span || 'span 1', display: 'flex', flexDirection: 'column', gap: 11, padding: 28, borderRadius: 20, background: f.span ? `linear-gradient(160deg, rgba(${f.accent},0.10), rgba(255,255,255,0.015))` : 'rgba(255,255,255,0.025)', border: `1px solid ${f.span ? `rgba(${f.accent},0.28)` : 'rgba(255,255,255,0.09)'}` }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 13, background: f.grad, fontSize: 19 }}>{f.icon}</span><h3 style={{ margin: '6px 0 0', fontFamily: STG, fontSize: 17.5, fontWeight: 700, color: f.titleColor }}>{f.title}</h3><p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'rgba(196,181,253,0.68)' }}>{f.text}</p></div>)}
        </div>
      </section>

      {/* HOW */}
      <section id="how" style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto', padding: '60px 32px 110px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {STEPS.map(s => <div key={s.n} style={{ padding: 28, borderRadius: 20, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.09)' }}><div style={{ fontFamily: STG, fontSize: 15, fontWeight: 700, background: s.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.n}</div><h3 style={{ margin: '14px 0 0', fontFamily: STG, fontSize: 18, fontWeight: 700 }}>{s.title}</h3><p style={{ margin: '11px 0 0', fontSize: 13.5, lineHeight: 1.65, color: 'rgba(196,181,253,0.68)' }}>{s.text}</p></div>)}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ position: 'relative', zIndex: 1, padding: '100px 32px', background: 'rgba(124,58,237,0.04)', borderTop: '1px solid rgba(139,92,246,0.18)', borderBottom: '1px solid rgba(139,92,246,0.18)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Social proof</span>
            <h2 style={{ margin: '16px 0 0', fontFamily: STG, fontSize: 48, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.035em' }}>Ils font tourner <span style={{ background: 'linear-gradient(90deg,#818CF8,#C084FC,#EC4899)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ScaleFlow.</span></h2>
            <p style={{ margin: '18px auto 0', fontSize: 16.5, lineHeight: 1.65, color: 'rgba(196,181,253,0.68)' }}>Les messages reçus, tels quels. Rien de réécrit.</p>
          </div>
          <div style={{ marginTop: 52, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20, alignItems: 'start' }}>
            {REVIEWS.map(r => <figure key={r.name} className="sfv2-lift" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: 16, borderRadius: 20, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.1)' }}><img src={r.src} alt={r.alt} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 12 }} /><figcaption style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px 4px', whiteSpace: 'nowrap' }}><span style={{ color: '#FBBF24', fontSize: 12, letterSpacing: '1.5px' }}>★★★★★</span><span style={{ fontSize: 12.5, fontWeight: 800, color: 'rgba(226,222,255,0.88)' }}>{r.name}</span><span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.5)' }}>Telegram · {r.date}</span></figcaption></figure>)}
            <VoiceNote />
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto', padding: '110px 32px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Tarifs</span>
          <h2 style={{ margin: '16px 0 0', fontFamily: STG, fontSize: 48, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.035em' }}>Un prix, <span style={{ background: 'linear-gradient(90deg,#818CF8,#C084FC,#EC4899)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>zéro friction.</span></h2>
          <p style={{ margin: '18px auto 0', fontSize: 16.5, lineHeight: 1.65, color: 'rgba(196,181,253,0.68)' }}>Trois plans qui grandissent avec ton volume. Crédits inclus chaque mois, recharge à la demande.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginTop: 56, alignItems: 'stretch' }}>
          {/* Standard */}
          <article style={{ display: 'flex', flexDirection: 'column', borderRadius: 22, padding: 32, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.26em', textTransform: 'uppercase', color: '#5EEAD4' }}>Standard</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 18 }}><span style={{ fontFamily: STG, fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em' }}>49,99$</span><span style={{ fontSize: 14, color: MUT, fontWeight: 600 }}>/mois</span></div>
            <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.65, color: 'rgba(196,181,253,0.7)' }}>Pour démarrer sérieusement ta première ferme de comptes.</p>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '24px 0' }} />
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 13, fontSize: 14, fontWeight: 600 }}>{['2 500 crédits / mois', '50 phones max', 'Toutes les fonctionnalités', 'Mass Posting 10 comptes max', 'Support 24/7'].map(x => <li key={x} style={{ display: 'flex', gap: 10 }}><span style={{ color: '#5EEAD4', fontWeight: 800 }}>✓</span>{x}</li>)}</ul>
            <a href={TG_URL} target="_blank" rel="noreferrer" style={{ marginTop: 'auto', paddingTop: 28, textDecoration: 'none' }}><span style={{ display: 'block', textAlign: 'center', padding: 14, borderRadius: 99, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.04)', color: '#F2F0FF', fontSize: 14, fontWeight: 800 }}>Choisir Standard</span></a>
          </article>
          {/* Pro */}
          <article style={{ position: 'relative', display: 'flex', flexDirection: 'column', borderRadius: 22, padding: 2, background: GRAD, boxShadow: '0 34px 90px -22px rgba(124,58,237,0.6)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderRadius: 20, padding: 32, background: '#0A0A1C' }}>
              <span style={{ position: 'absolute', top: 24, right: 24, padding: '5px 13px', borderRadius: 99, background: 'linear-gradient(120deg,#67E8F9,#A5B4FC,#D8B4FE)', color: '#08060F', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Populaire</span>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.26em', textTransform: 'uppercase', color: '#818CF8' }}>Pro</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 18 }}><span style={{ fontFamily: STG, fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em' }}>99,99$</span><span style={{ fontSize: 14, color: MUT, fontWeight: 600 }}>/mois</span></div>
              <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.65, color: 'rgba(196,181,253,0.7)' }}>Le sweet spot des agences et growth hackers qui scalent.</p>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '24px 0' }} />
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 13, fontSize: 14, fontWeight: 600 }}>{['5 500 crédits / mois', '200 phones max', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7'].map(x => <li key={x} style={{ display: 'flex', gap: 10 }}><span style={{ color: '#818CF8', fontWeight: 800 }}>✓</span>{x}</li>)}</ul>
              <a href={TG_URL} target="_blank" rel="noreferrer" style={{ marginTop: 'auto', paddingTop: 28, textDecoration: 'none' }}><span style={{ position: 'relative', overflow: 'hidden', display: 'block', textAlign: 'center', padding: 14, borderRadius: 99, background: GRAD, color: '#0A0A16', fontSize: 14, fontWeight: 800, boxShadow: '0 0 34px -8px rgba(129,140,248,0.85)' }}>Choisir Pro<span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 38, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)', animation: 'vSweep 3.6s ease-in-out infinite' }} /></span></a>
            </div>
          </article>
          {/* Organisation */}
          <article style={{ display: 'flex', flexDirection: 'column', borderRadius: 22, padding: 32, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.26em', textTransform: 'uppercase', color: '#C084FC' }}>Organisation</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 18 }}><span style={{ fontFamily: STG, fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em' }}>149,99$</span><span style={{ fontSize: 14, color: MUT, fontWeight: 600 }}>/mois</span></div>
            <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.65, color: 'rgba(196,181,253,0.7)' }}>Pour les structures qui pilotent des centaines de comptes.</p>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '24px 0' }} />
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 13, fontSize: 14, fontWeight: 600 }}>{['11 000 crédits / mois', 'Phones illimités', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7 prioritaire', "Proposition d'ajouts avec les devs"].map(x => <li key={x} style={{ display: 'flex', gap: 10 }}><span style={{ color: '#C084FC', fontWeight: 800 }}>✓</span>{x}</li>)}</ul>
            <a href={TG_URL} target="_blank" rel="noreferrer" style={{ marginTop: 'auto', paddingTop: 28, textDecoration: 'none' }}><span style={{ display: 'block', textAlign: 'center', padding: 14, borderRadius: 99, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.04)', color: '#F2F0FF', fontSize: 14, fontWeight: 800 }}>Choisir Organisation</span></a>
          </article>
        </div>

        {/* Packs de crédits */}
        <div style={{ marginTop: 36, borderRadius: 22, padding: 28, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><h3 style={{ margin: 0, fontFamily: STG, fontSize: 17, fontWeight: 700, color: '#FDE68A' }}>Packs de crédits</h3><p style={{ margin: 0, fontSize: 13, color: MUT, fontWeight: 600 }}>Recharge ton solde à la demande, sans changer de plan.</p></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>{PACKS.map(pk => <a key={pk.credits} href={TG_URL} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.02)', textDecoration: 'none' }}><span style={{ fontFamily: STG, fontSize: 19, fontWeight: 700, color: '#F2F0FF' }}>{pk.credits}<span style={{ fontSize: 10, color: MUT2 }}> cr</span></span><span style={{ fontSize: 13, fontWeight: 800, background: 'linear-gradient(90deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{pk.price}</span></a>)}</div>
        </div>

        {/* Crédits basés sur quoi */}
        <div style={{ marginTop: 18, borderRadius: 22, padding: 28, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><h3 style={{ margin: 0, fontFamily: STG, fontSize: 17, fontWeight: 700 }}>Les crédits, c'est basé sur quoi ?</h3><p style={{ margin: 0, fontSize: 13, color: MUT, fontWeight: 600 }}>Tu paies à la publication, pas à l'outil. Le studio vidéo est entièrement gratuit.</p></div>
            <span style={{ padding: '6px 13px', borderRadius: 99, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399', fontSize: 11, fontWeight: 800 }}>Même tarif en direct, en masse ou programmé</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 22 }}>{CREDITS.map(c => <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 17px', borderRadius: 14, background: `linear-gradient(160deg, rgba(${c.accent},0.08), rgba(255,255,255,0.015))`, border: `1px solid rgba(${c.accent},0.25)` }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,0.05)', fontSize: 15, flexShrink: 0 }}>{c.icon}</span><span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 13, fontWeight: 800, color: '#F2F0FF' }}>{c.label}</span><span style={{ fontSize: 11, fontWeight: 600, color: MUT2 }}>{c.unit}</span></span><span style={{ marginLeft: 'auto', fontFamily: STG, fontSize: 16, fontWeight: 700, color: c.color, whiteSpace: 'nowrap' }}>{c.cost}</span></div>)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20, padding: '15px 18px', borderRadius: 14, background: 'rgba(129,140,248,0.07)', border: '1px solid rgba(129,140,248,0.25)' }}><span style={{ fontSize: 15 }}>🧮</span><span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.6, color: 'rgba(226,222,255,0.8)', fontWeight: 600 }}>Concrètement : un mass posting sur <strong style={{ color: '#F2F0FF' }}>52 comptes</strong> coûte <strong style={{ color: '#A5B4FC' }}>104 crédits</strong>. Avec le plan Pro et ses 5 500 crédits mensuels, ça fait <strong style={{ color: '#F2F0FF' }}>52 diffusions complètes par mois</strong>.</span></div>
        </div>
        <p style={{ textAlign: 'center', margin: '30px 0 0', fontSize: 13, fontWeight: 600, color: MUT2 }}>Paiement via Telegram · Crypto ou virement · Activation immédiate</p>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto', padding: '20px 32px 110px' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FAQ</span>
          <h2 style={{ margin: '16px 0 0', fontFamily: STG, fontSize: 48, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.035em' }}>On répond à <span style={{ background: 'linear-gradient(90deg,#818CF8,#C084FC,#EC4899)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tout.</span></h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 44 }}>
          {QA.map((item, i) => { const isOpen = open === i; return (
            <div key={i} style={{ borderRadius: 16, overflow: 'hidden', background: isOpen ? 'linear-gradient(160deg, rgba(129,140,248,0.10), rgba(255,255,255,0.02))' : 'rgba(255,255,255,0.03)', border: `1px solid ${isOpen ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.09)'}`, transition: 'background 0.3s ease, border-color 0.3s ease' }}>
              <button onClick={() => setOpen(isOpen ? null : i)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%', padding: '19px 22px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: SANS, fontSize: 15, fontWeight: 800, color: '#F2F0FF' }}>{item.q}<span style={{ flexShrink: 0, width: 27, height: 27, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 99, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', fontSize: 15, fontWeight: 700, color: isOpen ? '#818CF8' : MUT, transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease, color 0.3s ease' }}>+</span></button>
              <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.3s ease' }}><div style={{ overflow: 'hidden' }}><p style={{ margin: 0, padding: '0 22px 19px', fontSize: 14, lineHeight: 1.7, color: 'rgba(196,181,253,0.75)' }}>{item.a}</p></div></div>
            </div>
          ) })}
        </div>
      </section>

      {/* FOOTER + CTA final */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '104px 32px 44px' }}>
          <div style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', background: 'linear-gradient(90deg,#22D3EE,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>C'est le moment</span>
            <h2 style={{ margin: '18px 0 0', fontFamily: STG, fontSize: 56, lineHeight: 1.02, fontWeight: 700, letterSpacing: '-0.04em' }}>Prêt à <span style={{ background: 'linear-gradient(90deg,#818CF8,#C084FC,#EC4899)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>passer à l'échelle ?</span></h2>
            <p style={{ margin: '22px auto 0', maxWidth: 540, fontSize: 16.5, lineHeight: 1.7, color: 'rgba(196,181,253,0.7)' }}>Connecte ton GeeLark, charge tes vidéos et lance ton premier mass post aujourd'hui — sur <strong style={{ color: '#F2F0FF' }}>Instagram</strong> comme sur <strong style={{ color: '#F2F0FF' }}>TikTok</strong>.</p>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 38 }}>
              <button onClick={onStudio} style={{ position: 'relative', overflow: 'hidden', display: 'inline-flex', padding: '17px 34px', borderRadius: 99, background: GRAD, color: '#0A0A16', fontSize: 15, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 0 46px -10px rgba(129,140,248,0.85)' }}>Commencer gratuitement →<span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 40, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)', animation: 'vSweep 3.4s ease-in-out infinite' }} /></button>
              <a href={WIN_URL} style={{ display: 'inline-flex', padding: '17px 32px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.03)', color: '#F2F0FF', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>↓ Télécharger</a>
            </div>
            <p style={{ margin: '26px 0 0', fontSize: 12, color: 'rgba(148,163,184,0.55)', fontWeight: 600 }}>Sans carte bancaire · Windows, Mac &amp; Web · Setup en &lt; 5 min</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginTop: 92, paddingTop: 48, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><LogoTile s={32} /><span style={{ fontFamily: STG, fontSize: 19, fontWeight: 600, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}><span style={{ color: '#fff' }}>scale</span><span style={{ color: '#A855F7' }}>flow</span></span></div>
              <p style={{ margin: 0, maxWidth: 320, fontSize: 13.5, lineHeight: 1.7, color: MUT }}>La plateforme de mass posting Instagram &amp; TikTok pour créateurs, agences et growth hackers.</p>
            </div>
            {[
              { h: 'Produit', links: [['#showcase', "L'app"], ['#cloud', 'Cloud Phones'], ['#features', 'Fonctionnalités'], ['#pricing', 'Tarifs']] },
              { h: 'Ressources', links: [['#faq', 'Questions fréquentes'], ['#how', 'Comment ça marche'], [APP_URL, "Ouvrir l'app"]] },
              { h: 'Légal', links: [[APP_URL, "Conditions d'utilisation"], [APP_URL, 'Confidentialité'], [TG_URL, 'Contact']] },
            ].map(col => (
              <nav key={col.h} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#F2F0FF' }}>{col.h}</h3>
                {col.links.map(([href, label]) => <a key={label} className="sfv2-a" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ fontSize: 13.5, color: MUT, fontWeight: 600, textDecoration: 'none' }}>{label}</a>)}
              </nav>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 56, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(148,163,184,0.55)', fontWeight: 600 }}>
            <span>© 2026 ScaleFlow. Tous droits réservés.</span>
            <span>Conçu en France 🇫🇷</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
