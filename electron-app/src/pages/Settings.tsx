import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type AppConfig } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

interface SettingsProps {
  user: User
}

const THEMES = ['Bleu', 'Violet', 'Ambre', 'Rouge', 'Cyan', 'Rose', 'Vert']
const THEME_COLORS: Record<string, string> = {
  Bleu:   '#4f9eff',
  Violet: '#a56ef5',
  Ambre:  '#ffb830',
  Rouge:  '#ff5c6e',
  Cyan:   '#00e5d4',
  Rose:   '#ff6ec7',
  Vert:   '#2dde78',
}

export function Settings({ user }: SettingsProps) {
  const [bearer, setBearer]   = useState('')
  const [theme,  setTheme]    = useState('Bleu')
  const [saving, setSaving]   = useState(false)
  const [saved,  setSaved]    = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    setLoading(true)
    const { data } = await supabase
      .from('app_config')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setBearer(data.bearer_token ?? '')
      setTheme(data.theme ?? 'Bleu')
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)

    const record: Partial<AppConfig> = {
      user_id:      user.id,
      bearer_token: bearer.trim(),
      theme,
      updated_at:   new Date().toISOString(),
    }

    const { error: err } = await supabase
      .from('app_config')
      .upsert(record, { onConflict: 'user_id' })

    if (err) {
      setError('Erreur lors de la sauvegarde.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-6 w-32 bg-surface2 rounded animate-pulse mb-2" />
        <div className="h-4 w-48 bg-surface2 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Paramètres</h1>
        <p className="text-text2 text-sm mt-1">Configuration de l'application</p>
      </div>

      {/* GéeLark Token */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-text">🔑 Token GéeLark</h2>
          <p className="text-xs text-text2 mt-1">
            Trouve ton Bearer Token sur <span className="text-accent">app.geelark.com → Profile → API</span>
          </p>
        </div>
        <Input
          label="Bearer Token"
          type="password"
          placeholder="Colle ton token ici…"
          value={bearer}
          onChange={e => setBearer(e.target.value)}
        />
        {bearer && (
          <p className="text-xs text-ok">
            ✓ Token enregistré — {bearer.length} caractères
          </p>
        )}
      </section>

      {/* Thème */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-text">🎨 Thème de couleur</h2>
          <p className="text-xs text-text2 mt-1">Couleur d'accentuation de l'interface</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {THEMES.map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-all
                ${theme === t
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border text-text2 hover:border-accent/40 hover:text-text'
                }
              `}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: THEME_COLORS[t] }}
              />
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-text2">
          Note : le changement de thème sera pleinement actif dans une prochaine version.
        </p>
      </section>

      {/* Account */}
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

      {/* Error / Save */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <Button onClick={save} loading={saving}>
          💾 Sauvegarder
        </Button>
        {saved && (
          <span className="text-sm text-ok animate-fade-in">✓ Sauvegardé !</span>
        )}
      </div>
    </div>
  )
}
