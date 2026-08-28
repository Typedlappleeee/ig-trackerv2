import { C, F, R } from '../theme'
import { PageHead, Panel, PanelHead, Kpi, Chip, Btn, Icon, ICONS } from '../ui'
import { KPIS, UPCOMING, RECENT } from '../data/mock'
import type { Page } from '../App'

export function Hub({ go }: { go: (p: Page) => void }) {
  const hour = new Date().getHours()
  const greet = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <PageHead
        title={`${greet}, Quentin`}
        sub={date.charAt(0).toUpperCase() + date.slice(1)}
        right={<><Chip text={<><span style={{ width: 6, height: 6, borderRadius: 99, background: C.ok, display: 'inline-block' }} /> En direct</>} tone="ok" /><Btn label="Actualiser" icon={ICONS.refresh} tone="ghost" sm /></>}
      />

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
        <Kpi label="Téléphones" value={KPIS.phones} icon={ICONS.phone} hint={`${KPIS.online} en ligne`} hintColor={C.ok} />
        <Kpi label="Vidéos en banque" value={KPIS.videos} icon={ICONS.video} hint="12 cette semaine" />
        <Kpi label="Posts · 7 jours" value={KPIS.posts7d.toLocaleString('fr-FR')} icon={ICONS.send} color={C.ok} hint="+18 % vs semaine passée" hintColor={C.ok} />
        <Kpi label="Crédits" value={KPIS.credits.toLocaleString('fr-FR')} icon={ICONS.bolt} color={C.warn} hint={`≈ ${Math.floor(KPIS.credits / 2)} posts`} />
      </div>

      {/* Actions rapides */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        <Btn label="Mass Posting" icon={ICONS.bolt} tone="primary" onClick={() => go('publish')} />
        <Btn label="Programmer" icon={ICONS.calendar} tone="ghost" onClick={() => go('automation')} />
        <Btn label="Banque de contenu" icon={ICONS.bank} tone="ghost" onClick={() => go('bank')} />
        <Btn label="Téléphones" icon={ICONS.phone} tone="ghost" onClick={() => go('phones')} />
      </div>

      {/* Deux colonnes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel pad={0}>
          <div style={{ padding: '14px 18px' }}><PanelHead title="Posts à venir" right={<span onClick={() => go('automation')} style={{ fontSize: 11, color: C.accentLt, fontWeight: 700, cursor: 'pointer' }}>Tout voir →</span>} /></div>
          {UPCOMING.map((u, i) => (
            <Row key={i} icon={u.icon} title={u.title} meta={u.meta} tail={<Chip text={u.tag} tone={u.tone} />} last={i === UPCOMING.length - 1} />
          ))}
        </Panel>
        <Panel pad={0}>
          <div style={{ padding: '14px 18px' }}><PanelHead title="Activité récente" right={<span onClick={() => go('activity')} style={{ fontSize: 11, color: C.accentLt, fontWeight: 700, cursor: 'pointer' }}>Historique →</span>} /></div>
          {RECENT.map((r, i) => (
            <Row key={i} iconColor={r.ok ? C.ok : C.bad} iconBg={r.ok ? 'rgba(52,211,153,0.09)' : 'rgba(248,113,113,0.08)'} glyph={r.ok ? '✓' : '✕'} title={r.title} meta={r.meta} tail={<Chip text={r.tag} tone={r.ok ? 'ok' : 'bad'} />} last={i === RECENT.length - 1} />
          ))}
        </Panel>
      </div>
    </div>
  )
}

function Row({ icon, glyph, iconColor, iconBg, title, meta, tail, last }: { icon?: string; glyph?: string; iconColor?: string; iconBg?: string; title: string; meta: string; tail?: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid ' + C.b1, ...(last ? {} : {}) }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center', background: iconBg || 'rgba(139,92,246,0.10)', border: '1px solid ' + (iconBg ? 'transparent' : 'rgba(139,92,246,0.22)'), color: iconColor || C.accentLt, fontSize: 13, fontWeight: 800 }}>
        {glyph ? glyph : icon ? <Icon paths={icon} size={14} /> : null}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: F.sans }}>{title}</span>
        <span style={{ fontSize: 11.5, color: C.t3 }}>{meta}</span>
      </span>
      {tail}
    </div>
  )
}
