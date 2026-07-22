// Blowsome — page Campagnes (agence VIP). Données 100% mock.
import { useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowBadge, BlowButton, BlowPageHeader, BlowEmpty,
} from '../ui'

type Status = 'en cours' | 'programmée' | 'terminée'
type Filter = 'toutes' | 'en cours' | 'programmée' | 'terminée'

interface Campaign {
  name: string
  client: string
  status: Status
  progress: number
  phones: number
  posts: number
  start: string
}

const CAMPAIGNS: Campaign[] = [
  { name: 'Summer Drop 2026',    client: '@luxe.paris',    status: 'en cours',    progress: 68, phones: 24, posts: 412, start: '18 juil.' },
  { name: 'Reels Blitz — VIP',   client: '@atelier.noir',  status: 'en cours',    progress: 41, phones: 16, posts: 208, start: '20 juil.' },
  { name: 'Rentrée Capsule',     client: '@maison.dorée',   status: 'programmée',  progress: 0,  phones: 32, posts: 0,   start: '01 sept.' },
  { name: 'Black Week Teaser',   client: '@studio.rivage',  status: 'programmée',  progress: 0,  phones: 18, posts: 0,   start: '17 nov.' },
  { name: 'Spring Launch',       client: '@côte.azur',      status: 'terminée',    progress: 100, phones: 28, posts: 640, start: '03 mars' },
  { name: 'Founder Story',       client: '@nova.beauty',    status: 'terminée',    progress: 100, phones: 12, posts: 186, start: '12 juin' },
]

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'toutes',      label: 'Toutes' },
  { id: 'en cours',    label: 'En cours' },
  { id: 'programmée',  label: 'Programmées' },
  { id: 'terminée',    label: 'Terminées' },
]

const STATUS_TONE: Record<Status, 'ok' | 'accent' | 'muted'> = {
  'terminée': 'ok',
  'en cours': 'accent',
  'programmée': 'muted',
}

function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', color: '#D8B4FE', background: 'rgba(168,85,247,0.12)', border: `1px solid ${HAIR}`, flexShrink: 0 }}>
        <Ico d={icon} size={14} />
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
        <p style={{ margin: '1px 0 0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: FAINT }}>{label}</p>
      </div>
    </div>
  )
}

export function BlowCampaigns({ user: _user }: { user: User }) {
  useBlowCSS()
  const [filter, setFilter] = useState<Filter>('toutes')

  const list = filter === 'toutes' ? CAMPAIGNS : CAMPAIGNS.filter(c => c.status === filter)
  const activeCount = CAMPAIGNS.filter(c => c.status === 'en cours').length

  return (
    <div>
      <BlowPageHeader
        title="Campagnes"
        subtitle={`${activeCount} campagnes en cours · pilotage temps réel de tes lancements VIP`}
        action={<BlowButton><Ico d={ICON.rocket} size={15} /> Nouvelle campagne</BlowButton>}
      />

      {/* Filtres segmentés */}
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, marginBottom: 22, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}`, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const active = filter === f.id
          const btn: CSSProperties = {
            border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: 10,
            fontSize: 12.5, fontWeight: active ? 800 : 600,
            color: active ? '#fff' : MUTED,
            background: active ? GRAD : 'transparent',
            backgroundSize: '160% auto',
            boxShadow: active ? '0 10px 22px -12px rgba(168,85,247,0.7)' : 'none',
          }
          return (
            <button key={f.id} className="blow-tap" onClick={() => setFilter(f.id)} style={btn}>{f.label}</button>
          )
        })}
      </div>

      {/* Liste des campagnes */}
      {list.length === 0 ? (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title="Aucune campagne dans ce filtre" hint="Change de filtre ou lance une nouvelle campagne pour la voir apparaître ici." icon="✦" />
        </BlowCard>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {list.map((c, i) => {
            const done = c.status === 'terminée'
            return (
              <BlowCard
                key={c.name}
                hover
                style={{ padding: 22, position: 'relative', overflow: 'hidden', animation: `blow-rise .5s cubic-bezier(.16,1,.3,1) ${i * 0.05}s both` }}
              >
                <div aria-hidden style={{ position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.16), transparent 68%)', opacity: .7 }} />

                {/* En-tête carte */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>{c.name}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: '#D8B4FE' }}>{c.client}</p>
                  </div>
                  <BlowBadge tone={STATUS_TONE[c.status]}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor', boxShadow: '0 0 8px 1px currentColor' }} />
                    {c.status}
                  </BlowBadge>
                </div>

                {/* Barre de progression */}
                <div style={{ position: 'relative', marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>Progression</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: done ? GOLD : INK, fontVariantNumeric: 'tabular-nums' }}>{c.progress}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIR}`, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${c.progress}%`, borderRadius: 99, background: GRAD, backgroundSize: '160% auto', boxShadow: '0 0 14px -2px rgba(168,85,247,0.8)', transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
                  </div>
                </div>

                {/* Mini-stats */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  <MiniStat icon={ICON.users} label="Téléphones" value={String(c.phones)} />
                  <MiniStat icon={ICON.bolt}  label="Posts"      value={c.posts >= 1000 ? `${(c.posts / 1000).toFixed(1)}k` : String(c.posts)} />
                  <MiniStat icon={ICON.spark} label="Départ"     value={c.start} />
                  <div style={{ marginLeft: 'auto' }}>
                    <button className="blow-tap" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 10, border: `1px solid ${HAIR}`, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: INK, fontSize: 12.5, fontWeight: 700 }}>
                      <Ico d={ICON.eye} size={14} /> Détails
                    </button>
                  </div>
                </div>
              </BlowCard>
            )
          })}
        </div>
      )}

      {/* Pied — résumé */}
      <p style={{ margin: '22px 2px 0', fontSize: 12.5, color: FAINT }}>
        <Grad style={{ fontWeight: 800 }}>{list.length}</Grad> campagne{list.length > 1 ? 's' : ''} affichée{list.length > 1 ? 's' : ''} — synchronisées en continu avec tes flottes GeeLark.
      </p>
    </div>
  )
}

export default BlowCampaigns
