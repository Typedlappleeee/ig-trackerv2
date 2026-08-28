import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead, Kpi, Empty, ConnectBanner } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { fetchTopReels, fetchMetaConnections, type MediaInsight, type MetaConnection } from '@/lib/meta'

const RANGES: [string, number][] = [['24 h', 1], ['7 j', 7], ['30 j', 30], ['90 j', 90], ['12 mois', 365]]

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`
  return String(Math.round(n))
}

// Courbe SVG (aire + ligne) des vues par jour. Rendu propre, teinté par le thème.
function ViewsCurve({ points, theme }: { points: { label: string; v: number }[]; theme: Theme }) {
  const W = 720, H = 150, pad = 6
  const max = Math.max(1, ...points.map(p => p.v))
  const n = points.length
  const x = (i: number) => n <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1)
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }}>
      <defs>
        <linearGradient id="vc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgba(${theme.tone},0.35)`} />
          <stop offset="100%" stopColor={`rgba(${theme.tone},0)`} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#vc)" />
      <path d={line} fill="none" stroke={theme.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => i === n - 1 && (
        <circle key={i} cx={x(i)} cy={y(p.v)} r={3.5} fill={theme.accentSoft} />
      ))}
    </svg>
  )
}

export default function Insights({ theme, infra, user, org, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onNavigate?: (p: string) => void
}) {
  const [rangeDays, setRangeDays] = useState(30)
  const [reels, setReels] = useState<MediaInsight[]>([])
  const [conns, setConns] = useState<MetaConnection[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, c] = await Promise.all([
      fetchTopReels(user, org, rangeDays).catch(() => []),
      fetchMetaConnections(user, org).catch(() => []),
    ])
    setReels(r); setConns(c); setLoading(false)
  }, [org.currentOrg?.id, user.id, rangeDays])

  useEffect(() => { load() }, [load])

  const connected = conns.length > 0
  const totalViews = reels.reduce((s, r) => s + (r.views ?? 0), 0)
  const totalLikes = reels.reduce((s, r) => s + (r.likes ?? 0), 0)
  const best = reels[0]
  const avg = reels.length ? Math.round(totalViews / reels.length) : 0
  const engRate = totalViews > 0 ? ((totalLikes + reels.reduce((s, r) => s + (r.comments ?? 0), 0)) / totalViews) * 100 : 0

  // Série vues/jour (buckets sur la fenêtre).
  const curve = useMemo(() => {
    const buckets = rangeDays <= 1 ? 24 : Math.min(rangeDays, 30)
    const now = Date.now(); const span = rangeDays * 86400000
    const arr = Array.from({ length: buckets }, () => 0)
    for (const r of reels) {
      if (!r.taken_at) continue
      const t = new Date(r.taken_at).getTime(); const age = now - t
      if (age < 0 || age > span) continue
      const idx = Math.min(buckets - 1, Math.floor(((span - age) / span) * buckets))
      arr[idx] += r.views ?? 0
    }
    return arr.map((v, i) => ({ label: String(i), v }))
  }, [reels, rangeDays])

  function exportCsv() {
    const rows = [['Reel', 'Vues', 'Likes', 'Commentaires', 'Compte', 'Date'],
      ...reels.map(r => [(r.caption ?? '').replace(/\n/g, ' ').slice(0, 60), String(r.views), String(r.likes), String(r.comments), `@${r.ig_username ?? ''}`, r.taken_at ?? ''])]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `reels-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const seg = (on: boolean): CSSProperties => ({
    height: 26, padding: '0 12px', border: 'none', borderRadius: 6, cursor: 'pointer',
    background: on ? `rgba(${theme.tone},0.16)` : 'transparent', color: on ? theme.accentText : '#71717A', fontSize: 11.5, fontWeight: 700,
  })

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Performances"
        sub="Tes vraies stats Instagram (vues, likes, engagement) via l'API officielle — filtrables par période."
        actions={<>
          <span style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {RANGES.map(([l, d]) => <button key={l} onClick={() => setRangeDays(d)} style={seg(rangeDays === d)}>{l}</button>)}
          </span>
          <Btn theme={theme} tone="ghost" icon="M12 15V3|M7 10l5 5 5-5|M4 21h16" label="Exporter" disabled={reels.length === 0} onClick={exportCsv} />
        </>}
      />

      {!connected && <ConnectBanner theme={theme} onConnect={() => onNavigate?.('connections')} />}

      {loading ? (
        <Panel theme={theme}><div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div></Panel>
      ) : !connected ? (
        <Panel theme={theme}>
          <Empty icon="M3 3v18h18|M7 15l4-6 4 3 5-8" title="Connecte tes comptes pour voir tes stats"
            text="Les vraies vues, le classement de tes meilleurs Reels et la courbe s'affichent ici dès que tu relies tes comptes via l'API officielle."
            action={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Connecter mes comptes" onClick={() => onNavigate?.('connections')} />} />
        </Panel>
      ) : reels.length === 0 ? (
        <Panel theme={theme}>
          <Empty icon="M3 3v18h18|M7 15l4-6 4 3 5-8" title="Pas encore de stats sur cette période"
            text="Synchronise tes stats depuis Connexions IG, ou élargis la période." />
        </Panel>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 12 }}>
            <Kpi theme={theme} label="Vues" value={fmt(totalViews)} color={theme.accentText} />
            <Kpi theme={theme} label="Meilleur Reel" value={best ? fmt(best.views) : '—'} hint={best ? `@${best.ig_username ?? ''}` : undefined} />
            <Kpi theme={theme} label="Vues moy. / Reel" value={fmt(avg)} />
            <Kpi theme={theme} label="Engagement" value={`${engRate.toFixed(1)} %`} color="#34D399" />
          </div>

          {/* Courbe des vues par jour */}
          <Panel theme={theme} style={{ marginBottom: 12 }}>
            <PanelHead title="Vues par jour" right={<Chip text={RANGES.find(r => r[1] === rangeDays)?.[0] ?? ''} tone="mute" />} />
            <div style={{ padding: '16px 16px 12px' }}>
              <ViewsCurve points={curve} theme={theme} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#3F3F46' }}>
                <span>−{RANGES.find(r => r[1] === rangeDays)?.[0]}</span><span>aujourd'hui</span>
              </div>
            </div>
          </Panel>

          {/* Meilleurs Reels */}
          <Panel theme={theme}>
            <PanelHead title="Meilleurs Reels" sub="Classés par vues sur la période" right={<Chip text={`${reels.length} Reels`} tone="mute" />} />
            {reels.slice(0, 12).map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 15px', borderBottom: i < 11 ? '1px solid rgba(255,255,255,0.035)' : 'none' }}>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: i === 0 ? '#FBBF24' : i < 3 ? '#A1A1AA' : '#3F3F46', width: 20 }}>{i + 1}</span>
                <span style={{ width: 34, height: 44, borderRadius: 6, flexShrink: 0, overflow: 'hidden', background: `rgba(${theme.tone},0.1)`, border: '1px solid rgba(255,255,255,0.06)' }}>
                  {r.thumbnail_url && <img src={r.thumbnail_url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#F4F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.caption?.trim() || 'Sans légende'}</span>
                  <span style={{ fontSize: 10.5, color: '#52525B' }}>@{r.ig_username ?? '—'}{r.taken_at ? ' · ' + new Date(r.taken_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}</span>
                </span>
                <span style={{ display: 'flex', gap: 14, fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5 }}>
                  <span style={{ color: theme.accentText, fontWeight: 700, minWidth: 52, textAlign: 'right' }}>{fmt(r.views)} <span style={{ color: '#52525B', fontWeight: 500 }}>vues</span></span>
                  <span style={{ color: '#A1A1AA', minWidth: 44, textAlign: 'right' }}>♥ {fmt(r.likes)}</span>
                </span>
              </div>
            ))}
          </Panel>
        </>
      )}
    </div>
  )
}
