// Explorer : TOUS les outils de ScaleFlow en galerie (façon Higgsfield). Bandeau « À la
// une » animé, recherche, catégories, favoris, récemment utilisés. Un clic ouvre l'outil
// précis (onglet / format) via openTool. Catalogue : src/lib/tools.ts.
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import type { Theme, InfraKey } from '@/lib/theme'
import { Icon, FIELD } from '@/lib/ui'
import { CATS, searchTools, visibleTools, type Tool, type ToolCat } from '@/lib/tools'
import { recentTools } from '@/lib/openTool'
import ToolArt from '@/components/ToolArt'
import { SPOT_KEYFRAMES } from '@/components/LaunchSpotlight'
import { FeatureBanner } from '@/components/CineHero'

const FAV_KEY = 'sf-fav-tools'
function loadFavs(): string[] { try { const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'

// Vraies photos pour les cartes : miniatures de la Veille Reels (via le proxy d'images,
// Instagram bloque l'affichage direct) et de la banque de l'utilisateur.
export function usePhotos(user: User, org: OrgState): { viral: string[]; bank: string[] } {
  const [viral, setViral] = useState<string[]>([])
  const [bank, setBank] = useState<string[]>([])
  const orgId = org.currentOrg?.id ?? null
  useEffect(() => {
    let alive = true
    void (async () => {
      const r = await supabase.from('viral_reels').select('thumb, views').order('views', { ascending: false }).limit(24)
      const v = ((r.data ?? []) as { thumb: string | null }[]).map(x => x.thumb).filter((x): x is string => !!x)
      if (alive) setViral([...new Set(v)].map(u => `${FN_URL}?img=${encodeURIComponent(u)}`))
      const q = supabase.from('content_bank').select('thumbnail_url,thumbnail_path,storage_path,media_type,notes').is('deleted_at', null).order('created_at', { ascending: false }).limit(60)
      const b = await (orgId ? q.eq('org_id', orgId) : q.eq('user_id', user.id).is('org_id', null))
      const rows = ((b.data ?? []) as { thumbnail_url?: string | null; thumbnail_path?: string | null; storage_path?: string | null; media_type?: string | null; notes?: string | null }[])
        .filter(x => !/^__sf_/.test(x.notes ?? ''))
      const direct = rows.map(x => x.thumbnail_url).filter((x): x is string => !!x && /^https?:/.test(x))
      const paths = rows.map(x => x.thumbnail_url ? null : x.thumbnail_path ?? (x.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(x.storage_path ?? '') ? x.storage_path : null)).filter((x): x is string => !!x).slice(0, 30)
      let signed: string[] = []
      if (paths.length) {
        const { data } = await supabase.storage.from('content').createSignedUrls(paths, 3600)
        signed = (data ?? []).map(d => d.signedUrl).filter((x): x is string => !!x)
      }
      if (alive) setBank([...direct, ...signed].slice(0, 30))
    })().catch(() => {})
    return () => { alive = false }
  }, [user.id, orgId])
  return { viral, bank }
}
/** Sélecteur de photos d'une carte : banque d'abord pour Créer / Banque, Veille d'abord ailleurs ;
 *  décalé par carte pour que deux cartes voisines n'aient pas les mêmes images. */
export function pickerFor(t: Tool, i: number, p: { viral: string[]; bank: string[] }): (k: number) => string | null {
  const pool = t.cat === 'create' || t.cat === 'bank' ? [...p.bank, ...p.viral] : [...p.viral, ...p.bank]
  return (k: number) => pool.length ? pool[(i * 3 + k) % pool.length] : null
}

// ── Carte d'outil : aperçu animé en dégradé + texte ───────────────────────────
export function ToolCard({ t, fav, onFav, onOpen, i, pick }: { t: Tool; fav: boolean; onFav?: () => void; onOpen: () => void; i: number; pick: (k: number) => string | null }) {
  const [h, setH] = useState(false)
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: '#111113', border: `1px solid ${h ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'}`, transform: h ? 'translateY(-3px)' : 'none', boxShadow: h ? `0 18px 40px -18px ${t.a}88` : 'none', transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease', animation: `sfsPop .45s ${Math.min(i, 16) * 0.03}s both` }}>
      <div style={{ position: 'relative', height: 168, overflow: 'hidden', background: '#0A0A0B' }}>
        {/* Aperçu plein cadre propre à l'outil (vraies miniatures, animé). */}
        <span style={{ position: 'absolute', inset: 0, transform: h ? 'scale(1.04)' : 'none', transition: 'transform .5s cubic-bezier(.2,.8,.2,1)' }}><ToolArt t={t} pick={pick} /></span>
        {h && <span style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', zIndex: 3, pointerEvents: 'none', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)', animation: 'sfsSheen .9s ease-out both' }} />}
        {t.badge && <span style={{ position: 'absolute', zIndex: 4, top: 10, left: 10, padding: '3px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', background: t.badge === 'Nouveau' ? '#fff' : 'rgba(0,0,0,0.45)', color: t.badge === 'Nouveau' ? '#0A0A0B' : '#fff', backdropFilter: 'blur(4px)' }}>{t.badge}</span>}
        {onFav && <button type="button" aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={e => { e.stopPropagation(); onFav() }}
          style={{ position: 'absolute', zIndex: 4, top: 8, right: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.3)', color: fav ? '#FDE047' : 'rgba(255,255,255,0.8)', opacity: fav || h ? 1 : 0, transition: 'opacity .15s ease' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
        </button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '12px 14px 13px', flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg, ${t.a}, ${t.b})`, color: '#fff', flexShrink: 0 }}><Icon d={t.icon} size={12} /></span>{t.label}</span>
        <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.desc}</span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <span style={{ fontSize: 11.5, color: '#71717A' }}>{t.cost ?? ''}</span>
          <span style={{ display: 'flex', color: h ? '#EDEDEF' : '#52525B', transform: h ? 'translateX(2px)' : 'none', transition: 'all .15s ease' }}><Icon d="M5 12h14|M13 6l6 6-6 6" size={14} /></span>
        </span>
      </div>
    </div>
  )
}

// ── Bandeaux (photos plein cadre, aucun fond de couleur) ────────────────────
interface Slide { tool: string; kicker: string; line1: string; line2: string; text: string; cta: string }
const SLIDES: Slide[] = [
  { tool: 'viral', kicker: 'À la une · Veille Reels', line1: 'Repère les Reels', line2: 'qui explosent', text: 'FR et US, classés par vues, avec le badge « ×N la normale ». Télécharge, copie la légende, inspire-toi.', cta: 'Ouvrir la Veille' },
  { tool: 'links', kicker: 'À la une · Liens', line1: 'Sache quel compte', line2: 'te rapporte', text: 'Une page de liens animée et un lien suivi par compte : visites, clics, pays, en direct.', cta: 'Voir mes liens' },
  { tool: 'tiktok', kicker: 'À la une · TikTok', line1: 'Instagram et TikTok,', line2: 'un seul outil', text: 'Une vidéo publiée sur tous tes comptes TikTok en parallèle, comme tes Reels.', cta: 'Publier sur TikTok' },
  { tool: 'remix', kicker: 'À la une · Studio', line1: 'Une vidéo,', line2: '24 variantes uniques', text: 'Remix, spoof, sous-titres : chaque vidéo devient du contenu neuf pour chaque compte.', cta: 'Ouvrir le Remix' },
]
const CAT_BANNER: Record<ToolCat, { line1: string; line2: string; text: string }> = {
  publish: { line1: 'Publie partout', line2: 'en un clic', text: 'Reels, Stories, TikTok et posts programmés, sur des dizaines de comptes en parallèle.' },
  create: { line1: 'Du contenu unique', line2: 'à l’infini', text: 'Remix, spoof, sous-titres, montage : chaque vidéo devient des dizaines de variantes.' },
  accounts: { line1: 'Tes comptes', line2: 'sans y toucher', text: 'Warmup, connexion auto, édition en masse et Flow Builder pour tout automatiser.' },
  analyze: { line1: 'Ce qui marche,', line2: 'en direct', text: 'Veille Reels, liens trackés et activité : sache exactement ce qui performe.' },
  bank: { line1: 'Ta banque', line2: 'de contenu', text: 'Vidéos, images et légendes rangées par dossiers, prêtes à publier.' },
}

function Carousel({ items, onOpen, pool }: { items: { s: Slide; t: Tool }[]; onOpen: (t: Tool) => void; pool: string[] }) {
  const [k, setK] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || items.length < 2) return
    const id = setTimeout(() => setK(x => (x + 1) % items.length), 6500)
    return () => clearTimeout(id)
  }, [k, paused, items.length])
  if (!items.length) return null
  const cur = k % items.length
  const { s, t } = items[cur]
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} style={{ position: 'relative', marginBottom: 18 }}>
      <div key={cur}><FeatureBanner kicker={s.kicker} line1={s.line1} line2={s.line2} text={s.text} cta={`${s.cta} →`} onCta={() => onOpen(t)} height={300} photos={[0, 1, 2, 3].map(i => pool.length ? pool[(cur * 4 + i) % pool.length] : null)} /></div>
      <span style={{ position: 'absolute', right: 22, bottom: 20, zIndex: 3, display: 'flex', gap: 6 }}>
        {items.map((_, j) => <button key={j} type="button" aria-label={`À la une ${j + 1}`} onClick={() => setK(j)} style={{ width: j === cur ? 26 : 8, height: 8, padding: 0, border: 'none', borderRadius: 99, background: j === cur ? '#A78BFA' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'width .25s ease' }} />)}
      </span>
    </div>
  )
}

export default function Explore({ infra, isAdmin, onOpen, user, org }: { theme: Theme; infra: InfraKey; isAdmin: boolean; onOpen: (t: Tool) => void; user: User; org: OrgState }) {
  const photos = usePhotos(user, org)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ToolCat | 'all' | 'fav'>('all')
  const [favs, setFavs] = useState<string[]>(loadFavs)
  const all = useMemo(() => visibleTools(infra, isAdmin), [infra, isAdmin])
  const byId = useMemo(() => new Map(all.map(t => [t.id, t])), [all])
  const recent = useMemo(() => recentTools().map(id => byId.get(id)).filter(Boolean) as Tool[], [byId])
  const slides = SLIDES.map(s => ({ s, t: byId.get(s.tool) })).filter((x): x is { s: Slide; t: Tool } => !!x.t)
  const pool = [...photos.viral, ...photos.bank]
  const toggleFav = (id: string) => setFavs(f => { const n = f.includes(id) ? f.filter(x => x !== id) : [...f, id]; try { localStorage.setItem(FAV_KEY, JSON.stringify(n)) } catch { /* ignore */ } return n })

  const found = searchTools(all, q)
  const list = cat === 'all' ? found : cat === 'fav' ? found.filter(t => favs.includes(t.id)) : found.filter(t => t.cat === cat)
  const sections = cat === 'all' && !q.trim() ? CATS.map(c => ({ c, items: list.filter(t => t.cat === c.k) })).filter(s => s.items.length) : [{ c: null, items: list }]
  const chip = (k: typeof cat, label: string, n: number) => (
    <button key={k} type="button" onClick={() => setCat(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', borderRadius: 99, cursor: 'pointer', fontSize: 13, fontWeight: 550, border: `1px solid ${cat === k ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.1)'}`, background: cat === k ? '#EDEDEF' : '#111113', color: cat === k ? '#0A0A0B' : '#D4D4D8', transition: 'all .15s ease' }}>
      {label}<span style={{ fontSize: 11.5, opacity: 0.6 }}>{n}</span>
    </button>
  )
  let idx = 0
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{SPOT_KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#A78BFA' }}>● {all.length} outils</span>
          <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(30px, 3.4vw, 46px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.95, textTransform: 'uppercase', color: '#F4F4F5' }}>Explorer <span style={{ color: '#71717A' }}>ScaleFlow</span></h1>
        </div>
        <span style={{ position: 'relative', width: 'min(340px, 100%)' }}>
          <span style={{ position: 'absolute', left: 11, top: 9, color: '#71717A', display: 'flex' }}><Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3" size={15} /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un outil…" style={{ ...FIELD, height: 34, paddingLeft: 34, borderRadius: 10 }} />
        </span>
      </div>

      {!q.trim() && cat === 'all' && <Carousel items={slides} onOpen={onOpen} pool={pool} />}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {chip('all', 'Tout', found.length)}
        {CATS.map(c => chip(c.k, c.label, found.filter(t => t.cat === c.k).length))}
        {chip('fav', '★ Favoris', found.filter(t => favs.includes(t.id)).length)}
      </div>

      {!q.trim() && cat === 'all' && recent.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: '#EDEDEF' }}>Récemment utilisés</h3>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {recent.map(t => (
              <button key={t.id} type="button" onClick={() => onOpen(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, flexShrink: 0, height: 42, padding: '0 14px 0 6px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: '#111113', color: '#EDEDEF', fontSize: 13, fontWeight: 550, cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${t.a}, ${t.b})`, color: '#fff' }}><Icon d={t.icon} size={15} /></span>
                {t.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {list.length === 0 ? (
        <div style={{ padding: '48px 16px', textAlign: 'center', color: '#71717A', fontSize: 14, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 14 }}>
          {cat === 'fav' ? 'Aucun favori pour l’instant — touche l’étoile d’un outil pour l’épingler ici.' : 'Aucun outil ne correspond à ta recherche.'}
        </div>
      ) : sections.map(({ c, items }) => (
        <section key={c?.k ?? 'all'} style={{ marginBottom: 28 }}>
          {c && (() => { const B = CAT_BANNER[c.k]; const top = items.find(t => t.badge === 'Populaire') ?? items[0]; const off = CATS.findIndex(x => x.k === c.k) * 3
            return <div style={{ marginBottom: 14 }}><FeatureBanner compact height={170} kicker={`${c.label} · ${items.length} outil(s)`} line1={B.line1} line2={B.line2} text={B.text} cta={`${top.label} →`} onCta={() => onOpen(top)} photos={[0, 1, 2, 3].map(i => pool.length ? pool[(off + i + 5) % pool.length] : null)} /></div> })()}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 14 }}>
            {items.map(t => { const k = idx++; return <ToolCard key={t.id} t={t} i={k} pick={pickerFor(t, k, photos)} fav={favs.includes(t.id)} onFav={() => toggleFav(t.id)} onOpen={() => onOpen(t)} /> })}
          </div>
        </section>
      ))}
    </div>
  )
}
