import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { useState } from 'react'
import { Btn, Icon, MONO, Panel, PanelHead, PageHead, Skeleton, SkeletonRows } from '@/lib/ui'
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

// ── KPI (valeur réelle, ou « … » pendant le chargement) ────────────────────────
function Kpi({ theme, label, value, color, hint, hintColor }: {
  theme: Theme; label: string; value: string; color?: string; hint?: string; hintColor?: string
}) {
  return (
    <Panel theme={theme} style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{label}</div>
      <div style={{
        marginTop: 8, fontSize: 24, fontWeight: 600,
        letterSpacing: '-0.03em', color: color || '#EDEDEF', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{value === '…' ? <Skeleton w={56} h={22} r={5} /> : value}</div>
      {hint ? (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: hintColor || '#71717A' }}>{hint}</div>
      ) : null}
    </Panel>
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

export default function Home({ theme, infra, user, org, data, loading, reload, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
  data: HubData | null; loading: boolean; reload: () => void
  onNavigate: (p: PageKey) => void
}) {
  const el = '…'
  const conns = useConnections(user, org)
  const [hideOnboard, setHideOnboard] = useState(() => { try { return localStorage.getItem(ONBOARD_KEY) === '1' } catch { return false } })
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

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title={<span>Bonjour, <span style={{ color: theme.accentSoft }}>{firstName}</span></span>}
        sub={`${cap} · infrastructure ${infra === 'cloud' ? 'ScaleFlow Cloud' : 'GeeLark'}.`}
        actions={<Btn label="Actualiser" theme={theme} onClick={reload} icon="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3|M21 3v6h-6|M3 21v-6h6" />}
      />

      {showOnboard && <Onboarding theme={theme} steps={STEPS} onNavigate={onNavigate} onHide={() => { setHideOnboard(true); try { localStorage.setItem(ONBOARD_KEY, '1') } catch { /* ignore */ } }} />}

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        {KPI.map(k => (
          <Kpi key={k.label} theme={theme} label={k.label} value={k.value} color={k.color} hint={k.hint} hintColor={k.hintColor} />
        ))}
      </div>

      {/* Lancer */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '24px 0 12px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.01em' }}>Lancer</span>
      </div>
      <div data-rows="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        {TILES.map(a => <LaunchTile key={a.id} a={a} accent={theme.accentText} onClick={() => onNavigate(a.page)} />)}
      </div>

      {/* Deux colonnes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12, marginTop: 12 }}>
        {/* Programmé aujourd'hui */}
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
            <div data-rows="">
              {upcoming.map((r, i) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', minHeight: 48, boxSizing: 'border-box',
                  borderBottom: i < upcoming.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, color: theme.accentText, minWidth: 58, flexShrink: 0 }}>
                    {fmtTime(r.scheduled_at)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
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

        {/* Activité récente */}
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
