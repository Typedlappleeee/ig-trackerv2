// Accueil façon « cinéma » (inspiré Higgsfield) : grand bandeau avec de vraies photos de
// part et d'autre d'un titre XXL, bouton vif ; puis une vitrine des Reels qui explosent
// (grandes cartes plein cadre). Photos = miniatures Veille Reels (via le proxy d'images).
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { compact } from '@/lib/data'
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

// Mur de téléphones (même esprit que le site) : colonnes de cartes 9:16 qui défilent en sens
// alternés, en perspective, avec les vraies miniatures. CSS pur, aucun re-rendu.
const WALL_CSS = `
  .sf-wall{position:absolute;inset:-12% -8%;perspective:1300px;overflow:hidden;pointer-events:none}
  .sf-wall-in{position:absolute;left:50%;top:50%;display:flex;gap:16px;transform:translate(-50%,-50%) rotateX(20deg) rotateZ(-11deg) scale(1.05)}
  .sf-wall-col{display:flex;flex-direction:column;gap:16px;width:150px;animation:sfWallUp 52s linear infinite;will-change:transform}
  .sf-wall-col.dn{animation-name:sfWallDn}
  .sf-wall-ph{position:relative;aspect-ratio:9/17;border-radius:20px;overflow:hidden;background:#141416;border:1px solid rgba(255,255,255,.1);box-shadow:0 0 0 3px #0E0E10}
  .sf-wall-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .sf-wall-ph i{position:absolute;top:6px;left:50%;width:34%;height:9px;margin-left:-17%;border-radius:99px;background:#000}
  .sf-wall-ph b{position:absolute;left:8px;top:22px;padding:3px 7px;border-radius:99px;font-size:9.5px;font-weight:800;color:#0A0A0B;background:#fff}
  .sf-wall-ph b.run{color:#fff;background:rgba(139,92,246,.9)}
  @keyframes sfWallUp{from{transform:translateY(0)}to{transform:translateY(calc(-50% - 8px))}}
  @keyframes sfWallDn{from{transform:translateY(calc(-50% - 8px))}to{transform:translateY(0)}}
  @media (prefers-reduced-motion: reduce){.sf-wall-col{animation:none!important}}
`
function PhoneWall({ photos, cols }: { photos: string[]; cols: number }) {
  const at = (n: number) => photos.length ? photos[n % photos.length] : null
  return (
    <div className="sf-wall" aria-hidden="true">
      <div className="sf-wall-in">
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className={'sf-wall-col' + (c % 2 ? ' dn' : '')} style={{ animationDuration: `${48 + (c % 3) * 8}s` }}>
            {[0, 1].map(d => Array.from({ length: 4 }, (_, i) => {
              const n = c * 3 + i * 2, src = at(n)
              return <span key={`${d}-${i}`} className="sf-wall-ph">{src && <img src={src} alt="" loading="lazy" />}<i />{(c + i) % 3 === 0 && <b className={(c + i) % 2 ? 'run' : ''}>{(c + i) % 2 ? 'Publication…' : '✓ Publié'}</b>}</span>
            }))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function HomeHero({ photos, kicker, line1, line2, sub, cta, onCta, secondary, onSecondary, footer }: {
  photos: string[]; kicker: string; line1: ReactNode; line2: ReactNode; sub: ReactNode
  cta: string; onCta: () => void; secondary?: string; onSecondary?: () => void; footer?: ReactNode
}) {
  const narrow = useNarrow(760)
  return (
    <section className="sf-cine" style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate', borderRadius: 24, border: '1px solid rgba(255,255,255,0.07)', background: '#0A0A0B', minHeight: narrow ? 380 : 440, display: 'flex', alignItems: 'center', marginBottom: 16 }}>
      <style>{CINE_KEYFRAMES + WALL_CSS}</style>
      <PhoneWall photos={photos} cols={narrow ? 4 : 8} />
      <span style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 62% 70% at 50% 50%, rgba(10,10,11,.95) 0%, rgba(10,10,11,.82) 45%, rgba(10,10,11,.4) 100%)' }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: narrow ? '36px 18px 24px' : '48px 24px 30px', maxWidth: 760, margin: '0 auto', animation: 'cineUp .6s cubic-bezier(.2,.8,.2,1) both' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 12px', borderRadius: 99, border: '1px solid rgba(167,139,250,.35)', background: 'rgba(167,139,250,.1)', fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#C4B5FD', backdropFilter: 'blur(8px)' }}>{kicker}</span>
        <h1 style={{ ...H1, letterSpacing: '-0.055em', lineHeight: 0.9, fontSize: narrow ? 'clamp(28px, 8.4vw, 40px)' : 'clamp(48px, 5.6vw, 84px)' }}>
          <span style={{ display: 'block', color: '#F4F4F5' }}>{line1}</span>
          <span style={{ display: 'block', background: 'linear-gradient(90deg,#C4B5FD,#F472B6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{line2}</span>
        </h1>
        <span style={{ fontSize: 14.5, fontWeight: 500, color: '#C4C4CC' }}>{sub}</span>
        <span style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={onCta} style={{ height: 46, padding: '0 22px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg,#8B5CF6,#EC4899)', color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 0 #6D28D9, 0 16px 34px -12px rgba(236,72,153,.6)', transition: 'transform .12s ease' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'translateY(2px)' }} onMouseUp={e => { e.currentTarget.style.transform = 'none' }} onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}>{cta} →</button>
          {secondary && onSecondary && <button type="button" onClick={onSecondary} style={{ height: 46, padding: '0 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#EDEDEF', fontSize: 14.5, fontWeight: 650, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>{secondary}</button>}
        </span>
        {footer && <span style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{footer}</span>}
      </div>
    </section>
  )
}

/** Barre de chiffres unique (séparateurs fins) : Accueil, Veille Reels. */
export interface StatItem { l: string; v: ReactNode; c?: string; sub?: ReactNode; extra?: ReactNode; onClick?: () => void }
export function StatBar({ items }: { items: StatItem[] }) {
  const narrow = useNarrow(760)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0,1fr))' : `repeat(${items.length}, minmax(0,1fr))`, borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', background: '#0F0F11', marginBottom: 16 }}>
      {items.map((x, i) => (
        <button key={x.l} type="button" onClick={x.onClick} disabled={!x.onClick}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, textAlign: 'left', color: 'inherit', background: 'transparent', border: 'none', cursor: x.onClick ? 'pointer' : 'default', padding: narrow ? '15px 16px' : '20px 22px',
            borderLeft: (narrow ? i % 2 : i) ? '1px solid rgba(255,255,255,0.06)' : 'none', borderTop: narrow && i >= 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', transition: 'background .15s ease' }}
          onMouseEnter={e => { if (x.onClick) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#71717A' }}>{x.l}</span>
          <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: narrow ? 26 : 34, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1, color: x.c ?? '#F4F4F5', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{x.v}</span>
            {!narrow && x.extra}
          </span>
          {x.sub !== undefined && <span style={{ minHeight: 15, fontSize: 12 }}>{x.sub}</span>}
        </button>
      ))}
    </div>
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
            <span>{reels.length} REELS</span><span style={{ opacity: 0.5 }}>·</span><span>{compact(total)} VUES</span>
          </span>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 14, padding: narrow ? 14 : 22 }}>
        {reels.slice(0, narrow ? 4 : 5).map((r, i) => {
          const hot = r.score >= 3
          return (
            <button key={r.thumb} type="button" onClick={onOpen} style={{ position: 'relative', aspectRatio: '9 / 16', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', padding: 0, cursor: 'pointer', background: '#161618', animation: `cineUp .5s ${0.1 + i * 0.07}s both`, transition: 'transform .3s cubic-bezier(.2,.8,.2,1), border-color .3s ease' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,.6)'; const im = e.currentTarget.querySelector('img'); if (im) im.style.transform = 'scale(1.06)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; const im = e.currentTarget.querySelector('img'); if (im) im.style.transform = 'none' }}>
              <img src={r.thumb} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .7s cubic-bezier(.2,.8,.2,1)' }} />
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.5) 0%, transparent 24%, transparent 50%, rgba(0,0,0,.92) 100%)' }} />
              <span style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ height: 22, padding: '0 8px', display: 'inline-flex', alignItems: 'center', borderRadius: 99, background: i < 3 ? '#F4F4F5' : 'rgba(10,10,11,.55)', color: i < 3 ? '#0A0A0B' : '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 800 }}>{String(i + 1).padStart(2, '0')}</span>
                {r.score > 0 && <span style={{ height: 22, padding: '0 8px', display: 'inline-flex', alignItems: 'center', borderRadius: 99, background: hot ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'rgba(10,10,11,.55)', border: hot ? 'none' : '1px solid rgba(255,255,255,.16)', color: '#fff', fontSize: 12, fontWeight: 800 }}>{hot ? '🔥 ' : ''}×{r.score >= 10 ? Math.round(r.score) : r.score.toFixed(1).replace('.', ',')}</span>}
              </span>
              <span style={{ position: 'absolute', left: 12, right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: '#fff' }}><b style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>{compact(r.views)}</b><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#A1A1AA' }}>vues</span></span>
                <span data-no-tr style={{ fontSize: 12.5, fontWeight: 700, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{r.username}</span>
              </span>
            </button>
          )
        })}
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
