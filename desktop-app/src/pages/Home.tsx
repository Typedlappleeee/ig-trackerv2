import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Btn, Icon, MONO, Panel, PanelHead, Skeleton, SkeletonRows, useNarrow } from '@/lib/ui'
import { fetchAllPhones } from '@/lib/geelark'
import { useRuns } from '@/lib/runStore'
import { useFlowRuns } from '@/lib/flowEngine'
import { useActivitySeries, type DayPoint } from '@/lib/activitySeries'
import { useConnections } from '@/lib/connections'
import type { OrgState } from '@/lib/data'
import {
  type HubData, firstNameFrom, fmtNumber, fmtTime, fmtDay, phoneCountOf,
} from '@/lib/data'
import type { PageKey } from '@/Shell'

// Tuiles « Lancer » — portées de _hub() (LAUNCH), par infrastructure.
function launchTiles(infra: InfraKey): { id: string; label: string; hint: string; icon: string; page: PageKey }[] {
  return infra === 'cloud' ? [
    { id: 'dev', label: 'Mes appareils', hint: 'appareils cloud', icon: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', page: 'cloud' },
    { id: 'flows', label: 'Automatisation', hint: 'flux prêts', icon: 'M12 8V4H8|M4 4h16v16H4z|M9 16h6', page: 'flows' },
    { id: 'studio', label: 'Remixer une vidéo', hint: 'gratuit', icon: 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z', page: 'studio' },
    { id: 'reci', label: 'Rejouer une séquence', hint: 'séquences prêtes', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6', page: 'recipes' },
  ] : [
    { id: 'reels', label: 'Publier un Reel', hint: 'comptes prêts', icon: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z', page: 'publish' },
    { id: 'story', label: 'Publier une Story', hint: 'lien par compte', icon: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1', page: 'publish' },
    { id: 'studio', label: 'Remixer une vidéo', hint: 'gratuit', icon: 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z', page: 'studio' },
    { id: 'warm', label: 'Chauffer des comptes', hint: 'warmup', icon: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z', page: 'warmup' },
  ]
}

function LaunchTile({ a, accent, onClick }: { a: ReturnType<typeof launchTiles>[number]; accent: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 8,
        background: '#111113', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer',
        textAlign: 'left', transition: 'background .12s ease, border-color .12s ease', boxSizing: 'border-box',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.background = '#161618' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = '#111113' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6,
          background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: accent,
        }}><Icon d={a.icon} size={15} /></span>
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{a.label}</span>
      <span style={{ fontSize: 12, color: '#8B8B94' }}>{a.hint}</span>
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
    <Panel theme={theme} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>Bien démarrer avec ScaleFlow</span>
          <span style={{ fontSize: 12.5, color: '#8B8B94' }}>{done}/{steps.length} étapes terminées — suis-les dans l’ordre, ça prend 5 minutes.</span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 120, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(done / steps.length) * 100}%`, background: theme.accent, transition: 'width .3s ease' }} />
          </span>
          <Btn theme={theme} sm tone="quiet" label="Masquer" onClick={onHide} />
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        {steps.map((s, i) => {
          const current = i === next
          return (
            <div key={s.title} style={{ display: 'flex', gap: 12, padding: 16, borderRight: '1px solid rgba(255,255,255,0.05)', background: current ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 99, flexShrink: 0, boxSizing: 'border-box', fontSize: 11, fontWeight: 600,
                background: s.done ? 'rgba(74,222,128,0.12)' : current ? '#EDEDEF' : 'transparent', color: s.done ? '#4ADE80' : current ? '#0A0A0B' : '#71717A',
                border: s.done ? '1px solid rgba(74,222,128,0.3)' : current ? 'none' : '1px solid rgba(255,255,255,0.14)' }}>{s.done ? '✓' : i + 1}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: s.done ? '#8B8B94' : '#EDEDEF', textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</span>
                <span style={{ fontSize: 12, lineHeight: 1.5, color: '#71717A' }}>{s.text}</span>
                {!s.done && <span style={{ marginTop: 6 }}><Btn theme={theme} sm tone={current ? 'primary' : 'ghost'} label={s.cta} onClick={() => onNavigate(s.page)} /></span>}
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// ── Petits éléments du tableau de bord ───────────────────────────────────────
const C_OK = '#8B7CF6', C_KO = '#E5484D'   // palette validée (fond #111113, daltonisme OK)

function Delta({ now, prev, unit = '%', invert = false }: { now: number | null; prev: number | null; unit?: string; invert?: boolean }) {
  if (now === null || prev === null) return null
  const diff = unit === 'pts' ? now - prev : prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 100)
  if (diff === 0) return <span style={{ fontSize: 11.5, fontWeight: 500, color: '#71717A' }}>= semaine passée</span>
  const up = diff > 0, good = invert ? !up : up
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 500, color: good ? '#4ADE80' : '#F87171' }}>
      <Icon d={up ? 'M7 17L17 7|M8 7h9v9' : 'M7 7l10 10|M17 8v9H8'} size={11} sw={2} />
      {up ? '+' : ''}{diff}{unit === 'pts' ? ' pts' : ' %'}
      <span style={{ color: '#71717A', fontWeight: 400 }}>vs semaine passée</span>
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

function StatCard({ label, value, sub, spark, accent, loading, onClick }: {
  label: string; value: string; sub?: ReactNode; spark?: number[]; accent?: string; loading?: boolean; onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 10, textAlign: 'left', minWidth: 0,
      background: '#111113', border: '1px solid rgba(255,255,255,0.07)', cursor: onClick ? 'pointer' : 'default', boxSizing: 'border-box',
      transition: 'border-color .15s ease, background .15s ease, transform .15s ease', color: 'inherit',
    }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'none' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1, color: accent ?? '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>
          {loading ? <Skeleton w={64} h={24} r={5} /> : value}
        </span>
        {spark && !loading && <Spark values={spark} color={accent ?? C_OK} />}
      </span>
      <span style={{ minHeight: 16 }}>{loading ? <Skeleton w={110} h={10} /> : sub}</span>
    </button>
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
  const H = 200, padL = 30, padB = 22, padT = 8
  const max = Math.max(4, ...days.map(d => d.ok + d.failed))
  const nice = (() => { const step = Math.pow(10, Math.floor(Math.log10(max))); const m = Math.ceil(max / step); return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * step })()
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
    <Panel theme={theme} style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHead title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>En direct{items.length > 0 && <span style={{ width: 6, height: 6, borderRadius: 99, background: '#4ADE80', animation: 'aPulse 1.6s ease-in-out infinite' }} />}</span>}
        sub={items.length ? `${items.length} automatisation(s) en cours` : 'Aucune automatisation en cours'} />
      {items.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '28px 16px', textAlign: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: '#161618', border: '1px solid rgba(255,255,255,0.08)', color: '#8B8B94' }}>
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
    </Panel>
  )
}

function StatusPill({ ok, label, onClick }: { ok: boolean | null; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 10px', borderRadius: 99, cursor: onClick ? 'pointer' : 'default',
      background: '#111113', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, fontWeight: 500, color: '#A1A1AA', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: ok === null ? '#5A5A63' : ok ? '#4ADE80' : '#FBBF24' }} />
      {label}
    </button>
  )
}

export default function Home({ theme, infra, user, org, data, loading, reload, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
  data: HubData | null; loading: boolean; reload: () => void
  onNavigate: (p: PageKey) => void
}) {
  const conns = useConnections(user, org)
  const narrow = useNarrow(980)
  const { series, reloadSeries } = useActivitySeries(user, org)
  const [hideOnboard, setHideOnboard] = useState(() => { try { return localStorage.getItem(ONBOARD_KEY) === '1' } catch { return false } })
  const firstName = firstNameFrom(data?.displayName ?? null, user.email)
  const balance = data?.balance ?? null
  const now = new Date()
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const cap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)
  const hour = now.getHours()
  const hello = hour < 5 ? 'Bonsoir' : hour < 18 ? 'Bonjour' : 'Bonsoir'

  // Téléphones allumés en ce moment (statut réel GeeLark).
  const [onNow, setOnNow] = useState<number | null>(null)
  useEffect(() => {
    if (!conns.bearer || infra === 'cloud') return
    let stop = false
    const tick = () => fetchAllPhones(conns.bearer).then(l => { if (!stop) setOnNow(l.filter(p => p.status === 0 || p.status === 2).length) }).catch(() => {})
    tick(); const iv = setInterval(tick, 60_000)
    return () => { stop = true; clearInterval(iv) }
  }, [conns.bearer, infra])

  const sLoading = !series
  const daily = series?.days ?? []
  const last7 = daily.slice(-7)
  const okSpark = daily.map(d => d.ok)
  const rateSpark = daily.map(d => d.ok + d.failed ? d.ok / (d.ok + d.failed) : 0)
  // Rythme de crédits : 2 crédits par compte publié (échecs remboursés) → jours restants.
  const perDay = series ? (series.ok7 * 2) / 7 : 0
  const runway = balance !== null && perDay > 0 ? Math.floor(balance / perDay) : null

  const TILES = launchTiles(infra).map(t => t.id === 'reels' && data && !loading ? { ...t, hint: `${fmtNumber(data.phoneCount)} comptes prêts` } : t)
  const STEPS = [
    { done: !!conns.bearer, title: 'Connecter GeeLark', text: 'Colle ton token GeeLark (OpenAPI) pour piloter tes téléphones.', cta: 'Ouvrir les réglages', page: 'settings' as PageKey },
    { done: (data?.phoneCount ?? 0) > 0, title: 'Synchroniser tes téléphones', text: 'Récupère tes cloud phones et associe chaque compte Instagram.', cta: 'Voir mes téléphones', page: 'phones' as PageKey },
    { done: (data?.videoCount ?? 0) > 0, title: 'Importer du contenu', text: 'Ajoute tes vidéos et images dans la banque, rangées par dossier.', cta: 'Ouvrir la banque', page: 'bank' as PageKey },
    { done: (data?.weekPosts ?? 0) > 0 || (data?.recent?.length ?? 0) > 0, title: 'Publier ton premier Reel', text: 'Choisis des comptes, une vidéo, une légende — et lance.', cta: 'Publier', page: 'publish' as PageKey },
  ]
  const showOnboard = infra !== 'cloud' && !hideOnboard && !loading && !conns.loading && !!data && STEPS.some(s => !s.done)
  const upcoming = data?.upcoming ?? []
  const recent = data?.recent ?? []
  const refresh = () => { reload(); void reloadSeries() }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* En-tête : salutation + état du compte en un coup d'œil */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: '#71717A', marginBottom: 6 }}>{cap}</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#EDEDEF' }}>
            {hello}, <span data-no-tr>{firstName}</span>
          </h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {infra !== 'cloud' && <StatusPill ok={conns.loading ? null : !!conns.bearer} label={conns.loading ? 'GeeLark…' : conns.bearer ? 'GeeLark connecté' : 'GeeLark non connecté'} onClick={() => onNavigate(conns.bearer ? 'phones' : 'settings')} />}
          {onNow !== null && <StatusPill ok={true} label={`${fmtNumber(onNow)} allumé(s) maintenant`} onClick={() => onNavigate('phones')} />}
          <Btn label="Actualiser" theme={theme} sm onClick={refresh} icon="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3|M21 3v6h-6|M3 21v-6h6" />
        </div>
      </div>

      {showOnboard && <Onboarding theme={theme} steps={STEPS} onNavigate={onNavigate} onHide={() => { setHideOnboard(true); try { localStorage.setItem(ONBOARD_KEY, '1') } catch { /* ignore */ } }} />}

      {/* Chiffres clés + tendance */}
      <div data-rows="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(210px,100%),1fr))', gap: 12 }}>
        <StatCard label="Comptes publiés · 7 jours" loading={sLoading} value={fmtNumber(series?.ok7 ?? 0)} spark={okSpark.slice(-7)}
          sub={series && <Delta now={series.ok7} prev={series.okPrev7} />} onClick={() => onNavigate('activity')} />
        <StatCard label="Taux de réussite · 7 jours" loading={sLoading} value={series?.rate7 === null || !series ? '—' : `${series.rate7} %`} accent={series?.rate7 !== null && series && series.rate7 < 80 ? '#FBBF24' : '#4ADE80'}
          spark={series?.rate7 === null ? undefined : rateSpark.slice(-7).map(v => v * 100)}
          sub={series && <Delta now={series.rate7} prev={series.ratePrev7} unit="pts" />} onClick={() => onNavigate('activity')} />
        <StatCard label="Mes appareils" loading={loading || !data} value={fmtNumber(data?.phoneCount ?? 0)}
          sub={<span style={{ fontSize: 11.5, color: '#71717A' }}>{onNow !== null ? `${fmtNumber(onNow)} allumé(s) maintenant` : `${fmtNumber(data?.videoCount ?? 0)} médias en banque`}</span>} onClick={() => onNavigate('phones')} />
        <StatCard label="Crédits" loading={loading || balance === null} value={fmtNumber(balance ?? 0)} accent="#FBBF24"
          sub={<span style={{ fontSize: 11.5, color: '#71717A' }}>{runway !== null ? `≈ ${fmtNumber(runway)} jour(s) au rythme actuel` : `≈ ${fmtNumber(Math.floor((balance ?? 0) / 2))} posts restants`}</span>} onClick={() => onNavigate('settings')} />
      </div>

      {/* Graphique + en direct */}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,2fr) minmax(0,1fr)', gap: 12, marginTop: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="Publications · 14 jours" sub={series ? `${fmtNumber(series.days.reduce((s, d) => s + d.ok, 0))} comptes publiés · ${fmtNumber(series.days.reduce((s, d) => s + d.failed, 0))} échecs` : undefined}
            right={<span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#A1A1AA' }}>
              {([['Publiés', C_OK], ['Échecs', C_KO]] as [string, string][]).map(([l, c]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}</span>)}
            </span>} />
          <div style={{ padding: '12px 16px 10px' }}>
            {sLoading ? <Skeleton h={200} r={6} /> : <ActivityChart days={daily} />}
          </div>
          {!sLoading && last7.every(d => d.ok + d.failed === 0) && daily.every(d => d.ok + d.failed === 0) && (
            <div style={{ padding: '0 16px 14px', fontSize: 12.5, color: '#8B8B94' }}>Aucune publication sur 14 jours — lance ton premier Reel pour voir la courbe se remplir.</div>
          )}
        </Panel>
        <LiveRuns theme={theme} onNavigate={onNavigate} />
      </div>

      {/* Lancer */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '24px 0 12px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>Lancer</span>
      </div>
      <div data-rows="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px,100%),1fr))', gap: 12 }}>
        {TILES.map(a => <LaunchTile key={a.id} a={a} accent={theme.accentText} onClick={() => onNavigate(a.page)} />)}
      </div>

      {/* Programmé aujourd'hui + Activité récente */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 12, marginTop: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="Programmé aujourd’hui" right={
            <Btn label="Voir le calendrier" theme={theme} sm tone="quiet"
              icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
              onClick={() => onNavigate('scheduled')} />
          } />
          {loading ? (
            <SkeletonRows rows={3} />
          ) : upcoming.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#8B8B94' }}>Rien de programmé aujourd’hui.</div>
          ) : (
            <div data-rows="" style={{ padding: '6px 0' }}>
              {upcoming.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '0 16px' }}>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, color: theme.accentText, minWidth: 46, paddingTop: 13, flexShrink: 0 }}>{fmtTime(r.scheduled_at)}</span>
                  <span style={{ position: 'relative', width: 10, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                    <span style={{ position: 'absolute', top: i === 0 ? 16 : 0, bottom: i === upcoming.length - 1 ? 'calc(100% - 16px)' : 0, width: 1, background: 'rgba(255,255,255,0.08)' }} />
                    <span style={{ position: 'relative', marginTop: 13, width: 8, height: 8, borderRadius: 99, background: '#111113', border: `2px solid ${theme.accent}` }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {phoneCountOf(r)} compte{phoneCountOf(r) > 1 ? 's' : ''}{r.caption ? ` · ${r.caption.slice(0, 38)}${r.caption.length > 38 ? '…' : ''}` : ''}
                    </span>
                    <span style={{ fontSize: 11.5, color: '#71717A' }}>{fmtDay(r.scheduled_at)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel theme={theme}>
          <PanelHead title="Activité récente" right={
            <Btn label="Historique" theme={theme} sm tone="quiet" onClick={() => onNavigate('activity')} />
          } />
          {loading ? (
            <SkeletonRows rows={3} avatar />
          ) : recent.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#8B8B94' }}>Aucune activité récente.</div>
          ) : (
            <div data-rows="">
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
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', minHeight: 48, boxSizing: 'border-box',
                    borderBottom: i < recent.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                      background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: ok ? '#4ADE80' : '#FBBF24',
                    }}>
                      <Icon d={ok ? 'M20 6L9 17l-5-5' : 'M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'} size={12} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>{date}</span>
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, color: ok ? '#4ADE80' : '#FBBF24', flexShrink: 0 }}>{stat}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
