import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

interface SettingsProps { user: User }

const THEMES = ['Bleu', 'Violet', 'Ambre', 'Rouge', 'Cyan', 'Rose', 'Vert']
const THEME_COLORS: Record<string, string> = {
  Bleu: '#4f9eff', Violet: '#a56ef5', Ambre: '#ffb830',
  Rouge: '#ff5c6e', Cyan: '#00e5d4', Rose: '#ff6ec7', Vert: '#2dde78',
}

type Panel = 'general' | 'profile' | 'connexions'

export function Settings({ user }: SettingsProps) {
  const [panel, setPanel]         = useState<Panel>('general')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  // General / appearance
  const [theme, setTheme]         = useState('Bleu')

  // Profile
  const [profileName, setProfileName]   = useState('')
  const [profileNiche, setProfileNiche] = useState('')

  // Connexions
  const [bearer, setBearer]       = useState('')
  const [groqKey, setGroqKey]     = useState('')

  useEffect(() => {
    supabase.from('app_config').select('*').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setBearer(data.bearer_token ?? '')
          setGroqKey(data.groq_api_key ?? '')
          setTheme(data.theme ?? 'Bleu')
          setProfileName(data.profile_name ?? '')
          setProfileNiche(data.profile_niche ?? '')
        }
        setLoading(false)
      })
  }, [])

  async function save() {
    setSaving(true); setSaved(false); setError(null)
    const { error: err } = await supabase.from('app_config').upsert({
      user_id:       user.id,
      bearer_token:  bearer.trim(),
      groq_api_key:  groqKey.trim(),
      theme,
      profile_name:  profileName.trim(),
      profile_niche: profileNiche.trim(),
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (err) setError('Erreur lors de la sauvegarde.')
    else { setSaved(true); setTimeout(() => setSaved(false), 3000) }
    setSaving(false)
  }

  if (loading) return (
    <div className="p-8 space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-12 bg-surface2 rounded-xl animate-pulse" />)}
    </div>
  )

  const NAV: { key: Panel; label: string }[] = [
    { key: 'general',    label: 'Général'    },
    { key: 'profile',    label: 'Profil'     },
    { key: 'connexions', label: 'Connexions' },
  ]

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-text">Paramètres</h1>
        <p className="text-text2 text-sm mt-1">Configuration de l'application</p>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 bg-surface2 rounded-lg p-1 w-fit">
        {NAV.map(({ key, label }) => (
          <button key={key} onClick={() => setPanel(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              panel === key ? 'bg-accent text-white' : 'text-text2 hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── General ──────────────────────────────────────────────────────────── */}
      {panel === 'general' && (
        <div className="space-y-5">
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text">🎨 Thème de couleur</h2>
              <p className="text-xs text-text2 mt-1">Couleur d'accentuation de l'interface</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {THEMES.map(t => (
                <button key={t} onClick={() => setTheme(t)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-all ${
                    theme === t ? 'border-accent bg-accent/10 text-text' : 'border-border text-text2 hover:border-accent/40'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: THEME_COLORS[t] }} />
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-semibold text-text">👤 Compte</h2>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold">
                {user.email?.[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm text-text">{user.email}</p>
                <p className="text-xs text-text2">Connecté via Supabase Auth</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Profile ──────────────────────────────────────────────────────────── */}
      {panel === 'profile' && (
        <div className="space-y-5">
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-text">Profil</h2>
            <Input
              label="Pseudo / Nom"
              placeholder="Mon nom ou pseudo"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
            />
            <Input
              label="Niche principale"
              placeholder="ex: Fitness, Crypto, Mode, Lifestyle…"
              value={profileNiche}
              onChange={e => setProfileNiche(e.target.value)}
              hint="Utilisée pour la génération de contenu par IA"
            />
          </section>
        </div>
      )}

      {/* ── Connexions ────────────────────────────────────────────────────────── */}
      {panel === 'connexions' && (
        <div className="space-y-5">
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text">🔑 Bearer Token GéeLark</h2>
              <p className="text-xs text-text2 mt-1">
                <span className="text-accent">app.geelark.com</span> → Profile → API → Créer un token
              </p>
            </div>
            <Input
              label="Bearer Token"
              type="password"
              placeholder="Colle ton token ici…"
              value={bearer}
              onChange={e => setBearer(e.target.value)}
            />
            {bearer && <p className="text-xs text-ok">✓ Token configuré ({bearer.length} caractères)</p>}
          </section>

          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text">✨ Clé API Groq</h2>
              <p className="text-xs text-text2 mt-1">
                Optionnel — pour la génération de captions IA.<br />
                Gratuit sur <span className="text-accent">console.groq.com</span> (14 400 req/jour avec Llama 3).
              </p>
            </div>
            <Input
              label="Groq API Key"
              type="password"
              placeholder="gsk_…"
              value={groqKey}
              onChange={e => setGroqKey(e.target.value)}
            />
            {groqKey && <p className="text-xs text-ok">✓ Clé Groq configurée</p>}
          </section>
        </div>
      )}

      {/* Save */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{error}</div>
      )}
      <div className="flex items-center gap-4">
        <Button onClick={save} loading={saving}>💾 Sauvegarder</Button>
        {saved && <span className="text-sm text-ok animate-fade-in">✓ Sauvegardé !</span>}
      </div>
    </div>
  )
}
