import { useState, useEffect, FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { useTr, tr } from '@/lib/i18n'

type Tab = 'login' | 'register' | 'forgot' | 'reset'

function SFLogoMark() {
  // Logo officiel ScaleFlow : tuile sombre + « S » néon lumineux (violet→rose).
  return (
    <svg width="48" height="48" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 8px 24px rgba(124,58,237,0.55))' }}>
      <defs>
        <linearGradient id="auth-tile" x1="50" y1="6" x2="50" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#23233f"/>
          <stop offset="100%" stopColor="#0a0a15"/>
        </linearGradient>
        <linearGradient id="auth-s" x1="50" y1="24" x2="50" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#E7ECFF"/>
          <stop offset="50%"  stopColor="#C4B5FD"/>
          <stop offset="100%" stopColor="#F5B8F5"/>
        </linearGradient>
        <filter id="auth-neon" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge>
        </filter>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="27"
        fill="url(#auth-tile)" stroke="rgba(150,130,255,0.28)" strokeWidth="1.5"/>
      <text x="50" y="54" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Inter', system-ui, sans-serif" fontWeight="900" fontSize="58"
        letterSpacing="-2" fill="#A855F7" filter="url(#auth-neon)" opacity="0.9">S</text>
      <text x="50" y="54" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Inter', system-ui, sans-serif" fontWeight="900" fontSize="58"
        letterSpacing="-2" fill="url(#auth-s)">S</text>
    </svg>
  )
}

interface AuthPageProps {
  initialTab?: Tab
  onResetDone?: () => void
}

export function AuthPage({ initialTab, onResetDone }: AuthPageProps = {}) {
  const tr = useTr()
  const [tab, setTab]           = useState<Tab>(initialTab ?? 'login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const [showPwd, setShowPwd]   = useState(false)

  const clearMessages = () => { setError(null); setSuccess(null) }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error

      } else if (tab === 'register') {
        if (password !== confirm) throw new Error(tr('Les mots de passe ne correspondent pas.', 'Passwords do not match.'))
        if (password.length < 6) throw new Error(tr('Le mot de passe doit faire au moins 6 caractères.', 'Password must be at least 6 characters.'))
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.user && !data.session) {
          setSuccess(tr('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.', 'Account created! Check your inbox to confirm your address.'))
        }

      } else if (tab === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setSuccess(tr('Email envoyé ! Clique sur le lien dans ta boîte mail pour réinitialiser ton mot de passe.', 'Email sent! Click the link in your inbox to reset your password.'))

      } else if (tab === 'reset') {
        if (password !== confirm) throw new Error(tr('Les mots de passe ne correspondent pas.', 'Passwords do not match.'))
        if (password.length < 6) throw new Error(tr('Le mot de passe doit faire au moins 6 caractères.', 'Password must be at least 6 characters.'))
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setSuccess(tr('Mot de passe mis à jour ! Connexion en cours…', 'Password updated! Signing in…'))
        setTimeout(() => {
          onResetDone?.()
          switchTab('login')
        }, 2000)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tr('Une erreur est survenue.', 'Something went wrong.')
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
    setShowPwd(false)
  }

  const isForgotOrReset = tab === 'forgot' || tab === 'reset'

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
          backgroundImage: 'linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="w-full max-w-sm relative z-10 anim-slide-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5 relative"
            style={{
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.2)',
              boxShadow: '0 0 40px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <SFLogoMark />
          </div>
          <h1 className="text-3xl font-bold mb-1">
            <span className="text-white">Scale</span>
            <span className="sf-text-gradient">Flow</span>
          </h1>
          <p className="text-sm" style={{ color: 'rgba(233,234,240,0.55)' }}>
            Automation & Analytics Platform
          </p>
        </div>

        {/* Card */}
        <div
          className="glass-card rounded-2xl p-6 anim-scale-in"
          style={{ animationDelay: '0.1s' }}
        >
          {/* Tabs — hidden on forgot/reset */}
          {!isForgotOrReset && (
            <div
              className="flex rounded-xl p-1 mb-6"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}
            >
              {(['login', 'register'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200"
                  style={
                    tab === t
                      ? {
                          background: 'linear-gradient(130deg, #6366F1, #818CF8)',
                          color: '#fff',
                          boxShadow: '0 2px 12px -2px rgba(99,102,241,0.5)',
                        }
                      : { color: 'rgba(233,234,240,0.6)' }
                  }
                >
                  {t === 'login' ? tr('Se connecter', 'Sign in') : tr('Créer un compte', 'Create account')}
                </button>
              ))}
            </div>
          )}

          {/* Forgot / Reset header */}
          {isForgotOrReset && (
            <div className="mb-6">
              <button
                onClick={() => switchTab('login')}
                className="flex items-center gap-1.5 text-xs mb-4 transition-opacity hover:opacity-100 opacity-60"
                style={{ color: 'rgba(233,234,240,0.8)' }}
              >
                {tr('← Retour à la connexion', '← Back to sign in')}
              </button>
              <p className="text-sm font-semibold text-white">
                {tab === 'forgot' ? tr('Mot de passe oublié', 'Forgot password') : tr('Nouveau mot de passe', 'New password')}
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(233,234,240,0.45)' }}>
                {tab === 'forgot'
                  ? tr('Entre ton email — on t\'envoie un lien de réinitialisation.', 'Enter your email — we\'ll send you a reset link.')
                  : tr('Choisis un nouveau mot de passe pour ton compte.', 'Choose a new password for your account.')}
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email — hidden on reset */}
            {tab !== 'reset' && (
              <div className="anim-page" style={{ animationDelay: '0.18s' }}>
                <Input
                  label={tr('Email', 'Email')}
                  type="email"
                  placeholder={tr('ton@email.com', 'you@email.com')}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            )}

            {/* Password — hidden on forgot */}
            {tab !== 'forgot' && (
              <div className="anim-page" style={{ animationDelay: '0.24s' }}>
                <div className="relative">
                  <Input
                    label={tab === 'reset' ? tr('Nouveau mot de passe', 'New password') : tr('Mot de passe', 'Password')}
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    hint={tab !== 'login' ? tr('6 caractères minimum', '6 characters minimum') : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-8 opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: 'rgba(233,234,240,0.8)' }}
                    tabIndex={-1}
                  >
                    {showPwd
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Confirm password */}
            {(tab === 'register' || tab === 'reset') && (
              <div className="anim-slide-down">
                <Input
                  label={tr('Confirmer le mot de passe', 'Confirm password')}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* Forgot password link — only on login */}
            {tab === 'login' && (
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={() => switchTab('forgot')}
                  className="text-xs transition-opacity hover:opacity-100 opacity-60"
                  style={{ color: 'rgba(99,102,241,0.9)' }}
                >
                  {tr('Mot de passe oublié ?', 'Forgot password?')}
                </button>
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
                {tab === 'login'    ? tr('Se connecter', 'Sign in')
                 : tab === 'register' ? tr('Créer mon compte', 'Create my account')
                 : tab === 'forgot'   ? tr('Envoyer le lien', 'Send link')
                 : tr('Enregistrer le mot de passe', 'Save password')}
              </Button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs mt-6 anim-page" style={{ animationDelay: '0.35s', color: 'rgba(99,102,241,0.45)' }}>
          {tr('Tes données sont synchronisées et sécurisées.', 'Your data is synced and secure.')}
        </p>
      </div>
    </div>
  )
}

function friendlyError(raw: string): string {
  const r = raw.toLowerCase()
  // Client-side validation messages (checked first to avoid the generic 'password' match below)
  if (r.includes('ne correspondent pas') || r.includes('do not match'))
    return tr('Les mots de passe ne correspondent pas.', 'Passwords do not match.')
  if (r.includes('au moins 6') || r.includes('at least 6'))
    return tr('Le mot de passe doit faire au moins 6 caractères.', 'Password must be at least 6 characters.')
  if (r.includes('invalid login') || r.includes('invalid credentials'))
    return tr('Email ou mot de passe incorrect.', 'Incorrect email or password.')
  if (r.includes('email not confirmed'))
    return tr('Email non confirmé — vérifie ta boîte mail.', 'Email not confirmed — check your inbox.')
  if (r.includes('user already registered') || r.includes('already registered'))
    return tr('Un compte existe déjà avec cet email.', 'An account already exists with this email.')
  if (r.includes('password'))
    return tr('Mot de passe trop court (6 caractères minimum).', 'Password too short (6 characters minimum).')
  if (r.includes('rate limit'))
    return tr('Trop de tentatives. Réessaie dans quelques minutes.', 'Too many attempts. Try again in a few minutes.')
  if (r.includes('network') || r.includes('fetch'))
    return tr('Erreur réseau. Vérifie ta connexion internet.', 'Network error. Check your internet connection.')
  if (r.includes('expired') || r.includes('invalid') || r.includes('otp'))
    return tr('Lien expiré ou invalide. Redemande un nouveau lien.', 'Link expired or invalid. Request a new one.')
  return raw
}
