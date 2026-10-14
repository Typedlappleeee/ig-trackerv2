// Accueil, version épurée : bonjour + état, 4 chiffres clés, « Lancer » en tuiles photo
// (aperçus animés des outils), les Reels qui explosent, puis l'activité / en direct /
// aujourd'hui / récent. Même kit visuel que l'Explorer (ToolTile, SectionHead, LinkBtn).
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Btn, Icon, MONO, Skeleton, SkeletonRows, useNarrow } from '@/lib/ui'
import { fetchAllPhones } from '@/lib/geelark'
import { useRuns } from '@/lib/runStore'
import { useFlowRuns } from '@/lib/flowEngine'
import { useActivitySeries, type DayPoint } from '@/lib/activitySeries'
import { useConnections } from '@/lib/connections'
import type { OrgState } from '@/lib/data'
import {
  type HubData, firstNameFrom, fmtNumber, compact, fmtTime, fmtDay, phoneCountOf,
} from '@/lib/data'
import type { PageKey } from '@/Shell'
import { visibleTools, type Tool } from '@/lib/tools'
import { openTool } from '@/lib/openTool'
import { ToolTile, SectionHead, LinkBtn, usePhotos, pickerFor } from '@/pages/Explore'
import { SPOT_KEYFRAMES } from '@/components/LaunchSpotlight'
import { useTopReels } from '@/components/CineHero'

// Tuiles « Lancer » de l'infra Cloud (pages hors catalogue d'outils).
function launchTiles(): { id: string; label: string; hint: string; icon: string; page: PageKey }[] {
  return [
    { id: 'dev', label: 'Mes appareils', hint: 'appareils cloud', icon: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', page: 'cloud' },
    { id: 'flows', label: 'Automatisation', hint: 'flux prêts', icon: 'M12 8V4H8|M4 4h16v16H4z|M9 16h6', page: 'flows' },
    { id: 'studio', label: 'Remixer une vidéo', hint: 'gratuit', icon: 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z', page: 'studio' },
    { id: 'reci', label: 'Rejouer une séquence', hint: 'séquences prêtes', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6', page: 'recipes' },
  ]
}
// Outils mis en avant dans « Lancer » (dans cet ordre, s'ils sont visibles).
const LAUNCH_IDS = ['reels', 'story', 'tiktok', 'remix', 'genjutsu', 'warmup', 'viral', 'subs', 'spoof']

// ── Carte sombre avec en-tête (titre, sous-titre, action) ─────────────────────
function Card({ title, sub, right, children, style }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: 18, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '16px 18px 12px' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: '#F4F4F5' }}>{title}</span>
            {sub && <span style={{ fontSize: 12.5, color: '#71717A' }}>{sub}</span>}
          </span>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}
const DarkCard = Card

// ── Chiffre clé (cliquable) ───────────────────────────────────────────────────
function Kpi({ label, value, sub, extra, color, onClick }: { label: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode; color?: string; onClick?: () => void }) {
  const [h, setH] = useState(false)
  return (
    <button type="button" onClick={onClick} disabled={!onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, padding: '16px 18px', borderRadius: 18, textAlign: 'left', color: 'inherit', cursor: onClick ? 'pointer' : 'default',
        background: h && onClick ? '#131315' : '#0F0F11', border: `1px solid ${h && onClick ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`, transition: 'background .15s ease, border-color .15s ease' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#8B8B94' }}>
        {label}{onClick && <span style={{ display: 'flex', color: h ? '#A1A1AA' : '#3F3F46', transition: 'color .15s ease' }}><Icon d="M7 17L17 7|M8 7h9v9" size={13} sw={2} /></span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: color ?? '#F4F4F5', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
        {extra}
      </span>
      <span style={{ minHeight: 16, fontSize: 12 }}>{sub}</span>
    </button>
  )
}

// ── « Bien démarrer » : les 4 étapes pour être opérationnel, cochées automatiquement ──
const ONBOARD_KEY = 'sf-onboarding-hidden'
function Onboarding({ theme, steps, onNavigate, onHide }: {
  theme: Theme; onHide: () => void; onNavigate: (p: PageKey) => void
  steps: { done: boolean; title: string; text: string; cta: string; page: PageKey }[]
}) {
  const done = steps.filter(s => s.done).length
  const next = steps.findIndex(s => !s.done)
  return (
    <Card style={{ marginBottom: 28 }} title="Bien démarrer avec ScaleFlow" sub={`${done}/${steps.length} étapes terminées — suis-les dans l’ordre, ça prend 5 minutes.`}
      right={<span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 110, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(done / steps.length) * 100}%`, background: 'linear-gradient(90deg,#A78BFA,#F472B6)', transition: 'width .3s ease' }} /></span>
        <Btn theme={theme} sm tone="quiet" label="Masquer" onClick={onHide} />
      </span>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, padding: '4px 14px 14px' }}>
        {steps.map((s, i) => {
          const current = i === next
          return (
            <div key={s.title} style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 14, background: current ? '#151517' : 'transparent', border: `1px solid ${current ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}` }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 99, flexShrink: 0, boxSizing: 'border-box', fontSize: 11.5, fontWeight: 700,
                background: s.done ? 'rgba(74,222,128,0.12)' : current ? '#F4F4F5' : 'transparent', color: s.done ? '#4ADE80' : current ? '#0A0A0B' : '#71717A',
                border: s.done ? '1px solid rgba(74,222,128,0.3)' : current ? 'none' : '1px solid rgba(255,255,255,0.14)' }}>{s.done ? '✓' : i + 1}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: s.done ? '#71717A' : '#F4F4F5', textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</span>
                <span style={{ fontSize: 12, lineHeight: 1.5, color: '#71717A' }}>{s.text}</span>
                {!s.done && <span style={{ marginTop: 6 }}><Btn theme={theme} sm tone={current ? 'primary' : 'ghost'} label={s.cta} onClick={() => onNavigate(s.page)} /></span>}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ── Petits éléments du tableau de bord ───────────────────────────────────────
const C_OK = '#8B7CF6', C_KO = '#E5484D'   // palette validée (fond #111113, daltonisme OK)

function Delta({ now, prev, unit = '%', invert = false, short = false }: { now: number | null; prev: number | null; unit?: string; invert?: boolean; short?: boolean }) {
  if (now === null || prev === null) return null
  const diff = unit === 'pts' ? now - prev : prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 100)
  if (diff === 0) return <span style={{ fontSize: 11.5, fontWeight: 500, color: '#71717A' }}>= semaine passée</span>
  const up = diff > 0, good = invert ? !up : up
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 500, color: good ? '#4ADE80' : '#F87171' }}>
      <Icon d={up ? 'M7 17L17 7|M8 7h9v9' : 'M7 7l10 10|M17 8v9H8'} size={11} sw={2} />
      {up ? '+' : ''}{diff}{unit === 'pts' ? ' pts' : ' %'}
      {!short && <span style={{ color: '#71717A', fontWeight: 400 }}>vs semaine passée</span>}
    </span>
  )
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values)
  const w = 96, h = 28
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - 2 - (v / max) * (h - 6)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity={0.1} stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Graphique : comptes publiés / en échec par jour (barres empilées) ────────
function ActivityChart({ days }: { days: DayPoint[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const H = 200, padB = 22, padT = 8
  const max = Math.max(4, ...days.map(d => d.ok + d.failed))
  const nice = (() => { const step = Math.pow(10, Math.floor(Math.log10(max))); const m = Math.ceil(max / step); return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * step })()
  // Marge gauche selon la plus longue graduation (« 1 000 » était coupé en « 000 »).
  const padL = Math.max(30, 14 + fmtNumber(nice).length * 6.5)
  const plotW = w - padL, plotH = H - padB - padT
  const band = plotW / days.length
  const bw = Math.min(24, Math.max(6, band * 0.56))
  const y = (v: number) => padT + plotH - (v / nice) * plotH
  const ticks = [0, nice / 2, nice]
  const fmtD = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const hd = hover !== null ? days[hover] : null
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label="Comptes publiés et en échec par jour, 14 derniers jours" style={{ display: 'block' }}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="#71717A" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = padL + band * i + band / 2, x = cx - bw / 2
          const okH = (d.ok / nice) * plotH, koH = (d.failed / nice) * plotH
          const gap = d.ok > 0 && d.failed > 0 ? 2 : 0
          const top = koH > 0 ? 'ko' : 'ok'
          const seg = (yTop: number, h: number, fill: string, rounded: boolean) => h <= 0 ? null : rounded
            ? <path d={`M${x},${yTop + h} V${yTop + Math.min(4, h)} Q${x},${yTop} ${x + Math.min(4, bw / 2)},${yTop} H${x + bw - Math.min(4, bw / 2)} Q${x + bw},${yTop} ${x + bw},${yTop + Math.min(4, h)} V${yTop + h} Z`} fill={fill} />
            : <rect x={x} y={yTop} width={bw} height={h} fill={fill} />
          const dim = hover !== null && hover !== i
          return (
            <g key={d.day} opacity={dim ? 0.45 : 1} style={{ transition: 'opacity .12s ease' }}>
              {seg(y(d.ok), okH, C_OK, top === 'ok')}
              {seg(y(d.ok) - gap - koH, koH, C_KO, top === 'ko')}
              {d.ok + d.failed === 0 && <rect x={x} y={y(0) - 2} width={bw} height={2} rx={1} fill="rgba(255,255,255,0.08)" />}
              {(i % 2 === (days.length - 1) % 2 || band > 46) && <text x={cx} y={H - 6} textAnchor="middle" fontSize={10.5} fill={i === days.length - 1 ? '#A1A1AA' : '#71717A'}>{i === days.length - 1 ? "Auj." : new Date(d.ts).getDate()}</text>}
              <rect x={padL + band * i} y={0} width={band} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          )
        })}
      </svg>
      {hd && hover !== null && (
        <div style={{
          position: 'absolute', top: 6, left: Math.min(Math.max(padL + band * hover + band / 2 - 80, 0), w - 160), width: 160, pointerEvents: 'none',
          padding: '8px 10px', borderRadius: 8, background: '#18181B', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)', fontSize: 12,
        }}>
          <div style={{ color: '#A1A1AA', marginBottom: 6 }}>{fmtD(hd.ts)}</div>
          {([['Publiés', hd.ok, C_OK], ['Échecs', hd.failed, C_KO]] as [string, number, string][]).map(([l, v, c]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              <span style={{ color: '#A1A1AA', flex: 1 }}>{l}</span>
              <span style={{ color: '#EDEDEF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Runs en cours (publication, flows, édition…) ──────────────────────────────
function LiveRuns({ theme, onNavigate }: { theme: Theme; onNavigate: (p: PageKey) => void }) {
  const runs = useRuns().filter(r => r.status === 'running')
  const flows = useFlowRuns().filter(r => r.status === 'preparing' || r.status === 'running')
  const items = [
    ...runs.filter(r => r.kind !== 'flow').map(r => ({ id: r.id, label: r.label, done: r.done, failed: r.failed, total: r.total, detail: r.detail })),
    ...flows.map(f => ({ id: f.id, label: f.flowName, done: f.phones.filter(p => p.status === 'done').length, failed: f.phones.filter(p => p.status === 'failed').length, total: f.phones.length, detail: undefined as string | undefined })),
  ]
  return (
    <DarkCard title={<>En direct{items.length > 0 && <span style={{ width: 7, height: 7, borderRadius: 99, background: '#4ADE80', boxShadow: '0 0 0 4px rgba(74,222,128,.15)', animation: 'aPulse 1.6s ease-in-out infinite' }} />}</>}
      sub={items.length ? `${items.length} automatisation(s) en cours` : 'Aucune automatisation en cours'}>
      {items.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 16px 24px', textAlign: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 99, background: '#161618', border: '1px solid rgba(255,255,255,0.08)', color: '#8B8B94' }}>
            <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" size={16} />
          </span>
          <span style={{ fontSize: 12.5, color: '#8B8B94', maxWidth: 220, lineHeight: 1.5 }}>Tes publications en cours apparaîtront ici, avec leur progression.</span>
          <Btn theme={theme} sm tone="primary" icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" label="Publier" onClick={() => onNavigate('publish')} />
        </div>
      ) : (
        <div data-rows="">
          {items.slice(0, 5).map((r, i) => {
            const pct = r.total ? ((r.done + r.failed) / r.total) * 100 : 0
            return (
              <div key={r.id} style={{ padding: '12px 16px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span data-no-tr style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  <span style={{ fontSize: 11.5, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{r.done + r.failed}/{r.total}</span>
                </div>
                <div style={{ display: 'flex', height: 4, marginTop: 8, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', gap: r.done && r.failed ? 2 : 0 }}>
                  <span style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%`, background: '#4ADE80', transition: 'width .4s ease' }} />
                  <span style={{ width: `${r.total ? (r.failed / r.total) * 100 : 0}%`, background: C_KO, transition: 'width .4s ease' }} />
                </div>
                {r.detail && <div data-no-tr style={{ marginTop: 6, fontSize: 11.5, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail}</div>}
                {!r.detail && <div style={{ marginTop: 6, fontSize: 11.5, color: '#71717A' }}>{Math.round(pct)} %</div>}
              </div>
            )
          })}
        </div>
      )}
    </DarkCard>
  )
}

// ── Les Reels qui explosent (Veille) : rangée de cartes 9:16 ──────────────────
function ReelsTray({ onOpen }: { onOpen: () => void }) {
  const reels = useTopReels(8)
  const narrow = useNarrow(760)
  const wide = !useNarrow(1180)
  if (!reels || reels.length < 2) return null
  const list = reels.slice(0, wide ? 6 : 8)
  return (
    <section style={{ marginBottom: 36 }}>
      <SectionHead title={<>Ce qui explose <span style={{ color: '#71717A', fontWeight: 650 }}>cette semaine</span></>} right={<LinkBtn label="Ouvrir la Veille" onClick={onOpen} />} />
      <div style={wide
        ? { display: 'grid', gridTemplateColumns: `repeat(${list.length}, minmax(0,1fr))`, gap: 14 }
        : { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        {list.map((r, i) => {
          const hot = r.score >= 3
          return (
            <button key={r.thumb} type="button" onClick={onOpen} title="Ouvrir la Veille"
              style={{ position: 'relative', flexShrink: 0, width: wide ? undefined : narrow ? 138 : 168, aspectRatio: '9 / 16', padding: 0, border: 'none', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', background: '#141416', boxShadow: '0 0 0 1px rgba(255,255,255,0.06)', animation: `sfsPop .5s ${i * 0.04}s both`, transition: 'transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s ease' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.24)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.06)' }}>
              <img src={r.thumb} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 22%, transparent 55%, rgba(0,0,0,.88) 100%)' }} />
              {r.score > 0 && <span style={{ position: 'absolute', top: 10, right: 10, height: 22, padding: '0 8px', display: 'inline-flex', alignItems: 'center', borderRadius: 99, background: hot ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'rgba(10,10,11,.55)', color: '#fff', fontSize: 11.5, fontWeight: 800, backdropFilter: 'blur(6px)' }}>{hot ? '🔥 ' : ''}×{r.score >= 10 ? Math.round(r.score) : r.score.toFixed(1).replace('.', ',')}</span>}
              <span style={{ position: 'absolute', left: 12, right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em' }}><Icon d="M6 4l14 8-14 8V4z" size={12} sw={2.4} />{compact(r.views)}</span>
                <span data-no-tr style={{ fontSize: 12, fontWeight: 650, color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{r.username}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
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
  const twoCol = !useNarrow(1080)
  const wideTiles = !useNarrow(1180)
  const { series, reloadSeries } = useActivitySeries(user, org)
  const [hideOnboard, setHideOnboard] = useState(() => { try { return localStorage.getItem(ONBOARD_KEY) === '1' } catch { return false } })
  const firstName = firstNameFrom(data?.displayName ?? null, user.email)
  const balance = data?.balance ?? null
  const now = new Date()
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const cap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)
  const hour = now.getHours()
  const hello = hour < 5 ? 'Bonsoir' : hour < 18 ? 'Bonjour' : 'Bonsoir'
  const cloud = infra === 'cloud'

  // Téléphones allumés en ce moment (statut réel GeeLark).
  const [onNow, setOnNow] = useState<number | null>(null)
  useEffect(() => {
    if (!conns.bearer || cloud) return
    let stop = false
    const tick = () => fetchAllPhones(conns.bearer).then(l => { if (!stop) setOnNow(l.filter(p => p.status === 0 || p.status === 2).length) }).catch(() => {})
    tick(); const iv = setInterval(tick, 60_000)
    return () => { stop = true; clearInterval(iv) }
  }, [conns.bearer, cloud])

  const sLoading = !series
  const daily = series?.days ?? []
  const okSpark = daily.map(d => d.ok)
  const rateSpark = daily.map(d => d.ok + d.failed ? d.ok / (d.ok + d.failed) : 0)
  // Rythme de crédits : 2 crédits par compte publié (échecs remboursés) → jours restants.
  const perDay = series ? (series.ok7 * 2) / 7 : 0
  const runway = balance !== null && perDay > 0 ? Math.floor(balance / perDay) : null

  const photos = usePhotos(user, org)
  const tools = onOpenTool && !cloud ? (() => {
    const v = visibleTools(infra, isAdmin)
    const byId = new Map(v.map(t => [t.id, t]))
    return LAUNCH_IDS.map(id => byId.get(id)).filter((t): t is Tool => !!t).slice(0, 6)
  })() : []
  const STEPS = [
    { done: !!conns.bearer, title: 'Connecter GeeLark', text: 'Colle ton token GeeLark (OpenAPI) pour piloter tes téléphones.', cta: 'Ouvrir les réglages', page: 'settings' as PageKey },
    { done: (data?.phoneCount ?? 0) > 0, title: 'Synchroniser tes téléphones', text: 'Récupère tes cloud phones et associe chaque compte Instagram.', cta: 'Voir mes téléphones', page: 'phones' as PageKey },
    { done: (data?.videoCount ?? 0) > 0, title: 'Importer du contenu', text: 'Ajoute tes vidéos et images dans la banque, rangées par dossier.', cta: 'Ouvrir la banque', page: 'bank' as PageKey },
    { done: (data?.weekPosts ?? 0) > 0 || (data?.recent?.length ?? 0) > 0, title: 'Publier ton premier Reel', text: 'Choisis des comptes, une vidéo, une légende — et lance.', cta: 'Publier', page: 'publish' as PageKey },
  ]
  const showOnboard = !cloud && !hideOnboard && !loading && !conns.loading && !!data && STEPS.some(s => !s.done)
  const upcoming = data?.upcoming ?? []
  const recent = data?.recent ?? []
  const refresh = () => { reload(); void reloadSeries() }
  const total14 = series ? series.days.reduce((s, d) => s + d.ok, 0) : null

  const ghostBtn = (label: string, onClick: () => void, icon?: string) => (
    <button type="button" onClick={onClick} title={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: icon && !label ? 0 : '0 16px', width: icon && !label ? 42 : undefined, justifyContent: 'center', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: '#111113', color: '#EDEDEF', fontSize: 14, fontWeight: 650, cursor: 'pointer', transition: 'background .15s ease, border-color .15s ease' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#18181B'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }} onMouseLeave={e => { e.currentTarget.style.background = '#111113'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}>
      {icon && <Icon d={icon} size={15} />}{label}
    </button>
  )
  const dot = (c: string) => <span style={{ width: 7, height: 7, borderRadius: 99, background: c, flexShrink: 0 }} />
  const status: { c: string; l: string; go: () => void }[] = [
    ...(!cloud ? [{ c: conns.loading ? '#5A5A63' : conns.bearer ? '#4ADE80' : '#FBBF24', l: conns.loading ? 'GeeLark…' : conns.bearer ? 'GeeLark connecté' : 'GeeLark non connecté', go: () => conns.bearer ? onNavigate('phones') : openTool(onNavigate, 'settings', { tab: 'integrations' }) }] : []),
    ...(onNow !== null ? [{ c: '#4ADE80', l: `${fmtNumber(onNow)} allumé(s) maintenant`, go: () => onNavigate('phones') }] : []),
  ]

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{SPOT_KEYFRAMES}</style>
      {/* Bonjour */}
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#71717A' }}>{cap}</span>
          <h1 style={{ margin: '4px 0 0', fontSize: narrow ? 30 : 38, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: '#F4F4F5' }}>
            {hello}, <span data-no-tr>{firstName}</span>
          </h1>
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: '#8B8B94' }}>
            {status.map(s => (
              <button key={s.l} type="button" onClick={s.go} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: 0, border: 'none', background: 'transparent', color: '#A1A1AA', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{dot(s.c)}{s.l}</button>
            ))}
            <span>{data ? fmtNumber(data.phoneCount) : '…'} {cloud ? 'appareils' : 'comptes prêts'}</span>
          </span>
        </div>
        <span style={{ display: 'flex', gap: 8, width: narrow ? '100%' : undefined }}>
          {ghostBtn('', refresh, 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3|M21 3v6h-6|M3 21v-6h6')}
          {!narrow && ghostBtn('Explorer', () => onNavigate('explore'), 'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z')}
          <button type="button" onClick={() => cloud ? onNavigate('cloud') : openTool(onNavigate, 'publish', { mode: 'reels' })}
            style={{ flex: narrow ? 1 : undefined, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 12, border: 'none', background: '#F4F4F5', color: '#0A0A0B', fontSize: 14, fontWeight: 750, cursor: 'pointer', transition: 'transform .12s ease, background .15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF' }} onMouseLeave={e => { e.currentTarget.style.background = '#F4F4F5'; e.currentTarget.style.transform = 'none' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(.98)' }} onMouseUp={e => { e.currentTarget.style.transform = 'none' }}>
            <Icon d={cloud ? 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z' : 'M12 5v14|M5 12h14'} size={15} sw={2.2} />{cloud ? 'Mes appareils' : 'Publier un Reel'}
          </button>
        </span>
      </header>

      {showOnboard && <Onboarding theme={theme} steps={STEPS} onNavigate={p => p === 'settings' ? openTool(onNavigate, 'settings', { tab: 'integrations' }) : onNavigate(p)} onHide={() => { setHideOnboard(true); try { localStorage.setItem(ONBOARD_KEY, '1') } catch { /* ignore */ } }} />}

      {/* Chiffres clés */}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: narrow ? 10 : 14, marginBottom: 36 }}>
        <Kpi label="Comptes publiés · 7 j" value={sLoading ? <Skeleton w={70} h={26} r={6} /> : compact(series?.ok7 ?? 0)} extra={!sLoading && !narrow && <Spark values={okSpark.slice(-7)} color={C_OK} />}
          sub={series ? <Delta now={series.ok7} prev={series.okPrev7} short={narrow} /> : null} onClick={() => onNavigate('activity')} />
        <Kpi label="Taux de réussite" color={series?.rate7 != null && series.rate7 < 80 ? '#FBBF24' : '#F4F4F5'} value={sLoading ? <Skeleton w={70} h={26} r={6} /> : series?.rate7 == null ? '—' : `${series.rate7} %`}
          extra={!sLoading && !narrow && series?.rate7 != null && <Spark values={rateSpark.slice(-7).map(v => v * 100)} color="#4ADE80" />}
          sub={series ? <Delta now={series.rate7} prev={series.ratePrev7} unit="pts" short={narrow} /> : null} onClick={() => onNavigate('activity')} />
        <Kpi label={cloud ? 'Appareils' : 'Comptes'} value={loading || !data ? <Skeleton w={60} h={26} r={6} /> : compact(data.phoneCount)}
          sub={<span style={{ color: '#71717A' }}>{onNow !== null ? `${fmtNumber(onNow)} allumé(s) maintenant` : `${fmtNumber(data?.videoCount ?? 0)} médias en banque`}</span>} onClick={() => onNavigate('phones')} />
        <Kpi label="Crédits" color="#C4B5FD" value={loading || balance === null ? <Skeleton w={80} h={26} r={6} /> : fmtNumber(balance)}
          sub={<span style={{ color: '#71717A' }}>{runway !== null ? `≈ ${fmtNumber(runway)} jour(s) au rythme actuel` : `≈ ${fmtNumber(Math.floor((balance ?? 0) / 2))} posts restants`}</span>} onClick={() => openTool(onNavigate, 'settings', { tab: 'billing' })} />
      </div>

      {/* Lancer : tuiles photo des outils phares */}
      <section style={{ marginBottom: 36 }}>
        <SectionHead title="Lancer" right={<LinkBtn label="Tous les outils" onClick={() => onNavigate('explore')} />} />
        {tools.length > 0 ? (
          <div style={wideTiles
            ? { display: 'grid', gridTemplateColumns: `repeat(${tools.length}, minmax(0,1fr))`, gap: 14 }
            : { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {tools.map((t, i) => (
              <ToolTile key={t.id} t={t} i={i} size="sm" pick={pickerFor(t, i, photos)} onOpen={() => onOpenTool!(t)}
                style={{ aspectRatio: '3 / 4', flexShrink: 0, width: wideTiles ? undefined : narrow ? 150 : 180 }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px,100%),1fr))', gap: 12 }}>
            {launchTiles().map(a => (
              <button key={a.id} type="button" onClick={() => onNavigate(a.page)} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 16, background: '#0F0F11', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: '#18181B', color: theme.accentText }}><Icon d={a.icon} size={15} /></span>
                <span style={{ fontSize: 14, fontWeight: 650, color: '#F4F4F5' }}>{a.label}</span>
                <span style={{ fontSize: 12, color: '#8B8B94' }}>{a.hint}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Les Reels qui explosent */}
      <ReelsTray onOpen={() => onNavigate('viral')} />

      {/* Activité · en direct · aujourd'hui · récent */}
      <SectionHead title="Activité" right={<LinkBtn label="Historique" onClick={() => onNavigate('activity')} />} />
      <div style={{ display: 'grid', gridTemplateColumns: twoCol ? 'minmax(0,1.7fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Card title="14 derniers jours" sub={total14 === null ? '…' : `${fmtNumber(total14)} comptes publiés`}
            right={<span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#A1A1AA' }}>{([['Publiés', C_OK], ['Échecs', C_KO]] as [string, string][]).map(([l, c]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{l}</span>)}</span>}>
            <div style={{ padding: '0 14px 10px' }}>
              {sLoading ? <Skeleton h={200} r={8} /> : <ActivityChart days={daily} />}
              {!sLoading && daily.every(d => d.ok + d.failed === 0) && <div style={{ padding: '4px 4px 8px', fontSize: 12.5, color: '#8B8B94' }}>Aucune publication sur 14 jours — lance ton premier Reel pour voir la courbe se remplir.</div>}
            </div>
          </Card>
          <Card title="Activité récente">
            {loading ? <SkeletonRows rows={3} avatar /> : recent.length === 0 ? (
              <div style={{ padding: '26px 16px 30px', textAlign: 'center', fontSize: 13, color: '#8B8B94' }}>Aucune activité récente.</div>
            ) : (
              <div data-rows="" style={{ paddingBottom: 6 }}>
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
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', minHeight: 50, boxSizing: 'border-box', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 99, flexShrink: 0, background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', color: ok ? '#4ADE80' : '#FBBF24' }}>
                        <Icon d={ok ? 'M20 6L9 17l-5-5' : 'M12 9v4|M12 17h.01'} size={13} sw={2.2} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 550, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                        <span style={{ fontSize: 11.5, color: '#71717A' }}>{date}</span>
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: ok ? '#4ADE80' : '#FBBF24', flexShrink: 0 }}>{stat}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <LiveRuns theme={theme} onNavigate={onNavigate} />
          <Card title="Aujourd’hui" sub={upcoming.length ? `${upcoming.length} post(s) programmé(s)` : 'Rien de programmé'}
            right={<Btn label="Calendrier" theme={theme} sm tone="quiet" icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" onClick={() => onNavigate('scheduled')} />}>
            {loading ? <SkeletonRows rows={3} /> : upcoming.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 16px 24px', textAlign: 'center' }}>
                <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.5 }}>Programme un post : il partira tout seul, même PC éteint.</span>
                <Btn theme={theme} sm label="Programmer" icon="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2" onClick={() => openTool(onNavigate, 'scheduled', { view: 'calendar' })} />
              </div>
            ) : (
              <div data-rows="" style={{ padding: '0 0 8px' }}>
                {upcoming.map((r, i) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '0 18px' }}>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: '#C4B5FD', minWidth: 44, paddingTop: 13, flexShrink: 0 }}>{fmtTime(r.scheduled_at)}</span>
                    <span style={{ position: 'relative', width: 10, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      <span style={{ position: 'absolute', top: i === 0 ? 16 : 0, bottom: i === upcoming.length - 1 ? 'calc(100% - 16px)' : 0, width: 1, background: 'rgba(255,255,255,0.08)' }} />
                      <span style={{ position: 'relative', marginTop: 13, width: 8, height: 8, borderRadius: 99, background: '#0F0F11', border: '2px solid #A78BFA' }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0' }}>
                      <span style={{ fontSize: 13, fontWeight: 550, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {phoneCountOf(r)} compte{phoneCountOf(r) > 1 ? 's' : ''}{r.caption ? ` · ${r.caption.slice(0, 32)}${r.caption.length > 32 ? '…' : ''}` : ''}
                      </span>
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>{fmtDay(r.scheduled_at)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
