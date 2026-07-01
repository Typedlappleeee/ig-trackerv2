import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg }    from '@/lib/orgContext'
import { useT } from '@/lib/i18n'
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
import { useLicense, effectivePlan } from '@/lib/license'
import { useCredits } from '@/lib/credits'
import { AuthPage }   from '@/components/auth/AuthPage'

const CREDIT_AUTO_RECHARGE = 10_000
const CREDIT_MAX_DISPLAY   = 150_000

function SFLogo({ size = 28 }: { size?: number }) {
  // Logo officiel ScaleFlow : tuile sombre + « S » néon lumineux (violet→rose).
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="sfl-tile" x1="50" y1="6" x2="50" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#23233f"/>
          <stop offset="100%" stopColor="#0a0a15"/>
        </linearGradient>
        <linearGradient id="sfl-s" x1="50" y1="24" x2="50" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#E7ECFF"/>
          <stop offset="50%"  stopColor="#C4B5FD"/>
          <stop offset="100%" stopColor="#F5B8F5"/>
        </linearGradient>
        <filter id="sfl-neon" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge>
        </filter>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="27"
        fill="url(#sfl-tile)" stroke="rgba(150,130,255,0.28)" strokeWidth="1.5"/>
      {/* halo néon */}
      <text x="50" y="54" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Inter', system-ui, sans-serif" fontWeight="900" fontSize="58"
        letterSpacing="-2" fill="#A855F7" filter="url(#sfl-neon)" opacity="0.9">S</text>
      {/* S net */}
      <text x="50" y="54" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Inter', system-ui, sans-serif" fontWeight="900" fontSize="58"
        letterSpacing="-2" fill="url(#sfl-s)">S</text>
    </svg>
  )
}

export type Page =
  | 'hub'
  | 'phones'
  | 'stats'
  | 'posting' | 'massposting' | 'scheduler' | 'tasks' | 'bank' | 'captionbank' | 'aitools' | 'warmup' | 'storylink'
  | 'publishhub' | 'photoposting'
  | 'montage' | 'remix' | 'repurpose' | 'mixer' | 'subtitles' | 'spoof' | 'videostudio'
  | 'community' | 'support'
  | 'settings' | 'licences'
  | 'scaleia'
  | 'history'
  | 'reports'
  | 'tiktokposting'

interface LayoutProps {
  user:      User
  page:      Page
  onNavigate:(page: Page, settingsTab?: string) => void
  onRefresh?:() => void
  phoneCount?: number
  lastRefresh?: Date | null
  children:  React.ReactNode
}

interface NavItem  { id: Page; label: string; icon: string; beta?: boolean; isNew?: boolean; dev?: boolean }
interface NavSection { title: string; items: NavItem[]; defaultOpen?: boolean }

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    defaultOpen: true,
    items: [
      { id: 'phones',      label: 'navPhones',       icon: '📱' },
      { id: 'bank',        label: 'navBank',         icon: '🗂' },
      { id: 'history',     label: 'navHistory',      icon: '🕑' },
      { id: 'reports',     label: 'navReports',      icon: '📊', beta: true },
    ],
  },
  {
    title: 'Publier',
    defaultOpen: true,
    items: [
      { id: 'publishhub',  label: 'navPublishVideo', icon: '🚀' },
      { id: 'scheduler',   label: 'navScheduler',    icon: '📅' },
      { id: 'tasks',       label: 'navTasks',        icon: '⚡', beta: true },
      { id: 'warmup',      label: 'navWarmup',       icon: '🔥' },
    ],
  },
  {
    title: 'Studio vidéo',
    defaultOpen: true,
    items: [
      { id: 'videostudio', label: 'navVideoStudio',  icon: '🎬' },
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
  chart:     'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
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
  phones:          'phone',
  stats:           'monitor',
  monitor:         'monitor',
  posting:         'send',
  massposting:     'zap',
  scheduler:       'calendar',
  tasks:           'zap',
  storylink:       'send',

  bank:            'video',
  captionbank:     'chat',
  warmup:          'flame',
  aitools:         'sparkles',
  subtitles:       'chat',
  montage:         'scissors',
  remix:           'refresh',
  videostudio:     'video',
  publishhub:      'send',
  photoposting:    'send',
  repurpose:       'zap',
  mixer:           'edit',
  spoof:           'shield',
  textcopy:        'edit',
  scaleia:         'sparkles',
  hub:             'grid',
  settings:        'settings',
  licences:        'shield',
  community:       'chat',
  support:         'chat',
  history:         'refresh',
  reports:         'chart',
  tiktokposting:   'zap',
}

// Sidebar divider — hairline
function SidebarDivider() {
  return (
    <div style={{ height: 1, margin: '8px 10px', background: 'rgba(233,234,240,0.06)' }} />
  )
}

// ── Badge global « config recommandée » (topbar) ────────────────────────────
// Affiché partout dans l'app : rappelle la config fiable pour l'automatisation
// (Stories, etc.) + bouton « copier » pour transmettre la consigne aux agences.
const RECO_LINES = [
  'Android 15',
  'Instagram version 433.0.0.42.68 (recommandée par GeeLark pour l\'automatisation)',
  'Téléphone (cloud phone) en anglais',
]
const RECO_TEXT =
  '✅ Config recommandée pour que l\'automatisation marche à coup sûr :\n' +
  RECO_LINES.map(l => `• ${l}`).join('\n') +
  '\n\nUne config différente (autre version d\'Instagram, téléphone dans une autre langue) peut faire échouer l\'automatisation.'

function RecoBadge() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(RECO_TEXT).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Config recommandée pour l'automatisation"
        className="cursor-pointer"
        style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 900, lineHeight: 1, color: '#fff',
          background: '#ef4444', border: '1px solid rgba(255,255,255,0.25)',
          boxShadow: '0 0 0 3px rgba(239,68,68,0.20), 0 2px 8px rgba(239,68,68,0.40)',
        }}
      >
        ?
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 200,
            width: 320, padding: '14px 15px', borderRadius: 12,
            background: '#15171c', border: '1px solid rgba(239,68,68,0.35)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: '#F1F0F7', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            Config recommandée
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RECO_LINES.map(l => (
              <div key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: 'rgba(233,234,240,0.82)', fontWeight: 600 }}>
                <span style={{ color: '#22c55e', flexShrink: 0 }}>✓</span>
                <span>{l}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(233,234,240,0.45)', marginTop: 10, lineHeight: 1.5 }}>
            Une autre version d'Instagram ou un téléphone dans une autre langue peut faire échouer l'automatisation.
          </div>
          <button
            onClick={copy}
            className="cursor-pointer"
            style={{
              marginTop: 11, width: '100%', fontSize: 12, fontWeight: 700, padding: '8px 11px', borderRadius: 8,
              background: copied ? 'rgba(34,197,94,0.14)' : 'rgba(99,102,241,0.12)',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(99,102,241,0.4)'}`,
              color: copied ? '#22c55e' : '#818CF8',
            }}
          >
            {copied ? '✓ Consigne copiée' : 'Copier la consigne à envoyer'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sidebar NavItem (module-level: stable identity across Layout renders) ────
interface SidebarNavItemProps {
  id: Page
  label: string
  iconKey: IconKey
  beta?: boolean
  isNew?: boolean
  dev?: boolean
  active: boolean
  collapsed: boolean
  onNavigate: (page: Page) => void
}

function SidebarNavItem({ id, label, iconKey, beta, isNew, dev, active, collapsed, onNavigate }: SidebarNavItemProps) {
  const [hovered, setHovered] = useState(false)
  const [tooltipY, setTooltipY] = useState(0)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <div style={{ marginBottom: 2 }}>
      <button
        ref={btnRef}
        className={`sf-sidebar-item${active ? ' is-active' : ''}`}
        onClick={() => { playNav(); onNavigate(id) }}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onMouseEnter={() => {
          setHovered(true)
          if (collapsed && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect()
            setTooltipY(r.top + r.height / 2)
          }
        }}
        onMouseLeave={() => setHovered(false)}
        style={{ gap: collapsed ? 0 : 10, justifyContent: collapsed ? 'center' : 'flex-start' }}
      >
        <span className="sf-sidebar-icon">
          <NavIcon d={ICONS[iconKey]} size={17} />
        </span>
        {!collapsed && (
          <>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            {beta && (
              <span title="Fonctionnalité en test — comportement susceptible d'évoluer" className="sf-badge sf-badge-beta" style={{ fontSize: 9, letterSpacing: '0.08em' }}>BETA</span>
            )}
            {isNew && (
              <span title="Nouvelle fonctionnalité" className="sf-badge sf-badge-new" style={{ fontSize: 9, letterSpacing: '0.08em' }}>NEW</span>
            )}
            {dev && (
              <span title="En cours de développement — des bugs peuvent survenir" className="sf-badge sf-badge-warn" style={{ fontSize: 9, letterSpacing: '0.08em' }}>EN DEV</span>
            )}
          </>
        )}
      </button>
      {/* Floating tooltip — collapsed mode */}
      {collapsed && hovered && (
        <div className="sf-sidebar-tooltip" style={{ left: 58, top: tooltipY }}>
          {label}
          {beta && <span style={{ marginLeft: 6, fontSize: 9, color: 'rgba(148,163,184,0.5)' }}>BETA</span>}
          {isNew && <span style={{ marginLeft: 6, fontSize: 9, color: '#34d399' }}>NEW</span>}
          {dev && <span style={{ marginLeft: 6, fontSize: 9, color: '#F59E0B' }}>EN DEV</span>}
        </div>
      )}
    </div>
  )
}


export function Layout({ user, page, onNavigate, children }: LayoutProps) {
  const t = useT()
  const toast = useToast()
  const [collapsed, setCollapsed]         = useState(() => {
    const v = localStorage.getItem('sf-sidebar')
    return v === 'reduite' || v === 'masquee'
  })
  const [demoMode, setDemoMode] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.display_name) setDisplayName(data.display_name) })
  }, [user.id])

  // Ask for desktop notification permission once, app-wide
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sidebar-sections') ?? '{}')
      return Object.fromEntries(NAV_SECTIONS.map(s => [s.title, saved[s.title] ?? s.defaultOpen ?? true]))
    } catch {
      return Object.fromEntries(NAV_SECTIONS.map(s => [s.title, s.defaultOpen ?? true]))
    }
  })
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
            page:  'posting',
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
            page:  'massposting',
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
            page: 'community',
          })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── Centralized completion notifier for scheduled posts & automatic tasks ──
  // Covers posts executed client-side (Scheduler / Tasks) AND server-side
  // (edge function while the PC is off — caught up when the app reopens).
  useEffect(() => {
    const scopeKey = currentOrg?.id ?? user.id
    const lastSeenKey = `sf-notif-lastseen-${scopeKey}`
    const processed = new Set<string>()

    const inScope = (row: any) =>
      currentOrg ? row.org_id === currentOrg.id : (row.user_id === user.id && !row.org_id)

    const parsePhones = (p: unknown): unknown[] => {
      if (Array.isArray(p)) return p
      if (typeof p === 'string') { try { const v = JSON.parse(p); return Array.isArray(v) ? v : [] } catch { return [] } }
      return []
    }

    const notifyForPost = (row: any) => {
      if (!row || processed.has(row.id)) return
      processed.add(row.id)
      const n = parsePhones(row.phones).length
      const ok = row.status === 'done'
      const isTask = !!row.task_id
      const typeLabel = isTask ? 'Tâche automatique'
        : row.type === 'story'        ? 'Story programmée'
        : row.type === 'mass_posting' ? 'Mass posting programmé'
        :                               'Publication programmée'
      const accounts = `${n} compte${n > 1 ? 's' : ''}`
      pushNotification({
        title: ok ? `${typeLabel} terminé ✓` : `${typeLabel} échoué`,
        body:  `${accounts}${row.created_by_name ? ' · ' + row.created_by_name : ''}`,
        level: ok ? 'ok' : 'error',
        page:  isTask ? 'tasks' : 'scheduler',
      })
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(ok ? `${typeLabel} terminé ✓` : `${typeLabel} échoué`, {
          body: `${accounts} — ScaleFlow`,
        })
      }
      // Advance the last-seen marker so we don't re-notify on next reopen
      if (row.executed_at) {
        const prev = localStorage.getItem(lastSeenKey)
        if (!prev || row.executed_at > prev) localStorage.setItem(lastSeenKey, row.executed_at)
      }
    }

    // 1) Catch-up: posts that finished server-side while the app was closed
    ;(async () => {
      const lastSeen = localStorage.getItem(lastSeenKey)
      // First ever load for this scope: just set the marker, don't dump history
      if (!lastSeen) {
        localStorage.setItem(lastSeenKey, new Date().toISOString())
        return
      }
      let q = supabase.from('scheduled_posts')
        .select('id,type,status,phones,executed_at,task_id,created_by_name')
        .in('status', ['done', 'failed'])
        .gt('executed_at', lastSeen)
        .order('executed_at', { ascending: true })
        .limit(15)
      q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
      const { data } = await q
      for (const row of (data ?? []) as any[]) notifyForPost(row)
    })()

    // 2) Realtime: live completions (client- or server-executed)
    const ch = supabase.channel(`layout-posts-notif-${scopeKey}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scheduled_posts' }, payload => {
        const row = payload.new as any
        const old = payload.old as any
        if (!inScope(row)) return
        if ((row.status === 'done' || row.status === 'failed') && old?.status !== row.status) {
          notifyForPost(row)
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scheduled_posts' }, payload => {
        const row = payload.new as any
        if (!inScope(row)) return
        // Recurring tasks insert their row already finished (status done/failed)
        if (row.status === 'done' || row.status === 'failed') notifyForPost(row)
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [currentOrg?.id, user.id])

  // Close the notif panel (marks everything as read on close, not on open,
  // so the unread badge stays meaningful while the panel is visible)
  function closeNotifPanel() {
    setNotifOpen(false)
    markAllRead()
  }

  // Close notif panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        closeNotifPanel()
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  function handleSwitchOrg(orgId: string | null, orgName?: string) {
    if (orgId === (currentOrg?.id ?? null)) { setOrgMenuOpen(false); return }
    switchOrg(orgId)
    setOrgMenuOpen(false)
    onNavigate('hub')
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

  const effectiveSuperAdmin = demoMode ? false : license?.isSuperAdmin === true

  // Outils de création de contenu — réservés à partir de Pro (Standard n'y a pas
  // accès). Sur Pro et Organisation, ils sont disponibles (et gratuits en crédits).
  const CONTENT_CREATION_TABS = new Set<Page>(['remix', 'spoof', 'subtitles', 'mixer', 'montage', 'aitools', 'videostudio'])
  const planNow = effectivePlan(license)
  const hasContentCreation = effectiveSuperAdmin || planNow === 'pro' || planNow === 'organisation'

  const isVisibleTab = (id: Page): boolean => {
    // Pages internes / superadmin ScaleFlow uniquement (Rapports + Tâches inclus).
    if (id === 'licences' || id === 'tiktokposting' || id === 'reports' || id === 'tasks') return effectiveSuperAdmin
    // Création de contenu : indisponible en Standard (réservé Pro / Organisation).
    if (CONTENT_CREATION_TABS.has(id) && !hasContentCreation) return false
    // Tous les autres onglets sont visibles pour tout le monde.
    return true
  }

  // Auto-redirect to the hub when the current page isn’t accessible in this org
  useEffect(() => {
    if (!orgLoading && page !== 'settings' && !isVisibleTab(page)) {
      onNavigate('hub')
    }
  }, [page, orgLoading, currentOrg?.id, role, perms])

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

  const userDisplayName = displayName || user.email?.split('@')[0] || ''
  const userInitial = userDisplayName?.[0]?.toUpperCase() ?? '?'
  const userName = userDisplayName
  const planLabel = license.isSuperAdmin
    ? 'Super Admin'
    : license.plan === 'organisation' ? 'Organisation'
    : license.plan === 'pro'          ? 'Plan Pro'
    : license.plan === 'standard'     ? 'Plan Standard'
    : 'Free plan'

  const pageLabels: Record<string, string> = {
    hub:         t('navHub'),
    scaleia:     'ScaleIA',
    phones:      t('pagePhones'),
    posting:     t('pagePosting'),
    massposting: t('pageMassPosting'),
    scheduler:   t('pageScheduler'),
    tasks:       t('navTasks'),
    storylink:   t('navStoryLink'),
    bank:        t('pageBank'),
    captionbank: t('navCaptionBank'),
    aitools:     t('pageAiTools'),
    warmup:      t('pageWarmup'),
    montage:     t('pageMontage'),
    remix:       t('pageRemix'),
    repurpose:   t('navRepurpose'),
    mixer:       t('navMixer'),
    subtitles:   t('navSubtitles'),
    videostudio: 'Studio vidéo',
    publishhub:  'Publication',
    photoposting: 'Publication photo',
    textcopy:    t('pageTextcopy'),
    community:   t('pageCommunity'),
    support:     t('pageSupport'),
    settings:    t('pageSettings'),
    licences:    t('pageLicences'),
    reports:     t('navReports'),
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', background: '#0A0B0E' }}>

      {/* ── Sidebar (desktop only) ───────────────────────────────────────── */}
      <aside
        style={{
          width: collapsed ? 54 : 248,
          flexShrink: 0,
          display: isMobile ? 'none' : 'flex',
          flexDirection: 'column',
          background: '#0F1014',
          borderRight: '1px solid rgba(233,234,240,0.07)',
          transition: 'width 0.28s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Ambient glow behind logo area */}
        <div style={{
          position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 220, height: 180, borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* ── Logo area ─────────────────────────────────────────────────── */}
        <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', flexShrink: 0 }}>
          {/* Logo officiel ScaleFlow + halo violet */}
          <div style={{
            position: 'relative', width: 32, height: 32, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            filter: 'drop-shadow(0 4px 12px rgba(124,58,237,0.5))',
          }}>
            <SFLogo size={32} />
          </div>

          {!collapsed && (
            <span style={{ flex: 1, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.025em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ background: 'linear-gradient(90deg, #E9EAF0, #D8D5CD)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Scale</span>
              <span style={{ background: 'linear-gradient(90deg, #6366F1, #818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
            </span>
          )}

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            aria-expanded={!collapsed}
            style={{
              width: 26, height: 26, borderRadius: 7,
              border: 'none',
              background: 'transparent',
              color: 'rgba(233,234,240,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              marginLeft: collapsed ? 'auto' : 0,
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(241,240,247,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(233,234,240,0.45)'; e.currentTarget.style.background = 'transparent' }}
            title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          >
            <NavIcon d={ICONS.menu} size={14} />
          </button>
        </div>

        {/* ── Nav ───────────────────────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 6px 8px' }}>

          {/* Hub — home, pinned at top */}
          <div style={{ marginBottom: 2 }}>
            <button
              className={`sf-sidebar-item${page === 'hub' ? ' is-active' : ''}`}
              onClick={() => { playNav(); onNavigate('hub') }}
              style={{ gap: collapsed ? 0 : 10, justifyContent: collapsed ? 'center' : 'flex-start' }}
            >
              <span className="sf-sidebar-icon"><NavIcon d={ICONS.grid} size={17} /></span>
              {!collapsed && <span style={{ flex: 1 }}>{t('navHub')}</span>}
            </button>
          </div>

          {/* Community — pinned */}
          {isVisibleTab('community') && (
            <div style={{ marginBottom: 2 }}>
              <button
                className={`sf-sidebar-item${page === 'community' ? ' is-active' : ''}`}
                onClick={() => { playNav(); onNavigate('community') }}
                style={{ gap: collapsed ? 0 : 10, justifyContent: collapsed ? 'center' : 'flex-start' }}
              >
                <span className="sf-sidebar-icon"><NavIcon d={ICONS.chat} size={17} /></span>
                {!collapsed && <span style={{ flex: 1 }}>{t('navCommunity')}</span>}
              </button>
            </div>
          )}

          <SidebarDivider />

          {/* Sections — collapsible (itère NAV_SECTIONS directement, robuste à
              l'ajout/suppression de sections) */}
          {NAV_SECTIONS.map((section, si) => {
              const defaultIcon: IconKey = (['phone', 'send', 'edit', 'zap', 'video'] as IconKey[])[si] ?? 'grid'
              const items = section.items.filter(it => isVisibleTab(it.id) && (!it.dev || effectiveSuperAdmin))
              if (items.length === 0) return null
              const isOpen = openSections[section.title] !== false
              return (
                <div key={section.title}>
                  <SidebarDivider />
                  {!collapsed && (
                    <button
                      className={`sf-sidebar-section${isOpen ? '' : ' is-closed'}`}
                      onClick={() => toggleSection(section.title)}
                    >
                      <span className="sf-sidebar-section-label">{section.title}</span>
                      <span className="sf-sidebar-section-line" />
                      <span className="sf-sidebar-section-arrow">
                        <NavIcon d={ICONS.chevronDown} size={10} />
                      </span>
                    </button>
                  )}
                  <div className={`sf-sidebar-items-wrap${(isOpen || collapsed) ? ' is-open' : ' is-closed'}`}>
                    {items.map(item => (
                      <SidebarNavItem
                        key={item.id}
                        id={item.id}
                        label={t(item.label as any)}
                        iconKey={PAGE_ICON[item.id] ?? defaultIcon}
                        beta={item.beta}
                        isNew={item.isNew}
                        dev={item.dev}
                        active={page === item.id}
                        collapsed={collapsed}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          }

        </nav>

        {/* ── Bottom section ────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>

          {/* Settings */}
          <button
            className={`sf-sidebar-item${page === 'settings' ? ' is-active' : ''}`}
            onClick={() => { playNav(); onNavigate('settings') }}
            style={{ gap: collapsed ? 0 : 10, justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            <span className="sf-sidebar-icon"><NavIcon d={ICONS.settings} size={17} /></span>
            {!collapsed && <span style={{ flex: 1 }}>{t('navSettings')}</span>}
          </button>

          {license.isSuperAdmin && (
            <button
              className={`sf-sidebar-item${page === 'licences' ? ' is-active' : ''}`}
              onClick={() => { playNav(); onNavigate('licences') }}
              style={{ gap: collapsed ? 0 : 10, justifyContent: collapsed ? 'center' : 'flex-start' }}
            >
              <span className="sf-sidebar-icon"><NavIcon d={ICONS.shield} size={17} /></span>
              {!collapsed && <span style={{ flex: 1 }}>{t('navAdmin')}</span>}
            </button>
          )}

          {/* Org switcher — compact icon button when collapsed */}
          {collapsed ? (
            <button
              ref={orgTriggerRef}
              onClick={() => orgMenuOpen ? setOrgMenuOpen(false) : openOrgMenu()}
              aria-label={currentOrg?.name ?? 'Organisation'}
              aria-expanded={orgMenuOpen}
              title={currentOrg?.name ?? 'Organisation'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', padding: '7px 0', borderRadius: 8,
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(233,234,240,0.42)', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.025)' }}
            >
              <NavIcon d={ICONS.building} size={14} />
            </button>
          ) : (
            <button
              ref={orgTriggerRef}
              onClick={() => orgMenuOpen ? setOrgMenuOpen(false) : openOrgMenu()}
              aria-label={currentOrg?.name ?? 'Organisation'}
              aria-expanded={orgMenuOpen}
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
              <span style={{ color: 'rgba(233,234,240,0.42)', flexShrink: 0, display: 'flex' }}>
                <NavIcon d={ICONS.building} size={14} />
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(241,240,247,0.8)', fontSize: 12, filter: demoMode ? 'blur(6px)' : 'none', userSelect: demoMode ? 'none' : 'auto' }}>
                {currentOrg?.name ?? 'Organisation'}
              </span>
              <span style={{ color: 'rgba(233,234,240,0.32)', flexShrink: 0, display: 'flex' }}>
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
              textAlign: 'left', cursor: 'pointer',
              background: collapsed ? 'transparent' : 'rgba(255,255,255,0.025)',
              border: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
              transition: 'background 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = collapsed ? 'transparent' : 'rgba(255,255,255,0.025)' }}
          >
            {/* Avatar pill */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
              boxShadow: '0 0 8px rgba(99,102,241,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
              filter: demoMode ? 'blur(5px)' : 'none',
            }}>
              {userInitial}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#F1F0F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', filter: demoMode ? 'blur(6px)' : 'none', userSelect: demoMode ? 'none' : 'auto' }}>
                  {userName}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(233,234,240,0.35)', marginTop: 1, filter: demoMode ? 'blur(4px)' : 'none', userSelect: demoMode ? 'none' : 'auto' }}>
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
          background: 'rgba(6,6,8,0.94)',
          backdropFilter: 'blur(20px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
          borderBottom: '1px solid transparent',
          borderImage: 'linear-gradient(90deg, rgba(99,102,241,0.18), rgba(233,234,240,0.08), rgba(99,102,241,0.18)) 1',
          position: 'relative', zIndex: 10,
          boxShadow: '0 1px 24px rgba(99,102,241,0.03)',
        }}>

          {/* Left: page title + breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            {(() => {
              const backTo: { hub: Page; label: string } | null =
                (['posting', 'storylink', 'photoposting'] as Page[]).includes(page) ? { hub: 'publishhub', label: 'Publication' }
                : (['remix', 'spoof', 'subtitles', 'mixer'] as Page[]).includes(page) ? { hub: 'videostudio', label: 'Studio Vidéo' }
                : null
              if (!backTo) return null
              return (
                <button
                  onClick={() => onNavigate(backTo.hub)}
                  title={`Retour à ${backTo.label}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '5px 10px', marginRight: 4, cursor: 'pointer',
                    color: 'rgba(233,234,240,0.8)', fontSize: 12.5, fontWeight: 600,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
                  {backTo.label}
                </button>
              )
            })()}
            <span style={{ color: 'rgba(99,102,241,0.7)', flexShrink: 0, display: 'flex' }}>
              <NavIcon d={ICONS[PAGE_ICON[page] ?? 'grid']} size={15} />
            </span>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginRight: 3,
              background: 'linear-gradient(135deg, #6366F1, #E9EAF0)',
              boxShadow: '0 0 8px rgba(99,102,241,0.6)',
            }} />
            <span style={{ fontSize: 14.5, fontWeight: 600, color: '#F1F0F7', whiteSpace: 'nowrap' }}>
              {pageLabels[page] ?? page}
            </span>
            {breadcrumb && breadcrumb.map((seg, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'rgba(233,234,240,0.28)', fontSize: 13 }}>/</span>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: i === breadcrumb.length - 1 ? 'rgba(233,234,240,0.85)' : 'rgba(233,234,240,0.48)',
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
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#6366F1', flexShrink: 0,
            }}>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
              {activeTask.kind === 'mass'
                ? `${activeTask.done}/${activeTask.total} • ${activeTask.progress}%`
                : `${activeTask.progress}%`}
            </div>
          )}

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

            {/* Badge config recommandée (global, survol/clic) */}
            <RecoBadge />

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
                  className={credits.balance < 10 ? 'sf-credits-low' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px 5px 12px', borderRadius: '8px 0 0 8px',
                    background: credits.balance < 10 ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.07)',
                    border: credits.balance < 10 ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(99,102,241,0.18)',
                    borderRight: 'none',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = credits.balance < 10 ? 'rgba(239,68,68,0.14)' : 'rgba(99,102,241,0.13)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = credits.balance < 10 ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.07)' }}
                >
                  {/* Diamond/gem icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M6 3h12l4 6-10 12L2 9l4-6z" stroke={credits.balance < 10 ? '#F87171' : '#6366F1'} strokeWidth="2" strokeLinejoin="round" fill={credits.balance < 10 ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.18)'}/>
                    <path d="M2 9h20M12 3l4 6-4 12-4-12 4-6z" stroke={credits.balance < 10 ? '#F87171' : '#6366F1'} strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 700, color: credits.balance < 10 ? '#F87171' : '#818CF8', fontVariantNumeric: 'tabular-nums' }}>
                    {credits.balance.toLocaleString('fr-FR')}
                  </span>
                </button>
                {/* + button */}
                <button
                  onClick={() => onNavigate('settings', 'abonnement')}
                  title="Acheter des crédits"
                  aria-label="Acheter des crédits"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 30, borderRadius: '0 8px 8px 0',
                    background: credits.balance < 10 ? 'rgba(239,68,68,0.14)' : 'rgba(99,102,241,0.14)',
                    border: credits.balance < 10 ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(99,102,241,0.25)',
                    cursor: 'pointer', transition: 'background 0.15s, opacity 0.15s',
                    fontSize: 14, fontWeight: 700,
                    color: credits.balance < 10 ? '#F87171' : '#6366F1',
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = credits.balance < 10 ? 'rgba(239,68,68,0.22)' : 'rgba(99,102,241,0.22)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = credits.balance < 10 ? 'rgba(239,68,68,0.14)' : 'rgba(99,102,241,0.14)' }}
                >
                  +
                </button>
              </div>
            )}

            {/* Demo mode toggle — super admin only */}
            {license?.isSuperAdmin === true && (
              <button
                onClick={() => setDemoMode(d => !d)}
                title={demoMode ? 'Quitter le mode démo' : 'Activer la vue utilisateur (démo)'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0 10px', height: 32, borderRadius: 8,
                  border: demoMode ? '1px solid rgba(251,146,60,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  background: demoMode ? 'rgba(251,146,60,0.12)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                  fontSize: 11, fontWeight: 600,
                  color: demoMode ? '#FB923C' : 'rgba(233,234,240,0.42)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = demoMode ? 'rgba(251,146,60,0.2)' : 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = demoMode ? 'rgba(251,146,60,0.12)' : 'transparent' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                {demoMode ? 'Vue démo' : 'Démo'}
              </button>
            )}

            {/* Notification bell */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button
                onClick={() => { if (notifOpen) closeNotifPanel(); else setNotifOpen(true) }}
                aria-label={`${t('notifications')}${unread > 0 ? ` (${unread})` : ''}`}
                aria-expanded={notifOpen}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: `1px solid ${unread > 0 ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <NavIcon d={ICONS.bell} size={15} color={unread > 0 ? '#6366F1' : 'rgba(233,234,240,0.42)'} />
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    minWidth: 16, height: 16, padding: '0 2px', borderRadius: 8,
                    background: 'linear-gradient(130deg,#6366F1,#A855F7)', color: '#fff',
                    fontSize: 9, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 8px rgba(99,102,241,0.6)',
                  }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {/* Notifications panel */}
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl overflow-hidden z-50 sf-anim-slide-down"
                  style={{ background: '#0F1014', border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 16px 56px -8px rgba(0,0,0,0.85), 0 0 0 1px rgba(99,102,241,0.08), 0 0 40px -16px rgba(99,102,241,0.2)' }}>

                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
                    <div className="flex items-center gap-2">
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#6366F1" strokeWidth={2}>
                        <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                      </svg>
                      <span className="text-[13px] font-bold text-white">{t('notifications')}</span>
                      {notifications.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366F1' }}>
                          {notifications.length}
                        </span>
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <button onClick={clearNotifications}
                        className="text-[11px] transition-colors hover:text-white flex items-center gap-1"
                        style={{ color: 'rgba(233,234,240,0.32)' }}>
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
                          style={{ background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.15)' }}>
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
                      const iconColor = n.level === 'ok' ? '#22C55E' : n.level === 'error' ? '#EF4444' : n.level === 'warn' ? '#F59E0B' : '#6366F1'
                      const iconBg    = n.level === 'ok' ? 'rgba(34,197,94,0.12)' : n.level === 'error' ? 'rgba(239,68,68,0.12)' : n.level === 'warn' ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)'
                      const Icon = () => {
                        if (n.level === 'ok')    return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5L4.5 8L9 3" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        if (n.level === 'error') return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2L9 9M9 2L2 9" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round"/></svg>
                        if (n.level === 'warn')  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L10 9.5H1L5.5 1Z" stroke={iconColor} strokeWidth="1.2" strokeLinejoin="round"/><path d="M5.5 4.5v2.5M5.5 8.5v.1" stroke={iconColor} strokeWidth="1.2" strokeLinecap="round"/></svg>
                        return <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke={iconColor} strokeWidth="1.2"/><path d="M5.5 3.5v2.5M5.5 7.5v.1" stroke={iconColor} strokeWidth="1.2" strokeLinecap="round"/></svg>
                      }
                      const targetPage = n.page as Page | undefined
                      return (
                        <div key={n.id}
                          className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
                          role={targetPage ? 'button' : undefined}
                          tabIndex={targetPage ? 0 : undefined}
                          onClick={targetPage ? () => { playNav(); onNavigate(targetPage); closeNotifPanel() } : undefined}
                          onKeyDown={targetPage ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playNav(); onNavigate(targetPage); closeNotifPanel() } } : undefined}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: targetPage ? 'pointer' : 'default' }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: iconBg, border: `1px solid ${iconColor}22` }}>
                            <Icon />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-white leading-snug">{n.title}</p>
                            {n.body && <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'rgba(233,234,240,0.48)' }}>{n.body}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0 mt-0.5">
                            <span className="text-[10px] tabular-nums" style={{ color: 'rgba(82,82,91,0.7)' }}>{n.time}</span>
                            {targetPage && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18l6-6-6-6"/>
                              </svg>
                            )}
                          </div>
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
                background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
              title={user.email}
              aria-label={user.email ?? t('activeAccount')}
            >
              {userInitial}
            </button>

          </div>
        </header>

        {/* ── Scrollable content ────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: 'auto', position: 'relative', background: '#0A0B0E', zIndex: 0 }}>
          {/* Demo mode banner */}
          {demoMode && (
            <div style={{
              position: 'sticky', top: 0, zIndex: 40,
              background: 'linear-gradient(90deg, rgba(251,146,60,0.15), rgba(251,146,60,0.08))',
              borderBottom: '1px solid rgba(251,146,60,0.25)',
              padding: '7px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FB923C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#FB923C', flex: 1 }}>
                Mode démo — vue utilisateur (membre)
              </span>
              <button
                onClick={() => setDemoMode(false)}
                style={{ fontSize: 11, color: 'rgba(251,146,60,0.7)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 6 }}
              >
                Quitter
              </button>
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
              style={{ animation: 'sf-page-cine 0.40s cubic-bezier(0.22,1,0.36,1) both' }}
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
            style={{ left: orgMenuPos.left, bottom: orgMenuPos.bottom, width: orgMenuPos.width, background: '#13141A', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            {myOrgs.map(({ org }) => (
              <button
                key={org.id}
                onClick={() => handleSwitchOrg(org.id, org.name)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors ${currentOrg?.id === org.id ? 'text-accent' : 'text-text hover:bg-white/[0.04]'}`}
                style={currentOrg?.id === org.id ? { background: 'rgba(99,102,241,0.1)' } : {}}
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
              style={{ borderColor: 'rgba(99,102,241,0.12)' }}
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
            border: '1px solid rgba(99,102,241,0.3)',
            backdropFilter: 'blur(22px)',
            borderRadius: 16, padding: '14px 16px', width: 230,
            boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(99,102,241,0.08), 0 0 40px -8px rgba(99,102,241,0.25), 0 0 60px -12px rgba(99,102,241,0.4)',
          }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#6366F122,#818CF822)', border: '1px solid rgba(99,102,241,0.25)' }}
            >
              <NavIcon d={activeTask.kind === 'mass' ? ICONS.zap : ICONS.send} size={14} color="#6366F1" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-white leading-tight">
                {activeTask.kind === 'mass' ? 'Mass Posting' : 'Posting'} {t('taskInProgress')}
              </p>
              <p className="text-[10px] leading-tight" style={{ color: 'rgba(233,234,240,0.45)' }}>
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
              <span className="text-[10px]" style={{ color: 'rgba(233,234,240,0.4)' }}>{t('progress')}</span>
              <span className="text-[10px] font-mono" style={{ color: 'rgba(233,234,240,0.6)' }}>{activeTask.progress}%</span>
            </div>
            <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.12)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${activeTask.progress}%`, background: 'linear-gradient(90deg,#6366F1,#818CF8)' }}
              />
            </div>
          </div>
          <button
            onClick={() => { playNav(); onNavigate(activeTask.kind === 'mass' ? 'massposting' : 'posting') }}
            className="mt-3 w-full text-[11px] font-semibold py-1.5 rounded-lg transition-all hover:opacity-90"
            style={{ background: 'rgba(99,102,241,0.14)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.2)' }}
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
            style={{ left: userMenuPos.left, bottom: userMenuPos.bottom, width: Math.max(userMenuPos.width, 240), background: '#13141A', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <div className="px-3 py-3 border-b flex items-center gap-2.5" style={{ borderColor: 'rgba(99,102,241,0.12)', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(233,234,240,0.04))' }}>
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[13px] font-black flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)', boxShadow: '0 2px 10px rgba(99,102,241,0.4)', color: '#fff' }}>
                {userInitial}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(99,102,241,0.5)' }}>{t('activeAccount')}</p>
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
              style={{ borderColor: 'rgba(99,102,241,0.12)' }}
            >
              <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] opacity-60">+</span>
              <span>{t('addAccount')}</span>
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); supabase.auth.signOut() }}
              className="w-full px-3 py-2.5 text-[12px] text-danger hover:bg-danger/10 border-t text-left transition-colors flex items-center gap-2.5"
              style={{ borderColor: 'rgba(99,102,241,0.12)' }}
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
            { id: 'videostudio', iconKey: 'video', label: 'Studio' },
            { id: 'bank',     iconKey: 'video',    label: 'Bank'     },
            { id: 'phones',   iconKey: 'phone',    label: 'Phones'   },
            { id: 'scheduler',iconKey: 'calendar', label: 'Planif.'  },
            { id: 'settings', iconKey: 'settings', label: 'Config'   },
          ] as Array<{ id: Page; iconKey: IconKey; label: string }>).map(item => {
            const active = page === item.id
            return (
              <button
                key={item.id}
                onClick={() => { playNav(); onNavigate(item.id) }}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 3, border: 'none', background: 'transparent', cursor: 'pointer',
                  color: active ? '#6366F1' : 'rgba(148,163,184,0.45)',
                  position: 'relative',
                  transition: 'color 0.15s',
                }}
              >
                <div style={{
                  width: 44, height: 30, borderRadius: 20,
                  background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: active ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}>
                  <NavIcon d={ICONS[item.iconKey]} size={19} />
                </div>
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
              aria-label="Fermer"
              style={{ position: 'absolute', top: -14, right: -14, zIndex: 10, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12121c', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(148,163,184,0.7)', cursor: 'pointer', fontSize: 14 }}
            >✕</button>
            <AuthPage />
          </div>
        </div>
      )}
    </div>
  )
}
