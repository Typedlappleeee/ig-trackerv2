import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useT, useLang } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { OrganizationPanel } from '@/components/OrganizationPanel'
import { NotificationChannels } from '@/components/NotificationChannels'
import { useOrg } from '@/lib/orgContext'
import { canSeeTab } from '@/lib/permissions'
import { notifyConnectionsChanged, DEFAULT_GROQ_KEY } from '@/lib/connections'
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
    <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => onChange(!checked)}>
      <div
        className={`sf-toggle-track ${checked ? 'on' : 'off'} flex-shrink-0`}
        onClick={e => { e.stopPropagation(); onChange(!checked) }}
      >
        <span className="sf-toggle-thumb" />
      </div>
      <div className="flex-1">
        <p className={`text-[13px] font-medium m-0 transition-colors duration-150 ${checked ? 'text-text' : 'text-text2'}`}>{title}</p>
        <p className="text-[12px] text-text3 mt-0.5 mb-0">{sub}</p>
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
        background: active ? 'rgba(99,102,241,0.1)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        color: active ? '#F2F0FF' : hovered ? 'rgba(241,240,247,0.85)' : S.text3,
        transition: 'background 140ms ease, color 140ms ease',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        width: '100%',
      }}
    >
      {active && (
        <span style={{
          position: 'absolute', left: 0, top: 7, bottom: 7, width: 2,
          background: 'linear-gradient(180deg,#818CF8,#6366F1)',
          boxShadow: '0 0 8px rgba(99,102,241,0.7)',
          borderRadius: 2,
        }} />
      )}
      <span style={{ color: active ? S.accent3 : hovered ? 'rgba(129,140,248,0.8)' : 'currentColor', display: 'flex', alignItems: 'center', transition: 'color 140ms ease' }}>
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
        color: active ? '#F2F0FF' : hovered ? 'rgba(233,234,240,0.7)' : 'rgba(148,163,184,0.45)',
        background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid #6366F1' : '2px solid transparent',
        marginBottom: -1, cursor: 'pointer',
        transition: 'color 120ms ease, border-color 120ms ease',
        flexShrink: 0,
      }}
    >
      <span style={{ color: active ? S.accent3 : hovered ? 'rgba(129,140,248,0.7)' : 'currentColor', display: 'flex', alignItems: 'center', transition: 'color 120ms ease' }}>
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
  desktop: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
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

// ── Shared settings rows (module level — stable identity across renders) ─────
function SelectRow({ label, sub, value, onChange, options, first }: {
  label: string; sub: string; value: string; first?: boolean
  onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div className={`flex items-center justify-between py-3 px-[22px] ${first ? '' : 'border-t border-border'}`}>
      <div className="flex-1 pr-4">
        <p className="text-[13px] font-medium text-text m-0">{label}</p>
        <p className="text-[12px] text-text3 mt-0.5 mb-0">{sub}</p>
      </div>
      <div className="relative flex-shrink-0">
        <select value={value} onChange={e => onChange(e.target.value)} className="sf-input cursor-pointer"
          style={{ appearance: 'none', padding: '7px 28px 7px 10px', fontSize: 12, fontWeight: 500, minWidth: 130 }}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text3" style={{ fontSize: 9 }}>▼</span>
      </div>
    </div>
  )
}

function SettingToggle({ label, sub, checked, onChange, first }: {
  label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; first?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-3 px-[22px] cursor-pointer select-none ${first ? '' : 'border-t border-border'}`}
      onClick={() => onChange(!checked)}>
      <div className="flex-1 pr-4">
        <p className="text-[13px] font-medium text-text m-0">{label}</p>
        <p className="text-[12px] text-text3 mt-0.5 mb-0">{sub}</p>
      </div>
      <div
        className={`sf-toggle-track ${checked ? 'on' : 'off'} flex-shrink-0`}
        onClick={e => { e.stopPropagation(); onChange(!checked) }}
      >
        <span className="sf-toggle-thumb" />
      </div>
    </div>
  )
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
  const [groqKey, setGroqKey]           = useState(DEFAULT_GROQ_KEY)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [webhookMsg, setWebhookMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [webhookBusy, setWebhookBusy]   = useState(false)

  async function registerWebhook() {
    if (!bearer) { setWebhookMsg({ ok: false, text: 'Renseigne d\'abord ton token GéeLark.' }); return }
    setWebhookBusy(true); setWebhookMsg(null)
    try {
      const callbackUrl = `${window.location.origin}/api/geelark-callback`
      const r = await fetch('/api/geelark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          url: 'https://openapi.geelark.com/open/v1/callback/set',
          headers: { Authorization: `Bearer ${bearer}` },
          body: { url: callbackUrl },
        }),
      })
      const j = await r.json()
      const code = j?.data?.code ?? j?.code
      if (j.ok && (code === 0 || code === undefined)) setWebhookMsg({ ok: true, text: `Webhook activé → ${callbackUrl}` })
      else setWebhookMsg({ ok: false, text: `Échec : ${j?.data?.msg ?? j?.error ?? 'erreur inconnue'}` })
    } catch (e) {
      setWebhookMsg({ ok: false, text: `Erreur réseau : ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setWebhookBusy(false)
    }
  }

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
          setBearer(d.bearer_token ?? ''); setGroqKey(d.groq_api_key || DEFAULT_GROQ_KEY)
          setAnthropicKey(d.anthropic_api_key ?? '')
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
          anthropic_api_key: anthropicKey,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('app_config').upsert({
          user_id: user.id, bearer_token: bearer, groq_api_key: groqKey,
          anthropic_api_key: anthropicKey,
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
  const card = 'sf-card'
  const cardStyle = {}
  const sectionTitle = 'text-[11px] font-semibold uppercase tracking-widest text-text3'
  const sectionSub   = 'text-[12px] mt-1 mb-4 text-text3'

  function SelectRow({ label, sub, value, onChange, options, first }: {
    label: string; sub: string; value: string; first?: boolean
    onChange: (v: string) => void; options: { value: string; label: string }[]
  }) {
    return (
      <div className={`flex items-center justify-between py-3 px-[22px] ${first ? '' : 'border-t border-border'}`}>
        <div className="flex-1 pr-4">
          <p className="text-[13px] font-medium text-text m-0">{label}</p>
          <p className="text-[12px] text-text3 mt-0.5 mb-0">{sub}</p>
        </div>
        <div className="relative flex-shrink-0">
          <select value={value} onChange={e => onChange(e.target.value)} className="sf-input cursor-pointer"
            style={{ appearance: 'none', padding: '7px 28px 7px 10px', fontSize: 12, fontWeight: 500, minWidth: 130 }}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text3" style={{ fontSize: 9 }}>▼</span>
        </div>
      </div>
    )
  }

  function SettingToggle({ label, sub, checked, onChange, first }: {
    label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; first?: boolean
  }) {
    return (
      <div className={`flex items-center justify-between py-3 px-[22px] cursor-pointer select-none ${first ? '' : 'border-t border-border'}`}
        onClick={() => onChange(!checked)}>
        <div className="flex-1 pr-4">
          <p className="text-[13px] font-medium text-text m-0">{label}</p>
          <p className="text-[12px] text-text3 mt-0.5 mb-0">{sub}</p>
        </div>
        <div
          className={`sf-toggle-track ${checked ? 'on' : 'off'} flex-shrink-0`}
          onClick={e => { e.stopPropagation(); onChange(!checked) }}
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
    borderAccent: 'rgba(99,102,241,0.22)',
    accent: '#6366F1',
    accent2: '#6366F1',
    accent3: '#818CF8',
    text: '#F2F0FF',
    text2: 'rgba(233,234,240,0.72)',
    text3: 'rgba(148,163,184,0.52)',
  }

  const cardSt = {
    background: 'var(--color-surface, rgba(255,255,255,0.03))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.07))',
    borderRadius: 14,
    padding: '20px 22px',
    marginBottom: 0,
  }

  const cardTitleSt: CSSProperties = {
    fontSize: 11, fontWeight: 600, color: S.text3, marginBottom: 4, marginTop: 0,
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
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
    <div className="flex flex-col h-full anim-page" style={{ background: S.base }}>
      {/* Loading header — mirrors real header */}
      <div className="flex items-center gap-4 px-8 py-5 border-b border-border flex-shrink-0"
        style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.06) 0%,transparent 55%)' }}>
        <div className="sf-anim-scale-spring" style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.28)',
          color: '#6366F1',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
        <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
          <h1 className="sf-page-title" style={{ fontSize: 22, letterSpacing: '-0.03em' }}>
            {t('settingsTitle')}
          </h1>
          <p className="sf-page-sub">{user.email}</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center gap-3">
        <span className="sf-spinner" />
        <p className="text-[13px] m-0" style={{ color: S.text3 }}>{t('settingsLoading')}</p>
      </div>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="anim-page" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: S.base }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '18px 28px 16px',
        borderBottom: `1px solid ${S.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(90deg,rgba(99,102,241,0.06) 0%,transparent 55%)',
        position: 'relative',
      }}>
        {/* Subtle top-edge glow line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.35),transparent)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {/* Gear icon */}
          <div className="sf-anim-scale-spring" style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.28)',
            color: '#6366F1',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>

          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title" style={{ fontSize: 22, letterSpacing: '-0.03em' }}>{t('settingsTitle')}</h1>
            <p className="sf-page-sub">{user.email}</p>
          </div>
        </div>

        {/* Right — saved indicator + save button */}
        <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && (
            <span className="sf-badge sf-badge-ok anim-scale-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {t('settingsSaved')}
            </span>
          )}
          <button
            onClick={panel === 'profile' ? saveProfile : panel === 'connexions' ? saveConnexions : save}
            disabled={saving}
            className="sf-btn sf-btn-primary"
            style={{ gap: 7, opacity: saving ? 0.6 : 1 }}>
            {saving
              ? <span className="sf-spinner" style={{ width: 13, height: 13, borderWidth: 1.5 }} />
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>}
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left sidebar — main nav ───────────────────────────────────── */}
        <div className="sf-sidebar-nav sf-anim-slide-up sf-d150" style={{
          width: 204, flexShrink: 0, overflowY: 'auto',
          background: 'rgba(7,7,12,0.95)',
          borderRight: `1px solid ${S.border}`,
          padding: '14px 8px',
          display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: S.text3, padding: '0 10px', marginBottom: 10, marginTop: 2 }}>
            {t('navLabel')}
          </p>

          {mainNavItems.map(item => (
            <NavItem key={item.k} active={panel === item.k} icon={NAV_ICONS[item.k]} label={item.l} onClick={() => setPanel(item.k)} S={S} />
          ))}

          {/* Support link — pushed to bottom */}
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${S.border},transparent)`, marginBottom: 14 }} />
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: S.text3, padding: '0 10px', marginBottom: 8 }}>
              {t('supportLabel')}
            </p>
            <button onClick={() => onNavigate?.('support')} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 8, fontSize: 12,
              color: S.accent3, background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.12)',
              cursor: 'pointer', fontWeight: 500, width: '100%', textAlign: 'left',
              transition: 'background 140ms ease, border-color 140ms ease',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {t('contactSupport')}
            </button>
          </div>
        </div>

        {/* Right content area */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* ── GÉNÉRAL panel ───────────────────────────────────────────── */}
          {panel === 'general' && (
            <>
              {/* ── Sub-tab bar ─────────────────────────────────────────── */}
              <div className="anim-stagger" style={{
                flexShrink: 0, display: 'flex', gap: 0, alignItems: 'center',
                borderBottom: `1px solid ${S.border}`,
                padding: '0 24px',
                background: 'rgba(0,0,0,0.15)',
              }}>
                {GEN_SIDEBAR.map(item => (
                  <SubTabBtn key={item.id} active={genTab === item.id} icon={GEN_ICONS[item.id]} label={t(item.labelKey)} onClick={() => setGenTab(item.id)} S={S} />
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

                {/* ── APPARENCE ─────────────────────────────────────────── */}
                {genTab === 'apparence' && (
                  <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Section header */}
                    <div style={{ paddingBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: '-0.02em' }}>{t('appearanceTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '5px 0 0', lineHeight: 1.5 }}>{t('appearanceSub')}</p>
                    </div>

                    {/* ── Color theme card ─────────────────────────────── */}
                    <div className="sf-card" style={{ padding: '20px 22px' }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-1" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('colorTheme')}</h3>
                      <p style={{ fontSize: 12, color: S.text3, margin: '0 0 16px', lineHeight: 1.4 }}>{t('colorThemeSub')}</p>

                      <div className="anim-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {THEMES.map(th => (
                          <button key={th} onClick={() => { handleTheme(th); handleSwatchClick() }} style={{
                            position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                            padding: '14px 8px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s ease',
                            background: theme === th ? `${THEME_COLORS[th]}14` : 'rgba(255,255,255,0.03)',
                            border: theme === th ? `1px solid ${THEME_COLORS[th]}60` : `1px solid ${S.border}`,
                            boxShadow: theme === th ? `0 0 16px -4px ${THEME_COLORS[th]}50` : 'none',
                          }}>
                            {theme === th && (
                              <span className="sf-anim-scale-spring" style={{
                                position: 'absolute', top: 5, right: 5, width: 14, height: 14, borderRadius: '50%',
                                background: THEME_COLORS[th], display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </span>
                            )}
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%', background: THEME_COLORS[th],
                              boxShadow: `0 0 14px -2px ${THEME_COLORS[th]}80`,
                            }} />
                            <span style={{ fontSize: 11, fontWeight: theme === th ? 600 : 400, color: theme === th ? S.text : S.text2 }}>{th}</span>
                          </button>
                        ))}
                      </div>

                      {pixelUnlocked && (
                        <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, color: S.text3, background: 'rgba(255,255,255,0.04)', border: `1px solid ${S.border}`, marginTop: 14 }}>
                          {t('pixelUnlocked')}
                        </div>
                      )}
                    </div>

                    {/* ── Appearance toggles & selects card ───────────── */}
                    <div className="sf-card" style={{ padding: '6px 0' }}>
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

                    {/* ── UI Preview card ───────────────────────────────── */}
                    <div className="sf-card" style={{ padding: '20px 22px' }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-1" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('preview')}</h3>
                      <p style={{ fontSize: 12, color: S.text3, margin: '0 0 14px', lineHeight: 1.4 }}>{t('previewSub')}</p>
                      <div style={{ borderRadius: 10, overflow: 'hidden', background: 'rgba(0,0,0,0.35)', border: `1px solid ${S.border}`, height: 96 }}>
                        <div style={{ display: 'flex', height: '100%' }}>
                          <div style={{ width: 38, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 5, background: 'rgba(0,0,0,0.32)', borderRight: `1px solid ${S.border}` }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--color-accent, #4f9eff)', opacity: 0.85, boxShadow: '0 0 8px rgba(79,158,255,0.4)' }} />
                            {[1,2,3,4].map(i => <div key={i} style={{ width: 15, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }} />)}
                          </div>
                          <div style={{ flex: 1, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, alignContent: 'start' }}>
                            {[1,2,3,4,5,6].map(i => (
                              <div key={i} style={{ height: 22, borderRadius: 5,
                                background: i === 2 ? `rgba(var(--color-accent, 79,158,255),0.12)` : 'rgba(255,255,255,0.055)',
                                border: `1px solid ${i === 2 ? 'rgba(79,158,255,0.28)' : S.border}`,
                              }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SONS ──────────────────────────────────────────────── */}
                {genTab === 'sons' && (
                  <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ paddingBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: '-0.02em' }}>{t('soundsTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '5px 0 0', lineHeight: 1.5 }}>{t('soundsSub')}</p>
                    </div>

                    <div className="sf-card" style={{ padding: '6px 0' }}>
                      <SettingToggle first label={t('navSounds')} sub={t('navSoundsSub')}
                        checked={notifySound} onChange={v => setNotifySound(v)} />
                      <SettingToggle label={t('ambientMusic')} sub={t('ambientMusicSub')}
                        checked={musicOn} onChange={v => { setMusicOn(v); setMusicEnabled(v) }} />
                    </div>

                    {musicOn && (
                      <div className="sf-card" style={{ padding: '20px 22px' }}>
                        <h3 className="text-[11px] font-semibold uppercase mb-4" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('musicTrack')}</h3>

                        {/* Horizontal track scroll */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
                          {TRACKS.map((tr, i) => (
                            <button key={i} onClick={() => { setMusicTrackS(i); setTrack(i) }} style={{
                              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                              padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                              transition: 'all 140ms ease',
                              ...(musicTrack === i
                                ? { background: 'rgba(99,102,241,0.18)', border: `1px solid ${S.borderAccent}`, color: S.accent3, boxShadow: `0 0 14px -4px rgba(99,102,241,0.4)` }
                                : { background: 'rgba(255,255,255,0.04)', border: `1px solid ${S.border}`, color: S.text3 }),
                            }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill={musicTrack === i ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                              </svg>
                              {tr.name}
                            </button>
                          ))}
                        </div>

                        {/* Volume slider */}
                        <div style={{ paddingTop: 4, borderTop: `1px solid ${S.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingTop: 14 }}>
                            <div className="flex items-center gap-2">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: S.text3 }}>
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                              </svg>
                              <p style={{ fontSize: 13, fontWeight: 500, color: S.text, margin: 0 }}>{t('volume')}</p>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: S.accent3, background: 'rgba(99,102,241,0.1)', border: `1px solid ${S.borderAccent}`, borderRadius: 6, padding: '2px 8px' }}>
                              {Math.round(musicVol * 100)}%
                            </span>
                          </div>
                          <input type="range" min={0} max={1} step={0.05} value={musicVol}
                            onChange={e => { const v = parseFloat(e.target.value); setMusicVol(v); setVolume(v) }}
                            style={{ width: '100%', accentColor: S.accent, cursor: 'pointer' }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── NOTIFICATIONS ─────────────────────────────────────── */}
                {genTab === 'notifications' && (
                  <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ paddingBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: '-0.02em' }}>{t('notificationsTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '5px 0 0', lineHeight: 1.5 }}>{t('notificationsSub')}</p>
                    </div>

                    <div className="sf-card" style={{ padding: '16px 22px 6px' }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-3" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('inApp')}</h3>
                      <div style={{ borderTop: `1px solid ${S.border}` }}>
                        <SettingToggle first label={t('popupNotifs')} sub={t('popupNotifsSub')}
                          checked={notifyPopup} onChange={v => setNotifyPopup(v)} />
                        <SettingToggle label={t('errorAlerts')} sub={t('errorAlertsSub')}
                          checked={notifyErrors} onChange={v => setNotifyErrors(v)} />
                        <SettingToggle label={t('updatesNotifs')} sub={t('updatesNotifsSub')}
                          checked={notifyUpdates} onChange={v => setNotifyUpdates(v)} />
                      </div>
                    </div>

                    <div className="sf-card" style={{ padding: '16px 22px 6px' }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-3" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('systemNotifs')}</h3>
                      <div style={{ borderTop: `1px solid ${S.border}` }}>
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
                      </div>
                      {notifyDesktop && (
                        <div style={{ padding: '0 0 14px' }}>
                          <button
                            onClick={() => new Notification('ScaleFlow', { body: lang === 'en' ? 'Desktop notifications are active' : 'Les notifications bureau sont actives', icon: '/icon.png' })}
                            className="sf-btn sf-btn-ghost sf-btn-sm" style={{ gap: 6 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            {t('testNotif')}
                          </button>
                        </div>
                      )}
                    </div>

                    <NotificationChannels user={user} />
                  </div>
                )}

                {/* ── LANGUE & RÉGION ────────────────────────────────────── */}
                {genTab === 'langue' && (
                  <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ paddingBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: '-0.02em' }}>{t('languageTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '5px 0 0', lineHeight: 1.5 }}>{t('languageSub')}</p>
                    </div>

                    <div className="sf-card" style={{ padding: '20px 22px' }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-1" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('languageLabel')}</h3>
                      <p style={{ fontSize: 12, color: S.text3, margin: '0 0 16px', lineHeight: 1.4 }}>{t('languageLabelSub')}</p>

                      <div style={{ display: 'flex', gap: 10 }}>
                        {(['fr', 'en'] as const).map(l => (
                          <button key={l} onClick={() => setAppLang(l)} style={{
                            display: 'flex', alignItems: 'center', gap: 10, flex: 1,
                            padding: '14px 20px', borderRadius: 12, cursor: 'pointer',
                            fontSize: 14, fontWeight: 600, transition: 'all 0.15s ease',
                            background: lang === l ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                            border: lang === l ? '1px solid rgba(99,102,241,0.45)' : `1px solid ${S.border}`,
                            color: lang === l ? S.accent3 : S.text3,
                            boxShadow: lang === l ? '0 0 16px -6px rgba(99,102,241,0.4)' : 'none',
                          }}>
                            {/* Globe SVG instead of emoji flag */}
                            <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: lang === l ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                              border: `1px solid ${lang === l ? 'rgba(99,102,241,0.3)' : S.border}`, fontSize: 16 }}>
                              {l === 'fr' ? 'FR' : 'EN'}
                            </div>
                            <span style={{ fontSize: 13 }}>{l === 'fr' ? t('langFr') : t('langEn')}</span>
                            {lang === l && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
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
                  <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ paddingBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: '-0.02em' }}>{t('securityTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '5px 0 0', lineHeight: 1.5 }}>{t('securitySub')}</p>
                    </div>

                    {/* Active session info */}
                    <div className="sf-card" style={{ padding: '20px 22px' }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-4" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('activeSession')}</h3>
                      {[
                        { label: t('account'),     value: user.email ?? '—' },
                        { label: t('connectedOn'), value: user.created_at ? new Date(user.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                        { label: t('sessionId'),   value: user.id.slice(0, 8) + '…' },
                      ].map((row, idx) => (
                        <div key={row.label} className="flex items-center justify-between py-3" style={{ borderBottom: idx < 2 ? `1px solid ${S.border}` : 'none' }}>
                          <span style={{ fontSize: 12, color: S.text3 }}>{row.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: S.text, fontFamily: 'ui-monospace, monospace',
                            background: 'rgba(255,255,255,0.04)', border: `1px solid ${S.border}`, borderRadius: 6, padding: '2px 8px' }}>
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Security options */}
                    <div className="sf-card" style={{ padding: '6px 0' }}>
                      <SelectRow first label={t('autoLogout')} sub={t('autoLogoutSub')}
                        value={sessionTimeout} onChange={v => setSessionTimeout(v)}
                        options={[
                          { value: 'jamais', label: t('never') },
                          { value: '1h',     label: t('after1h') },
                          { value: '8h',     label: t('after8h') },
                          { value: '24h',    label: t('after24h') },
                        ]} />
                    </div>

                    {/* Account actions */}
                    <div className="sf-card" style={{ padding: '20px 22px' }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-4" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('accountActions')}</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button onClick={async () => { await supabase.auth.signOut() }}
                          className="sf-btn sf-btn-danger sf-btn-sm" style={{ justifyContent: 'flex-start', width: '100%' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                          {t('signOutBtn')}
                        </button>
                        <button onClick={async () => { const { error } = await supabase.auth.resetPasswordForEmail(user.email ?? ''); if (!error) setError(null) }}
                          className="sf-btn sf-btn-ghost sf-btn-sm" style={{ justifyContent: 'flex-start', width: '100%' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          {t('sendResetEmail')}
                        </button>
                        {!pwChangeOpen ? (
                          <button onClick={() => setPwChangeOpen(true)}
                            className="sf-btn sf-btn-secondary sf-btn-sm" style={{ justifyContent: 'flex-start', width: '100%' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            {t('changePassword')}
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px', borderRadius: 10, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
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
                  <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ paddingBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: '-0.02em' }}>{t('advancedTitle')}</h2>
                      <p style={{ fontSize: 13, color: S.text3, margin: '5px 0 0', lineHeight: 1.5 }}>{t('advancedSub')}</p>
                    </div>

                    <div className="sf-card" style={{ padding: '6px 0' }}>
                      <SettingToggle first label={t('developerMode')} sub={t('developerModeSub')}
                        checked={devMode} onChange={v => setDevMode(v)} />
                    </div>

                    {devMode && (
                      <div style={{ borderRadius: 10, padding: '14px 16px', fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.85,
                        background: 'rgba(0,0,0,0.45)', border: `1px solid rgba(99,102,241,0.18)`, color: S.text3,
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)' }}>
                        {[
                          ['user_id', user.id],
                          ['email', user.email],
                          ['org', currentOrg?.id ?? 'solo'],
                          ['role', role ?? 'n/a'],
                          ['app_version', '2.0.0'],
                          ['electron', typeof window !== 'undefined' && (window as any).electronAPI ? 'oui' : 'non'],
                        ].map(([k, v]) => (
                          <p key={k} style={{ margin: 0 }}>
                            <span style={{ color: S.accent3 }}>{k}</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)' }}>{': '}</span>
                            <span style={{ color: S.text }}>{v}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="sf-card" style={{ padding: '20px 22px' }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-4" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('dataCache')}</h3>
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

                    <div style={{ textAlign: 'center', paddingTop: 10 }}>
                      <p style={{ fontSize: 11, color: S.text3, margin: 0, letterSpacing: '0.04em' }}>{t('version')}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Other panels ─────────────────────────────────────────────── */}
          {panel !== 'general' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 30px' }}>

              {/* ── Profil ───────────────────────────────────────────────── */}
              {panel === 'profile' && (
                <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ paddingBottom: 4 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: '-0.02em' }}>{t('profileTitle')}</h2>
                    <p style={{ fontSize: 13, color: S.text3, margin: '5px 0 0', lineHeight: 1.5 }}>{t('profileSub')}</p>
                  </div>

                  {/* Avatar identity card */}
                  <div className="sf-card" style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 18 }}>
                    {/* Gradient avatar with initial */}
                    <div style={{
                      width: 58, height: 58, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg,#6366F1 0%,#6366F1 100%)',
                      fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em',
                      boxShadow: '0 0 0 3px rgba(99,102,241,0.2), 0 0 24px -8px rgba(99,102,241,0.6)',
                    }}>
                      {(displayName || profileName || user.email || '?').charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: '0 0 2px', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayName || profileName || t('user')}
                      </p>
                      <p style={{ fontSize: 12, color: S.text3, margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                      <span className={`sf-badge ${role === 'owner' || role === 'admin' ? 'sf-badge-accent' : 'sf-badge-muted'}`}>
                        {role === 'owner' ? t('owner') : role === 'admin' ? t('admin') : role === 'member' ? t('member') : t('solo')}
                      </span>
                    </div>
                  </div>

                  {/* Profile form */}
                  <div className="sf-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h3 className="text-[11px] font-semibold uppercase mb-1" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('personalInfo')}</h3>
                    <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {[
                        { label: 'Email', type: 'email', value: profileEmail, onChange: (v: string) => setProfileEmail(v), placeholder: 'you@example.com' },
                        { label: t('fullName'), type: 'text', value: profileName, onChange: (v: string) => setProfileName(v), placeholder: 'Jean Dupont' },
                        { label: t('username'), type: 'text', value: displayName, onChange: (v: string) => setDisplayName(v), placeholder: '@jean' },
                      ].map(field => (
                        <div key={field.label}>
                          <label className="text-[13px] font-medium text-text2" style={{ display: 'block', marginBottom: 6 }}>{field.label}</label>
                          <input type={field.type} className="sf-input" placeholder={field.placeholder} value={field.value}
                            onChange={e => field.onChange(e.target.value)} style={{ width: '100%' }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Danger zone */}
                  <div className="sf-card" style={{ padding: '20px 22px', background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.25)' }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--err)', margin: '0 0 6px', borderLeft: '2px solid var(--err)', paddingLeft: 8 }}>{t('dangerZone')}</h3>
                    <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', margin: '0 0 14px', lineHeight: 1.5 }}>{t('dangerZoneSub')}</p>
                    <button onClick={async () => { await supabase.auth.signOut() }}
                      className="sf-btn sf-btn-danger sf-btn-sm cursor-pointer">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      {t('signOutBtn')}
                    </button>
                  </div>

                  {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}
                </div>
              )}

              {/* ── Connexions ───────────────────────────────────────────── */}
              {panel === 'connexions' && canSeeConnexions && (
                <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ paddingBottom: 4 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: '-0.02em' }}>{t('connexionsTitle')}</h2>
                    <p style={{ fontSize: 13, color: S.text3, margin: '5px 0 0', lineHeight: 1.5 }}>{t('connexionsSub')}</p>
                  </div>

                  {/* Org / solo mode banner */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, fontSize: 12,
                    ...(currentOrg
                      ? { background: 'rgba(99,102,241,0.09)', border: `1px solid ${S.borderAccent}`, color: S.accent3 }
                      : { background: 'rgba(255,255,255,0.04)', border: `1px solid ${S.border}`, color: S.text3 }),
                  }}>
                    {currentOrg ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                        <span>{t('orgMode')} — <strong style={{ color: S.text }}>{currentOrg.name}</strong>
                          {!canEditOrgConnexions && <span style={{ color: '#F59E0B' }}> · {t('readOnly')}</span>}
                        </span>
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                        <span>{t('soloMode')}</span>
                      </>
                    )}
                  </div>

                  {/* GéeLark credentials */}
                  <div className="sf-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h3 className="text-[11px] font-semibold uppercase mb-1" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>GéeLark</h3>
                    <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {[
                        { label: t('bearerToken'), type: 'password', placeholder: 'Bearer …', value: bearer, onChange: (v: string) => setBearer(v) },
                      ].map(field => (
                        <div key={field.label}>
                          <label className="text-[13px] font-medium text-text2" style={{ display: 'block', marginBottom: 6 }}>{field.label}</label>
                          <input type={field.type} className="sf-input" placeholder={field.placeholder} value={field.value}
                            onChange={e => field.onChange(e.target.value)}
                            disabled={!!currentOrg && !canEditOrgConnexions} style={{ width: '100%' }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Webhooks GéeLark */}
                  {!currentOrg || canEditOrgConnexions ? (
                    <div className="sf-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <h3 className="text-[11px] font-semibold uppercase mb-1" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>Webhooks GéeLark</h3>
                      <p style={{ fontSize: 12.5, color: S.text3, lineHeight: 1.5, margin: 0 }}>
                        Quand une tâche se termine, GéeLark prévient ScaleFlow instantanément → les téléphones s'éteignent plus vite (le garde-fou serveur reste actif en secours).
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button onClick={registerWebhook} disabled={webhookBusy} className="sf-btn sf-btn-primary sf-btn-sm" style={{ opacity: webhookBusy ? 0.6 : 1 }}>
                          {webhookBusy ? 'Activation…' : 'Activer les webhooks'}
                        </button>
                        {webhookMsg && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: webhookMsg.ok ? '#34D399' : '#F87171' }}>{webhookMsg.text}</span>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* AI API Keys */}
                  <div className="sf-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h3 className="text-[11px] font-semibold uppercase mb-1" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('aiApiKeys')}</h3>
                    <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {[
                        { label: 'Groq API Key', placeholder: 'gsk_…', value: groqKey, onChange: (v: string) => setGroqKey(v) },
                        { label: 'Anthropic API Key', placeholder: 'sk-ant-…', value: anthropicKey, onChange: (v: string) => setAnthropicKey(v) },
                      ].map(field => (
                        <div key={field.label}>
                          <label className="text-[13px] font-medium text-text2" style={{ display: 'block', marginBottom: 6 }}>{field.label}</label>
                          <input type="password" className="sf-input" placeholder={field.placeholder} value={field.value}
                            onChange={e => field.onChange(e.target.value)}
                            disabled={!!currentOrg && !canEditOrgConnexions} style={{ width: '100%' }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}
                </div>
              )}

              {/* Organisation */}
              {panel === 'organization' && (
                <div className="sf-anim-slide-up" style={{ maxWidth: 720 }}>
                  <OrganizationPanel user={user} />
                </div>
              )}

              {/* Admin */}
              {panel === 'admin' && license.isSuperAdmin && (
                <div className="sf-anim-slide-up">
                  <AdminPanel user={user} />
                </div>
              )}

              {/* Abonnement */}
              {panel === 'abonnement' && (
                <div className="sf-anim-slide-up">
                  <SubscriptionPanel />
                </div>
              )}

              {/* App Desktop */}
              {panel === 'desktop' && <DesktopDownloadPanel S={S} />}

              {error && panel !== 'profile' && panel !== 'connexions' && (
                <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, fontSize: 12, color: '#EF4444', maxWidth: 540,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </div>
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
    <div className="sf-anim-slide-up anim-stagger" style={{ maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20, padding: '28px 28px 0' }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0 }}>{t('desktopTitle')}</h2>
        <p style={{ fontSize: 13, color: S.text3, margin: '4px 0 0' }}>
          {isElectron ? t('desktopAlready') : t('desktopSub')}
        </p>
      </div>

      {/* Feature list */}
      <div className="anim-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
      <div className="sf-spotlight" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '24px 20px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08))',
        border: '1px solid rgba(99,102,241,0.25)',
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
            : "L’application desktop est en cours de développement. Restez connecté !"}
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
    <div className="space-y-6 max-w-3xl anim-stagger">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-6 anim-stagger">
        {[
          [t('totalKeys'),   stats.total,    'text-text'],
          [t('availableKeys'), stats.dispo,  'text-green-400'],
          [t('activeKeys'),  stats.actives,  'text-blue-400'],
          [t('expiredKeys'), stats.expirées, 'text-red-400'],
        ].map(([l, v, c]) => (
          <div key={l as string} className="sf-card sf-card-lift p-6 text-center sf-anim-slide-up sf-d50">
            <p className={`text-2xl font-black ${c}`}>{v}</p>
            <p className="text-[12px] text-text2 mt-1">{l}</p>
          </div>
        ))}
      </div>

      {/* Create key */}
      <div className="sf-card p-6 space-y-4 sf-anim-slide-up sf-d100">
        <p className="text-[11px] font-semibold uppercase mb-4" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('createKey')}</p>
        <div className="flex gap-2">
          <input
            value={newKey}
            onChange={e => setNewKey(e.target.value.toUpperCase())}
            className="sf-input flex-1 text-[13px] font-mono tracking-widest"
          />
          <button onClick={() => setNewKey(genKey())} className="sf-btn sf-btn-ghost sf-btn-icon" title="↺">↺</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map(d => (
            <button key={d.label} onClick={() => setDuration(d.days)}
              className={`sf-btn sf-btn-sm ${duration === d.days ? 'sf-btn-primary' : 'sf-btn-secondary'}`}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {['standard', 'pro', 'organisation'].map(p => (
            <button key={p} onClick={() => setPlan(p)}
              className={`sf-btn sf-btn-sm capitalize ${plan === p ? 'sf-btn-primary' : 'sf-btn-ghost'}`}>
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
          <div key={k.id} className={`sf-card px-5 py-4 flex flex-wrap items-center gap-2 ${!k.is_active ? 'opacity-50' : ''}`}>
            <button onClick={() => copy(k.key)} className="font-mono text-[13px] text-text tracking-widest hover:text-accent transition-colors">
              {k.key} {copied === k.key
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{display:'inline',verticalAlign:'middle',color:'#22c55e'}}><path d="M20 6 9 17l-5-5"/></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{display:'inline',verticalAlign:'middle',opacity:.5}}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              }
            </button>
            <span className="sf-badge sf-badge-violet capitalize">{k.plan}</span>
            {!k.is_active
              ? <span className="sf-badge sf-badge-red">{t('keyRevoked')}</span>
              : k.user_id
                ? <span className="sf-badge sf-badge-violet">{t('keyActivated')}</span>
                : <span className="sf-badge sf-badge-green">{t('keyAvailable')}</span>
            }
            <span className={`text-[13px] font-semibold ml-auto ${daysColor(k.expires_at)}`}>{daysLeft(k.expires_at)}</span>
            {k.user_email && <span className="text-[12px] text-text2 truncate max-w-[140px]">{k.user_email}</span>}
            {k.notes && <span className="text-[12px] text-text2 italic truncate max-w-[100px]">{k.notes}</span>}
            <div className="flex gap-1">
              {k.is_active && <button onClick={() => revoke(k.id)} className="sf-btn sf-btn-ghost sf-btn-sm" style={{ color: 'var(--warn)' }}>{t('revoke')}</button>}
              <button onClick={() => del(k.id)} className="sf-btn sf-btn-danger sf-btn-sm">{t('delete')}</button>
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
    <div className="space-y-6 max-w-2xl anim-stagger">
      {/* Current status */}
      <div className="sf-card p-6 space-y-4 sf-anim-slide-up sf-d50">
        <p className="text-[11px] font-semibold uppercase mb-4" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('mySubscription')}</p>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-text2">{t('status')}</span>
          <span className={`sf-badge ${!license.valid || (license.daysLeft !== null && license.daysLeft <= 0) ? 'sf-badge-red' : 'sf-badge-green'}`} style={{ color: statusColor }}>{statusLabel}</span>
        </div>

        {license.plan && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text2">{t('plan')}</span>
            <span className="sf-badge sf-badge-violet">{planLabel}</span>
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
              <code className="sf-input flex-1 text-[13px] font-mono tracking-widest text-text2 truncate" style={{ display: 'block' }}>
                {licenseKey}
              </code>
              <button
                onClick={copy}
                className="sf-btn sf-btn-ghost flex-shrink-0"
                style={{ color: copied ? 'var(--ok)' : 'var(--accent-l)' }}
              >
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activate a license key */}
      <div className="sf-card p-6 space-y-4 sf-anim-slide-up sf-d100">
        <p className="text-[11px] font-semibold uppercase mb-4" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('activateLicense')}</p>
        <form onSubmit={handleActivateKey} className="flex gap-2">
          <input
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="sf-input flex-1 text-[13px] font-mono tracking-widest uppercase"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={keyLoading || !newKey.trim()}
            className="sf-btn sf-btn-primary"
            style={{ opacity: keyLoading || !newKey.trim() ? 0.4 : 1 }}
          >{keyLoading ? '…' : t('activate')}</button>
        </form>
        {keyResult && (
          <p className={`text-[13px] ${keyResult.ok ? 'text-ok' : 'text-danger'}`}>{keyResult.text}</p>
        )}
      </div>

      {/* Credits */}
      <div className="sf-card p-6 space-y-5 sf-anim-slide-up sf-d150" style={{ background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.2)' }}>
        <p className="text-[11px] font-semibold uppercase mb-4" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('credits')}</p>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-text2">{t('currentBalance')}</span>
          <span className="text-3xl font-black" style={{ color: creditBalance < 10 ? '#EF4444' : '#818CF8' }}>
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
            ['Posting', `2 ${t('creditsCosts')} ${t('perPhone')}`],
            ['Mass Posting', `2 ${t('creditsCosts')} ${t('perPhone')}`],
            ['Story', `1 ${t('creditsCost')} ${t('perPhone')}`],
            [lang === 'en' ? 'Video tools (Remix, Spoof…)' : 'Outils vidéo (Remix, Spoof…)', lang === 'en' ? 'Free' : 'Gratuit'],
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
            <span className="text-[13px] font-semibold" style={{ color: maxPhones === '∞' ? '#22C55E' : '#818CF8' }}>{maxPhones}</span>
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
                className="sf-input flex-1 text-[12px] cursor-pointer"
              >
                {myOrgs.map(({ org }) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
                <option value="personal">{lang === 'en' ? 'My account' : 'Mon compte'}</option>
              </select>
            </div>
          )}
          <form onSubmit={handleRedeemCode} className="flex gap-2">
            <input
              value={creditCode}
              onChange={e => { setCreditCode(e.target.value); setCodeResult(null) }}
              placeholder="CODE-XXXX"
              className="sf-input flex-1 text-[13px] font-mono uppercase"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={codeLoading || !creditCode.trim()}
              className="sf-btn sf-btn-primary"
              style={{ opacity: codeLoading || !creditCode.trim() ? 0.4 : 1 }}
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
        <p className="text-[11px] font-semibold uppercase mb-6" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('subscriptions')}</p>
        <div className="grid grid-cols-3 gap-4 anim-stagger">

          {/* Standard */}
          <div className="sf-card sf-card-lift p-5 space-y-4 flex flex-col sf-anim-slide-up sf-d50" style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' }}>
            <div>
              <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#818CF8' }}>Standard</p>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-white">49,99$</span>
                <span className="text-[12px] text-text2">{t('perMonth')}</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {[
                `3 750 ${t('creditsCosts')} ${t('perMonth')}`,
                lang === 'en' ? '≈ 25 accounts · $2.00 / account' : '≈ 25 comptes · 2,00$ / compte',
                `50 ${t('perPhones')} max`,
                lang === 'en' ? 'All features' : 'Toutes les fonctionnalités',
                `Mass Posting — 10 ${lang === 'en' ? 'accounts' : 'comptes'}`,
                'Support 24/7',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="sf-btn sf-btn-secondary w-full text-[12px] font-bold"
              style={{ justifyContent: 'center', textDecoration: 'none' }}>
              {t('getBtn')}
            </a>
          </div>

          {/* Pro */}
          <div className="sf-card sf-card-lift p-5 space-y-4 flex flex-col relative overflow-hidden sf-spotlight sf-anim-slide-up sf-d100" style={{ background: 'linear-gradient(145deg,rgba(99,102,241,0.08),rgba(99,102,241,0.08))', borderColor: 'rgba(99,102,241,0.4)', boxShadow: '0 0 28px -10px rgba(99,102,241,0.35)' }}>
            <div className="sf-badge sf-badge-violet absolute top-2.5 right-2.5 uppercase tracking-wider">
              {t('popular')}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#818CF8' }}>Pro</p>
              </div>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-white">99,99$</span>
                <span className="text-[12px] text-text2">{t('perMonth')}</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {[
                `11 250 ${t('creditsCosts')} ${t('perMonth')}`,
                lang === 'en' ? '≈ 75 accounts · $1.33 / account' : '≈ 75 comptes · 1,33$ / compte',
                `200 ${t('perPhones')} max`,
                lang === 'en' ? 'All features' : 'Toutes les fonctionnalités',
                `Mass Posting ${lang === 'en' ? 'unlimited' : 'illimité'}`,
                'Support 24/7',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="sf-btn sf-btn-primary w-full text-[12px] font-bold"
              style={{ justifyContent: 'center', textDecoration: 'none' }}>
              {t('getBtn')}
            </a>
          </div>

          {/* Organisation */}
          <div className="sf-card sf-card-lift p-5 space-y-4 flex flex-col sf-anim-slide-up sf-d150" style={{ background: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' }}>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#22C55E' }}>Organisation</p>
              </div>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-white">149,99$</span>
                <span className="text-[12px] text-text2">{t('perMonth')}</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {[
                `22 500 ${t('creditsCosts')} ${t('perMonth')}`,
                lang === 'en' ? '150 accounts · $1.00 / account' : '150 comptes · 1,00$ / compte',
                lang === 'en' ? 'Unlimited phones' : 'Téléphones illimités',
                lang === 'en' ? 'All features' : 'Toutes les fonctionnalités',
                `Mass Posting ${lang === 'en' ? 'unlimited' : 'illimité'}`,
                `Support 24/7 ${lang === 'en' ? 'priority' : 'prioritaire'}`,
                lang === 'en' ? 'Feature suggestions' : "Proposition d’ajouts",
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="sf-btn sf-btn-secondary w-full text-[12px] font-bold"
              style={{ justifyContent: 'center', textDecoration: 'none', background: 'rgba(34,197,94,0.18)', borderColor: 'rgba(34,197,94,0.35)', color: 'var(--ok)' }}>
              {t('getBtn')}
            </a>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.32)' }}>
          <span className="text-[18px] flex-shrink-0">📊</span>
          <p className="text-[12.5px] font-medium" style={{ color: 'var(--text-1)', lineHeight: 1.5 }}>
            {lang === 'en'
              ? <>Account estimate based on <strong style={{ color: '#a5b4fc' }}>standard usage: 2 posts + 1 story per day per account</strong> (≈ 150 credits/account/month — 2 cr/post, 1 cr/story). Video tools (Remix, Spoof) are free; unused credits roll over.</>
              : <>Estimation comptes basée sur une <strong style={{ color: '#a5b4fc' }}>utilisation standard : 2 posts + 1 story par jour et par compte</strong> (≈ 150 crédits/compte/mois — 2 cr/post, 1 cr/story). Les outils vidéo (Remix, Spoof) sont gratuits ; les crédits non utilisés se cumulent.</>}
          </p>
        </div>

        {/* Credit packs */}
        <div className="mt-6">
          <p className="text-[11px] font-semibold uppercase mb-3" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{t('creditPacks')}</p>
          <div className="grid grid-cols-5 gap-3 anim-stagger">
            {[
              { cr: '1 000',  price: '12,99$',  label: 'Mini Pack'  },
              { cr: '2 500',  price: '26,99$',  label: 'Plus Pack'  },
              { cr: '6 000',  price: '49,99$',  label: 'Mega Pack'  },
              { cr: '15 000', price: '104,99$', label: 'Giga Pack'  },
              { cr: '40 000', price: '209,99$', label: 'Ultra Pack' },
            ].map(pk => (
              <a key={pk.cr} href="https://t.me/justquentin" target="_blank" rel="noreferrer"
                className="sf-card sf-card-lift p-3.5 text-center no-underline"
                style={{ borderColor: 'rgba(99,102,241,0.15)', textDecoration: 'none' }}>
                <div className="text-[11px] font-semibold mb-1" style={{ color: '#818CF8' }}>{pk.label}</div>
                <div className="text-[15px] font-black text-white">{pk.cr}</div>
                <div className="text-[10px] text-text2 mb-1.5">{t('creditsCosts')}</div>
                <div className="text-[13px] font-bold" style={{ color: '#818CF8' }}>{pk.price}</div>
              </a>
            ))}
          </div>
        </div>

        <a
          href="https://t.me/justquentin"
          target="_blank"
          rel="noreferrer"
          className="sf-card sf-card-lift mt-5 flex items-center gap-3 p-5"
          style={{ background: 'rgba(33,150,243,0.08)', borderColor: 'rgba(33,150,243,0.25)', textDecoration: 'none' }}
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
