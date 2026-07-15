import { useState, useContext } from 'react'
import type { Page } from '@/components/Layout'
import { LicenseContext } from '@/lib/license'
import { useTr } from '@/lib/i18n'

// ── Publication — hub premium (grille uniforme + liseré dégradé animé) ────────

type IconFn = (p: { size?: number }) => JSX.Element
const S = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })
const IconReels: IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 8h18"/><path d="M8 3l2.5 5"/><path d="M14 3l2.5 5"/><path d="M11 12.5v4l3.5-2z" fill="currentColor" stroke="none"/></svg>)
const IconStory: IconFn = ({ size }) => (<svg {...S(size)}><circle cx="12" cy="12" r="9" strokeDasharray="3.6 3.2"/><path d="M9.5 12a2 2 0 0 1 2-2h1"/><path d="M14.5 12a2 2 0 0 1-2 2h-1"/><path d="M10.5 12h3"/></svg>)
const IconPhoto: IconFn = ({ size }) => (<svg {...S(size)}><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.6"/><path d="M4 17l4.5-4.5a2 2 0 0 1 2.8 0L20 21"/></svg>)
const IconGlobe: IconFn = ({ size }) => (<svg {...S(size)}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/></svg>)

const CSS = `
@property --hub-a { syntax:'<angle>'; inherits:false; initial-value:0deg }
@keyframes hub-spin { to { --hub-a: 360deg } }
@keyframes ph-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,30px)} }
@keyframes ph-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,40px)} }
@keyframes hub-shimmer { 0%{background-position:-160% 0} 100%{background-position:260% 0} }
@keyframes hub-check { 0%,20%{stroke-dashoffset:20;opacity:.3} 40%,100%{stroke-dashoffset:0;opacity:1} }
@keyframes hub-bar { 0%{width:14%} 60%,100%{width:89%} }
@keyframes hub-pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
@keyframes hub-tilt { 0%,100%{transform:rotate(-3deg) translateY(0)} 50%{transform:rotate(-3deg) translateY(-4px)} }
@keyframes hub-flow { 0%{left:0;opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{left:calc(100% - 16px);opacity:0} }
.hubcard { position: relative; }
.hubcard::before {
  content:''; position:absolute; inset:-1px; border-radius:23px; padding:1.4px;
  background: conic-gradient(from var(--hub-a), transparent 0%, var(--ring) 14%, transparent 32%, transparent 66%, var(--ring) 84%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity .35s ease; animation: hub-spin 5s linear infinite; pointer-events:none; z-index:3;
}
.hubcard:hover:not(:disabled)::before { opacity: .95 }
`

type PreviewKind = 'reels' | 'story' | 'photo'
interface Kind { id: Page; Icon: IconFn; title: string; tag: string; tagEn: string; desc: string; descEn: string; grad: string; glow: string; accent: string; preview: PreviewKind; soon?: boolean; admin?: boolean }

const KINDS: Kind[] = [
  { id: 'posting', Icon: IconReels, title: 'Reels', tag: 'Vidéo', tagEn: 'Video', preview: 'reels',
    desc: 'Publie un Reels sur tous tes comptes Instagram & TikTok, en parallèle et sans surveillance.',
    descEn: 'Post a Reel to all your Instagram & TikTok accounts, in parallel and unattended.',
    grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.5)', accent: '#818CF8' },
  { id: 'storylink', Icon: IconStory, title: 'Story', tag: 'Sticker lien', tagEn: 'Link sticker', preview: 'story',
    desc: 'Une story avec un sticker lien propre à chaque compte, publiée en masse.',
    descEn: 'A story with a link sticker unique to each account, posted in bulk.',
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.45)', accent: '#FBBF24' },
  { id: 'photoposting', Icon: IconPhoto, title: 'Photo', tag: 'Feed', tagEn: 'Feed', preview: 'photo', soon: true,
    desc: 'Publie une photo dans le feed sur tous tes comptes.',
    descEn: 'Post a photo to the feed on all your accounts.',
    grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.4)', accent: '#34D399' },
  { id: 'crossposting', Icon: IconGlobe, title: 'Cross-posting', tag: 'Multi-plateforme', tagEn: 'Multi-platform', preview: 'reels', admin: true,
    desc: 'Publie une vidéo sur Facebook, YouTube Shorts, X, Threads, Reddit & Pinterest en une fois.',
    descEn: 'Post a video to Facebook, YouTube Shorts, X, Threads, Reddit & Pinterest all at once.',
    grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', glow: 'rgba(6,182,212,0.4)', accent: '#38BDF8' },
]

function Preview({ kind, accent }: { kind: PreviewKind; accent: string }) {
  const tr = useTr()
  const box: React.CSSProperties = {
    position: 'relative', height: 120, borderRadius: 14, overflow: 'hidden',
    background: 'radial-gradient(130% 130% at 15% 0%, rgba(255,255,255,0.05), rgba(0,0,0,0.3))',
    border: '1px solid rgba(255,255,255,0.07)', padding: 14,
  }
  if (kind === 'reels') {
    const rows = [['iPhone-01', 'ok'], ['iPhone-02', 'ok'], ['iPhone-03', 'run']] as const
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 7 }}>
        {rows.map(([n, st], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
            <span style={{ fontFamily: 'ui-monospace,monospace', color: 'rgba(233,234,240,0.7)', flex: 1 }}>{n}</span>
            {st === 'ok' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#34D399', fontWeight: 800 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 20 }}><path d="M20 6 9 17l-5-5" style={{ animation: `hub-check 3s ease-in-out ${i * 0.4}s infinite` }} /></svg> {tr('publié', 'posted')}
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#FBBF24', fontWeight: 800 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FBBF24', animation: 'hub-pulse 1.4s ease-in-out infinite' }} /> {tr('en cours', 'running')}
              </span>
            )}
          </div>
        ))}
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg,${accent},#34D399)`, animation: 'hub-bar 3.5s ease-in-out infinite alternate' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 900, color: accent, fontVariantNumeric: 'tabular-nums' }}>42/47</span>
        </div>
      </div>
    )
  }
  if (kind === 'story') {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#3a2a12,#160f08)' }}>
        <div style={{ width: 56, height: 86, borderRadius: 10, background: 'linear-gradient(160deg,#5b4020,#241606)', border: '1px solid rgba(255,255,255,0.12)', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 10, animation: 'hub-tilt 4s ease-in-out infinite' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8, fontWeight: 800, color: '#0a0a0d', background: '#fff', borderRadius: 5, padding: '3px 6px' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
            LIEN
          </span>
        </div>
        <span style={{ position: 'absolute', bottom: 10, right: 13, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.4)' }}>{tr('par compte', 'per account')}</span>
      </div>
    )
  }
  return (
    <div style={{ ...box, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gridTemplateRows: 'repeat(2,1fr)', gap: 6 }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{ borderRadius: 6, background: `linear-gradient(160deg, rgba(16,185,129,${0.16 - i * 0.014}), rgba(0,0,0,0.25))`, border: '1px solid rgba(255,255,255,0.06)' }} />
      ))}
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, background: 'rgba(8,8,12,0.42)' }}>{tr('Bientôt', 'Soon')}</span>
    </div>
  )
}

function KindCard({ kind, onOpen, disabled, badge }: { kind: Kind; onOpen: () => void; disabled?: boolean; badge?: string }) {
  const tr = useTr()
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const active = hover && !disabled
  return (
    <button
      className={disabled ? 'hubcard' : 'hubcard sf-press'}
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }}
      style={{
        ['--ring' as any]: kind.accent,
        position: 'relative', textAlign: 'left', overflow: 'hidden',
        padding: 'var(--sp-5)', borderRadius: 'var(--r-xl)',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.014))',
        border: `1px solid ${active ? 'var(--border-accent-strong)' : 'var(--border-md)'}`,
        transform: active ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: active ? `var(--elev-2), 0 34px 70px -30px ${kind.glow}` : 'var(--elev-1)',
        transition: 'transform var(--t-smooth), box-shadow var(--t-smooth), border-color var(--t-base)',
        display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', isolation: 'isolate', minHeight: 328,
        opacity: disabled ? 0.7 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(480px circle at ${pos.x}% ${pos.y}%, ${kind.glow}, transparent 60%)`, opacity: active ? 0.42 : 0, transition: 'opacity 0.3s' }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div className="sf-page-icon" style={{ ['--icon-grad' as any]: kind.grad, width: 46, height: 46, borderRadius: 'var(--r-md)', boxShadow: `0 10px 24px -8px ${kind.glow}, inset 0 1px 0 0 rgba(255,255,255,0.35)`, transform: active ? 'scale(1.06) rotate(-3deg)' : 'scale(1)', transition: 'transform var(--t-smooth)' }}><kind.Icon size={22} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{kind.title}</h3>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase', color: badge ? 'var(--warn)' : kind.accent }}>{badge ?? tr(kind.tag, kind.tagEn)}</span>
          </div>
        </div>
      </div>

      <p style={{ position: 'relative', zIndex: 2, margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 39 }}>{tr(kind.desc, kind.descEn)}</p>

      <div style={{ position: 'relative', zIndex: 2 }}><Preview kind={kind.preview} accent={kind.accent} /></div>

      {/* CTA claire */}
      <div style={{
        position: 'relative', zIndex: 2, marginTop: 'auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: 40, borderRadius: 'var(--r-md)', fontSize: 13, fontWeight: 800, letterSpacing: '0.01em',
        color: disabled ? 'var(--text-3)' : '#fff',
        background: disabled ? 'var(--surface-2)' : kind.grad,
        border: disabled ? '1px solid var(--border-md)' : 'none',
        boxShadow: disabled ? 'none' : (active ? `0 12px 26px -10px ${kind.glow}, inset 0 1px 0 0 rgba(255,255,255,0.3)` : 'inset 0 1px 0 0 rgba(255,255,255,0.2)'),
        transition: 'box-shadow var(--t-smooth)',
      }}>
        {disabled ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
            {tr('Bientôt disponible', 'Coming soon')}
          </>
        ) : (
          <>
            {tr('Ouvrir', 'Open')} {kind.title}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: active ? 'translateX(3px)' : 'none', transition: 'transform 0.25s' }}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </>
        )}
      </div>
    </button>
  )
}

export function PublishHub({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const tr = useTr()
  const isSuperAdmin = useContext(LicenseContext)?.isSuperAdmin === true
  const visibleKinds = KINDS.filter(k => !k.admin || isSuperAdmin)
  return (
    <div className="anim-page" style={{ minHeight: '100%', background: 'var(--base)', padding: '32px 32px 90px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      <style>{CSS}</style>
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -140, left: '8%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)', filter: 'blur(46px)', animation: 'ph-float-a 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 20, right: '2%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.12), transparent 70%)', filter: 'blur(46px)', animation: 'ph-float-b 22s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 980, margin: '0 auto' }}>
        <div style={{ marginBottom: 36 }}>
          <div className="sf-eyebrow sf-anim-slide-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 'var(--sp-4)', letterSpacing: '0.24em' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
            {tr('Publication', 'Publishing')}
          </div>
          <h1 className="sf-anim-slide-up sf-d50" style={{ margin: '0 0 12px', fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.0, background: 'linear-gradient(100deg,#fff 15%,#a5b4fc 50%,#6ee7b7 85%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'hub-shimmer 7s linear infinite' }}>
            {tr('Publie partout, en un clic', 'Publish everywhere, in one click')}
          </h1>
          <p className="sf-anim-slide-up sf-d100" style={{ margin: 0, fontSize: 15, color: 'var(--text-2)', maxWidth: 600, lineHeight: 1.65 }}>
            {tr('Choisis un format ci-dessous, sélectionne tes comptes et ton contenu, puis publie sur des dizaines de comptes Instagram & TikTok en parallèle.', 'Pick a format below, select your accounts and content, then publish to dozens of Instagram & TikTok accounts in parallel.')}
          </p>
          {/* Comment ça marche — 3 étapes */}
          <div className="sf-anim-slide-up sf-d150" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'var(--sp-6)', flexWrap: 'wrap' }}>
            {[
              { n: '1', t: tr('Choisis un format', 'Pick a format'), s: tr('Reels, Story ou Photo', 'Reels, Story or Photo'), c: '#818CF8' },
              { n: '2', t: tr('Comptes & contenu', 'Accounts & content'), s: tr('Sélectionne tes téléphones', 'Select your phones'), c: '#FBBF24' },
              { n: '3', t: tr('Publie en 1 clic', 'Publish in 1 click'), s: tr('Tout part en parallèle', 'Everything goes in parallel'), c: '#34D399' },
            ].map((step, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 8px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--border-md)' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 'var(--r-sm)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#0A0B0E', background: step.c }}>{step.n}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{step.t}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{step.s}</span>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ position: 'relative', width: 38, height: 2, flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: `linear-gradient(90deg, ${step.c}59, ${arr[i + 1].c}59)` }} />
                    <div style={{ position: 'absolute', top: -2, left: 0, width: 16, height: 6, animation: 'hub-flow 2.4s cubic-bezier(.45,0,.55,1) infinite', animationDelay: `${i * 0.5}s` }}>
                      <div style={{ position: 'absolute', right: 5, top: 2, width: 11, height: 2, borderRadius: 2, background: 'linear-gradient(90deg, transparent, rgba(199,210,254,0.9))' }} />
                      <div style={{ position: 'absolute', right: 0, top: 0, width: 6, height: 6, borderRadius: 99, background: '#E0E7FF', boxShadow: '0 0 10px 3px rgba(165,180,252,0.85)' }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Grille uniforme */}
        <div className="sf-anim-slide-up sf-d200" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(visibleKinds.length, 3)}, 1fr)`, gap: 'var(--sp-4)' }}>
          {visibleKinds.map(kind => (
            <KindCard key={kind.id} kind={kind} disabled={kind.soon} badge={kind.soon ? tr('Bientôt', 'Soon') : kind.admin ? 'Admin' : undefined} onOpen={() => onNavigate(kind.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
