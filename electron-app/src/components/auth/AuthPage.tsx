import { useState, FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { ScaleFlowBadge } from '@/components/ui/ScaleFlowLogo'

type Tab = 'login' | 'register'

export function AuthPage() {
  const [tab, setTab]           = useState<Tab>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)

  const clearMessages = () => { setError(null); setSuccess(null) }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    try {
      if (tab === 'login') {
        // ── Connexion ───────────────────────────────────────────────────────
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // Si OK → useAuth() détecte la nouvelle session et App.tsx bascule sur Dashboard

      } else {
        // ── Inscription ────────────────────────────────────────────────────
        if (password !== confirm) {
          throw new Error('Les mots de passe ne correspondent pas.')
        }
        if (password.length < 6) {
          throw new Error('Le mot de passe doit faire au moins 6 caractères.')
        }

        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error

        // Si email de confirmation activé dans Supabase
        if (data.user && !data.session) {
          setSuccess('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.')
        }
        // Si confirmation désactivée → connexion auto → App bascule sur Dashboard
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Une erreur est survenue.'
      setError(friendlyError(msg))
    } finally {
      setLoading(false)
    }
  }

  function switchTab(t: Tab) {
    setTab(t)
    clearMessages()
    setPassword('')
    setConfirm('')
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm anim-slide-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mb-4 anim-bounce-in" style={{ animationDelay: '0.05s' }}>
            <ScaleFlowBadge size={64} />
          </div>
          <h1 className="text-2xl font-bold text-text anim-page" style={{ animationDelay: '0.15s' }}>ScaleFlow</h1>
          <p className="text-text2 text-sm mt-1 anim-page" style={{ animationDelay: '0.22s' }}>Dashboard professionnel</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 anim-scale-in shadow-[0_24px_64px_-16px_rgba(0,0,0,0.5)]" style={{ animationDelay: '0.1s' }}>

          {/* Onglets */}
          <div className="flex bg-surface2 rounded-xl p-1 mb-6">
            {(['login', 'register'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`
                  flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200
                  ${tab === t
                    ? 'bg-accent text-white shadow-[0_2px_8px_-2px_rgba(79,142,247,0.5)]'
                    : 'text-text2 hover:text-text hover:bg-surface3/50'
                  }
                `}
              >
                {t === 'login' ? 'Se connecter' : 'Créer un compte'}
              </button>
            ))}
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="anim-page" style={{ animationDelay: '0.18s' }}>
              <Input
                label="Email"
                type="email"
                placeholder="ton@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="anim-page" style={{ animationDelay: '0.24s' }}>
              <Input
                label="Mot de passe"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                hint={tab === 'register' ? '6 caractères minimum' : undefined}
              />
            </div>

            {tab === 'register' && (
              <div className="anim-slide-down">
                <Input
                  label="Confirmer le mot de passe"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* Messages */}
            {error && (
              <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm anim-slide-down flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">⚠</span><span>{error}</span>
              </div>
            )}
            {success && (
              <div className="px-4 py-3 rounded-xl bg-ok/10 border border-ok/30 text-ok text-sm anim-slide-down flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">✓</span><span>{success}</span>
              </div>
            )}

            <div className="anim-page" style={{ animationDelay: '0.3s' }}>
              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
                className="mt-2"
              >
                {tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
              </Button>
            </div>
          </form>
        </div>

        <p className="text-center text-text2 text-xs mt-6 anim-page" style={{ animationDelay: '0.35s' }}>
          Tes données sont synchronisées et sécurisées.
        </p>
      </div>
    </div>
  )
}

// Traduit les erreurs Supabase en français
function friendlyError(raw: string): string {
  const r = raw.toLowerCase()
  if (r.includes('invalid login') || r.includes('invalid credentials'))
    return 'Email ou mot de passe incorrect.'
  if (r.includes('email not confirmed'))
    return 'Email non confirmé — vérifie ta boîte mail.'
  if (r.includes('user already registered') || r.includes('already registered'))
    return 'Un compte existe déjà avec cet email.'
  if (r.includes('password'))
    return 'Mot de passe trop court (6 caractères minimum).'
  if (r.includes('rate limit'))
    return 'Trop de tentatives. Réessaie dans quelques minutes.'
  if (r.includes('network') || r.includes('fetch'))
    return 'Erreur réseau. Vérifie ta connexion internet.'
  return raw
}
