// Explorer : TOUS les outils de ScaleFlow en galerie (façon Higgsfield). Bandeau « À la
// une » animé, recherche, catégories, favoris, récemment utilisés. Un clic ouvre l'outil
// précis (onglet / format) via openTool. Catalogue : src/lib/tools.ts.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Theme, InfraKey } from '@/lib/theme'
import { Icon, FIELD, useNarrow } from '@/lib/ui'
import { CATS, searchTools, visibleTools, type Tool, type ToolCat } from '@/lib/tools'
import { recentTools } from '@/lib/openTool'
import { SPOT_KEYFRAMES, VisualLinks, VisualTikTok, VisualViral, VisualHome } from '@/components/LaunchSpotlight'

const FAV_KEY = 'sf-fav-tools'
function loadFavs(): string[] { try { const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }

interface Featured { tool: string; kicker: string; title: string; text: string; cta: string; a: string; b: string; visual: () => ReactNode }
const FEATURED: Featured[] = [
  { tool: 'viral', kicker: 'Veille Reels', title: 'Repère les Reels qui explosent', text: 'FR et US, classés par vues, avec le badge « ×N la normale ». Télécharge, copie la légende, inspire-toi.', cta: 'Ouvrir la Veille', a: '#F97316', b: '#450A0A', visual: VisualViral },
  { tool: 'ai-captions', kicker: 'Outils IA', title: 'Des dizaines de légendes en 10 secondes', text: 'Légendes, bios et pseudos générés dans le ton de ta niche, prêts pour tes posts et l’édition en masse.', cta: 'Générer des légendes', a: '#7C3AED', b: '#2E1065', visual: VisualHome },
  { tool: 'links', kicker: 'Liens ScaleFlow', title: 'Sache quel compte te rapporte', text: 'Une page de liens animée et un lien suivi par compte : visites, clics, pays, en direct.', cta: 'Voir mes liens', a: '#EC4899', b: '#4A044E', visual: VisualLinks },
  { tool: 'tiktok', kicker: 'TikTok', title: 'Instagram et TikTok, un seul outil', text: 'Une vidéo publiée sur tous tes comptes TikTok en parallèle, comme tes Reels.', cta: 'Publier sur TikTok', a: '#0EA5B7', b: '#3B0A1E', visual: VisualTikTok },
]

// ── Carte d'outil : aperçu animé en dégradé + texte ───────────────────────────
function ToolCard({ t, fav, onFav, onOpen, i }: { t: Tool; fav: boolean; onFav: () => void; onOpen: () => void; i: number }) {
  const [h, setH] = useState(false)
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: '#111113', border: `1px solid ${h ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'}`, transform: h ? 'translateY(-3px)' : 'none', boxShadow: h ? `0 18px 40px -18px ${t.a}88` : 'none', transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease', animation: `sfsPop .45s ${Math.min(i, 16) * 0.03}s both` }}>
      <div style={{ position: 'relative', height: 118, overflow: 'hidden', background: `linear-gradient(135deg, ${t.a}, ${t.b})` }}>
        <span style={{ position: 'absolute', width: 140, height: 140, borderRadius: 99, background: 'rgba(255,255,255,0.18)', filter: 'blur(28px)', top: -50, right: -30, animation: 'sfsGlow 7s ease-in-out infinite', animationDelay: `-${i % 7}s` }} />
        <span style={{ position: 'absolute', width: 90, height: 90, borderRadius: 99, background: 'rgba(0,0,0,0.25)', filter: 'blur(24px)', bottom: -40, left: -20 }} />
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: h ? 'scale(1.12) rotate(-4deg)' : 'none', transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 54, height: 54, borderRadius: 16, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(6px)', color: '#fff', boxShadow: '0 10px 30px -10px rgba(0,0,0,.5)' }}>
            <Icon d={t.icon} size={24} sw={1.9} />
          </span>
        </span>
        {t.badge && <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', background: t.badge === 'Nouveau' ? '#fff' : 'rgba(0,0,0,0.45)', color: t.badge === 'Nouveau' ? '#0A0A0B' : '#fff', backdropFilter: 'blur(4px)' }}>{t.badge}</span>}
        <button type="button" aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={e => { e.stopPropagation(); onFav() }}
          style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.3)', color: fav ? '#FDE047' : 'rgba(255,255,255,0.8)', opacity: fav || h ? 1 : 0, transition: 'opacity .15s ease' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '12px 14px 13px', flex: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>{t.label}</span>
        <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.desc}</span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <span style={{ fontSize: 11.5, color: '#71717A' }}>{t.cost ?? ''}</span>
          <span style={{ display: 'flex', color: h ? '#EDEDEF' : '#52525B', transform: h ? 'translateX(2px)' : 'none', transition: 'all .15s ease' }}><Icon d="M5 12h14|M13 6l6 6-6 6" size={14} /></span>
        </span>
      </div>
    </div>
  )
}

// ── Bandeau « À la une » ─────────────────────────────────────────────────────
function Hero({ items, onOpen }: { items: { f: Featured; t: Tool }[]; onOpen: (t: Tool) => void }) {
  const [k, setK] = useState(0)
  const [paused, setPaused] = useState(false)
  const narrow = useNarrow(820)
  useEffect(() => {
    if (paused || items.length < 2) return
    const id = setTimeout(() => setK(x => (x + 1) % items.length), 6500)
    return () => clearTimeout(id)
  }, [k, paused, items.length])
  if (!items.length) return null
  const { f, t } = items[k % items.length]
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      style={{ position: 'relative', display: 'flex', flexDirection: narrow ? 'column' : 'row', minHeight: narrow ? 0 : 300, borderRadius: 18, overflow: 'hidden', marginBottom: 22, border: '1px solid rgba(255,255,255,0.08)', background: `radial-gradient(120% 120% at 85% 20%, ${f.a} 0%, ${f.b} 50%, #0A0A0B 100%)`, transition: 'background .6s ease' }}>
      <span style={{ position: 'absolute', width: 320, height: 320, borderRadius: 999, background: f.a, filter: 'blur(90px)', opacity: 0.35, top: -120, left: -80, animation: 'sfsGlow 9s ease-in-out infinite' }} />
      <div key={`t${k}`} style={{ position: 'relative', flex: '1 1 50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: narrow ? '26px 22px 8px' : '36px 40px', animation: 'sfsPop .45s both' }}>
        <span style={{ alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 99, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', fontSize: 11.5, fontWeight: 600, color: '#fff' }}>✨ À la une · {f.kicker}</span>
        <h2 style={{ margin: 0, fontSize: narrow ? 24 : 32, lineHeight: 1.08, fontWeight: 700, letterSpacing: '-0.035em', color: '#fff', maxWidth: 460 }}>{f.title}</h2>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.75)', maxWidth: 440 }}>{f.text}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
          <button type="button" onClick={() => onOpen(t)} style={{ height: 40, padding: '0 18px', border: 'none', borderRadius: 10, background: '#fff', color: '#0A0A0B', fontSize: 14, fontWeight: 650, cursor: 'pointer' }}>{f.cta} →</button>
          <span style={{ display: 'flex', gap: 6 }}>
            {items.map((_, j) => <button key={j} type="button" aria-label={`À la une ${j + 1}`} onClick={() => setK(j)} style={{ width: j === k % items.length ? 22 : 8, height: 8, padding: 0, border: 'none', borderRadius: 99, background: j === k % items.length ? '#fff' : 'rgba(255,255,255,0.35)', cursor: 'pointer', transition: 'width .25s ease' }} />)}
          </span>
        </div>
      </div>
      <div key={`v${k}`} onClick={() => onOpen(t)} style={{ position: 'relative', flex: '1 1 50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: narrow ? '10px 0 26px' : '24px 0', cursor: 'pointer', minHeight: narrow ? 240 : 0 }}><div style={{ transform: narrow ? 'scale(.72)' : 'none', transformOrigin: 'center' }}>{f.visual()}</div></div>
    </div>
  )
}

export default function Explore({ infra, isAdmin, onOpen }: { theme: Theme; infra: InfraKey; isAdmin: boolean; onOpen: (t: Tool) => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ToolCat | 'all' | 'fav'>('all')
  const [favs, setFavs] = useState<string[]>(loadFavs)
  const all = useMemo(() => visibleTools(infra, isAdmin), [infra, isAdmin])
  const byId = useMemo(() => new Map(all.map(t => [t.id, t])), [all])
  const recent = useMemo(() => recentTools().map(id => byId.get(id)).filter(Boolean) as Tool[], [byId])
  const featured = FEATURED.map(f => ({ f, t: byId.get(f.tool) })).filter((x): x is { f: Featured; t: Tool } => !!x.t)
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
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 650, letterSpacing: '-0.03em', color: '#EDEDEF' }}>Explorer</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#8B8B94' }}>{all.length} outils pour publier, créer, gérer et analyser — tout ScaleFlow au même endroit.</p>
        </div>
        <span style={{ position: 'relative', width: 'min(340px, 100%)' }}>
          <span style={{ position: 'absolute', left: 11, top: 9, color: '#71717A', display: 'flex' }}><Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3" size={15} /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un outil…" style={{ ...FIELD, height: 34, paddingLeft: 34, borderRadius: 10 }} />
        </span>
      </div>

      {!q.trim() && cat === 'all' && <Hero items={featured} onOpen={onOpen} />}

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
          {c && <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 650, color: '#EDEDEF', letterSpacing: '-0.01em' }}>{c.label} <span style={{ color: '#52525B', fontWeight: 500, fontSize: 13 }}>· {items.length}</span></h3>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 14 }}>
            {items.map(t => <ToolCard key={t.id} t={t} i={idx++} fav={favs.includes(t.id)} onFav={() => toggleFav(t.id)} onOpen={() => onOpen(t)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
