import { useState } from 'react'
import { C, F, R } from './theme'
import { Icon, ICONS, Mono } from './ui'
import { KPIS, RUN } from './data/mock'
import { Hub } from './screens/Hub'
import { Phones } from './screens/Phones'
import { Placeholder } from './screens/Placeholder'

export type Page =
  | 'hub' | 'phones' | 'activity'
  | 'publish' | 'automation' | 'warmup'
  | 'studio' | 'bank' | 'library'
  | 'cloud' | 'proxies' | 'flows'
  | 'settings'

interface NavItem { id: Page; label: string; icon: string }
interface NavGroup { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { title: 'Pilotage', items: [
    { id: 'phones', label: 'Téléphones', icon: ICONS.phone },
    { id: 'activity', label: 'Analyse', icon: ICONS.activity },
  ] },
  { title: 'Diffusion', items: [
    { id: 'publish', label: 'Publication', icon: ICONS.send },
    { id: 'automation', label: 'Automatisation', icon: ICONS.calendar },
    { id: 'warmup', label: 'Warmup', icon: ICONS.flame },
  ] },
  { title: 'Production', items: [
    { id: 'studio', label: 'Studio vidéo', icon: ICONS.video },
    { id: 'bank', label: 'Banque', icon: ICONS.bank },
    { id: 'library', label: 'Bibliothèque', icon: ICONS.library },
  ] },
  { title: 'Infrastructure', items: [
    { id: 'cloud', label: 'Cloud Phones', icon: ICONS.cloud },
    { id: 'proxies', label: 'Proxies', icon: ICONS.proxy },
    { id: 'flows', label: 'Flux', icon: ICONS.flow },
  ] },
]

const TITLES: Record<Page, string> = {
  hub: 'Accueil', phones: 'Téléphones', activity: 'Analyse', publish: 'Publication',
  automation: 'Automatisation', warmup: 'Warmup', studio: 'Studio vidéo', bank: 'Banque',
  library: 'Bibliothèque', cloud: 'Cloud Phones', proxies: 'Proxies', flows: 'Flux', settings: 'Réglages',
}

function Logo({ size = 30 }: { size?: number }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.1, width: size, height: size, borderRadius: size * 0.26, background: 'linear-gradient(145deg,#A855F7,#7C3AED)', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }}>
      <span style={{ width: size * 0.46, height: size * 0.1, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
      <span style={{ width: size * 0.46, height: size * 0.1, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
    </span>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('hub')
  const [collapsed, setCollapsed] = useState(false)
  const W = collapsed ? 58 : 212

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.appBg, color: C.t1, fontFamily: F.sans }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{ width: W, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.appBg, borderRight: '1px solid ' + C.b1, transition: 'width .2s ease' }}>
        {/* Logo */}
        <div style={{ height: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', flexShrink: 0 }}>
          <button onClick={() => setPage('hub')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Logo size={30} />
            {!collapsed && <span style={{ fontFamily: F.display, fontSize: 17, fontWeight: 600, letterSpacing: '-0.03em' }}><span style={{ color: '#fff' }}>scale</span><span style={{ color: C.accentLt }}>flow</span></span>}
          </button>
          <button onClick={() => setCollapsed(v => !v)} style={{ marginLeft: 'auto', width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: C.t4, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon paths={ICONS.dots} size={15} /></button>
        </div>

        {/* Recherche ⌘K */}
        {!collapsed && (
          <div style={{ padding: '2px 10px 10px' }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 32, padding: '0 10px', border: '1px solid ' + C.b1, borderRadius: R.btn, background: 'rgba(255,255,255,0.02)', color: C.t3, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Icon paths={ICONS.search} size={13} color={C.t3} />
              <span style={{ flex: 1, textAlign: 'left' }}>Rechercher…</span>
              <span style={{ display: 'flex', gap: 2 }}>
                {['⌘', 'K'].map(k => <span key={k} style={{ minWidth: 15, height: 15, display: 'grid', placeItems: 'center', padding: '0 3px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', fontFamily: F.mono, fontSize: 9, color: C.t3 }}>{k}</span>)}
              </span>
            </button>
          </div>
        )}

        {/* Accueil épinglé */}
        <div style={{ padding: '0 8px' }}>
          <NavBtn item={{ id: 'hub', label: 'Accueil', icon: ICONS.home }} active={page === 'hub'} collapsed={collapsed} onClick={() => setPage('hub')} />
        </div>

        {/* Groupes */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {NAV.map(g => (
            <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 4px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.t4 }}>{g.title}</span>
                  <Mono size={9.5} color={C.t4}>{g.items.length}</Mono>
                </div>
              )}
              {g.items.map(it => <NavBtn key={it.id} item={it} active={page === it.id} collapsed={collapsed} onClick={() => setPage(it.id)} />)}
            </div>
          ))}
        </nav>

        {/* Pied : crédits + user */}
        <div style={{ padding: 10, borderTop: '1px solid ' + C.b1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!collapsed && (
            <div style={{ padding: 11, borderRadius: R.panel, background: C.panel, border: '1px solid ' + C.b1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10.5, color: C.t3, fontWeight: 700 }}>Crédits</span>
                <span style={{ fontFamily: F.display, fontSize: 15, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{KPIS.credits.toLocaleString('fr-FR')}</span>
              </div>
              <div style={{ marginTop: 8, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)' }}><div style={{ height: '100%', width: '45%', borderRadius: 99, background: C.accent }} /></div>
            </div>
          )}
          <button style={{ display: 'flex', alignItems: 'center', gap: 9, padding: collapsed ? 4 : '5px 8px', borderRadius: R.btn, background: 'transparent', border: 'none', cursor: 'pointer', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <span style={{ width: 28, height: 28, borderRadius: 99, background: 'linear-gradient(135deg,#8B5CF6,#6366F1)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>Q</span>
            {!collapsed && <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0 }}><span style={{ fontSize: 12.5, fontWeight: 700, color: C.t1 }}>Quentin</span><span style={{ fontSize: 10.5, color: C.t3 }}>Organisation · Owner</span></span>}
          </button>
        </div>
      </aside>

      {/* ── Zone principale ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{ height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', borderBottom: '1px solid ' + C.b1, background: C.appBg }}>
          <span style={{ fontFamily: F.display, fontSize: 14, fontWeight: 700 }}>{TITLES[page]}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button style={{ width: 30, height: 30, borderRadius: R.btn, border: '1px solid ' + C.b1, background: 'transparent', color: C.t3, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon paths={ICONS.bell} size={15} /></button>
            <span style={{ width: 30, height: 30, borderRadius: 99, background: 'linear-gradient(135deg,#8B5CF6,#6366F1)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>Q</span>
          </span>
        </header>

        {/* Contenu + barre de run */}
        <main style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <div style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 28px 96px' }}>
            {page === 'hub' && <Hub go={setPage} />}
            {page === 'phones' && <Phones />}
            {!['hub', 'phones'].includes(page) && <Placeholder title={TITLES[page]} />}
          </div>
          {RUN.active && <RunBar />}
        </main>
      </div>
    </div>
  )
}

function NavBtn({ item, active, collapsed, onClick }: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} title={item.label}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: collapsed ? '9px 0' : '8px 10px', justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: R.btn, border: '1px solid ' + (active ? C.accentBorder : 'transparent'), background: active ? C.accentDim : h ? 'rgba(255,255,255,0.03)' : 'transparent', color: active ? '#fff' : C.t2, fontFamily: F.sans, fontSize: 13, fontWeight: active ? 700 : 600, cursor: 'pointer', textAlign: 'left', transition: 'background .14s, color .14s' }}>
      {active && !collapsed && <span style={{ position: 'absolute', left: 0, top: '50%', width: 2, height: 16, marginTop: -8, borderRadius: 99, background: C.accent }} />}
      <Icon paths={item.icon} size={16} color={active ? C.accentLt : 'currentColor'} />
      {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
    </button>
  )
}

function RunBar() {
  const pct = (RUN.done / RUN.total) * 100
  return (
    <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: 1120, padding: '0 28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', borderRadius: R.panel, background: C.raise, border: '1px solid ' + C.accentBorder, boxShadow: '0 20px 50px -16px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: C.accent, boxShadow: `0 0 10px ${C.accent}` }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap' }}>{RUN.label}</span>
        <div style={{ display: 'flex', gap: 3, flex: 1, minWidth: 0 }}>
          {Array.from({ length: 13 }, (_, i) => { const on = i / 13 <= RUN.done / RUN.total; const cur = Math.floor((RUN.done / RUN.total) * 13) === i; return <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: on ? C.accent : 'rgba(255,255,255,0.08)', opacity: cur ? 1 : on ? 0.85 : 1, animation: cur ? 'sfpulse 1.2s ease-in-out infinite' : 'none' }} /> })}
        </div>
        <Mono color={C.accentLt}>{RUN.done}/{RUN.total}</Mono>
        <span style={{ fontSize: 11.5, color: C.t3, whiteSpace: 'nowrap' }}>{RUN.eta}</span>
      </div>
      <style>{`@keyframes sfpulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )
}
