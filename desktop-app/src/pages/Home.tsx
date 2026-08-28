import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Icon, Panel, PanelHead, PageHead } from '@/lib/ui'
import {
  type HubData, firstNameFrom, fmtNumber, fmtTime, fmtDay, phoneCountOf,
} from '@/lib/data'
import type { PageKey } from '@/Shell'

// Tuiles « Lancer » — portées de _hub() (LAUNCH), par infrastructure.
function launchTiles(infra: InfraKey): { id: string; label: string; hint: string; icon: string; tone: string; page: PageKey }[] {
  return infra === 'cloud' ? [
    { id: 'dev', label: 'Mes appareils', hint: 'appareils cloud', icon: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', tone: '6,182,212', page: 'cloud' },
    { id: 'flows', label: 'Automatisation', hint: 'flux prêts', icon: 'M12 8V4H8|M4 4h16v16H4z|M9 16h6', tone: '139,92,246', page: 'flows' },
    { id: 'studio', label: 'Remixer une vidéo', hint: 'gratuit', icon: 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z', tone: '236,72,153', page: 'studio' },
    { id: 'reci', label: 'Rejouer une séquence', hint: 'séquences prêtes', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6', tone: '16,185,129', page: 'recipes' },
  ] : [
    { id: 'reels', label: 'Publier un Reel', hint: 'comptes prêts', icon: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z', tone: '139,92,246', page: 'phones' },
    { id: 'story', label: 'Publier une Story', hint: 'lien par compte', icon: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1', tone: '6,182,212', page: 'flows' },
    { id: 'studio', label: 'Remixer une vidéo', hint: 'gratuit', icon: 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z', tone: '236,72,153', page: 'studio' },
    { id: 'warm', label: 'Chauffer des comptes', hint: 'warmup', icon: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z', tone: '245,158,11', page: 'flows' },
  ]
}

function LaunchTile({ a, onClick }: { a: ReturnType<typeof launchTiles>[number]; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 11, padding: 15, borderRadius: 10,
        background: '#101015', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
        textAlign: 'left', transition: 'all .18s ease', boxSizing: 'border-box',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `rgba(${a.tone},0.4)`; e.currentTarget.style.background = '#13131A' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = '#101015' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
          background: `rgba(${a.tone},0.12)`, border: `1px solid rgba(${a.tone},0.24)`, color: `rgb(${a.tone})`,
        }}><Icon d={a.icon} size={15} /></span>
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F4F4F6' }}>{a.label}</span>
      <span style={{ fontSize: 11, color: '#71717A' }}>{a.hint}</span>
    </button>
  )
}

// ── KPI (valeur réelle, ou « … » pendant le chargement) ────────────────────────
function Kpi({ theme, label, value, color, hint, hintColor }: {
  theme: Theme; label: string; value: string; color?: string; hint?: string; hintColor?: string
}) {
  return (
    <Panel theme={theme} style={{ padding: 15 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#52525B' }}>{label}</div>
      <div style={{
        marginTop: 9, fontFamily: "'Space Grotesk',sans-serif", fontSize: 25, fontWeight: 700,
        letterSpacing: '-0.03em', color: color || '#F4F4F6', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{value}</div>
      {hint ? (
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: hintColor || '#71717A' }}>{hint}</div>
      ) : null}
    </Panel>
  )
}

export default function Home({ theme, infra, user, data, loading, reload, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User
  data: HubData | null; loading: boolean; reload: () => void
  onNavigate: (p: PageKey) => void
}) {
  const el = '…'
  const firstName = firstNameFrom(data?.displayName ?? null, user.email)
  const balance = data?.balance ?? null
  const now = new Date()
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const cap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)

  const KPI: { label: string; value: string; color?: string; hint?: string; hintColor?: string }[] = [
    { label: 'Mes appareils', value: loading || !data ? el : fmtNumber(data.phoneCount) },
    { label: 'Posts · 7 jours', value: loading || !data ? el : fmtNumber(data.weekPosts) },
    { label: 'Vidéos en banque', value: loading || !data ? el : fmtNumber(data.videoCount) },
    {
      label: 'Crédits', value: loading || balance === null ? el : fmtNumber(balance), color: '#FBBF24',
      hint: loading || balance === null ? undefined : `≈ ${fmtNumber(Math.floor(balance / 2))} posts restants`,
      hintColor: '#FBBF24',
    },
  ]

  const TILES = launchTiles(infra)
  const upcoming = data?.upcoming ?? []
  const recent = data?.recent ?? []

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title={<span>Bonjour, <span style={{ color: theme.accentSoft }}>{firstName}</span></span>}
        sub={`${cap} · infrastructure ${infra === 'cloud' ? 'ScaleFlow Cloud' : 'GeeLark'}.`}
        actions={<Btn label="Actualiser" theme={theme} onClick={reload} icon="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3|M21 3v6h-6|M3 21v-6h6" />}
      />

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
        {KPI.map(k => (
          <Kpi key={k.label} theme={theme} label={k.label} value={k.value} color={k.color} hint={k.hint} hintColor={k.hintColor} />
        ))}
      </div>

      {/* Lancer */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '26px 0 11px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#52525B' }}>Lancer</span>
        <span style={{ fontSize: 11, color: '#3F3F46' }}>Tout est prêt</span>
      </div>
      <div data-rows="" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
        {TILES.map(a => <LaunchTile key={a.id} a={a} onClick={() => onNavigate(a.page)} />)}
      </div>

      {/* Deux colonnes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 10 }}>
        {/* Programmé aujourd'hui */}
        <Panel theme={theme}>
          <PanelHead title="Programmé aujourd’hui" right={
            <Btn label="Voir le calendrier" theme={theme} sm tone="quiet"
              icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
              onClick={() => onNavigate('flows')} />
          } />
          {loading ? (
            <div style={{ padding: '24px 15px', fontSize: 12, color: '#52525B' }}>…</div>
          ) : upcoming.length === 0 ? (
            <div style={{ padding: '32px 15px', textAlign: 'center', fontSize: 12, color: '#71717A' }}>Rien de programmé aujourd’hui.</div>
          ) : (
            <div data-rows="">
              {upcoming.map((r, i) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '11px 15px',
                  borderBottom: i < upcoming.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: theme.accentSoft, minWidth: 58, flexShrink: 0 }}>
                    {fmtTime(r.scheduled_at)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#E4E4E7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {phoneCountOf(r)} compte{phoneCountOf(r) > 1 ? 's' : ''}{r.caption ? ` · ${r.caption.slice(0, 38)}${r.caption.length > 38 ? '…' : ''}` : ''}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#52525B' }}>{fmtDay(r.scheduled_at)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Activité récente */}
        <Panel theme={theme}>
          <PanelHead title="Activité récente" right={
            <Btn label="Historique" theme={theme} sm tone="quiet" onClick={() => onNavigate('activity')} />
          } />
          {loading ? (
            <div style={{ padding: '24px 15px', fontSize: 12, color: '#52525B' }}>…</div>
          ) : recent.length === 0 ? (
            <div style={{ padding: '32px 15px', textAlign: 'center', fontSize: 12, color: '#71717A' }}>Aucune activité récente.</div>
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
                    display: 'flex', alignItems: 'center', gap: 11, padding: '11px 15px',
                    borderBottom: i < recent.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: ok ? '#34D399' : '#FBBF24',
                    }}>
                      <Icon d={ok ? 'M20 6L9 17l-5-5' : 'M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'} size={12} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#E4E4E7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      <span style={{ fontSize: 10.5, color: '#52525B' }}>{date}</span>
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: ok ? '#34D399' : '#FBBF24', flexShrink: 0 }}>{stat}</span>
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
