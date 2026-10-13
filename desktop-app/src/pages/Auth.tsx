// Connexion ScaleFlow (React, même identité que l'app) : connexion, création de compte,
// mot de passe oublié (lien par email) et nouveau mot de passe (retour du lien), plus
// « Continuer avec Google » sur le web. Remplace l'ancien login.dc.html.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { IS_WEB } from '@/lib/platform'
import { useNarrow } from '@/lib/ui'
import { SPOT_KEYFRAMES, VisualLinks, VisualViral } from '@/components/LaunchSpotlight'

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset'

/** Pur : message clair pour une erreur Supabase Auth. */
export function authErrorMessage(msg: string): string {
  const m = msg.toLowerCase()
  if (/invalid login credentials|invalid_credentials/.test(m)) return 'Email ou mot de passe incorrect.'
  if (/email not confirmed/.test(m)) return 'Confirme d’abord ton email (regarde ta boîte de réception, et les spams).'
  if (/user already registered|already been registered/.test(m)) return 'Un compte existe déjà avec cet email — connecte-toi.'
  if (/password should be at least|weak password/.test(m)) return 'Mot de passe trop court (8 caractères minimum).'
  if (/rate limit|too many/.test(m)) return 'Trop de tentatives — réessaie dans quelques minutes.'
  if (/provider is not enabled|unsupported provider/.test(m)) return 'La connexion Google n’est pas encore activée.'
  if (/network|fetch/.test(m)) return 'Connexion impossible — vérifie ton réseau.'
  return msg
}

/** Pur : force d'un mot de passe, de 0 à 4. */
export function passwordScore(pw: string): number {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return s
}

const appUrl = () => `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}index.html`
const field: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#0E0E10', color: '#EDEDEF', fontSize: 14.5, outline: 'none', boxSizing: 'border-box' }

export default function Auth({ initial = 'login', onDone }: { initial?: AuthMode; onDone?: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initial)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const narrow = useNarrow(900)
  const go = (m: AuthMode) => { setMode(m); setErr(null); setInfo(null) }

  async function submit() {
    if (busy) return
    setErr(null); setInfo(null)
    const e = email.trim()
    if (mode !== 'reset' && !/^\S+@\S+\.\S+$/.test(e)) { setErr('Entre une adresse email valide.'); return }
    if ((mode === 'login' || mode === 'signup' || mode === 'reset') && !pw) { setErr('Entre ton mot de passe.'); return }
    if ((mode === 'signup' || mode === 'reset') && pw.length < 8) { setErr('8 caractères minimum.'); return }
    if (mode === 'reset' && pw !== pw2) { setErr('Les deux mots de passe ne correspondent pas.'); return }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password: pw })
        if (error) throw error
        onDone?.()
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: e, password: pw, options: { emailRedirectTo: appUrl() } })
        if (error) throw error
        if (data.session) onDone?.()
        else setInfo('Compte créé ! Clique sur le lien reçu par email pour l’activer, puis connecte-toi.')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: `${appUrl()}?auth=reset` })
        if (error) throw error
        setInfo('C’est envoyé ! Ouvre le lien reçu par email pour choisir un nouveau mot de passe.')
      } else {
        const { error } = await supabase.auth.updateUser({ password: pw })
        if (error) throw error
        setInfo('Mot de passe modifié ✓')
        setTimeout(() => onDone?.(), 900)
      }
    } catch (x) {
      setErr(authErrorMessage(x instanceof Error ? x.message : String(x)))
    } finally { setBusy(false) }
  }
  async function google() {
    setErr(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } })
    if (error) setErr(authErrorMessage(error.message))
  }

  const TITLES: Record<AuthMode, [string, string]> = {
    login: ['Bon retour 👋', 'Connecte-toi pour piloter tes comptes.'],
    signup: ['Crée ton compte', 'Quelques secondes et tu es prêt à scaler.'],
    forgot: ['Mot de passe oublié', 'On t’envoie un lien pour en choisir un nouveau.'],
    reset: ['Nouveau mot de passe', 'Choisis un mot de passe d’au moins 8 caractères.'],
  }
  const score = passwordScore(pw)
  const cta = { login: 'Se connecter', signup: 'Créer mon compte', forgot: 'Envoyer le lien', reset: 'Enregistrer' }[mode]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0A0A0B', color: '#EDEDEF' }}>
      <style>{SPOT_KEYFRAMES}</style>
      {/* Vitrine animée */}
      {!narrow && (
        <div style={{ position: 'relative', flex: '1 1 52%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '40px 48px', overflow: 'hidden', background: 'radial-gradient(120% 90% at 10% 0%, #6D28D9 0%, #2E1065 40%, #0A0A0B 85%)' }}>
          <span style={{ position: 'absolute', width: 380, height: 380, borderRadius: 999, background: '#EC4899', filter: 'blur(110px)', opacity: 0.35, bottom: -140, right: -80, animation: 'sfsGlow 10s ease-in-out infinite' }} />
          <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: '#fff', color: '#5B21B6' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 8h14M5 16h9" /></svg>
            </span>scaleflow
          </span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, flex: 1, padding: '30px 0' }}>
            <div style={{ transform: 'scale(.9)' }}><VisualLinks /></div>
            <div style={{ transform: 'scale(.8)', marginLeft: -20 }}><VisualViral /></div>
          </div>
          <div style={{ position: 'relative', maxWidth: 480 }}>
            <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.08, fontWeight: 700, letterSpacing: '-0.04em' }}>Toute ton agence, en pilote automatique.</h1>
            <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.55, color: 'rgba(255,255,255,0.72)' }}>Publie sur des centaines de comptes Instagram et TikTok, suis tes liens et repère les Reels qui explosent.</p>
          </div>
        </div>
      )}

      {/* Formulaire */}
      <div style={{ flex: '1 1 48%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: narrow ? '32px 20px' : 40 }}>
        <form onSubmit={e => { e.preventDefault(); void submit() }} key={mode} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14, animation: 'sfsPop .4s both' }}>
          {narrow && <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>scaleflow</span>}
          <div>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>{TITLES[mode][0]}</h2>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: '#8B8B94' }}>{TITLES[mode][1]}</p>
          </div>

          {(mode === 'login' || mode === 'signup') && IS_WEB && (<>
            <button type="button" onClick={() => void google()} style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: '#fff', color: '#111', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
              Continuer avec Google
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#52525B', fontSize: 12 }}><span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />ou avec ton email<span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} /></div>
          </>)}

          {mode !== 'reset' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: '#A1A1AA' }}>Email</span>
              <input type="email" autoFocus autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@agence.fr" style={field} />
            </label>
          )}
          {mode !== 'forgot' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 500, color: '#A1A1AA' }}>
                {mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}
                {mode === 'login' && <button type="button" onClick={() => go('forgot')} style={{ border: 'none', background: 'none', padding: 0, color: '#C4BBFB', fontSize: 12.5, cursor: 'pointer' }}>Mot de passe oublié ?</button>}
              </span>
              <span style={{ position: 'relative' }}>
                <input type={show ? 'text' : 'password'} autoFocus={mode === 'reset'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" style={{ ...field, paddingRight: 70 }} />
                <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 8, top: 8, height: 28, padding: '0 10px', border: 'none', borderRadius: 7, background: 'rgba(255,255,255,0.06)', color: '#A1A1AA', fontSize: 12, cursor: 'pointer' }}>{show ? 'Cacher' : 'Voir'}</button>
              </span>
              {(mode === 'signup' || mode === 'reset') && pw && (
                <span style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  {[0, 1, 2, 3].map(i => <span key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i < score ? ['#F87171', '#FBBF24', '#A3E635', '#4ADE80'][score - 1] : 'rgba(255,255,255,0.08)', transition: 'background .2s ease' }} />)}
                </span>
              )}
            </label>
          )}
          {mode === 'reset' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: '#A1A1AA' }}>Confirmer</span>
              <input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="••••••••" style={field} />
            </label>
          )}

          {err && <div role="alert" style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#FCA5A5', fontSize: 13, lineHeight: 1.45 }}>{err}</div>}
          {info && <div role="status" style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#86EFAC', fontSize: 13, lineHeight: 1.45 }}>{info}</div>}

          <button type="submit" disabled={busy} style={{ height: 46, border: 'none', borderRadius: 10, background: 'linear-gradient(135deg, #8B5CF6, #EC4899)', color: '#fff', fontSize: 15, fontWeight: 650, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, boxShadow: '0 12px 30px -12px rgba(139,92,246,.7)' }}>
            {busy ? '…' : cta}
          </button>

          <div style={{ textAlign: 'center', fontSize: 13.5, color: '#8B8B94' }}>
            {mode === 'login' && <>Pas encore de compte ? <button type="button" onClick={() => go('signup')} style={{ border: 'none', background: 'none', padding: 0, color: '#EDEDEF', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 }}>Créer un compte</button></>}
            {mode === 'signup' && <>Déjà un compte ? <button type="button" onClick={() => go('login')} style={{ border: 'none', background: 'none', padding: 0, color: '#EDEDEF', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 }}>Se connecter</button></>}
            {mode === 'forgot' && <button type="button" onClick={() => go('login')} style={{ border: 'none', background: 'none', padding: 0, color: '#EDEDEF', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 }}>← Retour à la connexion</button>}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: '#52525B' }}>🔒 Connexion chiffrée · tes données restent privées</div>
        </form>
      </div>
    </div>
  )
}
