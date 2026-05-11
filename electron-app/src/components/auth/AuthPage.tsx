import { useState, FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

type Tab = 'login' | 'register'

function SFLogoMark() {
  return (
    <svg width="38" height="38" viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="auth-main" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1d4ed8"/>
          <stop offset="28%"  stopColor="#3b5af0"/>
          <stop offset="58%"  stopColor="#7c3aed"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <linearGradient id="auth-depth" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0c1f6e"/>
          <stop offset="55%"  stopColor="#2e1065"/>
          <stop offset="100%" stopColor="#3b0764"/>
        </linearGradient>
        <linearGradient id="auth-arr" x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#db2777"/>
          <stop offset="100%" stopColor="#f472b6"/>
        </linearGradient>
      </defs>
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#auth-depth)" strokeWidth="18" strokeLinecap="round" fill="none"
        transform="translate(2.5,4.5)" opacity="0.65"
      />
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#auth-main)" strokeWidth="16" strokeLinecap="round" fill="none"
      />
      <line x1="66" y1="22" x2="88" y2="2" stroke="url(#auth-arr)" strokeWidth="11" strokeLinecap="round"/>
      <line x1="77" y1="1" x2="90" y2="1" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
      <line x1="90" y1="1" x2="90" y2="15" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
    </svg>
  )
}

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
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        if (password !== confirm) throw new Error('Les mots de passe ne correspondent pas.')
        if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères.')

        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error

        if (data.user && !data.session) {
          setSuccess('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.')
        }
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
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: '#05030f' }}
    >
      {/* Aurora background */}
      <div
        className="sf-aurora absolute"
        style={{ width: 700, height: 700, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(139,92,246,1) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="w-full max-w-sm relative z-10 anim-slide-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5 relative"
            style={{
              background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.2)',
              boxShadow: '0 0 40px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <SFLogoMark />
          </div>
          <h1 className="text-3xl font-bold mb-1">
            <span className="text-white">Scale</span>
            <span className="sf-text-gradient">Flow</span>
          </h1>
          <p className="text-sm" style={{ color: 'rgba(196,181,253,0.55)' }}>
            Automation & Analytics Platform
          </p>
        </div>

        {/* Card */}
        <div
          className="glass-card rounded-2xl p-6 anim-scale-in"
          style={{ animationDelay: '0.1s' }}
        >
          {/* Tabs */}
          <div
            className="flex rounded-xl p-1 mb-6"
            style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}
          >
            {(['login', 'register'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200"
                style={
                  tab === t
                    ? {
                        background: 'linear-gradient(130deg, #7c3aed, #ec4899)',
                        color: '#fff',
                        boxShadow: '0 2px 12px -2px rgba(124,58,237,0.5)',
                      }
                    : { color: 'rgba(196,181,253,0.6)' }
                }
              >
                {t === 'login' ? 'Se connecter' : 'Créer un compte'}
              </button>
            ))}
          </div>

          {/* Form */}
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

            {error && (
              <div
                className="px-4 py-3 rounded-xl text-sm anim-slide-down flex items-start gap-2"
                style={{
                  background: 'rgba(240,61,85,0.08)',
                  border: '1px solid rgba(240,61,85,0.25)',
                  color: '#f87171',
                }}
              >
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div
                className="px-4 py-3 rounded-xl text-sm anim-slide-down flex items-start gap-2"
                style={{
                  background: 'rgba(52,211,153,0.08)',
                  border: '1px solid rgba(52,211,153,0.25)',
                  color: '#34d399',
                }}
              >
                <span className="flex-shrink-0 mt-0.5">✓</span>
                <span>{success}</span>
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

        <p className="text-center text-xs mt-6 anim-page" style={{ animationDelay: '0.35s', color: 'rgba(139,92,246,0.45)' }}>
          Tes données sont synchronisées et sécurisées.
        </p>
      </div>
    </div>
  )
}

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
