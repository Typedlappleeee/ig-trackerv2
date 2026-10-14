// Explorer : TOUS les outils de ScaleFlow, version épurée (façon Higgsfield).
//   • En-tête sobre + grande recherche (« / »), onglets soulignés qui restent en haut.
//   • « À la une » : une grande tuile + deux moyennes (aperçus animés plein cadre).
//   • Récemment utilisés, puis chaque catégorie : titre, « Tout voir », grille de cartes.
// Un clic ouvre l'outil précis (onglet / format) via openTool. Catalogue : src/lib/tools.ts.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CURATED, curated } from '@/lib/curated'
import type { User } from '@supabase/supabase-js'
import type { OrgState } from '@/lib/data'
import type { Theme, InfraKey } from '@/lib/theme'
import { Icon, useNarrow } from '@/lib/ui'
import { CATS, searchTools, visibleTools, type Tool, type ToolCat } from '@/lib/tools'
import { recentTools } from '@/lib/openTool'
import ToolArt from '@/components/ToolArt'
import { SPOT_KEYFRAMES } from '@/components/LaunchSpotlight'
import { useTopReels, type TopReel } from '@/components/CineHero'

const FAV_KEY = 'sf-fav-tools'
function loadFavs(): string[] { try { const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }

// Photos des visuels (aperçus d'outils, tuiles) : les VRAIS Reels qui explosent (Veille, les plus
// vus de la semaine, un par compte pour varier). Repli sur la sélection maison (lib/curated)
// tant qu'il n'y en a pas assez. Signature gardée.
export function usePhotos(_user?: User, _org?: OrgState): { viral: string[]; bank: string[]; real: boolean } {
  const top = useTopReels(40)
  const real = (top ?? []).map(r => r.thumb)
  return real.length >= 6 ? { viral: real, bank: [], real: true } : { viral: CURATED, bank: [], real: false }
}
// Carte Story : image FIXE (portrait) quand on n'a que la sélection maison.
export const STORY_PICK = (k: number): string => curated(k ? 6 : 13)
/** Sélecteur de photos d'une carte, décalé par carte pour que deux voisines n'aient pas les mêmes images. */
export function pickerFor(t: Tool, i: number, p: { viral: string[]; bank: string[]; real?: boolean }): (k: number) => string | null {
  if (t.id === 'story' && !p.real) return STORY_PICK
  const pool = t.cat === 'create' || t.cat === 'bank' ? [...p.bank, ...p.viral] : [...p.viral, ...p.bank]
  return (k: number) => pool.length ? pool[(i * 3 + k) % pool.length] : null
}

const STAR = 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'
const ARROW = 'M5 12h14|M13 6l6 6-6 6'
function Badge({ b }: { b: Tool['badge'] }) {
  if (!b) return null
  const nu = b === 'Nouveau', reco = b === 'Recommandé'
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 750, letterSpacing: '.01em', background: reco ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : nu ? '#F4F4F5' : 'rgba(10,10,11,0.55)', color: nu ? '#0A0A0B' : '#F4F4F5', border: nu || reco ? 'none' : '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)', whiteSpace: 'nowrap', boxShadow: reco ? '0 6px 16px -6px rgba(236,72,153,.8)' : 'none' }}>{reco ? '✦ ' : ''}{b}</span>
}
function FavBtn({ on, show, onClick }: { on: boolean; show: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={on ? 'Retirer des favoris' : 'Ajouter aux favoris'} title={on ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={e => { e.stopPropagation(); onClick() }}
      style={{ position: 'absolute', zIndex: 4, top: 10, right: 10, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 99, border: 'none', cursor: 'pointer', background: 'rgba(10,10,11,0.55)', backdropFilter: 'blur(8px)', color: on ? '#FDE047' : '#fff', opacity: on || show ? 1 : 0, transition: 'opacity .15s ease' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d={STAR} /></svg>
    </button>
  )
}

// ── Visuel « vrais Reels » : les Reels qui explosent vraiment (Veille), avec leurs chiffres ──
const fmtScore = (s: number) => s >= 10 ? String(Math.round(s)) : s.toFixed(1).replace('.', ',')
export function ReelsArt({ reels, n = 3, offset = 0 }: { reels: TopReel[]; n?: number; offset?: number }) {
  const list = Array.from({ length: Math.min(n, reels.length) }, (_, i) => reels[(offset + i) % reels.length])
  return (
    <span style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${list.length}, 1fr)`, gap: 3, background: '#0A0A0B' }}>
      {list.map((r, i) => (
        <span key={`${r.thumb}-${i}`} style={{ position: 'relative', overflow: 'hidden' }}>
          <img src={r.thumb} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: `sfsKen ${9 + i * 2}s ease-in-out ${-i * 2}s infinite alternate` }} />
          <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.45), transparent 30%)' }} />
          <span style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
            {r.score > 0 && <span style={{ height: 21, padding: '0 7px', display: 'inline-flex', alignItems: 'center', borderRadius: 99, background: r.score >= 3 ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'rgba(10,10,11,.6)', color: '#fff', fontSize: 11, fontWeight: 800, boxShadow: r.score >= 3 ? '0 6px 16px -6px rgba(236,72,153,.8)' : 'none' }}>{r.score >= 3 ? '🔥 ' : ''}×{fmtScore(r.score)}</span>}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#fff', fontSize: 12.5, fontWeight: 800, textShadow: '0 1px 6px rgba(0,0,0,.7)' }}>▶ {compactFr(r.views)}</span>
          </span>
        </span>
      ))}
    </span>
  )
}
const compactFr = (n: number) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

// ── Carte d'outil : aperçu animé arrondi, texte dessous (sans cadre autour) ──────
export function ToolCard({ t, fav, onFav, onOpen, i, pick, art }: { t: Tool; fav: boolean; onFav?: () => void; onOpen: () => void; i: number; pick: (k: number) => string | null; art?: ReactNode }) {
  const [h, setH] = useState(false)
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', outline: 'none', animation: `sfsPop .45s ${Math.min(i, 16) * 0.025}s both` }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 10', borderRadius: 16, overflow: 'hidden', background: '#0F0F11', boxShadow: h ? '0 0 0 1px rgba(255,255,255,0.22), 0 24px 48px -28px rgba(0,0,0,0.9)' : '0 0 0 1px rgba(255,255,255,0.06)', transition: 'box-shadow .2s ease' }}>
        <span style={{ position: 'absolute', inset: 0, transform: h ? 'scale(1.035)' : 'none', transition: 'transform .6s cubic-bezier(.2,.8,.2,1)' }}>{art ?? <ToolArt t={t} pick={pick} />}</span>
        {t.badge && <span style={{ position: 'absolute', zIndex: 4, top: 10, left: 10 }}><Badge b={t.badge} /></span>}
        {onFav && <FavBtn on={fav} show={h} onClick={onFav} />}
      </div>
      <div style={{ display: 'flex', gap: 11, padding: '0 2px' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: `linear-gradient(135deg, ${t.a}, ${t.b})`, color: '#fff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }}><Icon d={t.icon} size={14} /></span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.015em', color: '#F4F4F5' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
            <span style={{ display: 'flex', color: h ? '#F4F4F5' : 'transparent', transform: h ? 'translateX(0)' : 'translateX(-4px)', transition: 'all .18s ease', flexShrink: 0 }}><Icon d={ARROW} size={13} sw={2} /></span>
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: '#8B8B94', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.desc}</span>
          {t.cost && <span style={{ marginTop: 2, fontSize: 11.5, fontWeight: 600, color: '#5A5A63' }}>{t.cost}</span>}
        </span>
      </div>
    </div>
  )
}

// ── Tuile plein cadre (aperçu animé + texte par-dessus) : À la une, Accueil ─────
export function ToolTile({ t, pick, onOpen, size = 'md', kicker, title, text, cta, fav, onFav, i = 0, style, art }: {
  t: Tool; pick: (k: number) => string | null; onOpen: () => void; size?: 'xl' | 'md' | 'sm'
  kicker?: string; title?: ReactNode; text?: ReactNode; cta?: string; fav?: boolean; onFav?: () => void; i?: number; style?: React.CSSProperties; art?: ReactNode
}) {
  const [h, setH] = useState(false)
  const xl = size === 'xl', sm = size === 'sm'
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', overflow: 'hidden', borderRadius: sm ? 18 : 22, cursor: 'pointer', outline: 'none', background: '#0F0F11', minHeight: 0,
        boxShadow: h ? '0 0 0 1px rgba(255,255,255,0.24), 0 30px 60px -30px rgba(0,0,0,0.95)' : '0 0 0 1px rgba(255,255,255,0.06)', transform: h ? 'translateY(-3px)' : 'none',
        transition: 'transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s ease', animation: `sfsPop .5s ${Math.min(i, 10) * 0.04}s both`, ...style }}>
      <span style={{ position: 'absolute', inset: 0, transform: h ? 'scale(1.04)' : 'none', transition: 'transform .8s cubic-bezier(.2,.8,.2,1)' }}>{art ?? <ToolArt t={t} pick={pick} />}</span>
      {/* Fondu presque opaque en bas : le texte ne se mélange pas aux étiquettes de l'aperçu. */}
      <span style={{ position: 'absolute', inset: 0, zIndex: 3, background: xl
        ? 'linear-gradient(180deg, rgba(8,8,9,0) 34%, rgba(8,8,9,0.78) 60%, rgba(8,8,9,0.97) 80%)'
        : sm ? 'linear-gradient(180deg, rgba(8,8,9,0) 40%, rgba(8,8,9,0.84) 66%, rgba(8,8,9,0.98) 82%)'
        : 'linear-gradient(180deg, rgba(8,8,9,0.05) 10%, rgba(8,8,9,0.8) 48%, rgba(8,8,9,0.97) 72%)', pointerEvents: 'none' }} />
      {onFav && <FavBtn on={!!fav} show={h} onClick={onFav} />}
      <span style={{ position: 'absolute', zIndex: 4, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', gap: xl ? 10 : sm ? 4 : 6, padding: xl ? '0 28px 26px' : sm ? '0 14px 14px' : '0 20px 18px', pointerEvents: 'none' }}>
        {kicker && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#C4B5FD' }}>{kicker}</span>}
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: xl ? 'clamp(26px, 2.6vw, 36px)' : sm ? 15 : 20, fontWeight: 800, letterSpacing: xl ? '-0.04em' : '-0.025em', lineHeight: 1.08, color: '#fff' }}>
          {!xl && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: sm ? 24 : 28, height: sm ? 24 : 28, borderRadius: sm ? 7 : 8, flexShrink: 0, background: `linear-gradient(135deg, ${t.a}, ${t.b})`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)' }}><Icon d={t.icon} size={sm ? 12 : 13} /></span>}
          <span style={{ minWidth: 0 }}>{title ?? t.label}</span>
        </span>
        {!sm && (text ?? t.desc) && <span style={{ maxWidth: xl ? 460 : 340, fontSize: xl ? 14.5 : 13, lineHeight: 1.5, color: '#D4D4D8', display: '-webkit-box', WebkitLineClamp: xl ? 3 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text ?? t.desc}</span>}
        {sm && <span style={{ minHeight: 15, fontSize: 11.5, fontWeight: 600, color: '#A1A1AA' }}>{t.cost ?? ''}</span>}
        {cta && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 'fit-content', marginTop: 6, height: 40, padding: '0 16px', borderRadius: 11, background: '#F4F4F5', color: '#0A0A0B', fontSize: 14, fontWeight: 750 }}>
            {cta}<Icon d={ARROW} size={14} sw={2.2} />
          </span>
        )}
      </span>
    </div>
  )
}

// ── Titre de section : nom, compte, lien à droite ─────────────────────────────
export function SectionHead({ title, count, right }: { title: ReactNode; count?: number; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 2px 14px' }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 19, fontWeight: 750, letterSpacing: '-0.025em', color: '#F4F4F5' }}>
        {title}{count !== undefined && <span style={{ fontSize: 14, fontWeight: 600, color: '#5A5A63' }}>{count}</span>}
      </h2>
      {right}
    </div>
  )
}
export function LinkBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 9, border: 'none', background: 'transparent', color: '#A1A1AA', fontSize: 13, fontWeight: 650, cursor: 'pointer', transition: 'background .15s ease, color .15s ease' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#F4F4F5' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' }}>
      {label}<Icon d={ARROW} size={13} sw={2} />
    </button>
  )
}

// « À la une » : textes des tuiles mises en avant.
const FEATURED: { tool: string; kicker: string; title: string; text: string; cta: string }[] = [
  { tool: 'viral', kicker: 'À la une', title: 'Repère les Reels qui explosent', text: 'FR et US, classés par vues, avec le badge « ×N la normale ». Ouvre un compte comme sur Instagram, télécharge, inspire-toi.', cta: 'Ouvrir la Veille' },
  { tool: 'autocontent', kicker: '✦ Recommandé', title: 'Une vidéo → des dizaines de vidéos uniques', text: 'Légendes, coupe, vitesse et spoof en un clic : chaque compte reçoit sa propre vidéo.', cta: 'Lancer l’Auto-contenu' },
  { tool: 'genjutsu', kicker: 'Nouveau', title: 'Recrée un Reel avec tes images', text: 'Le mouvement d’un Reel viral, appliqué à tes photos de référence.', cta: 'Essayer' },
  { tool: 'links', kicker: 'Analyse', title: 'Sache quel compte te rapporte', text: 'Un lien suivi par compte : visites, clics et pays en direct.', cta: 'Voir mes liens' },
  { tool: 'remix', kicker: 'Studio', title: 'Une vidéo, 24 variantes', text: 'Chaque compte publie une version unique.', cta: 'Ouvrir le Remix' },
  { tool: 'warmup', kicker: 'Comptes', title: 'Chauffe tes comptes', text: 'Scroll, likes et follows automatiques.', cta: 'Lancer un warmup' },
]

export default function Explore({ infra, isAdmin, onOpen, user, org }: { theme: Theme; infra: InfraKey; isAdmin: boolean; onOpen: (t: Tool) => void; user: User; org: OrgState }) {
  const photos = usePhotos(user, org)
  const narrow = useNarrow(760)
  const mid = useNarrow(1100)
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  // « / » place le curseur dans la recherche (hors champ de saisie).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])
  const [cat, setCat] = useState<ToolCat | 'all' | 'fav'>('all')
  const [favs, setFavs] = useState<string[]>(loadFavs)
  const all = useMemo(() => visibleTools(infra, isAdmin), [infra, isAdmin])
  const byId = useMemo(() => new Map(all.map(t => [t.id, t])), [all])
  const recent = useMemo(() => recentTools().map(id => byId.get(id)).filter(Boolean) as Tool[], [byId])
  const featured = FEATURED.map(f => ({ f, t: byId.get(f.tool) })).filter((x): x is { f: typeof FEATURED[number]; t: Tool } => !!x.t).slice(0, 3)
  const toggleFav = (id: string) => setFavs(f => { const n = f.includes(id) ? f.filter(x => x !== id) : [...f, id]; try { localStorage.setItem(FAV_KEY, JSON.stringify(n)) } catch { /* ignore */ } return n })
  // Vraies images des Reels qui explosent (Veille) : visuel de la Veille, source de Genjutsu…
  const top = useTopReels(12)
  const real = top && top.length >= 3 ? top : null
  const pickOf = (t: Tool, k: number) => {
    const base = pickerFor(t, k, photos)
    if (!real) return base
    if (t.id === 'genjutsu') return (j: number) => j === 0 ? real[k % real.length].thumb : base(j)
    if (t.id === 'viral-mine') return (j: number) => j === 3 ? real[(k + 4) % real.length].thumb : base(j)
    return base
  }
  const artOf = (t: Tool, n: number, offset = 0) => real && t.id === 'viral' ? <ReelsArt reels={real} n={n} offset={offset} /> : undefined
  const goCat = (c: typeof cat) => { setCat(c); try { document.querySelector('main')?.scrollTo?.({ top: 0, behavior: 'smooth' }) } catch { /* ignore */ } }

  const found = searchTools(all, q)
  const list = cat === 'all' ? found : cat === 'fav' ? found.filter(t => favs.includes(t.id)) : found.filter(t => t.cat === cat)
  const home = cat === 'all' && !q.trim()
  // Vue « Tout » : les outils déjà « À la une » ne sont pas répétés dans les catégories.
  const featuredIds = new Set(featured.map(x => x.t.id))
  const sections = home ? CATS.map(c => ({ c, items: list.filter(t => t.cat === c.k && !featuredIds.has(t.id)) })).filter(s => s.items.length) : [{ c: null, items: list }]
  const tabs: [typeof cat, string, number][] = [['all', 'Tout', found.length], ...CATS.map(c => [c.k, c.label, found.filter(t => t.cat === c.k).length] as [ToolCat, string, number]), ['fav', '★ Favoris', found.filter(t => favs.includes(t.id)).length]]
  const grid = (items: Tool[], base: number) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${narrow ? 200 : 250}px, 100%), 1fr))`, gap: narrow ? '22px 12px' : '28px 18px' }}>
      {items.map((t, j) => <ToolCard key={t.id} t={t} i={base + j} pick={pickOf(t, base + j)} art={artOf(t, 3, 3)} fav={favs.includes(t.id)} onFav={() => toggleFav(t.id)} onOpen={() => onOpen(t)} />)}
    </div>
  )
  let idx = 0

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{SPOT_KEYFRAMES}</style>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#71717A' }}>{all.length} outils</span>
          <h1 style={{ margin: '4px 0 0', fontSize: narrow ? 30 : 38, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: '#F4F4F5' }}>Explorer</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.5, color: '#8B8B94' }}>Publier, créer, gérer tes comptes, analyser : choisis un outil et lance-toi.</p>
        </div>
        <span style={{ position: 'relative', width: narrow ? '100%' : 'min(420px, 100%)' }}>
          <span style={{ position: 'absolute', left: 15, top: 14, color: '#71717A', display: 'flex' }}><Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3" size={17} /></span>
          <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQ(''); e.currentTarget.blur() } }} placeholder="Rechercher un outil…" aria-label="Rechercher un outil"
            style={{ width: '100%', boxSizing: 'border-box', height: 46, padding: '0 44px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.09)', background: '#111113', color: '#F4F4F5', fontSize: 14.5, outline: 'none' }} />
          {q
            ? <button type="button" aria-label="Effacer" onClick={() => setQ('')} style={{ position: 'absolute', right: 10, top: 11, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#A1A1AA', cursor: 'pointer' }}><Icon d="M18 6L6 18|M6 6l12 12" size={12} sw={2.2} /></button>
            : <kbd style={{ position: 'absolute', right: 12, top: 13, height: 20, minWidth: 20, padding: '0 6px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(255,255,255,0.14)', fontSize: 11, color: '#8B8B94', fontFamily: 'inherit' }}>/</kbd>}
        </span>
      </div>

      {/* Onglets (restent visibles au défilement) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 6, margin: narrow ? '0 -16px 24px' : '0 -32px 28px', padding: narrow ? '0 16px' : '0 32px', background: 'rgba(10,10,11,0.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {tabs.map(([k, l, n]) => {
            const on = cat === k
            return (
              <button key={k} type="button" onClick={() => goCat(k)} aria-pressed={on}
                style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 48, padding: '0 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: on ? 700 : 600, color: on ? '#F4F4F5' : '#71717A', transition: 'color .15s ease' }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.color = '#D4D4D8' }} onMouseLeave={e => { if (!on) e.currentTarget.style.color = '#71717A' }}>
                {l}<span style={{ fontSize: 12, fontWeight: 600, color: on ? '#A1A1AA' : '#52525B' }}>{n}</span>
                <span style={{ position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, borderRadius: 2, background: on ? '#F4F4F5' : 'transparent' }} />
              </button>
            )
          })}
        </div>
      </div>

      {/* À la une : une grande tuile + deux moyennes */}
      {home && featured.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : mid ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1.9fr) minmax(0,1fr)', gridTemplateRows: narrow || mid ? undefined : '220px 220px', gap: narrow ? 12 : 16 }}>
            {featured.map(({ f, t }, j) => (
              <ToolTile key={t.id} t={t} i={j} pick={pickOf(t, j * 4 + 1)} art={artOf(t, narrow ? 2 : 3)} size={j === 0 ? 'xl' : 'md'} kicker={f.kicker} title={f.title} text={f.text} cta={j === 0 ? f.cta : undefined}
                fav={favs.includes(t.id)} onFav={() => toggleFav(t.id)} onOpen={() => onOpen(t)}
                style={j === 0 ? (narrow ? { height: 340 } : mid ? { gridColumn: 'span 2', height: 380 } : { gridRow: 'span 2' }) : (narrow || mid ? { height: 230 } : undefined)} />
            ))}
          </div>
        </section>
      )}

      {/* Récemment utilisés */}
      {home && recent.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <SectionHead title="Récemment utilisés" />
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {recent.map(t => (
              <button key={t.id} type="button" onClick={() => onOpen(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0, height: 48, padding: '0 16px 0 8px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: '#111113', color: '#EDEDEF', fontSize: 13.5, fontWeight: 650, cursor: 'pointer', transition: 'border-color .15s ease, background .15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.background = '#161618' }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = '#111113' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${t.a}, ${t.b})`, color: '#fff' }}><Icon d={t.icon} size={15} /></span>
                {t.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {list.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '64px 16px', textAlign: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 99, border: '1px solid rgba(255,255,255,0.12)', color: '#A1A1AA' }}><Icon d={cat === 'fav' ? STAR : 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3'} size={20} /></span>
          <b style={{ fontSize: 17, fontWeight: 750, color: '#F4F4F5' }}>{cat === 'fav' ? 'Aucun favori pour l’instant' : 'Aucun outil trouvé'}</b>
          <span style={{ fontSize: 13.5, color: '#8B8B94', maxWidth: 360 }}>{cat === 'fav' ? 'Touche l’étoile d’un outil pour l’épingler ici.' : 'Essaie un autre mot : « story », « tiktok », « légendes »…'}</span>
        </div>
      ) : sections.map(({ c, items }) => {
        const base = idx; idx += items.length
        return (
          <section key={c?.k ?? 'all'} style={{ marginBottom: 44 }}>
            {c && <SectionHead title={c.label} count={items.length} right={<LinkBtn label="Tout voir" onClick={() => goCat(c.k)} />} />}
            {grid(items, base)}
          </section>
        )
      })}
    </div>
  )
}
