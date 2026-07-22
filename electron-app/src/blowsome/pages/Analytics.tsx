// Blowsome — page Analytics (agence VIP). Données 100% mock, graphe fait maison.
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowStat, BlowPageHeader, BlowBadge,
} from '../ui'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
// Reach mensuel (en millions) — mock.
const REACH = [1.2, 1.5, 1.4, 1.9, 2.3, 2.1, 2.8, 3.0, 2.6, 3.4, 3.9, 4.2]
const MAX = Math.max(...REACH)

interface TopClient { client: string; posts: number; reach: string; engagement: string }
const TOP: TopClient[] = [
  { client: '@aurore.mode', posts: 189, reach: '4,2 M', engagement: '7,8 %' },
  { client: '@velvet.skin', posts: 210, reach: '3,1 M', engagement: '6,4 %' },
  { client: '@nova.beauty', posts: 173, reach: '2,9 M', engagement: '6,1 %' },
  { client: '@luxe.paris',  posts: 148, reach: '2,4 M', engagement: '5,9 %' },
  { client: '@éclat.studio', posts: 128, reach: '1,3 M', engagement: '5,2 %' },
]

export function BlowAnalytics({ user: _user }: { user: User }) {
  useBlowCSS()

  return (
    <div>
      <BlowPageHeader
        title="Analytics"
        subtitle="Performance consolidée de ton portefeuille — 30 derniers jours"
        action={<BlowBadge tone="gold">✦ Rapport VIP</BlowBadge>}
      />

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <BlowStat label="Reach total" value="29,3 M" delta="+24 %" icon={<Ico d={ICON.eye} size={16} />} accent="#A855F7" delay={0.05} />
        <BlowStat label="Engagement" value="6,4 %" delta="+0,8 pt" icon={<Ico d={ICON.heart} size={16} />} accent="#EC4899" delay={0.1} />
        <BlowStat label="Posts publiés" value="1 412" delta="+18 %" icon={<Ico d={ICON.bolt} size={16} />} accent="#6366F1" delay={0.15} />
        <BlowStat label="Nouveaux abonnés" value="+84 k" delta="+31 %" icon={<Ico d={ICON.spark} size={16} />} accent="#22D3EE" delay={0.2} />
      </div>

      {/* Graphe reach mensuel */}
      <BlowCard style={{ padding: 22, marginBottom: 16, animation: 'blow-rise .5s cubic-bezier(.16,1,.3,1) .2s both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Reach mensuel</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: MUTED }}>en millions · année en cours</p>
          </div>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.03em' }}><Grad>{MAX.toFixed(1)} M</Grad></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 190 }}>
          {REACH.map((v, i) => {
            const h = Math.round((v / MAX) * 100)
            const bar: CSSProperties = {
              flex: 1, height: `${h}%`, minWidth: 8, borderRadius: '8px 8px 3px 3px',
              background: 'linear-gradient(180deg, #EC4899, #A855F7 55%, #6366F1)',
              boxShadow: '0 -2px 18px -6px rgba(168,85,247,0.65)',
              transformOrigin: 'bottom',
              animation: `blow-rise .6s cubic-bezier(.16,1,.3,1) ${0.25 + i * 0.03}s both`,
            }
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <div title={`${v} M`} style={bar} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: FAINT }}>{MONTHS[i]}</span>
              </div>
            )
          })}
        </div>
      </BlowCard>

      {/* Top clients */}
      <BlowCard style={{ padding: 0, overflow: 'hidden', animation: 'blow-rise .5s cubic-bezier(.16,1,.3,1) .3s both' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: GOLD }}><Ico d={ICON.spark} size={16} /></span>
          <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>Top clients</span>
        </div>
        {/* En-têtes */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, padding: '10px 20px', borderBottom: `1px solid ${HAIR}` }}>
          {['Client', 'Posts', 'Reach', 'Engagement'].map((h, i) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED, textAlign: i === 0 ? 'left' : 'right' }}>{h}</span>
          ))}
        </div>
        {TOP.map((r, i) => (
          <div key={r.client} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, padding: '13px 20px', borderBottom: i < TOP.length - 1 ? `1px solid ${HAIR}` : 'none', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 12, background: GRAD }}>{r.client.replace('@', '').slice(0, 1).toUpperCase()}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.client}</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: MUTED, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.posts}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: INK, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.reach}</span>
            <span style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><Grad>{r.engagement}</Grad></span>
          </div>
        ))}
      </BlowCard>
    </div>
  )
}

export default BlowAnalytics
