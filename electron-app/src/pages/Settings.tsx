import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useT, useLang } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { OrganizationPanel } from '@/components/OrganizationPanel'
import { useOrg } from '@/lib/orgContext'
import { canSeeTab } from '@/lib/permissions'
import { notifyConnectionsChanged } from '@/lib/connections'
import { useLicense } from '@/lib/license'
import { useCredits } from '@/lib/credits'
import {
  isMusicEnabled, setMusicEnabled,
  getVolume, setVolume,
  getTrack, setTrack,
  TRACKS,
} from '@/lib/music'

// All 8 themes from Python THEMES dict (line 29-39)
const THEMES = ['Lime', 'Bleu', 'Violet', 'Ambre', 'Rouge', 'Cyan', 'Rose', 'Vert'] as const
const THEME_COLORS: Record<string, string> = {
  Lime:   '#4f8ef7',  // Python: confusingly Lime maps to blue
  Bleu:   '#4f9eff',
  Violet: '#a56ef5',
  Ambre:  '#ffb830',
  Rouge:  '#ff5c6e',
  Cyan:   '#00e5d4',
  Rose:   '#ff6ec7',
  Vert:   '#2dde78',
}

// ── Shared toggle row ────────────────────────────────────────────────────────
function ToggleRow({
  checked, onChange, title, sub, accent: _accent,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  sub: string
  accent?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => onChange(!checked)}>
      <div
        className={`sf-toggle-track ${checked ? 'on' : 'off'}`}
        onClick={e => { e.stopPropagation(); onChange(!checked) }}
      >
        <span className="sf-toggle-thumb" />
      </div>
      <div style={{ flex: 1, userSelect: 'none' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: checked ? '#F2F0FF' : 'rgba(196,181,253,0.72)', margin: 0, transition: 'color 140ms ease' }}>{title}</p>
        <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginTop: 2, marginBottom: 0 }}>{sub}</p>
      </div>
    </div>
  )
}

// ── Premium nav item with glow bar ────────────────────────────────────────────
function NavItem({ active, icon, label, onClick, S }: {
  active: boolean; icon: JSX.Element; label: string; onClick: () => void
  S: { text: string; text3: string; accent: string; accent3: string; surface2: string }
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 9,
        height: 36, padding: '0 12px',
        borderRadius: 8, fontSize: 13, fontWeight: active ? 500 : 400,
        textAlign: 'left', border: 'none', cursor: 'pointer',
        background: active ? 'rgba(139,92,246,0.1)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        color: active ? '#F2F0FF' : hovered ? 'rgba(241,240,247,0.85)' : S.text3,
        transition: 'background 140ms ease, color 140ms ease',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        width: '100%',
      }}
    >
      {active && (
        <span style={{
          position: 'absolute', left: 0, top: 7, bottom: 7, width: 2,
          background: 'linear-gradient(180deg,#A78BFA,#7C3AED)',
          boxShadow: '0 0 8px rgba(139,92,246,0.7)',
          borderRadius: 2,
        }} />
      )}
      <span style={{ color: active ? S.accent3 : hovered ? 'rgba(167,139,250,0.8)' : 'currentColor', display: 'flex', alignItems: 'center', transition: 'color 140ms ease' }}>
        {icon}
      </span>
      {label}
    </button>
  )
}

// ── Sub-tab underline button ───────────────────────────────────────────────────
function SubTabBtn({ active, icon, label, onClick, S }: {
  active: boolean; icon: JSX.Element; label: string; onClick: () => void
  S: { text: string; text3: string; accent: string; accent3: string }
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '0 14px', height: 40, fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? '#F2F0FF' : hovered ? 'rgba(196,181,253,0.7)' : 'rgba(148,163,184,0.45)',
        background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid #7C3AED' : '2px solid transparent',
        marginBottom: -1, cursor: 'pointer',
        transition: 'color 120ms ease, border-color 120ms ease',
        flexShrink: 0,
      }}
    >
      <span style={{ color: active ? S.accent3 : hovered ? 'rgba(167,139,250,0.7)' : 'currentColor', display: 'flex', alignItems: 'center', transition: 'color 120ms ease' }}>
        {icon}
      </span>
      {label}
    </button>
  )
}

type GeneralTab = 'apparence' | 'sons' | 'notifications' | 'langue' | 'securite' | 'avance'
type Panel = 'general' | 'profile' | 'connexions' | 'organization' | 'admin' | 'abonnement' | 'desktop'
interface SettingsProps { user: User; initialPanel?: Panel; initialTab?: GeneralTab; onNavigate?: (page: string) => void }

const GEN_SIDEBAR_IDS: { id: GeneralTab; labelKey: 'tabAppearance' | 'tabSounds' | 'tabNotifications' | 'tabLanguage' | 'tabSecurity' | 'tabAdvanced' }[] = [
  { id: 'apparence',     labelKey: 'tabAppearance'    },
  { id: 'sons',          labelKey: 'tabSounds'        },
  { id: 'notifications', labelKey: 'tabNotifications' },
  { id: 'langue',        labelKey: 'tabLanguage'      },
  { id: 'securite',      labelKey: 'tabSecurity'      },
  { id: 'avance',        labelKey: 'tabAdvanced'      },
]
// Keep backward compat alias
const GEN_SIDEBAR = GEN_SIDEBAR_IDS

// SVG icons for main nav panels
const NAV_ICONS: Record<string, JSX.Element> = {
  general: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
    </svg>
  ),
  profile: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  connexions: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  organization: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  ),
  admin: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  abonnement: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
}

// SVG icons for general sub-tabs
const GEN_ICONS: Record<GeneralTab, JSX.Element> = {
  apparence: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  ),
  sons: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ),
  notifications: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  langue: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  securite: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  avance: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
    </svg>
  ),
}

export function Settings({ user, initialPanel, initialTab, onNavigate }: SettingsProps) {
  const t = useT()
  const { lang, setLang: setAppLang } = useLang()
  const { role, perms, currentOrg, myOrgs } = useOrg()
  const license = useLicense()
  const canSeeConnexions     = role ? canSeeTab(role, perms, 'settings') : true
  const canEditOrgConnexions = role === 'owner' || role === 'admin'

  const [panel, setPanel]   = useState<Panel>(() => {
    const p = initialPanel ?? 'general'
    return p === 'connexions' && !canSeeConnexions ? 'general' : p
  })
  const mountedRef           = useRef(false)
  const [genTab, setGenTab] = useState<GeneralTab>(initialTab ?? 'apparence')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  // ── Apparence ──────────────────────────────────────────────────────────────
  const [theme, setTheme]               = useState('Bleu')
  const [pixelUnlocked, setPixelUnlocked] = useState(false)
  const [swatchClicks, setSwatchClicks] = useState<{ count: number; first: number }>({ count: 0, first: 0 })
  const [darkMode, setDarkMode]         = useState(true)
  const [roundedCorners, setRoundedCorners] = useState('moyen')
  const [animationsOn, setAnimationsOn] = useState(true)
  const [glassOn, setGlassOn]           = useState(true)
  const [fontFamily, setFontFamily]     = useState('inter')
  const [fontSize, setFontSize]         = useState('moyenne')
  const [density, setDensity]           = useState('confortable')
  const [sidebarMode, setSidebarMode]   = useState('etendue')

  // ── Sons ──────────────────────────────────────────────────────────────────
  const [musicOn, setMusicOn]         = useState(isMusicEnabled)
  const [musicVol, setMusicVol]       = useState(getVolume)
  const [musicTrack, setMusicTrackS]  = useState(getTrack)
  const [notifySound, setNotifySound] = useState(true)

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifyPopup, setNotifyPopup]   = useState(true)
  const [notifyDesktop, setNotifyDesktop] = useState(false)
  const [notifyUpdates, setNotifyUpdates] = useState(true)
  const [notifyErrors, setNotifyErrors] = useState(true)

  // ── Langue ───────────────────────────────────────────────────────────────
  const [dateFormat, setDateFormat] = useState('dd/mm/yyyy')
  const [timezone, setTimezone]     = useState('Europe/Paris')

  // ── Sécurité ──────────────────────────────────────────────────────────────
  const [twoFA, setTwoFA]           = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState('jamais')
  const [pwChangeOpen, setPwChangeOpen] = useState(false)
  const [newPw, setNewPw]               = useState('')
  const [confirmPw, setConfirmPw]       = useState('')
  const [pwError, setPwError]           = useState<string | null>(null)
  const [pwOk, setPwOk]                 = useState(false)

  // ── Avancé ────────────────────────────────────────────────────────────────
  const [devMode, setDevMode]       = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)

  // ── Profil ────────────────────────────────────────────────────────────────
  const [profileEmail, setProfileEmail] = useState(user.email ?? '')
  const [profileName, setProfileName]   = useState('')
  const [displayName, setDisplayName]   = useState('')

  // ── Connexions ────────────────────────────────────────────────────────────
  const [bearer, setBearer]             = useState('')
  const [groqKey, setGroqKey]           = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [proxyUrl, setProxyUrl]         = useState('')
  const [igSession, setIgSession]       = useState('')

  useEffect(() => { if (initialPanel) setPanel(initialPanel) }, [initialPanel])
  useEffect(() => { if (initialTab)   setGenTab(initialTab)  }, [initialTab])

  function applyAppearanceCSS(opts: {
    rounded?: string; fontFam?: string; fs?: string; anim?: boolean; dark?: boolean
    glass?: boolean; density?: string; sidebar?: string
  }) {
    const html = document.documentElement
    // Font family
    const ffMap: Record<string,string> = { inter: "'Inter', sans-serif", system: 'system-ui, sans-serif', mono: 'ui-monospace, monospace' }
    const ff = opts.fontFam ?? fontFamily
    document.body.style.fontFamily = ffMap[ff] ?? "'Inter', sans-serif"
    // data-* attributes drive CSS overrides in index.css
    html.setAttribute('data-fontsize', opts.fs ?? fontSize)
    html.setAttribute('data-rounded',  opts.rounded ?? roundedCorners)
    html.setAttribute('data-density',  opts.density ?? density)
    html.setAttribute('data-theme',    (opts.dark ?? darkMode) ? 'dark' : 'light')
    html.setAttribute('data-glass',    (opts.glass ?? glassOn) ? 'on' : 'off')
    // Animations
    const anim = opts.anim ?? animationsOn
    if (anim) html.classList.remove('no-animations')
    else       html.classList.add('no-animations')
    // Sidebar via custom event (Layout.tsx listens)
    if (opts.sidebar !== undefined) {
      window.dispatchEvent(new CustomEvent('sf:sidebar-change', { detail: opts.sidebar }))
    }
  }

  // Load saved values
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    const storedTheme = localStorage.getItem('theme') || 'Bleu'
    setTheme(storedTheme); applyTheme(storedTheme)
    setPixelUnlocked(localStorage.getItem('pixel-unlocked') === '1')

    const ls = (k: string, fallback: string) => localStorage.getItem(k) ?? fallback
    const lb = (k: string, fallback: boolean) => { const v = localStorage.getItem(k); return v !== null ? v === '1' : fallback }

    const r  = ls('sf-rounded',  'moyen');     setRoundedCorners(r)
    const an = lb('sf-animations', true);      setAnimationsOn(an)
    const gl = lb('sf-glass',      true);      setGlassOn(gl)
    const ff = ls('sf-font',      'inter');    setFontFamily(ff)
    const fs = ls('sf-fontsize',  'moyenne');  setFontSize(fs)
    const de = ls('sf-density',   'confortable'); setDensity(de)
    const sb = ls('sf-sidebar',   'etendue');  setSidebarMode(sb)
    const dk = lb('sf-dark',       true);      setDarkMode(dk)
    setNotifyPopup(lb('notify-popup', true))
    setNotifySound(lb('notify-sound', true))
    setNotifyUpdates(lb('sf-notify-updates', true))
    setNotifyErrors(lb('sf-notify-errors',  true))
    setDateFormat(ls('sf-date-format', 'dd/mm/yyyy'))
    setTimezone(ls('sf-timezone', 'Europe/Paris'))
    setDevMode(lb('sf-dev-mode', false))
    applyAppearanceCSS({ rounded: r, fontFam: ff, fs, anim: an, dark: dk, glass: gl, density: de })

    async function loadAll() {
      setLoading(true)
      try {
        const [configRes, profileRes] = await Promise.all([
          (async () => {
            let q = supabase.from(currentOrg ? 'org_config' : 'app_config').select('*')
            if (currentOrg) q = (q as any).eq('org_id', currentOrg.id)
            else            q = (q as any).eq('user_id', user.id)
            return q.maybeSingle()
          })(),
          supabase.from('profiles').select('full_name, display_name, email').eq('id', user.id).maybeSingle(),
        ])
        const d = configRes.data as any
        if (d) {
          setBearer(d.bearer_token ?? ''); setGroqKey(d.groq_api_key ?? '')
          setAnthropicKey(d.anthropic_api_key ?? ''); setProxyUrl(d.proxy ?? '')
          setIgSession(d.ig_sessionid ?? '')
          setProfileEmail((d.profile_email as string) ?? user.email ?? '')
        }
        if (profileRes.data) {
          setProfileName(profileRes.data.full_name ?? '')
          setDisplayName(profileRes.data.display_name ?? '')
        }
      } finally { setLoading(false) }
    }
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyTheme(t: string) {
    const color = THEME_COLORS[t] ?? '#4f9eff'
    document.documentElement.style.setProperty('--color-accent', color)
    document.documentElement.style.setProperty('--color-accent-hover', color + 'cc')
  }

  function handleTheme(t: string) {
    setTheme(t); localStorage.setItem('theme', t); applyTheme(t)
  }

  function handleSwatchClick() {
    const now = Date.now()
    setSwatchClicks(prev => {
      const reset = now - prev.first > 4000
      const next  = { count: reset ? 1 : prev.count + 1, first: reset ? now : prev.first }
      if (next.count >= 7) { localStorage.setItem('pixel-unlocked', '1'); setPixelUnlocked(true) }
      return next
    })
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      // Persist all appearance / notification / language settings
      const set = (k: string, v: string) => localStorage.setItem(k, v)
      const setb = (k: string, v: boolean) => localStorage.setItem(k, v ? '1' : '0')
      set('sf-rounded', roundedCorners); set('sf-font', fontFamily); set('sf-fontsize', fontSize)
      set('sf-density', density);        set('sf-sidebar', sidebarMode)
      setb('sf-dark', darkMode);         setb('sf-animations', animationsOn)
      setb('sf-glass', glassOn);         setb('notify-popup', notifyPopup)
      setb('notify-sound', notifySound); setb('sf-notify-updates', notifyUpdates)
      setb('sf-notify-errors', notifyErrors); set('sf-lang', lang as string)
      set('sf-date-format', dateFormat); set('sf-timezone', timezone)
      setb('sf-dev-mode', devMode)
      applyAppearanceCSS({})
      const { error: e } = await supabase.from('app_config').upsert({
        user_id: user.id, theme, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (e) throw e
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setError(e.message ?? t('unknownError')) } finally { setSaving(false) }
  }

  async function saveConnexions() {
    setSaving(true); setError(null)
    try {
      if (!canEditOrgConnexions) throw new Error(t('adminOnlyError'))
      if (currentOrg) {
        const { error: e } = await supabase.from('org_config').upsert({
          org_id: currentOrg.id, bearer_token: bearer, groq_api_key: groqKey,
          anthropic_api_key: anthropicKey, proxy: proxyUrl, ig_sessionid: igSession,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('app_config').upsert({
          user_id: user.id, bearer_token: bearer, groq_api_key: groqKey,
          anthropic_api_key: anthropicKey, proxy: proxyUrl, ig_sessionid: igSession,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        if (e) throw e
      }
      notifyConnectionsChanged(); setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setError(e.message ?? t('unknownError')) } finally { setSaving(false) }
  }

  async function saveProfile() {
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase.from('profiles').upsert({
        id: user.id, email: user.email ?? '', full_name: profileName,
        display_name: displayName, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (e) throw e
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setError(e.message ?? t('unknownError')) } finally { setSaving(false) }
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────
  const card = 'rounded-2xl p-5 space-y-4'
  const cardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
  const sectionTitle = 'text-[15px] font-bold text-white'
  const sectionSub   = 'text-[12px] mt-0.5 mb-4'

  function SelectRow({ label, sub, value, onChange, options, first }: {
    label: string; sub: string; value: string; first?: boolean
    onChange: (v: string) => void; options: { value: string; label: string }[]
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: first ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#F2F0FF', margin: 0 }}>{label}</p>
          <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginTop: 2, marginBottom: 0 }}>{sub}</p>
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <select value={value} onChange={e => onChange(e.target.value)} className="sf-input"
            style={{ appearance: 'none', padding: '7px 28px 7px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', minWidth: 130 }}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(148,163,184,0.4)', pointerEvents: 'none' }}>▼</span>
        </div>
      </div>
    )
  }

  function SettingToggle({ label, sub, checked, onChange, first }: {
    label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; first?: boolean
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: first ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ flex: 1, paddingRight: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#F2F0FF', margin: 0 }}>{label}</p>
          <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginTop: 2, marginBottom: 0 }}>{sub}</p>
        </div>
        <div
          className={`sf-toggle-track ${checked ? 'on' : 'off'}`}
          onClick={() => onChange(!checked)}
        >
          <span className="sf-toggle-thumb" />
        </div>
      </div>
    )
  }

  // Design tokens
  const S = {
    base: '#07070C',
    surface: '#0C0C15',
    surface2: '#111120',
    surface3: '#17172A',
    border: 'rgba(255,255,255,0.055)',
    border2: 'rgba(255,255,255,0.09)',
    borderAccent: 'rgba(139,92,246,0.22)',
    accent: '#7C3AED',
    accent2: '#8B5CF6',
    accent3: '#A78BFA',
    text: '#F2F0FF',
    text2: 'rgba(196,181,253,0.72)',
    text3: 'rgba(148,163,184,0.52)',
  }

  const cardSt = {
    background: S.surface,
    border: `1px solid ${S.border}`,
    borderRadius: 15,
    padding: '20px 24px',
    marginBottom: 0,
  }

  const cardTitleSt: CSSProperties = {
    fontSize: 13, fontWeight: 700, color: S.text, marginBottom: 4, marginTop: 0,
  }

  const cardSubSt: CSSProperties = {
    fontSize: 11, color: S.text3, marginTop: 0, marginBottom: 14,
  }

  const mainNavItems = [
    { k: 'general' as Panel,      l: t('panelGeneral') },
    { k: 'profile' as Panel,      l: t('panelProfile') },
    ...(canSeeConnexions ? [{ k: 'connexions' as Panel, l: t('panelConnexions') }] : []),
    { k: 'organization' as Panel, l: t('panelOrganization') },
    ...(license.isSuperAdmin ? [{ k: 'admin' as Panel, l: t('panelAdmin') }] : []),
    { k: 'abonnement' as Panel,   l: t('panelPlan') },
    { k: 'desktop' as Panel,      l: t('panelDesktop') },
  ]

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: S.base }}>
      <div style={{ padding: '32px 40px 28px', borderBottom: `1px solid ${S.border}` }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: S.text, margin: 0, lineHeight: 1 }}>{t('settingsTitle')}</h1>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: S.text3 }}>{t('settingsLoading')}</p>
      </div>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: S.base }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '20px 32px 18px',
        borderBottom: `1px solid ${S.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(90deg,rgba(139,92,246,0.05) 0%,transparent 60%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(139,92,246,0.06))',
            border: '1px solid rgba(139,92,246,0.28)', color: '#a78bfa',
            boxShadow: '0 0 20px -6px rgba(139,92,246,0.45)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 23, fontWeight: 900, color: S.text, margin: 0, lineHeight: 1.1, letterSpacing: '-0.025em',
              background: 'linear-gradient(135deg,#FFFFFF 0%,rgba(196,181,253,0.85) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t('settingsTitle')}</h1>
            <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('settingsSub')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#22C55E', fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {t('settingsSaved')}
            </span>
          )}
          <button
            onClick={panel === 'profile' ? saveProfile : panel === 'connexions' ? saveConnexions : save}
            disabled={saving}
            className="sf-btn sf-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: saving ? 0.6 : 1 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left sidebar — main panels */}
        <div style={{
          width: 200, flexShrink: 0, overflowY: 'auto',
          background: S.base,
          borderRight: `1px solid ${S.border}`,
          padding: '16px 10px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: S.text3, padding: '0 8px', marginBottom: 8 }}>{t('navLabel')}</p>
          {mainNavItems.map(item => {
            const active = panel === item.k
            return (
              <NavItem key={item.k} active={active} icon={NAV_ICONS[item.k]} label={item.l} onClick={() => setPanel(item.k)} S={S} />
            )
          })}

          {/* Help section */}
          <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: `1px solid ${S.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: S.text3, padding: '0 8px', marginBottom: 8 }}>{t('supportLabel')}</p>
            <button onClick={() => onNavigate?.('support')} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 10px', borderRadius: 8, fontSize: 12,
              color: S.accent3, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, width: '100%', textAlign: 'left',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {t('contactSupport')}
            </button>
          </div>
        </div>

        {/* Right content area */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* ── GÉNÉRAL panel ───────────────────────────────────────────── */}
          {panel === 'general' && (
            <>
              {/* Sub-tab bar */}
              <div style={{
                flexShrink: 0, display: 'flex', gap: 0,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                padding: '0 28px',
              }}>
                {GEN_SIDEBAR.map(item => {
                  const active = genTab === item.id
                  return (
                    <SubTabBtn key={item.id} active={active} icon={GEN_ICONS[item.id]} label={t(item.labelKey)} onClick={() => setGenTab(item.id)} S={S} />
                  )
                })}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

                {/* ── APPARENCE ─────────────────────────────────────────── */}
                {genTab === 'apparence' && (
                  <div className="sf-anim-slide-up" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('appearanceTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('appearanceSub')}</p>
                    </div>

                    {/* Color theme */}
                    <div style={cardSt}>
                      <div style={{ marginBottom: 14 }}>
                        <h3 style={cardTitleSt}>{t('colorTheme')}</h3>
                        <p style={cardSubSt}>{t('colorThemeSub')}</p>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {THEMES.map(t => (
                          <button key={t} onClick={() => { handleTheme(t); handleSwatchClick() }} style={{
                            position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                            padding: '12px 8px', borderRadius: 11, cursor: 'pointer', transition: 'all 0.15s',
                            background: theme === t ? `${THEME_COLORS[t]}18` : 'rgba(255,255,255,0.03)',
                            border: theme === t ? `1px solid ${THEME_COLORS[t]}55` : `1px solid ${S.border}`,
                          }}>
                            {theme === t && (
                              <span style={{
                                position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderRadius: '50%',
                                background: THEME_COLORS[t], display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 8, color: '#fff', fontWeight: 900,
                              }}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </span>
                            )}
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: THEME_COLORS[t] }} />
                            <span style={{ fontSize: 11, fontWeight: 500, color: S.text2 }}>{t}</span>
                          </button>
                        ))}
                      </div>
                      {pixelUnlocked && (
                        <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, color: S.text3, background: 'rgba(255,255,255,0.04)', border: `1px solid ${S.border}`, marginTop: 10 }}>
                          {t('pixelUnlocked')}
                        </div>
                      )}
                    </div>

                    {/* Toggles + dropdowns */}
                    <div style={cardSt}>
                      <SettingToggle first label={t('darkMode')} sub={t('darkModeSub')}
                        checked={darkMode} onChange={v => { setDarkMode(v); localStorage.setItem('sf-dark', v ? '1' : '0'); applyAppearanceCSS({ dark: v }) }} />
                      <SettingToggle label={t('uiAnimations')} sub={t('uiAnimationsSub')}
                        checked={animationsOn} onChange={v => { setAnimationsOn(v); localStorage.setItem('sf-animations', v ? '1' : '0'); applyAppearanceCSS({ anim: v }) }} />
                      <SettingToggle label={t('glassEffects')} sub={t('glassEffectsSub')}
                        checked={glassOn} onChange={v => { setGlassOn(v); localStorage.setItem('sf-glass', v ? '1' : '0'); applyAppearanceCSS({ glass: v }) }} />
                      <SelectRow label={t('roundedCorners')} sub={t('roundedCornersSub')}
                        value={roundedCorners} onChange={v => { setRoundedCorners(v); applyAppearanceCSS({ rounded: v }) }}
                        options={[{ value: 'aucun', label: t('roundNone') }, { value: 'petit', label: t('roundSmall') }, { value: 'moyen', label: t('roundMedium') }, { value: 'grand', label: t('roundLarge') }]} />
                      <SelectRow label={t('fontFamily')} sub={t('fontFamilySub')}
                        value={fontFamily} onChange={v => { setFontFamily(v); applyAppearanceCSS({ fontFam: v }) }}
                        options={[{ value: 'inter', label: 'Inter' }, { value: 'system', label: 'System UI' }, { value: 'mono', label: 'Monospace' }]} />
                      <SelectRow label={t('fontSize')} sub={t('fontSizeSub')}
                        value={fontSize} onChange={v => { setFontSize(v); applyAppearanceCSS({ fs: v }) }}
                        options={[{ value: 'petite', label: t('fontSizeSmall') }, { value: 'moyenne', label: t('fontSizeMedium') }, { value: 'grande', label: t('fontSizeLarge') }]} />
                      <SelectRow label={t('displayDensity')} sub={t('displayDensitySub')}
                        value={density} onChange={v => { setDensity(v); applyAppearanceCSS({ density: v }) }}
                        options={[{ value: 'compact', label: t('densityCompact') }, { value: 'confortable', label: t('densityComfortable') }, { value: 'spacieux', label: t('densitySpacious') }]} />
                      <SelectRow label={t('sidebar')} sub={t('sidebarSub')}
                        value={sidebarMode} onChange={v => { setSidebarMode(v); localStorage.setItem('sf-sidebar', v); applyAppearanceCSS({ sidebar: v }) }}
                        options={[{ value: 'etendue', label: t('sidebarExpanded') }, { value: 'reduite', label: t('sidebarReduced') }, { value: 'masquee', label: t('sidebarHidden') }]} />
                    </div>

                    {/* Preview */}
                    <div style={cardSt}>
                      <div style={{ marginBottom: 12 }}>
                        <h3 style={cardTitleSt}>{t('preview')}</h3>
                        <p style={cardSubSt}>{t('previewSub')}</p>
                      </div>
                      <div style={{ borderRadius: 11, overflow: 'hidden', background: 'rgba(0,0,0,0.3)', border: `1px solid ${S.border}`, height: 100 }}>
                        <div style={{ display: 'flex', height: '100%' }}>
                          <div style={{ width: 40, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 6, background: 'rgba(0,0,0,0.3)' }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--color-accent, #4f9eff)', opacity: 0.8 }} />
                            {[1,2,3,4].map(i => <div key={i} style={{ width: 16, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }} />)}
                          </div>
                          <div style={{ flex: 1, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, alignContent: 'start' }}>
                            {[1,2,3,4,5,6].map(i => (
                              <div key={i} style={{ height: 24, borderRadius: 6, background: i === 2 ? `var(--color-accent, #4f9eff)22` : 'rgba(255,255,255,0.06)', border: i === 2 ? `1px solid var(--color-accent, #4f9eff)40` : `1px solid ${S.border}` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SONS ──────────────────────────────────────────────── */}
                {genTab === 'sons' && (
                  <div className="sf-anim-slide-up" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('soundsTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('soundsSub')}</p>
                    </div>
                    <div style={cardSt}>
                      <SettingToggle first label={t('navSounds')} sub={t('navSoundsSub')}
                        checked={notifySound} onChange={v => setNotifySound(v)} />
                      <SettingToggle label={t('ambientMusic')} sub={t('ambientMusicSub')}
                        checked={musicOn} onChange={v => { setMusicOn(v); setMusicEnabled(v) }} />
                    </div>
                    {musicOn && (
                      <div style={cardSt}>
                        <h3 style={cardTitleSt}>{t('musicTrack')}</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                          {TRACKS.map((tr, i) => (
                            <button key={i} onClick={() => { setMusicTrackS(i); setTrack(i) }} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                              ...(musicTrack === i
                                ? { background: 'rgba(139,92,246,0.18)', border: `1px solid ${S.borderAccent}`, color: S.accent3 }
                                : { background: 'rgba(255,255,255,0.04)', border: `1px solid ${S.border}`, color: S.text3 }),
                            }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill={musicTrack === i ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                              </svg>
                              {tr.name}
                            </button>
                          ))}
                        </div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, color: S.text, margin: 0 }}>{t('volume')}</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: S.accent3, margin: 0 }}>{Math.round(musicVol * 100)}%</p>
                          </div>
                          <input type="range" min={0} max={1} step={0.05} value={musicVol}
                            onChange={e => { const v = parseFloat(e.target.value); setMusicVol(v); setVolume(v) }}
                            style={{ width: '100%', accentColor: S.accent }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── NOTIFICATIONS ─────────────────────────────────────── */}
                {genTab === 'notifications' && (
                  <div className="sf-anim-slide-up" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('notificationsTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('notificationsSub')}</p>
                    </div>
                    <div style={cardSt}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.text3, margin: '0 0 14px' }}>{t('inApp')}</h3>
                      <SettingToggle first label={t('popupNotifs')} sub={t('popupNotifsSub')}
                        checked={notifyPopup} onChange={v => setNotifyPopup(v)} />
                      <SettingToggle label={t('errorAlerts')} sub={t('errorAlertsSub')}
                        checked={notifyErrors} onChange={v => setNotifyErrors(v)} />
                      <SettingToggle label={t('updatesNotifs')} sub={t('updatesNotifsSub')}
                        checked={notifyUpdates} onChange={v => setNotifyUpdates(v)} />
                    </div>
                    <div style={cardSt}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.text3, margin: '0 0 14px' }}>{t('systemNotifs')}</h3>
                      <SettingToggle first
                        label={t('desktopNotifs')}
                        sub={t('desktopNotifsSub')}
                        checked={notifyDesktop}
                        onChange={async v => {
                          if (v && 'Notification' in window) {
                            const perm = await Notification.requestPermission()
                            setNotifyDesktop(perm === 'granted')
                          } else {
                            setNotifyDesktop(false)
                          }
                        }}
                      />
                      {notifyDesktop && (
                        <button onClick={() => new Notification('ScaleFlow', { body: lang === 'en' ? 'Desktop notifications are active' : 'Les notifications bureau sont actives', icon: '/icon.png' })}
                          style={{ marginTop: 10, fontSize: 12, color: S.accent3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                          {t('testNotif')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── LANGUE & RÉGION ────────────────────────────────────── */}
                {genTab === 'langue' && (
                  <div className="sf-anim-slide-up" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('languageTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('languageSub')}</p>
                    </div>

                    {/* Language toggle */}
                    <div style={cardSt}>
                      <div style={{ marginBottom: 16 }}>
                        <h3 style={cardTitleSt}>{t('languageLabel')}</h3>
                        <p style={cardSubSt}>{t('languageLabelSub')}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {(['fr', 'en'] as const).map(l => (
                          <button
                            key={l}
                            onClick={() => setAppLang(l)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '12px 20px', borderRadius: 11, cursor: 'pointer',
                              fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
                              background: lang === l ? `rgba(139,92,246,0.15)` : 'rgba(255,255,255,0.03)',
                              border: lang === l ? `1px solid rgba(139,92,246,0.45)` : `1px solid ${S.border}`,
                              color: lang === l ? S.accent3 : S.text3,
                            }}
                          >
                            <span style={{ fontSize: 20 }}>{l === 'fr' ? '🇫🇷' : '🇬🇧'}</span>
                            <span>{l === 'fr' ? t('langFr') : t('langEn')}</span>
                            {lang === l && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SÉCURITÉ ──────────────────────────────────────────── */}
                {genTab === 'securite' && (
                  <div className="sf-anim-slide-up" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('securityTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('securitySub')}</p>
                    </div>

                    {/* Session info */}
                    <div style={cardSt}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.text3, margin: '0 0 14px' }}>{t('activeSession')}</h3>
                      {[
                        { label: t('account'),     value: user.email ?? '—' },
                        { label: t('connectedOn'), value: user.created_at ? new Date(user.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                        { label: t('sessionId'),   value: user.id.slice(0, 8) + '…' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${S.border}` }}>
                          <span style={{ fontSize: 12, color: S.text3 }}>{row.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: S.text, fontFamily: 'ui-monospace, monospace' }}>{row.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Options */}
                    <div style={cardSt}>
                      <SettingToggle first label={t('twoFA')}
                        sub={t('twoFASub')}
                        checked={twoFA} onChange={v => setTwoFA(v)} />
                      <SelectRow label={t('autoLogout')} sub={t('autoLogoutSub')}
                        value={sessionTimeout} onChange={v => setSessionTimeout(v)}
                        options={[
                          { value: 'jamais',  label: t('never') },
                          { value: '1h',      label: t('after1h') },
                          { value: '8h',      label: t('after8h') },
                          { value: '24h',     label: t('after24h') },
                        ]} />
                    </div>

                    {/* Actions */}
                    <div style={cardSt}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.text3, margin: '0 0 14px' }}>{t('accountActions')}</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          onClick={async () => { await supabase.auth.signOut() }}
                          className="sf-btn sf-btn-danger sf-btn-sm"
                          style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                          {t('signOutBtn')}
                        </button>
                        <button
                          onClick={async () => {
                            const { error } = await supabase.auth.resetPasswordForEmail(user.email ?? '')
                            if (!error) setError(null)
                          }}
                          className="sf-btn sf-btn-ghost sf-btn-sm"
                          style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          {t('sendResetEmail')}
                        </button>
                        {/* Change password inline */}
                        {!pwChangeOpen ? (
                          <button
                            onClick={() => setPwChangeOpen(true)}
                            className="sf-btn sf-btn-secondary sf-btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            {t('changePassword')}
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <input type="password" className="sf-input" placeholder={t('newPassword')} value={newPw} onChange={e => setNewPw(e.target.value)} style={{ width: '100%' }} />
                            <input type="password" className="sf-input" placeholder={t('confirmPassword')} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={{ width: '100%' }} />
                            {pwError && <p style={{ fontSize: 12, color: '#F87171', margin: 0 }}>{pwError}</p>}
                            {pwOk && <p style={{ fontSize: 12, color: '#22c55e', margin: 0 }}>{t('passwordChanged')}</p>}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => { setPwChangeOpen(false); setNewPw(''); setConfirmPw(''); setPwError(null); setPwOk(false) }} className="sf-btn sf-btn-secondary sf-btn-sm" style={{ flex: 1 }}>{t('cancel')}</button>
                              <button onClick={async () => {
                                if (newPw.length < 6) { setPwError(t('minSixChars')); return }
                                if (newPw !== confirmPw) { setPwError(t('passwordsNoMatch')); return }
                                setPwError(null)
                                const { error } = await supabase.auth.updateUser({ password: newPw })
                                if (error) { setPwError(error.message); return }
                                setPwOk(true); setNewPw(''); setConfirmPw('')
                                setTimeout(() => { setPwChangeOpen(false); setPwOk(false) }, 2000)
                              }} className="sf-btn sf-btn-primary sf-btn-sm" style={{ flex: 1 }}>{t('confirm')}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── AVANCÉ ────────────────────────────────────────────── */}
                {genTab === 'avance' && (
                  <div className="sf-anim-slide-up" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('advancedTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('advancedSub')}</p>
                    </div>

                    <div style={cardSt}>
                      <SettingToggle first label={t('developerMode')} sub={t('developerModeSub')}
                        checked={devMode} onChange={v => setDevMode(v)} />
                    </div>

                    {devMode && (
                      <div style={{ borderRadius: 11, padding: 16, fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.7, background: 'rgba(0,0,0,0.4)', border: `1px solid ${S.border}`, color: S.text3 }}>
                        <p style={{ margin: 0 }}>user_id: {user.id}</p>
                        <p style={{ margin: 0 }}>email: {user.email}</p>
                        <p style={{ margin: 0 }}>org: {currentOrg?.id ?? 'solo'}</p>
                        <p style={{ margin: 0 }}>role: {role ?? 'n/a'}</p>
                        <p style={{ margin: 0 }}>app_version: 2.0.0</p>
                        <p style={{ margin: 0 }}>electron: {typeof window !== 'undefined' && (window as any).electronAPI ? 'oui' : 'non'}</p>
                      </div>
                    )}

                    <div style={cardSt}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.text3, margin: '0 0 14px' }}>{t('dataCache')}</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          onClick={() => {
                            const keys = Object.keys(localStorage).filter(k => k.startsWith('sf-') || k.startsWith('notify') || k === 'theme')
                            keys.forEach(k => localStorage.removeItem(k))
                            window.location.reload()
                          }}
                          className="sf-btn sf-btn-ghost sf-btn-sm"
                          style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          {t('clearCache')}
                        </button>
                        <button
                          onClick={() => {
                            const data = {
                              user: { id: user.id, email: user.email },
                              settings: Object.fromEntries(
                                Object.entries(localStorage).filter(([k]) => k.startsWith('sf-') || k.startsWith('notify') || k === 'theme')
                              ),
                              exported_at: new Date().toISOString(),
                            }
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                            const url  = URL.createObjectURL(blob)
                            const a    = document.createElement('a'); a.href = url
                            a.download = `scaleflow-settings-${new Date().toISOString().slice(0,10)}.json`
                            a.click(); URL.revokeObjectURL(url)
                          }}
                          className="sf-btn sf-btn-ghost sf-btn-sm"
                          style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          {t('exportSettings')}
                        </button>
                        {!resetConfirm ? (
                          <button onClick={() => setResetConfirm(true)}
                            className="sf-btn sf-btn-danger sf-btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            {t('resetAllSettings')}
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button onClick={() => { localStorage.clear(); window.location.reload() }}
                              className="sf-btn sf-btn-danger"
                              style={{ flex: 1 }}>
                              {t('confirmReset')}
                            </button>
                            <button onClick={() => setResetConfirm(false)}
                              className="sf-btn sf-btn-secondary sf-btn-sm">
                              {t('cancel')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: 'center', paddingTop: 8 }}>
                      <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.3)', margin: 0 }}>{t('version')}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Other panels ─────────────────────────────────────────────── */}
          {panel !== 'general' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

              {/* Profil */}
              {panel === 'profile' && (
                <div className="sf-anim-slide-up" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('profileTitle')}</h2>
                    <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('profileSub')}</p>
                  </div>

                  {/* Avatar card */}
                  <div style={{ ...cardSt, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                      fontSize: 18, fontWeight: 700, color: '#fff',
                      boxShadow: '0 0 0 3px rgba(139,92,246,0.18)',
                    }}>
                      {(displayName || profileName || user.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: S.text, margin: 0 }}>{displayName || profileName || t('user')}</p>
                      <p style={{ fontSize: 12, color: S.text3, margin: '3px 0 6px' }}>{user.email}</p>
                      <span className={`sf-badge ${role === 'owner' ? 'sf-badge-accent' : role === 'admin' ? 'sf-badge-accent' : 'sf-badge-muted'}`}>
                        {role === 'owner' ? t('owner') : role === 'admin' ? t('admin') : role === 'member' ? t('member') : t('solo')}
                      </span>
                    </div>
                  </div>

                  {/* Form */}
                  <div style={{ ...cardSt, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h3 style={cardTitleSt}>{t('personalInfo')}</h3>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.65)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
                      <input type="email" className="sf-input" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.65)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('fullName')}</label>
                      <input className="sf-input" placeholder="Jean Dupont" value={profileName} onChange={e => setProfileName(e.target.value)} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.65)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('username')}</label>
                      <input className="sf-input" placeholder="@jean" value={displayName} onChange={e => setDisplayName(e.target.value)} style={{ width: '100%' }} />
                    </div>
                  </div>

                  {/* Danger zone */}
                  <div style={{ ...cardSt, background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <h3 style={{ ...cardTitleSt, color: '#EF4444', marginBottom: 12 }}>{t('dangerZone')}</h3>
                    <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginBottom: 14, marginTop: 0 }}>{t('dangerZoneSub')}</p>
                    <button
                      onClick={async () => { await supabase.auth.signOut() }}
                      className="sf-btn sf-btn-danger sf-btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      {t('signOutBtn')}
                    </button>
                  </div>

                  {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}
                </div>
              )}

              {/* Connexions */}
              {panel === 'connexions' && canSeeConnexions && (
                <div className="sf-anim-slide-up" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('connexionsTitle')}</h2>
                    <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>{t('connexionsSub')}</p>
                  </div>

                  {/* Org/solo notice */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 11, fontSize: 12,
                    ...(currentOrg
                      ? { background: 'rgba(139,92,246,0.08)', border: `1px solid ${S.borderAccent}`, color: S.accent3 }
                      : { background: 'rgba(255,255,255,0.04)', border: `1px solid ${S.border}`, color: S.text3 }),
                  }}>
                    {currentOrg
                      ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg><span>{t('orgMode')} — <strong>{currentOrg.name}</strong>{!canEditOrgConnexions && <span style={{ color: '#F59E0B' }}> · {t('readOnly')}</span>}</span></>
                      : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg><span>{t('soloMode')}</span></>}
                  </div>

                  <div style={{ ...cardSt, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h3 style={cardTitleSt}>GéeLark</h3>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.65)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('bearerToken')}</label>
                      <input type="password" className="sf-input" placeholder="Bearer …" value={bearer} onChange={e => setBearer(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.65)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('proxyUrl')}</label>
                      <input className="sf-input" placeholder="http://proxy:8080" value={proxyUrl} onChange={e => setProxyUrl(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.65)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('igSessionId')}</label>
                      <input type="password" className="sf-input" placeholder="sessionid=…" value={igSession} onChange={e => setIgSession(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} style={{ width: '100%' }} />
                    </div>
                  </div>

                  <div style={{ ...cardSt, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h3 style={cardTitleSt}>{t('aiApiKeys')}</h3>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.65)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Groq API Key</label>
                      <input type="password" className="sf-input" placeholder="gsk_…" value={groqKey} onChange={e => setGroqKey(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.65)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Anthropic API Key</label>
                      <input type="password" className="sf-input" placeholder="sk-ant-…" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} style={{ width: '100%' }} />
                    </div>
                  </div>
                  {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}
                </div>
              )}

              {/* Organisation */}
              {panel === 'organization' && <OrganizationPanel user={user} />}

              {/* Admin */}
              {panel === 'admin' && license.isSuperAdmin && <AdminPanel user={user} />}

              {/* Abonnement */}
              {panel === 'abonnement' && <SubscriptionPanel />}

              {/* App Desktop */}
              {panel === 'desktop' && <DesktopDownloadPanel S={S} />}

              {error && panel !== 'profile' && panel !== 'connexions' && (
                <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 11, fontSize: 12, color: '#EF4444', maxWidth: 560, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Desktop download panel ───────────────────────────────────────────────────
const SUPABASE_STORAGE = 'https://fvmkmkspfksscgqyvysl.supabase.co/storage/v1/object/public/downloads'
const DL_WIN = `${SUPABASE_STORAGE}/ScaleFlow-Setup-latest.exe`
const DL_MAC = `${SUPABASE_STORAGE}/ScaleFlow-latest.dmg`

type StyleObj = { text: string; text2: string; text3: string; border: string; base: string; accent3: string }
function DesktopDownloadPanel({ S }: { S: StyleObj }) {
  const t = useT()
  const { lang } = useLang()
  const isElectron = !!(window as any).electronAPI
  return (
    <div className="sf-anim-slide-up" style={{ maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20, padding: '28px 28px 0' }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('desktopTitle')}</h2>
        <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>
          {isElectron ? t('desktopAlready') : t('desktopSub')}
        </p>
      </div>

      {/* Feature list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          ), label: t('desktopFeature1') },
          { icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          ), label: t('desktopFeature2') },
          { icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
            </svg>
          ), label: t('desktopFeature3') },
          { icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          ), label: t('desktopFeature4') },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ display: 'flex', alignItems: 'center', color: S.accent3 }}>{f.icon}</span>
            <span style={{ fontSize: 13, color: S.text2 }}>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Coming soon banner */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '24px 20px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(168,85,247,0.08))',
        border: '1px solid rgba(124,58,237,0.25)',
        textAlign: 'center',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', color: S.accent3 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </span>
        <p style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: 0 }}>
          {lang === 'en' ? 'Coming soon' : 'Prochainement'}
        </p>
        <p style={{ fontSize: 13, color: S.text3, margin: 0 }}>
          {lang === 'en'
            ? 'The desktop app is under development. Stay tuned!'
            : "L'application desktop est en cours de développement. Restez connecté !"}
        </p>
      </div>

    </div>
  )
}

// ── Admin panel (super admin only) ───────────────────────────────────────────
interface LicenseKey {
  id: string; key: string; user_id: string | null; created_at: string
  activated_at: string | null; expires_at: string | null
  is_active: boolean; plan: string; notes: string | null; user_email?: string
}

const DURATIONS = [
  { label: '7j',   days: 7 },
  { label: '30j',  days: 30 },
  { label: '90j',  days: 90 },
  { label: '1 an', days: 365 },
  { label: '∞ vie', days: null },
]

function genKey() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const s = () => Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join('')
  return `${s()}-${s()}-${s()}-${s()}`
}

function daysLeft(exp: string | null) {
  if (!exp) return '∞ vie'
  const d = Math.ceil((new Date(exp).getTime() - Date.now()) / 86_400_000)
  return d < 0 ? 'Expiré' : d === 0 ? 'Expire auj.' : `${d}j`
}

function daysColor(exp: string | null) {
  if (!exp) return 'text-purple-400'
  const d = Math.ceil((new Date(exp).getTime() - Date.now()) / 86_400_000)
  return d < 0 ? 'text-red-400' : d <= 7 ? 'text-orange-400' : 'text-green-400'
}

function AdminPanel({ user: _user }: { user: User }) {
  const t = useT()
  const [keys, setKeys]       = useState<LicenseKey[]>([])
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey]   = useState(genKey)
  const [duration, setDuration] = useState<number | null>(30)
  const [plan, setPlan]       = useState('standard')
  const [notes, setNotes]     = useState('')
  const [creating, setCreating] = useState(false)
  const [search, setSearch]   = useState('')
  const [copied, setCopied]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('license_keys').select('*').order('created_at', { ascending: false })
    if (data) {
      const ids = [...new Set(data.filter(k => k.user_id).map(k => k.user_id!))]
      let emailMap: Record<string, string> = {}
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', ids)
        profiles?.forEach(p => { emailMap[p.id] = p.email })
      }
      setKeys(data.map(k => ({ ...k, user_email: k.user_id ? emailMap[k.user_id] : undefined })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const [createErr, setCreateErr] = useState<string | null>(null)

  async function create() {
    setCreating(true)
    setCreateErr(null)
    const expires_at = duration !== null ? new Date(Date.now() + duration * 86_400_000).toISOString() : null
    const { error } = await supabase.from('license_keys').insert({ key: newKey, expires_at, plan, notes: notes || null })
    setCreating(false)
    if (error) { setCreateErr(error.message); return }
    setNewKey(genKey()); setNotes(''); load()
  }

  async function revoke(id: string) {
    await supabase.from('license_keys').update({ is_active: false }).eq('id', id); load()
  }
  async function del(id: string) {
    await supabase.from('license_keys').delete().eq('id', id); load()
  }
  function copy(k: string) {
    navigator.clipboard.writeText(k); setCopied(k); setTimeout(() => setCopied(null), 1500)
  }

  const stats = {
    total:   keys.length,
    dispo:   keys.filter(k => k.is_active && !k.user_id).length,
    actives: keys.filter(k => k.is_active && !!k.user_id).length,
    expirées: keys.filter(k => !!k.expires_at && new Date(k.expires_at) < new Date()).length,
  }

  const filtered = keys.filter(k => {
    const q = search.toLowerCase()
    return !q || k.key.toLowerCase().includes(q) || (k.user_email ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-6">
        {[
          [t('totalKeys'),   stats.total,    'text-text'],
          [t('availableKeys'), stats.dispo,  'text-green-400'],
          [t('activeKeys'),  stats.actives,  'text-blue-400'],
          [t('expiredKeys'), stats.expirées, 'text-red-400'],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <p className={`text-2xl font-black ${c}`}>{v}</p>
            <p className="text-[12px] text-text2 mt-1">{l}</p>
          </div>
        ))}
      </div>

      {/* Create key */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <p className="text-[15px] font-bold text-white mb-4">{t('createKey')}</p>
        <div className="flex gap-2">
          <input
            value={newKey}
            onChange={e => setNewKey(e.target.value.toUpperCase())}
            className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-mono tracking-widest focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
          />
          <button onClick={() => setNewKey(genKey())} className="px-4 py-2.5 rounded-xl text-[13px] text-text2 hover:text-text" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>↺</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map(d => (
            <button key={d.label} onClick={() => setDuration(d.days)}
              className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-all ${duration === d.days ? 'text-white' : 'text-text2 hover:text-text'}`}
              style={duration === d.days ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {['standard', 'pro', 'organisation'].map(p => (
            <button key={p} onClick={() => setPlan(p)}
              className={`px-4 py-2 rounded-xl text-[13px] capitalize transition-all ${plan === p ? 'text-white' : 'text-text2'}`}
              style={plan === p ? { background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.5)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {p}
            </button>
          ))}
        </div>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('keyNotes')} />
        {createErr && <p className="text-[13px] text-red-400 text-center">{createErr}</p>}
        <Button onClick={create} loading={creating} className="w-full">{t('createKeyBtn')}</Button>
      </div>

      {/* Key list */}
      <div className="space-y-3">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchKeyOrEmail')} />
        {loading ? <p className="text-[13px] text-text2 text-center py-8">{t('loading')}</p> : filtered.length === 0 ? (
          <p className="text-[13px] text-text2 text-center py-8">{t('noKeys')}</p>
        ) : filtered.map(k => (
          <div key={k.id} className={`rounded-xl px-5 py-4 flex flex-wrap items-center gap-2 ${!k.is_active ? 'opacity-50' : ''}`}
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)' }}>
            <button onClick={() => copy(k.key)} className="font-mono text-[13px] text-text tracking-widest hover:text-accent transition-colors">
              {k.key} <span className="text-[12px] text-text2">{copied === k.key ? '✓' : '⎘'}</span>
            </button>
            <span className="text-[12px] px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{k.plan}</span>
            {!k.is_active
              ? <span className="text-[12px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">{t('keyRevoked')}</span>
              : k.user_id
                ? <span className="text-[12px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{t('keyActivated')}</span>
                : <span className="text-[12px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">{t('keyAvailable')}</span>
            }
            <span className={`text-[13px] font-semibold ml-auto ${daysColor(k.expires_at)}`}>{daysLeft(k.expires_at)}</span>
            {k.user_email && <span className="text-[12px] text-text2 truncate max-w-[140px]">{k.user_email}</span>}
            {k.notes && <span className="text-[12px] text-text2 italic truncate max-w-[100px]">{k.notes}</span>}
            <div className="flex gap-1">
              {k.is_active && <button onClick={() => revoke(k.id)} className="text-[12px] px-2 py-1 rounded text-orange-400 hover:bg-orange-400/10">{t('revoke')}</button>}
              <button onClick={() => del(k.id)} className="text-[12px] px-2 py-1 rounded text-red-400 hover:bg-red-400/10">{t('delete')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Subscription panel ───────────────────────────────────────────────────────
function SubscriptionPanel() {
  const t = useT()
  const { lang } = useLang()
  const license = useLicense()
  const { balance: creditBalance, refresh: refreshCredits } = useCredits()
  const { myOrgs, currentOrg } = useOrg()
  const [licenseKey, setLicenseKey] = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)

  // Activate a new license key
  const [newKey, setNewKey]       = useState('')
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyResult, setKeyResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleActivateKey(e: React.FormEvent) {
    e.preventDefault()
    if (!newKey.trim()) return
    setKeyLoading(true); setKeyResult(null)
    const { activateKey } = await import('@/lib/license')
    const userId = (await supabase.auth.getUser()).data.user?.id
    if (!userId) { setKeyLoading(false); setKeyResult({ ok: false, text: t('notConnected') }); return }
    const res = await activateKey(newKey.trim(), userId)
    setKeyLoading(false)
    if (res.success) {
      setKeyResult({ ok: true, text: `✓ ${t('licenseSuccess')}` })
      setNewKey('')
      setLicenseKey(newKey.trim().toUpperCase())
    } else {
      setKeyResult({ ok: false, text: res.error ?? t('licenseError') })
    }
  }

  // Credit code redemption
  const [creditCode, setCreditCode]       = useState('')
  const [codeLoading, setCodeLoading]     = useState(false)
  const [codeResult, setCodeResult]       = useState<{ ok: boolean; text: string } | null>(null)
  // 'personal' = own account, otherwise an org id
  const [codeTarget, setCodeTarget]       = useState<string>(() => currentOrg?.id ?? 'personal')

  useEffect(() => {
    supabase.from('license_keys')
      .select('key, plan, expires_at')
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => { if (data) setLicenseKey(data.key) })
  }, [])

  function copy() {
    if (!licenseKey) return
    navigator.clipboard.writeText(licenseKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleRedeemCode(e: React.FormEvent) {
    e.preventDefault()
    if (!creditCode.trim()) return
    setCodeLoading(true); setCodeResult(null)
    const { redeemCreditCode, redeemCreditCodeForOrg } = await import('@/lib/credits')
    const userId = (await supabase.auth.getUser()).data.user?.id
    if (!userId) { setCodeLoading(false); setCodeResult({ ok: false, text: t('notConnected') }); return }
    const res = codeTarget !== 'personal'
      ? await redeemCreditCodeForOrg(creditCode.trim(), codeTarget)
      : await redeemCreditCode(creditCode.trim(), userId)
    setCodeLoading(false)
    if (res.ok) {
      const targetName = codeTarget !== 'personal'
        ? (myOrgs.find(o => o.org.id === codeTarget)?.org.name ?? codeTarget)
        : (lang === 'en' ? 'your account' : 'ton compte')
      setCodeResult({ ok: true, text: `✓ +${res.amount} ${t('creditsCosts')} → ${targetName} ! ${lang === 'en' ? 'Balance' : 'Solde'} : ${res.balance}` })
      setCreditCode('')
      refreshCredits()
    } else {
      setCodeResult({ ok: false, text: res.error ?? t('licenseError') })
    }
  }

  const statusColor = license.daysLeft === null ? '#22C55E'
    : license.daysLeft <= 1  ? '#EF4444'
    : license.daysLeft <= 7  ? '#F59E0B'
    : '#22C55E'

  const statusLabel = !license.valid ? t('statusInactive')
    : license.source === 'org_owner' ? t('statusViaOrg')
    : license.daysLeft === null ? t('statusLifetime')
    : license.daysLeft <= 0 ? t('statusExpired')
    : `${t('statusDaysLeft')} ${license.daysLeft} ${t('daysLeft')}`

  const planLabel   = license.plan === 'organisation' ? 'Organisation' : license.plan === 'pro' ? 'Pro' : license.plan === 'standard' ? 'Standard' : '—'
  const planCredits = license.plan === 'organisation' ? 11000 : license.plan === 'pro' ? 5500 : license.plan === 'standard' ? 2500 : 0
  const maxPhones   = license.plan === 'organisation' ? '∞' : license.plan === 'pro' ? '200' : license.plan === 'standard' ? '50' : '—'

  const locale = lang === 'en' ? 'en-US' : 'fr-FR'

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Current status */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.18)' }}>
        <p className="text-[15px] font-bold text-white mb-4">{t('mySubscription')}</p>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-text2">{t('status')}</span>
          <span className="text-[13px] font-bold" style={{ color: statusColor }}>{statusLabel}</span>
        </div>

        {license.plan && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text2">{t('plan')}</span>
            <span className="text-[13px] font-bold" style={{ color: '#a78bfa' }}>{planLabel}</span>
          </div>
        )}

        {license.expiresAt && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text2">{t('expiration')}</span>
            <span className="text-[13px] font-semibold text-text">
              {license.expiresAt.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        )}

        {licenseKey && (
          <div className="space-y-2">
            <p className="text-[12px] text-text2">{t('licenseKey')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-mono tracking-widest text-text2 truncate" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {licenseKey}
              </code>
              <button
                onClick={copy}
                className="px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all flex-shrink-0"
                style={{ background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.1)', color: copied ? '#22C55E' : '#a78bfa', border: `1px solid ${copied ? 'rgba(34,197,94,0.25)' : 'rgba(139,92,246,0.2)'}` }}
              >
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activate a license key */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.18)' }}>
        <p className="text-[15px] font-bold text-white mb-4">{t('activateLicense')}</p>
        <form onSubmit={handleActivateKey} className="flex gap-2">
          <input
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-mono tracking-widest focus:outline-none uppercase"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={keyLoading || !newKey.trim()}
            className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#6D28D9)' }}
          >{keyLoading ? '…' : t('activate')}</button>
        </form>
        {keyResult && (
          <p className={`text-[13px] ${keyResult.ok ? 'text-ok' : 'text-danger'}`}>{keyResult.text}</p>
        )}
      </div>

      {/* Credits */}
      <div className="rounded-2xl p-6 space-y-5" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.2)' }}>
        <p className="text-[15px] font-bold text-white mb-4">{t('credits')}</p>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-text2">{t('currentBalance')}</span>
          <span className="text-3xl font-black" style={{ color: creditBalance < 10 ? '#EF4444' : '#a78bfa' }}>
            {creditBalance.toLocaleString(locale)}
          </span>
        </div>

        {planCredits > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text2">{t('monthlyCreditsIncluded')} {planLabel})</span>
            <span className="text-[13px] font-semibold text-text">{planCredits.toLocaleString(locale)} {t('perMonth')}</span>
          </div>
        )}

        <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider text-text2 mb-3">{t('operationCosts')}</p>
          {[
            ['Posting', `1 ${t('creditsCost')} ${t('perPhone')}`],
            ['Mass Posting', `2 ${t('creditsCosts')} ${t('perPhone')}`],
            [lang === 'en' ? 'CloneVid' : 'CloneVid', `0.5 ${t('creditsCost')}`],
            [lang === 'en' ? 'Video Remix' : 'Remix vidéo', `0.5 ${t('creditsCost')}`],
          ].map(([op, cost]) => (
            <div key={op} className="flex justify-between">
              <span className="text-[13px] text-text2">{op}</span>
              <span className="text-[13px] text-text font-semibold">{cost}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider text-text2 mb-3">{t('geelarkPhones')}</p>
          <div className="flex justify-between">
            <span className="text-[13px] text-text2">{t('maxAllowed')}</span>
            <span className="text-[13px] font-semibold" style={{ color: maxPhones === '∞' ? '#22C55E' : '#a78bfa' }}>{maxPhones}</span>
          </div>
        </div>

        {/* Redeem code */}
        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[13px] font-semibold text-text2">{t('redeemCreditCode')}</p>
          {myOrgs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text2 shrink-0">{lang === 'en' ? 'Credit to:' : 'Créditer :'}</span>
              <select
                value={codeTarget}
                onChange={e => setCodeTarget(e.target.value)}
                className="flex-1 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
              >
                {myOrgs.map(({ org }) => (
                  <option key={org.id} value={org.id}>🏢 {org.name}</option>
                ))}
                <option value="personal">{lang === 'en' ? '👤 My account' : '👤 Mon compte'}</option>
              </select>
            </div>
          )}
          <form onSubmit={handleRedeemCode} className="flex gap-2">
            <input
              value={creditCode}
              onChange={e => { setCreditCode(e.target.value); setCodeResult(null) }}
              placeholder="CODE-XXXX"
              className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-mono focus:outline-none uppercase"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={codeLoading || !creditCode.trim()}
              className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#6D28D9)' }}
            >
              {codeLoading ? '…' : t('activate')}
            </button>
          </form>
          {codeResult && (
            <p className="text-[13px]" style={{ color: codeResult.ok ? '#22C55E' : '#EF4444' }}>{codeResult.text}</p>
          )}
        </div>
      </div>

      {/* Plan pricing */}
      <div>
        <p className="text-[15px] font-bold text-white mb-6">{t('subscriptions')}</p>
        <div className="grid grid-cols-3 gap-4">

          {/* Standard */}
          <div className="rounded-2xl p-5 space-y-4 flex flex-col" style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.2)' }}>
            <div>
              <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#60a5fa' }}>Standard</p>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-white">49,99$</span>
                <span className="text-[12px] text-text2">{t('perMonth')}</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {[
                `2 500 ${t('creditsCosts')} ${t('perMonth')}`,
                `50 ${t('perPhones')} max`,
                lang === 'en' ? 'All features' : 'Toutes les fonctionnalités',
                `Mass Posting — 10 ${lang === 'en' ? 'accounts' : 'comptes'}`,
                'Support 24/7',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="block w-full py-2.5 rounded-xl text-[12px] font-bold text-center text-white transition-all hover:brightness-110"
              style={{ background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.35)' }}>
              {t('getBtn')}
            </a>
          </div>

          {/* Pro */}
          <div className="rounded-2xl p-5 space-y-4 flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(145deg,rgba(236,72,153,0.08),rgba(124,58,237,0.08))', border: '1px solid rgba(236,72,153,0.4)' }}>
            <div className="absolute top-2.5 right-2.5 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: '#fff' }}>
              {t('popular')}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#f472b6' }}>Pro</p>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }}>🔥 -40%</span>
              </div>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-[12px] line-through" style={{ color: 'rgba(148,163,184,0.35)' }}>99,99$</span>
                <span className="text-2xl font-black text-white">59,99$</span>
                <span className="text-[12px] text-text2">{t('perMonth')}</span>
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: '#fb923c' }}>jusqu'au 1er juillet</p>
            </div>
            <ul className="space-y-1.5 flex-1">
              {[
                `5 500 ${t('creditsCosts')} ${t('perMonth')}`,
                `200 ${t('perPhones')} max`,
                lang === 'en' ? 'All features' : 'Toutes les fonctionnalités',
                `Mass Posting ${lang === 'en' ? 'unlimited' : 'illimité'}`,
                'Support 24/7',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="block w-full py-2.5 rounded-xl text-[12px] font-bold text-center text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', boxShadow: '0 2px 16px -4px rgba(236,72,153,0.4)' }}>
              {t('getBtn')}
            </a>
          </div>

          {/* Organisation */}
          <div className="rounded-2xl p-5 space-y-4 flex flex-col" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#22C55E' }}>Organisation</p>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }}>🔥 -40%</span>
              </div>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-[12px] line-through" style={{ color: 'rgba(148,163,184,0.35)' }}>149,99$</span>
                <span className="text-2xl font-black text-white">89,99$</span>
                <span className="text-[12px] text-text2">{t('perMonth')}</span>
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: '#fb923c' }}>jusqu'au 1er juillet</p>
            </div>
            <ul className="space-y-1.5 flex-1">
              {[
                `11 000 ${t('creditsCosts')} ${t('perMonth')}`,
                lang === 'en' ? 'Unlimited phones' : 'Téléphones illimités',
                lang === 'en' ? 'All features' : 'Toutes les fonctionnalités',
                `Mass Posting ${lang === 'en' ? 'unlimited' : 'illimité'}`,
                `Support 24/7 ${lang === 'en' ? 'priority' : 'prioritaire'}`,
                lang === 'en' ? 'Feature suggestions' : "Proposition d'ajouts",
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="block w-full py-2.5 rounded-xl text-[12px] font-bold text-center text-white transition-all hover:brightness-110"
              style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.35)' }}>
              {t('getBtn')}
            </a>
          </div>
        </div>

        {/* Credit packs */}
        <div className="mt-6">
          <p className="text-[13px] font-bold text-white mb-3">{t('creditPacks')}</p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { cr: '1 000',  price: '19$',  label: 'Mini Pack'  },
              { cr: '5 000',  price: '79$',  label: 'Mega Pack'  },
              { cr: '15 000', price: '179$', label: 'Giga Pack'  },
              { cr: '50 000', price: '499$', label: 'Ultra Pack' },
            ].map(pk => (
              <a key={pk.cr} href="https://t.me/justquentin" target="_blank" rel="noreferrer"
                className="rounded-xl p-3.5 text-center transition-all hover:brightness-110 no-underline"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)', textDecoration: 'none' }}>
                <div className="text-[11px] font-semibold mb-1" style={{ color: '#a78bfa' }}>{pk.label}</div>
                <div className="text-[15px] font-black text-white">{pk.cr}</div>
                <div className="text-[10px] text-text2 mb-1.5">{t('creditsCosts')}</div>
                <div className="text-[13px] font-bold" style={{ color: '#c4b5fd' }}>{pk.price}</div>
              </a>
            ))}
          </div>
        </div>

        <a
          href="https://t.me/justquentin"
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex items-center gap-3 rounded-2xl p-5 transition-all hover:scale-[1.01]"
          style={{ background: 'rgba(33,150,243,0.08)', border: '1px solid rgba(33,150,243,0.25)', textDecoration: 'none' }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: '#29b6f6' }}>
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
          </svg>
          <div>
            <p className="text-[13px] font-bold text-text">{t('orderViaTelegram')}</p>
            <p className="text-[12px] text-text2">{t('telegramSub')}</p>
          </div>
          <div className="ml-auto text-[#29b6f6] text-lg">→</div>
        </a>
      </div>
    </div>
  )
}
