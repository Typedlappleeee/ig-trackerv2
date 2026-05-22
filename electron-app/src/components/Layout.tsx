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
import {
  subscribeNotifications, getNotifications, pushNotification,
  markAllRead, clearNotifications, unreadCount,
  type AppNotification,
} from '@/lib/notificationStore'
import { useLicense } from '@/lib/license'
import { useCredits } from '@/lib/credits'

const CREDIT_AUTO_RECHARGE = 10_000
const CREDIT_MAX_DISPLAY   = 150_000

function SFLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" overflow="visible">
      <defs>
        <linearGradient id="sfl-g" x1="50" y1="5" x2="50" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#60a5fa"/>
          <stop offset="45%"  stopColor="#818cf8"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <filter id="sfl-glow" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
          <feColorMatrix in="blur" type="matrix"
            values="0 0 0 0 0.38  0 0 0 0 0.25  0 0 0 0 1   0 0 0 1 0" result="colored"/>
          <feMerge><feMergeNode in="colored"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Glow halo */}
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="#7c3aed" strokeWidth="22" strokeLinecap="round" fill="none" opacity="0.35"
      />
      {/* Main S */}
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#sfl-g)" strokeWidth="16" strokeLinecap="round" fill="none"
        filter="url(#sfl-glow)"
      />
    </svg>
  )
}

export type Page =
  | 'dashboard' | 'phones' | 'monitor'
  | 'stats' | 'posting' | 'massposting' | 'scheduler' | 'bank' | 'aitools' | 'warmup'
  | 'montage' | 'remix' | 'textcopy'
  | 'community' | 'support'
  | 'settings' | 'licences'

interface LayoutProps {
  user:      User
  page:      Page
  onNavigate:(page: Page, settingsTab?: string) => void
  onRefresh?:() => void
  phoneCount?: number
  lastRefresh?: Date | null
  children:  React.ReactNode
}

interface NavItem  { id: Page; label: string; icon: string; beta?: boolean; isNew?: boolean }
interface NavSection { title: string; items: NavItem[]; defaultOpen?: boolean }

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    defaultOpen: true,
    items: [
      { id: 'phones',      label: 'Téléphones',   icon: '📱' },
      { id: 'monitor',     label: 'Monitor Live',  icon: '🖥' },
    ],
  },
  {
    title: 'Instagram',
    defaultOpen: true,
    items: [
      { id: 'posting',     label: 'Posting',       icon: '🚀' },
      { id: 'massposting', label: 'Mass Posting',  icon: '⚡' },
      { id: 'scheduler',   label: 'Programmation', icon: '📅', isNew: true },
      { id: 'bank',        label: 'Banque vidéos', icon: '🗂' },
      { id: 'warmup',      label: 'Warmup Compte', icon: '🔥', beta: true },
      { id: 'aitools',     label: 'Outils IA',     icon: '🔧' },
    ],
  },
  {
    title: 'Montage',
    defaultOpen: true,
    items: [
      { id: 'montage',  label: 'Montage vidéo',  icon: '✂' },
      { id: 'remix',    label: 'Remix vidéo',    icon: '🔀' },
      { id: 'textcopy', label: 'Texte IA',        icon: '✍', beta: true },
    ],
  },
]


export function Layout({ user, page, onNavigate, onRefresh, phoneCount, lastRefresh, children }: LayoutProps) {
  const toast = useToast()
  const [collapsed, setCollapsed]         = useState(() => {
    const v = localStorage.getItem('sf-sidebar')
    return v === 'reduite' || v === 'masquee'
  })
  const [groupCount, setGroupCount]       = useState<number | null>(null)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sidebar-sections') ?? '{}')
      return Object.fromEntries(NAV_SECTIONS.map(s => [s.title, saved[s.title] ?? s.defaultOpen ?? true]))
    } catch {
      return Object.fromEntries(NAV_SECTIONS.map(s => [s.title, s.defaultOpen ?? true]))
    }
  })
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

  const [activeTask, setActiveTask]     = useState<{ kind: 'single' | 'mass'; progress: number; done: number; total: number } | null>(null)
  const [notifOpen, setNotifOpen]       = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread]             = useState(0)
  const notifRef                        = useRef<HTMLDivElement>(null)
  const [breadcrumb, setBreadcrumb]     = useState<string[] | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      const val = (e as CustomEvent<string>).detail
      setCollapsed(val === 'reduite' || val === 'masquee')
    }
    window.addEventListener('sf:sidebar-change', handler)
    return () => window.removeEventListener('sf:sidebar-change', handler)
  }, [])

  // Listen for breadcrumb updates from pages (e.g. Scheduler subviews)
  useEffect(() => {
    const handler = (e: Event) => {
      const val = (e as CustomEvent<string | string[] | null>).detail
      if (val === null) setBreadcrumb(null)
      else if (Array.isArray(val)) setBreadcrumb(val)
      else setBreadcrumb([val])
    }
    window.addEventListener('sf:breadcrumb', handler)
    return () => window.removeEventListener('sf:breadcrumb', handler)
  }, [])

  // Clear breadcrumb when page changes
  useEffect(() => { setBreadcrumb(null) }, [page])

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

  // Auto-push notifications when posting jobs finish
  useEffect(() => {
    let prevPostingSingle = false
    let prevPostingMass   = false
    function sync() {
      const ps = getPostingState()
      const ms = getMassPostingState()
      // Single posting: finished
      if (prevPostingSingle && !ps.posting) {
        const errors = ps.logs.filter(l => l.level === 'error').length
        const ok     = ps.logs.filter(l => l.level === 'ok').length
        if (ok > 0 || errors > 0) {
          pushNotification({
            title: errors === 0 ? 'Post publié' : `Post terminé avec ${errors} erreur${errors > 1 ? 's' : ''}`,
            body:  errors === 0 ? 'Ton Reel a été posté avec succès.' : `${ok} succès · ${errors} erreur${errors > 1 ? 's' : ''}`,
            level: errors === 0 ? 'ok' : 'warn',
          })
        }
      }
      // Mass posting: finished
      if (prevPostingMass && !ms.posting) {
        const statuses  = [...ms.taskStatuses.values()]
        const doneCount = statuses.filter(s => s.status === 'done').length
        const errCount  = statuses.filter(s => s.status === 'error').length
        if (doneCount > 0 || errCount > 0) {
          pushNotification({
            title: errCount === 0 ? 'Mass Posting terminé' : `Mass Posting: ${errCount} erreur${errCount > 1 ? 's' : ''}`,
            body:  `${doneCount} succès · ${errCount} erreur${errCount > 1 ? 's' : ''} · ${statuses.length} téléphone${statuses.length > 1 ? 's' : ''}`,
            level: errCount === 0 ? 'ok' : 'warn',
          })
        }
      }
      prevPostingSingle = ps.posting
      prevPostingMass   = ms.posting
    }
    const u1 = subscribePosting(sync)
    const u2 = subscribeMassPosting(sync)
    return () => { u1(); u2() }
  }, [])

  // Sync notification store to local state
  useEffect(() => {
    function syncNotifs() {
      setNotifications(getNotifications())
      setUnread(unreadCount())
    }
    syncNotifs()
    const unsub = subscribeNotifications(syncNotifs)
    return unsub
  }, [])

  // Close notif panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

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
  }

  function handleForget(a: RecentAccount, e: React.MouseEvent) {
    e.stopPropagation()
    forgetAccount(a.user_id)
    setRecentAccounts(getRecentAccounts().filter(x => x.user_id !== user.id))
  }

  async function handleAddAccount() {
    setUserMenuOpen(false)
    await supabase.auth.signOut()
  }

  const isVisibleTab = (id: Page): boolean => {
    if (id === 'licences')  return license.isSuperAdmin
    if (id === 'support')   return true
    if (id === 'community') return true
    return role ? canSeeTab(role, perms, id as import('@/lib/supabase').PageKey) : true
  }

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

  useEffect(() => {
    for (const s of NAV_SECTIONS) {
      if (s.items.some(it => it.id === page) && !openSections[s.title]) {
        toggleSection(s.title)
        return
      }
    }
  }, [page])

  // Fetch distinct group count for the bottom stats
  useEffect(() => {
    let q = supabase.from('phones').select('group_name')
    q = currentOrg ? (q as any).eq('org_id', currentOrg.id) : (q as any).eq('user_id', user.id).is('org_id', null)
    q.then(({ data }: { data: Array<{ group_name?: string | null }> | null }) => {
      const g = new Set((data ?? []).map(r => r.group_name).filter(Boolean))
      setGroupCount(g.size)
    })
  }, [currentOrg?.id, user.id])

  const lastRefreshLabel = lastRefresh
    ? (() => {
        const diff = Math.floor((now - lastRefresh.getTime()) / 1000)
        if (diff < 60) return 'Màj à l\'instant'
        if (diff < 3600) return `Màj il y a ${Math.floor(diff / 60)}m`
        return `Màj ${lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      })()
    : null

  const userInitial = user.email?.[0].toUpperCase() ?? '?'

  return (
    <div className="h-screen overflow-hidden bg-bg flex">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        className="flex-shrink-0 flex flex-col relative overflow-hidden transition-all duration-300"
        style={{
          width: collapsed ? 60 : 228,
          background: 'linear-gradient(180deg, #080614 0%, #060412 100%)',
          borderRight: '1px solid rgba(139,92,246,0.12)',
        }}
      >
        {/* Ambient top glow */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{
            height: 200,
            background: 'radial-gradient(ellipse 180px 120px at 50% -20px, rgba(139,92,246,0.18) 0%, transparent 70%)',
          }}
        />

        {/* ── Logo ──────────────────────────────────────────────────────────── */}
        <div className="relative z-10 px-4 pt-5 pb-4 flex items-center gap-3" style={{ minHeight: 64 }}>
          {/* Icon with neon spinning ring */}
          <div className="relative flex-shrink-0" style={{ width: 36, height: 36 }}>
            {/* Spinning neon border */}
            <div
              className="logo-neon-ring absolute rounded-[15px] pointer-events-none"
              style={{ inset: '-2px' }}
            />
            {/* Soft outer glow */}
            <div
              className="absolute pointer-events-none"
              style={{
                inset: '-6px',
                borderRadius: 20,
                background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)',
                filter: 'blur(6px)',
              }}
            />
            <div
              className="w-9 h-9 rounded-[13px] flex items-center justify-center relative z-10"
              style={{
                background: 'linear-gradient(145deg, #0d0820 0%, #100626 50%, #160b30 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              <SFLogo size={24} />
            </div>
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-black text-[14.5px] leading-tight tracking-[-0.02em]">
                <span style={{ color: '#f0eeff' }}>Scale</span>
                <span className="sf-logo-shimmer">Flow</span>
              </p>
              <p className="text-[10px] flex items-center gap-1.5 leading-tight mt-[3px]" style={{ color: '#00ccaa' }}>
                <span className="relative w-1.5 h-1.5 flex-shrink-0">
                  <span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-50" />
                  <span className="absolute inset-0 rounded-full bg-ok" />
                </span>
                <span className="font-semibold tracking-wide">Actif</span>
              </p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]"
            style={{ border: '1px solid rgba(139,92,246,0.2)', color: 'rgba(139,92,246,0.5)', marginLeft: collapsed ? 'auto' : 0 }}
            title={collapsed ? 'Déplier' : 'Réduire'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              {collapsed
                ? <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              }
            </svg>
          </button>
        </div>

        {/* Top divider */}
        <div
          className="mx-3 mb-2 relative z-10"
          style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.22), transparent)' }}
        />

        {/* ── Nav ────────────────────────────────────────────────────────────── */}
        <nav className="sf-sidebar-nav flex-1 overflow-y-auto overflow-x-hidden pt-1 pb-2 relative z-10">

          {/* Communauté — épinglé en haut */}
          {!collapsed && (
            <div className="px-2 pb-2">
              <button
                onClick={() => { playNav(); onNavigate('community') }}
                className={`
                  relative w-full flex items-center gap-2.5 pl-3 pr-2.5 py-[10px] rounded-xl text-[13px] text-left
                  transition-all duration-150 active:scale-[0.97]
                  ${page === 'community' ? 'sf-nav-active' : 'text-sb-text hover:text-sb-text-act'}
                `}
                style={page !== 'community' ? {
                  background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(236,72,153,0.04))',
                  border: '1px solid rgba(139,92,246,0.2)',
                } : {}}
              >
                <span className="text-[16px] w-5 text-center flex-shrink-0"
                  style={page === 'community' ? { filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.7))' } : { opacity: 0.8 }}>
                  💬
                </span>
                <span className={`flex-1 ${page === 'community' ? 'font-bold' : 'font-semibold'}`}>Communauté</span>
                {page !== 'community' && (
                  <span className="text-[7.5px] font-black px-1.5 py-[3px] rounded-md uppercase tracking-wider flex-shrink-0"
                    style={{ background: 'linear-gradient(130deg,rgba(139,92,246,0.35),rgba(236,72,153,0.25))', color: '#f0a8ff' }}>
                    NEW
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Séparateur */}
          {!collapsed && <div className="mx-3 mb-2" style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(139,92,246,0.15),transparent)' }} />}

          {NAV_SECTIONS.map(section => {
            const visibleItems = section.items.filter(it => isVisibleTab(it.id))
            if (visibleItems.length === 0) return null
            const isOpen = openSections[section.title]
            return (
              <div key={section.title} className="mb-3">
                {/* Section header */}
                {!collapsed && (
                  <button onClick={() => toggleSection(section.title)} className="w-full flex items-center gap-2 px-4 py-[7px] text-left group">
                    <span className="flex-1 text-[10.5px] font-black uppercase tracking-[0.2em]" style={{ color: 'rgba(139,92,246,0.4)' }}>
                      · {section.title}
                    </span>
                    <span className="text-[9px] transition-all duration-200 opacity-40 group-hover:opacity-70"
                      style={{ color: '#a78bfa', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>
                      ▾
                    </span>
                  </button>
                )}

                {(isOpen || collapsed) && (
                  <div className={collapsed ? 'px-1 space-y-[3px] pb-1' : 'px-2 space-y-[3px] pb-1'}>
                    {visibleItems.map(item => {
                      const active = page === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => { playNav(); onNavigate(item.id) }}
                          title={collapsed ? item.label : undefined}
                          className={`
                            relative w-full flex items-center gap-2.5 rounded-xl text-[12.5px] text-left
                            transition-all duration-150 active:scale-[0.97]
                            ${collapsed ? 'justify-center px-1.5 py-[10px]' : 'pl-3 pr-2.5 py-[11px]'}
                            ${active ? 'sf-nav-active' : 'hover:bg-white/[0.04] text-sb-text hover:text-sb-text-act'}
                          `}
                        >
                          <span
                            className={`text-[15px] ${collapsed ? '' : 'w-5'} text-center flex-shrink-0 transition-all duration-150 ${active ? '' : 'opacity-50'}`}
                            style={active ? { filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.6))' } : {}}
                          >
                            {item.icon}
                          </span>
                          {!collapsed && (
                            <>
                              <span className={`flex-1 ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                              {item.beta && (
                                <span className="text-[7px] font-black uppercase px-1.5 py-[3px] rounded-md tracking-[0.12em]"
                                  style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.4),rgba(236,72,153,0.4))', color: '#e879f9', border: '1px solid rgba(236,72,153,0.2)' }}>
                                  BETA
                                </span>
                              )}
                              {item.isNew && (
                                <span className="text-[7px] font-black uppercase px-1.5 py-[3px] rounded-md tracking-[0.12em]"
                                  style={{ background: 'linear-gradient(130deg,rgba(16,185,129,0.35),rgba(52,211,153,0.25))', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
                                  NEW
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Fade bottom */}
        <div className="pointer-events-none flex-shrink-0 h-6 -mt-6 relative z-10"
          style={{ background: 'linear-gradient(to bottom, transparent, #080614)' }} />

        {/* ── Bottom bar ─────────────────────────────────────────────────────── */}
        <div className="relative z-10 pb-3 pt-0">
          <div className="mx-3 mb-2" style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.15), transparent)' }} />

          {collapsed ? (
            /* Collapsed: just icons */
            <div className="flex flex-col items-center gap-2 px-1">
              <button onClick={() => { playNav(); onNavigate('settings') }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${page === 'settings' ? 'sf-nav-active' : 'hover:bg-white/[0.05]'}`}>
                <span className="text-sm opacity-70">⚙</span>
              </button>
              <button onClick={() => userMenuOpen ? setUserMenuOpen(false) : openUserMenu()}
                className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[10px] font-black flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)', color: '#fff' }}>
                {userInitial}
              </button>
            </div>
          ) : (
            <div className="px-3 space-y-1.5">

              {/* Phones + Groups cards */}
              <div className="flex gap-1.5">
                <div className="flex-1 rounded-xl px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[11px] opacity-60">📱</span>
                    <span className="text-[9px] font-semibold" style={{ color: 'rgba(148,163,184,0.45)' }}>Téléphones</span>
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[13px] font-black" style={{ color: '#a78bfa' }}>{phoneCount ?? 0}</span>
                    <span className="text-[9px]" style={{ color: 'rgba(148,163,184,0.3)' }}>/ {phoneCount ?? 0}</span>
                  </div>
                  {lastRefreshLabel && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[8px]" style={{ color: 'rgba(148,163,184,0.3)' }}>{lastRefreshLabel}</span>
                      {onRefresh && (
                        <button onClick={onRefresh} className="text-[9px] opacity-30 hover:opacity-60 transition-opacity" title="Rafraîchir">↺</button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1 rounded-xl px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[11px] opacity-60">👥</span>
                    <span className="text-[9px] font-semibold" style={{ color: 'rgba(148,163,184,0.45)' }}>Groupes</span>
                  </div>
                  <span className="text-[13px] font-black" style={{ color: '#a78bfa' }}>{groupCount ?? '—'}</span>
                </div>
              </div>

              {/* Settings + Admin */}
              <div className="space-y-0.5">
                <button onClick={() => { playNav(); onNavigate('settings') }}
                  className={`w-full flex items-center justify-between px-2.5 py-[7px] rounded-xl text-[12px] transition-all ${
                    page === 'settings' ? 'sf-nav-active' : 'hover:bg-white/[0.04] text-sb-text hover:text-sb-text-act'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm opacity-70">⚙</span>
                    <span className="font-medium">Paramètres</span>
                  </div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {license.isSuperAdmin && (
                  <button onClick={() => { playNav(); onNavigate('licences') }}
                    className={`w-full flex items-center gap-2 px-2.5 py-[7px] rounded-xl text-[12px] transition-all ${
                      page === 'licences' ? 'sf-nav-active' : 'text-sb-text hover:bg-white/[0.04] hover:text-sb-text-act'
                    }`}>
                    <span className="text-sm opacity-70">🛡</span>
                    <span className="font-medium">Admin</span>
                  </button>
                )}
              </div>

              {/* Org switcher */}
              <div style={{ padding: 1, borderRadius: 15, background: 'linear-gradient(135deg, rgba(139,92,246,0.55) 0%, rgba(236,72,153,0.3) 60%, rgba(139,92,246,0.35) 100%)' }}>
                <button ref={orgTriggerRef} onClick={() => orgMenuOpen ? setOrgMenuOpen(false) : openOrgMenu()}
                  className="w-full flex items-center gap-2.5 px-3 py-[9px] text-[12px] transition-all group"
                  style={{ background: '#09061a', borderRadius: 14 }}>
                  <span className="text-[15px] flex-shrink-0 opacity-80">🏢</span>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-semibold truncate" style={{ color: '#e2d9f3' }}>{currentOrg?.name ?? 'Organisation'}</p>
                    {license.source === 'own' && (
                      <p className="text-[9.5px] mt-0.5" style={{ color: license.daysLeft === null ? '#a78bfa' : license.daysLeft <= 7 ? '#fb923c' : 'rgba(107,114,128,0.8)' }}>
                        {license.daysLeft === null ? '∞ à vie' : `${license.daysLeft}j restants`}
                      </p>
                    )}
                    {license.source === 'org_owner' && <p className="text-[9.5px] mt-0.5 text-blue-400">Via organisation</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {role && (
                      <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-md"
                        style={{ background: 'linear-gradient(130deg,rgba(16,185,129,0.3),rgba(52,211,153,0.2))', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
                        {role === 'admin' ? 'Admin' : role === 'owner' ? 'Owner' : 'Viewer'}
                      </span>
                    )}
                    <span className="text-[10px] opacity-40">▾</span>
                  </div>
                </button>
              </div>

              {/* User strip */}
              <button onClick={() => userMenuOpen ? setUserMenuOpen(false) : openUserMenu()}
                className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left transition-all hover:bg-white/[0.04] group">
                <div className="w-7 h-7 rounded-[10px] flex items-center justify-center text-[10px] font-black flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)', boxShadow: '0 2px 8px rgba(124,58,237,0.35)', color: '#fff' }}>
                  {userInitial}
                </div>
                <p className="flex-1 text-[10.5px] font-medium truncate" style={{ color: 'rgba(107,94,138,0.9)' }}>{user.email}</p>
                <span className="text-[10px] opacity-30">▾</span>
              </button>

            </div>
          )}
        </div>
      </aside>

      {/* ── Main area (topbar + content) ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[400px] pointer-events-none" style={{ background: 'radial-gradient(ellipse at top right, rgba(139,92,246,0.05) 0%, transparent 65%)', zIndex: 0 }} />

        {/* ── Topbar ───────────────────────────────────────────────────────── */}
        <header className="sf-topbar flex-shrink-0 flex items-center gap-4 px-6 h-[54px] relative z-10">

          {/* Page label */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-white/90 truncate max-w-[160px]">
                {({
                  dashboard:   'Dashboard',
                  phones:      'Téléphones',
                  monitor:     'Monitor Live',
                  stats:       'Statistiques',
                  posting:     'Posting',
                  massposting: 'Mass Posting',
                  scheduler:   'Programmation',
                  bank:        'Banque Vidéos',
                  aitools:     'Outils IA',
                  warmup:      'Warmup',
                  montage:     'Montage',
                  remix:       'Remix Vidéo',
                  textcopy:    'Texte IA',
                  community:   'Communauté',
                  support:     'Support',
                  settings:    'Paramètres',
                  licences:    'Licences',
                } as Record<string, string>)[page] ?? page}
              </span>
              {breadcrumb && breadcrumb.map((seg, i) => (
                <span key={i} className="flex items-center gap-1.5 min-w-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'rgba(148,163,184,0.3)', flexShrink: 0 }}>
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[13px] font-semibold truncate max-w-[160px]"
                    style={{ color: i === breadcrumb.length - 1 ? 'rgba(196,181,253,0.85)' : 'rgba(148,163,184,0.55)' }}>
                    {seg}
                  </span>
                </span>
              ))}
            </div>
            {activeTask && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
                {activeTask.kind === 'mass'
                  ? `${activeTask.done}/${activeTask.total} • ${activeTask.progress}%`
                  : `${activeTask.progress}%`}
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <div className="sf-live-dot" />
            <span className="text-[11px] font-medium text-text2">Live</span>
          </div>

          {/* Subscription expiry warning inline */}
          {license.source === 'own' && license.daysLeft !== null && license.daysLeft <= 1 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171' }}>
              <span>⚠</span>
              <span>{license.daysLeft === 0 ? 'Abonnement expiré' : '&lt; 24h restantes'}</span>
            </div>
          )}

          {/* Credits */}
          {!credits.loading && (
            <button onClick={() => onNavigate('settings', 'abonnement')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all hover:bg-white/[0.04]"
              style={{ border: '1px solid rgba(139,92,246,0.18)' }}>
              <span className="text-[13px]">💎</span>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: credits.balance < 10 ? '#F87171' : '#A78BFA' }}>
                {credits.balance.toLocaleString('fr-FR')}
              </span>
            </button>
          )}

          {/* Notifications bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen(v => !v); if (!notifOpen) markAllRead() }}
              className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-white/[0.05]"
              style={{ border: `1px solid ${unread > 0 ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                style={{ color: unread > 0 ? '#A78BFA' : '#71717A' }}>
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', boxShadow: '0 0 8px rgba(139,92,246,0.6)' }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {/* Dropdown panel */}
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl overflow-hidden z-50"
                style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 16px 48px -8px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.08)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                  <div className="flex items-center gap-2">
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#A78BFA" strokeWidth={2}>
                      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                    </svg>
                    <span className="text-[13px] font-bold text-white">Notifications</span>
                    {notifications.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                        {notifications.length}
                      </span>
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <button onClick={clearNotifications}
                      className="text-[11px] transition-colors hover:text-white flex items-center gap-1"
                      style={{ color: 'rgba(148,163,184,0.4)' }}>
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1 2h7M3.5 2V1.5h2V2M2.5 2l.5 6h3l.5-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Effacer
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ background: 'rgba(139,92,246,0.06)', border: '1px dashed rgba(139,92,246,0.15)' }}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="rgba(82,82,91,0.6)" strokeWidth={1.5}>
                          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                        </svg>
                      </div>
                      <p className="text-[12px] font-semibold" style={{ color: 'rgba(148,163,184,0.3)' }}>Aucune notification</p>
                      <p className="text-[11px] text-center max-w-[180px]" style={{ color: 'rgba(82,82,91,0.6)' }}>
                        Les résultats de tes posts apparaîtront ici
                      </p>
                    </div>
                  ) : notifications.map(n => {
                    const iconColor = n.level === 'ok' ? '#22C55E' : n.level === 'error' ? '#EF4444' : n.level === 'warn' ? '#F59E0B' : '#A78BFA'
                    const iconBg    = n.level === 'ok' ? 'rgba(34,197,94,0.12)' : n.level === 'error' ? 'rgba(239,68,68,0.12)' : n.level === 'warn' ? 'rgba(245,158,11,0.12)' : 'rgba(139,92,246,0.12)'
                    const Icon = () => {
                      if (n.level === 'ok')    return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5L4.5 8L9 3" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      if (n.level === 'error') return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2L9 9M9 2L2 9" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round"/></svg>
                      if (n.level === 'warn')  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L10 9.5H1L5.5 1Z" stroke={iconColor} strokeWidth="1.2" strokeLinejoin="round"/><path d="M5.5 4.5v2.5M5.5 8.5v.1" stroke={iconColor} strokeWidth="1.2" strokeLinecap="round"/></svg>
                      return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke={iconColor} strokeWidth="1.2"/><path d="M5.5 3.5v2.5M5.5 7.5v.1" stroke={iconColor} strokeWidth="1.2" strokeLinecap="round"/></svg>
                    }
                    return (
                      <div key={n.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: iconBg, border: `1px solid ${iconColor}22` }}>
                          <Icon />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-white leading-snug">{n.title}</p>
                          {n.body && <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'rgba(148,163,184,0.55)' }}>{n.body}</p>}
                        </div>
                        <span className="text-[10px] flex-shrink-0 mt-0.5 tabular-nums" style={{ color: 'rgba(82,82,91,0.7)' }}>{n.time}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <button ref={userTriggerRef} onClick={() => userMenuOpen ? setUserMenuOpen(false) : openUserMenu()}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #EC4899)', boxShadow: '0 2px 8px rgba(124,58,237,0.4)', color: '#fff' }}
            title={user.email}>
            {userInitial}
          </button>

        </header>

        {/* ── Scrollable content ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto relative bg-bg z-0">
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

          {/* Permission denied */}
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
            <div key={page} className="anim-page h-full">
              {children}
            </div>
          )}
        </main>
      </div>

      {/* ── Org switcher menu ────────────────────────────────────────────────── */}
      {orgMenuOpen && orgMenuPos && (
        <>
          <div onClick={() => setOrgMenuOpen(false)} className="fixed inset-0 z-[9998]" style={{ background: 'transparent' }} />
          <div
            className="fixed z-[9999] rounded-xl shadow-2xl overflow-hidden anim-slide-down"
            style={{ left: orgMenuPos.left, bottom: orgMenuPos.bottom, width: orgMenuPos.width, background: '#0c0919', border: '1px solid rgba(139,92,246,0.2)' }}
          >
            {myOrgs.map(({ org }) => (
              <button
                key={org.id}
                onClick={() => handleSwitchOrg(org.id, org.name)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors ${currentOrg?.id === org.id ? 'text-accent' : 'text-text hover:bg-white/[0.04]'}`}
                style={currentOrg?.id === org.id ? { background: 'rgba(139,92,246,0.1)' } : {}}
              >
                <span>🏢</span><span className="truncate flex-1">{org.name}</span>
                {currentOrg?.id === org.id && <span className="ml-auto text-accent text-xs">✓</span>}
              </button>
            ))}
            <button
              onClick={() => { setOrgMenuOpen(false); onNavigate('settings', 'organization') }}
              className="w-full px-3 py-2 text-[11px] text-text2 hover:bg-white/[0.04] border-t text-left transition-colors"
              style={{ borderColor: 'rgba(139,92,246,0.12)' }}
            >
              ⚙ Gérer les organisations
            </button>
          </div>
        </>
      )}

      {/* ── Active posting progress pill ────────────────────────────────────── */}
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
            boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.08), 0 0 40px -8px rgba(124,58,237,0.25), 0 0 60px -12px rgba(124,58,237,0.4)',
          }}
        >
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
            <span className="relative w-2 h-2 flex-shrink-0">
              <span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-60" />
              <span className="absolute inset-0 rounded-full bg-ok" />
            </span>
          </div>
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
          <button
            onClick={() => { playNav(); onNavigate(activeTask.kind === 'mass' ? 'massposting' : 'posting') }}
            className="mt-3 w-full text-[11px] font-semibold py-1.5 rounded-lg transition-all hover:opacity-90"
            style={{ background: 'rgba(139,92,246,0.14)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.2)' }}
          >
            Voir les détails →
          </button>
        </div>
      )}

      {/* ── User account switcher menu ───────────────────────────────────────── */}
      {userMenuOpen && userMenuPos && (
        <>
          <div onClick={() => setUserMenuOpen(false)} className="fixed inset-0 z-[9998]" style={{ background: 'transparent' }} />
          <div
            className="fixed z-[9999] rounded-xl shadow-2xl overflow-hidden anim-slide-down"
            style={{ left: userMenuPos.left, bottom: userMenuPos.bottom, width: Math.max(userMenuPos.width, 240), background: '#0c0919', border: '1px solid rgba(139,92,246,0.2)' }}
          >
            <div className="px-3 py-3 border-b flex items-center gap-2.5" style={{ borderColor: 'rgba(139,92,246,0.12)', background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(236,72,153,0.04))' }}>
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[13px] font-black flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)', boxShadow: '0 2px 10px rgba(124,58,237,0.4)', color: '#fff' }}>
                {userInitial}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(167,139,250,0.5)' }}>Compte actif</p>
                <p className="text-[12px] font-semibold text-white truncate max-w-[160px]">{user.email}</p>
              </div>
            </div>

            {recentAccounts.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-text2">Récents</p>
                {recentAccounts.map(a => (
                  <button
                    key={a.user_id}
                    onClick={() => handleSwitch(a)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04] group transition-colors"
                  >
                    <div className="w-5 h-5 rounded-md bg-text2/20 text-text2 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                      {a.email[0].toUpperCase()}
                    </div>
                    <span className="flex-1 text-[12px] text-text truncate">{a.email}</span>
                    <span
                      onClick={e => handleForget(a, e)}
                      className="text-text2 hover:text-danger text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Oublier ce compte"
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </>
            )}

            {switchErr && (
              <p className="px-3 py-2 text-[10px] text-danger bg-danger/10 border-t border-danger/30">{switchErr}</p>
            )}

            <button
              onClick={handleAddAccount}
              className="w-full px-3 py-2.5 text-[12px] text-text hover:bg-white/[0.04] border-t text-left transition-colors flex items-center gap-2.5"
              style={{ borderColor: 'rgba(139,92,246,0.12)' }}
            >
              <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] opacity-60">＋</span>
              <span>Ajouter un compte</span>
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); supabase.auth.signOut() }}
              className="w-full px-3 py-2.5 text-[12px] text-danger hover:bg-danger/10 border-t text-left transition-colors flex items-center gap-2.5"
              style={{ borderColor: 'rgba(139,92,246,0.12)' }}
            >
              <span className="flex items-center gap-2">
                <span>🚪</span><span>Se déconnecter</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
