// Accueil façon « cinéma » (inspiré Higgsfield) : grand bandeau avec de vraies photos de
// part et d'autre d'un titre XXL, bouton vif ; puis une vitrine des Reels qui explosent
// (grandes cartes plein cadre). Photos = miniatures Veille Reels (via le proxy d'images).
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtNumber } from '@/lib/data'
import { useNarrow } from '@/lib/ui'

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'
const LIME = '#A78BFA'   // accent ScaleFlow (violet)
export interface TopReel { thumb: string; username: string; views: number; score: number }
const proxied = (u: string) => `${FN_URL}?img=${encodeURIComponent(u)}`

/** Reels les plus vus des 7 derniers jours (Sélection ScaleFlow + comptes de l'équipe). */
export function useTopReels(n = 8): TopReel[] | null {
  const [list, setList] = useState<TopReel[] | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
      let r = await supabase.from('viral_reels').select('thumb, username, views, score').gte('taken_at', since).order('views', { ascending: false }).limit(n * 2)
      if (!r.error && (r.data ?? []).length < 4) r = await supabase.from('viral_reels').select('thumb, username, views, score').order('views', { ascending: false }).limit(n * 2)
      const seen = new Set<string>()
      const out = ((r.data ?? []) as TopReel[]).filter(x => x.thumb && !seen.has(x.thumb) && seen.add(x.thumb)).slice(0, n).map(x => ({ ...x, thumb: proxied(x.thumb) }))
      if (alive) setList(out)
    })().catch(() => { if (alive) setList([]) })
    return () => { alive = false }
  }, [n])
  return list
}

const H1: React.CSSProperties = { margin: 0, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.95, textTransform: 'uppercase' }
export const CINE_KEYFRAMES = `
  @keyframes cineKen{from{transform:scale(1.04)}to{transform:scale(1.14) translate(-1.5%,-1%)}}
  @keyframes cineStreak{0%{transform:translateX(-30%) rotate(-28deg);opacity:.0}20%{opacity:.9}100%{transform:translateX(130%) rotate(-28deg);opacity:0}}
  @keyframes cineUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  @keyframes cineGlow{0%,100%{opacity:.55}50%{opacity:.9}}
  @media (prefers-reduced-motion: reduce){.sf-cine *{animation:none!important}}
`

function Side({ src, side }: { src: string | null; side: 'left' | 'right' }) {
  const mask = `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, #000 35%, transparent 100%)`
  return (
    <span style={{ position: 'absolute', top: 0, bottom: 0, [side]: 0, width: '38%', overflow: 'hidden', WebkitMaskImage: mask, maskImage: mask }}>
      {src
        ? <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', filter: 'grayscale(.15) contrast(1.05) brightness(.8)', animation: `cineKen 14s ease-in-out ${side === 'left' ? 0 : -7}s infinite alternate` }} />
        : null}
    </span>
  )
}

export function HomeHero({ photos, kicker, line1, line2, sub, cta, onCta, secondary, onSecondary, footer }: {
  photos: string[]; kicker: string; line1: ReactNode; line2: ReactNode; sub: ReactNode
  cta: string; onCta: () => void; secondary?: string; onSecondary?: () => void; footer?: ReactNode
}) {
  const narrow = useNarrow(760)
  return (
    <section className="sf-cine" style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, border: '1px solid rgba(255,255,255,0.07)', background: '#0C0C0D', minHeight: narrow ? 300 : 330, marginBottom: 16 }}>
      <style>{CINE_KEYFRAMES}</style>
      {!narrow && <><Side src={photos[0] ?? null} side="left" /><Side src={photos[1] ?? null} side="right" /></>}
      {narrow && photos[0] && <span style={{ position: 'absolute', inset: 0, opacity: 0.35 }}><img src={photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', animation: 'cineKen 14s ease-in-out infinite alternate' }} /></span>}
      <span style={{ position: 'absolute', inset: 0, background: 'radial-gradient(40% 60% at 50% 45%, rgba(12,12,13,.0), rgba(12,12,13,.35))' }} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: narrow ? '34px 18px 22px' : '40px 24px 26px', maxWidth: 640, margin: '0 auto', animation: 'cineUp .6s cubic-bezier(.2,.8,.2,1) both' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#EDEDEF' }}>{kicker}</span>
        <h1 style={{ ...H1, fontSize: narrow ? 34 : 'clamp(40px, 4.6vw, 62px)' }}>
          <span style={{ display: 'block', color: '#F4F4F5' }}>{line1}</span>
          <span style={{ display: 'block', color: '#A1A1AA' }}>{line2}</span>
        </h1>
        <span style={{ fontSize: 14.5, fontWeight: 500, color: '#A1A1AA' }}>{sub}</span>
        <span style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={onCta} style={{ height: 42, padding: '0 20px', border: 'none', borderRadius: 11, background: LIME, color: '#fff', fontSize: 14, fontWeight: 750, cursor: 'pointer', boxShadow: '0 4px 0 #6D28D9, 0 14px 30px -10px rgba(167,139,250,.55)', transition: 'transform .12s ease' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'translateY(2px)' }} onMouseUp={e => { e.currentTarget.style.transform = 'none' }} onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}>{cta}</button>
          {secondary && onSecondary && <button type="button" onClick={onSecondary} style={{ height: 42, padding: '0 18px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#EDEDEF', fontSize: 14, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(6px)' }}>{secondary}</button>}
        </span>
        {footer && <span style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{footer}</span>}
      </div>
    </section>
  )
}

/** Vitrine « Veille Reels » : bandeau à reflet animé + 4 grandes cartes plein cadre. */
export function ViralShowcase({ reels, onOpen }: { reels: TopReel[]; onOpen: () => void }) {
  const narrow = useNarrow(760)
  if (reels.length < 2) return null
  const best = reels.reduce((m, r) => Math.max(m, r.score || 0), 0)
  const total = reels.reduce((s, r) => s + (r.views || 0), 0)
  return (
    <section className="sf-cine" style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, border: '1px solid rgba(255,255,255,0.07)', background: '#0C0C0D', marginBottom: 16 }}>
      <style>{CINE_KEYFRAMES}</style>
      <span style={{ position: 'absolute', top: -120, left: '20%', width: 260, height: 520, background: `linear-gradient(90deg, transparent, ${LIME}55, transparent)`, filter: 'blur(28px)', animation: 'cineStreak 7s ease-in-out infinite' }} />
      <span style={{ position: 'absolute', top: -80, left: '45%', width: 380, height: 380, borderRadius: 999, background: 'radial-gradient(circle, rgba(167,139,250,.12), transparent 70%)', animation: 'cineGlow 5s ease-in-out infinite' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', padding: narrow ? '24px 18px 18px' : '30px 30px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: LIME }}>● Veille Reels</span>
          <h2 style={{ ...H1, marginTop: 10, fontSize: narrow ? 28 : 'clamp(30px, 3.4vw, 46px)' }}>
            <span style={{ display: 'block', color: '#F4F4F5' }}>Les Reels qui explosent</span>
            <span style={{ display: 'block', color: '#A1A1AA' }}>cette semaine</span>
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: LIME }}>Meilleur ratio · ×{best >= 10 ? Math.round(best) : best.toFixed(1)} la normale</span>
          <span style={{ display: 'flex', gap: 14, padding: '9px 16px', borderRadius: 11, border: `1px solid ${LIME}55`, background: 'rgba(167,139,250,0.06)', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: LIME }}>
            <span>{fmtNumber(reels.length)} REELS</span><span style={{ opacity: 0.5 }}>:</span><span>{total >= 1e6 ? `${(total / 1e6).toFixed(1)}M` : `${Math.round(total / 1e3)}K`} VUES</span>
          </span>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 14, padding: narrow ? 14 : 22 }}>
        {reels.slice(0, 4).map((r, i) => (
          <button key={r.thumb} type="button" onClick={onOpen} style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', padding: 0, cursor: 'pointer', background: '#161618', animation: `cineUp .5s ${0.1 + i * 0.08}s both` }}
            onMouseEnter={e => { const im = e.currentTarget.querySelector('img'); if (im) im.style.transform = 'scale(1.06)' }}
            onMouseLeave={e => { const im = e.currentTarget.querySelector('img'); if (im) im.style.transform = 'none' }}>
            <img src={r.thumb} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .6s cubic-bezier(.2,.8,.2,1)' }} />
            <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.75), transparent 50%)' }} />
            {r.score > 0 && <span style={{ position: 'absolute', top: 0, right: 14, padding: '9px 7px 11px', background: i === 0 ? LIME : 'rgba(10,10,11,.75)', color: i === 0 ? '#0A0A0B' : '#fff', fontSize: 12, fontWeight: 900, clipPath: 'polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)' }}>×{r.score >= 10 ? Math.round(r.score) : r.score.toFixed(1)}</span>}
            <span style={{ position: 'absolute', left: 12, right: 12, bottom: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, textAlign: 'left' }}>
              <span data-no-tr style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{r.username}</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap' }}>▶ {r.views >= 1e6 ? `${(r.views / 1e6).toFixed(1)}M` : `${Math.round(r.views / 1e3)}k`}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Kit « cinéma » partagé (Accueil, Explorer) ────────────────────────────────
/** Grand bloc arrondi : intitulé vif, titre XXL deux tons, contenu. */
export function CineSection({ kicker, line1, line2, right, children, pad = true }: { kicker: string; line1: ReactNode; line2?: ReactNode; right?: ReactNode; children?: ReactNode; pad?: boolean }) {
  const narrow = useNarrow(760)
  return (
    <section className="sf-cine" style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, border: '1px solid rgba(255,255,255,0.07)', background: '#0C0C0D', marginBottom: 16 }}>
      <style>{CINE_KEYFRAMES}</style>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: narrow ? '22px 18px 14px' : '26px 28px 18px' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: LIME }}>● {kicker}</span>
          <h2 style={{ ...H1, marginTop: 8, fontSize: narrow ? 24 : 'clamp(26px, 2.6vw, 36px)' }}>
            <span style={{ color: '#F4F4F5' }}>{line1}</span>{line2 && <> <span style={{ color: '#71717A' }}>{line2}</span></>}
          </h2>
        </div>
        {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{right}</div>}
      </div>
      <div style={{ position: 'relative', padding: pad ? (narrow ? '0 14px 16px' : '0 22px 22px') : 0 }}>{children}</div>
    </section>
  )
}

/** Gros chiffre (tuile sombre, intitulé en capitales). */
export function CineStat({ label, value, sub, accent, extra, onClick }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; extra?: ReactNode; onClick?: () => void }) {
  const [h, setH] = useState(false)
  return (
    <button type="button" onClick={onClick} disabled={!onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 18px 16px', borderRadius: 16, textAlign: 'left', minWidth: 0, color: 'inherit', cursor: onClick ? 'pointer' : 'default',
        background: '#121214', border: `1px solid ${h && onClick ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)'}`, transform: h && onClick ? 'translateY(-2px)' : 'none', transition: 'transform .2s ease, border-color .2s ease' }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8B8B94' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.95, color: accent ?? '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {extra}
      </span>
      <span style={{ minHeight: 16, fontSize: 12 }}>{sub}</span>
    </button>
  )
}

/** Bandeau PLEIN CADRE : photos sur toute la largeur (zoom lent), voile noir à gauche pour
 *  le texte, titre XXL + action. Aucun fond de couleur. */
export function FeatureBanner({ kicker, line1, line2, text, cta, onCta, photos, meta, height = 220, compact }: {
  kicker: string; line1: ReactNode; line2?: ReactNode; text?: ReactNode; cta?: string; onCta?: () => void
  photos: (string | null)[]; a?: string; b?: string; meta?: ReactNode; height?: number; compact?: boolean
}) {
  const narrow = useNarrow(760)
  const shots = (photos.filter(Boolean) as string[]).slice(0, narrow ? 2 : 4)
  const h = narrow ? height + 50 : height
  return (
    <section className="sf-cine" onClick={onCta} style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, border: '1px solid rgba(255,255,255,0.07)', minHeight: h, cursor: onCta ? 'pointer' : 'default', background: '#0C0C0D' }}>
      <style>{CINE_KEYFRAMES}</style>
      <span style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, shots.length)}, 1fr)`, gap: 3 }}>
        {shots.map((p, i) => (
          <span key={i} style={{ position: 'relative', overflow: 'hidden' }}>
            <img src={p} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%', animation: `cineKen ${11 + i * 2}s ease-in-out ${-i * 3}s infinite alternate` }} />
          </span>
        ))}
      </span>
      <span style={{ position: 'absolute', inset: 0, background: narrow ? 'linear-gradient(0deg, rgba(8,8,9,.95) 10%, rgba(8,8,9,.55) 60%, rgba(8,8,9,.25))' : 'linear-gradient(90deg, rgba(8,8,9,.96) 0%, rgba(8,8,9,.82) 34%, rgba(8,8,9,.15) 72%, rgba(8,8,9,.05))' }} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: narrow ? 'flex-end' : 'center', gap: 10, minHeight: h, maxWidth: narrow ? '100%' : '54%', padding: narrow ? '22px 18px' : compact ? '22px 26px' : '30px 34px', boxSizing: 'border-box', animation: 'cineUp .55s both' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: LIME }}>● {kicker}</span>
        <h2 style={{ ...H1, fontSize: narrow ? 26 : compact ? 'clamp(24px, 2.4vw, 32px)' : 'clamp(28px, 3vw, 44px)' }}>
          <span style={{ display: 'block', color: '#F4F4F5' }}>{line1}</span>{line2 && <span style={{ display: 'block', color: '#A1A1AA' }}>{line2}</span>}
        </h2>
        {text && <span style={{ fontSize: 13.5, lineHeight: 1.5, color: '#C4C4CC', maxWidth: 440 }}>{text}</span>}
        {(cta || meta) && <span style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          {cta && <button type="button" onClick={e => { e.stopPropagation(); onCta?.() }} style={{ height: 38, padding: '0 16px', border: 'none', borderRadius: 10, background: LIME, color: '#fff', fontSize: 13.5, fontWeight: 750, cursor: 'pointer', boxShadow: '0 3px 0 #6D28D9' }}>{cta}</button>}
          {meta && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#D4D4D8', letterSpacing: '.04em' }}>{meta}</span>}
        </span>}
      </div>
    </section>
  )
}
