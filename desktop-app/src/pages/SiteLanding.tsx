import { useEffect, useRef, useState } from 'react'
import type { ReactNode, CSSProperties, MouseEvent as ReactMouseEvent } from 'react'

/**
 * SiteLanding — page publique de scaleflow.company (affichée avant connexion).
 *
 * index.html fige html/body/#root à 100 % de hauteur avec overflow:hidden (shell de l'app) :
 * la landing est donc SON PROPRE conteneur de défilement (.sfl-root, 100dvh, overflow-y:auto),
 * et les ancres (#features, #pricing…) défilent en douceur à l'intérieur de ce conteneur.
 * Même DA que l'app : noir, violet ScaleFlow, titres XXL en capitales.
 * Photos : public/site/c1…c13.webp (Unsplash, licence libre). Styles : bloc <style> préfixé « sfl- ».
 */

const WIN_URL = 'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'
const TG_URL = 'https://t.me/justquentin'
const APP_URL = './index.html?auth=login'
const N_PHOTOS = 13
const photo = (n: number) => `/site/c${(((n % N_PHOTOS) + N_PHOTOS) % N_PHOTOS) + 1}.webp`
const HANDLES = ['lea.daily', 'manon.off', 'ines.paris', 'jade.xo', 'chloe.fit', 'emma.vibes', 'lou.officiel', 'sarah.ugc', 'nina.club', 'zoe.mood', 'ashley.rose', 'mila.studio', 'luna.reels']
const handle = (n: number) => HANDLES[(((n % HANDLES.length) + HANDLES.length) % HANDLES.length)]
const dl = (ms: number) => ({ '--d': ms + 'ms' } as CSSProperties)

// ── Icônes (trait 1.8, style Lucide) ─────────────────────────────────────────
const P = {
  arrow: 'M5 12h14|M13 6l6 6-6 6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3',
  check: 'M20 6L9 17l-5-5',
  play: 'M6 4l14 8-14 8V4z',
  pause: 'M7 4h3v16H7z|M14 4h3v16h-3z',
  link: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1',
  menu: 'M4 7h16|M4 12h16|M4 17h16',
  close: 'M18 6L6 18|M6 6l12 12',
  plus: 'M12 5v14|M5 12h14',
  star: 'M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.2L2 10l7.1-1.1z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
} as const
function Ico({ d, s = 16, sw = 1.9, style }: { d: string; s?: number; sw?: number; style?: CSSProperties }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

function LogoTile({ s }: { s: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: s * 0.09, width: s, height: s, borderRadius: s * 0.27, background: '#7462E8', flexShrink: 0 }}>
      <span style={{ width: s * 0.44, height: s * 0.088, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
      <span style={{ width: s * 0.44, height: s * 0.088, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
    </span>
  )
}
const Brand = () => <span className="sfl-brand"><LogoTile s={26} /><span>ScaleFlow</span></span>

// ── Données (alignées sur l'app : tarifs, coûts, fonctionnalités réelles) ──────
const NAV: [string, string][] = [['#live', 'Le produit'], ['#features', 'Fonctionnalités'], ['#pricing', 'Tarifs'], ['#faq', 'FAQ']]
const MARQUEE = ['Mass Posting', 'Stories avec lien', 'Veille Reels', 'Studio vidéo', 'Programmation', 'Warmup', 'Flow Builder', 'Liens trackés', 'Instagram', 'TikTok']
const STEPS: [string, string, string][] = [
  ['01', 'Connecte GeeLark', 'Colle ton token : ScaleFlow importe tous tes cloud phones et leurs comptes en quelques secondes.'],
  ['02', 'Charge ton contenu', 'Importe tes vidéos dans la banque, ou génère des dizaines de variantes uniques avec le Studio.'],
  ['03', 'Lance la diffusion', 'Un clic : chaque compte publie en parallèle. Tu suis tout en direct, et tu relances les échecs en 1 clic.'],
]
const REVIEWS = [
  { name: 'Francis', date: '19 juin', src: '/avis/avis-francis.png', alt: 'Avis de Francis sur Telegram : très bon CRM, staff réduit de 90 %, très bon service, je recommande.' },
  { name: 'France Killian', date: '19 juin', src: '/avis/avis-france-killian.png', alt: 'Avis de France Killian sur Telegram : comptes augmentés de 300 % en réduisant le staff, je recommande à fond.' },
  { name: 'Leon', date: '20 juin', src: '/avis/avis-leon.png', alt: 'Avis de Leon sur Telegram : logiciel performant et intuitif, accompagnement irréprochable.' },
  { name: 'Alx', date: '4 juillet', src: '/avis/avis-alx.png', alt: "Avis d'Alx sur Telegram : tout est regroupé en une seule app, le meilleur outil GeeLark." },
  { name: 'Njmoss', date: '6 juillet', src: '/avis/avis-njmoss.png', alt: 'Avis de Njmoss sur Telegram : logiciel propre, beaucoup de choses automatisées, gain de temps.' },
]
const PLANS = [
  { name: 'Standard', price: '49,99', tag: 'Pour lancer ta première ferme de comptes.', credits: '2 500', items: ['50 téléphones', 'Mass Posting · 10 comptes', '5 Go de banque', 'Toutes les fonctionnalités', 'Support 24/7'] },
  { name: 'Pro', price: '99,99', tag: 'Le choix des agences qui scalent.', credits: '5 500', best: true, items: ['200 téléphones', 'Mass Posting illimité', '15 Go de banque', 'Organisation multi-membres', 'Auto-warmup', 'Support 24/7'] },
  { name: 'Organisation', price: '149,99', tag: 'Pour piloter des centaines de comptes.', credits: '11 000', items: ['Téléphones illimités', 'Mass Posting illimité', '50 Go de banque', 'Organisation multi-membres', 'Support prioritaire', 'Accès direct aux devs'] },
]
const COSTS: [string, string, string][] = [
  ['Reel / post', '2', 'crédits par téléphone'], ['Story', '1', 'crédit par téléphone'],
  ['Tâche automatique', '50', 'crédits / jour + 2 par téléphone'], ['Studio vidéo', '0', 'remix, spoof, montage'],
]
const PACKS: [string, string][] = [['500', '19,99'], ['1 200', '39,99'], ['2 500', '74,99'], ['6 000', '164,99'], ['15 000', '374,99']]
const QA: [string, string][] = [
  ["C'est quoi ScaleFlow exactement ?", 'Le poste de pilotage de tes comptes Instagram et TikTok : publier sur des dizaines de cloud phones en parallèle, programmer, chauffer les comptes, gérer ta banque de vidéos et repérer les Reels qui explosent.'],
  ["J'ai besoin de quoi pour l'utiliser ?", "Un compte GeeLark (cloud phones) et ton token API. ScaleFlow tourne sur Windows ou directement dans le navigateur."],
  ['Ça marche aussi pour TikTok ?', 'Oui. La publication en masse et la programmation gèrent Instagram et TikTok depuis le même tableau de bord.'],
  ['Mes posts partent même PC éteint ?', 'Oui : les publications programmées et les tâches automatiques tournent sur nos serveurs, ordinateur éteint.'],
  ['Combien coûte une publication ?', 'Un Reel ou un post coûte 2 crédits par téléphone (même tarif en direct, en masse ou programmé). Une story coûte 1 crédit. Les outils du Studio vidéo sont gratuits.'],
  ["C'est risqué pour mes comptes ?", "Chaque cloud phone a sa propre IP et sa session isolée, et le warmup suit un rythme humain. Aucune méthode n'est sans risque, mais tu gardes la main sur le rythme."],
  ['Comment je m’abonne ?', 'Contacte-nous sur Telegram : on te donne une clé d’activation à coller dans Réglages → Licence & crédits. Ton offre est active tout de suite.'],
]
const FOOT_COLS: { h: string; links: [string, string][] }[] = [
  { h: 'Produit', links: [['#live', 'Le produit'], ['#features', 'Fonctionnalités'], ['#pricing', 'Tarifs']] },
  { h: 'Ressources', links: [['#faq', 'Questions fréquentes'], ['#how', 'Comment ça marche'], [APP_URL, "Ouvrir l'app"]] },
  { h: 'Contact', links: [[TG_URL, 'Telegram'], [WIN_URL, 'Télécharger pour Windows']] },
]

// ── Éléments visuels ─────────────────────────────────────────────────────────
// Statut animé en CSS pur (pas de re-rendu) : en attente → publication → publié, en boucle.
function StatusCycle({ delay }: { delay: number }) {
  const st = { animationDelay: `${-delay}s` }
  return (
    <span className="sfl-st">
      <span className="sfl-st-i sfl-st-a" style={st}>En attente</span>
      <span className="sfl-st-i sfl-st-b" style={st}><i className="sfl-spin" />Publication…</span>
      <span className="sfl-st-i sfl-st-c" style={st}><Ico d={P.check} s={11} sw={3} />Publié</span>
    </span>
  )
}
function Phone({ n, delay = 0, status = true, className, style }: { n: number; delay?: number; status?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div className={'sfl-ph' + (className ? ' ' + className : '')} style={style}>
      <img src={photo(n)} alt="" loading="lazy" decoding="async" />
      <span className="sfl-ph-shade" />
      <span className="sfl-ph-top"><span className="sfl-ph-notch" /></span>
      {status && <span className="sfl-ph-chip"><StatusCycle delay={delay} /></span>}
      <span className="sfl-ph-side"><Ico d={P.heart} s={15} /><Ico d={P.send} s={15} /></span>
      <span className="sfl-ph-bot">
        <span className="sfl-ph-user"><i style={{ backgroundImage: `url(${photo(n + 5)})` }} />@{handle(n)}</span>
        <span className="sfl-ph-cap" /><span className="sfl-ph-cap sfl-ph-cap2" />
      </span>
    </div>
  )
}

// Mur de téléphones du hero : colonnes qui défilent en sens alternés, en perspective.
function PhoneWall({ cols = 7, per = 5, seed = 0 }: { cols?: number; per?: number; seed?: number }) {
  return (
    <div className="sfl-wall" aria-hidden="true">
      <div className="sfl-wall-in">
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className={'sfl-col ' + (c % 2 ? 'sfl-col-dn' : 'sfl-col-up')} style={{ animationDuration: `${46 + (c % 3) * 9}s` }}>
            {[0, 1].map(dup => Array.from({ length: per }, (_, i) => {
              const n = seed + c * 3 + i * 2
              return <Phone key={`${dup}-${i}`} n={n} delay={((c * 1.7 + i * 2.3) % 6)} />
            }))}
          </div>
        ))}
      </div>
    </div>
  )
}

function useInView<T extends HTMLElement>(margin = '0px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') { setV(true); return }
    const io = new IntersectionObserver(([e]) => setV(!!e?.isIntersecting), { rootMargin: margin })
    io.observe(el); return () => io.disconnect()
  }, [margin])
  return [ref, v]
}

// ── Section « run en direct » : 24 comptes publient, en vrai dans l'app ───────
const RUN_N = 24, RUN_PAR = 6
function LiveRun() {
  const [ref, inView] = useInView<HTMLDivElement>('100px')
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!inView) return
    const id = window.setInterval(() => setT(v => (v + 1) % (RUN_N + 10)), 420)
    return () => window.clearInterval(id)
  }, [inView])
  const done = Math.min(RUN_N, t)
  const log = Array.from({ length: Math.min(done, 4) }, (_, i) => done - 1 - i)
  return (
    <div ref={ref} className="sfl-run">
      <div className="sfl-run-head">
        <span className="sfl-run-live"><i />Run en cours</span>
        <span className="sfl-mono sfl-num sfl-run-count"><b>{done}</b> / {RUN_N} publiés</span>
      </div>
      <div className="sfl-run-bar"><i style={{ width: `${(done / RUN_N) * 100}%` }} /></div>
      <div className="sfl-run-grid">
        {Array.from({ length: RUN_N }, (_, i) => {
          const st = i < done ? 'ok' : i < done + RUN_PAR ? 'run' : 'idle'
          return (
            <div key={i} className={'sfl-tile sfl-tile-' + st}>
              <img src={photo(i * 5 + 1)} alt="" loading="lazy" decoding="async" />
              <span className="sfl-tile-badge">{st === 'ok' ? <Ico d={P.check} s={12} sw={3} /> : st === 'run' ? <i className="sfl-spin" /> : null}</span>
            </div>
          )
        })}
      </div>
      <div className="sfl-run-log sfl-mono">
        {log.length === 0 ? <span className="sfl-dimtxt">Démarrage des téléphones…</span> : log.map(i => (
          <span key={i} style={{ opacity: 1 - (done - 1 - i) * 0.22 }}><b>✓</b> @{handle(i * 5 + 1)} · Reel publié</span>
        ))}
      </div>
    </div>
  )
}

// ── Visuels des fonctionnalités ──────────────────────────────────────────────
function VizMass() {
  return (
    <div className="sfl-viz-mass">
      {[0, 1, 2, 3, 4].map(i => <Phone key={i} n={i * 2 + 3} delay={i * 1.3} className="sfl-fan" style={{ '--i': i - 2 } as CSSProperties} />)}
    </div>
  )
}
function VizStory() {
  return (
    <div className="sfl-viz-center">
      <div className="sfl-ph sfl-ph-lg">
        <img src={photo(7)} alt="" loading="lazy" decoding="async" />
        <span className="sfl-ph-shade" />
        <span className="sfl-story-bars"><i /><i /><i /></span>
        <span className="sfl-sticker"><Ico d={P.link} s={14} sw={2.4} />MON LIEN</span>
      </div>
    </div>
  )
}
function VizViral() {
  return (
    <div className="sfl-viz-viral">
      {[['1,6 M', '×24', 2], ['1,2 M', '×12', 9], ['880 k', '×8,9', 11]].map(([v, x, n], i) => (
        <div key={i} className="sfl-reel" style={{ '--i': i } as CSSProperties}>
          <img src={photo(n as number)} alt="" loading="lazy" decoding="async" />
          <span className="sfl-ph-shade" />
          <span className="sfl-reel-rank sfl-mono">{String(i + 1).padStart(2, '0')}</span>
          <span className="sfl-reel-x">🔥 {x}</span>
          <span className="sfl-reel-v"><b>{v}</b>vues</span>
        </div>
      ))}
    </div>
  )
}
function VizStudio() {
  return (
    <div className="sfl-viz-studio">
      <div className="sfl-src"><img src={photo(0)} alt="" loading="lazy" decoding="async" /><span>Source</span></div>
      <span className="sfl-flow"><Ico d={P.arrow} s={18} /></span>
      <div className="sfl-vars">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="sfl-var" style={{ '--i': i } as CSSProperties}>
            <img src={photo(0)} alt="" loading="lazy" decoding="async" style={{ filter: `brightness(${0.86 + (i % 3) * 0.08}) saturate(${0.9 + (i % 2) * 0.25}) hue-rotate(${(i - 2) * 4}deg)`, transform: `scale(${1.05 + (i % 3) * 0.06}) translate(${(i % 2 ? 1 : -1) * 3}%, ${(i % 3 - 1) * 2}%)${i % 4 === 1 ? ' scaleX(-1)' : ''}` }} />
            <span className="sfl-var-cap">{['POV : ton crush t’écrit', 'Personne ne sait que…', 'Ma routine du matin', 'Tu ne devineras jamais', 'Le secret c’est ça', 'Regarde jusqu’à la fin'][i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
function VizSched() {
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  return (
    <div className="sfl-viz-cal">
      {days.map((d, i) => <span key={i} className="sfl-cal-h">{d}</span>)}
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className={'sfl-cal-d' + (i === 9 ? ' sfl-cal-now' : '')}>
          <small>{i + 6}</small>
          {i % 3 !== 2 && <i className="sfl-cal-p">{['09:00', '12:30', '18:00', '21:15'][i % 4]}</i>}
          {i % 4 === 0 && <i className="sfl-cal-p sfl-cal-p2">Story</i>}
        </span>
      ))}
    </div>
  )
}
function VizFlow() {
  return (
    <div className="sfl-viz-flow">
      {['Warmup 20 min', 'Reel', 'Pause 2 h', 'Story + lien'].map((b, i) => (
        <span key={b} style={{ display: 'contents' }}>
          {i > 0 && <span className="sfl-flow-l" />}
          <span className="sfl-flow-b" style={{ '--i': i } as CSSProperties}><span className="sfl-mono">{String(i + 1).padStart(2, '0')}</span>{b}</span>
        </span>
      ))}
    </div>
  )
}
function VizWarm() {
  return (
    <div className="sfl-viz-warm">
      {[3, 8, 12].map((n, i) => (
        <div key={n} className="sfl-warm-row" style={{ '--i': i } as CSSProperties}>
          <i style={{ backgroundImage: `url(${photo(n)})` }} />
          <span className="sfl-warm-t">@{handle(n)}</span>
          <span className="sfl-warm-c"><Ico d={P.check} s={10} sw={3} />Bio</span>
          <span className="sfl-warm-c"><Ico d={P.check} s={10} sw={3} />Photo</span>
          <span className="sfl-warm-c sfl-warm-run"><i className="sfl-spin" />Chauffe</span>
        </div>
      ))}
    </div>
  )
}
function VizLinks() {
  const h = [38, 56, 44, 72, 60, 88, 70, 96, 82, 64, 90, 100]
  return (
    <div className="sfl-viz-links">
      <span className="sfl-link-pill"><Ico d={P.link} s={13} sw={2.2} />tapmylink.fr/lea</span>
      <div className="sfl-bars">{h.map((v, i) => <i key={i} style={{ height: `${v}%`, '--i': i } as CSSProperties} />)}</div>
    </div>
  )
}

type Feat = { k: string; title: ReactNode; text: string; viz: ReactNode; size: 'xl' | 'l' | 'm' }
const FEATURES: Feat[] = [
  { k: 'Mass Posting', size: 'xl', viz: <VizMass />, title: <>Un Reel. <span>Cent comptes.</span></>, text: 'Publie sur des dizaines de comptes Instagram ou TikTok en parallèle. Chaque téléphone se libère dès que son post est parti.' },
  { k: 'Stories', size: 'm', viz: <VizStory />, title: <>Stories <span>avec lien.</span></>, text: 'Image, sticker lien propre à chaque compte et texte : posté en automatique.' },
  { k: 'Veille Reels', size: 'm', viz: <VizViral />, title: <>Ce qui <span>explose.</span></>, text: 'Les Reels viraux des comptes de référence, classés par vues. FR et US.' },
  { k: 'Studio vidéo', size: 'l', viz: <VizStudio />, title: <>Une vidéo, <span>des dizaines de variantes.</span></>, text: 'Auto-contenu : légende, coupe, vitesse, spoof. Chaque compte reçoit une vidéo unique. Gratuit.' },
  { k: 'Programmation', size: 'm', viz: <VizSched />, title: <>PC éteint, <span>ça poste.</span></>, text: 'Calendrier visuel. Tes posts et stories partent à l’heure depuis nos serveurs.' },
  { k: 'Flow Builder', size: 'm', viz: <VizFlow />, title: <>Tes routines <span>en blocs.</span></>, text: 'Enchaîne warmup, Reels, stories et pauses. Lance la séquence sur tous tes comptes.' },
  { k: 'Warmup', size: 'm', viz: <VizWarm />, title: <>Chauffe <span>et édite.</span></>, text: 'Warmup à rythme humain, bio, photo et pseudo modifiés en masse, vérifiés à l’écran.' },
  { k: 'Liens', size: 'm', viz: <VizLinks />, title: <>Chaque clic <span>compté.</span></>, text: 'Pages de liens et liens trackés par compte : tu sais quel compte rapporte.' },
]

function Features() {
  return (
    <section id="features" className="sfl-sec">
      <div className="sfl-wrap">
        <Head kicker="Fonctionnalités" l1="Tout pour scaler." l2="Rien de superflu." sub="Chaque outil dont une ferme de comptes a besoin, dans une seule app." />
        <div className="sfl-bento">
          {FEATURES.map((f, i) => (
            <article key={f.k} className={'sfl-feat sfl-rv sfl-feat-' + f.size} style={dl((i % 3) * 80)}>
              <div className="sfl-feat-viz">{f.viz}</div>
              <div className="sfl-feat-txt">
                <span className="sfl-kick">● {f.k}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Head({ kicker, l1, l2, sub, center }: { kicker: string; l1: ReactNode; l2?: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={'sfl-head sfl-rv' + (center ? ' sfl-c' : '')}>
      <span className="sfl-kick">● {kicker}</span>
      <h2 className="sfl-h2"><span>{l1}</span>{l2 && <> <span className="sfl-grey">{l2}</span></>}</h2>
      {sub && <p>{sub}</p>}
    </div>
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
    <figure className="sfl-rev sfl-voice sfl-rv">
      <button type="button" className="sfl-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Écouter le message vocal'}><Ico d={playing ? P.pause : P.play} s={16} /></button>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <span className="sfl-wave" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => { const seed = Math.abs(Math.sin(i * 2.7) * Math.cos(i * 0.9)); return <i key={i} className={i / 40 <= pct && pct > 0 ? 'p' : ''} style={{ height: (22 + seed * 70) + '%' }} /> })}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#71717A', whiteSpace: 'nowrap', minWidth: 0 }}>
          <span style={{ color: '#EDEDEF', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>Message vocal d’un client</span>
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

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="sfl-sec">
      <div className="sfl-wrap sfl-faq-grid">
        <Head kicker="FAQ" l1="Questions" l2="fréquentes." sub={<>Une autre question ? <a href={TG_URL} target="_blank" rel="noreferrer" className="sfl-ul">Écris-nous sur Telegram</a>.</>} />
        <div className="sfl-faq">
          {QA.map(([q, a], i) => {
            const on = open === i
            return (
              <div key={q} className={'sfl-qa sfl-rv' + (on ? ' sfl-on' : '')} style={dl(i * 40)}>
                <button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on}>{q}<span className="sfl-qa-ic"><Ico d={P.plus} s={16} /></span></button>
                <div className="sfl-qa-a"><div><p>{a}</p></div></div>
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

  const cta = (big?: boolean) => (
    <div className="sfl-ctas">
      <button type="button" className={'sfl-btn sfl-btn-p' + (big ? ' sfl-btn-lg' : '')} onClick={onStudio}>Créer mon compte<Ico d={P.arrow} s={17} /></button>
      <a href={WIN_URL} className={'sfl-btn sfl-btn-s' + (big ? ' sfl-btn-lg' : '')}><Ico d={P.download} s={16} />Télécharger pour Windows</a>
    </div>
  )

  return (
    <div ref={rootRef} className="sfl-root" onScroll={onScroll} onClick={onRootClick}>
      <style>{CSS}</style>

      {/* EN-TÊTE */}
      <header className={'sfl-hdr' + (scrolled || menu ? ' sfl-scrolled' : '')}>
        <div className="sfl-wrap sfl-hdr-in">
          <a href="#top" aria-label="ScaleFlow"><Brand /></a>
          <nav className="sfl-nav" aria-label="Navigation principale">
            {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="sfl-hdr-cta">
            <button type="button" className="sfl-btn sfl-btn-g sfl-btn-sm sfl-hdr-login" onClick={onStudio}>Connexion</button>
            <button type="button" className="sfl-btn sfl-btn-p sfl-btn-sm" onClick={onStudio}>Commencer</button>
            <button type="button" className="sfl-burger" aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menu} aria-controls="sfl-menu" onClick={() => setMenu(m => !m)}><Ico d={menu ? P.close : P.menu} s={18} /></button>
          </div>
        </div>
        <div id="sfl-menu" className={'sfl-menu' + (menu ? ' sfl-open' : '')}>
          {NAV.map(([href, label]) => <a key={href} href={href} className="sfl-mlink" tabIndex={menu ? 0 : -1}>{label}<Ico d={P.arrow} s={15} style={{ color: '#71717A' }} /></a>)}
          <div className="sfl-menu-cta">
            <a href={WIN_URL} className="sfl-btn sfl-btn-s" tabIndex={menu ? 0 : -1}><Ico d={P.download} s={15} />Télécharger</a>
            <button type="button" className="sfl-btn sfl-btn-p" tabIndex={menu ? 0 : -1} onClick={() => { setMenu(false); onStudio() }}>Commencer</button>
          </div>
        </div>
      </header>

      <main>
        {/* HERO : mur de téléphones qui publient */}
        <section id="top" className="sfl-hero">
          <PhoneWall />
          <div className="sfl-hero-veil" aria-hidden="true" />
          <div className="sfl-wrap sfl-hero-in">
            <span className="sfl-pill sfl-rv"><i className="sfl-dot" />Instagram · TikTok · cloud phones GeeLark</span>
            <h1 className="sfl-h1 sfl-rv" style={dl(80)}><span>Un clic.</span><span className="sfl-grad">Cent comptes.</span></h1>
            <p className="sfl-hero-sub sfl-rv" style={dl(160)}>Publication en masse, stories, programmation, warmup et studio vidéo dans un seul poste de pilotage. Ce qui te prenait la semaine part en quelques minutes.</p>
            <div className="sfl-rv" style={dl(240)}>{cta(true)}</div>
            <div className="sfl-hero-facts sfl-rv" style={dl(320)}>
              {[['×100', 'comptes en parallèle'], ['2 cr', 'par Reel publié'], ['0 €', 'les outils vidéo'], ['24/7', 'PC éteint, ça poste']].map(([v, l]) => (
                <span key={l}><b>{v}</b>{l}</span>
              ))}
            </div>
          </div>
          <a href="#live" className="sfl-scroll" aria-label="Défiler"><i /></a>
        </section>

        {/* BANDEAU */}
        <div className="sfl-marq" aria-hidden="true">
          <div className="sfl-marq-track">
            {[0, 1].map(k => MARQUEE.map((m, i) => <span key={`${k}-${i}`} className={'sfl-marq-i' + (i % 2 ? ' sfl-outline' : '')}>{m}<em>✦</em></span>))}
          </div>
        </div>

        {/* LE PRODUIT EN DIRECT */}
        <section id="live" className="sfl-sec">
          <div className="sfl-wrap sfl-live">
            <div>
              <Head kicker="Le produit" l1="Lance." l2="Regarde. C’est posté." sub="Tu choisis tes comptes et ta vidéo, ScaleFlow démarre les téléphones, publie et te montre chaque compte en direct." />
              <ul className="sfl-ticks sfl-rv" style={dl(120)}>
                {['Chaque téléphone se libère dès que son post est parti', 'Un rafraîchissement ? Le run reprend où il en était', 'Historique complet et relance des échecs en 1 clic', 'Crédits remboursés sur les comptes en échec'].map(x => (
                  <li key={x}><span><Ico d={P.check} s={12} sw={3} /></span>{x}</li>
                ))}
              </ul>
            </div>
            <div className="sfl-rv" style={dl(100)}><LiveRun /></div>
          </div>
        </section>

        <Features />

        {/* COMMENT ÇA MARCHE */}
        <section id="how" className="sfl-sec">
          <div className="sfl-wrap">
            <Head kicker="Comment ça marche" l1="Trois étapes." l2="Cinq minutes." />
            <div className="sfl-steps">
              {STEPS.map(([n, t, x], i) => (
                <div key={n} className="sfl-step sfl-rv" style={dl(i * 100)}>
                  <span className="sfl-step-n">{n}</span>
                  <h3>{t}</h3>
                  <p>{x}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AVIS */}
        <section id="reviews" className="sfl-sec">
          <div className="sfl-wrap">
            <Head center kicker="Ils l’utilisent" l1="Ils font tourner" l2="ScaleFlow." sub="Les messages reçus, tels quels. Rien de réécrit." />
            <div className="sfl-revs">
              {REVIEWS.map((r, i) => (
                <figure key={r.name} className="sfl-rev sfl-rv" style={dl((i % 3) * 70)}>
                  <img src={r.src} alt={r.alt} loading="lazy" decoding="async" />
                  <figcaption><span className="sfl-stars">{[0, 1, 2, 3, 4].map(k => <Ico key={k} d={P.star} s={12} />)}</span><b>{r.name}</b><span>Telegram · {r.date}</span></figcaption>
                </figure>
              ))}
              <VoiceNote />
            </div>
          </div>
        </section>

        {/* TARIFS */}
        <section id="pricing" className="sfl-sec">
          <div className="sfl-wrap">
            <Head center kicker="Tarifs" l1="Choisis" l2="ta puissance." sub="Toutes les fonctionnalités dans chaque offre. Plus de crédits, de téléphones et d’espace quand tu grandis." />
            <div className="sfl-plans">
              {PLANS.map((p, i) => (
                <div key={p.name} className={'sfl-plan sfl-rv' + (p.best ? ' sfl-best' : '')} style={dl(i * 90)}>
                  <div className="sfl-plan-in">
                    <div className="sfl-plan-top"><span className="sfl-plan-name">{p.name}</span>{p.best && <span className="sfl-tag">Le plus choisi</span>}</div>
                    <div className="sfl-price"><b>{p.price}$</b><span>/ mois</span></div>
                    <p className="sfl-plan-tag">{p.tag}</p>
                    <div className="sfl-plan-cr"><b className="sfl-num">{p.credits}</b><span>crédits / mois</span></div>
                    <button type="button" className={'sfl-btn ' + (p.best ? 'sfl-btn-p' : 'sfl-btn-w')} onClick={onStudio}>Choisir {p.name}<Ico d={P.arrow} s={16} /></button>
                    <ul>{p.items.map(x => <li key={x}><span><Ico d={P.check} s={11} sw={3} /></span>{x}</li>)}</ul>
                  </div>
                </div>
              ))}
            </div>
            <div className="sfl-costs sfl-rv">
              {COSTS.map(([l, v, s]) => (
                <div key={l}><span className="sfl-kick-g">{l}</span><b className={v === '0' ? 'sfl-violet' : ''}>{v === '0' ? 'Gratuit' : v}</b><span>{s}</span></div>
              ))}
            </div>
            <div className="sfl-packs sfl-rv">
              <span className="sfl-packs-h">Besoin de plus ? <b>Recharges de crédits</b></span>
              {PACKS.map(([c, p]) => <span key={c} className="sfl-pack"><b className="sfl-num">{c} cr</b><span>{p}$</span></span>)}
            </div>
          </div>
        </section>

        <Faq />

        {/* CTA FINAL */}
        <section className="sfl-final">
          <PhoneWall cols={9} per={4} seed={4} />
          <div className="sfl-final-veil" aria-hidden="true" />
          <div className="sfl-wrap sfl-final-in sfl-rv">
            <span className="sfl-kick">● C’est le moment</span>
            <h2 className="sfl-h1 sfl-h1-final"><span>Prêt à</span><span className="sfl-grad">scaler ?</span></h2>
            <p className="sfl-hero-sub">Connecte ton GeeLark, charge tes vidéos et lance ton premier run aujourd’hui.</p>
            {cta(true)}
          </div>
        </section>
      </main>

      {/* PIED DE PAGE */}
      <footer className="sfl-foot">
        <div className="sfl-wrap">
          <div className="sfl-foot-grid">
            <div className="sfl-foot-brand">
              <Brand />
              <p>Le poste de pilotage Instagram &amp; TikTok des créateurs, agences et growth teams.</p>
            </div>
            {FOOT_COLS.map(col => (
              <nav key={col.h} className="sfl-foot-col" aria-label={col.h}>
                <h3>{col.h}</h3>
                {col.links.map(([href, label]) => <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{label}</a>)}
              </nav>
            ))}
          </div>
          <div className="sfl-foot-word" aria-hidden="true">SCALEFLOW</div>
          <div className="sfl-foot-bot">
            <span>© 2026 ScaleFlow. Tous droits réservés.</span>
            <span className="sfl-fr">Conçu en France<span className="sfl-flag" aria-hidden="true"><i style={{ background: '#2B4BA8' }} /><i style={{ background: '#EDEDEF' }} /><i style={{ background: '#D9414B' }} /></span></span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
.sfl-root{--bg:#0A0A0B;--s1:#111113;--s2:#161618;--b:rgba(255,255,255,0.07);--b2:rgba(255,255,255,0.12);--t1:#F4F4F5;--t2:#A1A1AA;--t3:#8B8B94;--t4:#71717A;--v:#A78BFA;--v2:#C4B5FD;--pk:#F472B6;--grad:linear-gradient(135deg,#8B5CF6,#EC4899);--e:cubic-bezier(0.16,1,0.3,1);
  position:relative;height:100vh;height:100dvh;overflow-x:hidden;overflow-y:auto;scroll-behavior:smooth;overscroll-behavior-y:none;-webkit-overflow-scrolling:touch;
  background:var(--bg);color:var(--t1);font-size:15px;line-height:1.5;letter-spacing:-0.006em}
.sfl-root *,.sfl-root *::before,.sfl-root *::after{box-sizing:border-box}
.sfl-root a{color:inherit;text-decoration:none}
.sfl-root img{max-width:100%;display:block}
.sfl-root button{font-family:inherit}
.sfl-wrap{width:100%;max-width:1200px;margin:0 auto;padding:0 24px}
.sfl-sec{position:relative;padding:96px 0;scroll-margin-top:60px}
.sfl-mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0}
.sfl-num{font-variant-numeric:tabular-nums}
.sfl-grey{color:#52525B}
.sfl-violet{color:var(--v)!important}
.sfl-dimtxt{color:var(--t4)}
.sfl-grad{background:linear-gradient(90deg,#C4B5FD,#F472B6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.sfl-ul{color:var(--v2);border-bottom:1px solid rgba(196,181,253,.4)}
.sfl-kick{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--v)}
.sfl-kick-g{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--t3)}

/* Révélation */
.sfl-rv{opacity:0;transform:translateY(22px);transition:opacity .8s var(--e),transform .8s var(--e);transition-delay:var(--d,0ms)}
.sfl-rv.sfl-in{opacity:1;transform:none}

/* Boutons */
.sfl-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;height:44px;padding:0 18px;border-radius:12px;border:none;font-size:14.5px;font-weight:750;cursor:pointer;white-space:nowrap;transition:transform .2s var(--e),box-shadow .2s ease,background-color .2s ease}
.sfl-btn:hover{transform:translateY(-2px)}
.sfl-btn-p{background:var(--grad);color:#fff;box-shadow:0 4px 0 #6D28D9,0 18px 40px -16px rgba(236,72,153,.7)}
.sfl-btn-s{background:rgba(255,255,255,0.06);color:var(--t1);border:1px solid var(--b2);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.sfl-btn-s:hover{background:rgba(255,255,255,0.1)}
.sfl-btn-w{background:#F4F4F5;color:#0A0A0B;box-shadow:0 4px 0 #A1A1AA}
.sfl-btn-g{background:transparent;color:var(--t2);border:1px solid transparent}
.sfl-btn-g:hover{color:var(--t1);background:rgba(255,255,255,0.05)}
.sfl-btn-sm{height:34px;padding:0 13px;font-size:13.5px;border-radius:9px}
.sfl-btn-sm.sfl-btn-p{box-shadow:0 3px 0 #6D28D9}
.sfl-btn-lg{height:54px;padding:0 24px;font-size:16px;border-radius:14px}
.sfl-ctas{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}

/* En-tête */
.sfl-hdr{position:sticky;top:0;z-index:50;height:64px;background:transparent;border-bottom:1px solid transparent;transition:border-color .3s ease,background-color .3s ease}
.sfl-hdr.sfl-scrolled{border-bottom-color:var(--b);background:rgba(10,10,11,0.78);-webkit-backdrop-filter:saturate(1.5) blur(16px);backdrop-filter:saturate(1.5) blur(16px)}
.sfl-hdr-in{height:100%;display:flex;align-items:center;gap:20px}
.sfl-brand{display:inline-flex;align-items:center;gap:10px;font-size:16px;font-weight:800;letter-spacing:-0.03em;color:var(--t1);flex-shrink:0}
.sfl-nav{display:flex;align-items:center;gap:2px;margin-left:18px}
.sfl-nav a{display:inline-flex;align-items:center;height:34px;padding:0 12px;border-radius:8px;font-size:14px;font-weight:550;color:var(--t2);transition:color .15s ease,background-color .15s ease}
.sfl-nav a:hover{color:var(--t1);background:rgba(255,255,255,0.05)}
.sfl-hdr-cta{margin-left:auto;display:flex;align-items:center;gap:8px}
.sfl-burger{display:none;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;border:1px solid var(--b2);background:rgba(255,255,255,0.04);color:var(--t1);cursor:pointer}
.sfl-menu{display:none}

/* Téléphone */
.sfl-ph{position:relative;aspect-ratio:9/19;border-radius:24px;overflow:hidden;background:#141416;border:1px solid rgba(255,255,255,0.12);box-shadow:0 0 0 4px #0E0E10,0 0 0 5px rgba(255,255,255,0.08),0 30px 60px -30px rgba(0,0,0,.9)}
.sfl-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sfl-ph-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,transparent 22%,transparent 58%,rgba(0,0,0,.85) 100%)}
.sfl-ph-top{position:absolute;top:7px;left:0;right:0;display:flex;justify-content:center}
.sfl-ph-notch{width:34%;height:12px;border-radius:99px;background:#000}
.sfl-ph-chip{position:absolute;top:28px;left:9px}
.sfl-ph-side{position:absolute;right:9px;bottom:30%;display:flex;flex-direction:column;gap:12px;color:#fff;opacity:.9}
.sfl-ph-bot{position:absolute;left:10px;right:34px;bottom:12px;display:flex;flex-direction:column;gap:6px}
.sfl-ph-user{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sfl-ph-user i{width:18px;height:18px;border-radius:99px;background-size:cover;background-position:center;border:1.5px solid #fff;flex-shrink:0}
.sfl-ph-cap{height:5px;border-radius:9px;background:rgba(255,255,255,.55);width:85%}
.sfl-ph-cap2{width:55%;background:rgba(255,255,255,.35)}

/* Statut animé */
.sfl-st{position:relative;display:inline-grid}
.sfl-st-i{grid-area:1/1;display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:99px;font-size:10.5px;font-weight:800;white-space:nowrap;animation:6s linear infinite;opacity:0}
.sfl-st-a{background:rgba(10,10,11,.6);color:#D4D4D8;border:1px solid rgba(255,255,255,.18);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation-name:sflStA}
.sfl-st-b{background:rgba(139,92,246,.9);color:#fff;animation-name:sflStB}
.sfl-st-c{background:#fff;color:#0A0A0B;animation-name:sflStC}
@keyframes sflStA{0%,30%{opacity:1}33%,97%{opacity:0}100%{opacity:1}}
@keyframes sflStB{0%,30%{opacity:0}33%,63%{opacity:1}66%,100%{opacity:0}}
@keyframes sflStC{0%,63%{opacity:0}66%,97%{opacity:1}100%{opacity:0}}
.sfl-spin{display:inline-block;width:10px;height:10px;border-radius:99px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:sflSpin .8s linear infinite}
@keyframes sflSpin{to{transform:rotate(360deg)}}

/* Hero */
.sfl-hero{position:relative;min-height:calc(100vh - 0px);min-height:100dvh;margin-top:-64px;display:flex;align-items:center;overflow:hidden;isolation:isolate}
.sfl-wall{position:absolute;inset:-10% -10%;z-index:-2;perspective:1400px;overflow:hidden}
.sfl-wall-in{position:absolute;left:50%;top:50%;display:flex;gap:22px;transform:translate(-50%,-50%) rotateX(22deg) rotateZ(-12deg) scale(1.08);transform-style:preserve-3d}
.sfl-col{display:flex;flex-direction:column;gap:22px;width:190px;animation:46s linear infinite;will-change:transform}
.sfl-col-up{animation-name:sflUp}
.sfl-col-dn{animation-name:sflDn}
@keyframes sflUp{from{transform:translateY(0)}to{transform:translateY(calc(-50% - 11px))}}
@keyframes sflDn{from{transform:translateY(calc(-50% - 11px))}to{transform:translateY(0)}}
.sfl-hero-veil{position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse 70% 62% at 50% 50%,rgba(10,10,11,.94) 0%,rgba(10,10,11,.8) 45%,rgba(10,10,11,.35) 100%),linear-gradient(180deg,rgba(10,10,11,.85) 0%,transparent 18%,transparent 78%,#0A0A0B 100%)}
.sfl-hero-in{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:120px;padding-bottom:110px}
.sfl-pill{display:inline-flex;align-items:center;gap:9px;height:32px;padding:0 14px;border-radius:99px;border:1px solid rgba(167,139,250,.35);background:rgba(167,139,250,.1);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-size:12.5px;font-weight:700;color:var(--v2)}
.sfl-dot{width:7px;height:7px;border-radius:99px;background:var(--v);box-shadow:0 0 0 4px rgba(167,139,250,.2);animation:sflPulse 1.8s ease-in-out infinite}
@keyframes sflPulse{50%{box-shadow:0 0 0 8px rgba(167,139,250,0)}}
.sfl-h1{margin:26px 0 0;display:flex;flex-direction:column;font-weight:900;letter-spacing:-0.06em;line-height:.86;text-transform:uppercase;font-size:clamp(54px,10.5vw,148px);color:var(--t1)}
.sfl-hero-sub{margin:28px auto 0;max-width:620px;font-size:clamp(15px,1.5vw,18px);line-height:1.6;color:#C4C4CC}
.sfl-hero-in .sfl-ctas{margin-top:34px}
.sfl-hero-facts{margin-top:48px;display:flex;flex-wrap:wrap;justify-content:center;border:1px solid var(--b2);border-radius:18px;background:rgba(14,14,16,.7);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);overflow:hidden}
.sfl-hero-facts span{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:14px 22px;font-size:12px;color:var(--t3);text-align:left}
.sfl-hero-facts span+span{border-left:1px solid var(--b)}
.sfl-hero-facts b{font-size:24px;font-weight:900;letter-spacing:-0.04em;color:var(--t1);line-height:1}
.sfl-scroll{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);width:24px;height:38px;border-radius:99px;border:1.5px solid rgba(255,255,255,.3)}
.sfl-scroll i{position:absolute;left:50%;top:8px;width:3px;height:8px;margin-left:-1.5px;border-radius:9px;background:#fff;animation:sflWheel 1.8s ease-in-out infinite}
@keyframes sflWheel{0%{opacity:0;transform:translateY(-4px)}40%{opacity:1}100%{opacity:0;transform:translateY(12px)}}

/* Bandeau */
.sfl-marq{overflow:hidden;border-top:1px solid var(--b);border-bottom:1px solid var(--b);padding:22px 0;background:#0C0C0D}
.sfl-marq-track{display:flex;width:max-content;animation:sflMarq 38s linear infinite}
.sfl-marq-i{display:inline-flex;align-items:center;gap:28px;padding-right:28px;font-size:clamp(28px,4vw,52px);font-weight:900;letter-spacing:-0.045em;text-transform:uppercase;white-space:nowrap;color:var(--t1)}
.sfl-marq-i em{font-style:normal;font-size:.55em;color:var(--v);-webkit-text-stroke:0}
.sfl-outline{color:transparent;-webkit-text-stroke:1.5px rgba(255,255,255,.45)}
@keyframes sflMarq{to{transform:translateX(-50%)}}

/* Titres de section */
.sfl-head{max-width:720px;margin-bottom:48px}
.sfl-head.sfl-c{margin-left:auto;margin-right:auto;text-align:center}
.sfl-h2{margin:14px 0 0;font-weight:900;letter-spacing:-0.055em;line-height:.92;text-transform:uppercase;font-size:clamp(36px,5.6vw,76px);color:var(--t1)}
.sfl-head p{margin:20px 0 0;font-size:16px;line-height:1.6;color:var(--t2);max-width:560px}
.sfl-head.sfl-c p{margin-left:auto;margin-right:auto}

/* Run en direct */
.sfl-live{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:56px;align-items:center}
.sfl-live .sfl-head{margin-bottom:28px}
.sfl-ticks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:13px}
.sfl-ticks li{display:flex;align-items:center;gap:12px;font-size:15px;color:#D4D4D8}
.sfl-ticks li>span,.sfl-plan li>span{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;flex-shrink:0;background:rgba(167,139,250,.14);color:var(--v)}
.sfl-run{position:relative;padding:20px;border-radius:24px;background:#0F0F11;border:1px solid var(--b2);box-shadow:0 40px 100px -40px rgba(139,92,246,.55)}
.sfl-run-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.sfl-run-live{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--v2)}
.sfl-run-live i{width:8px;height:8px;border-radius:99px;background:var(--pk);animation:sflPulse 1.4s ease-in-out infinite;box-shadow:0 0 0 4px rgba(244,114,182,.2)}
.sfl-run-count{font-size:13px;color:var(--t3)}
.sfl-run-count b{font-size:18px;color:var(--t1)}
.sfl-run-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden;margin-bottom:16px}
.sfl-run-bar i{display:block;height:100%;background:var(--grad);border-radius:99px;transition:width .4s var(--e)}
.sfl-run-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}
.sfl-tile{position:relative;aspect-ratio:9/16;border-radius:10px;overflow:hidden;background:#18181B;transition:transform .35s var(--e),box-shadow .35s ease}
.sfl-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:filter .5s ease,opacity .5s ease}
.sfl-tile-idle img{filter:grayscale(1) brightness(.45)}
.sfl-tile-run{box-shadow:0 0 0 2px var(--v);transform:scale(.96)}
.sfl-tile-run img{filter:brightness(.6)}
.sfl-tile-ok{box-shadow:0 0 0 1px rgba(255,255,255,.2)}
.sfl-tile-badge{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center}
.sfl-tile-ok .sfl-tile-badge{top:auto;bottom:6px;width:20px;height:20px;border-radius:99px;background:#fff;color:#0A0A0B;animation:sflPop .4s var(--e) both}
.sfl-tile-run .sfl-spin{width:16px;height:16px}
@keyframes sflPop{from{transform:translate(-50%,0) scale(.3);opacity:0}to{transform:translate(-50%,0) scale(1);opacity:1}}
.sfl-run-log{margin-top:16px;min-height:88px;display:flex;flex-direction:column;gap:5px;padding:12px 14px;border-radius:12px;background:#0A0A0B;border:1px solid var(--b);font-size:12px;color:var(--t2)}
.sfl-run-log b{color:var(--v)}

/* Fonctionnalités (bento) */
.sfl-bento{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.sfl-feat{position:relative;display:flex;flex-direction:column;border-radius:24px;overflow:hidden;background:#0F0F11;border:1px solid var(--b);transition:border-color .3s ease,transform .4s var(--e)}
.sfl-feat:hover{border-color:rgba(167,139,250,.45);transform:translateY(-4px)}
.sfl-feat-xl{grid-column:span 2;grid-row:span 2}
.sfl-feat-l{grid-column:span 2}
.sfl-feat-viz{position:relative;flex:1;min-height:220px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 120%,rgba(139,92,246,.16),transparent 65%)}
.sfl-feat-xl .sfl-feat-viz{min-height:380px}
.sfl-feat-txt{padding:22px 24px 24px;border-top:1px solid var(--b)}
.sfl-feat h3{margin:10px 0 0;font-size:24px;font-weight:900;letter-spacing:-0.045em;line-height:1;text-transform:uppercase;color:var(--t1)}
.sfl-feat-xl h3{font-size:clamp(28px,3.2vw,42px)}
.sfl-feat h3 span{color:#52525B}
.sfl-feat p{margin:10px 0 0;font-size:14px;line-height:1.55;color:var(--t2)}
.sfl-viz-mass{position:relative;width:100%;height:100%;min-height:380px;display:flex;align-items:center;justify-content:center}
.sfl-fan{position:absolute;width:150px;transform:translateX(calc(var(--i) * 108px)) rotate(calc(var(--i) * 7deg)) translateY(calc(var(--i) * var(--i) * 10px));z-index:calc(10 - var(--i) * var(--i));transition:transform .6s var(--e)}
.sfl-feat:hover .sfl-fan{transform:translateX(calc(var(--i) * 128px)) rotate(calc(var(--i) * 9deg)) translateY(calc(var(--i) * var(--i) * 12px - 8px))}
.sfl-viz-center{display:flex;align-items:center;justify-content:center;padding:22px 0}
.sfl-ph-lg{width:132px;transform:rotate(-4deg);transition:transform .5s var(--e)}
.sfl-feat:hover .sfl-ph-lg{transform:rotate(0) scale(1.04)}
.sfl-story-bars{position:absolute;top:12px;left:10px;right:10px;display:flex;gap:3px}
.sfl-story-bars i{flex:1;height:2.5px;border-radius:9px;background:rgba(255,255,255,.4)}
.sfl-story-bars i:first-child{background:#fff}
.sfl-sticker{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%) rotate(-3deg);display:inline-flex;align-items:center;gap:5px;padding:7px 11px;border-radius:9px;background:#fff;color:#2563EB;font-size:11.5px;font-weight:900;white-space:nowrap;box-shadow:0 8px 24px -6px rgba(0,0,0,.6);animation:sflBob 3s ease-in-out infinite}
@keyframes sflBob{50%{transform:translate(-50%,-58%) rotate(2deg)}}
.sfl-viz-viral{position:relative;width:100%;height:240px}
.sfl-reel{position:absolute;top:50%;left:50%;width:112px;aspect-ratio:9/16;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 40px -18px rgba(0,0,0,.9);transform:translate(calc(-50% + (var(--i) - 1) * 96px),calc(-50% + (var(--i) - 1) * (var(--i) - 1) * 12px)) rotate(calc((var(--i) - 1) * 8deg));z-index:calc(5 - var(--i));transition:transform .5s var(--e)}
.sfl-feat:hover .sfl-reel{transform:translate(calc(-50% + (var(--i) - 1) * 108px),calc(-50% + (var(--i) - 1) * (var(--i) - 1) * 6px)) rotate(calc((var(--i) - 1) * 5deg))}
.sfl-reel img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sfl-reel-rank{position:absolute;top:7px;left:7px;padding:2px 6px;border-radius:99px;background:#fff;color:#0A0A0B;font-size:9.5px;font-weight:800}
.sfl-reel-x{position:absolute;top:7px;right:7px;padding:2px 6px;border-radius:99px;background:var(--grad);color:#fff;font-size:9.5px;font-weight:800}
.sfl-reel-v{position:absolute;left:8px;bottom:8px;display:flex;align-items:baseline;gap:4px;font-size:8.5px;font-weight:800;text-transform:uppercase;color:#C4C4CC}
.sfl-reel-v b{font-size:17px;letter-spacing:-0.04em;color:#fff}
.sfl-viz-studio{width:100%;display:flex;align-items:center;gap:18px;padding:26px}
.sfl-src{position:relative;width:118px;flex-shrink:0;aspect-ratio:9/16;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.18)}
.sfl-src img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sfl-src span{position:absolute;left:8px;bottom:8px;padding:2px 7px;border-radius:99px;background:rgba(10,10,11,.7);font-size:10px;font-weight:800;color:#fff}
.sfl-flow{display:flex;color:var(--v);animation:sflNudge 1.6s ease-in-out infinite}
@keyframes sflNudge{50%{transform:translateX(5px)}}
.sfl-vars{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;flex:1}
.sfl-var{position:relative;aspect-ratio:9/16;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.12);animation:sflIn .6s var(--e) both;animation-delay:calc(var(--i) * 90ms)}
.sfl-var img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sfl-var-cap{position:absolute;left:4px;right:4px;top:32%;padding:3px 4px;border-radius:5px;background:#fff;color:#0A0A0B;font-size:7.5px;font-weight:800;text-align:center;line-height:1.15}
@keyframes sflIn{from{opacity:0;transform:translateY(10px) scale(.94)}to{opacity:1;transform:none}}
.sfl-viz-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;width:100%;padding:20px}
.sfl-cal-h{font-size:10px;font-weight:800;color:var(--t4);text-align:center}
.sfl-cal-d{display:flex;flex-direction:column;gap:3px;min-height:58px;padding:5px;border-radius:8px;background:#141416;border:1px solid var(--b)}
.sfl-cal-d small{font-size:9.5px;color:var(--t4)}
.sfl-cal-now{border-color:rgba(167,139,250,.6);background:rgba(167,139,250,.08)}
.sfl-cal-p{font-style:normal;font-size:8.5px;font-weight:800;padding:2px 3px;border-radius:4px;background:rgba(167,139,250,.2);color:var(--v2);white-space:nowrap;overflow:hidden}
.sfl-cal-p2{background:rgba(244,114,182,.18);color:#F9A8D4}
.sfl-viz-flow{display:flex;flex-direction:column;align-items:center;gap:0;padding:20px}
.sfl-flow-b{display:inline-flex;align-items:center;gap:9px;padding:9px 14px;border-radius:11px;background:#151517;border:1px solid var(--b2);font-size:13px;font-weight:700;color:var(--t1);animation:sflIn .6s var(--e) both;animation-delay:calc(var(--i) * 120ms)}
.sfl-flow-b span{font-size:10px;color:var(--v)}
.sfl-flow-l{width:2px;height:14px;background:linear-gradient(var(--v),rgba(167,139,250,.2))}
.sfl-viz-warm{display:flex;flex-direction:column;gap:8px;width:100%;padding:20px}
.sfl-warm-row{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:12px;background:#141416;border:1px solid var(--b);animation:sflIn .6s var(--e) both;animation-delay:calc(var(--i) * 110ms)}
.sfl-warm-row>i{width:26px;height:26px;border-radius:99px;background-size:cover;background-position:center;flex-shrink:0}
.sfl-warm-t{flex:1;min-width:0;font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfl-warm-c{display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:99px;background:rgba(255,255,255,.07);font-size:9.5px;font-weight:800;color:#D4D4D8}
.sfl-warm-run{background:rgba(139,92,246,.25);color:var(--v2)}
.sfl-warm-run .sfl-spin{width:8px;height:8px;border-width:1.5px}
.sfl-viz-links{display:flex;flex-direction:column;gap:16px;width:100%;padding:22px}
.sfl-link-pill{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:99px;background:#fff;color:#0A0A0B;font-size:12px;font-weight:800}
.sfl-bars{display:flex;align-items:flex-end;gap:5px;height:110px}
.sfl-bars i{flex:1;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,var(--v),rgba(139,92,246,.25));transform-origin:bottom;animation:sflGrow .8s var(--e) both;animation-delay:calc(var(--i) * 50ms)}
@keyframes sflGrow{from{transform:scaleY(0)}}

/* Étapes */
.sfl-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.sfl-step{position:relative;padding:28px;border-radius:24px;background:#0F0F11;border:1px solid var(--b);overflow:hidden}
.sfl-step-n{display:block;font-size:96px;font-weight:900;letter-spacing:-0.07em;line-height:.8;background:linear-gradient(180deg,rgba(196,181,253,.9),rgba(196,181,253,.05));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.sfl-step h3{margin:22px 0 0;font-size:22px;font-weight:900;letter-spacing:-0.04em;text-transform:uppercase}
.sfl-step p{margin:10px 0 0;font-size:14.5px;line-height:1.6;color:var(--t2)}

/* Avis */
.sfl-revs{columns:3 300px;column-gap:14px}
.sfl-rev{break-inside:avoid;margin:0 0 14px;border-radius:20px;overflow:hidden;background:#0F0F11;border:1px solid var(--b);transition:border-color .3s ease}
.sfl-rev:hover{border-color:rgba(167,139,250,.35)}
.sfl-rev img{width:100%}
.sfl-rev figcaption{display:flex;align-items:center;gap:8px;padding:12px 16px;font-size:12.5px;color:var(--t4);border-top:1px solid var(--b)}
.sfl-rev figcaption b{color:var(--t1)}
.sfl-stars{display:inline-flex;gap:1px;color:#FBBF24}
.sfl-stars svg{fill:currentColor}
.sfl-voice{display:flex;align-items:center;gap:14px;padding:16px}
.sfl-play{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:99px;border:none;background:var(--grad);color:#fff;cursor:pointer;flex-shrink:0}
.sfl-wave{display:flex;align-items:center;gap:2px;height:28px}
.sfl-wave i{flex:1;border-radius:9px;background:rgba(255,255,255,.18)}
.sfl-wave i.p{background:var(--v)}

/* Tarifs */
.sfl-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:stretch}
.sfl-plan{border-radius:24px;padding:0;transition:transform .4s var(--e)}
.sfl-plan:hover{transform:translateY(-6px)}
.sfl-best{padding:1px;background:linear-gradient(160deg,#A78BFA,rgba(236,72,153,.7) 40%,rgba(255,255,255,.08) 80%);box-shadow:0 40px 90px -40px rgba(139,92,246,.9)}
.sfl-plan-in{height:100%;display:flex;flex-direction:column;gap:16px;padding:26px;border-radius:23px;background:#0F0F11;border:1px solid var(--b)}
.sfl-best .sfl-plan-in{border:none;background:linear-gradient(180deg,#17131F,#0F0F11 50%)}
.sfl-plan-top{display:flex;align-items:center;gap:8px;min-height:24px}
.sfl-plan-name{font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--t2)}
.sfl-best .sfl-plan-name{color:var(--v2)}
.sfl-tag{padding:4px 8px;border-radius:99px;background:var(--grad);color:#fff;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.sfl-price{display:flex;align-items:baseline;gap:6px}
.sfl-price b{font-size:58px;font-weight:900;letter-spacing:-0.06em;line-height:.9}
.sfl-price span{font-size:14px;color:var(--t4)}
.sfl-plan-tag{margin:-4px 0 0;font-size:14px;color:var(--t2)}
.sfl-plan-cr{display:flex;align-items:baseline;justify-content:space-between;padding:13px 15px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--b)}
.sfl-plan-cr b{font-size:22px;font-weight:900;letter-spacing:-0.04em}
.sfl-plan-cr span{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--t4)}
.sfl-plan .sfl-btn{width:100%;height:48px}
.sfl-plan ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}
.sfl-plan li{display:flex;align-items:center;gap:11px;font-size:14px;color:#D4D4D8}
.sfl-costs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:16px;border-radius:20px;overflow:hidden;border:1px solid var(--b);background:#0F0F11}
.sfl-costs>div{display:flex;flex-direction:column;gap:6px;padding:20px 22px}
.sfl-costs>div+div{border-left:1px solid var(--b)}
.sfl-costs b{font-size:38px;font-weight:900;letter-spacing:-0.05em;line-height:.95}
.sfl-costs span:last-child{font-size:12.5px;color:var(--t4)}
.sfl-packs{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px}
.sfl-packs-h{font-size:13.5px;color:var(--t3);margin-right:6px}
.sfl-packs-h b{color:var(--t1)}
.sfl-pack{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 13px;border-radius:99px;border:1px solid var(--b2);background:#0F0F11;font-size:13px}
.sfl-pack span{color:var(--t3)}

/* FAQ */
.sfl-faq-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:48px;align-items:start}
.sfl-faq-grid .sfl-h2{font-size:clamp(36px,4.6vw,62px)}
.sfl-faq{display:flex;flex-direction:column;gap:8px}
.sfl-qa{border-radius:16px;background:#0F0F11;border:1px solid var(--b);transition:border-color .25s ease}
.sfl-qa.sfl-on{border-color:rgba(167,139,250,.4)}
.sfl-qa button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px;border:none;background:transparent;color:var(--t1);font-size:15.5px;font-weight:750;text-align:left;cursor:pointer}
.sfl-qa-ic{display:flex;color:var(--t4);transition:transform .3s var(--e),color .3s ease}
.sfl-on .sfl-qa-ic{transform:rotate(45deg);color:var(--v)}
.sfl-qa-a{display:grid;grid-template-rows:0fr;transition:grid-template-rows .35s var(--e)}
.sfl-on .sfl-qa-a{grid-template-rows:1fr}
.sfl-qa-a>div{overflow:hidden}
.sfl-qa-a p{margin:0;padding:0 20px 18px;font-size:14.5px;line-height:1.65;color:var(--t2)}

/* CTA final */
.sfl-final{position:relative;overflow:hidden;isolation:isolate;padding:150px 0;border-top:1px solid var(--b)}
.sfl-final .sfl-wall{z-index:-2}
.sfl-final-veil{position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse 60% 70% at 50% 50%,rgba(10,10,11,.95),rgba(10,10,11,.7) 55%,rgba(10,10,11,.45)),linear-gradient(180deg,#0A0A0B 0%,transparent 25%,transparent 75%,#0A0A0B 100%)}
.sfl-final-in{display:flex;flex-direction:column;align-items:center;text-align:center}
.sfl-h1-final{font-size:clamp(52px,9vw,128px)}
.sfl-final-in .sfl-ctas{margin-top:32px}

/* Pied de page */
.sfl-foot{border-top:1px solid var(--b);padding:64px 0 28px;overflow:hidden}
.sfl-foot-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:32px}
.sfl-foot-brand p{margin:14px 0 0;max-width:300px;font-size:13.5px;line-height:1.6;color:var(--t3)}
.sfl-foot-col{display:flex;flex-direction:column;gap:10px}
.sfl-foot-col h3{margin:0 0 4px;font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--t4)}
.sfl-foot-col a{font-size:14px;color:var(--t2);transition:color .15s ease}
.sfl-foot-col a:hover{color:var(--t1)}
.sfl-foot-word{margin:56px 0 0;font-size:clamp(64px,17vw,250px);font-weight:900;letter-spacing:-0.07em;line-height:.8;text-align:center;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,0));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;user-select:none}
.sfl-foot-bot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:22px;padding-top:20px;border-top:1px solid var(--b);font-size:12.5px;color:var(--t4)}
.sfl-fr{display:inline-flex;align-items:center;gap:8px}
.sfl-flag{display:inline-flex;width:18px;height:12px;border-radius:2px;overflow:hidden}
.sfl-flag i{flex:1}

/* Responsive */
@media (max-width:980px){
  .sfl-nav,.sfl-hdr-login{display:none}
  .sfl-burger{display:inline-flex}
  .sfl-menu{display:flex;flex-direction:column;gap:2px;position:absolute;top:64px;left:0;right:0;padding:0 16px;max-height:0;overflow:hidden;background:rgba(10,10,11,.96);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);transition:max-height .35s var(--e),padding .35s var(--e);border-bottom:1px solid transparent}
  .sfl-menu.sfl-open{max-height:420px;padding:10px 16px 18px;border-bottom-color:var(--b)}
  .sfl-mlink{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 6px;font-size:16px;font-weight:700;border-bottom:1px solid var(--b)}
  .sfl-menu-cta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
  .sfl-live,.sfl-faq-grid{grid-template-columns:1fr;gap:36px}
  .sfl-bento{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sfl-feat-xl{grid-row:auto}
  .sfl-plans{grid-template-columns:1fr;max-width:480px;margin:0 auto}
  .sfl-costs{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sfl-costs>div:nth-child(3){border-left:none}
  .sfl-costs>div:nth-child(n+3){border-top:1px solid var(--b)}
  .sfl-foot-grid{grid-template-columns:1fr 1fr}
  .sfl-foot-brand{grid-column:1/-1}
}
@media (max-width:640px){
  .sfl-wrap{padding:0 16px}
  .sfl-sec{padding:84px 0}
  .sfl-hdr-cta .sfl-btn-p{display:none}
  .sfl-col{width:120px;gap:14px}
  .sfl-wall-in{gap:14px}
  .sfl-hero-in{padding-top:110px;padding-bottom:90px}
  .sfl-hero-facts{display:grid;grid-template-columns:1fr 1fr;width:100%}
  .sfl-hero-facts span{padding:12px 14px}
  .sfl-hero-facts span+span{border-left:none}
  .sfl-hero-facts span:nth-child(even){border-left:1px solid var(--b)}
  .sfl-hero-facts span:nth-child(n+3){border-top:1px solid var(--b)}
  .sfl-ctas{width:100%}
  .sfl-ctas .sfl-btn{width:100%}
  .sfl-bento{grid-template-columns:1fr}
  .sfl-feat-xl,.sfl-feat-l{grid-column:auto}
  .sfl-feat-xl .sfl-feat-viz,.sfl-viz-mass{min-height:300px}
  .sfl-fan{width:112px;transform:translateX(calc(var(--i) * 62px)) rotate(calc(var(--i) * 7deg)) translateY(calc(var(--i) * var(--i) * 8px))}
  .sfl-feat:hover .sfl-fan{transform:translateX(calc(var(--i) * 66px)) rotate(calc(var(--i) * 8deg)) translateY(calc(var(--i) * var(--i) * 8px))}
  .sfl-viz-studio{flex-direction:column}
  .sfl-flow{transform:rotate(90deg);animation:none}
  .sfl-vars{width:100%;grid-template-columns:repeat(3,minmax(0,1fr))}
  .sfl-run{padding:14px}
  .sfl-run-grid{grid-template-columns:repeat(6,1fr);gap:6px}
  .sfl-steps{grid-template-columns:1fr}
  .sfl-step-n{font-size:72px}
  .sfl-final{padding:110px 0}
}
@media (prefers-reduced-motion:reduce){
  .sfl-root *{animation:none!important;transition:none!important}
  .sfl-rv{opacity:1;transform:none}
  .sfl-st-a{opacity:1}
}
`

export default SiteLanding
