// Tableau de bord (page « hub ») — l'app s'ouvre sur l'Explorer, ici c'est le cockpit :
//   • bandeau d'accueil (aurore animée + éventail des VRAIS Reels qui explosent) : bonjour,
//     état, « Publier un Reel », raccourcis ;
//   • bento : publications (grande courbe animée 7 / 14 j), taux de réussite (anneau),
//     crédits (autonomie),
//     en direct, Reels qui explosent, aujourd'hui, activité récente.
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { Btn, Icon, MONO, Skeleton, SkeletonRows, useNarrow } from '@/lib/ui'
import { fetchAllPhones } from '@/lib/geelark'
import { useRuns } from '@/lib/runStore'
import { useFlowRuns } from '@/lib/flowEngine'
import { useActivitySeries, type DayPoint } from '@/lib/activitySeries'
import { useConnections } from '@/lib/connections'
import type { OrgState } from '@/lib/data'
import { type HubData, firstNameFrom, fmtNumber, compact, fmtTime, fmtDay, phoneCountOf } from '@/lib/data'
import type { PageKey } from '@/Shell'
import { visibleTools, type Tool } from '@/lib/tools'
import { openTool } from '@/lib/openTool'
import { useTopReels, type TopReel } from '@/components/CineHero'
import { smoothPath } from '@/lib/chart'

const C_OK = '#8B7CF6', C_KO = '#E5484D'   // palette validée (daltonisme OK)
const KEYFRAMES = `
  @keyframes dbDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
  @keyframes dbFade{from{opacity:0}to{opacity:1}}
  @keyframes dbRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @keyframes dbPing{0%{transform:scale(.6);opacity:.75}100%{transform:scale(2.2);opacity:0}}
  @keyframes dbGlow{0%,100%{opacity:1}50%{opacity:.55}}
  @keyframes dbFloat{0%,100%{translate:0 0}50%{translate:0 -8px}}
  @keyframes dbAuroraA{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(8%,10%) scale(1.15)}}
  @keyframes dbAuroraB{0%,100%{transform:translate(0,0) scale(1.1)}50%{transform:translate(-10%,-6%) scale(.95)}}
  @media (prefers-reduced-motion: reduce){.sf-db *{animation:none!important;transition:none!important}}
`
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
const fmtScore = (s: number) => s >= 10 ? String(Math.round(s)) : s.toFixed(1).replace('.', ',')

/** Nombre qui « monte » jusqu'à sa valeur (≈ 0,9 s). */
function useCountUp(target: number | null, ms = 900): number | null {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (target === null) return
    if (reduced()) { setV(target); return }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return target === null ? null : v
}

// ── Carte du bento ────────────────────────────────────────────────────────────
function Bento({ children, style, glow, onClick, delay = 0 }: { children: ReactNode; style?: CSSProperties; glow?: string; onClick?: () => void; delay?: number }) {
  const [h, setH] = useState(false)
  return (
    <section onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', overflow: 'hidden', minWidth: 0, height: '100%', boxSizing: 'border-box', borderRadius: 22, background: '#0E0E10', border: `1px solid ${h && onClick ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)'}`, cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .2s ease', animation: `dbRise .55s cubic-bezier(.2,.8,.2,1) ${delay}s both`, ...style }}>
      {glow && <span style={{ position: 'absolute', top: -120, right: -80, width: 320, height: 320, borderRadius: 999, background: `radial-gradient(circle, ${glow}, transparent 65%)`, pointerEvents: 'none', opacity: h ? 1 : 0.75, transition: 'opacity .3s ease' }} />}
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </section>
  )
}
function Label({ icon, children, right }: { icon: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 650, color: '#A1A1AA' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: '#E4E4E7' }}><Icon d={icon} size={13} /></span>
        {children}
      </span>
      {right}
    </div>
  )
}
function Delta({ now, prev, unit = '%' }: { now: number | null; prev: number | null; unit?: '%' | 'pts' }) {
  if (now === null || prev === null) return null
  const diff = unit === 'pts' ? now - prev : prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 100)
  const up = diff > 0
  const c = diff === 0 ? '#A1A1AA' : up ? '#4ADE80' : '#F87171'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 9px', borderRadius: 99, fontSize: 12, fontWeight: 700, color: c, background: diff === 0 ? 'rgba(255,255,255,0.05)' : up ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', whiteSpace: 'nowrap', width: 'fit-content' }}>
      {diff !== 0 && <Icon d={up ? 'M7 17L17 7|M8 7h9v9' : 'M7 7l10 10|M17 8v9H8'} size={11} sw={2.4} />}
      {diff === 0 ? '=' : `${up ? '+' : ''}${diff}${unit === 'pts' ? ' pts' : ' %'}`}
    </span>
  )
}
const I = {
  send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
  check: 'M22 11.1V12a10 10 0 1 1-5.9-9.1|M22 4L12 14l-3-3',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01',
  coin: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-3-1.5|M12 6v2|M12 16v2',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2',
  list: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01',
  fire: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z',
  refresh: 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3|M21 3v6h-6|M3 21v-6h6',
  arrow: 'M5 12h14|M13 6l6 6-6 6',
  play: 'M6 4l14 8-14 8V4z',
}
const ScoreChip = ({ s, sm }: { s: number; sm?: boolean }) => s > 0 ? (
  <span style={{ height: sm ? 20 : 22, padding: sm ? '0 7px' : '0 8px', display: 'inline-flex', alignItems: 'center', borderRadius: 99, background: s >= 3 ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'rgba(10,10,11,.6)', color: '#fff', fontSize: sm ? 10.5 : 11.5, fontWeight: 800, backdropFilter: 'blur(6px)', boxShadow: s >= 3 ? '0 6px 16px -6px rgba(236,72,153,.8)' : 'none', whiteSpace: 'nowrap' }}>{s >= 3 ? '🔥 ' : ''}×{fmtScore(s)}</span>
) : null

// ── Éventail des vrais Reels qui explosent (bandeau) ─────────────────────────
function ReelFan({ reels, onOpen, small }: { reels: TopReel[]; onOpen: () => void; small?: boolean }) {
  const [h, setH] = useState(false)
  const list = reels.slice(0, small ? 3 : 5)
  const n = list.length
  const W = small ? 104 : 120
  const step = h ? W * 0.86 : W * 0.56
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} aria-label="Les Reels qui explosent"
      style={{ position: 'relative', flexShrink: 0, width: W + (n - 1) * step, height: (W * 16) / 9 + 34, transition: 'width .45s cubic-bezier(.2,.8,.2,1)' }}>
      {list.map((r, i) => {
        const off = i - (n - 1) / 2
        return (
          <button key={r.thumb} type="button" onClick={onOpen} title={`@${r.username}`}
            style={{ position: 'absolute', left: i * step, top: 16 + Math.abs(off) * (h ? 3 : 9), width: W, aspectRatio: '9 / 16', padding: 0, border: '1px solid rgba(255,255,255,0.22)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', background: '#141416',
              transform: `rotate(${off * (h ? 3 : 6.5)}deg)`, zIndex: 10 - Math.round(Math.abs(off) * 2), boxShadow: '0 24px 50px -18px rgba(0,0,0,.9)',
              transition: 'left .45s cubic-bezier(.2,.8,.2,1), top .45s cubic-bezier(.2,.8,.2,1), transform .45s cubic-bezier(.2,.8,.2,1)', animation: `dbRise .6s ${0.15 + i * 0.07}s both` }}>
            <span style={{ position: 'absolute', inset: 0, animation: `dbFloat ${5 + i}s ease-in-out ${-i * 0.8}s infinite` }}>
              <img src={r.thumb} alt="" onError={e => { e.currentTarget.style.display = 'none' }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            </span>
            <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.25), transparent 25%, transparent 55%, rgba(0,0,0,.85))' }} />
            <span style={{ position: 'absolute', top: 8, left: 8 }}><ScoreChip s={r.score} sm /></span>
            <span style={{ position: 'absolute', left: 9, right: 9, bottom: 9, display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fff', fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em' }}><Icon d={I.play} size={10} sw={2.6} />{compact(r.views)}</span>
              <span data-no-tr style={{ fontSize: 10.5, fontWeight: 650, color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{r.username}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Publications : grand chiffre + courbe animée (7 / 14 jours) ───────────────
function PerfCard({ days, ok7, okPrev7, loading }: { days: DayPoint[]; ok7: number | null; okPrev7: number | null; loading: boolean }) {
  const [range, setRange] = useState<7 | 14>(14)
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const list = days.slice(-range)
  const total = list.reduce((s, d) => s + d.ok, 0)
  const failed = list.reduce((s, d) => s + d.failed, 0)
  const n = useCountUp(loading ? null : range === 7 ? (ok7 ?? total) : total)
  const H = 190, padT = 18, padB = 26
  const max = Math.max(4, ...list.map(d => d.ok))
  const x = (i: number) => list.length < 2 ? w / 2 : 10 + (i / (list.length - 1)) * (w - 20)
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const pts = list.map((d, i) => [x(i), y(d.ok)] as [number, number])
  const line = smoothPath(pts, H - padB)
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${H - padB} L${pts[0][0]},${H - padB} Z` : ''
  const hd = hover !== null ? list[hover] : null
  const fmtD = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  const seg = (r: 7 | 14) => (
    <button key={r} type="button" onClick={() => { setRange(r); setHover(null) }} aria-pressed={range === r}
      style={{ height: 28, padding: '0 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: range === r ? '#F4F4F5' : 'transparent', color: range === r ? '#0A0A0B' : '#A1A1AA' }}>{r} j</button>
  )
  return (
    <Bento glow="rgba(139,92,246,0.28)" style={{ minHeight: 350 }}>
      {/* Quadrillage discret qui s'efface vers le bas */}
      <span style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '36px 36px', WebkitMaskImage: 'linear-gradient(180deg, #000, transparent 75%)', maskImage: 'linear-gradient(180deg, #000, transparent 75%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', padding: '20px 22px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Label icon={I.send} right={<span style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>{seg(7)}{seg(14)}</span>}>Comptes publiés</Label>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'clamp(46px, 5vw, 66px)', fontWeight: 850, letterSpacing: '-0.05em', lineHeight: 0.95, fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg,#FFFFFF,#C4B5FD)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {n === null ? '—' : fmtNumber(n)}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 6 }}>
            {range === 7 ? <Delta now={ok7} prev={okPrev7} /> : <span style={{ fontSize: 12.5, fontWeight: 650, color: failed ? '#FCA5A5' : '#71717A' }}>{fmtNumber(failed)} échec(s)</span>}
            <span style={{ fontSize: 12.5, color: '#71717A' }}>{range === 7 ? 'vs les 7 jours d’avant' : 'sur les 14 derniers jours'}</span>
          </span>
        </div>
      </div>
      <div ref={ref} style={{ position: 'relative', marginTop: 'auto', paddingBottom: 6 }} onMouseLeave={() => setHover(null)}>
        {loading ? <div style={{ padding: '0 22px 18px' }}><Skeleton h={H - 30} r={10} /></div> : (
          <svg key={range} width={w} height={H} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label={`Comptes publiés par jour, ${range} derniers jours`}>
            <defs>
              <linearGradient id="dbArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8B5CF6" stopOpacity="0.42" /><stop offset="1" stopColor="#8B5CF6" stopOpacity="0" /></linearGradient>
              <linearGradient id="dbLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#A78BFA" /><stop offset="1" stopColor="#F472B6" /></linearGradient>
              <filter id="dbBlur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
            </defs>
            {[0.25, 0.5, 0.75].map(k => <line key={k} x1={0} x2={w} y1={padT + k * (H - padT - padB)} y2={padT + k * (H - padT - padB)} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 5" />)}
            {/* Échecs : petites barres rouges au ras du sol */}
            {list.map((d, i) => d.failed > 0 && <rect key={i} x={x(i) - 3} y={H - padB - Math.max(3, (d.failed / max) * (H - padT - padB))} width={6} height={Math.max(3, (d.failed / max) * (H - padT - padB))} rx={2} fill={C_KO} opacity={0.85} style={{ animation: `dbFade .5s ${0.6 + i * 0.03}s both` }} />)}
            <path d={area} fill="url(#dbArea)" style={{ animation: 'dbFade .9s .35s both' }} />
            <path d={line} fill="none" stroke="url(#dbLine)" strokeWidth={7} opacity={0.35} filter="url(#dbBlur)" pathLength={1} strokeDasharray={1} style={{ animation: 'dbDraw 1.2s cubic-bezier(.4,0,.2,1) both' }} />
            <path d={line} fill="none" stroke="url(#dbLine)" strokeWidth={2.6} strokeLinecap="round" pathLength={1} strokeDasharray={1} style={{ animation: 'dbDraw 1.2s cubic-bezier(.4,0,.2,1) both' }} />
            {/* Aujourd'hui : point qui pulse */}
            {pts.length > 0 && hover === null && (() => { const [px, py] = pts[pts.length - 1]; return <g style={{ animation: 'dbFade .4s 1.1s both' }}>
              <circle cx={px} cy={py} r={9} fill="#F472B6" style={{ transformOrigin: `${px}px ${py}px`, animation: 'dbPing 1.8s ease-out infinite' }} />
              <circle cx={px} cy={py} r={4.5} fill="#fff" stroke="#F472B6" strokeWidth={2.5} />
            </g> })()}
            {hd && hover !== null && <g>
              <line x1={pts[hover][0]} x2={pts[hover][0]} y1={padT - 6} y2={H - padB} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 4" />
              <circle cx={pts[hover][0]} cy={pts[hover][1]} r={5} fill="#fff" stroke="#A78BFA" strokeWidth={3} />
            </g>}
            {list.map((d, i) => (i === 0 || i === list.length - 1 || i === Math.floor((list.length - 1) / 2)) && (
              <text key={d.day} x={Math.min(Math.max(x(i), 24), w - 24)} y={H - 6} textAnchor="middle" fontSize={11} fill={i === list.length - 1 ? '#D4D4D8' : '#71717A'}>{i === list.length - 1 ? 'Auj.' : new Date(d.ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</text>
            ))}
            {list.map((_, i) => <rect key={i} x={x(i) - (w / list.length) / 2} y={0} width={w / list.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />)}
          </svg>
        )}
        {hd && hover !== null && (
          <div style={{ position: 'absolute', top: 0, left: Math.min(Math.max(pts[hover][0] - 80, 8), w - 168), width: 160, pointerEvents: 'none', padding: '9px 11px', borderRadius: 11, background: 'rgba(24,24,27,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)', fontSize: 12 }}>
            <div style={{ color: '#A1A1AA', marginBottom: 6 }}>{fmtD(hd.ts)}</div>
            {([['Publiés', hd.ok, C_OK], ['Échecs', hd.failed, C_KO]] as [string, number, string][]).map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} /><span style={{ color: '#A1A1AA', flex: 1 }}>{l}</span>
                <span style={{ color: '#F4F4F5', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Bento>
  )
}

// ── Taux de réussite : anneau animé ──────────────────────────────────────────
function RateCard({ rate, prev, ok, failed, loading, onOpen }: { rate: number | null; prev: number | null; ok: number; failed: number; loading: boolean; onOpen: () => void }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), 120); return () => clearTimeout(t) }, [])
  const v = useCountUp(loading || rate === null ? null : rate)
  const R = 72, C = 2 * Math.PI * R
  const pct = rate === null ? 0 : rate / 100
  const warn = rate !== null && rate < 80
  return (
    <Bento glow={warn ? 'rgba(251,191,36,0.2)' : 'rgba(74,222,128,0.18)'} onClick={onOpen} delay={0.05} style={{ minHeight: 350 }}>
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14, height: '100%', boxSizing: 'border-box' }}>
        <Label icon={I.check} right={<Delta now={rate} prev={prev} unit="pts" />}>Taux de réussite · 7 j</Label>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 180 }}>
          <svg width={180} height={180} viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
            <defs><linearGradient id="dbRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={warn ? '#FBBF24' : '#4ADE80'} /><stop offset="1" stopColor={warn ? '#F97316' : '#22D3EE'} /></linearGradient></defs>
            <circle cx={90} cy={90} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} />
            <circle cx={90} cy={90} r={R} fill="none" stroke="url(#dbRing)" strokeWidth={12} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={on && !loading ? C * (1 - pct) : C}
              style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 10px ${warn ? 'rgba(251,191,36,.45)' : 'rgba(74,222,128,.45)'})` }} />
          </svg>
          <span style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <b style={{ fontSize: 38, fontWeight: 850, letterSpacing: '-0.05em', lineHeight: 1.1, color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{v === null ? '—' : `${v} %`}</b>
            <span style={{ fontSize: 11.5, color: '#71717A' }}>de réussite</span>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {([['Publiés', ok, '#4ADE80'], ['Échecs', failed, '#F87171']] as [string, number, string][]).map(([l, val, c]) => (
            <span key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#8B8B94' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />{l}</span>
              <b style={{ fontSize: 18, fontWeight: 800, color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{loading ? '…' : fmtNumber(val)}</b>
            </span>
          ))}
        </div>
      </div>
    </Bento>
  )
}

// ── Crédits : solde + autonomie au rythme actuel ─────────────────────────────
function CreditsCard({ balance, runway, spent7, onOpen }: { balance: number | null; runway: number | null; spent7: number | null; onOpen: () => void }) {
  const n = useCountUp(balance)
  const SEG = 30, filled = runway === null ? 0 : Math.max(1, Math.round((Math.min(runway, 60) / 60) * SEG))
  const low = runway !== null && runway < 7
  return (
    <Bento glow="rgba(244,114,182,0.18)" onClick={onOpen} delay={0.15}>
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14, height: '100%', boxSizing: 'border-box' }}>
        <Label icon={I.coin} right={<span style={{ fontSize: 12.5, fontWeight: 700, color: '#C4B5FD' }}>Recharger</span>}>Crédits</Label>
        <b style={{ fontSize: 40, fontWeight: 850, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(90deg,#C4B5FD,#F472B6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', width: 'fit-content' }}>{n === null ? '—' : fmtNumber(n)}</b>
        <div style={{ display: 'flex', gap: 3 }} title="Autonomie (60 jours = barre pleine)">
          {Array.from({ length: SEG }, (_, i) => <span key={i} style={{ flex: 1, height: 24, borderRadius: 3, background: i < filled ? (low ? '#F87171' : 'linear-gradient(180deg,#C4B5FD,#8B5CF6)') : 'rgba(255,255,255,0.06)', opacity: i < filled ? 0.55 + (i / SEG) * 0.45 : 1, animation: `dbFade .3s ${i * 0.02}s both` }} />)}
        </div>
        <span style={{ fontSize: 13, color: low ? '#FCA5A5' : '#A1A1AA' }}>
          {runway !== null ? <>≈ <b style={{ color: '#F4F4F5' }}>{fmtNumber(runway)} jour(s)</b> au rythme actuel</> : balance !== null ? <>≈ <b style={{ color: '#F4F4F5' }}>{fmtNumber(Math.floor(balance / 2))}</b> posts restants</> : '…'}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 'auto' }}>
          {([['Posts possibles', balance === null ? '…' : `≈ ${fmtNumber(Math.floor(balance / 2))}`], ['Utilisés · 7 j', spent7 === null ? '…' : fmtNumber(spent7)]] as [string, string][]).map(([l, v]) => (
            <span key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 11.5, color: '#8B8B94' }}>{l}</span>
              <b style={{ fontSize: 17, fontWeight: 800, color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{v}</b>
            </span>
          ))}
        </div>
      </div>
    </Bento>
  )
}

// ── En direct (publications, flows…) ─────────────────────────────────────────
function LiveCard({ onNavigate, delay }: { onNavigate: (p: PageKey) => void; delay: number }) {
  const runs = useRuns().filter(r => r.status === 'running')
  const flows = useFlowRuns().filter(r => r.status === 'preparing' || r.status === 'running')
  const items = [
    ...runs.filter(r => r.kind !== 'flow').map(r => ({ id: r.id, label: r.label, done: r.done, failed: r.failed, total: r.total, detail: r.detail })),
    ...flows.map(f => ({ id: f.id, label: f.flowName, done: f.phones.filter(p => p.status === 'done').length, failed: f.phones.filter(p => p.status === 'failed').length, total: f.phones.length, detail: undefined as string | undefined })),
  ]
  const live = items.length > 0
  return (
    <Bento glow={live ? 'rgba(74,222,128,0.18)' : undefined} delay={delay}>
      <div style={{ padding: '20px 22px 8px' }}>
        <Label icon={I.pulse} right={live ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#4ADE80' }}><span style={{ width: 7, height: 7, borderRadius: 99, background: '#4ADE80', animation: 'dbGlow 1.2s ease-in-out infinite' }} />{items.length} en cours</span> : undefined}>En direct</Label>
      </div>
      {!live ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 18px 22px', textAlign: 'center' }}>
          <span style={{ position: 'relative', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {[0, 0.9].map(d => <span key={d} style={{ position: 'absolute', inset: 0, borderRadius: 99, border: '1.5px solid rgba(167,139,250,0.5)', animation: `dbPing 2.4s ease-out ${d}s infinite` }} />)}
            <span style={{ width: 40, height: 40, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(167,139,250,0.12)', color: '#C4B5FD' }}><Icon d={I.pulse} size={17} /></span>
          </span>
          <span style={{ fontSize: 13, color: '#8B8B94', lineHeight: 1.5, maxWidth: 230 }}>Rien ne tourne pour l’instant. Tes publications apparaîtront ici, en direct.</span>
          <button type="button" onClick={() => onNavigate('publish')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', borderRadius: 9, border: 'none', background: '#F4F4F5', color: '#0A0A0B', fontSize: 12.5, fontWeight: 750, cursor: 'pointer' }}><Icon d={I.send} size={12} sw={2.2} />Publier</button>
        </div>
      ) : (
        <div data-rows="" style={{ padding: '4px 0 10px' }}>
          {items.slice(0, 4).map((r, i) => {
            const pct = r.total ? Math.round(((r.done + r.failed) / r.total) * 100) : 0
            return (
              <div key={r.id} style={{ padding: '10px 22px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span data-no-tr style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: '#A1A1AA' }}>{r.done + r.failed}/{r.total} · {pct} %</span>
                </div>
                <div style={{ display: 'flex', height: 6, marginTop: 8, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', gap: r.done && r.failed ? 2 : 0 }}>
                  <span style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%`, background: 'linear-gradient(90deg,#22C55E,#4ADE80)', boxShadow: '0 0 10px rgba(74,222,128,.6)', transition: 'width .4s ease' }} />
                  <span style={{ width: `${r.total ? (r.failed / r.total) * 100 : 0}%`, background: C_KO, transition: 'width .4s ease' }} />
                </div>
                {r.detail && <div data-no-tr style={{ marginTop: 6, fontSize: 11.5, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail}</div>}
              </div>
            )
          })}
        </div>
      )}
    </Bento>
  )
}

// ── Les Reels qui explosent (Veille) : vraies miniatures ─────────────────────
function ReelsCard({ reels, onOpen, cols, delay }: { reels: TopReel[]; onOpen: () => void; cols: number; delay: number }) {
  const list = reels.slice(0, cols)
  return (
    <Bento delay={delay} glow="rgba(236,72,153,0.16)">
      <div style={{ padding: '20px 22px 14px' }}>
        <Label icon={I.fire} right={<button type="button" onClick={onOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', color: '#C4B5FD', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Ouvrir la Veille<Icon d={I.arrow} size={13} sw={2} /></button>}>Ce qui explose cette semaine</Label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10, padding: '0 14px 14px' }}>
        {list.map((r, i) => (
          <button key={r.thumb} type="button" onClick={onOpen} title={`@${r.username}`}
            style={{ position: 'relative', aspectRatio: '9 / 16', padding: 0, border: 'none', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: '#141416', animation: `dbRise .5s ${delay + 0.05 + i * 0.05}s both`, transition: 'transform .3s cubic-bezier(.2,.8,.2,1)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}>
            <img src={r.thumb} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.3) 0%, transparent 22%, transparent 55%, rgba(0,0,0,.88) 100%)' }} />
            <span style={{ position: 'absolute', top: 8, right: 8 }}><ScoreChip s={r.score} sm /></span>
            <span style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em' }}><Icon d={I.play} size={11} sw={2.4} />{compact(r.views)}</span>
              <span data-no-tr style={{ fontSize: 11.5, fontWeight: 650, color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{r.username}</span>
            </span>
          </button>
        ))}
      </div>
    </Bento>
  )
}

export default function Home({ theme, infra, user, org, data, loading, reload, onNavigate, onOpenTool, isAdmin = false }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
  data: HubData | null; loading: boolean; reload: () => void
  onNavigate: (p: PageKey) => void
  onOpenTool?: (t: Tool) => void; isAdmin?: boolean
}) {
  const conns = useConnections(user, org)
  const narrow = useNarrow(760)
  const mid = useNarrow(1180)
  const { series, reloadSeries } = useActivitySeries(user, org)
  const reels = useTopReels(8)
  const firstName = firstNameFrom(data?.displayName ?? null, user.email)
  const balance = data?.balance ?? null
  const now = new Date()
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const cap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)
  const hour = now.getHours()
  const hello = hour < 5 ? 'Bonsoir' : hour < 18 ? 'Bonjour' : 'Bonsoir'
  const cloud = infra === 'cloud'

  // Parc en direct : statut réel de chaque téléphone GeeLark (toutes les minutes).
  const [statuses, setStatuses] = useState<number[] | null>(null)
  useEffect(() => {
    if (!conns.bearer || cloud) return
    let stop = false
    const tick = () => fetchAllPhones(conns.bearer).then(l => { if (!stop) setStatuses(l.map(p => Number(p.status))) }).catch(() => {})
    tick(); const iv = setInterval(tick, 60_000)
    return () => { stop = true; clearInterval(iv) }
  }, [conns.bearer, cloud])
  const onNow = statuses ? statuses.filter(s => s === 0 || s === 2).length : null

  const sLoading = !series
  const daily = series?.days ?? []
  // Rythme de crédits : 2 crédits par compte publié (échecs remboursés) → jours restants.
  const perDay = series ? (series.ok7 * 2) / 7 : 0
  const runway = balance !== null && perDay > 0 ? Math.floor(balance / perDay) : null
  const refresh = () => { reload(); void reloadSeries() }
  const upcoming = data?.upcoming ?? []
  const recent = data?.recent ?? []
  const quick = useMemo(() => {
    if (!onOpenTool || cloud) return []
    const v = new Map(visibleTools(infra, isAdmin).map(t => [t.id, t]))
    return ['story', 'tiktok', 'remix', 'viral'].map(id => v.get(id)).filter((t): t is Tool => !!t)
  }, [infra, isAdmin, onOpenTool, cloud])
  const hasReels = !!reels && reels.length >= 3
  const goViral = () => onNavigate('viral')

  // Bento : 12 colonnes (6 en moyen, 1 en mobile).
  const span = (wide: number, m: number): CSSProperties => ({ gridColumn: narrow ? '1 / -1' : `span ${mid ? m : wide}`, minWidth: 0 })
  const status: { c: string; l: string; go: () => void }[] = [
    ...(!cloud ? [{ c: conns.loading ? '#5A5A63' : conns.bearer ? '#4ADE80' : '#FBBF24', l: conns.loading ? 'GeeLark…' : conns.bearer ? 'GeeLark connecté' : 'GeeLark non connecté', go: () => conns.bearer ? onNavigate('phones') : openTool(onNavigate, 'settings', { tab: 'integrations' }) }] : []),
    ...(onNow !== null ? [{ c: '#4ADE80', l: `${fmtNumber(onNow)} allumé(s)`, go: () => onNavigate('phones') }] : []),
    ...(data ? [{ c: '#A78BFA', l: `${fmtNumber(data.phoneCount)} ${cloud ? 'appareils' : 'comptes prêts'}`, go: () => onNavigate(cloud ? 'cloud' : 'phones') }] : []),
  ]

  return (
    <div className="sf-db" style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{KEYFRAMES}</style>

      {/* Bandeau : aurore animée + éventail des vrais Reels qui explosent */}
      <section style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate', borderRadius: 26, border: '1px solid rgba(255,255,255,0.08)', background: '#0B0B0D', marginBottom: 14, animation: 'dbRise .5s cubic-bezier(.2,.8,.2,1) both' }}>
        {/* Couleurs du meilleur Reel, très floutées, en fond à droite */}
        {hasReels && <img src={reels![0].thumb} alt="" aria-hidden="true" style={{ position: 'absolute', zIndex: -2, right: '-5%', top: '-30%', width: '60%', height: '160%', objectFit: 'cover', filter: 'blur(60px) saturate(1.4)', opacity: 0.45 }} />}
        <span style={{ position: 'absolute', zIndex: -1, left: '-8%', top: '-60%', width: '55%', height: '220%', borderRadius: 999, background: 'radial-gradient(circle, rgba(139,92,246,0.45), transparent 62%)', filter: 'blur(20px)', animation: 'dbAuroraA 14s ease-in-out infinite' }} />
        <span style={{ position: 'absolute', zIndex: -1, right: '-10%', top: '-80%', width: '55%', height: '240%', borderRadius: 999, background: 'radial-gradient(circle, rgba(236,72,153,0.3), transparent 62%)', filter: 'blur(24px)', animation: 'dbAuroraB 17s ease-in-out infinite' }} />
        <span style={{ position: 'absolute', zIndex: -1, left: '35%', bottom: '-120%', width: '45%', height: '200%', borderRadius: 999, background: 'radial-gradient(circle, rgba(34,211,238,0.14), transparent 62%)', filter: 'blur(24px)', animation: 'dbAuroraA 20s ease-in-out infinite reverse' }} />
        <span style={{ position: 'absolute', zIndex: -1, inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '22px 22px', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 30%, #000 50%, transparent 80%)', maskImage: 'linear-gradient(90deg, transparent, #000 30%, #000 50%, transparent 80%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: narrow ? '24px 18px' : '30px 30px 30px 34px' }}>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 650, color: 'rgba(244,244,245,0.6)' }}>{cap}</span>
            <h1 style={{ margin: '6px 0 0', fontSize: narrow ? 32 : 'clamp(36px, 3.6vw, 50px)', fontWeight: 850, letterSpacing: '-0.045em', lineHeight: 1, color: '#FFFFFF' }}>
              {hello}, <span data-no-tr>{firstName}</span>
            </h1>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {status.map(s => (
                <button key={s.l} type="button" onClick={s.go} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(10,10,11,0.45)', backdropFilter: 'blur(8px)', color: '#E4E4E7', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: s.c, boxShadow: `0 0 8px ${s.c}` }} />{s.l}
                </button>
              ))}
            </span>
            <span style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => cloud ? onNavigate('cloud') : openTool(onNavigate, 'publish', { mode: 'reels' })}
                style={{ flex: narrow ? 1 : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, padding: '0 22px', borderRadius: 13, border: 'none', background: '#FFFFFF', color: '#0A0A0B', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 30px -10px rgba(255,255,255,0.35)' }}>
                <Icon d={cloud ? I.phone : 'M12 5v14|M5 12h14'} size={15} sw={2.4} />{cloud ? 'Mes appareils' : 'Publier un Reel'}
              </button>
              <button type="button" onClick={refresh} title="Actualiser" aria-label="Actualiser" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, flexShrink: 0, borderRadius: 13, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(10,10,11,0.45)', backdropFilter: 'blur(8px)', color: '#F4F4F5', cursor: 'pointer' }}><Icon d={I.refresh} size={15} /></button>
            </span>
            {quick.length > 0 && (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                {quick.map(t => (
                  <button key={t.id} type="button" onClick={() => onOpenTool!(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px 0 5px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(10,10,11,0.4)', backdropFilter: 'blur(8px)', color: '#E4E4E7', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 7, background: `linear-gradient(135deg, ${t.a}, ${t.b})`, color: '#fff' }}><Icon d={t.icon} size={11} /></span>{t.label}
                  </button>
                ))}
              </span>
            )}
          </div>
          {!narrow && hasReels && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <ReelFan reels={reels!} onOpen={goViral} small={mid} />
              <button type="button" onClick={goViral} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', color: 'rgba(244,244,245,0.75)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: '#F472B6', boxShadow: '0 0 8px #F472B6', animation: 'dbGlow 1.4s ease-in-out infinite' }} />Ce qui explose en ce moment<Icon d={I.arrow} size={12} sw={2} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Bento */}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : `repeat(${mid ? 6 : 12}, minmax(0,1fr))`, gap: 14 }}>
        <div style={span(8, 6)}><PerfCard days={daily} ok7={series?.ok7 ?? null} okPrev7={series?.okPrev7 ?? null} loading={sLoading} /></div>
        <div style={span(4, 3)}><RateCard rate={series?.rate7 ?? null} prev={series?.ratePrev7 ?? null} ok={series?.ok7 ?? 0} failed={series?.failed7 ?? 0} loading={sLoading} onOpen={() => onNavigate('activity')} /></div>
        <div style={span(6, 3)}><CreditsCard balance={loading ? null : balance} runway={runway} spent7={series ? series.ok7 * 2 : null} onOpen={() => openTool(onNavigate, 'settings', { tab: 'billing' })} /></div>
        <div style={span(6, 3)}><LiveCard onNavigate={onNavigate} delay={0.2} /></div>
        {reels && reels.length >= 2 && <div style={span(12, 6)}><ReelsCard reels={reels} onOpen={goViral} cols={narrow ? 2 : mid ? 4 : 6} delay={0.25} /></div>}

        {/* Aujourd'hui */}
        <div style={span(5, 6)}>
          <Bento delay={0.3}>
            <div style={{ padding: '20px 22px 10px' }}>
              <Label icon={I.clock} right={<button type="button" onClick={() => onNavigate('scheduled')} style={{ padding: 0, border: 'none', background: 'transparent', color: '#C4B5FD', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Calendrier</button>}>Aujourd’hui</Label>
            </div>
            {loading ? <SkeletonRows rows={3} /> : upcoming.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 18px 24px', textAlign: 'center' }}>
                <span style={{ fontSize: 13, color: '#8B8B94', lineHeight: 1.5 }}>Rien de programmé aujourd’hui. Programme un post : il partira tout seul, même PC éteint.</span>
                <Btn theme={theme} sm label="Programmer" icon={I.clock} onClick={() => openTool(onNavigate, 'scheduled', { view: 'calendar' })} />
              </div>
            ) : (
              <div data-rows="" style={{ padding: '0 0 10px' }}>
                {upcoming.map((r, i) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '0 22px' }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#C4B5FD', minWidth: 46, paddingTop: 12, flexShrink: 0 }}>{fmtTime(r.scheduled_at)}</span>
                    <span style={{ position: 'relative', width: 12, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      <span style={{ position: 'absolute', top: i === 0 ? 16 : 0, bottom: i === upcoming.length - 1 ? 'calc(100% - 16px)' : 0, width: 2, borderRadius: 2, background: 'linear-gradient(180deg, rgba(167,139,250,.5), rgba(244,114,182,.3))' }} />
                      <span style={{ position: 'relative', marginTop: 11, width: 10, height: 10, borderRadius: 99, background: '#0E0E10', border: '2.5px solid #A78BFA', boxShadow: '0 0 10px rgba(167,139,250,.6)' }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 0' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {phoneCountOf(r)} compte{phoneCountOf(r) > 1 ? 's' : ''}{r.caption ? ` · ${r.caption.slice(0, 32)}${r.caption.length > 32 ? '…' : ''}` : ''}
                      </span>
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>{fmtDay(r.scheduled_at)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Bento>
        </div>

        {/* Activité récente */}
        <div style={span(7, 6)}>
          <Bento delay={0.35}>
            <div style={{ padding: '20px 22px 10px' }}>
              <Label icon={I.list} right={<button type="button" onClick={() => onNavigate('activity')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', color: '#C4B5FD', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Historique<Icon d={I.arrow} size={13} sw={2} /></button>}>Activité récente</Label>
            </div>
            {loading ? <SkeletonRows rows={3} avatar /> : recent.length === 0 ? (
              <div style={{ padding: '18px 18px 26px', textAlign: 'center', fontSize: 13, color: '#8B8B94' }}>Aucune activité récente.</div>
            ) : (
              <div data-rows="" style={{ paddingBottom: 8 }}>
                {recent.map((item, i) => {
                  const ok = item.kind === 'scheduled' ? item.data.status === 'done' : item.data.err_count === 0
                  const label = item.kind === 'scheduled'
                    ? `${phoneCountOf(item.data)} compte${phoneCountOf(item.data) > 1 ? 's' : ''}${item.data.caption ? ` · ${item.data.caption.slice(0, 34)}${item.data.caption.length > 34 ? '…' : ''}` : ''}`
                    : `${item.data.ok_count}/${item.data.total} compte${item.data.total > 1 ? 's' : ''} · Direct`
                  const date = item.kind === 'scheduled' ? fmtDay(item.data.executed_at ?? item.data.created_at) : fmtDay(item.data.created_at)
                  const stat = item.kind === 'scheduled'
                    ? (item.data.status === 'done' ? 'OK' : item.data.status === 'failed' ? 'Échec' : item.data.status)
                    : `${item.data.ok_count}/${item.data.total}`
                  const key = item.kind === 'scheduled' ? `sp-${item.data.id}` : `pr-${item.data.id}`
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', minHeight: 50, boxSizing: 'border-box', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 99, flexShrink: 0, background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', color: ok ? '#4ADE80' : '#FBBF24' }}>
                        <Icon d={ok ? 'M20 6L9 17l-5-5' : 'M12 9v4|M12 17h.01'} size={13} sw={2.2} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 550, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                        <span style={{ fontSize: 11.5, color: '#71717A' }}>{date}</span>
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: ok ? '#4ADE80' : '#FBBF24', flexShrink: 0 }}>{stat}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Bento>
        </div>
      </div>
    </div>
  )
}
