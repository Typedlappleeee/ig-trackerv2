// Aperçus PLEIN CADRE et animés propres à chaque outil (Explorer, accueil) : la photo /
// vidéo remplit toute la vignette (zoom lent), et l'interface de l'outil se superpose
// (sticker lien, sous-titres, badges, calendrier…). Vraies miniatures (Veille Reels /
// banque) ; sans photo, un dégradé de l'outil prend le relais.
// Animations : SPOT_KEYFRAMES (LaunchSpotlight) ; coupées si « réduire les animations ».
import type { CSSProperties, ReactNode } from 'react'
import type { Tool } from '@/lib/tools'

type Pick = (k: number) => string | null
const an = (name: string, dur: number, delay = 0, extra = 'ease-in-out infinite') => `${name} ${dur}s ${extra} ${-delay}s`
const cycle = (i: number, n: number, period = 4.5) => an('sfsCycle', period, (n - i) * (period / n))
const FILL: CSSProperties = { position: 'absolute', inset: 0 }
const Glass: CSSProperties = { background: 'rgba(10,10,11,0.62)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 9, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#fff' }
const Pill = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <span style={{ ...Glass, padding: '4px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', ...style }}>{children}</span>
const At = ({ children, style }: { children: ReactNode; style: CSSProperties }) => <span style={{ position: 'absolute', zIndex: 2, ...style }}>{children}</span>

/** Image plein cadre (ou dégradé), zoom lent en boucle. */
function Media({ src, a, b, k = 0, style, filter, still }: { src: string | null; a: string; b: string; k?: number; style?: CSSProperties; filter?: string; still?: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'block', overflow: 'hidden', background: '#17171A', ...style }}>
      {src && <img src={src} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter, animation: still ? undefined : an('sfsKen', 8 + (k % 4), k * 1.7, 'ease-in-out infinite alternate') }} />}
    </span>
  )
}
/** Fond plein cadre + voile sombre en bas (lisibilité des éléments superposés). */
const Back = ({ m, shade = 0.55 }: { m: ReactNode; shade?: number }) => <>{m}<span style={{ ...FILL, background: `linear-gradient(to top, rgba(0,0,0,${shade}), rgba(0,0,0,0.05) 60%)` }} /></>
/** Bandes verticales (variantes, montage, mosaïques). */
const Strips = ({ n, render, gap = 2 }: { n: number; render: (i: number) => ReactNode; gap?: number }) => <span style={{ ...FILL, display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap, background: '#0A0A0B' }}>{Array.from({ length: n }, (_, i) => <span key={i} style={{ position: 'relative', overflow: 'hidden' }}>{render(i)}</span>)}</span>

function Art({ t, pick }: { t: Tool; pick: Pick }) {
  const { a, b } = t
  const M = (k: number, style?: CSSProperties, filter?: string, still?: boolean) => <Media src={pick(k)} a={a} b={b} k={k} style={{ ...FILL, ...style }} filter={filter} still={still} />
  const label = (s: string, style?: CSSProperties) => <Pill style={{ fontSize: 9, padding: '2px 6px', ...style }}>{s}</Pill>
  switch (t.id) {
    case 'reels': return <><Back m={M(0)} />
      <At style={{ right: 10, bottom: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', color: '#fff', fontSize: 13, textShadow: '0 1px 6px rgba(0,0,0,.7)' }}>{['♥', '💬', '↗'].map((x, i) => <span key={x} style={{ animation: an(i ? 'sfsBob' : 'sfsBeat', i ? 3 : 1.3, i * 0.6), color: i ? '#fff' : '#F43F5E' }}>{x}</span>)}</At>
      <At style={{ left: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 22, height: 22, borderRadius: 99, overflow: 'hidden', border: '1.5px solid #fff' }}>{M(1, { position: 'relative', width: 22, height: 22 }, undefined, true)}</span><span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px #000' }}>lea.officiel</span></At>
      <At style={{ left: 12, top: 40 }}>{label('▶ 48 comptes en parallèle', { animation: an('sfsBob', 3.6) })}</At></>
    case 'story': return <><Back m={M(0)} shade={0.3} />
      <At style={{ top: 9, left: 10, right: 10, display: 'flex', gap: 3 }}>{[0, 1, 2].map(i => <span key={i} style={{ flex: 1, height: 2.5, borderRadius: 9, background: 'rgba(255,255,255,.35)', overflow: 'hidden' }}>{i === 0 && <span style={{ display: 'block', height: '100%', background: '#fff', animation: an('sfsFill', 3.5, 0, 'linear infinite') }} />}</span>)}</At>
      <At style={{ left: '50%', top: '58%', translate: '-50% -50%', padding: '6px 12px', borderRadius: 9, background: '#fff', color: '#2563EB', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 8px 20px rgba(0,0,0,.35)', animation: an('sfsBeat', 1.8) }}>🔗 MON LIEN</At></>
    case 'tiktok': return <><Back m={M(1)} />
      <At style={{ top: 40, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px #000' }}><span style={{ opacity: 0.7 }}>Abonnements</span>   <b style={{ borderBottom: '2px solid #fff', paddingBottom: 2 }}>Pour toi</b></At>
      <At style={{ right: 10, bottom: 14, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', fontSize: 13 }}>{['❤', '💬', '↗'].map((x, i) => <span key={x} style={{ color: i ? '#fff' : '#FE2C55', textShadow: '0 1px 6px #000', animation: an(i ? 'sfsBob' : 'sfsBeat', i ? 3 : 1.2, i * 0.6) }}>{x}</span>)}</At>
      <At style={{ left: 12, bottom: 14, fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px #000' }}>@lea · ♫ son original</At></>
    case 'photo': return <><Back m={M(2)} />
      <At style={{ left: 12, bottom: 12, display: 'flex', gap: 10, fontSize: 14, color: '#fff', textShadow: '0 1px 6px #000' }}><span style={{ color: '#F43F5E', animation: an('sfsBeat', 1.3) }}>♥</span><span>💬</span><span>↗</span></At>
      <At style={{ right: 12, bottom: 12, display: 'flex', gap: 4 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: 9, background: i ? 'rgba(255,255,255,.45)' : '#fff' }} />)}</At></>
    case 'cross': return <><Back m={M(0)} shade={0.6} />
      <At style={{ left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', gap: 8 }}>{([['f', '#1877F2'], ['▶', '#FF0000'], ['𝕏', '#111'], ['@', '#000'], ['P', '#E60023'], ['r', '#FF4500']] as [string, string][]).map(([l, c], i) => <span key={l} style={{ width: 26, height: 26, borderRadius: 99, background: c, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(255,255,255,.8)', animation: an('sfsBob', 3, i * 0.45) }}>{l}</span>)}</At></>
    case 'scheduled': return <><Back m={M(3)} shade={0.7} />
      <At style={{ left: 12, right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>{[['09:00', 'Reel · 48 comptes'], ['14:30', 'Story · 36 comptes'], ['21:00', 'TikTok · 60 comptes']].map(([h, l], k) => <span key={h} style={{ ...Glass, display: 'flex', gap: 8, padding: '4px 8px', fontSize: 10, animation: cycle(k, 3) }}><b>{h}</b><span style={{ opacity: 0.8 }}>{l}</span></span>)}</At></>
    case 'calendar': return <><Back m={M(4)} shade={0.65} />
      <At style={{ left: '50%', top: '50%', translate: '-50% -50%', ...Glass, display: 'grid', gridTemplateColumns: 'repeat(7, 18px)', gap: 4, padding: 8 }}>{Array.from({ length: 21 }, (_, k) => { const i = [2, 6, 9, 13, 17].indexOf(k); return i >= 0 ? <span key={k} style={{ width: 18, height: 18, borderRadius: 5, overflow: 'hidden', position: 'relative', animation: an('sfsBeat', 2.4, i * 0.45) }}>{M(k, { position: 'relative', width: 18, height: 18 }, undefined, true)}</span> : <span key={k} style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(255,255,255,0.1)', fontSize: 7.5, color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{k + 1}</span> })}</At></>
    case 'remix': return <><Strips n={4} render={i => <>{M(0, undefined, ['none', 'brightness(1.25) saturate(1.4)', 'hue-rotate(35deg) contrast(1.1)', 'grayscale(.35) brightness(.9)'][i], true)}{i > 0 && <span style={{ ...FILL, background: 'rgba(0,0,0,.45)', animation: an('sfsBlink', 3.6, (i - 1) * 1.2) }} />}<At style={{ left: '50%', bottom: 10, translate: '-50% 0' }}>{label(i ? `V${i}` : 'Source', i ? undefined : { background: '#fff', color: '#0A0A0B' })}</At></>} /></>
    case 'spoof': return <><Back m={M(1)} shade={0.45} />
      <At style={{ right: 10, top: 34, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>{['📱 iPhone 15 Pro', '📍 48.86, 2.35', '🗓 EXIF réécrit'].map((l, k) => <Pill key={l} style={{ animation: cycle(k, 3) }}>{l}</Pill>)}</At></>
    case 'imgspoof': return <><Strips n={3} render={i => <>{M(3, undefined, ['none', 'brightness(1.08) saturate(1.1)', 'contrast(1.12)'][i], true)}<At style={{ left: '50%', bottom: 10, translate: '-50% 0' }}>{label(`IMG_${4821 + i}.jpg`, { animation: cycle(i, 3, 3) })}</At></>} /></>
    case 'subs': return <><Back m={M(2)} shade={0.35} />
      <At style={{ left: 8, right: 8, bottom: 22, textAlign: 'center', fontSize: 15, fontWeight: 900, color: '#fff', textShadow: '0 0 6px #000, 0 2px 2px #000', letterSpacing: '.01em' }}>{['ET', 'LÀ', 'IL', 'M’A', 'DIT…'].map((w, i) => <span key={w} style={{ animation: an('sfsWord', 2.5, (5 - i) * 0.5, 'steps(1) infinite') }}>{w} </span>)}</At></>
    case 'overlay': return <><Back m={M(0)} shade={0.3} />
      <At style={{ right: 12, top: 34, width: 64, height: 64, borderRadius: 10, overflow: 'hidden', border: '2px solid #fff', boxShadow: '0 10px 24px rgba(0,0,0,.45)', animation: an('sfsBob', 3.2) }}>{M(4, undefined, undefined, true)}</At></>
    case 'montage': return <><Strips n={4} render={i => M(i, undefined, undefined, true)} />
      <span style={{ position: 'absolute', zIndex: 2, top: 0, bottom: 0, width: 2, background: '#F87171', boxShadow: '0 0 10px #F87171', animation: an('sfsHead', 3.4, 0, 'linear infinite') }} />
      <At style={{ left: 10, right: 10, bottom: 10, height: 5, borderRadius: 9, background: 'rgba(255,255,255,.3)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', background: '#fff', animation: an('sfsFill', 3.4, 0, 'linear infinite') }} /></At></>
    case 'mixer': return <><Back m={M(3)} shade={0.3} />
      <At style={{ left: '50%', top: '42%', translate: '-50% -50%', padding: '6px 10px', borderRadius: 8, background: '#fff', color: '#111', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 8px 20px rgba(0,0,0,.35)', animation: an('sfsBeat', 2.2) }}>POV : ton crush t’écrit 😳</At></>
    case 'autocontent': return <><Strips n={4} render={i => <>{M(0, undefined, ['none', 'saturate(1.5)', 'hue-rotate(25deg)', 'brightness(1.2)'][i], true)}{i > 0 && <span style={{ ...FILL, background: 'rgba(0,0,0,.45)', animation: an('sfsBlink', 3, (i - 1) * 1) }} />}<At style={{ left: '50%', bottom: 10, translate: '-50% 0' }}>{label(i ? `#${i}` : 'Source', i ? undefined : { background: '#fff', color: '#0A0A0B' })}</At></>} /></>
    case 'warmup': return <><Back m={M(1)} shade={0.35} />
      {([['❤', 22, 0], ['❤', 64, 0.9], ['＋', 40, 1.8], ['❤', 78, 2.6]] as [string, number, number][]).map(([i, x, d], n) => <At key={n} style={{ left: `${x}%`, bottom: 14, fontSize: 18, color: i === '❤' ? '#F43F5E' : '#fff', textShadow: '0 1px 6px rgba(0,0,0,.6)', animation: an('sfsRise', 3.4, d, 'ease-out infinite') }}>{i}</At>)}
      <At style={{ left: 10, top: 34 }}><Pill>🔥 Session 30 min</Pill></At></>
    case 'mass-edit': return <><Strips n={3} gap={2} render={i => <>{M(i + 2, undefined, undefined, true)}<span style={{ ...FILL, background: 'linear-gradient(to top, rgba(0,0,0,.6), transparent 55%)' }} /><At style={{ left: '50%', bottom: 10, translate: '-50% 0' }}>{label(`@lea${['', '.fr', '_x'][i]}`, { animation: cycle(i, 3) })}</At></>} /></>
    case 'auto-login': return <><Back m={M(2)} shade={0.65} />
      <At style={{ left: '50%', top: '52%', translate: '-50% -50%', ...Glass, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 14px' }}><span style={{ fontFamily: 'cursive', fontSize: 14 }}>Instagram</span><span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '.2em', animation: an('sfsBlink', 1.8) }}>482 913</span><span style={{ fontSize: 9, opacity: 0.75 }}>Code 2FA rempli automatiquement</span></At></>
    case 'flow-builder': return <><Back m={M(0)} shade={0.7} />
      <At style={{ left: 0, right: 0, top: '50%', translate: '0 -50%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5 }}>{['Connexion', 'Chauffe', 'Publier'].map((l, k) => <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Pill style={{ fontSize: 10, padding: '6px 9px', background: ['rgba(148,163,184,.92)', 'rgba(251,146,60,.92)', 'rgba(167,139,250,.95)'][k], color: '#0A0A0B', animation: cycle(k, 3, 3) }}>{l}</Pill>{k < 2 && <span style={{ color: '#fff', fontSize: 12, animation: an('sfsBlink', 1.5, k * 0.5) }}>→</span>}</span>)}</At></>
    case 'phones': return <span style={{ ...FILL, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 2, background: '#0A0A0B' }}>{Array.from({ length: 12 }, (_, k) => <span key={k} style={{ position: 'relative', overflow: 'hidden' }}>{k % 5 === 3 ? <span style={{ ...FILL, background: '#18181B' }} /> : M(k, undefined, undefined, true)}<span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 9, background: k % 5 === 3 ? '#71717A' : '#4ADE80', boxShadow: k % 5 === 3 ? 'none' : '0 0 6px #4ADE80', animation: k % 5 === 3 ? undefined : an('sfsBlink', 1.8, k * 0.3) }} /></span>)}</span>
    case 'viral': return <><Strips n={3} render={i => <>{M(i, undefined, undefined, i !== 1)}<span style={{ ...FILL, background: 'linear-gradient(to top, rgba(0,0,0,.65), transparent 55%)' }} /><At style={{ left: 8, top: 34 }}>{label(['×3', '×24', '×7'][i], i === 1 ? { background: '#F472B6', borderColor: '#F472B6', animation: an('sfsBeat', 1.8) } : undefined)}</At><At style={{ left: 8, bottom: 10, fontSize: 12, fontWeight: 800, color: '#fff' }}>▶ {['384k', '1,5M', '442k'][i]}</At></>} /></>
    case 'viral-mine': return <><Back m={M(3)} shade={0.75} />
      <At style={{ left: 14, right: 14, bottom: 12, height: 70, display: 'flex', alignItems: 'flex-end', gap: 6 }}>{[30, 52, 24, 70, 44, 36, 58].map((h, k) => <span key={k} style={{ flex: 1, height: h, borderRadius: 4, transformOrigin: 'bottom', background: k === 3 ? '#FDBA74' : 'rgba(255,255,255,.4)', animation: an('sfsGrowY', 3, k * 0.4) }} />)}</At>
      <At style={{ left: 12, top: 34 }}><Pill>📈 Ta meilleure vidéo : ×5</Pill></At></>
    case 'links': return <><Back m={M(0)} shade={0.7} />
      <At style={{ left: 12, right: 12, bottom: 12, ...Glass, padding: '8px 10px' }}><span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 20, fontWeight: 800 }}>32,4 %</span><span style={{ fontSize: 9.5, opacity: 0.75 }}>taux de clic</span><span style={{ marginLeft: 'auto', fontSize: 9.5, color: '#4ADE80', animation: an('sfsBlink', 1.6) }}>● live</span></span><span style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, marginTop: 5 }}>{[8, 12, 9, 16, 14, 20, 22, 17, 21, 14, 19].map((h, k) => <span key={k} style={{ flex: 1, height: h, borderRadius: 2, background: '#F472B6', transformOrigin: 'bottom', animation: an('sfsGrowY', 2.6, k * 0.22) }} />)}</span></At></>
    case 'link-pages': return <><span style={{ ...FILL, background: 'linear-gradient(160deg,#FF7EB3,#FF758C 45%,#FFB38A)' }} />
      <At style={{ left: 0, right: 0, top: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}><span style={{ width: 34, height: 34, borderRadius: 99, overflow: 'hidden', border: '2px solid #fff', position: 'relative' }}>{M(0, { position: 'relative', width: 34, height: 34 }, undefined, true)}</span><span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>Léa ✨</span>{['🔥 Mon contenu exclusif', '💌 Telegram privé'].map((l, k) => <span key={l} style={{ width: 170, padding: '5px 0', borderRadius: 99, background: '#fff', color: '#111', fontSize: 9.5, fontWeight: 800, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,.15)', animation: k === 0 ? an('sfsBeat', 1.6) : undefined }}>{l}</span>)}</At></>
    case 'activity': return <><Back m={M(2)} shade={0.72} />
      <At style={{ left: 12, right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>{([['✓', '#4ADE80', 'Reel · 48/48 publiés'], ['✓', '#4ADE80', 'Story · 35/36 publiées'], ['↻', '#FBBF24', 'Relancer 1 échec']] as [string, string, string][]).map(([i, c, l], k) => <span key={l} style={{ ...Glass, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 10, animation: cycle(k, 3) }}><span style={{ flex: 1 }}>{l}</span><b style={{ color: c }}>{i}</b></span>)}</At></>
    case 'bank-videos': return <span style={{ ...FILL, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 2, background: '#0A0A0B' }}>{Array.from({ length: 10 }, (_, k) => <span key={k} style={{ position: 'relative', overflow: 'hidden', animation: cycle(k, 10, 7) }}>{M(k, undefined, undefined, true)}<span style={{ position: 'absolute', left: 5, bottom: 4, fontSize: 9, color: '#fff', textShadow: '0 1px 3px #000' }}>▶ 0:{14 + k}</span></span>)}</span>
    case 'bank-images': return <span style={{ ...FILL, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 2, background: '#0A0A0B' }}>{Array.from({ length: 10 }, (_, k) => <span key={k} style={{ position: 'relative', overflow: 'hidden', animation: cycle(k, 10, 7) }}>{M(k + 3, undefined, undefined, true)}</span>)}</span>
    case 'bank-captions': return <><Back m={M(4)} shade={0.72} />
      <At style={{ left: 12, right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>{['POV : tu restes jusqu’à la fin ? 👀', 'Sauvegarde pour plus tard 💾', 'Lien dans ma bio 🔗'].map((l, k) => <span key={l} style={{ ...Glass, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 8px', fontSize: 10, animation: cycle(k, 3) }}><span>“{l}”</span><span style={{ opacity: 0.6 }}>×{[12, 7, 4][k]}</span></span>)}</At></>
    default: return <Back m={M(0)} />
  }
}

export default function ToolArt({ t, pick }: { t: Tool; pick: Pick }) {
  return <span className="sf-art" style={{ ...FILL, display: 'block', overflow: 'hidden' }}><Art t={t} pick={pick} /></span>
}
