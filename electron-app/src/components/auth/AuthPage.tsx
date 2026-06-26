import { useState, useEffect, FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

type Tab = 'login' | 'register' | 'forgot' | 'reset'

function SFLogoMark() {
  return (
    <svg width="38" height="38" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="auth-g" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%"   stopColor="#60aaff"/>
          <stop offset="50%"  stopColor="#8866ff"/>
          <stop offset="100%" stopColor="#aa44ff"/>
        </linearGradient>
        <filter id="auth-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" result="b"/>
          <feColorMatrix in="b" type="matrix" values="1 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0 1  0 0 0 1 0" result="c"/>
          <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="auth-bloom" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="16" result="b2"/>
          <feColorMatrix in="b2" type="matrix" values="1 0 0 0 0.3  0 0 0 0 0.15  0 0 0 0 1  0 0 0 0.5 0"/>
        </filter>
      </defs>
      <text x="100" y="148" textAnchor="middle"
        fontFamily="'Arial Rounded MT Bold','Arial Black','Helvetica Neue',Arial,sans-serif"
        fontWeight="900" fontSize="148" fill="url(#auth-g)"
        filter="url(#auth-bloom)">S</text>
      <text x="100" y="148" textAnchor="middle"
        fontFamily="'Arial Rounded MT Bold','Arial Black','Helvetica Neue',Arial,sans-serif"
        fontWeight="900" fontSize="148" fill="url(#auth-g)"
        filter="url(#auth-glow)">S</text>
    </svg>
  )
}

interface AuthPageProps {
  initialTab?: Tab
  onResetDone?: () => void
}

export function AuthPage({ initialTab, onResetDone }: AuthPageProps = {}) {
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
        if (password !== confirm) throw new Error('Les mots de passe ne correspondent pas.')
        if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères.')
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.user && !data.session) {
          setSuccess('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.')
        }

      } else if (tab === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setSuccess('Email envoyé ! Clique sur le lien dans ta boîte mail pour réinitialiser ton mot de passe.')

      } else if (tab === 'reset') {
        if (password !== confirm) throw new Error('Les mots de passe ne correspondent pas.')
        if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setSuccess('Mot de passe mis à jour ! Connexion en cours…')
        setTimeout(() => {
          onResetDone?.()
          switchTab('login')
        }, 2000)
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
                  {t === 'login' ? 'Se connecter' : 'Créer un compte'}
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
                ← Retour à la connexion
              </button>
              <p className="text-sm font-semibold text-white">
                {tab === 'forgot' ? 'Mot de passe oublié' : 'Nouveau mot de passe'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(233,234,240,0.45)' }}>
                {tab === 'forgot'
                  ? 'Entre ton email — on t\'envoie un lien de réinitialisation.'
                  : 'Choisis un nouveau mot de passe pour ton compte.'}
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email — hidden on reset */}
            {tab !== 'reset' && (
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
            )}

            {/* Password — hidden on forgot */}
            {tab !== 'forgot' && (
              <div className="anim-page" style={{ animationDelay: '0.24s' }}>
                <div className="relative">
                  <Input
                    label={tab === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    hint={tab !== 'login' ? '6 caractères minimum' : undefined}
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
                  label="Confirmer le mot de passe"
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
                  Mot de passe oublié ?
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
                {tab === 'login'    ? 'Se connecter'
                 : tab === 'register' ? 'Créer mon compte'
                 : tab === 'forgot'   ? 'Envoyer le lien'
                 : 'Enregistrer le mot de passe'}
              </Button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs mt-6 anim-page" style={{ animationDelay: '0.35s', color: 'rgba(99,102,241,0.45)' }}>
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
  if (r.includes('expired') || r.includes('invalid') || r.includes('otp'))
    return 'Lien expiré ou invalide. Redemande un nouveau lien.'
  return raw
}
