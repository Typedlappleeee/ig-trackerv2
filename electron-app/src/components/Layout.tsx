import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg }    from '@/lib/orgContext'
import { useT } from '@/lib/i18n'
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
import { AuthPage }   from '@/components/auth/AuthPage'

const CREDIT_AUTO_RECHARGE = 10_000
const CREDIT_MAX_DISPLAY   = 150_000

function SFLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" overflow="visible">
      <defs>
        <linearGradient id="sfl-g" x1="50" y1="5" x2="50" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#22d3ee"/>
          <stop offset="45%"  stopColor="#818cf8"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <filter id="sfl-glow" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
          <feColorMatrix in="blur" type="matrix"
            values="0 0 0 0 0.13  0 0 0 0 0.83  0 0 0 0 0.93   0 0 0 1 0" result="colored"/>
          <feMerge><feMergeNode in="colored"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Glow halo */}
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="#0e7490" strokeWidth="22" strokeLinecap="round" fill="none" opacity="0.3"
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
  | 'hub'
  | 'phones'
  | 'posting' | 'massposting' | 'scheduler' | 'bank' | 'captionbank' | 'aitools' | 'warmup' | 'storylink'
  | 'montage' | 'remix' | 'repurpose' | 'mixer'
  | 'community' | 'support'
  | 'settings' | 'licences'
  | 'scaleia'

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
      { id: 'phones',      label: 'navPhones',      icon: '📱' },
      { id: 'bank',        label: 'navBank',         icon: '🗂' },
      { id: 'captionbank', label: 'navCaptionBank',  icon: '💬' },
    ],
  },
  {
    title: 'Instagram',
    defaultOpen: true,
    items: [
      { id: 'storylink',   label: 'navStoryLink',    icon: '🔗', isNew: true },
      { id: 'posting',     label: 'navPosting',      icon: '🚀' },
      { id: 'massposting', label: 'navMassPosting',  icon: '⚡' },
      { id: 'scheduler',   label: 'navScheduler',    icon: '📅' },
      { id: 'warmup',      label: 'navWarmup',       icon: '🔥', beta: true },
      { id: 'aitools',     label: 'navAiTools',      icon: '🔧' },
    ],
  },
  {
    title: 'Montage',
    defaultOpen: true,
    items: [
      { id: 'remix',       label: 'navRemix',       icon: '🔀' },
      { id: 'repurpose',   label: 'navRepurpose',   icon: '⚡', isNew: true },
      { id: 'mixer',       label: 'navMixer',       icon: '🎞️', isNew: true },
    ],
  },
]

// ── SVG Icon helper ──────────────────────────────────────────────────────────
function NavIcon({ d, size = 16, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d}/>
    </svg>
  )
}

// SVG paths
const ICONS = {
  chat:      'M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a1.994 1.994 0 0 1-1.414-.586m0 0L11 14h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v4',
  phone:     'M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z',
  monitor:   'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z',
  send:      'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  zap:       'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  calendar:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  video:     'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
  flame:     'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z',
  sparkles:  'M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  scissors:  'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm12 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8.586 12.586l7.07 7.07M15.657 12.586l-7.07 7.07',
  refresh:   'M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15',
  edit:      'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  settings:  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  building:  'M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4',
  shield:    'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  bell:      'M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9',
  chevronDown:  'M19 9l-7 7-7-7',
  chevronRight: 'M9 18l6-6-6-6',
  menu:         'M4 6h16M4 12h16M4 18h7',
  grid:         'M4 5a1 1 0 0 1 1-1h5v6H4V5zm10-1h5a1 1 0 0 1 1 1v5h-6V4zM4 14h6v6H5a1 1 0 0 1-1-1v-5zm10 0h6v5a1 1 0 0 1-1 1h-5v-6z',
} as const

type IconKey = keyof typeof ICONS

// Map page id -> icon key
const PAGE_ICON: Record<string, IconKey> = {
  phones:      'phone',
  monitor:     'monitor',
  posting:     'send',
  massposting: 'zap',
  scheduler:   'calendar',
  storylink:   'send',
  bank:        'video',
  captionbank: 'chat',
  warmup:      'flame',
  aitools:     'sparkles',
  montage:     'scissors',
  remix:       'refresh',
  repurpose:   'zap',
  mixer:       'edit',
  textcopy:    'edit',
  scaleia:     'sparkles',
}

// Section label component
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '14px 12px 6px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: 'rgba(148,163,184,0.4)',
    }}>
      {children}
    </div>
  )
}

// Sidebar divider — subtle cosmic gradient
function SidebarDivider() {
  return (
    <div style={{ height: 1, margin: '6px 10px', background: 'rgba(255,255,255,0.05)' }} />
  )
}


export function Layout({ user, page, onNavigate, onRefresh, phoneCount, lastRefresh, children }: LayoutProps) {
  const t = useT()
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
  const [showAddAccount, setShowAddAccount] = useState(false)

  useEffect(() => {
    if (!showAddAccount) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN') setShowAddAccount(false)
    })
    return () => subscription.unsubscribe()
  }, [showAddAccount])
  const { myOrgs, currentOrg, role, perms, switchOrg, loading: orgLoading } = useOrg()
  const license = useLicense()
  const credits = useCredits()

  const [activeTask, setActiveTask]     = useState<{ kind: 'single' | 'mass'; progress: number; done: number; total: number } | null>(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  const [notifOpen, setNotifOpen]       = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread]             = useState(0)
  const notifRef                        = useRef<HTMLDivElement>(null)
  const [breadcrumb, setBreadcrumb]     = useState<string[] | null>(null)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
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

  // Notify when a new admin news post is published in the community
  useEffect(() => {
    const ch = supabase
      .channel('layout-news-notif')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'community_messages',
        filter: 'channel=eq.news',
      }, payload => {
        const msg = payload.new as any
        if (msg?.is_admin) {
          pushNotification({
            title: '📢 Nouvelle actualité',
            body: msg.title || msg.content?.slice(0, 80) || undefined,
            level: 'info',
          })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
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
    onNavigate('community')
    toast.show({
      title: orgId ? `→ "${orgName}"` : t('soloMode'),
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

  function handleAddAccount() {
    setUserMenuOpen(false)
    setShowAddAccount(true)
  }

  const isVisibleTab = (id: Page): boolean => {
    if (id === 'licences')  return license.isSuperAdmin
    if (id === 'support' || id === 'community' || id === 'scaleia' || id === 'hub') return true
    return role ? canSeeTab(role, perms, id as import('@/lib/supabase').PageKey) : true
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(t)
  }, [])

  // Auto-redirect to community when the current page isn't accessible in this org
  useEffect(() => {
    if (!orgLoading && page !== 'settings' && !isVisibleTab(page)) {
      onNavigate('community')
    }
  }, [page, orgLoading, currentOrg?.id])

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
  const userName = user.email?.split('@')[0] ?? userInitial
  const planLabel = license.isSuperAdmin
    ? 'Super Admin'
    : license.plan === 'organisation' ? 'Organisation'
    : license.plan === 'pro'          ? 'Plan Pro'
    : license.plan === 'standard'     ? 'Plan Standard'
    : 'Free plan'

  // ── Sidebar NavItem ────────────────────────────────────────────────────────
  const SidebarNavItem = ({
    id,
    label,
    iconKey,
    beta,
    isNew,
  }: {
    id: Page
    label: string
    iconKey: IconKey
    beta?: boolean
    isNew?: boolean
  }) => {
    const active = page === id
    const [hovered, setHovered] = useState(false)
    const [pressed, setPressed] = useState(false)
    return (
      <div style={{ position: 'relative', marginBottom: 2 }}>
        <button
          onClick={() => { playNav(); onNavigate(id) }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => { setHovered(false); setPressed(false) }}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 10,
            width: '100%',
            height: 39,
            padding: '0 11px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: active ? 600 : 450,
            textAlign: 'left',
            cursor: 'pointer',
            border: 'none',
            background: active
              ? 'rgba(255,255,255,0.09)'
              : hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
            color: active ? '#ffffff' : hovered ? 'rgba(241,240,247,0.85)' : 'rgba(148,163,184,0.58)',
            transition: 'background 140ms ease, color 140ms ease',
            transform: pressed ? 'scale(0.968)' : 'scale(1)',
            justifyContent: collapsed ? 'center' : 'flex-start',
            flexShrink: 0,
            position: 'relative',
            outline: 'none',
          }}
        >
          <span style={{
            flexShrink: 0,
            display: 'flex',
            color: active ? 'rgba(255,255,255,0.9)' : hovered ? 'rgba(196,181,253,0.7)' : 'rgba(148,163,184,0.42)',
            transition: 'color 140ms ease',
          }}>
            <NavIcon d={ICONS[iconKey]} size={17} />
          </span>
          {!collapsed && (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              {beta && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                  border: '1px solid rgba(139,92,246,0.2)', flexShrink: 0,
                }}>BETA</span>
              )}
              {isNew && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(16,185,129,0.15)', color: '#34d399',
                  border: '1px solid rgba(52,211,153,0.2)', flexShrink: 0,
                }}>NEW</span>
              )}
            </>
          )}
        </button>
        {/* Floating tooltip when sidebar is collapsed */}
        {collapsed && hovered && (
          <div style={{
            position: 'fixed',
            left: 60,
            top: 'auto',
            transform: 'translateY(-50%)',
            background: '#1A1A2E',
            border: '1px solid rgba(139,92,246,0.28)',
            borderRadius: 7,
            padding: '5px 11px',
            fontSize: 12,
            fontWeight: 500,
            color: '#F2F0FF',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.06)',
            zIndex: 9999,
            pointerEvents: 'none',
            animation: 'sf-slide-left 0.16s cubic-bezier(0.22,1,0.36,1) both',
          }}>
            {label}
          </div>
        )}
      </div>
    )
  }

  const pageLabels: Record<string, string> = {
    hub:         t('navHub'),
    scaleia:     'ScaleIA',
    phones:      t('pagePhones'),
    posting:     t('pagePosting'),
    massposting: t('pageMassPosting'),
    scheduler:   t('pageScheduler'),
    storylink:   t('navStoryLink'),
    bank:        t('pageBank'),
    captionbank: t('navCaptionBank'),
    aitools:     t('pageAiTools'),
    warmup:      t('pageWarmup'),
    montage:     t('pageMontage'),
    remix:       t('pageRemix'),
    repurpose:   t('navRepurpose'),
    mixer:       t('navMixer'),
    textcopy:    t('pageTextcopy'),
    community:   t('pageCommunity'),
    support:     t('pageSupport'),
    settings:    t('pageSettings'),
    licences:    t('pageLicences'),
  }

  // Suppress unused variable warnings for variables kept for logic parity
  void groupCount
  void lastRefreshLabel
  void phoneCount
  void onRefresh
  void openSections
  void now

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', background: '#08080E' }}>

      {/* ── Sidebar (desktop only) ───────────────────────────────────────── */}
      <aside
        style={{
          width: collapsed ? 54 : 248,
          flexShrink: 0,
          display: isMobile ? 'none' : 'flex',
          flexDirection: 'column',
          background: '#0d0d14',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          transition: 'width 0.28s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* ── Logo area ─────────────────────────────────────────────────── */}
        <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', flexShrink: 0 }}>
          {/* Logo box */}
          <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg,rgba(124,58,237,0.25),rgba(34,211,238,0.1))',
              border: '1px solid rgba(124,58,237,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SFLogo size={18} />
            </div>
          </div>

          {!collapsed && (
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ background: 'linear-gradient(90deg, #e2e8f0, #cbd5e1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Scale</span>
              <span style={{ background: 'linear-gradient(90deg, #22d3ee, #818cf8, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
            </span>
          )}

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(v => !v)}
            style={{
              width: 26, height: 26, borderRadius: 7,
              border: 'none',
              background: 'transparent',
              color: 'rgba(148,163,184,0.38)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              marginLeft: collapsed ? 'auto' : 0,
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(241,240,247,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(148,163,184,0.38)'; e.currentTarget.style.background = 'transparent' }}
            title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          >
            <NavIcon d={ICONS.menu} size={14} />
          </button>
        </div>

        {/* ── Nav ───────────────────────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 6px 8px' }}>

          {/* Hub — home, pinned at top */}
          <button
            onClick={() => { playNav(); onNavigate('hub') }}
            title={collapsed ? t('navHub') : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 9,
              width: '100%', height: 39, padding: '0 11px', borderRadius: 10,
              fontSize: 14, fontWeight: page === 'hub' ? 600 : 400, textAlign: 'left',
              cursor: 'pointer', border: 'none',
              background: page === 'hub' ? 'rgba(255,255,255,0.09)' : 'transparent',
              color: page === 'hub' ? '#ffffff' : 'rgba(148,163,184,0.58)',
              transition: 'background 0.15s, color 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
              marginBottom: 2,
            }}
            onMouseEnter={e => { if (page !== 'hub') (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { if (page !== 'hub') (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <span style={{ flexShrink: 0, color: page === 'hub' ? 'rgba(255,255,255,0.9)' : 'rgba(148,163,184,0.42)', display: 'flex' }}>
              <NavIcon d={ICONS.grid} size={17} />
            </span>
            {!collapsed && <span style={{ flex: 1 }}>{t('navHub')}</span>}
          </button>

          {/* Community — pinned */}
          {isVisibleTab('community') && (
            <button
              onClick={() => { playNav(); onNavigate('community') }}
              title={collapsed ? t('navCommunity') : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 9,
                width: '100%', height: 39, padding: '0 11px', borderRadius: 10,
                fontSize: 14, fontWeight: page === 'community' ? 600 : 400, textAlign: 'left',
                cursor: 'pointer', border: 'none',
                background: page === 'community' ? 'rgba(255,255,255,0.09)' : 'transparent',
                color: page === 'community' ? '#ffffff' : 'rgba(148,163,184,0.58)',
                transition: 'background 0.15s, color 0.15s',
                justifyContent: collapsed ? 'center' : 'flex-start',
                marginBottom: 2,
              }}
              onMouseEnter={e => {
                if (page !== 'community') (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={e => {
                if (page !== 'community') (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <span style={{ flexShrink: 0, color: page === 'community' ? 'rgba(255,255,255,0.9)' : 'rgba(148,163,184,0.42)', display: 'flex' }}>
                <NavIcon d={ICONS.chat} size={17} />
              </span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{t('navCommunity')}</span>
                  {page !== 'community' && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                      padding: '2px 5px', borderRadius: 4,
                      background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                      border: '1px solid rgba(139,92,246,0.2)', flexShrink: 0,
                    }}>
                      NEW
                    </span>
                  )}
                </>
              )}
            </button>
          )}

          {/* ScaleIA — coming soon spotlight */}
          <button
            onClick={() => { playNav(); onNavigate('scaleia') }}
            title={collapsed ? 'ScaleIA' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 9,
              width: '100%', height: 39, padding: '0 11px', borderRadius: 10,
              fontSize: 14, fontWeight: page === 'scaleia' ? 600 : 500, textAlign: 'left',
              cursor: 'pointer', border: '1px solid rgba(139,92,246,0.22)',
              background: page === 'scaleia'
                ? 'linear-gradient(90deg,rgba(124,58,237,0.25),rgba(34,211,238,0.1))'
                : 'linear-gradient(90deg,rgba(124,58,237,0.08),rgba(34,211,238,0.04))',
              color: page === 'scaleia' ? '#c4b5fd' : 'rgba(196,181,253,0.7)',
              transition: 'background 0.15s, color 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
              marginBottom: 2,
            }}
            onMouseEnter={e => {
              if (page !== 'scaleia') (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(90deg,rgba(124,58,237,0.15),rgba(34,211,238,0.07))'
            }}
            onMouseLeave={e => {
              if (page !== 'scaleia') (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(90deg,rgba(124,58,237,0.08),rgba(34,211,238,0.04))'
            }}
          >
            <span style={{ flexShrink: 0, color: '#a78bfa', display: 'flex' }}>
              <NavIcon d={ICONS.sparkles} size={17} color="#a78bfa" />
            </span>
            {!collapsed && (
              <>
                <span style={{ flex: 1, background: 'linear-gradient(90deg,#c4b5fd,#67e8f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700 }}>ScaleIA</span>
                <span style={{
                  fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em',
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                  background: 'linear-gradient(90deg,rgba(167,139,250,0.25),rgba(34,211,238,0.15))',
                  color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)',
                  boxShadow: '0 0 6px rgba(139,92,246,0.3)',
                }}>
                  SOON
                </span>
              </>
            )}
          </button>

          <SidebarDivider />

          {/* Principal section */}
          {(() => {
            const items = NAV_SECTIONS[0].items.filter(it => isVisibleTab(it.id))
            if (items.length === 0) return null
            return (
              <>
                {!collapsed && <SectionLabel>{t('sectionPrincipal')}</SectionLabel>}
                {items.map(item => (
                  <SidebarNavItem
                    key={item.id}
                    id={item.id}
                    label={t(item.label as any)}
                    iconKey={PAGE_ICON[item.id] ?? 'phone'}
                    beta={item.beta}
                    isNew={item.isNew}
                  />
                ))}
              </>
            )
          })()}

          <SidebarDivider />

          {/* Instagram section */}
          {(() => {
            const items = NAV_SECTIONS[1].items.filter(it => isVisibleTab(it.id))
            if (items.length === 0) return null
            return (
              <>
                {!collapsed && <SectionLabel>{t('sectionInstagram')}</SectionLabel>}
                {items.map(item => (
                  <SidebarNavItem
                    key={item.id}
                    id={item.id}
                    label={t(item.label as any)}
                    iconKey={PAGE_ICON[item.id] ?? 'send'}
                    beta={item.beta}
                    isNew={item.isNew}
                  />
                ))}
              </>
            )
          })()}

          <SidebarDivider />

          {/* Creation section */}
          {(() => {
            const items = NAV_SECTIONS[2].items.filter(it => isVisibleTab(it.id))
            if (items.length === 0) return null
            return (
              <>
                {!collapsed && <SectionLabel>{t('sectionCreation')}</SectionLabel>}
                {items.map(item => (
                  <SidebarNavItem
                    key={item.id}
                    id={item.id}
                    label={t(item.label as any)}
                    iconKey={PAGE_ICON[item.id] ?? 'edit'}
                    beta={item.beta}
                    isNew={item.isNew}
                  />
                ))}
              </>
            )
          })()}

        </nav>

        {/* ── Bottom section ────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>

          {/* Settings */}
          <button
            onClick={() => { playNav(); onNavigate('settings') }}
            title={collapsed ? t('navSettings') : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 9,
              width: '100%', height: 39, padding: '0 11px', borderRadius: 10,
              fontSize: 14, fontWeight: page === 'settings' ? 600 : 400, textAlign: 'left',
              cursor: 'pointer', border: 'none',
              background: page === 'settings' ? 'rgba(255,255,255,0.09)' : 'transparent',
              color: page === 'settings' ? '#ffffff' : 'rgba(148,163,184,0.58)',
              transition: 'background 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={e => {
              if (page !== 'settings') (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
            }}
            onMouseLeave={e => {
              if (page !== 'settings') (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            <span style={{ flexShrink: 0, color: page === 'settings' ? 'rgba(255,255,255,0.9)' : 'rgba(148,163,184,0.42)', display: 'flex' }}>
              <NavIcon d={ICONS.settings} size={17} />
            </span>
            {!collapsed && <span style={{ flex: 1 }}>{t('navSettings')}</span>}
          </button>

          {license.isSuperAdmin && (
            <button
              onClick={() => { playNav(); onNavigate('licences') }}
              title={collapsed ? t('navAdmin') : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 9,
                width: '100%', height: 39, padding: '0 11px', borderRadius: 10,
                fontSize: 14, fontWeight: page === 'licences' ? 600 : 400, textAlign: 'left',
                cursor: 'pointer', border: 'none',
                background: page === 'licences' ? 'rgba(255,255,255,0.09)' : 'transparent',
                color: page === 'licences' ? '#ffffff' : 'rgba(148,163,184,0.58)',
                transition: 'background 0.15s',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
              onMouseEnter={e => {
                if (page !== 'licences') (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={e => {
                if (page !== 'licences') (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <span style={{ flexShrink: 0, color: page === 'licences' ? 'rgba(255,255,255,0.9)' : 'rgba(148,163,184,0.42)', display: 'flex' }}>
                <NavIcon d={ICONS.shield} size={17} />
              </span>
              {!collapsed && <span style={{ flex: 1 }}>{t('navAdmin')}</span>}
            </button>
          )}

          {/* Org switcher */}
          {!collapsed && (
            <button
              ref={orgTriggerRef}
              onClick={() => orgMenuOpen ? setOrgMenuOpen(false) : openOrgMenu()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 8px', borderRadius: 8, fontSize: 12, textAlign: 'left',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: '#F1F0F7', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.025)' }}
            >
              <span style={{ color: 'rgba(148,163,184,0.5)', flexShrink: 0, display: 'flex' }}>
                <NavIcon d={ICONS.building} size={14} />
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(241,240,247,0.8)', fontSize: 12 }}>
                {currentOrg?.name ?? 'Organisation'}
              </span>
              <span style={{ color: 'rgba(148,163,184,0.4)', flexShrink: 0, display: 'flex' }}>
                <NavIcon d={ICONS.chevronDown} size={12} />
              </span>
            </button>
          )}

          {/* User row */}
          <button
            ref={userTriggerRef}
            onClick={() => userMenuOpen ? setUserMenuOpen(false) : openUserMenu()}
            style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 8,
              width: '100%', padding: collapsed ? '4px 0' : '5px 8px', borderRadius: 8,
              textAlign: 'left', cursor: 'pointer', border: 'none', background: 'transparent',
              transition: 'background 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            {/* Avatar pill */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0e7490, #7C3AED)',
              boxShadow: '0 0 8px rgba(34,211,238,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {userInitial}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#F1F0F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userName}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.42)', marginTop: 1 }}>
                  {planLabel}
                </div>
              </div>
            )}
          </button>

        </div>
      </aside>

      {/* ── Main area (topbar + content) ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', paddingBottom: isMobile ? 56 : 0 }}>

        {/* ── Topbar ──────────────────────────────────────────────────────── */}
        <header style={{
          height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px',
          background: 'rgba(6,6,14,0.94)',
          backdropFilter: 'blur(20px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
          borderBottom: '1px solid transparent',
          borderImage: 'linear-gradient(90deg, rgba(99,57,196,0.2), rgba(34,211,238,0.15), rgba(99,57,196,0.2)) 1',
          position: 'relative', zIndex: 10,
          boxShadow: '0 1px 24px rgba(34,211,238,0.03)',
        }}>

          {/* Left: page title + breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginRight: 3,
              background: 'linear-gradient(135deg, #a78bfa, #22d3ee)',
              boxShadow: '0 0 8px rgba(139,92,246,0.6)',
            }} />
            <span style={{ fontSize: 14.5, fontWeight: 600, color: '#F1F0F7', whiteSpace: 'nowrap' }}>
              {pageLabels[page] ?? page}
            </span>
            {breadcrumb && breadcrumb.map((seg, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'rgba(148,163,184,0.35)', fontSize: 13 }}>/</span>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: i === breadcrumb.length - 1 ? 'rgba(196,181,253,0.85)' : 'rgba(148,163,184,0.55)',
                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {seg}
                </span>
              </span>
            ))}
          </div>

          {/* Middle: active task pill */}
          {activeTask && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
              color: '#A78BFA', flexShrink: 0,
            }}>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
              {activeTask.kind === 'mass'
                ? `${activeTask.done}/${activeTask.total} • ${activeTask.progress}%`
                : `${activeTask.progress}%`}
            </div>
          )}

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

            {/* Subscription expiry warning */}
            {license.source === 'own' && license.daysLeft !== null && license.daysLeft <= 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171',
              }}>
                <span>{license.daysLeft === 0 ? t('subscriptionExpired') : t('lessThan24h')}</span>
              </div>
            )}

            {/* Credits chip + buy button */}
            {!credits.loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {/* Balance pill */}
                <button
                  onClick={() => onNavigate('settings', 'abonnement')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px 5px 12px', borderRadius: '8px 0 0 8px',
                    background: credits.balance < 10 ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.07)',
                    border: credits.balance < 10 ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(139,92,246,0.18)',
                    borderRight: 'none',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = credits.balance < 10 ? 'rgba(239,68,68,0.14)' : 'rgba(139,92,246,0.13)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = credits.balance < 10 ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.07)' }}
                >
                  {/* Diamond/gem icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M6 3h12l4 6-10 12L2 9l4-6z" stroke={credits.balance < 10 ? '#F87171' : '#a78bfa'} strokeWidth="2" strokeLinejoin="round" fill={credits.balance < 10 ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.18)'}/>
                    <path d="M2 9h20M12 3l4 6-4 12-4-12 4-6z" stroke={credits.balance < 10 ? '#F87171' : '#a78bfa'} strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 700, color: credits.balance < 10 ? '#F87171' : '#c4b5fd', fontVariantNumeric: 'tabular-nums' }}>
                    {credits.balance.toLocaleString('fr-FR')}
                  </span>
                </button>
                {/* + button */}
                <button
                  onClick={() => onNavigate('settings', 'abonnement')}
                  title="Acheter des crédits"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 30, borderRadius: '0 8px 8px 0',
                    background: credits.balance < 10 ? 'rgba(239,68,68,0.14)' : 'rgba(139,92,246,0.14)',
                    border: credits.balance < 10 ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(139,92,246,0.25)',
                    cursor: 'pointer', transition: 'background 0.15s, opacity 0.15s',
                    fontSize: 14, fontWeight: 700,
                    color: credits.balance < 10 ? '#F87171' : '#a78bfa',
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = credits.balance < 10 ? 'rgba(239,68,68,0.22)' : 'rgba(139,92,246,0.22)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = credits.balance < 10 ? 'rgba(239,68,68,0.14)' : 'rgba(139,92,246,0.14)' }}
                >
                  +
                </button>
              </div>
            )}

            {/* Notification bell */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button
                onClick={() => { setNotifOpen(v => !v); if (!notifOpen) markAllRead() }}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: `1px solid ${unread > 0 ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <NavIcon d={ICONS.bell} size={15} color={unread > 0 ? '#A78BFA' : 'rgba(148,163,184,0.5)'} />
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    minWidth: 16, height: 16, padding: '0 2px', borderRadius: 8,
                    background: 'linear-gradient(130deg,#7C3AED,#A855F7)', color: '#fff',
                    fontSize: 9, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 8px rgba(139,92,246,0.6)',
                  }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {/* Notifications panel */}
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl overflow-hidden z-50"
                  style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 16px 48px -8px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.08)' }}>

                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="flex items-center gap-2">
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#A78BFA" strokeWidth={2}>
                        <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                      </svg>
                      <span className="text-[13px] font-bold text-white">{t('notifications')}</span>
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
                        {t('clearNotifications')}
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
                        <p className="text-[12px] font-semibold" style={{ color: 'rgba(148,163,184,0.3)' }}>{t('noNotifications')}</p>
                        <p className="text-[11px] text-center max-w-[180px]" style={{ color: 'rgba(82,82,91,0.6)' }}>
                          {t('notificationsDesc')}
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

            {/* User avatar — no ref here, ref lives on sidebar row so position is correct */}
            <button
              onClick={() => userMenuOpen ? setUserMenuOpen(false) : openUserMenu()}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(124,58,237,0.4)',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
              title={user.email}
            >
              {userInitial}
            </button>

          </div>
        </header>

        {/* ── Scrollable content ────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: 'auto', position: 'relative', background: '#08080E', zIndex: 0 }}>
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
                <p className="text-xs text-text2 font-medium tracking-wide">{t('loadingContext')}</p>
              </div>
            </div>
          )}

          {/* Permission denied */}
          {!orgLoading && !isVisibleTab(page) && page !== 'settings' ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 text-center px-8 anim-scale-in">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-danger/8 border border-danger/15 flex items-center justify-center">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div className="absolute -inset-3 rounded-[32px] bg-danger/5 -z-10" />
              </div>
              <div className="space-y-2.5 max-w-sm">
                <h2 className="text-2xl font-bold text-text">{t('accessDenied')}</h2>
                <p className="text-text2 text-sm leading-relaxed">
                  {t('accessDeniedDesc')}{' '}
                  <strong className="text-text font-semibold">"{currentOrg?.name}"</strong>.
                </p>
                <p className="text-text2/50 text-xs">{t('accessDeniedContact')}</p>
              </div>
              <button
                onClick={() => onNavigate('community')}
                className="px-6 py-2.5 active:scale-95 text-white text-sm font-semibold rounded-xl transition-all btn-sf-primary"
              >
                {t('backToCommunity')}
              </button>
            </div>
          ) : (
            <div
              key={page}
              className="h-full"
              style={{ animation: 'sf-slide-up 0.26s cubic-bezier(0.22,1,0.36,1) both' }}
            >
              {children}
            </div>
          )}
        </main>
      </div>

      {/* ── Org switcher menu ─────────────────────────────────────────────── */}
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
                <NavIcon d={ICONS.building} size={13} color="currentColor" />
                <span className="truncate flex-1">{org.name}</span>
                {currentOrg?.id === org.id && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-accent">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </button>
            ))}
            <button
              onClick={() => { setOrgMenuOpen(false); onNavigate('settings', 'organization') }}
              className="w-full px-3 py-2 text-[11px] text-text2 hover:bg-white/[0.04] border-t text-left transition-colors flex items-center gap-2"
              style={{ borderColor: 'rgba(139,92,246,0.12)' }}
            >
              <NavIcon d={ICONS.settings} size={11} color="currentColor" />
              {t('manageOrganizations')}
            </button>
          </div>
        </>
      )}

      {/* ── Active posting progress pill ─────────────────────────────────── */}
      {activeTask && (
        <div
          className="fixed bottom-5 right-5 z-[9990] anim-slide-down"
          style={{
            background: 'rgba(6,3,16,0.96)',
            border: '1px solid rgba(139,92,246,0.3)',
            backdropFilter: 'blur(22px)',
            borderRadius: 16, padding: '14px 16px', width: 230,
            boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.08), 0 0 40px -8px rgba(124,58,237,0.25), 0 0 60px -12px rgba(124,58,237,0.4)',
          }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}
            >
              <NavIcon d={activeTask.kind === 'mass' ? ICONS.zap : ICONS.send} size={14} color="#a78bfa" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-white leading-tight">
                {activeTask.kind === 'mass' ? 'Mass Posting' : 'Posting'} {t('taskInProgress')}
              </p>
              <p className="text-[10px] leading-tight" style={{ color: 'rgba(196,181,253,0.45)' }}>
                {activeTask.kind === 'mass' && activeTask.total > 0
                  ? `${activeTask.done} / ${activeTask.total} ${t('phones')}`
                  : `${t('taskPending')}…`}
              </p>
            </div>
            <span className="relative w-2 h-2 flex-shrink-0">
              <span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-60" />
              <span className="absolute inset-0 rounded-full bg-ok" />
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>{t('progress')}</span>
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
            {t('viewDetails')}
          </button>
        </div>
      )}

      {/* ── User account switcher menu ────────────────────────────────────── */}
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
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(167,139,250,0.5)' }}>{t('activeAccount')}</p>
                <p className="text-[12px] font-semibold text-white truncate max-w-[160px]">{user.email}</p>
              </div>
            </div>

            {recentAccounts.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-text2">{t('recentAccounts')}</p>
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
                      title={t('forgetAccount')}
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
              <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] opacity-60">+</span>
              <span>{t('addAccount')}</span>
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); supabase.auth.signOut() }}
              className="w-full px-3 py-2.5 text-[12px] text-danger hover:bg-danger/10 border-t text-left transition-colors flex items-center gap-2.5"
              style={{ borderColor: 'rgba(139,92,246,0.12)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"/>
              </svg>
              <span>{t('signOut')}</span>
            </button>
          </div>
        </>
      )}

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          height: 56,
          background: 'rgba(8,8,14,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'stretch',
        }}>
          {([
            { id: 'remix',    icon: '🔀', label: 'Remix'    },
            { id: 'bank',     icon: '🗂',  label: 'Bank'     },
            { id: 'phones',   icon: '📱', label: 'Phones'   },
            { id: 'scheduler',icon: '📅', label: 'Planif.'  },
            { id: 'settings', icon: '⚙️',  label: 'Config'   },
          ] as Array<{ id: Page; icon: string; label: string }>).map(item => {
            const active = page === item.id
            return (
              <button
                key={item.id}
                onClick={() => { playNav(); onNavigate(item.id) }}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, border: 'none', background: 'transparent', cursor: 'pointer',
                  color: active ? '#A78BFA' : 'rgba(148,163,184,0.45)',
                  position: 'relative',
                  transition: 'color 0.15s',
                }}
              >
                {active && (
                  <span style={{
                    position: 'absolute', top: 0, left: '20%', right: '20%', height: 2,
                    background: 'linear-gradient(90deg,#7c3aed,#ec4899)',
                    borderRadius: '0 0 2px 2px',
                  }} />
                )}
                <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.03em' }}>{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}

      {/* ── Add account modal ───────────────────────────────────────────── */}
      {showAddAccount && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddAccount(false) }}
        >
          <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
            <button
              onClick={() => setShowAddAccount(false)}
              style={{ position: 'absolute', top: -14, right: -14, zIndex: 10, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12121c', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(148,163,184,0.7)', cursor: 'pointer', fontSize: 14 }}
            >✕</button>
            <AuthPage />
          </div>
        </div>
      )}
    </div>
  )
}
