import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { OrganizationPanel } from '@/components/OrganizationPanel'
import { useOrg } from '@/lib/orgContext'
import { canSeeTab } from '@/lib/permissions'
import { notifyConnectionsChanged } from '@/lib/connections'

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

type GeneralTab = 'apparence' | 'notifications' | 'langue'

export function Settings({ user, initialPanel }: SettingsProps) {
  const { role, perms, currentOrg } = useOrg()
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

  // Langue
  const [lang, setLang] = useState<'fr' | 'en'>('fr')

  // Profil
  const [profileName, setProfileName]   = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profileNiche, setProfileNiche] = useState('')
  const [exportDir, setExportDir]       = useState('')
  const [newPassword, setNewPassword]   = useState('')
  const [confirmPassword, setConfirm]   = useState('')

  // Connexions
  const [bearer, setBearer]   = useState('')
  const [proxy, setProxy]     = useState('')
  const [testingProxy, setTestingProxy] = useState(false)
  const [proxyResult, setProxyResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Push server
  const [pushPort, setPushPort] = useState(8765)
  const [pushRunning, setPushRunning] = useState(false)
  const [pushUrl, setPushUrl] = useState('')

  // API keys
  const [groqKey, setGroqKey] = useState('')
  const [igSession, setIgSession] = useState('')
  const [showIgSession, setShowIgSession] = useState(false)

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (initialPanel) setPanel(initialPanel)
  }, [initialPanel])

  useEffect(() => {
    supabase.from('app_config').select('*').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setBearer(data.bearer_token ?? '')
          setGroqKey(data.groq_api_key ?? '')
          setTheme(data.theme ?? 'Bleu')
          setProfileName(data.profile_name ?? '')
          setProfileNiche(data.profile_niche ?? '')
          // The following fields are read from optional columns; they may not exist in older schemas
          const d = data as Record<string, unknown>
          setProfileEmail((d.profile_email as string) ?? user.email ?? '')
          setExportDir((d.export_dir as string) ?? '')
          setProxy((d.proxy as string) ?? '')
          setIgSession((d.ig_sessionid as string) ?? '')
          setPushPort((d.push_port as number) ?? 8765)
          setNotifyPopup((d.notify_popup as boolean) ?? true)
          setNotifySound((d.notify_sound as boolean) ?? true)
          setLang((d.lang as 'fr' | 'en') ?? 'fr')
        }
        setLoading(false)
      })
  }, [])

  // When the active org changes, override the connection fields with that org's
  // shared config (bearer / groq / proxy / ig_sessionid). User-level fields
  // (theme, lang, profile…) are unaffected.
  useEffect(() => {
    if (!currentOrg) return
    supabase.from('org_config').select('*').eq('org_id', currentOrg.id).maybeSingle()
      .then(({ data }) => {
        if (!data) {
          // No org config yet — clear the connection fields so the form starts empty
          setBearer(''); setGroqKey(''); setProxy(''); setIgSession('')
        } else {
          setBearer(data.bearer_token ?? '')
          setGroqKey(data.groq_api_key ?? '')
          setProxy(data.proxy ?? '')
          setIgSession(data.ig_sessionid ?? '')
        }
      })
  }, [currentOrg?.id])

  function clickSwatch(t: string) {
    setTheme(t)
    const now = Date.now()
    if (now - swatchClicks.first > 2000) {
      setSwatchClicks({ count: 1, first: now })
    } else {
      const c = swatchClicks.count + 1
      if (c >= 7) {
        setPixelUnlocked(true)
        setSwatchClicks({ count: 0, first: 0 })
      } else {
        setSwatchClicks({ count: c, first: swatchClicks.first })
      }
    }
  }

  // Save user-level fields (theme, lang, profile, push_port, notifications)
  // to app_config. In org mode, the connection fields (bearer/groq/proxy/
  // ig_sessionid) are ALSO saved to app_config so solo mode keeps a fallback,
  // but they're additionally written to the org's org_config row by saveConnexions.
  async function save() {
    setSaving(true); setSaved(false); setError(null)
    const payload: Record<string, unknown> = {
      user_id:       user.id,
      theme,
      profile_name:  profileName.trim(),
      profile_niche: profileNiche.trim(),
      updated_at:    new Date().toISOString(),
    }
    if (profileEmail) payload.profile_email = profileEmail.trim()
    if (exportDir)   payload.export_dir = exportDir.trim()
    payload.push_port    = pushPort
    payload.notify_popup = notifyPopup
    payload.notify_sound = notifySound
    payload.lang         = lang
    // Solo mode: connection fields go to app_config too (they ARE user-scoped here).
    // Org mode: don't touch app_config's connection fields — saveConnexions writes
    // to org_config instead.
    if (!currentOrg) {
      payload.bearer_token = bearer.trim()
      payload.groq_api_key = groqKey.trim()
      if (proxy)     payload.proxy        = proxy.trim()
      if (igSession) payload.ig_sessionid = igSession.trim()
    }

    let { error: err } = await supabase.from('app_config').upsert(payload, { onConflict: 'user_id' })

    if (err && /column|schema cache/i.test(err.message)) {
      const safe: Record<string, unknown> = {
        user_id:       payload.user_id,
        theme:         payload.theme,
        profile_name:  payload.profile_name,
        profile_niche: payload.profile_niche,
        updated_at:    payload.updated_at,
      }
      if (!currentOrg) {
        safe.bearer_token = bearer.trim()
        safe.groq_api_key = groqKey.trim()
      }
      const r = await supabase.from('app_config').upsert(safe, { onConflict: 'user_id' })
      err = r.error
      if (!err) setError('Quelques options optionnelles n\'ont pas été enregistrées (colonnes manquantes en base — sans gravité).')
    }

    if (err) { setError('Erreur: ' + err.message); setSaving(false); return }
    if (!currentOrg) notifyConnectionsChanged()  // solo mode also writes connection fields here
    setSaved(true); setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

  // Save connexions (bearer/groq/proxy/ig_sessionid). Routes to org_config when
  // an org is active, app_config otherwise. Admin-only when org is active.
  async function saveConnexions() {
    setSaving(true); setSaved(false); setError(null)
    if (currentOrg) {
      if (!canEditOrgConnexions) {
        setError("Seuls les owner/admin de l'organisation peuvent modifier ces clés.")
        setSaving(false); return
      }
      const { error: err } = await supabase.from('org_config').upsert({
        org_id:        currentOrg.id,
        bearer_token:  bearer.trim(),
        groq_api_key:  groqKey.trim(),
        proxy:         proxy.trim()    || null,
        ig_sessionid:  igSession.trim() || null,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'org_id' })
      if (err) { setError('Erreur: ' + err.message); setSaving(false); return }
    } else {
      // Solo mode: explicitly write empty strings so deletions take effect
      // (we don't want a removed token to silently keep its old value).
      const payload: Record<string, unknown> = {
        user_id:       user.id,
        bearer_token:  bearer.trim(),
        groq_api_key:  groqKey.trim(),
        proxy:         proxy.trim()     || null,
        ig_sessionid:  igSession.trim() || null,
        updated_at:    new Date().toISOString(),
      }
      const { error: err } = await supabase.from('app_config').upsert(payload, { onConflict: 'user_id' })
      if (err) { setError('Erreur: ' + err.message); setSaving(false); return }
    }
    notifyConnectionsChanged()    // wake up useConnections everywhere
    setSaved(true); setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

  async function saveProfile() {
    setSaving(true); setSaved(false); setError(null)
    try {
      // 1. Update Supabase Auth email if changed
      if (profileEmail.trim() && profileEmail.trim() !== user.email) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: profileEmail.trim() })
        if (emailErr) throw new Error('Email : ' + emailErr.message)
      }
      // 2. Update password if provided
      if (newPassword) {
        if (newPassword !== confirmPassword) throw new Error('Les mots de passe ne correspondent pas.')
        if (newPassword.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.')
        const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
        if (pwErr) throw new Error('Mot de passe : ' + pwErr.message)
      }
      // 3. Upsert profile data
      await save()
      setNewPassword('')
      setConfirm('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  async function testProxy() {
    setTestingProxy(true)
    setProxyResult(null)
    // Simple ping test via geelarkRequest (gets external IP through proxy)
    try {
      if (!window.electronAPI?.geelarkRequest) throw new Error('IPC indisponible')
      const r = await window.electronAPI.geelarkRequest({
        method: 'GET',
        url: 'https://api.ipify.org?format=json',
      })
      if (r.ok) {
        const ip = (r.data as { ip?: string })?.ip
        setProxyResult({ ok: true, msg: ip ? `IP sortante : ${ip}` : 'OK' })
      } else {
        setProxyResult({ ok: false, msg: r.error ?? 'Erreur réseau' })
      }
    } catch (e) {
      setProxyResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    }
    setTestingProxy(false)
  }

  function togglePush() {
    if (pushRunning) {
      setPushRunning(false)
      setPushUrl('')
    } else {
      // Push server is a TODO IPC handler — for now show a placeholder URL
      setPushRunning(true)
      setPushUrl(`http://localhost:${pushPort}/push?u=USERNAME&f=FOLLOWERS&fw=FOLLOWING&p=POSTS`)
    }
  }

  if (loading) return (
    <div className="p-8 space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-12 bg-surface2 rounded-xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-text">⚙ Paramètres</h1>
      </div>

      {/* Top tabs (Python: 3 tabs) */}
      <div className="flex gap-1 border-b border-border">
        {([
          { k: 'general',      l: '⚙ Général'       },
          { k: 'profile',      l: '👤 Profil'        },
          ...(canSeeConnexions ? [{ k: 'connexions' as const, l: '🔌 Connexions' }] : []),
          { k: 'organization', l: '🏢 Organisation'  },
        ] as const).map(t => (
          <button
            key={t.k}
            onClick={() => setPanel(t.k)}
            className={`px-4 py-2 text-sm font-semibold transition-colors -mb-px border-b-2 ${
              panel === t.k ? 'border-accent text-accent bg-accent/5' : 'border-transparent text-text2 hover:text-text'
            }`}
          >{t.l}</button>
        ))}
      </div>

      {/* ── Paramètres généraux ────────────────────────────────────────────── */}
      {panel === 'general' && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-2">
            {([
              { k: 'apparence',     l: '🎨 Apparence'    },
              { k: 'notifications', l: '🔔 Notifications' },
              { k: 'langue',        l: '🌐 Langue'        },
            ] as const).map(t => (
              <button
                key={t.k}
                onClick={() => setGenTab(t.k)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  genTab === t.k ? 'bg-surface3 text-text' : 'bg-surface text-text2 hover:text-text'
                }`}
              >{t.l}</button>
            ))}
          </div>

          {genTab === 'apparence' && (
            <section className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-text">Thème de couleur</h2>
                <p className="text-xs text-text2 mt-0.5">Couleur d'accentuation de l'interface</p>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {THEMES.map(t => (
                  <button
                    key={t}
                    onClick={() => clickSwatch(t)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      theme === t ? 'border-text' : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg shadow-md" style={{ backgroundColor: THEME_COLORS[t] }} />
                    <span className="text-xs font-medium text-text">{t}</span>
                  </button>
                ))}
                {pixelUnlocked && (
                  <button
                    onClick={() => setTheme('67')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      theme === '67' ? 'border-text' : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg shadow-md bg-gradient-to-br from-[#55aaff] to-[#3377cc] flex items-center justify-center text-white font-bold text-xs">67</div>
                    <span className="text-xs font-medium text-accent">67 ⭐</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-text2/70 italic">Thème actif : <span className="text-accent font-semibold">{theme}</span>{pixelUnlocked && <span> · 🎉 Easter egg débloqué !</span>}</p>
            </section>
          )}

          {genTab === 'notifications' && (
            <section className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-text">Notifications</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={notifyPopup} onChange={e => setNotifyPopup(e.target.checked)} className="w-4 h-4 accent-accent" />
                <div className="flex-1">
                  <p className="text-sm text-text">Popups (toasts)</p>
                  <p className="text-[11px] text-text2">Afficher les notifications en haut à droite</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={notifySound} onChange={e => setNotifySound(e.target.checked)} className="w-4 h-4 accent-accent" />
                <div className="flex-1">
                  <p className="text-sm text-text">Sons</p>
                  <p className="text-[11px] text-text2">Bip système quand un post se termine</p>
                </div>
              </label>
            </section>
          )}

          {genTab === 'langue' && (
            <section className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-text">Langue</h2>
              {[
                { k: 'fr', l: '🇫🇷 Français', sub: 'Langue par défaut' },
                { k: 'en', l: '🇬🇧 English',  sub: 'Fallback / international' },
              ].map(opt => (
                <label key={opt.k} className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-surface2">
                  <input
                    type="radio"
                    name="lang"
                    checked={lang === opt.k}
                    onChange={() => setLang(opt.k as 'fr' | 'en')}
                    className="w-4 h-4 accent-accent"
                  />
                  <div>
                    <p className="text-sm text-text">{opt.l}</p>
                    <p className="text-[11px] text-text2">{opt.sub}</p>
                  </div>
                </label>
              ))}
              <p className="text-[10px] text-text2 italic">Le changement de langue s'applique au prochain démarrage.</p>
            </section>
          )}
        </>
      )}

      {/* ── Profil ─────────────────────────────────────────────────────────── */}
      {panel === 'profile' && (
        <section className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text">Mon Profil</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Pseudo / Nom" placeholder="ex: Alex" value={profileName} onChange={e => setProfileName(e.target.value)} />
            <Input label="Email" type="email" placeholder="contact@example.com" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
          </div>
          <Input label="Niche principale" placeholder="ex: Fitness, Crypto, Lifestyle…" hint="Utilisée pour la génération de contenu IA" value={profileNiche} onChange={e => setProfileNiche(e.target.value)} />
          <div className="flex gap-2 items-end">
            <Input label="Dossier export vidéo" placeholder="C:\Users\...\Videos" value={exportDir} onChange={e => setExportDir(e.target.value)} className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => alert('Sélection du dossier — IPC à brancher')}>📂</Button>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
            <Input label="Mot de passe (laisser vide pour ne pas changer)" type="password" placeholder="••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <Input label="Confirmer" type="password" placeholder="••••••" value={confirmPassword} onChange={e => setConfirm(e.target.value)} />
          </div>

          {profileEmail.trim() && profileEmail.trim() !== user.email && (
            <p className="text-xs text-warn bg-warn/10 border border-warn/20 rounded-lg px-3 py-2">
              ⚠ Un email de confirmation sera envoyé à <strong>{profileEmail.trim()}</strong> pour valider le changement.
            </p>
          )}
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
            {currentOrg ? (
              <>
                <span>🏢</span>
                <span>
                  Tu modifies les clés <strong>partagées</strong> de l'organisation <strong>"{currentOrg.name}"</strong>.
                  Elles sont utilisées par tous les membres.
                  {!canEditOrgConnexions && <span className="text-warn"> · Lecture seule (admin requis)</span>}
                </span>
              </>
            ) : (
              <>
                <span>👤</span>
                <span>Tu modifies <strong>tes</strong> clés personnelles (mode solo). Bascule sur une organisation pour gérer ses clés partagées.</span>
              </>
            )}
          </div>
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-text">Connexions GéeLark</h2>
            <Input
              label="GéeLark Bearer Token"
              type="password"
              placeholder="Token API GéeLark…"
              hint="Token API GéeLark (Settings → Open API)"
              value={bearer}
              onChange={e => setBearer(e.target.value)}
            />
            <Input
              label="Proxy SOCKS5"
              placeholder="socks5://user:pass@host:port"
              hint="Format : socks5://user:pass@host:port"
              value={proxy}
              onChange={e => setProxy(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={saveConnexions} loading={saving} disabled={!!currentOrg && !canEditOrgConnexions}>💾 Sauvegarder</Button>
              <Button variant="secondary" onClick={testProxy} loading={testingProxy}>🔌 Tester proxy + IG</Button>
            </div>
            {proxyResult && (
              <p className={`text-xs ${proxyResult.ok ? 'text-ok' : 'text-danger'}`}>
                {proxyResult.ok ? '✓' : '✗'} {proxyResult.msg}
              </p>
            )}
          </section>

          {/* Push server */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text">📲 Serveur Push (GéeLark → App)</h2>
              <p className="text-[11px] text-text2 mt-0.5">Reçoit les mises à jour en push depuis tes téléphones.</p>
            </div>
            <div className="flex gap-2 items-end">
              <Input label="Port" type="number" value={String(pushPort)} onChange={e => setPushPort(parseInt(e.target.value) || 8765)} className="w-32" />
              <span className="text-xs text-text2 mb-3">{pushRunning ? '▶ Serveur actif' : '⏹ Serveur arrêté'}</span>
              <div className="flex-1" />
              {pushRunning ? (
                <Button variant="danger" onClick={togglePush}>⏹ Arrêter</Button>
              ) : (
                <Button onClick={togglePush}>▶ Démarrer</Button>
              )}
            </div>
            {pushUrl && (
              <div className="flex items-center gap-2 px-3 py-2 bg-bg rounded-lg border border-border">
                <code className="flex-1 text-[10px] font-mono text-text2 truncate">{pushUrl}</code>
                <button onClick={() => navigator.clipboard.writeText(pushUrl)} className="text-text2 hover:text-accent text-xs">📋</button>
              </div>
            )}
          </section>

          {/* API Keys */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-text">🔑 Clés API</h2>
            <Input
              label="Groq API Key"
              type="password"
              placeholder="gsk_…"
              hint="Gratuit sur groq.com → API Keys → Create"
              value={groqKey}
              onChange={e => setGroqKey(e.target.value)}
            />
            <div>
              <label className="text-[11px] uppercase tracking-wider font-semibold text-text2 block mb-1">Instagram Session ID</label>
              <div className="flex gap-2">
                <input
                  type={showIgSession ? 'text' : 'password'}
                  value={igSession}
                  onChange={e => setIgSession(e.target.value)}
                  placeholder="longstr%3A..."
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none"
                />
                <button
                  onClick={() => setShowIgSession(v => !v)}
                  className="px-3 bg-surface2 border border-border rounded-lg text-text2 hover:text-text"
                  title="Afficher/Masquer"
                >{showIgSession ? '🙈' : '👁'}</button>
              </div>
              <p className="text-[11px] text-text2 mt-1">
                Ouvre Instagram dans Chrome → F12 → Application → Cookies → sessionid
              </p>
              {igSession && <p className="text-xs text-ok mt-1">✅ Session ID configurée</p>}
            </div>
            <Button onClick={saveConnexions} loading={saving} disabled={!!currentOrg && !canEditOrgConnexions} className="w-full">💾 Sauvegarder les clés API</Button>
          </section>
        </div>
      )}

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
