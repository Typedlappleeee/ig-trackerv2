import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg }    from '@/lib/orgContext'
import { canSeeTab } from '@/lib/permissions'
import { useToast }  from '@/components/Toast'
import { playNav }   from '@/lib/sounds'
import { getRecentAccounts, switchToAccount, forgetAccount, type RecentAccount } from '@/lib/recentAccounts'
import { subscribePosting, getPostingState } from '@/lib/postingStore'
import { subscribeMassPosting, getMassPostingState } from '@/lib/massPostingStore'
import { useLicense } from '@/lib/license'
import { useCredits } from '@/lib/credits'

function SFLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="sfl-main" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1d4ed8"/>
          <stop offset="28%"  stopColor="#3b5af0"/>
          <stop offset="58%"  stopColor="#7c3aed"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <linearGradient id="sfl-depth" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0c1f6e"/>
          <stop offset="55%"  stopColor="#2e1065"/>
          <stop offset="100%" stopColor="#3b0764"/>
        </linearGradient>
        <linearGradient id="sfl-arr" x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#db2777"/>
          <stop offset="100%" stopColor="#f472b6"/>
        </linearGradient>
      </defs>
      {/* Depth/3D shadow layer */}
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#sfl-depth)" strokeWidth="18" strokeLinecap="round" fill="none"
        transform="translate(2.5,4.5)" opacity="0.65"
      />
      {/* Main S ribbon */}
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#sfl-main)" strokeWidth="16" strokeLinecap="round" fill="none"
      />
      {/* Arrow diagonal */}
      <line x1="66" y1="22" x2="88" y2="2" stroke="url(#sfl-arr)" strokeWidth="11" strokeLinecap="round"/>
      {/* Arrow L-head */}
      <line x1="77" y1="1" x2="90" y2="1" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
      <line x1="90" y1="1" x2="90" y2="15" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
    </svg>
  )
}

export type Page =
  | 'dashboard' | 'phones'
  | 'stats' | 'posting' | 'massposting' | 'bank' | 'aitools' | 'warmup'
  | 'montage' | 'remix'
  | 'support'
  | 'settings' | 'licences'

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
      { id: 'support',     label: 'Support',       icon: '🎫' },
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
      { id: 'warmup',      label: 'Warmup Compte', icon: '🔥', beta: true },
      { id: 'aitools',     label: 'Outils IA',     icon: '🔧', beta: true },
    ],
  },
  {
    title: 'Montage',
    defaultOpen: true,
    items: [
      { id: 'montage', label: 'Montage vidéo', icon: '✂' },
      { id: 'remix',   label: 'Remix vidéo',   icon: '🔀', beta: true },
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
  const license = useLicense()
  const credits = useCredits()

  const [activeTask, setActiveTask] = useState<{ kind: 'single' | 'mass'; progress: number; done: number; total: number } | null>(null)
  useEffect(() => {
    function sync() {
      const ps = getPostingState()
      const ms = getMassPostingState()
      if (ps.posting) {
        setActiveTask({ kind: 'single', progress: ps.progress, done: 0, total: 0 })
      } else if (ms.posting) {
        const statuses = [...ms.taskStatuses.values()]
        const total = statuses.length
        const done  = statuses.filter(s => s.status === 'done' || s.status === 'error').length
        setActiveTask({ kind: 'mass', progress: total > 0 ? Math.round((done / total) * 100) : 0, done, total })
      } else {
        setActiveTask(null)
      }
    }
    sync()
    const u1 = subscribePosting(sync)
    const u2 = subscribeMassPosting(sync)
    return () => { u1(); u2() }
  }, [])

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
  // 'licences' is super-admin only — never in PageKey, always visible when shown.
  const isVisibleTab = (id: Page): boolean => {
    if (id === 'licences') return license.isSuperAdmin
    // Support is always visible — not part of the per-role permission matrix.
    if (id === 'support') return true
    return role ? canSeeTab(role, perms, id as import('@/lib/supabase').PageKey) : true
  }

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
    <div className="h-screen overflow-hidden bg-bg flex">
      <aside className="w-[230px] flex-shrink-0 flex flex-col border-r border-border/60 bg-sb-bg">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(145deg,#0f0620,#1a0d35)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <SFLogo size={26} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[13px] leading-tight tracking-tight">
              <span style={{ color: '#f0eeff' }}>Scale</span>
              <span className="sf-logo-shimmer">Flow</span>
            </p>
            <p className="text-[10px] text-ok flex items-center gap-1.5 leading-tight mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block anim-pulse" />
              actif
            </p>
          </div>
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
                            transition-all duration-150 active:scale-[0.98]
                            ${active ? 'sf-nav-active' : 'text-sb-text hover:bg-sb-hover/80 hover:text-sb-text-act'}
                          `}
                        >
                          <span className={`text-base w-5 text-center flex-shrink-0 transition-transform duration-150 ${active ? 'scale-110' : 'text-sb-icon'}`}>
                            {item.icon}
                          </span>
                          <span className={`flex-1 ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                          {item.beta && (
                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md tracking-wide"
                              style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}>BETA</span>
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
                      <span className="ml-auto text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>SOON</span>
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

        {/* ── Bottom bar ─────────────────────────────────────────── */}
        <div className="border-t border-border/40 px-3 pt-2 pb-3 space-y-1">

          {/* Credits row */}
          {!credits.loading && (
            <div className="flex items-center justify-between px-3 py-1 text-[11px]">
              <span className="text-text2 flex items-center gap-1.5"><span>💎</span>Crédits</span>
              <span className="font-bold tabular-nums" style={{ color: credits.balance < 10 ? '#f87171' : '#a78bfa' }}>
                {credits.balance.toLocaleString('fr-FR')}
              </span>
            </div>
          )}

          {/* Phone count + last refresh row */}
          <div className="flex items-center justify-between px-3 py-0.5 text-[10px] text-text2">
            <span className="flex items-center gap-1"><span>📱</span>{phoneCount ?? 0} tél.</span>
            {lastRefreshLabel && <span className="opacity-60">{lastRefreshLabel}</span>}
          </div>

          {/* Settings + Refresh row */}
          <div className="flex gap-1 pt-0.5">
            <button
              onClick={() => { playNav(); onNavigate('settings') }}
              className={`flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12px] transition-colors ${
                page === 'settings' ? 'sf-nav-active' : 'text-sb-text hover:bg-sb-hover hover:text-sb-text-act'
              }`}
            >
              <span className="text-sm">⚙</span>
              <span className="font-medium">Paramètres</span>
            </button>
            <button
              onClick={onRefresh}
              disabled={!onRefresh}
              className="px-2.5 py-2 rounded-lg text-[13px] text-text2 hover:text-text hover:bg-sb-hover transition-colors disabled:opacity-30"
              title="Rafraîchir"
            >↺</button>
            {license.isSuperAdmin && (
              <button
                onClick={() => { playNav(); onNavigate('licences') }}
                className={`px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  page === 'licences' ? 'sf-nav-active' : 'text-text2 hover:bg-sb-hover hover:text-sb-text-act'
                }`}
                title="Admin"
              >🛡</button>
            )}
          </div>

          {/* Org switcher */}
          <button
            ref={orgTriggerRef}
            onClick={() => orgMenuOpen ? setOrgMenuOpen(false) : openOrgMenu()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] bg-surface border border-border hover:border-accent/40 transition-colors"
          >
            <span className="text-base flex-shrink-0">🏢</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-text font-medium truncate">{currentOrg?.name ?? 'Organisation'}</p>
              {license.source === 'own' && (
                <p className="text-[9px]" style={{ color: license.daysLeft === null ? '#a78bfa' : license.daysLeft <= 7 ? '#fb923c' : '#6b7280' }}>
                  {license.daysLeft === null ? '∞ à vie' : `${license.daysLeft}j restants`}
                </p>
              )}
              {license.source === 'org_owner' && (
                <p className="text-[9px] text-blue-400">Via organisation</p>
              )}
            </div>
            <span className="text-text2 text-[10px] flex-shrink-0">▾</span>
          </button>

          {/* User strip */}
          <button
            ref={userTriggerRef}
            onClick={() => userMenuOpen ? setUserMenuOpen(false) : openUserMenu()}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-sb-hover/40 transition-colors"
          >
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
              {user.email?.[0].toUpperCase()}
            </div>
            <p className="flex-1 text-[10px] text-text2 truncate">{user.email}</p>
            <span className="text-text2 text-[10px]">▾</span>
          </button>

        </div>
      </aside>

      <main className="flex-1 overflow-auto relative bg-bg">
        {/* 24h subscription expiry warning badge */}
        {license.source === 'own' && license.daysLeft !== null && license.daysLeft <= 1 && (
          <div
            className="fixed top-3 right-4 z-[9997] flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold animate-pulse"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', boxShadow: '0 0 16px rgba(239,68,68,0.25)' }}
          >
            <span>🔴</span>
            <span>
              {license.daysLeft === 0 ? 'Abonnement expiré !' : 'Abonnement expire dans moins de 24h !'}
            </span>
          </div>
        )}

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

        {/* Permission denied screen — settings always accessible */}
        {!orgLoading && !isVisibleTab(page) && page !== 'settings' ? (
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
              className="px-6 py-2.5 active:scale-95 text-white text-sm font-semibold rounded-xl transition-all btn-sf-primary"
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

      {/* ── Active posting progress pill ──────────────────────────────── */}
      {activeTask && (
        <div
          className="fixed bottom-5 right-5 z-[9990] anim-slide-down"
          style={{
            background: 'rgba(6,3,16,0.96)',
            border: '1px solid rgba(139,92,246,0.3)',
            backdropFilter: 'blur(22px)',
            borderRadius: 16,
            padding: '14px 16px',
            width: 230,
            boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.08), 0 0 40px -8px rgba(124,58,237,0.25)',
          }}
        >
          {/* Header row */}
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}
            >
              <span className="animate-pulse">{activeTask.kind === 'mass' ? '⚡' : '🚀'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-white leading-tight">
                {activeTask.kind === 'mass' ? 'Mass Posting' : 'Posting'} en cours
              </p>
              <p className="text-[10px] leading-tight" style={{ color: 'rgba(196,181,253,0.45)' }}>
                {activeTask.kind === 'mass' && activeTask.total > 0
                  ? `${activeTask.done} / ${activeTask.total} téléphones`
                  : 'Tâche active…'}
              </p>
            </div>
            {/* Live dot */}
            <span className="relative w-2 h-2 flex-shrink-0">
              <span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-60" />
              <span className="absolute inset-0 rounded-full bg-ok" />
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>Progression</span>
              <span className="text-[10px] font-mono" style={{ color: 'rgba(196,181,253,0.6)' }}>{activeTask.progress}%</span>
            </div>
            <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.12)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${activeTask.progress}%`, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }}
              />
            </div>
          </div>

          {/* Navigate button */}
          <button
            onClick={() => { playNav(); onNavigate(activeTask.kind === 'mass' ? 'massposting' : 'posting') }}
            className="mt-3 w-full text-[11px] font-semibold py-1.5 rounded-lg transition-all hover:opacity-90"
            style={{ background: 'rgba(139,92,246,0.14)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.2)' }}
          >
            Voir les détails →
          </button>
        </div>
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
