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
        <p className={`text-sm font-medium transition-colors ${checked ? 'text-text' : 'text-text2'}`}>{title}</p>
        <p className="text-[11px] text-text2/70 mt-0.5">{sub}</p>
      </div>
    </label>
  )
}

type GeneralTab = 'apparence' | 'sons' | 'langue'
type Panel = 'general' | 'profile' | 'connexions' | 'organization' | 'admin' | 'abonnement'
interface SettingsProps { user: User; initialPanel?: Panel }

export function Settings({ user, initialPanel }: SettingsProps) {
  const { role, perms, currentOrg } = useOrg()
  const license = useLicense()
  const canSeeConnexions = role ? canSeeTab(role, perms, 'settings') : true
  const canEditOrgConnexions = role === 'owner' || role === 'admin'
  const [panel, setPanel]     = useState<Panel>(() => {
    const p = initialPanel ?? 'general'
    return p === 'connexions' && !canSeeConnexions ? 'general' : p
  })
  const mountedRef             = useRef(false)
  const [genTab, setGenTab]   = useState<GeneralTab>('apparence')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Apparence
  const [theme, setTheme]     = useState('Bleu')
  const [pixelUnlocked, setPixelUnlocked] = useState(false)
  const [swatchClicks, setSwatchClicks] = useState<{ count: number; first: number }>({ count: 0, first: 0 })

  // Notifications
  const [notifyPopup, setNotifyPopup] = useState(true)
  const [notifySound, setNotifySound] = useState(true)
  const [musicOn, setMusicOn]         = useState(isMusicEnabled)
  const [musicVol, setMusicVol]       = useState(getVolume)
  const [musicTrack, setMusicTrackS]  = useState(getTrack)

  // Profil
  const [profileEmail, setProfileEmail] = useState(user.email ?? '')
  const [profileName, setProfileName]   = useState('')
  const [displayName, setDisplayName]   = useState('')

  // Connexions
  const [bearer, setBearer]         = useState('')
  const [groqKey, setGroqKey]       = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [proxyUrl, setProxyUrl]     = useState('')
  const [igSession, setIgSession]   = useState('')

  useEffect(() => {
    if (initialPanel) setPanel(initialPanel)
  }, [initialPanel])

  // Load saved values
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    const storedTheme = localStorage.getItem('theme') || 'Bleu'
    setTheme(storedTheme)
    applyTheme(storedTheme)
    setPixelUnlocked(localStorage.getItem('pixel-unlocked') === '1')

    const storedNotifyPopup = localStorage.getItem('notify-popup')
    const storedNotifySound = localStorage.getItem('notify-sound')
    if (storedNotifyPopup !== null) setNotifyPopup(storedNotifyPopup === '1')
    if (storedNotifySound !== null) setNotifySound(storedNotifySound === '1')

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
          setBearer(d.bearer_token       ?? '')
          setGroqKey(d.groq_api_key      ?? '')
          setAnthropicKey(d.anthropic_api_key ?? '')
          setProxyUrl(d.proxy            ?? '')
          setIgSession(d.ig_sessionid    ?? '')
          setProfileEmail((d.profile_email as string) ?? user.email ?? '')
        }
        if (profileRes.data) {
          setProfileName(profileRes.data.full_name    ?? '')
          setDisplayName(profileRes.data.display_name ?? '')
        }
      } finally {
        setLoading(false)
      }
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
    setTheme(t)
    localStorage.setItem('theme', t)
    applyTheme(t)
  }

  function handleSwatchClick() {
    const now = Date.now()
    setSwatchClicks(prev => {
      const reset = now - prev.first > 4000
      const next  = { count: reset ? 1 : prev.count + 1, first: reset ? now : prev.first }
      if (next.count >= 7) {
        localStorage.setItem('pixel-unlocked', '1')
        setPixelUnlocked(true)
      }
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      localStorage.setItem('notify-popup', notifyPopup ? '1' : '0')
      localStorage.setItem('notify-sound', notifySound ? '1' : '0')
      const { error: e } = await supabase.from('app_config').upsert({
        user_id: user.id,
        theme,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (e) throw e
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  // but they're additionally written to the org's org_config row by saveConnexions.
  async function saveConnexions() {
    setSaving(true)
    setError(null)
    try {
      if (!canEditOrgConnexions) {
        throw new Error('Seuls les admins peuvent modifier les connexions.')
      }

      if (currentOrg) {
        const { error: e } = await supabase.from('org_config').upsert({
          org_id:        currentOrg.id,
          bearer_token:  bearer,
          groq_api_key:  groqKey,
          anthropic_api_key: anthropicKey,
          proxy:         proxyUrl,
          ig_sessionid:  igSession,
          updated_at:    new Date().toISOString(),
        }, { onConflict: 'org_id' })
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('app_config').upsert({
          user_id:       user.id,
          bearer_token:  bearer,
          groq_api_key:  groqKey,
          anthropic_api_key: anthropicKey,
          proxy:         proxyUrl,
          ig_sessionid:  igSession,
          updated_at:    new Date().toISOString(),
        }, { onConflict: 'user_id' })
        if (e) throw e
      }

      notifyConnectionsChanged()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  async function saveProfile() {
    setSaving(true)
    setError(null)
    try {
      const { error: e } = await supabase.from('profiles').upsert({
        id:           user.id,
        email:        user.email ?? '',
        full_name:    profileName,
        display_name: displayName,
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'id' })
      if (e) throw e
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-text2 text-sm">Chargement…</div>

  return (
    <div className="p-6 space-y-5 max-w-xl">

      {/* Top tabs (Python: 3 tabs) */}
      <div className="flex gap-1 border-b border-border">
        {([
          { k: 'general',      l: '⚙ Général'       },
          { k: 'profile',      l: '👤 Profil'        },
          ...(canSeeConnexions ? [{ k: 'connexions' as const, l: '🔌 Connexions' }] : []),
          { k: 'organization', l: '🏢 Organisation'  },
          ...(license.isSuperAdmin ? [{ k: 'admin' as const, l: '🛡 Admin' }] : []),
          { k: 'abonnement' as const, l: '💳 Abonnement' },
        ] as const).map(t => (
          <button
            key={t.k}
            onClick={() => setPanel(t.k)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              panel === t.k ? 'border-accent text-accent bg-accent/5' : 'border-transparent text-text2 hover:text-text'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {panel === 'general' && (
        <section className="space-y-6">

          {/* Sub-tabs */}
          <div className="flex gap-2">
            {(['apparence', 'sons', 'langue'] as GeneralTab[]).map(t => (
              <button
                key={t}
                onClick={() => setGenTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  genTab === t ? 'bg-accent text-white' : 'bg-surface2 text-text2 hover:text-text'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {genTab === 'apparence' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-text">Thème de couleur</h2>
              <div className="flex flex-wrap gap-3">
                {THEMES.map(t => (
                  <button
                    key={t}
                    onClick={() => { handleTheme(t); handleSwatchClick() }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      theme === t
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-surface2 text-text2 hover:border-accent/40'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ background: THEME_COLORS[t] }}
                    />
                    {t}
                  </button>
                ))}
              </div>
              {pixelUnlocked && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-surface2 border border-border text-xs text-text2">
                  🎮 Mode Pixel débloqué
                </div>
              )}
            </div>
          )}

          {genTab === 'sons' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-text">Sons & Musique</h2>
              <ToggleRow
                checked={notifyPopup}
                onChange={v => setNotifyPopup(v)}
                title="Notifications popup"
                sub="Affiche une notification en haut à droite lors d'actions importantes"
              />
              <ToggleRow
                checked={notifySound}
                onChange={v => setNotifySound(v)}
                title="Sons de navigation"
                sub="Joue un son lors des changements de page"
              />
              <ToggleRow
                checked={musicOn}
                onChange={v => { setMusicOn(v); setMusicEnabled(v) }}
                title="Musique d'ambiance"
                sub="Joue une musique en fond lors de l'utilisation de l'app"
                accent
              />
              {musicOn && (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-text">Track</p>
                    <div className="flex flex-wrap gap-2">
                      {TRACKS.map((tr, i) => (
                        <button
                          key={i}
                          onClick={() => { setMusicTrackS(i); setTrack(i) }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            musicTrack === i ? 'bg-accent text-white' : 'bg-surface2 text-text2 hover:text-text'
                          }`}
                        >
                          {tr.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-text">Volume — {Math.round(musicVol * 100)}%</p>
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={musicVol}
                      onChange={e => { const v = parseFloat(e.target.value); setMusicVol(v); setVolume(v) }}
                      className="w-full accent-accent"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {genTab === 'langue' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-text">Langue</h2>
              <p className="text-xs text-text2">Seul le français est disponible pour l'instant.</p>
            </div>
          )}
        </section>
      )}

      {/* ── Profil ─────────────────────────────────────────────────────────── */}
      {panel === 'profile' && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text">Mon Profil</h2>
          <Input label="Email" type="email" placeholder="contact@example.com" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
          <Input label="Nom complet" placeholder="Jean Dupont" value={profileName} onChange={e => setProfileName(e.target.value)} />
          <Input label="Pseudo (visible par l'équipe)" placeholder="@jean" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          <Button onClick={saveProfile} loading={saving} className="w-full">💾 Sauvegarder le profil</Button>
        </section>
      )}

      {/* ── Organisation ────────────────────────────────────────────────────── */}
      {panel === 'organization' && <OrganizationPanel user={user} />}

      {/* ── Connexions ─────────────────────────────────────────────────────── */}
      {panel === 'connexions' && canSeeConnexions && (
        <div className="space-y-5">
          <div className={`px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 ${
            currentOrg ? 'bg-accent/10 border border-accent/30 text-accent' : 'bg-surface2 border border-border text-text2'
          }`}>
            {currentOrg
              ? <><span>🏢</span><span>Mode organisation — <strong>{currentOrg.name}</strong>{!canEditOrgConnexions && <span className="text-warn"> · Lecture seule (admin requis)</span>}</span></>
              : <><span>👤</span><span>Mode solo — ces clés sont privées à votre compte</span></>
            }
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-text">Connexions GéeLark</h2>
            <Input label="Bearer Token GéeLark" type="password" placeholder="Bearer …" value={bearer} onChange={e => setBearer(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
            <Input label="URL Proxy (optionnel)" placeholder="http://…" value={proxyUrl} onChange={e => setProxyUrl(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
            <Input label="Session ID Instagram" type="password" placeholder="sessionid=…" value={igSession} onChange={e => setIgSession(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
            <Button onClick={saveConnexions} loading={saving} disabled={!!currentOrg && !canEditOrgConnexions}>💾 Sauvegarder</Button>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-sm font-semibold text-text">Clés API</h2>
            <Input label="Groq API Key" type="password" placeholder="gsk_…" value={groqKey} onChange={e => setGroqKey(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
            <Input label="Anthropic API Key" type="password" placeholder="sk-ant-…" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} disabled={!!currentOrg && !canEditOrgConnexions} />
            <Button onClick={saveConnexions} loading={saving} disabled={!!currentOrg && !canEditOrgConnexions} className="w-full">💾 Sauvegarder les clés API</Button>
          </div>
        </div>
      )}

      {/* ── Admin ───────────────────────────────────────────────────────────── */}
      {panel === 'admin' && license.isSuperAdmin && <AdminPanel user={user} />}

      {/* ── Abonnement ──────────────────────────────────────────────────────── */}
      {panel === 'abonnement' && <SubscriptionPanel />}

      {/* Bottom save bar */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{error}</div>
      )}
      {panel === 'general' && (
        <div className="flex items-center gap-4 sticky bottom-4 bg-bg/80 backdrop-blur-sm py-2">
          <Button onClick={save} loading={saving}>💾 Sauvegarder</Button>
          {saved && <span className="text-sm text-ok">✓ Sauvegardé</span>}
        </div>
      )}
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
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          ['Total', stats.total, 'text-text'],
          ['Dispo', stats.dispo, 'text-green-400'],
          ['Actives', stats.actives, 'text-blue-400'],
          ['Expirées', stats.expirées, 'text-red-400'],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <p className={`text-xl font-black ${c}`}>{v}</p>
            <p className="text-[10px] text-text2 mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      {/* Créer */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <p className="text-xs font-semibold text-text uppercase tracking-wider">Créer une clé</p>
        <div className="flex gap-2">
          <input
            value={newKey}
            onChange={e => setNewKey(e.target.value.toUpperCase())}
            className="flex-1 bg-[#0d0a1a] border border-border rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-text focus:outline-none focus:border-accent"
          />
          <button onClick={() => setNewKey(genKey())} className="px-3 py-2 rounded-lg text-text2 hover:text-text text-sm" style={{ background: 'rgba(255,255,255,0.05)' }}>↺</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {DURATIONS.map(d => (
            <button key={d.label} onClick={() => setDuration(d.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${duration === d.days ? 'text-white' : 'text-text2 hover:text-text'}`}
              style={duration === d.days ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)' } : { background: 'rgba(255,255,255,0.05)' }}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {['standard', 'pro', 'lifetime'].map(p => (
            <button key={p} onClick={() => setPlan(p)}
              className={`px-3 py-1 rounded-lg text-xs capitalize transition-all ${plan === p ? 'text-white' : 'text-text2'}`}
              style={plan === p ? { background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.5)' } : { background: 'rgba(255,255,255,0.05)' }}>
              {p}
            </button>
          ))}
        </div>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (ex: Discord @pseudo)" />
        {createErr && <p className="text-xs text-red-400 text-center">{createErr}</p>}
        <Button onClick={create} loading={creating} className="w-full">+ Créer la clé</Button>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher clé ou email…" />
        {loading ? <p className="text-text2 text-sm text-center py-6">Chargement…</p> : filtered.length === 0 ? (
          <p className="text-text2 text-sm text-center py-6">Aucune clé</p>
        ) : filtered.map(k => (
          <div key={k.id} className={`rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2 ${!k.is_active ? 'opacity-50' : ''}`}
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)' }}>
            <button onClick={() => copy(k.key)} className="font-mono text-xs text-text tracking-widest hover:text-accent transition-colors">
              {k.key} <span className="text-[10px] text-text2">{copied === k.key ? '✓' : '⎘'}</span>
            </button>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full capitalize" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{k.plan}</span>
            {!k.is_active
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">Révoquée</span>
              : k.user_id
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Activée</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400">Dispo</span>
            }
            <span className={`text-[11px] font-semibold ml-auto ${daysColor(k.expires_at)}`}>{daysLeft(k.expires_at)}</span>
            {k.user_email && <span className="text-[10px] text-text2 truncate max-w-[140px]">{k.user_email}</span>}
            {k.notes && <span className="text-[10px] text-text2 italic truncate max-w-[100px]">{k.notes}</span>}
            <div className="flex gap-1">
              {k.is_active && <button onClick={() => revoke(k.id)} className="text-[10px] px-2 py-0.5 rounded text-orange-400 hover:bg-orange-400/10">Révoquer</button>}
              <button onClick={() => del(k.id)} className="text-[10px] px-2 py-0.5 rounded text-red-400 hover:bg-red-400/10">Suppr.</button>
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

  const planLabel = license.plan === 'pro' ? 'Pro' : license.plan === 'lifetime' ? 'À vie' : license.plan === 'standard' ? 'Standard' : '—'
  const planCredits = license.plan === 'pro' || license.plan === 'lifetime' ? 5500 : license.plan === 'standard' ? 2000 : 0
  const maxPhones   = license.plan === 'pro' || license.plan === 'lifetime' ? '∞' : '100'

  return (
    <div className="space-y-6">
      {/* Current status */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.18)' }}>
        <p className="text-xs font-black text-text uppercase tracking-wider">Mon abonnement actuel</p>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text2">Statut</span>
          <span className="text-sm font-bold" style={{ color: statusColor }}>{statusLabel}</span>
        </div>

        {license.plan && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-text2">Plan</span>
            <span className="text-sm font-bold" style={{ color: '#a78bfa' }}>{planLabel}</span>
          </div>
        )}

        {license.expiresAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-text2">Expiration</span>
            <span className="text-sm font-semibold text-text">
              {license.expiresAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        )}

        {licenseKey && (
          <div className="space-y-1.5">
            <p className="text-xs text-text2">Clé de licence</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-text2 truncate">
                {licenseKey}
              </code>
              <button
                onClick={copy}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
                style={{ background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(139,92,246,0.1)', color: copied ? '#34d399' : '#a78bfa', border: `1px solid ${copied ? 'rgba(52,211,153,0.25)' : 'rgba(139,92,246,0.2)'}` }}
              >
                {copied ? '✓ Copié' : 'Copier'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activate a license key */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.18)' }}>
        <p className="text-xs font-black text-text uppercase tracking-wider">🔑 Activer une clé</p>
        <form onSubmit={handleActivateKey} className="flex gap-2">
          <input
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-text placeholder:text-text2 focus:border-accent focus:outline-none uppercase"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={keyLoading || !newKey.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
          >{keyLoading ? '…' : 'Activer'}</button>
        </form>
        {keyResult && (
          <p className={`text-xs ${keyResult.ok ? 'text-ok' : 'text-danger'}`}>{keyResult.text}</p>
        )}
      </div>

      {/* Credits */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.2)' }}>
        <p className="text-xs font-black text-text uppercase tracking-wider">💎 Crédits</p>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text2">Solde actuel</span>
          <span className="text-2xl font-black" style={{ color: creditBalance < 10 ? '#f87171' : '#a78bfa' }}>
            {creditBalance.toLocaleString('fr-FR')}
          </span>
        </div>

        {planCredits > 0 && (
          <div className="flex items-center justify-between text-xs text-text2">
            <span>Crédits mensuels inclus (plan {planLabel})</span>
            <span className="font-semibold text-text">{planCredits.toLocaleString('fr-FR')} / mois</span>
          </div>
        )}

        <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text2 mb-2">Coût des opérations</p>
          <div className="flex justify-between text-xs"><span className="text-text2">✂ Montage vidéo</span><span className="text-text font-semibold">1 crédit</span></div>
          <div className="flex justify-between text-xs"><span className="text-text2">🔀 Remix vidéo</span><span className="text-text font-semibold">2 crédits</span></div>
        </div>

        <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text2 mb-2">Téléphones GéeLark</p>
          <div className="flex justify-between text-xs">
            <span className="text-text2">Maximum autorisé</span>
            <span className="font-semibold" style={{ color: maxPhones === '∞' ? '#34d399' : '#a78bfa' }}>{maxPhones}</span>
          </div>
        </div>

        {/* Redeem code */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <p className="text-xs font-semibold text-text2">Activer un code crédit</p>
          <form onSubmit={handleRedeemCode} className="flex gap-2">
            <input
              value={creditCode}
              onChange={e => { setCreditCode(e.target.value); setCodeResult(null) }}
              placeholder="CODE-XXXX"
              className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm font-mono text-text placeholder:text-text2/40 focus:outline-none focus:border-accent/50 uppercase"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={codeLoading || !creditCode.trim()}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
            >
              {codeLoading ? '…' : 'Activer'}
            </button>
          </form>
          {codeResult && (
            <p className="text-xs" style={{ color: codeResult.ok ? '#34d399' : '#f87171' }}>{codeResult.text}</p>
          )}
        </div>
      </div>

      {/* Credit packs */}
      <div>
        <p className="text-xs font-black text-text uppercase tracking-wider mb-4">Acheter des crédits</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { credits: 100,  price: 4.99,   label: '100 crédits',   bonus: '' },
            { credits: 500,  price: 19.99,  label: '500 crédits',   bonus: '+ 25 bonus' },
            { credits: 1500, price: 49.99,  label: '1 500 crédits', bonus: '+ 150 bonus' },
            { credits: 5000, price: 149.99, label: '5 000 crédits', bonus: '+ 500 bonus' },
          ].map(pack => (
            <a
              key={pack.credits}
              href={`mailto:contact@scaleflow.app?subject=Achat%20crédits%20ScaleFlow%20—%20${pack.credits}&body=Bonjour%2C%20je%20souhaite%20acheter%20le%20pack%20${pack.credits}%20crédits%20(${pack.price}€).`}
              className="rounded-xl p-4 flex flex-col gap-2 transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)', textDecoration: 'none' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-text">{pack.label}</span>
                <span className="text-xs font-black" style={{ color: '#a78bfa' }}>{pack.price}€</span>
              </div>
              {pack.bonus && <span className="text-[10px] text-green-400">{pack.bonus}</span>}
              <div className="text-[10px] text-text2">{(pack.price / pack.credits * 100).toFixed(1)}c / crédit</div>
            </a>
          ))}
        </div>
        <p className="text-[10px] text-text2/50 mt-3 text-center">
          Les crédits sont ajoutés par code après paiement.
        </p>
      </div>

      {/* Plan pricing */}
      <div>
        <p className="text-xs font-black text-text uppercase tracking-wider mb-4">Abonnements</p>
        <div className="grid grid-cols-2 gap-4">

          {/* Standard */}
          <div className="rounded-2xl p-5 space-y-4 flex flex-col" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.25)' }}>
            <div>
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: '#a78bfa' }}>Standard</p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-black text-white">$49.99</span>
                <span className="text-xs text-text2">/ mois</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {['2 000 crédits / mois', 'Max 100 téléphones', 'Toutes les fonctionnalités', 'Support standard'].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-text2">
                  <span style={{ color: '#a78bfa' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:contact@scaleflow.app?subject=Achat%20ScaleFlow%20Standard"
              className="block w-full py-2.5 rounded-xl text-sm font-bold text-center text-white transition-all"
              style={{ background: 'linear-gradient(130deg,#7c3aed,#8b5cf6)' }}
            >
              Acheter →
            </a>
          </div>

          {/* Pro */}
          <div className="rounded-2xl p-5 space-y-4 flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(145deg,rgba(236,72,153,0.08),rgba(124,58,237,0.08))', border: '1px solid rgba(236,72,153,0.35)' }}>
            <div className="absolute top-3 right-3 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}>
              Populaire
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: '#f472b6' }}>Pro</p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-black text-white">$99.99</span>
                <span className="text-xs text-text2">/ mois</span>
              </div>
            </div>
            <ul className="space-y-1.5 flex-1">
              {['5 500 crédits / mois', 'Téléphones illimités', 'Membres illimités (org)', 'Support prioritaire 24/7'].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-text2">
                  <span style={{ color: '#f472b6' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:contact@scaleflow.app?subject=Achat%20ScaleFlow%20Pro"
              className="block w-full py-2.5 rounded-xl text-sm font-bold text-center text-white transition-all"
              style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', boxShadow: '0 2px 20px -4px rgba(236,72,153,0.4)' }}
            >
              Acheter →
            </a>
          </div>
        </div>
        <p className="text-[10px] text-text2/50 mt-3 text-center">
          Après achat, tu recevras une clé de licence par email à activer ci-dessus.
        </p>
        <a
          href="https://t.me/typedlapple"
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center gap-3 rounded-xl p-4 transition-all hover:scale-[1.01]"
          style={{ background: 'rgba(33,150,243,0.08)', border: '1px solid rgba(33,150,243,0.25)', textDecoration: 'none' }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: '#29b6f6' }}>
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
          </svg>
          <div>
            <p className="text-sm font-bold text-text">Payer via Telegram</p>
            <p className="text-xs text-text2">Contacte @typedlapple pour payer par crypto, PayPal ou autre méthode</p>
          </div>
        </a>
      </div>
    </div>
  )
}
