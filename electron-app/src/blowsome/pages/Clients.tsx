// Blowsome — page Clients (agence VIP). Données 100% mock, aucun réseau.
import { useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowPageHeader, BlowBadge, BlowButton, BlowEmpty,
} from '../ui'

type Plan = 'VIP' | 'Pro' | 'Standard'
type Status = 'actif' | 'pause'

interface Client {
  handle: string
  name: string
  plan: Plan
  status: Status
  posts: number
  reach: string
  avatarInitial: string
}

const CLIENTS: Client[] = [
  { handle: '@luxe.paris',     name: 'Luxe Paris',      plan: 'VIP',      status: 'actif', posts: 148, reach: '2,4 M', avatarInitial: 'L' },
  { handle: '@maison.doré',    name: 'Maison Doré',     plan: 'VIP',      status: 'actif', posts: 96,  reach: '1,8 M', avatarInitial: 'M' },
  { handle: '@velvet.skin',    name: 'Velvet Skin',     plan: 'Pro',      status: 'actif', posts: 210, reach: '3,1 M', avatarInitial: 'V' },
  { handle: '@atelier.rose',   name: 'Atelier Rose',    plan: 'Pro',      status: 'pause', posts: 54,  reach: '640 K', avatarInitial: 'A' },
  { handle: '@nova.beauty',    name: 'Nova Beauty',     plan: 'VIP',      status: 'actif', posts: 173, reach: '2,9 M', avatarInitial: 'N' },
  { handle: '@saveurs.midi',   name: 'Saveurs Midi',    plan: 'Standard', status: 'actif', posts: 61,  reach: '410 K', avatarInitial: 'S' },
  { handle: '@éclat.studio',   name: 'Éclat Studio',    plan: 'Pro',      status: 'actif', posts: 128, reach: '1,3 M', avatarInitial: 'É' },
  { handle: '@brut.café',      name: 'Brut Café',       plan: 'Standard', status: 'pause', posts: 38,  reach: '290 K', avatarInitial: 'B' },
  { handle: '@aurore.mode',    name: 'Aurore Mode',     plan: 'VIP',      status: 'actif', posts: 189, reach: '4,2 M', avatarInitial: 'A' },
  { handle: '@petale.co',      name: 'Pétale & Co',     plan: 'Pro',      status: 'actif', posts: 87,  reach: '920 K', avatarInitial: 'P' },
]

export function BlowClients({ user: _user }: { user: User }) {
  useBlowCSS()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const list = q
    ? CLIENTS.filter(c => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q) || c.plan.toLowerCase().includes(q))
    : CLIENTS

  const activeCount = CLIENTS.filter(c => c.status === 'actif').length

  return (
    <div>
      <BlowPageHeader
        title="Clients"
        subtitle={`${CLIENTS.length} marques accompagnées · ${activeCount} actives ce mois`}
        action={<BlowButton variant="primary"><Ico d={ICON.spark} size={15} /> Ajouter un client</BlowButton>}
      />

      {/* Barre de recherche */}
      <div style={{ position: 'relative', marginBottom: 24, maxWidth: 460, animation: 'blow-rise .5s cubic-bezier(.16,1,.3,1) .04s both' }}>
        <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: FAINT, pointerEvents: 'none' }}>
          <Ico d={ICON.eye} size={17} />
        </span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher une marque, un handle, un plan…"
          className="blow-tap"
          style={{
            width: '100%', height: 46, padding: '0 16px 0 44px', borderRadius: 13, outline: 'none',
            color: INK, fontSize: 14, fontWeight: 500,
            background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}`,
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
          } as CSSProperties}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)' }}
          onBlur={e => { e.currentTarget.style.borderColor = HAIR }}
        />
      </div>

      {list.length === 0 ? (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title="Aucun client" hint="Aucune marque ne correspond à ta recherche. Essaie un autre nom ou ajoute un nouveau client." icon="✦" />
        </BlowCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {list.map((c, i) => (
            <BlowCard
              key={c.handle}
              hover
              style={{ padding: 20, position: 'relative', overflow: 'hidden', animation: `blow-rise .5s cubic-bezier(.16,1,.3,1) ${0.05 + i * 0.03}s both` }}
            >
              <div aria-hidden style={{ position: 'absolute', top: -34, right: -24, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${c.plan === 'VIP' ? 'rgba(233,196,106,0.24)' : 'rgba(168,85,247,0.22)'}, transparent 68%)`, opacity: .55 }} />

              {/* En-tête carte : avatar + identité */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                <span style={{
                  width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  color: '#fff', fontWeight: 900, fontSize: 18, background: GRAD,
                  boxShadow: '0 10px 22px -10px rgba(168,85,247,0.75)',
                }}>{c.avatarInitial}</span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.handle}</p>
                </div>
              </div>

              {/* Badges */}
              <div style={{ position: 'relative', display: 'flex', gap: 7, marginBottom: 16, flexWrap: 'wrap' }}>
                <BlowBadge tone={c.plan === 'VIP' ? 'gold' : 'accent'}>{c.plan === 'VIP' ? '★ VIP' : c.plan}</BlowBadge>
                <BlowBadge tone={c.status === 'actif' ? 'ok' : 'muted'}>{c.status === 'actif' ? 'Actif' : 'En pause'}</BlowBadge>
              </div>

              {/* Mini-stats */}
              <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <MiniStat icon={ICON.grid} label="Posts" value={c.posts} accent="#A855F7" />
                <MiniStat icon={ICON.heart} label="Reach" value={c.reach} accent={GOLD} />
              </div>
            </BlowCard>
          ))}
        </div>
      )}

      {/* Pied : synthèse */}
      <p style={{ margin: '26px 2px 0', fontSize: 12.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Ico d={ICON.bolt} size={14} />
        <span>{list.length} client{list.length > 1 ? 's' : ''} affiché{list.length > 1 ? 's' : ''} · portefeuille piloté par <Grad style={{ fontWeight: 800 }}>Blowsome</Grad></span>
      </p>
    </div>
  )
}

function MiniStat({ icon, label, value, accent }: { icon: string; label: string; value: string | number; accent: string }) {
  return (
    <div style={{ padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: `1px solid ${HAIR}` }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>
        <span style={{ color: accent }}><Ico d={icon} size={12} sw={2} /></span>{label}
      </span>
      <p style={{ margin: '5px 0 0', fontSize: 19, fontWeight: 900, color: INK, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}

export default BlowClients
