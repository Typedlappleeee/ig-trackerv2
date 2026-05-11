import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg }    from '@/lib/orgContext'
import { canSeeTab } from '@/lib/permissions'
import { useToast }  from '@/components/Toast'
import { playNav }   from '@/lib/sounds'
import { getRecentAccounts, switchToAccount, forgetAccount, type RecentAccount } from '@/lib/recentAccounts'
import { ScaleFlowMark } from '@/components/ui/ScaleFlowLogo'

export type Page =
  | 'dashboard' | 'phones'
  | 'stats' | 'posting' | 'massposting' | 'bank' | 'autocomment' | 'aitools'
  | 'montage'
  | 'settings'

interface LayoutProps {
  user:      User
  page:      Page
  onNavigate:(page: Page, settingsTab?: string) => void
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
  { label: 'Threads',      icon: '🧵', color: 'text-pink-400',   tooltip: 'Gère tes Threads depuis ScaleFlow' },
  { label: 'Reddit',       icon: '🟠', color: 'text-orange-400', tooltip: 'Planifie et publie sur Reddit automatiquement' },
  { label: 'Multiposting', icon: '🌐', color: 'text-purple-400', tooltip: 'Poste sur tous les réseaux sociaux en une seule action' },
]

export function Layout({ user, page, onNavigate, onRefresh, phoneCount, lastRefresh, children }: LayoutProps) {
  const toast = useToast()
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
  const orgTriggerRef                 = useRef<HTMLButtonElement>(null)
  const [orgMenuPos, setOrgMenuPos]   = useState<{ left: number; bottom: number; width: number } | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userTriggerRef                  = useRef<HTMLButtonElement>(null)
  const [userMenuPos, setUserMenuPos]   = useState<{ left: number; bottom: number; width: number } | null>(null)
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([])
  const [switchErr, setSwitchErr]           = useState<string | null>(null)
  const { myOrgs, currentOrg, role, perms, switchOrg, loading: orgLoading } = useOrg()

  function handleSwitchOrg(orgId: string | null, orgName?: string) {
    if (orgId === (currentOrg?.id ?? null)) { setOrgMenuOpen(false); return }
    switchOrg(orgId)
    setOrgMenuOpen(false)
    onNavigate('dashboard')
    toast.show({
      title: orgId ? `Passé à "${orgName}"` : 'Repassé en mode solo',
      kind:  'info',
      duration: 3500,
    })
  }

  function openOrgMenu() {
    const rect = orgTriggerRef.current?.getBoundingClientRect()
    if (rect) {
      setOrgMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4, width: rect.width })
      setOrgMenuOpen(true)
    }
  }

  function openUserMenu() {
    const rect = userTriggerRef.current?.getBoundingClientRect()
    if (rect) {
      setUserMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4, width: rect.width })
      setRecentAccounts(getRecentAccounts().filter(a => a.user_id !== user.id))
      setSwitchErr(null)
      setUserMenuOpen(true)
    }
  }

  async function handleSwitch(a: RecentAccount) {
    setSwitchErr(null)
    const r = await switchToAccount(a)
    if (!r.ok) {
      setSwitchErr(r.error ?? 'Session expirée — reconnecte-toi avec ton mot de passe.')
      setRecentAccounts(getRecentAccounts().filter(x => x.user_id !== user.id))
      return
    }
    setUserMenuOpen(false)
    // useAuth's onAuthStateChange will swap the user automatically.
  }

  function handleForget(a: RecentAccount, e: React.MouseEvent) {
    e.stopPropagation()
    forgetAccount(a.user_id)
    setRecentAccounts(getRecentAccounts().filter(x => x.user_id !== user.id))
  }

  async function handleAddAccount() {
    setUserMenuOpen(false)
    await supabase.auth.signOut()  // this drops the AuthPage so the user can sign into another account
  }

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
      <aside className="w-[230px] flex-shrink-0 flex flex-col border-r border-border/60 bg-sb-bg">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-3">
          <ScaleFlowMark iconSize={32} />
          <p className="text-[10px] text-ok flex items-center gap-1.5 leading-tight mt-0.5 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block anim-pulse" />
            actif
          </p>
        </div>

        {/* Divider */}
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent mb-1" />

        {/* Nav sections */}
        <nav className="flex-1 overflow-auto pt-1 pb-2">
          {NAV_SECTIONS.map(section => {
            const visibleItems = section.items.filter(it => isVisibleTab(it.id))
            if (visibleItems.length === 0) return null
            const isOpen = openSections[section.title]
            return (
              <div key={section.title} className="mb-1">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center gap-1.5 px-4 py-1.5 text-[9px] font-bold text-sb-section/70 uppercase tracking-[0.12em] hover:text-sb-section transition-colors"
                >
                  <span
                    className="w-3 inline-block transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  >▾</span>
                  <span className="flex-1 text-left">{section.title}</span>
                </button>
                {isOpen && (
                  <div className="space-y-0.5 px-2 pb-1">
                    {visibleItems.map(item => {
                      const active = page === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => { playNav(); onNavigate(item.id) }}
                          className={`
                            relative w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-lg text-[13px] text-left
                            transition-all duration-150
                            active:scale-[0.98]
                            ${active
                              ? 'bg-accent/12 text-sb-text-act shadow-[inset_0_0_0_1px_rgba(79,142,247,0.15)]'
                              : 'text-sb-text hover:bg-sb-hover/80 hover:text-sb-text-act'}
                          `}
                        >
                          {/* Active left bar */}
                          <span className={`
                            absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-all duration-200
                            ${active ? 'bg-accent opacity-100' : 'opacity-0'}
                          `} />
                          <span className={`text-base w-5 text-center flex-shrink-0 transition-transform duration-150 ${active ? 'text-accent scale-110' : 'text-sb-icon'}`}>
                            {item.icon}
                          </span>
                          <span className={`flex-1 ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                          {item.beta && (
                            <span className="text-[8px] font-bold uppercase bg-[#e0245e] text-white px-1.5 py-0.5 rounded-md tracking-wide">BETA</span>
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
            <span className="text-[11px] font-semibold text-text">ScaleFlow Pro</span>
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
            onClick={() => { playNav(); onNavigate('settings') }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-colors ${
              page === 'settings' ? 'bg-sb-active text-sb-text-act' : 'text-sb-text hover:bg-sb-hover hover:text-sb-text-act'
            }`}
          >
            <span className="text-base">⚙</span>
            <span>Paramètres</span>
          </button>
        </div>

        {/* Org switcher */}
        <div className="px-3 pb-2">
          <button
            ref={orgTriggerRef}
            onClick={() => orgMenuOpen ? setOrgMenuOpen(false) : openOrgMenu()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] bg-surface border border-border hover:border-accent/40 transition-colors"
          >
            <span className="text-base flex-shrink-0">{currentOrg ? '🏢' : '👤'}</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-text truncate font-medium">{currentOrg ? currentOrg.name : 'Mode solo'}</p>
              {currentOrg && role && <p className="text-[9px] text-text2 uppercase tracking-wider">{role}</p>}
            </div>
            <span className="text-text2 text-[10px]">▾</span>
          </button>
        </div>

        {/* User strip — click to open the account switcher */}
        <button
          ref={userTriggerRef}
          onClick={() => userMenuOpen ? setUserMenuOpen(false) : openUserMenu()}
          className="w-full px-3 py-2 border-t border-border flex items-center gap-2 hover:bg-sb-hover/40 transition-colors text-left"
        >
          <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            {user.email?.[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-text2 truncate">{user.email}</p>
          </div>
          <span className="text-text2 text-[10px]">▾</span>
        </button>
      </aside>

      <main className="flex-1 overflow-auto relative bg-bg">
        {/* Org-switch loading overlay */}
        {orgLoading && (
          <div className="absolute inset-0 z-50 bg-bg/85 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 anim-scale-in">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <svg className="animate-spin w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              </div>
              <p className="text-xs text-text2 font-medium tracking-wide">Chargement du contexte…</p>
            </div>
          </div>
        )}

        {/* Permission denied screen */}
        {!orgLoading && !isVisibleTab(page) ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 text-center px-8 anim-scale-in">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-danger/8 border border-danger/15 flex items-center justify-center">
                <span className="text-4xl">🔒</span>
              </div>
              <div className="absolute -inset-3 rounded-[32px] bg-danger/5 -z-10" />
            </div>
            <div className="space-y-2.5 max-w-sm">
              <h2 className="text-2xl font-bold text-text">Accès refusé</h2>
              <p className="text-text2 text-sm leading-relaxed">
                Vous n'avez pas la permission d'accéder à cet onglet dans l'organisation{' '}
                <strong className="text-text font-semibold">"{currentOrg?.name}"</strong>.
              </p>
              <p className="text-text2/50 text-xs">Contactez un administrateur pour modifier vos droits d'accès.</p>
            </div>
            <button
              onClick={() => onNavigate('dashboard')}
              className="px-6 py-2.5 bg-accent hover:bg-accent2 active:scale-95 text-white text-sm font-semibold rounded-xl transition-all shadow-[0_2px_12px_-3px_rgba(79,142,247,0.5)]"
            >
              Retour au Dashboard
            </button>
          </div>
        ) : (
          /* key forces re-mount (and re-animation) on every page change */
          <div key={page} className="anim-page h-full">
            {children}
          </div>
        )}
      </main>

      {/* Org switcher menu (fixed-position overlay so nothing can intercept clicks) */}
      {orgMenuOpen && orgMenuPos && (
        <>
          <div
            onClick={() => setOrgMenuOpen(false)}
            className="fixed inset-0 z-[9998]"
            style={{ background: 'transparent' }}
          />
          <div
            className="fixed z-[9999] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden anim-slide-down"
            style={{ left: orgMenuPos.left, bottom: orgMenuPos.bottom, width: orgMenuPos.width }}
          >
            <button
              onClick={() => handleSwitchOrg(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left hover:bg-surface2 ${!currentOrg ? 'bg-accent/10 text-accent' : 'text-text'}`}
            >
              <span>👤</span><span>Mode solo</span>
            </button>
            {myOrgs.map(({ org }) => (
              <button
                key={org.id}
                onClick={() => handleSwitchOrg(org.id, org.name)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left hover:bg-surface2 ${currentOrg?.id === org.id ? 'bg-accent/10 text-accent' : 'text-text'}`}
              >
                <span>🏢</span><span className="truncate">{org.name}</span>
              </button>
            ))}
            <button
              onClick={() => { setOrgMenuOpen(false); onNavigate('settings', 'organization') }}
              className="w-full px-3 py-2 text-[11px] text-text2 hover:bg-surface2 border-t border-border text-left"
            >
              ⚙ Gérer les organisations
            </button>
          </div>
        </>
      )}

      {/* User account switcher menu */}
      {userMenuOpen && userMenuPos && (
        <>
          <div
            onClick={() => setUserMenuOpen(false)}
            className="fixed inset-0 z-[9998]"
            style={{ background: 'transparent' }}
          />
          <div
            className="fixed z-[9999] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden anim-slide-down"
            style={{ left: userMenuPos.left, bottom: userMenuPos.bottom, width: Math.max(userMenuPos.width, 240) }}
          >
            {/* Current account */}
            <div className="px-3 py-2 border-b border-border bg-accent/5">
              <p className="text-[10px] uppercase tracking-wider text-text2">Compte actif</p>
              <p className="text-[12px] text-text truncate">{user.email}</p>
            </div>

            {/* Recent accounts */}
            {recentAccounts.length > 0 && (
              <>
                <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-text2">Récents</p>
                {recentAccounts.map(a => (
                  <button
                    key={a.user_id}
                    onClick={() => handleSwitch(a)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface2 group"
                  >
                    <div className="w-5 h-5 rounded-full bg-text2/20 text-text2 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                      {a.email[0].toUpperCase()}
                    </div>
                    <span className="flex-1 text-[12px] text-text truncate">{a.email}</span>
                    <span
                      onClick={e => handleForget(a, e)}
                      className="text-text2 hover:text-danger text-[10px] opacity-0 group-hover:opacity-100"
                      title="Oublier ce compte sur cet appareil"
                    >✕</span>
                  </button>
                ))}
              </>
            )}

            {switchErr && (
              <p className="px-3 py-2 text-[10px] text-danger bg-danger/10 border-t border-danger/30">{switchErr}</p>
            )}

            {/* Actions */}
            <button
              onClick={handleAddAccount}
              className="w-full px-3 py-2 text-[12px] text-text hover:bg-surface2 border-t border-border text-left"
            >
              ＋ Ajouter un compte
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); supabase.auth.signOut() }}
              className="w-full px-3 py-2 text-[12px] text-danger hover:bg-danger/10 border-t border-border text-left"
            >
              ↩ Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  )
}
