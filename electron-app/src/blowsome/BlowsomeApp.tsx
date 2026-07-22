// Blowsome — sous-application VIP autonome.
// Rendu plein écran (remplace le shell ScaleFlow). Sa propre nav, ses propres pages,
// et un bouton "← ScaleFlow" pour rebasculer sur l'app principale.
import { useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { useBlowCSS, Grad, Ico, ICON, GRAD, INK, MUTED, HAIR, BlowStat, BlowCard, BlowPageHeader, BlowBadge, BlowButton } from './ui'
import { BlowClients } from './pages/Clients'
import { BlowCampaigns } from './pages/Campaigns'
import { BlowAnalytics } from './pages/Analytics'
import { BlowSettings } from './pages/Settings'

type Tab = 'dashboard' | 'clients' | 'campaigns' | 'analytics' | 'settings'

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard',  icon: ICON.grid },
  { id: 'clients',   label: 'Clients',    icon: ICON.users },
  { id: 'campaigns', label: 'Campagnes',  icon: ICON.rocket },
  { id: 'analytics', label: 'Analytics',  icon: ICON.chart },
  { id: 'settings',  label: 'Paramètres', icon: ICON.gear },
]

export function BlowsomeApp({ user, onExit }: { user: User; onExit: () => void }) {
  useBlowCSS()
  const [tab, setTab] = useState<Tab>('dashboard')
  const firstName = (user.email?.split('@')[0] ?? 'VIP').replace(/[._]/g, ' ')

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', background: 'radial-gradient(ellipse at 18% 0%, #140a1f 0%, #08070d 55%)', color: INK, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Orbes d'ambiance */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-8%', left: '20%', width: 480, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.22), transparent 66%)', filter: 'blur(70px)', animation: 'blow-orb 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-6%', right: '10%', width: 520, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.16), transparent 68%)', filter: 'blur(74px)', animation: 'blow-orb 24s ease-in-out infinite reverse' }} />
      </div>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{ position: 'relative', zIndex: 1, width: 234, flexShrink: 0, borderRight: `1px solid ${HAIR}`, background: 'rgba(10,7,16,0.6)', backdropFilter: 'blur(14px)', display: 'flex', flexDirection: 'column', padding: '20px 14px' }}>
        {/* Wordmark */}
        <div style={{ padding: '4px 8px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', color: '#fff', background: GRAD, boxShadow: '0 10px 24px -10px rgba(168,85,247,0.8)', fontWeight: 900 }}>✦</span>
          <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-.02em' }}><Grad style={{ animation: 'blow-shimmer 6s linear infinite' }}>BLOWSOME</Grad></span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV.map(n => {
            const active = tab === n.id
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className="blow-tap"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontSize: 13.5, fontWeight: active ? 800 : 600, textAlign: 'left',
                  color: active ? '#fff' : MUTED,
                  background: active ? 'linear-gradient(100deg, rgba(168,85,247,0.22), rgba(99,102,241,0.14))' : 'transparent',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(168,85,247,0.35)' : 'none',
                }}
              >
                <span style={{ color: active ? '#D8B4FE' : FAINTish }}><Ico d={n.icon} size={18} /></span>
                {n.label}
              </button>
            )
          })}
        </nav>

        {/* Switch back to ScaleFlow */}
        <button
          onClick={onExit}
          className="blow-tap"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, border: `1px solid ${HAIR}`, cursor: 'pointer', color: MUTED, background: 'rgba(255,255,255,0.03)', fontSize: 12.5, fontWeight: 700 }}
        >
          <Ico d={ICON.back} size={16} />
          Retour à ScaleFlow
        </button>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="blow-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 30px', borderBottom: `1px solid ${HAIR}`, background: 'rgba(8,7,13,0.72)', backdropFilter: 'blur(14px)' }}>
          <BlowBadge tone="gold">✦ Agence VIP</BlowBadge>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: MUTED, textTransform: 'capitalize' }}>{firstName}</span>
            <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, background: GRAD }}>
              {firstName.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>

        <div style={{ padding: '30px 30px 80px', maxWidth: 1120, margin: '0 auto' }}>
          {tab === 'dashboard' && <BlowDashboard name={firstName} onGo={setTab} />}
          {tab === 'clients'   && <BlowClients user={user} />}
          {tab === 'campaigns' && <BlowCampaigns user={user} />}
          {tab === 'analytics' && <BlowAnalytics user={user} />}
          {tab === 'settings'  && <BlowSettings user={user} />}
        </div>
      </main>
    </div>
  )
}

const FAINTish = 'rgba(236,233,245,0.5)'

// ── Dashboard (exemplaire du design system) ───────────────────────────────
function BlowDashboard({ name, onGo }: { name: string; onGo: (t: Tab) => void }) {
  return (
    <div>
      {/* Hero */}
      <BlowCard style={{ padding: 28, marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -60, right: -30, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.28), transparent 66%)', animation: 'blow-glow 6s ease-in-out infinite' }} />
        <div style={{ position: 'relative' }}>
          <BlowBadge tone="accent">✦ Espace Blowsome</BlowBadge>
          <h1 style={{ margin: '14px 0 6px', fontSize: 34, fontWeight: 900, letterSpacing: '-.035em', textTransform: 'capitalize' }}>
            Bonjour, <Grad style={{ animation: 'blow-shimmer 6s linear infinite' }}>{name}</Grad>
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: MUTED, maxWidth: 520 }}>
            Ton cockpit VIP pour piloter tes clients, tes campagnes et tes résultats — tout au même endroit, en beauté.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <BlowButton onClick={() => onGo('campaigns')}><Ico d={ICON.rocket} size={15} /> Nouvelle campagne</BlowButton>
            <BlowButton variant="ghost" onClick={() => onGo('clients')}><Ico d={ICON.users} size={15} /> Gérer les clients</BlowButton>
          </div>
        </div>
      </BlowCard>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <BlowStat label="Clients actifs" value={12} delta="+3 ce mois" icon={<Ico d={ICON.users} size={16} />} accent="#A855F7" delay={0.05} />
        <BlowStat label="Campagnes" value={7} delta="+2" icon={<Ico d={ICON.rocket} size={16} />} accent="#EC4899" delay={0.1} />
        <BlowStat label="Posts publiés" value="1.4k" delta="+18%" icon={<Ico d={ICON.bolt} size={16} />} accent="#6366F1" delay={0.15} />
        <BlowStat label="Reach estimé" value="2.9M" delta="+24%" icon={<Ico d={ICON.eye} size={16} />} accent="#22D3EE" delay={0.2} />
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <BlowCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>Activité récente</span>
            <button onClick={() => onGo('analytics')} style={{ fontSize: 11.5, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Analytics →</button>
          </div>
          {[
            { c: '#34D399', t: 'Campagne « Summer Drop » lancée', s: 'il y a 2 h · 8 comptes' },
            { c: '#A855F7', t: 'Nouveau client ajouté — @luxe.paris', s: 'il y a 5 h' },
            { c: '#EC4899', t: '320 posts publiés', s: 'hier · reach 210k' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: i < 2 ? `1px solid ${HAIR}` : 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: r.c, boxShadow: `0 0 10px 2px ${r.c}66`, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: FAINTish }}>{r.s}</p>
              </div>
            </div>
          ))}
        </BlowCard>

        <BlowCard style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
          <BlowBadge tone="gold">✦ VIP</BlowBadge>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>
            Un accompagnement <Grad>premium</Grad> pour scaler tes marques sans limites.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
            Support prioritaire, features exclusives et outils réservés à l'élite Blowsome.
          </p>
          <BlowButton onClick={() => onGo('settings')} style={{ alignSelf: 'flex-start', marginTop: 4 }}><Ico d={ICON.spark} size={15} /> Découvrir</BlowButton>
        </BlowCard>
      </div>
    </div>
  )
}

export default BlowsomeApp
