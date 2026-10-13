// « Quoi de neuf » façon stories : s'ouvre une fois à l'arrivée sur l'accueil (puis via
// la bannière). 4 diapos animées qui défilent seules (barres de progression en haut),
// navigation ← / →, clic sur le visuel, Échap pour fermer. Visuels 100 % CSS (pas d'asset).
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PageKey } from '@/Shell'
import { Icon, useNarrow } from '@/lib/ui'

export const SPOTLIGHT_KEY = 'sf-spotlight-2026-10b'
const SLIDE_MS = 7000

export function spotlightSeen(): boolean {
  try { return localStorage.getItem(SPOTLIGHT_KEY) === '1' } catch { return true }
}
function markSeen() { try { localStorage.setItem(SPOTLIGHT_KEY, '1') } catch { /* ignore */ } }

interface Slide { kicker: string; title: string; text: string; points: string[]; cta: string; page: PageKey | null; a: string; b: string; visual: () => ReactNode }

// ── Visuels ──────────────────────────────────────────────────────────────────
/** Animations partagées par les visuels (Nouveautés, Explorer, connexion). */
export const SPOT_KEYFRAMES = `
        @keyframes sfsBar{from{width:0}to{width:100%}}
        @keyframes sfsGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes sfsPop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}
        @keyframes sfsFill{from{width:0}to{width:100%}}
        @keyframes sfsFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes sfsPing{0%{opacity:0;transform:translateY(8px)}20%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
        @keyframes sfsGlow{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(20px,-14px) scale(1.12)}}
      `

const card = { background: 'rgba(10,10,11,0.72)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, backdropFilter: 'blur(8px)' } as const

export function VisualExplore() {
  const tiles: [string, string, string][] = [['#F58529', '#8134AF', 'Reels'], ['#25F4EE', '#FE2C55', 'TikTok'], ['#A78BFA', '#DB2777', 'Légendes IA'], ['#F97316', '#7F1D1D', 'Veille'], ['#4ADE80', '#14532D', 'Spoof'], ['#F472B6', '#831843', 'Liens']]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 96px)', gap: 10 }}>
      {tiles.map(([a, b, l], i) => (
        <div key={l} style={{ ...card, overflow: 'hidden', animation: `sfsPop .45s ${0.08 + i * 0.07}s both` }}>
          <div style={{ height: 58, background: `linear-gradient(135deg, ${a}, ${b})` }} />
          <div style={{ padding: '7px 9px', fontSize: 11, fontWeight: 600, color: '#fff' }}>{l}</div>
        </div>
      ))}
    </div>
  )
}
export function VisualAi() {
  const lines = ['POV : il pensait que j’étais sage 😇', 'Tu restes jusqu’à la fin ? 👀', 'Dernière chance de me découvrir 🔥', 'Ce que personne ne voit sur mon feed…']
  return (
    <div style={{ ...card, width: '80%', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#C4B5FD', fontWeight: 700 }}>✨ 20 légendes générées</span>
      {lines.map((l, i) => (
        <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', fontSize: 12, color: '#fff', animation: `sfsPop .4s ${0.15 + i * 0.18}s both` }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: i < 3 ? '#8B7CF6' : 'transparent', border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />{l}
        </span>
      ))}
    </div>
  )
}
export function VisualHome() {
  const bars = [38, 52, 44, 70, 58, 86, 74, 100]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '82%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[['Comptes publiés', '1 957', '#EDEDEF'], ['Réussite', '96 %', '#4ADE80'], ['Crédits', '12 480', '#FBBF24']].map(([l, v, c], i) => (
          <div key={l} style={{ ...card, padding: '10px 12px', animation: `sfsPop .5s ${0.1 + i * 0.12}s both` }}>
            <div style={{ fontSize: 10, color: '#A1A1AA' }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: 14, height: 130, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {bars.map((h, i) => <span key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: 'linear-gradient(180deg,#A78BFA,#7C3AED)', transformOrigin: 'bottom', animation: `sfsGrow .7s ${0.3 + i * 0.07}s cubic-bezier(.2,.8,.2,1) both` }} />)}
      </div>
    </div>
  )
}
export function VisualTikTok() {
  const fmt = (t: string, sub: string, bg: string, d: number) => (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', animation: `sfsPop .5s ${d}s both` }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: bg, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#fff' }}>{t}</span>
        <span style={{ display: 'block', fontSize: 11, color: '#A1A1AA', marginTop: 2 }}>{sub}</span>
        <span style={{ display: 'block', height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.12)', marginTop: 8, overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', background: '#fff', borderRadius: 99, animation: `sfsFill 2.4s ${d + 0.3}s ease-out both` }} />
        </span>
      </span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '78%' }}>
      {fmt('Reels Instagram', '128 comptes · en parallèle', 'linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)', 0.1)}
      {fmt('Vidéo TikTok', '128 comptes · en parallèle', 'linear-gradient(135deg,#25F4EE,#000 55%,#FE2C55)', 0.35)}
    </div>
  )
}
export function VisualLinks() {
  return (
    <div style={{ position: 'relative', width: 180, height: 300, borderRadius: 26, padding: 10, background: '#0A0A0B', border: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 30px 60px -20px rgba(0,0,0,.6)', animation: 'sfsFloat 5s ease-in-out infinite' }}>
      <div style={{ position: 'absolute', inset: 10, borderRadius: 18, background: 'linear-gradient(160deg,#FF7EB3,#FF758C 45%,#FFB38A)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '22px 12px' }}>
        <span style={{ width: 52, height: 52, borderRadius: 99, background: 'linear-gradient(135deg,#F9A8D4,#8B5CF6)', border: '3px solid rgba(255,255,255,.8)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Léa ✨</span>
        {['🔥 Contenu exclusif', '💌 Telegram', '📸 Instagram'].map((l, i) => (
          <span key={l} style={{ width: '100%', padding: '8px 0', borderRadius: 99, background: '#fff', color: '#111', fontSize: 10.5, fontWeight: 700, textAlign: 'center', animation: `sfsPop .45s ${0.2 + i * 0.12}s both` }}>{l}</span>
        ))}
      </div>
      <span style={{ position: 'absolute', right: -46, top: 70, ...card, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#4ADE80', animation: 'sfsPing 2.2s .8s ease-out infinite' }}>+1 clic</span>
      <span style={{ position: 'absolute', left: -60, bottom: 46, ...card, padding: '8px 12px' }}>
        <span style={{ display: 'block', fontSize: 10, color: '#A1A1AA' }}>Taux de clic</span>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 700, color: '#fff' }}>32,4 %</span>
      </span>
    </div>
  )
}
export function VisualViral() {
  const reels: [string, string, string, number][] = [['×3.2', '384k', 'linear-gradient(160deg,#C084FC,#4C1D95)', -8], ['×24', '1,5M', 'linear-gradient(160deg,#22D3EE,#1E3A8A)', 0], ['×6.8', '442k', 'linear-gradient(160deg,#FB923C,#BE123C)', 8]]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {reels.map(([x, v, bg, rot], i) => {
        const hot = i === 1
        return (
          <div key={x} style={{ position: 'relative', width: hot ? 132 : 108, height: hot ? 224 : 184, borderRadius: 14, background: bg, border: `2px solid ${hot ? '#F472B6' : 'rgba(255,255,255,0.15)'}`, transform: `rotate(${rot}deg)`, boxShadow: hot ? '0 0 40px rgba(244,114,182,.45)' : 'none', animation: `sfsPop .5s ${0.1 + i * 0.12}s both`, overflow: 'hidden' }}>
            <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 99, background: hot ? '#F472B6' : 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, fontWeight: 800 }}>{x}</span>
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 8px 8px', background: 'linear-gradient(to top,rgba(0,0,0,.75),transparent)', color: '#fff', fontSize: hot ? 15 : 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>▶ {v}</span>
          </div>
        )
      })}
    </div>
  )
}

const SLIDES: Slide[] = [
  { kicker: 'Explorer', title: 'Tous tes outils, en un coup d’œil', text: 'Une galerie de 30 outils pour publier, créer, gérer et analyser — cherche, épingle tes favoris, ouvre en 1 clic.', points: ['Nouveau menu « Explorer »', 'Recherche et favoris', 'Aussi dans ⌘K : tape le nom d’un outil'], cta: 'Ouvrir Explorer', page: 'explore', a: '#6366F1', b: '#1E1B4B', visual: VisualExplore },
  { kicker: 'Outils IA', title: 'Légendes, bios et pseudos en 10 secondes', text: 'Génère des dizaines de légendes dans le ton de ta niche et envoie-les dans ta banque, ou tes bios et pseudos dans l’édition en masse.', points: ['Légendes IA → banque de légendes', 'Bios IA et pseudos → édition en masse', 'Gratuit avec ta clé Groq'], cta: 'Essayer les Outils IA', page: 'ai', a: '#A855F7', b: '#3B0764', visual: VisualAi },
  { kicker: 'Nouvelle interface', title: 'ScaleFlow fait peau neuve', text: 'Un tableau de bord clair pour piloter toute ton agence en un coup d’œil.', points: ['Accueil avec tes chiffres clés et la courbe sur 14 jours', 'Calendrier des posts programmés, glisser-déposer', 'Relancer les échecs en 1 clic, aperçu du Reel avant de poster'], cta: 'C’est parti', page: null, a: '#7C3AED', b: '#2E1065', visual: VisualHome },
  { kicker: 'Publication', title: 'TikTok est arrivé', text: 'Publie une vidéo sur des dizaines de comptes TikTok en parallèle, comme tes Reels.', points: ['Nouveau format « Vidéo TikTok »', 'Formats rangés par réseau : Instagram, TikTok, autres', 'Même parcours que les Reels, même tarif'], cta: 'Publier sur TikTok', page: 'publish', a: '#0EA5B7', b: '#3B0A1E', visual: VisualTikTok },
  { kicker: 'Liens ScaleFlow', title: 'Sache quel compte te rapporte', text: 'Ta page de liens façon Linktree et un lien suivi par compte, créé automatiquement.', points: ['Page 100 % personnalisable : fonds animés, effets, boutons', 'Visites, clics, taux de clic et pays, en direct', 'tapmylink.fr ou ton propre domaine'], cta: 'Découvrir les Liens', page: 'links', a: '#EC4899', b: '#4A044E', visual: VisualLinks },
  { kicker: 'Veille Reels', title: 'Repère les Reels qui explosent', text: 'Les Reels qui cartonnent en ce moment, classés par vues — et ceux qui font bien plus que d’habitude.', points: ['Badge « ×24 la normale » sur les Reels viraux', 'Filtres FR / US, période, niche, compte', 'Télécharge la vidéo, copie la légende ou le lien'], cta: 'Ouvrir la Veille Reels', page: 'viral', a: '#F97316', b: '#450A0A', visual: VisualViral },
]

export default function LaunchSpotlight({ onClose, onNavigate }: { onClose: () => void; onNavigate: (p: PageKey) => void }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const narrow = useNarrow(760)
  const s = SLIDES[i]
  const close = () => { markSeen(); onClose() }
  const next = () => (i < SLIDES.length - 1 ? setI(i + 1) : close())
  const prev = () => setI(Math.max(0, i - 1))

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => { if (i < SLIDES.length - 1) setI(i + 1) }, SLIDE_MS)
    return () => clearTimeout(t)
  }, [i, paused])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  return createPortal(
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: narrow ? 12 : 24, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', animation: 'aFade .2s ease both' }}>
      <style>{SPOT_KEYFRAMES}</style>
      <div role="dialog" aria-modal="true" aria-label="Nouveautés ScaleFlow" onClick={e => e.stopPropagation()} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        style={{ position: 'relative', width: 880, maxWidth: '100%', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', borderRadius: 18, background: '#0E0E10', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 100px -20px rgba(0,0,0,.8)', animation: 'aPop .25s cubic-bezier(0.16,1,0.3,1) both' }}>
        {/* Barres de progression façon stories */}
        <div style={{ position: 'absolute', top: 12, left: 14, right: 52, zIndex: 3, display: 'flex', gap: 5 }}>
          {SLIDES.map((_, k) => (
            <button key={k} type="button" aria-label={`Diapo ${k + 1}`} onClick={() => setI(k)} style={{ flex: 1, height: 3, padding: 0, border: 'none', borderRadius: 99, background: 'rgba(255,255,255,0.22)', overflow: 'hidden', cursor: 'pointer' }}>
              <span key={`${k}-${i}`} style={{ display: 'block', height: '100%', background: '#fff', width: k < i ? '100%' : k > i ? 0 : undefined, animation: k === i ? `sfsBar ${SLIDE_MS}ms linear both` : undefined, animationPlayState: paused ? 'paused' : 'running' }} />
            </button>
          ))}
        </div>
        <button type="button" onClick={close} aria-label="Fermer" style={{ position: 'absolute', top: 6, right: 10, zIndex: 3, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: 'rgba(0,0,0,0.35)', color: '#fff', cursor: 'pointer' }}>
          <Icon d="M18 6L6 18|M6 6l12 12" size={15} />
        </button>

        <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', minHeight: narrow ? 0 : 460 }}>
          {/* Visuel animé */}
          <div onClick={next} style={{ position: 'relative', flex: narrow ? 'none' : '1 1 50%', height: narrow ? 300 : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', background: `radial-gradient(120% 90% at 20% 10%, ${s.a} 0%, ${s.b} 55%, #0A0A0B 100%)`, transition: 'background .5s ease' }}>
            <span style={{ position: 'absolute', width: 260, height: 260, borderRadius: 999, background: s.a, filter: 'blur(80px)', opacity: 0.45, top: -40, right: -60, animation: 'sfsGlow 8s ease-in-out infinite' }} />
            <div key={i} style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', padding: '40px 0 20px' }}>{s.visual()}</div>
          </div>
          {/* Texte */}
          <div key={`t${i}`} style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: narrow ? '20px 20px 22px' : '44px 36px 32px', animation: 'sfsPop .45s .05s both' }}>
            <span style={{ alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 99, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11.5, fontWeight: 600, color: '#D4D4D8', letterSpacing: '.02em' }}>✨ Nouveau · {s.kicker}</span>
            <h2 style={{ margin: 0, fontSize: narrow ? 24 : 30, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.035em', color: '#fff' }}>{s.title}</h2>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: '#A1A1AA' }}>{s.text}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {s.points.map(p => (
                <li key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, color: '#E4E4E7', lineHeight: 1.45 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 99, background: s.a, color: '#fff', flexShrink: 0, marginTop: 1 }}><Icon d="M20 6L9 17l-5-5" size={11} sw={2.6} /></span>{p}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { if (s.page) { close(); onNavigate(s.page) } else next() }}
                style={{ height: 40, padding: '0 18px', border: 'none', borderRadius: 10, background: '#fff', color: '#0A0A0B', fontSize: 14, fontWeight: 650, cursor: 'pointer' }}>{s.cta}</button>
              {i < SLIDES.length - 1
                ? <button type="button" onClick={next} style={{ height: 40, padding: '0 14px', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, background: 'transparent', color: '#EDEDEF', fontSize: 13.5, fontWeight: 550, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Suivant <Icon d="M9 18l6-6-6-6" size={13} /></button>
                : <button type="button" onClick={close} style={{ height: 40, padding: '0 14px', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, background: 'transparent', color: '#EDEDEF', fontSize: 13.5, fontWeight: 550, cursor: 'pointer' }}>Terminer</button>}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{i + 1} / {SLIDES.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
