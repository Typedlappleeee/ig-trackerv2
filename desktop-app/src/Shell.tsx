import { useState, useEffect, Fragment } from 'react'
import type { ReactNode } from 'react'
import { INFRAS, themeFor, type InfraKey, type Theme } from '@/lib/theme'
import { Icon } from '@/lib/ui'
import { fmtNumber } from '@/lib/data'

export type PageKey =
  | 'hub'
  | 'cloud' | 'phones' | 'proxies' | 'bank' | 'activity' | 'connections'
  | 'flows' | 'recipes' | 'publish' | 'automation' | 'warmup'
  | 'studio'
  | 'insights' | 'health'
  | 'blowParc' | 'blowContent' | 'blowTools'
  | 'settings'

interface NavItem { k: PageKey; l: string; i: string; n?: number }
interface NavSection { g: string | null; items: NavItem[] }

function navFor(infra: InfraKey, phoneCount: number | null, videoCount: number | null): NavSection[] {
  if (infra === 'blowsome') {
    return [
      { g: null, items: [{ k: 'hub', l: 'Dashboard', i: 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z' }] },
      { g: 'Diffusion', items: [
        { k: 'publish', l: 'Posting', i: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
        { k: 'blowContent', l: 'Auto-contenu', i: 'M13 2 3 14h9l-1 8 10-12h-9z' },
      ] },
      { g: 'Studio', items: [
        { k: 'bank', l: 'Banque', i: 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z', n: videoCount ?? undefined },
        { k: 'blowTools', l: 'Gestionnaire de tools', i: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2-2 2.1-2.1z' },
      ] },
      { g: 'Parc', items: [
        { k: 'blowParc', l: 'Phone Farm', i: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', n: phoneCount ?? undefined },
        { k: 'insights', l: 'Performances', i: 'M22 12h-4l-3 9L9 3l-3 9H2' },
      ] },
    ]
  }
  const cloud = infra === 'cloud'
  const dev: NavItem = cloud
    ? { k: 'cloud', l: 'Mes appareils', i: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', n: phoneCount ?? undefined }
    : { k: 'phones', l: 'Téléphones GeeLark', i: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', n: phoneCount ?? undefined }
  return [
    { g: null, items: [{ k: 'hub', l: 'Accueil', i: 'M3 10.5 12 3l9 7.5|M5 10v10h14V10' }] },
    {
      g: 'Pilotage', items: [
        dev,
        ...(cloud ? [{ k: 'proxies' as PageKey, l: 'Proxies', i: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z' }] : []),
        { k: 'bank', l: 'Banque', i: 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z', n: videoCount ?? undefined },
        ...(cloud ? [] : [{ k: 'activity' as PageKey, l: 'Activité', i: 'M22 12h-4l-3 9L9 3l-3 9H2' }]),
      ],
    },
    {
      g: 'Diffusion', items: cloud ? [
        { k: 'flows', l: 'Automatisation', i: 'M12 8V4H8|M4 4h16v16H4z|M9 16h6' },
        { k: 'recipes', l: 'Mes séquences', i: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6' },
      ] : [
        { k: 'publish', l: 'Publication', i: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
        { k: 'automation', l: 'Automatisation', i: 'M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z' },
        { k: 'warmup', l: 'Warmup', i: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z' },
      ],
    },
    { g: 'Production', items: [{ k: 'studio', l: 'Studio vidéo', i: 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z' }] },
    {
      // Analyse : disponible sur les DEUX infras. Chaque infra montre SES propres
      // données (GeeLark vs ScaleFlow Cloud), scopées par la présence de geelark_id.
      g: 'Analyse', items: [
        { k: 'insights' as PageKey, l: 'Performances', i: 'M3 3v18h18|M7 15l4-6 4 3 5-8' },
        { k: 'health' as PageKey, l: 'Santé des comptes', i: 'M12 21s-8-4.5-8-11a5 5 0 0 1 8-3 5 5 0 0 1 8 3c0 6.5-8 11-8 11z|M9 12h2l1-2 1 4 1-2h2' },
        // Connexions IG est introduite en bannière en haut de Performances/Santé (pas un onglet dédié).
        // Activité n'est PAS répétée ici en GeeLark (déjà dans Pilotage) ; en Cloud elle vit ici.
        ...(cloud ? [{ k: 'activity' as PageKey, l: 'Activité', i: 'M22 12h-4l-3 9L9 3l-3 9H2' }] : []),
      ],
    },
  ]
}

const TITLES: Record<PageKey, string[]> = {
  hub: ['Accueil'],
  cloud: ['Pilotage', 'Mes appareils'],
  phones: ['Pilotage', 'Téléphones'],
  proxies: ['Pilotage', 'Proxies'],
  bank: ['Pilotage', 'Banque'],
  activity: ['Pilotage', 'Activité'],
  connections: ['Analyse', 'Connexions IG'],
  flows: ['Diffusion', 'Automatisation'],
  recipes: ['Diffusion', 'Mes séquences'],
  publish: ['Diffusion', 'Publication'],
  automation: ['Diffusion', 'Automatisation'],
  warmup: ['Diffusion', 'Warmup'],
  studio: ['Production', 'Studio vidéo'],
  insights: ['Analyse', 'Performances'],
  health: ['Analyse', 'Santé des comptes'],
  blowParc: ['Blowsome', 'Phone Farm'],
  blowContent: ['Blowsome', 'Auto-contenu'],
  blowTools: ['Blowsome', 'Outils VIP'],
  settings: ['Réglages'],
}

export default function Shell({
  theme, infra, setInfra, page, setPage,
  userName, orgName, role, balance, phoneCount, videoCount, canBlowsome,
  orgs, currentOrgId, onSwitchOrg, onSignOut, children,
}: {
  theme: Theme; infra: InfraKey; setInfra: (k: InfraKey) => void
  page: PageKey; setPage: (p: PageKey) => void
  userName: string; orgName: string; role: string; balance: number | null
  phoneCount: number | null; videoCount: number | null; canBlowsome: boolean
  orgs: { id: string; name: string }[]; currentOrgId: string | null; onSwitchOrg: (id: string | null) => void
  onSignOut: () => void; children: ReactNode
}) {
  const [navOpen, setNavOpen] = useState(true)
  const [infraOpen, setInfraOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQ, setPaletteQ] = useState('')
  const [bellOpen, setBellOpen] = useState(false)
  const inf = INFRAS[infra]
  const T = theme

  // ⌘K / Ctrl+K ouvre la palette de commandes ; Échap ferme les menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); setPaletteQ('') }
      if (e.key === 'Escape') { setInfraOpen(false); setUserMenu(false); setPaletteOpen(false); setBellOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Compteurs de nav = vrais counts (téléphones, banque) ; null tant que non chargés.
  const NAV = navFor(infra, phoneCount, videoCount)

  const path = TITLES[page] ?? ['Accueil']
  const navW = navOpen ? 212 : 56
  const initial = (userName || 'U').charAt(0).toUpperCase()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T.appBg, transition: 'background 0.4s ease' }}>

      {/* ══════════ SIDEBAR ══════════ */}
      <aside style={{
        position: 'relative', width: navW, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: T.navBg, borderRight: '1px solid rgba(255,255,255,0.06)',
        transition: 'width 0.25s cubic-bezier(0.16,1,0.3,1), background 0.4s ease', overflow: 'visible',
      }}>
        <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 1, background: T.rim, pointerEvents: 'none' }} />

        {/* logo */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(145deg,#A78BFA,#7C3AED)', flexShrink: 0 }}>
            <span style={{ width: 12, height: 2.5, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
            <span style={{ width: 12, height: 2.5, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
          </span>
          {navOpen && (
            <>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#fff' }}>scale</span><span style={{ color: '#A78BFA' }}>flow</span>
              </span>
              <span style={{ marginLeft: 'auto', padding: '2px 7px', borderRadius: 5, background: 'rgba(139,92,246,0.14)', color: '#C4B5FD', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em' }}>PRO</span>
            </>
          )}
        </div>

        {/* sélecteur d'infrastructure */}
        <div style={{ flexShrink: 0, position: 'relative', padding: '10px 10px 4px' }}>
          <button onClick={() => setInfraOpen(o => !o)} style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: navOpen ? 46 : 38,
            padding: navOpen ? '0 9px' : '0', border: `1px solid ${infraOpen ? `rgba(${inf.tone},0.5)` : `rgba(${inf.tone},0.24)`}`,
            borderRadius: 9, background: `rgba(${inf.tone},0.07)`, cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box', transition: 'all 0.16s ease',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: `rgba(${inf.tone},0.14)`, border: `1px solid rgba(${inf.tone},0.28)`, color: inf.color, flexShrink: 0 }}>
              <Icon d={inf.icon} size={13} />
            </span>
            {navOpen && (
              <>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#52525B' }}>Infrastructure</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: inf.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inf.name}</span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, color: inf.color }}>{inf.short}</span>
                </span>
              </>
            )}
          </button>

          {infraOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% - 2px)', left: 10, right: 10, zIndex: 40, borderRadius: 10, overflow: 'hidden',
              background: '#16161C', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 22px 52px -16px rgba(0,0,0,0.9)',
              animation: 'aIn 0.2s cubic-bezier(0.16,1,0.3,1) both',
            }}>
              {Object.values(INFRAS).filter(o => o.k !== 'blowsome' || canBlowsome).map(o => {
                const on = infra === o.k
                return (
                  <button key={o.k} onClick={() => { setInfra(o.k); setInfraOpen(false); setPage('hub') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: on ? `rgba(${o.tone},0.1)` : 'transparent', borderLeft: `2px solid ${on ? `rgb(${o.tone})` : 'transparent'}`, transition: 'background .14s ease', boxSizing: 'border-box',
                    }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = on ? `rgba(${o.tone},0.1)` : 'transparent' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: `rgba(${o.tone},0.14)`, border: `1px solid rgba(${o.tone},0.26)`, color: o.color }}>
                      <Icon d={o.icon} size={13} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: on ? o.color : '#E4E4E7' }}>{o.name}</span>
                        {o.beta && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(6,182,212,0.16)', color: '#22D3EE', fontSize: 8, fontWeight: 800, letterSpacing: '0.05em' }}>BETA</span>}
                      </span>
                      <span style={{ fontSize: 10.5, color: '#52525B' }}>{o.desc}</span>
                      <span style={{ display: 'flex', gap: 10, marginTop: 2, fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: '#3F3F46' }}>
                        <span>boot {o.boot}</span><span>{o.quota}</span>
                      </span>
                    </span>
                    {on && <span style={{ color: o.color, flexShrink: 0 }}><Icon d="M20 6L9 17l-5-5" size={14} sw={2.4} /></span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* recherche ⌘K (visuel) */}
        {navOpen && (
          <div style={{ flexShrink: 0, padding: '6px 10px' }}>
            <button onClick={() => { setPaletteOpen(true); setPaletteQ('') }} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 32, padding: '0 10px',
              border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, background: 'rgba(255,255,255,0.02)', color: '#71717A',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box', transition: 'all 0.16s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = '#A1A1AA' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#71717A' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.35-4.35" /></svg>
              <span style={{ flex: 1 }}>Rechercher…</span>
              <span style={{ display: 'flex', gap: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, padding: '0 3px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#71717A' }}>⌘</span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, padding: '0 3px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#71717A' }}>K</span>
              </span>
            </button>
          </div>
        )}

        {/* nav */}
        <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((sec, si) => (
            <div key={si} style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
              {sec.g && navOpen ? (
                <div style={{ padding: '11px 10px 5px', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3F3F46' }}>{sec.g}</div>
              ) : sec.g ? <div style={{ height: 11 }} /> : null}
              {sec.items.map(it => {
                const on = page === it.k
                return (
                  <button key={it.k} onClick={() => setPage(it.k)} title={it.l} style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', flexShrink: 0, height: 32,
                    padding: navOpen ? '0 10px' : '0', border: 'none', borderRadius: 8, cursor: 'pointer', boxSizing: 'border-box',
                    justifyContent: navOpen ? 'flex-start' : 'center',
                    background: on ? `rgba(${T.tone},0.14)` : 'transparent', color: on ? T.accentText : '#A1A1AA',
                    fontSize: 12.5, fontWeight: on ? 700 : 600, transition: 'all .14s ease', position: 'relative',
                  }}
                    onMouseEnter={e => { if (!on) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#E4E4E7' } }}
                    onMouseLeave={e => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' } }}>
                    {on && <span style={{ position: 'absolute', left: -10, top: 7, bottom: 7, width: 2, borderRadius: 99, background: T.accent }} />}
                    <span style={{ display: 'flex', flexShrink: 0 }}><Icon d={it.i} size={15} /></span>
                    {navOpen && <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.l}</span>}
                    {navOpen && it.n != null && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: on ? 'rgba(196,181,253,0.7)' : '#3F3F46' }}>{fmtNumber(it.n)}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* bas : crédits + user */}
        <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
          {navOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: '#F4F4F6', fontVariantNumeric: 'tabular-nums' }}>{balance === null ? '…' : fmtNumber(balance)}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: '#52525B' }}>crédits</span>
                </span>
                <span style={{ height: 2, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${balance === null ? 0 : Math.min(100, Math.round((balance / 5000) * 100))}%`, borderRadius: 99, background: 'linear-gradient(90deg,#8B5CF6,#A78BFA)' }} />
                </span>
              </span>
              <button onClick={() => setPage('settings')} title="Acheter des crédits" style={{ height: 22, padding: '0 8px', border: '1px solid rgba(139,92,246,0.28)', borderRadius: 6, background: 'rgba(139,92,246,0.1)', color: '#C4B5FD', fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>＋</button>
            </div>
          )}

          {userMenu && navOpen && (
            <div style={{
              position: 'absolute', left: 10, right: 10, bottom: 'calc(100% - 4px)', zIndex: 40, borderRadius: 10, overflow: 'hidden',
              background: '#16161C', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 22px 52px -16px rgba(0,0,0,0.9)', animation: 'aIn 0.2s cubic-bezier(0.16,1,0.3,1) both',
            }}>
              {/* Organisations : espace perso + chaque orga. Clic = bascule. */}
              <div style={{ padding: '9px 12px 5px', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#52525B' }}>Organisation</div>
              <button onClick={() => { onSwitchOrg(null); setUserMenu(false) }} style={{ ...menuItemStyle, paddingTop: 8, paddingBottom: 8 }}>
                <span style={{ color: currentOrgId === null ? T.accentText : '#52525B', display: 'flex' }}><Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" size={14} /></span>
                <span style={{ flex: 1 }}>Espace perso</span>
                {currentOrgId === null && <span style={{ color: T.accentText, display: 'flex' }}><Icon d="M20 6L9 17l-5-5" size={13} sw={2.4} /></span>}
              </button>
              {orgs.map(o => (
                <button key={o.id} onClick={() => { onSwitchOrg(o.id); setUserMenu(false) }} style={{ ...menuItemStyle, paddingTop: 8, paddingBottom: 8 }}>
                  <span style={{ color: currentOrgId === o.id ? T.accentText : '#52525B', display: 'flex' }}><Icon d="M3 21h18|M5 21V7l8-4v18|M19 21V11l-6-4" size={14} /></span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                  {currentOrgId === o.id && <span style={{ color: T.accentText, display: 'flex' }}><Icon d="M20 6L9 17l-5-5" size={13} sw={2.4} /></span>}
                </button>
              ))}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '5px 0' }} />
              <button onClick={() => { setPage('settings'); setUserMenu(false) }} style={menuItemStyle}>
                <span style={{ color: '#71717A', display: 'flex' }}><Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15z" size={14} /></span>
                Réglages
              </button>
              <button onClick={onSignOut} style={{ ...menuItemStyle, color: '#F87171' }}>
                <span style={{ display: 'flex' }}><Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9" size={14} /></span>
                Changer de compte
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 4px' }}>
            <button onClick={() => setUserMenu(m => !m)} aria-label="Menu utilisateur" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7,
              background: 'linear-gradient(140deg,#3F3F46,#27272A)', border: '1px solid rgba(255,255,255,0.08)', color: '#D4D4D8',
              fontSize: 10.5, fontWeight: 800, flexShrink: 0, cursor: 'pointer',
            }}>{initial}</button>
            {navOpen && (
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#E4E4E7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 600, color: '#52525B', overflow: 'hidden' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orgName}</span>
                  {role && <><span style={{ flexShrink: 0, opacity: 0.5 }}>·</span><span style={{ flexShrink: 0, color: T.accentText }}>{role}</span></>}
                </span>
              </span>
            )}
            <button onClick={() => setNavOpen(o => !o)} aria-label="Replier" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', borderRadius: 6,
              background: 'transparent', color: '#52525B', cursor: 'pointer', flexShrink: 0, transition: 'all 0.16s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#E4E4E7' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52525B' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={navOpen ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ══════════ COLONNE PRINCIPALE ══════════ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* topbar */}
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, height: 52, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: T.appBg, transition: 'background 0.4s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {path.map((l, i) => (
              <Fragment key={i}>
                <span style={{ fontSize: 12.5, fontWeight: i === path.length - 1 ? 700 : 600, color: i === path.length - 1 ? '#F4F4F6' : '#71717A', whiteSpace: 'nowrap' }}>{l}</span>
                {i < path.length - 1 && <span style={{ color: '#3F3F46', fontSize: 11 }}>/</span>}
              </Fragment>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* pastille de run (visuelle) */}
            <button onClick={() => setPage('activity')} style={{
              position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 9, height: 28, padding: '0 12px',
              border: `1px solid rgba(${inf.tone},0.28)`, borderRadius: 99, background: `rgba(${inf.tone},0.14)`, color: '#E4E4E7',
              cursor: 'pointer', overflow: 'hidden', flexShrink: 0, transition: 'all 0.16s ease',
            }}>
              <span style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 10, flexShrink: 0, color: inf.color }}>
                <span style={{ width: 2, height: 6, borderRadius: 99, background: 'currentColor', animation: 'aBeat 1.1s ease-in-out infinite' }} />
                <span style={{ width: 2, height: 10, borderRadius: 99, background: 'currentColor', animation: 'aBeat 1.1s ease-in-out 0.16s infinite' }} />
                <span style={{ width: 2, height: 4, borderRadius: 99, background: 'currentColor', animation: 'aBeat 1.1s ease-in-out 0.32s infinite' }} />
              </span>
              <span style={{ position: 'relative', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>Activité</span>
            </button>
            <span style={{ position: 'relative' }}>
              <button onClick={() => setBellOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: `1px solid ${bellOpen ? `rgba(${T.tone},0.4)` : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, background: bellOpen ? `rgba(${T.tone},0.1)` : 'transparent', color: bellOpen ? T.accentText : '#71717A', cursor: 'pointer', transition: 'all 0.16s ease' }}
                aria-label="Notifications">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              </button>
              {bellOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 260, zIndex: 50, borderRadius: 10, overflow: 'hidden', background: '#16161C', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 22px 52px -16px rgba(0,0,0,0.9)', animation: 'aIn 0.18s cubic-bezier(0.16,1,0.3,1) both' }}>
                  <div style={{ padding: '11px 13px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12, fontWeight: 700, color: '#E4E4E7' }}>Notifications</div>
                  <div style={{ padding: '22px 13px', textAlign: 'center', color: '#52525B', fontSize: 12 }}>Tu es à jour — rien de nouveau.</div>
                  <button onClick={() => { setPage('activity'); setBellOpen(false) }} style={{ ...menuItemStyle, borderTop: '1px solid rgba(255,255,255,0.05)', justifyContent: 'center', color: T.accentText, fontWeight: 700 }}>Voir l'activité</button>
                </div>
              )}
            </span>
            <button onClick={() => setPage('settings')} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
              border: `1px solid ${page === 'settings' ? `rgba(${T.tone},0.4)` : 'rgba(255,255,255,0.07)'}`, borderRadius: 8,
              background: page === 'settings' ? `rgba(${T.tone},0.1)` : 'transparent', color: page === 'settings' ? T.accentText : '#71717A', cursor: 'pointer', transition: 'all 0.16s ease',
            }} aria-label="Réglages">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
          </div>
        </header>

        {/* contenu */}
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', background: T.mainWash }}>
          <div style={{ maxWidth: 1520, margin: '0 auto', padding: '24px 24px 40px', width: '100%', boxSizing: 'border-box' }}>{children}</div>
        </main>
      </div>

      {/* ══════════ PALETTE DE COMMANDES (⌘K) ══════════ */}
      {paletteOpen && (() => {
        const all = [...NAV.flatMap(s => s.items), { k: 'settings' as PageKey, l: 'Réglages', i: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' }]
        const ql = paletteQ.trim().toLowerCase()
        const list = ql ? all.filter(it => it.l.toLowerCase().includes(ql)) : all
        return (
          <div onClick={() => setPaletteOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', background: 'rgba(4,6,8,0.72)', backdropFilter: 'blur(6px)', animation: 'aFade .14s ease both' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '92%', borderRadius: 13, overflow: 'hidden', background: '#131318', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 32px 80px -22px rgba(0,0,0,0.85)', animation: 'aPop .2s cubic-bezier(0.16,1,0.3,1) both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.35-4.35" /></svg>
                <input autoFocus value={paletteQ} onChange={e => setPaletteQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && list[0]) { setPage(list[0].k); setPaletteOpen(false) } }}
                  placeholder="Aller à…" style={{ flex: 1, border: 'none', background: 'transparent', color: '#F4F4F6', fontSize: 14, outline: 'none' }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#52525B' }}>ESC</span>
              </div>
              <div style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
                {list.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun résultat.</div>
                  : list.map(it => (
                    <button key={it.k} onClick={() => { setPage(it.k); setPaletteOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', background: page === it.k ? `rgba(${T.tone},0.12)` : 'transparent', color: page === it.k ? T.accentText : '#D4D4D8', fontSize: 12.5, fontWeight: 600, textAlign: 'left' }}
                      onMouseEnter={e => { if (page !== it.k) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (page !== it.k) e.currentTarget.style.background = 'transparent' }}>
                      <span style={{ display: 'flex', color: page === it.k ? T.accentText : '#71717A' }}><Icon d={it.i} size={15} /></span>
                      {it.l}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 12px', border: 'none',
  background: 'transparent', color: '#D4D4D8', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
}
