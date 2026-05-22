import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
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
  checked, onChange, title, sub, accent,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  sub: string
  accent?: boolean
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      {/* Custom toggle pill */}
      <div
        className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-all duration-200 ${
          checked ? (accent ? 'bg-accent' : 'bg-accent/80') : 'bg-surface3 border border-border'
        }`}
        onClick={() => onChange(!checked)}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
      <div className="flex-1 select-none" onClick={() => onChange(!checked)}>
        <p className={`text-[13px] font-medium transition-colors ${checked ? 'text-text' : 'text-text2'}`}>{title}</p>
        <p className="text-[12px] text-text2/70 mt-0.5">{sub}</p>
      </div>
    </label>
  )
}

type GeneralTab = 'apparence' | 'sons' | 'notifications' | 'langue' | 'securite' | 'avance'
type Panel = 'general' | 'profile' | 'connexions' | 'organization' | 'admin' | 'abonnement'
interface SettingsProps { user: User; initialPanel?: Panel; initialTab?: GeneralTab }

const GEN_SIDEBAR: { id: GeneralTab; label: string; icon: string }[] = [
  { id: 'apparence',     label: 'Apparence',       icon: '🎨' },
  { id: 'sons',          label: 'Sons',            icon: '🔊' },
  { id: 'notifications', label: 'Notifications',   icon: '🔔' },
  { id: 'langue',        label: 'Langue & région', icon: '🌐' },
  { id: 'securite',      label: 'Sécurité',        icon: '🔒' },
  { id: 'avance',        label: 'Avancé',          icon: '⚙️' },
]

export function Settings({ user, initialPanel, initialTab }: SettingsProps) {
  const { role, perms, currentOrg } = useOrg()
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
  const [lang, setLang]             = useState('fr')
  const [dateFormat, setDateFormat] = useState('dd/mm/yyyy')
  const [timezone, setTimezone]     = useState('Europe/Paris')

  // ── Sécurité ──────────────────────────────────────────────────────────────
  const [twoFA, setTwoFA]           = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState('jamais')

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
  }) {
    const radMap: Record<string,string> = { aucun: '0px', petit: '6px', moyen: '12px', grand: '20px' }
    const r = opts.rounded ?? roundedCorners
    document.documentElement.style.setProperty('--radius-settings', radMap[r] ?? '12px')
    const ffMap: Record<string,string> = { inter: "'Inter', sans-serif", system: 'system-ui, sans-serif', mono: 'ui-monospace, monospace' }
    const ff = opts.fontFam ?? fontFamily
    document.body.style.fontFamily = ffMap[ff] ?? "'Inter', sans-serif"
    const fsMap: Record<string,string> = { petite: '12px', moyenne: '14px', grande: '16px' }
    const fs = opts.fs ?? fontSize
    document.documentElement.style.setProperty('--font-size-base', fsMap[fs] ?? '14px')
    const anim = opts.anim ?? animationsOn
    if (anim) document.documentElement.classList.remove('no-animations')
    else       document.documentElement.classList.add('no-animations')
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
    setLang(ls('sf-lang', 'fr'))
    setDateFormat(ls('sf-date-format', 'dd/mm/yyyy'))
    setTimezone(ls('sf-timezone', 'Europe/Paris'))
    setDevMode(lb('sf-dev-mode', false))
    applyAppearanceCSS({ rounded: r, fontFam: ff, fs, anim: an, dark: dk })

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
      setb('sf-notify-errors', notifyErrors); set('sf-lang', lang)
      set('sf-date-format', dateFormat); set('sf-timezone', timezone)
      setb('sf-dev-mode', devMode)
      applyAppearanceCSS({})
      const { error: e } = await supabase.from('app_config').upsert({
        user_id: user.id, theme, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (e) throw e
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setError(e.message ?? 'Erreur inconnue') } finally { setSaving(false) }
  }

  async function saveConnexions() {
    setSaving(true); setError(null)
    try {
      if (!canEditOrgConnexions) throw new Error('Seuls les admins peuvent modifier les connexions.')
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
    } catch (e: any) { setError(e.message ?? 'Erreur inconnue') } finally { setSaving(false) }
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
    } catch (e: any) { setError(e.message ?? 'Erreur inconnue') } finally { setSaving(false) }
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────
  const card = 'rounded-2xl p-5 space-y-4'
  const cardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
  const sectionTitle = 'text-[15px] font-bold text-white'
  const sectionSub   = 'text-[12px] mt-0.5 mb-4'

  function SelectRow({ label, sub, value, onChange, options }: {
    label: string; sub: string; value: string
    onChange: (v: string) => void; options: { value: string; label: string }[]
  }) {
    return (
      <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div>
          <p className="text-[13px] font-medium text-text">{label}</p>
          <p className="text-[11px] text-text2 mt-0.5">{sub}</p>
        </div>
        <div className="relative flex-shrink-0">
          <select value={value} onChange={e => onChange(e.target.value)}
            className="appearance-none rounded-xl px-3 py-2 pr-7 text-[12px] font-medium focus:outline-none cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] opacity-40 pointer-events-none">▼</span>
        </div>
      </div>
    )
  }

  function SettingToggle({ label, sub, checked, onChange }: {
    label: string; sub: string; checked: boolean; onChange: (v: boolean) => void
  }) {
    return (
      <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex-1 pr-4">
          <p className="text-[13px] font-medium text-text">{label}</p>
          <p className="text-[11px] text-text2 mt-0.5">{sub}</p>
        </div>
        <button onClick={() => onChange(!checked)}
          className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-all ${checked ? 'bg-accent' : 'bg-white/10'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
    )
  }

  if (loading) return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-10 pt-9 pb-7" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h1 className="text-[28px] font-black text-white leading-none">Paramètres</h1>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[13px] text-text2">Chargement…</p>
      </div>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-7 pb-5 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-[26px] font-black text-white leading-none">Paramètres</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>Personnalise ton expérience ScaleFlow</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[13px] text-ok font-medium">✓ Sauvegardé</span>}
          <button onClick={panel === 'profile' ? saveProfile : panel === 'connexions' ? saveConnexions : save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', boxShadow: '0 4px 20px -6px rgba(124,58,237,0.5)' }}>
            <span>💾</span>
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Top tab navigation */}
      <div className="flex-shrink-0 px-8 flex gap-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {([
          { k: 'general',      l: 'Général',      icon: '⚙️' },
          { k: 'profile',      l: 'Profil',       icon: '👤' },
          ...(canSeeConnexions ? [{ k: 'connexions' as const, l: 'Connexions', icon: '🔌' }] : []),
          { k: 'organization', l: 'Organisation', icon: '🏢' },
          ...(license.isSuperAdmin ? [{ k: 'admin' as const, l: 'Admin', icon: '🛡' }] : []),
          { k: 'abonnement' as const, l: 'Abonnement', icon: '💳' },
        ] as const).map(t => (
          <button key={t.k} onClick={() => setPanel(t.k)}
            className={`flex items-center gap-1.5 px-4 py-3.5 text-[13px] font-semibold border-b-2 transition-colors -mb-px ${
              panel === t.k ? 'border-accent text-accent' : 'border-transparent text-text2 hover:text-text'
            }`}>
            <span className="text-[13px]">{t.icon}</span>
            {t.l}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Général: left sidebar + main ─────────────────────────────────── */}
        {panel === 'general' && (
          <>
            {/* Left sidebar */}
            <div className="w-[200px] flex-shrink-0 overflow-y-auto p-4 space-y-1"
              style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              {GEN_SIDEBAR.map(item => (
                <button key={item.id} onClick={() => setGenTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all ${
                    genTab === item.id ? 'text-white' : 'text-text2 hover:text-text hover:bg-white/[0.04]'
                  }`}
                  style={genTab === item.id ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa' } : {}}>
                  <span className="text-[14px]">{item.icon}</span>
                  {item.label}
                </button>
              ))}

              {/* Besoin d'aide */}
              <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[11px] font-bold text-text2 uppercase tracking-wider px-3 mb-2">Besoin d'aide ?</p>
                <p className="text-[11px] text-text2/60 px-3 mb-3 leading-relaxed">Consulte notre guide ou contacte le support, nous sommes là pour toi.</p>
                <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-accent hover:underline">
                  📄 Voir le guide
                </a>
                <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-accent hover:underline">
                  🎧 Contacter le support →
                </a>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">

              {/* ── APPARENCE ─────────────────────────────────────────────── */}
              {genTab === 'apparence' && (
                <div className="max-w-2xl space-y-6">
                  <div>
                    <h2 className={sectionTitle}>Apparence</h2>
                    <p className={sectionSub} style={{ color: 'rgba(148,163,184,0.55)' }}>Personnalise l'apparence de ton interface.</p>
                  </div>

                  {/* Thème de couleur */}
                  <div className={card} style={cardStyle}>
                    <div>
                      <h3 className="text-[14px] font-bold text-white">Thème de couleur</h3>
                      <p className="text-[11px] text-text2 mt-0.5">Cette couleur sera utilisée pour les accents et éléments interactifs.</p>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {THEMES.map(t => (
                        <button key={t} onClick={() => { handleTheme(t); handleSwatchClick() }}
                          className="relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:brightness-110"
                          style={{
                            background: theme === t ? `${THEME_COLORS[t]}15` : 'rgba(255,255,255,0.04)',
                            border: theme === t ? `1px solid ${THEME_COLORS[t]}50` : '1px solid rgba(255,255,255,0.07)',
                          }}>
                          {theme === t && (
                            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent flex items-center justify-center text-[9px] text-white font-black">✓</span>
                          )}
                          <div className="w-7 h-7 rounded-full" style={{ background: THEME_COLORS[t] }} />
                          <span className="text-[11px] font-medium text-text2">{t}</span>
                        </button>
                      ))}
                    </div>
                    {pixelUnlocked && (
                      <div className="px-3 py-2 rounded-xl text-[12px] text-text2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        🎮 Mode Pixel débloqué — clique encore 7 fois sur un thème pour activer
                      </div>
                    )}
                  </div>

                  {/* Toggles + dropdowns */}
                  <div className={card} style={cardStyle}>
                    <SettingToggle label="Mode sombre" sub="Active ou désactive le thème sombre."
                      checked={darkMode} onChange={v => setDarkMode(v)} />
                    <SettingToggle label="Animations UI" sub="Active ou désactive les animations et transitions."
                      checked={animationsOn} onChange={v => { setAnimationsOn(v); applyAppearanceCSS({ anim: v }) }} />
                    <SettingToggle label="Effets de flou (Glassmorphism)" sub="Active ou désactive les effets de flou."
                      checked={glassOn} onChange={v => setGlassOn(v)} />
                    <SelectRow label="Coins arrondis" sub="Ajuste l'arrondi des éléments de l'interface."
                      value={roundedCorners} onChange={v => { setRoundedCorners(v); applyAppearanceCSS({ rounded: v }) }}
                      options={[{ value: 'aucun', label: 'Aucun' }, { value: 'petit', label: 'Petit' }, { value: 'moyen', label: 'Moyen' }, { value: 'grand', label: 'Grand' }]} />
                    <SelectRow label="Police d'interface" sub="Choisis la police utilisée dans l'interface."
                      value={fontFamily} onChange={v => { setFontFamily(v); applyAppearanceCSS({ fontFam: v }) }}
                      options={[{ value: 'inter', label: 'Inter' }, { value: 'system', label: 'System UI' }, { value: 'mono', label: 'Monospace' }]} />
                    <SelectRow label="Taille de la police" sub="Ajuste la taille du texte global."
                      value={fontSize} onChange={v => { setFontSize(v); applyAppearanceCSS({ fs: v }) }}
                      options={[{ value: 'petite', label: 'Petite' }, { value: 'moyenne', label: 'Moyenne' }, { value: 'grande', label: 'Grande' }]} />
                    <SelectRow label="Densité d'affichage" sub="Choisis la densité des éléments à l'écran."
                      value={density} onChange={v => setDensity(v)}
                      options={[{ value: 'compact', label: 'Compact' }, { value: 'confortable', label: 'Confortable' }, { value: 'spacieux', label: 'Spacieux' }]} />
                    <SelectRow label="Barre latérale" sub="Affiche ou masque la barre latérale."
                      value={sidebarMode} onChange={v => setSidebarMode(v)}
                      options={[{ value: 'etendue', label: 'Étendue' }, { value: 'reduite', label: 'Réduite' }, { value: 'masquee', label: 'Masquée' }]} />
                  </div>

                  {/* Aperçu */}
                  <div className={card} style={cardStyle}>
                    <div>
                      <h3 className="text-[14px] font-bold text-white">Aperçu</h3>
                      <p className="text-[11px] text-text2 mt-0.5">Voici un aperçu de ton interface avec ces paramètres.</p>
                    </div>
                    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', height: '100px' }}>
                      <div className="flex h-full">
                        <div className="w-10 h-full flex flex-col items-center pt-2 gap-1.5" style={{ background: 'rgba(0,0,0,0.3)' }}>
                          <div className="w-5 h-5 rounded" style={{ background: 'var(--color-accent, #4f9eff)', opacity: 0.8 }} />
                          {[1,2,3,4].map(i => <div key={i} className="w-4 h-1.5 rounded-sm" style={{ background: 'rgba(255,255,255,0.1)' }} />)}
                        </div>
                        <div className="flex-1 p-2 grid grid-cols-3 gap-1.5 content-start">
                          {[1,2,3,4,5,6].map(i => (
                            <div key={i} className="h-6 rounded" style={{ background: i === 2 ? `var(--color-accent, #4f9eff)22` : 'rgba(255,255,255,0.06)', border: i === 2 ? `1px solid var(--color-accent, #4f9eff)40` : '1px solid rgba(255,255,255,0.06)' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SONS ──────────────────────────────────────────────────── */}
              {genTab === 'sons' && (
                <div className="max-w-2xl space-y-6">
                  <div>
                    <h2 className={sectionTitle}>Sons</h2>
                    <p className={sectionSub} style={{ color: 'rgba(148,163,184,0.55)' }}>Gère les sons et la musique d'ambiance de l'application.</p>
                  </div>
                  <div className={card} style={cardStyle}>
                    <SettingToggle label="Sons de navigation" sub="Joue un son lors des changements de page."
                      checked={notifySound} onChange={v => setNotifySound(v)} />
                    <SettingToggle label="Musique d'ambiance" sub="Joue une musique en fond lors de l'utilisation de l'app."
                      checked={musicOn} onChange={v => { setMusicOn(v); setMusicEnabled(v) }} />
                  </div>
                  {musicOn && (
                    <div className={card} style={cardStyle}>
                      <h3 className="text-[13px] font-bold text-white">Piste musicale</h3>
                      <div className="flex flex-wrap gap-2">
                        {TRACKS.map((tr, i) => (
                          <button key={i} onClick={() => { setMusicTrackS(i); setTrack(i) }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all"
                            style={musicTrack === i ? { background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.7)' }}>
                            <span>{musicTrack === i ? '▶' : '▷'}</span> {tr.name}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-2 pt-2">
                        <div className="flex justify-between">
                          <p className="text-[13px] font-medium text-text">Volume</p>
                          <p className="text-[13px] font-bold text-accent">{Math.round(musicVol * 100)}%</p>
                        </div>
                        <input type="range" min={0} max={1} step={0.05} value={musicVol}
                          onChange={e => { const v = parseFloat(e.target.value); setMusicVol(v); setVolume(v) }}
                          className="w-full accent-accent" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── NOTIFICATIONS ─────────────────────────────────────────── */}
              {genTab === 'notifications' && (
                <div className="max-w-2xl space-y-6">
                  <div>
                    <h2 className={sectionTitle}>Notifications</h2>
                    <p className={sectionSub} style={{ color: 'rgba(148,163,184,0.55)' }}>Choisis comment et quand tu souhaites être notifié.</p>
                  </div>
                  <div className={card} style={cardStyle}>
                    <h3 className="text-[13px] font-bold text-white pb-1">In-app</h3>
                    <SettingToggle label="Notifications popup" sub="Affiche une notification en haut à droite lors d'actions importantes."
                      checked={notifyPopup} onChange={v => setNotifyPopup(v)} />
                    <SettingToggle label="Alertes d'erreurs" sub="Affiche les erreurs critiques de manière visible."
                      checked={notifyErrors} onChange={v => setNotifyErrors(v)} />
                    <SettingToggle label="Mises à jour & nouveautés" sub="Informe lors des nouvelles versions ou fonctionnalités."
                      checked={notifyUpdates} onChange={v => setNotifyUpdates(v)} />
                  </div>
                  <div className={card} style={cardStyle}>
                    <h3 className="text-[13px] font-bold text-white pb-1">Système</h3>
                    <SettingToggle
                      label="Notifications bureau"
                      sub="Envoie des notifications natives du système d'exploitation."
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
                      <button onClick={() => new Notification('ScaleFlow', { body: 'Les notifications bureau sont actives ✓', icon: '/icon.png' })}
                        className="text-[12px] text-accent hover:underline">
                        Tester une notification →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── LANGUE & RÉGION ────────────────────────────────────────── */}
              {genTab === 'langue' && (
                <div className="max-w-2xl space-y-6">
                  <div>
                    <h2 className={sectionTitle}>Langue & région</h2>
                    <p className={sectionSub} style={{ color: 'rgba(148,163,184,0.55)' }}>Personnalise la langue et les paramètres régionaux.</p>
                  </div>
                  <div className={card} style={cardStyle}>
                    <SelectRow label="Langue de l'interface" sub="La langue utilisée dans toute l'application."
                      value={lang} onChange={v => setLang(v)}
                      options={[{ value: 'fr', label: '🇫🇷 Français' }, { value: 'en', label: '🇬🇧 English' }]} />
                    <SelectRow label="Format de date" sub="Comment les dates sont affichées dans l'interface."
                      value={dateFormat} onChange={v => setDateFormat(v)}
                      options={[{ value: 'dd/mm/yyyy', label: 'JJ/MM/AAAA' }, { value: 'mm/dd/yyyy', label: 'MM/JJ/AAAA' }, { value: 'yyyy-mm-dd', label: 'AAAA-MM-JJ' }]} />
                    <SelectRow label="Fuseau horaire" sub="Utilisé pour afficher les dates et heures locales."
                      value={timezone} onChange={v => setTimezone(v)}
                      options={[
                        { value: 'Europe/Paris',    label: 'Paris (UTC+1/+2)' },
                        { value: 'Europe/London',   label: 'Londres (UTC+0/+1)' },
                        { value: 'America/New_York',label: 'New York (UTC-5/-4)' },
                        { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8/-7)' },
                        { value: 'Asia/Dubai',      label: 'Dubaï (UTC+4)' },
                        { value: 'UTC',             label: 'UTC' },
                      ]} />
                  </div>
                  <div className="px-4 py-3 rounded-xl text-[12px] text-text2 flex items-start gap-2"
                    style={{ background: 'rgba(255,170,42,0.07)', border: '1px solid rgba(255,170,42,0.2)' }}>
                    <span className="text-warn text-[14px] flex-shrink-0">ℹ</span>
                    Certains paramètres régionaux nécessitent un rechargement de l'application pour prendre effet.
                  </div>
                </div>
              )}

              {/* ── SÉCURITÉ ──────────────────────────────────────────────── */}
              {genTab === 'securite' && (
                <div className="max-w-2xl space-y-6">
                  <div>
                    <h2 className={sectionTitle}>Sécurité</h2>
                    <p className={sectionSub} style={{ color: 'rgba(148,163,184,0.55)' }}>Gère la sécurité et l'accès à ton compte.</p>
                  </div>

                  {/* Session info */}
                  <div className={card} style={cardStyle}>
                    <h3 className="text-[13px] font-bold text-white">Session active</h3>
                    <div className="space-y-2">
                      {[
                        { label: 'Compte',       value: user.email ?? '—' },
                        { label: 'Connecté le',  value: user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                        { label: 'ID session',   value: user.id.slice(0, 8) + '…' },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span className="text-[12px] text-text2">{row.label}</span>
                          <span className="text-[12px] font-medium text-text font-mono">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Options */}
                  <div className={card} style={cardStyle}>
                    <SettingToggle label="Authentification à deux facteurs (2FA)"
                      sub="Ajoute une couche de sécurité supplémentaire à ton compte."
                      checked={twoFA} onChange={v => setTwoFA(v)} />
                    <SelectRow label="Déconnexion automatique" sub="Se déconnecte automatiquement après une période d'inactivité."
                      value={sessionTimeout} onChange={v => setSessionTimeout(v)}
                      options={[
                        { value: 'jamais',  label: 'Jamais' },
                        { value: '1h',      label: 'Après 1 heure' },
                        { value: '8h',      label: 'Après 8 heures' },
                        { value: '24h',     label: 'Après 24 heures' },
                      ]} />
                  </div>

                  {/* Actions */}
                  <div className={card} style={cardStyle}>
                    <h3 className="text-[13px] font-bold text-white pb-1">Actions de compte</h3>
                    <div className="space-y-2">
                      <button
                        onClick={async () => { await supabase.auth.signOut() }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all hover:bg-white/[0.06]"
                        style={{ color: 'rgba(148,163,184,0.8)' }}>
                        <span>🔒</span> Déconnexion
                      </button>
                      <button
                        onClick={async () => {
                          const { error } = await supabase.auth.resetPasswordForEmail(user.email ?? '')
                          if (!error) setError(null)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all hover:bg-white/[0.06]"
                        style={{ color: 'rgba(148,163,184,0.8)' }}>
                        <span>🔑</span> Envoyer un email de réinitialisation de mot de passe
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── AVANCÉ ────────────────────────────────────────────────── */}
              {genTab === 'avance' && (
                <div className="max-w-2xl space-y-6">
                  <div>
                    <h2 className={sectionTitle}>Avancé</h2>
                    <p className={sectionSub} style={{ color: 'rgba(148,163,184,0.55)' }}>Options avancées pour les utilisateurs expérimentés.</p>
                  </div>

                  <div className={card} style={cardStyle}>
                    <SettingToggle label="Mode développeur" sub="Affiche des informations de débogage supplémentaires dans l'interface."
                      checked={devMode} onChange={v => setDevMode(v)} />
                  </div>

                  {devMode && (
                    <div className="rounded-xl p-4 space-y-1 font-mono text-[11px]"
                      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.6)' }}>
                      <p>user_id: {user.id}</p>
                      <p>email: {user.email}</p>
                      <p>org: {currentOrg?.id ?? 'solo'}</p>
                      <p>role: {role ?? 'n/a'}</p>
                      <p>app_version: 2.0.0</p>
                      <p>electron: {typeof window !== 'undefined' && (window as any).electronAPI ? 'oui' : 'non'}</p>
                    </div>
                  )}

                  <div className={card} style={cardStyle}>
                    <h3 className="text-[13px] font-bold text-white pb-1">Données & cache</h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          const keys = Object.keys(localStorage).filter(k => k.startsWith('sf-') || k.startsWith('notify') || k === 'theme')
                          keys.forEach(k => localStorage.removeItem(k))
                          window.location.reload()
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all hover:bg-white/[0.06]"
                        style={{ color: 'rgba(148,163,184,0.8)' }}>
                        <span>🗑</span> Vider le cache local
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
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all hover:bg-white/[0.06]"
                        style={{ color: 'rgba(148,163,184,0.8)' }}>
                        <span>📥</span> Exporter mes paramètres (JSON)
                      </button>
                      {!resetConfirm ? (
                        <button onClick={() => setResetConfirm(true)}
                          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all hover:bg-danger/10 text-danger">
                          <span>⚠️</span> Réinitialiser tous les paramètres
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => {
                            localStorage.clear(); window.location.reload()
                          }}
                            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white text-center"
                            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}>
                            Confirmer la réinitialisation
                          </button>
                          <button onClick={() => setResetConfirm(false)}
                            className="px-4 py-2.5 rounded-xl text-[13px] text-text2 hover:text-text"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            Annuler
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-center pt-2">
                    <p className="text-[11px] text-text2/40">ScaleFlow v2.0.0 · Electron · React · Supabase</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Autres panels (scrollable) ──────────────────────────────────── */}
        {panel !== 'general' && (
          <div className="flex-1 overflow-y-auto px-8 py-6">

            {/* Profil */}
            {panel === 'profile' && (
              <div className="max-w-xl space-y-5">
                <div>
                  <h2 className={sectionTitle}>Profil</h2>
                  <p className="text-[12px] mt-0.5 mb-4" style={{ color: 'rgba(148,163,184,0.55)' }}>Informations de ton compte ScaleFlow.</p>
                </div>
                {/* Avatar placeholder */}
                <div className="flex items-center gap-4 p-5 rounded-2xl" style={cardStyle}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[22px] font-black flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }}>
                    {(displayName || profileName || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-white">{displayName || profileName || 'Utilisateur'}</p>
                    <p className="text-[12px] text-text2">{user.email}</p>
                  </div>
                </div>
                <div className={`${card} !space-y-4`} style={cardStyle}>
                  <Input label="Email" type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
                  <Input label="Nom complet" placeholder="Jean Dupont" value={profileName} onChange={e => setProfileName(e.target.value)} />
                  <Input label="Pseudo (visible par l'équipe)" placeholder="@jean" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                </div>
                {error && <p className="text-[12px] text-danger">{error}</p>}
              </div>
            )}

            {/* Connexions */}
            {panel === 'connexions' && canSeeConnexions && (
              <div className="max-w-xl space-y-5">
                <div>
                  <h2 className={sectionTitle}>Connexions</h2>
                  <p className="text-[12px] mt-0.5 mb-4" style={{ color: 'rgba(148,163,184,0.55)' }}>Clés API et tokens de connexion aux services externes.</p>
                </div>
                <div className="px-4 py-3 rounded-xl text-[12px] flex items-center gap-2"
                  style={currentOrg ? { background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.7)' }}>
                  {currentOrg ? <><span>🏢</span><span>Organisation — <strong>{currentOrg.name}</strong>{!canEditOrgConnexions && <span className="text-warn"> · Lecture seule</span>}</span></> : <><span>👤</span><span>Mode solo — ces clés sont privées à ton compte</span></>}
                </div>
                <div className={`${card} !space-y-4`} style={cardStyle}>
                  <h3 className="text-[13px] font-bold text-white">GéeLark</h3>
                  <Input label="Bearer Token" type="password" placeholder="Bearer …" value={bearer} onChange={e => setBearer(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
                  <Input label="URL Proxy (optionnel)" placeholder="http://proxy:8080" value={proxyUrl} onChange={e => setProxyUrl(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
                  <Input label="Session ID Instagram" type="password" placeholder="sessionid=…" value={igSession} onChange={e => setIgSession(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
                </div>
                <div className={`${card} !space-y-4`} style={cardStyle}>
                  <h3 className="text-[13px] font-bold text-white">Clés API IA</h3>
                  <Input label="Groq API Key" type="password" placeholder="gsk_…" value={groqKey} onChange={e => setGroqKey(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
                  <Input label="Anthropic API Key" type="password" placeholder="sk-ant-…" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
                </div>
                {error && <p className="text-[12px] text-danger">{error}</p>}
              </div>
            )}

            {/* Organisation */}
            {panel === 'organization' && <OrganizationPanel user={user} />}

            {/* Admin */}
            {panel === 'admin' && license.isSuperAdmin && <AdminPanel user={user} />}

            {/* Abonnement */}
            {panel === 'abonnement' && <SubscriptionPanel />}

            {error && panel !== 'profile' && panel !== 'connexions' && (
              <div className="mt-4 px-4 py-3 rounded-xl text-[12px] text-danger max-w-xl"
                style={{ background: 'rgba(255,92,110,0.08)', border: '1px solid rgba(255,92,110,0.2)' }}>{error}</div>
            )}
          </div>
        )}
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
  return d < 0 ? 'Expiré' : d === 0 ? "Expire auj." : `${d}j`
}

function daysColor(exp: string | null) {
  if (!exp) return 'text-purple-400'
  const d = Math.ceil((new Date(exp).getTime() - Date.now()) / 86_400_000)
  return d < 0 ? 'text-red-400' : d <= 7 ? 'text-orange-400' : 'text-green-400'
}

function AdminPanel({ user: _user }: { user: User }) {
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
          ['Total', stats.total, 'text-text'],
          ['Dispo', stats.dispo, 'text-green-400'],
          ['Actives', stats.actives, 'text-blue-400'],
          ['Expirées', stats.expirées, 'text-red-400'],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <p className={`text-2xl font-black ${c}`}>{v}</p>
            <p className="text-[12px] text-text2 mt-1">{l}</p>
          </div>
        ))}
      </div>

      {/* Créer */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <p className="text-[15px] font-bold text-white mb-4">Créer une clé</p>
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
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (ex: Discord @pseudo)" />
        {createErr && <p className="text-[13px] text-red-400 text-center">{createErr}</p>}
        <Button onClick={create} loading={creating} className="w-full">+ Créer la clé</Button>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher clé ou email…" />
        {loading ? <p className="text-[13px] text-text2 text-center py-8">Chargement…</p> : filtered.length === 0 ? (
          <p className="text-[13px] text-text2 text-center py-8">Aucune clé</p>
        ) : filtered.map(k => (
          <div key={k.id} className={`rounded-xl px-5 py-4 flex flex-wrap items-center gap-2 ${!k.is_active ? 'opacity-50' : ''}`}
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)' }}>
            <button onClick={() => copy(k.key)} className="font-mono text-[13px] text-text tracking-widest hover:text-accent transition-colors">
              {k.key} <span className="text-[12px] text-text2">{copied === k.key ? '✓' : '⎘'}</span>
            </button>
            <span className="text-[12px] px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{k.plan}</span>
            {!k.is_active
              ? <span className="text-[12px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Révoquée</span>
              : k.user_id
                ? <span className="text-[12px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Activée</span>
                : <span className="text-[12px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">Dispo</span>
            }
            <span className={`text-[13px] font-semibold ml-auto ${daysColor(k.expires_at)}`}>{daysLeft(k.expires_at)}</span>
            {k.user_email && <span className="text-[12px] text-text2 truncate max-w-[140px]">{k.user_email}</span>}
            {k.notes && <span className="text-[12px] text-text2 italic truncate max-w-[100px]">{k.notes}</span>}
            <div className="flex gap-1">
              {k.is_active && <button onClick={() => revoke(k.id)} className="text-[12px] px-2 py-1 rounded text-orange-400 hover:bg-orange-400/10">Révoquer</button>}
              <button onClick={() => del(k.id)} className="text-[12px] px-2 py-1 rounded text-red-400 hover:bg-red-400/10">Suppr.</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Subscription panel ───────────────────────────────────────────────────────
function SubscriptionPanel() {
  const license = useLicense()
  const { balance: creditBalance, refresh: refreshCredits } = useCredits()
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
    if (!userId) { setKeyLoading(false); setKeyResult({ ok: false, text: 'Non connecté' }); return }
    const res = await activateKey(newKey.trim(), userId)
    setKeyLoading(false)
    if (res.success) {
      setKeyResult({ ok: true, text: '✓ Clé activée avec succès !' })
      setNewKey('')
      setLicenseKey(newKey.trim().toUpperCase())
    } else {
      setKeyResult({ ok: false, text: res.error ?? 'Clé invalide' })
    }
  }

  // Credit code redemption
  const [creditCode, setCreditCode]       = useState('')
  const [codeLoading, setCodeLoading]     = useState(false)
  const [codeResult, setCodeResult]       = useState<{ ok: boolean; text: string } | null>(null)

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
    const { redeemCreditCode } = await import('@/lib/credits')
    const userId = (await supabase.auth.getUser()).data.user?.id
    if (!userId) { setCodeLoading(false); setCodeResult({ ok: false, text: 'Non connecté' }); return }
    const res = await redeemCreditCode(creditCode.trim(), userId)
    setCodeLoading(false)
    if (res.ok) {
      setCodeResult({ ok: true, text: `✓ +${res.amount} crédits ajoutés ! Nouveau solde : ${res.balance}` })
      setCreditCode('')
      refreshCredits()
    } else {
      setCodeResult({ ok: false, text: res.error ?? 'Code invalide' })
    }
  }

  const statusColor = license.daysLeft === null ? '#34d399'
    : license.daysLeft <= 1  ? '#f87171'
    : license.daysLeft <= 7  ? '#fb923c'
    : '#34d399'

  const statusLabel = !license.valid ? 'Inactif'
    : license.source === 'org_owner' ? 'Via organisation'
    : license.daysLeft === null ? 'Actif — à vie'
    : license.daysLeft <= 0 ? 'Expiré'
    : `Actif — ${license.daysLeft}j restants`

  const planLabel   = license.plan === 'organisation' ? 'Organisation' : license.plan === 'pro' ? 'Pro' : license.plan === 'standard' ? 'Standard' : '—'
  const planCredits = license.plan === 'organisation' ? 11000 : license.plan === 'pro' ? 5500 : license.plan === 'standard' ? 2500 : 0
  const maxPhones   = license.plan === 'organisation' ? '∞' : license.plan === 'pro' ? '200' : license.plan === 'standard' ? '50' : '—'

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Current status */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.18)' }}>
        <p className="text-[15px] font-bold text-white mb-4">Mon abonnement actuel</p>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-text2">Statut</span>
          <span className="text-[13px] font-bold" style={{ color: statusColor }}>{statusLabel}</span>
        </div>

        {license.plan && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text2">Plan</span>
            <span className="text-[13px] font-bold" style={{ color: '#a78bfa' }}>{planLabel}</span>
          </div>
        )}

        {license.expiresAt && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text2">Expiration</span>
            <span className="text-[13px] font-semibold text-text">
              {license.expiresAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        )}

        {licenseKey && (
          <div className="space-y-2">
            <p className="text-[12px] text-text2">Clé de licence</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-mono tracking-widest text-text2 truncate" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {licenseKey}
              </code>
              <button
                onClick={copy}
                className="px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all flex-shrink-0"
                style={{ background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(139,92,246,0.1)', color: copied ? '#34d399' : '#a78bfa', border: `1px solid ${copied ? 'rgba(52,211,153,0.25)' : 'rgba(139,92,246,0.2)'}` }}
              >
                {copied ? '✓ Copié' : 'Copier'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activate a license key */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.18)' }}>
        <p className="text-[15px] font-bold text-white mb-4">🔑 Activer une clé</p>
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
            style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
          >{keyLoading ? '…' : 'Activer'}</button>
        </form>
        {keyResult && (
          <p className={`text-[13px] ${keyResult.ok ? 'text-ok' : 'text-danger'}`}>{keyResult.text}</p>
        )}
      </div>

      {/* Credits */}
      <div className="rounded-2xl p-6 space-y-5" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.2)' }}>
        <p className="text-[15px] font-bold text-white mb-4">💎 Crédits</p>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-text2">Solde actuel</span>
          <span className="text-3xl font-black" style={{ color: creditBalance < 10 ? '#f87171' : '#a78bfa' }}>
            {creditBalance.toLocaleString('fr-FR')}
          </span>
        </div>

        {planCredits > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text2">Crédits mensuels inclus (plan {planLabel})</span>
            <span className="text-[13px] font-semibold text-text">{planCredits.toLocaleString('fr-FR')} / mois</span>
          </div>
        )}

        <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider text-text2 mb-3">Coût des opérations</p>
          <div className="flex justify-between"><span className="text-[13px] text-text2">🚀 Posting</span><span className="text-[13px] text-text font-semibold">1 crédit / tél.</span></div>
          <div className="flex justify-between"><span className="text-[13px] text-text2">⚡ Mass Posting</span><span className="text-[13px] text-text font-semibold">2 crédits / tél.</span></div>
          <div className="flex justify-between"><span className="text-[13px] text-text2">✂ Montage vidéo</span><span className="text-[13px] text-text font-semibold">1 crédit</span></div>
          <div className="flex justify-between"><span className="text-[13px] text-text2">🔀 Remix vidéo</span><span className="text-[13px] text-text font-semibold">2 crédits</span></div>
        </div>

        <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider text-text2 mb-3">Téléphones GéeLark</p>
          <div className="flex justify-between">
            <span className="text-[13px] text-text2">Maximum autorisé</span>
            <span className="text-[13px] font-semibold" style={{ color: maxPhones === '∞' ? '#34d399' : '#a78bfa' }}>{maxPhones}</span>
          </div>
        </div>

        {/* Redeem code */}
        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[13px] font-semibold text-text2">Activer un code crédit</p>
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
              style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
            >
              {codeLoading ? '…' : 'Activer'}
            </button>
          </form>
          {codeResult && (
            <p className="text-[13px]" style={{ color: codeResult.ok ? '#34d399' : '#f87171' }}>{codeResult.text}</p>
          )}
        </div>
      </div>

      {/* Plan pricing */}
      <div>
        <p className="text-[15px] font-bold text-white mb-6">Abonnements</p>
        <div className="grid grid-cols-3 gap-4">

          {/* Standard */}
          <div className="rounded-2xl p-5 space-y-4 flex flex-col" style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.2)' }}>
            <div>
              <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#60a5fa' }}>Standard</p>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-white">49,99$</span>
                <span className="text-[12px] text-text2">/ mois</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {['2 500 crédits / mois', '50 téléphones max', 'Toutes les fonctionnalités', 'Mass Posting — 10 comptes', 'Support 24/7'].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <span className="mt-px flex-shrink-0" style={{ color: '#60a5fa' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="block w-full py-2.5 rounded-xl text-[12px] font-bold text-center text-white transition-all hover:brightness-110"
              style={{ background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.35)' }}>
              Obtenir →
            </a>
          </div>

          {/* Pro */}
          <div className="rounded-2xl p-5 space-y-4 flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(145deg,rgba(236,72,153,0.08),rgba(124,58,237,0.08))', border: '1px solid rgba(236,72,153,0.4)' }}>
            <div className="absolute top-2.5 right-2.5 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}>
              Populaire
            </div>
            <div>
              <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#f472b6' }}>Pro</p>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-white">99,99$</span>
                <span className="text-[12px] text-text2">/ mois</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {['5 500 crédits / mois', '200 téléphones max', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7'].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <span className="mt-px flex-shrink-0" style={{ color: '#f472b6' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="block w-full py-2.5 rounded-xl text-[12px] font-bold text-center text-white transition-all"
              style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', boxShadow: '0 2px 16px -4px rgba(236,72,153,0.4)' }}>
              Obtenir →
            </a>
          </div>

          {/* Organisation */}
          <div className="rounded-2xl p-5 space-y-4 flex flex-col" style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <div>
              <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: '#34d399' }}>Organisation</p>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-white">149,99$</span>
                <span className="text-[12px] text-text2">/ mois</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {['11 000 crédits / mois', 'Téléphones illimités', 'Toutes les fonctionnalités', 'Mass Posting illimité', 'Support 24/7 prioritaire', 'Proposition d\'ajouts'].map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-text2">
                  <span className="mt-px flex-shrink-0" style={{ color: '#34d399' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <a href="https://t.me/justquentin" target="_blank" rel="noreferrer"
              className="block w-full py-2.5 rounded-xl text-[12px] font-bold text-center text-white transition-all hover:brightness-110"
              style={{ background: 'rgba(52,211,153,0.2)', border: '1px solid rgba(52,211,153,0.35)' }}>
              Obtenir →
            </a>
          </div>
        </div>

        {/* Credit packs */}
        <div className="mt-6">
          <p className="text-[13px] font-bold text-white mb-3">Packs de crédits</p>
          <div className="grid grid-cols-5 gap-3">
            {[
              { cr: '500',    price: '19,99$' },
              { cr: '1 200',  price: '39,99$' },
              { cr: '2 500',  price: '74,99$' },
              { cr: '6 000',  price: '164,99$' },
              { cr: '15 000', price: '374,99$' },
            ].map(pk => (
              <a key={pk.cr} href="https://t.me/justquentin" target="_blank" rel="noreferrer"
                className="rounded-xl p-3.5 text-center transition-all hover:brightness-110 no-underline"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)', textDecoration: 'none' }}>
                <div className="text-[15px] font-black text-white">{pk.cr}</div>
                <div className="text-[10px] text-text2 mb-1.5">crédits</div>
                <div className="text-[12px] font-bold" style={{ color: '#a78bfa' }}>{pk.price}</div>
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
            <p className="text-[13px] font-bold text-text">Commander via Telegram</p>
            <p className="text-[12px] text-text2">Crypto / virement — clé envoyée immédiatement · @justquentin</p>
          </div>
          <div className="ml-auto text-[#29b6f6] text-lg">→</div>
        </a>
      </div>
    </div>
  )
}
