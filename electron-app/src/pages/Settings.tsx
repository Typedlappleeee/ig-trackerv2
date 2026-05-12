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
type Panel = 'general' | 'profile' | 'connexions' | 'organization' | 'admin'
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
          setProxyUrl(d.proxy_url        ?? '')
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
          proxy_url:     proxyUrl,
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
          proxy_url:     proxyUrl,
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
  const [createErr, setCreateErr] = useState<string | null>(null)
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
