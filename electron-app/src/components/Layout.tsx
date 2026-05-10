import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg }    from '@/lib/orgContext'
import { canSeeTab } from '@/lib/permissions'

export type Page =
  | 'dashboard' | 'phones'
  | 'stats' | 'posting' | 'massposting' | 'bank' | 'autocomment' | 'aitools'
  | 'montage'
  | 'settings'

interface LayoutProps {
  user:      User
  page:      Page
  onNavigate:(page: Page) => void
  onRefresh?:() => void          // optional global refresh (called by sidebar ↺ button)
  phoneCount?: number
  lastRefresh?: Date | null
  children:  React.ReactNode
}

interface NavItem  { id: Page; label: string; icon: string; beta?: boolean }
interface NavSection { title: string; items: NavItem[]; defaultOpen?: boolean }

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    defaultOpen: true,
    items: [
      { id: 'dashboard',   label: 'Dashboard',    icon: '📊' },
      { id: 'phones',      label: 'Téléphones',   icon: '📱' },
    ],
  },
  {
    title: 'Instagram',
    defaultOpen: true,
    items: [
      { id: 'stats',       label: 'Stats',         icon: '📈' },
      { id: 'posting',     label: 'Posting',       icon: '🚀' },
      { id: 'massposting', label: 'Mass Posting',  icon: '⚡', beta: true },
      { id: 'bank',        label: 'Banque vidéos', icon: '🗂' },
      { id: 'autocomment', label: 'Commentaires',  icon: '💬', beta: true },
      { id: 'aitools',     label: 'Outils IA',     icon: '🔧', beta: true },
    ],
  },
  {
    title: 'Montage',
    defaultOpen: true,
    items: [
      { id: 'montage',     label: 'Montage vidéo', icon: '✂' },
    ],
  },
]

interface SoonItem { label: string; icon: string; color?: string; tooltip: string }
const SOON_ITEMS: SoonItem[] = [
  { label: 'Twitter / X',  icon: '𝕏',  color: 'text-sky-400',    tooltip: 'Automatise tes posts et réponses sur Twitter/X' },
  { label: 'Threads',      icon: '🧵', color: 'text-pink-400',   tooltip: 'Gère tes Threads depuis IG Tracker' },
  { label: 'Reddit',       icon: '🟠', color: 'text-orange-400', tooltip: 'Planifie et publie sur Reddit automatiquement' },
  { label: 'Multiposting', icon: '🌐', color: 'text-purple-400', tooltip: 'Poste sur tous les réseaux sociaux en une seule action' },
]

export function Layout({ user, page, onNavigate, onRefresh, phoneCount, lastRefresh, children }: LayoutProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sidebar-sections') ?? '{}')
      return Object.fromEntries(NAV_SECTIONS.map(s => [s.title, saved[s.title] ?? s.defaultOpen ?? true]))
    } catch {
      return Object.fromEntries(NAV_SECTIONS.map(s => [s.title, s.defaultOpen ?? true]))
    }
  })
  const [soonOpen, setSoonOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const { myOrgs, currentOrg, role, perms, switchOrg } = useOrg()

  // In solo mode, all tabs visible. In org mode, gate by role + overrides.
  const isVisibleTab = (id: Page): boolean => role ? canSeeTab(role, perms, id) : true

  // tick every 10s for "last refresh" relative timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(t)
  }, [])

  function toggleSection(title: string) {
    setOpenSections(prev => {
      const next = { ...prev, [title]: !prev[title] }
      localStorage.setItem('sidebar-sections', JSON.stringify(next))
      return next
    })
  }

  // If nav target is in a closed section, auto-open it
  useEffect(() => {
    for (const s of NAV_SECTIONS) {
      if (s.items.some(it => it.id === page) && !openSections[s.title]) {
        toggleSection(s.title)
        return
      }
    }
  }, [page])

  const lastRefreshLabel = lastRefresh
    ? (() => {
        const diff = Math.floor((now - lastRefresh.getTime()) / 1000)
        if (diff < 60) return 'Màj à l\'instant'
        if (diff < 3600) return `Màj il y a ${Math.floor(diff / 60)}m`
        return `Màj ${lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      })()
    : null

  return (
    <div className="min-h-screen bg-bg flex">
      <aside className="w-[230px] flex-shrink-0 flex flex-col border-r border-border bg-sb-bg">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold bg-accent text-white shadow-lg shadow-accent/20">
            📱
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[13px] text-text leading-tight">IG Tracker</p>
            <p className="text-[10px] text-ok flex items-center gap-1 leading-tight">
              <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />
              actif
            </p>
          </div>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-auto pt-1">
          {NAV_SECTIONS.map(section => {
            const visibleItems = section.items.filter(it => isVisibleTab(it.id))
            if (visibleItems.length === 0) return null
            const isOpen = openSections[section.title]
            return (
              <div key={section.title} className="mb-0.5">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold text-sb-section uppercase tracking-widest hover:text-text2 transition-colors"
                >
                  <span className="w-3 inline-block transition-transform" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                  <span className="flex-1 text-left">{section.title}</span>
                </button>
                {isOpen && (
                  <div className="space-y-0.5 px-2 pb-1">
                    {visibleItems.map(item => {
                      const active = page === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => onNavigate(item.id)}
                          className={`
                            relative w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md text-[13px] transition-all duration-150 text-left
                            ${active ? 'bg-sb-active text-sb-text-act' : 'text-sb-text hover:bg-sb-hover hover:text-sb-text-act'}
                          `}
                        >
                          {/* Left accent indicator */}
                          {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-accent rounded-r" />}
                          <span className={`text-base w-5 text-center flex-shrink-0 ${active ? 'text-accent' : 'text-sb-icon'}`}>
                            {item.icon}
                          </span>
                          <span className={active ? 'font-semibold' : 'font-medium'}>{item.label}</span>
                          {item.beta && (
                            <span className="ml-auto text-[8px] font-bold uppercase bg-[#e0245e]/90 text-white px-1.5 py-0.5 rounded">BETA</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Bientôt section */}
          <div className="mb-0.5">
            <button
              onClick={() => setSoonOpen(v => !v)}
              className="w-full flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold text-sb-section uppercase tracking-widest hover:text-text2 transition-colors"
            >
              <span className="w-3 inline-block transition-transform" style={{ transform: soonOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
              <span className="flex-1 text-left">Bientôt</span>
            </button>
            {soonOpen && (
              <div className="space-y-0.5 px-2 pb-1">
                {SOON_ITEMS.map(item => (
                  <div key={item.label} className="group relative">
                    <div className="w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md text-[13px] text-sb-text/60 cursor-not-allowed border border-transparent hover:border-border hover:bg-sb-hover/30 transition-all">
                      <span className={`text-base w-5 text-center flex-shrink-0 ${item.color}`}>{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                      <span className="ml-auto text-[8px] font-bold uppercase bg-accent/20 text-accent px-1.5 py-0.5 rounded tracking-wide">SOON</span>
                    </div>
                    {/* Tooltip on hover */}
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block pointer-events-none">
                      <div className="bg-surface border border-border rounded-lg px-3 py-2 text-[11px] text-text w-48 shadow-xl">
                        <p className="font-semibold text-accent mb-0.5">{item.label}</p>
                        <p className="text-text2 leading-snug">{item.tooltip}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Footer card */}
        <div className="mx-3 mb-2 p-3 rounded-xl bg-sb-card border border-border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text">IG Tracker Pro</span>
            <span className="text-[9px] text-text2 bg-surface2 px-1.5 py-0.5 rounded">v2.0.0</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-text2">
            <span>📱</span>
            <span>{phoneCount ?? 0} téléphone{(phoneCount ?? 0) !== 1 ? 's' : ''}</span>
          </div>
          {lastRefreshLabel && (
            <div className="text-[9px] text-text2/70">{lastRefreshLabel}</div>
          )}
        </div>

        {/* Refresh button + Settings */}
        <div className="px-3 pb-2 space-y-1.5">
          <button
            onClick={onRefresh}
            disabled={!onRefresh}
            className="w-full text-[12px] font-semibold bg-accent hover:bg-accent2 text-white rounded-lg py-2 transition-colors disabled:opacity-50"
          >
            ↺  Rafraîchir
          </button>
          {isVisibleTab('settings') && (
            <button
              onClick={() => onNavigate('settings')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-colors ${
                page === 'settings' ? 'bg-sb-active text-sb-text-act' : 'text-sb-text hover:bg-sb-hover hover:text-sb-text-act'
              }`}
            >
              <span className="text-base">⚙</span>
              <span>Paramètres</span>
            </button>
          )}
        </div>

        {/* Org switcher */}
        <div className="px-3 pb-2 relative">
          <button
            onClick={() => setOrgMenuOpen(o => !o)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] bg-surface border border-border hover:border-accent/40 transition-colors"
          >
            <span className="text-base flex-shrink-0">{currentOrg ? '🏢' : '👤'}</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-text truncate font-medium">{currentOrg ? currentOrg.name : 'Mode solo'}</p>
              {currentOrg && role && <p className="text-[9px] text-text2 uppercase tracking-wider">{role}</p>}
            </div>
            <span className="text-text2 text-[10px]">▾</span>
          </button>
          {orgMenuOpen && (
            <div className="absolute left-3 right-3 bottom-full mb-1 z-50 bg-surface border border-border rounded-lg shadow-xl overflow-hidden">
              <button
                onClick={() => { switchOrg(null); setOrgMenuOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left hover:bg-surface2 ${!currentOrg ? 'bg-accent/10 text-accent' : 'text-text'}`}
              >
                <span>👤</span><span>Mode solo</span>
              </button>
              {myOrgs.map(({ org }) => (
                <button
                  key={org.id}
                  onClick={() => { switchOrg(org.id); setOrgMenuOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left hover:bg-surface2 ${currentOrg?.id === org.id ? 'bg-accent/10 text-accent' : 'text-text'}`}
                >
                  <span>🏢</span><span className="truncate">{org.name}</span>
                </button>
              ))}
              <button
                onClick={() => { onNavigate('settings'); setOrgMenuOpen(false) }}
                className="w-full px-3 py-2 text-[11px] text-text2 hover:bg-surface2 border-t border-border text-left"
              >
                ⚙ Gérer les organisations
              </button>
            </div>
          )}
        </div>

        {/* User strip */}
        <div className="px-3 py-2 border-t border-border flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            {user.email?.[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-text2 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-text2 hover:text-danger transition-colors text-xs p-1 rounded"
            title="Se déconnecter"
          >
            ↩
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
