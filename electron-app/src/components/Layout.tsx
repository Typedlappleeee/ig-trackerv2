import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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
      { id: 'autocomment', label: 'Automatisation',icon: '🤖', beta: true },
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

interface SoonItem { label: string; icon: string; color?: string; tooltip?: string }
const SOON_ITEMS: SoonItem[] = [
  { label: 'Twitter / X',   icon: '𝕏' },
  { label: 'Threads',       icon: '🧵' },
  { label: 'Reddit',        icon: '🟠' },
  { label: 'Multiposting',  icon: '🌐', color: 'text-purple-400', tooltip: 'Postera sur tous les réseaux à la fois' },
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
                    {section.items.map(item => {
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
                  <div
                    key={item.label}
                    title={item.tooltip ?? `${item.label} — bientôt disponible`}
                    className="w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md text-[13px] text-sb-text/40 cursor-not-allowed"
                  >
                    <span className={`text-base w-5 text-center flex-shrink-0 ${item.color ?? 'text-sb-icon/60'}`}>{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="ml-auto text-[8px] font-bold uppercase bg-text2/30 text-text2 px-1.5 py-0.5 rounded">SOON</span>
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
          <button
            onClick={() => onNavigate('settings')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-colors ${
              page === 'settings' ? 'bg-sb-active text-sb-text-act' : 'text-sb-text hover:bg-sb-hover hover:text-sb-text-act'
            }`}
          >
            <span className="text-base">⚙</span>
            <span>Paramètres</span>
          </button>
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
