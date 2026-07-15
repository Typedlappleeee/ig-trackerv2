import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useTr } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

interface OnboardingProps {
  user:       User
  onComplete: () => void
  // If set, save credentials to org_config (org-scoped) instead of app_config (user-scoped).
  orgId?:     string | null
}

type Step = 1 | 2
type TestState = 'idle' | 'testing' | 'ok' | 'fail'

function openExternal(url: string) {
  window.open(url, '_blank')
}

function SFLogoMark() {
  // Logo officiel ScaleFlow : tuile sombre + « S » néon lumineux (violet→rose).
  return (
    <svg width="36" height="36" viewBox="0 0 100 100" fill="none"
      style={{ filter: 'drop-shadow(0 6px 18px rgba(124,58,237,0.55))' }}>
      <defs>
        <linearGradient id="ob-tile" x1="50" y1="6" x2="50" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#23233f"/>
          <stop offset="100%" stopColor="#0a0a15"/>
        </linearGradient>
        <linearGradient id="ob-s" x1="50" y1="24" x2="50" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#E7ECFF"/>
          <stop offset="50%"  stopColor="#C4B5FD"/>
          <stop offset="100%" stopColor="#F5B8F5"/>
        </linearGradient>
        <filter id="ob-neon" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge>
        </filter>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="27"
        fill="url(#ob-tile)" stroke="rgba(150,130,255,0.28)" strokeWidth="1.5"/>
      <text x="50" y="54" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Inter', system-ui, sans-serif" fontWeight="900" fontSize="58"
        letterSpacing="-2" fill="#A855F7" filter="url(#ob-neon)" opacity="0.9">S</text>
      <text x="50" y="54" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Inter', system-ui, sans-serif" fontWeight="900" fontSize="58"
        letterSpacing="-2" fill="url(#ob-s)">S</text>
    </svg>
  )
}

export function Onboarding({ user, onComplete, orgId }: OnboardingProps) {
  const [step, setStep]          = useState<Step>(1)
  const [bearer, setBearer]      = useState('')
  const [bearerState, setBState] = useState<TestState>('idle')
  const [bearerMsg, setBMsg]     = useState('')
  const [saving, setSaving]      = useState(false)
  const [saveErr, setSaveErr]    = useState<string | null>(null)
  const tr = useTr()

  async function testBearer() {
    if (!bearer.trim()) return
    setBState('testing'); setBMsg('')
    try {
      const r = await window.electronAPI!.geelarkRequest({
        method: 'POST',
        url: 'https://openapi.geelark.com/open/v1/phone/list',
        headers: { Authorization: `Bearer ${bearer.trim()}` },
        body: { page: 1, pageSize: 1 },
      })
      const d = r.data as Record<string, unknown>
      if (r.ok && d?.['code'] === 0) {
        const total = ((d['data'] as Record<string, unknown>)?.['total'] as number) ?? 0
        setBState('ok')
        setBMsg(tr(
          `✓ Token valide — ${total} téléphone${total !== 1 ? 's' : ''} trouvé${total !== 1 ? 's' : ''} dans ton compte GéeLark.`,
          `✓ Valid token — ${total} phone${total !== 1 ? 's' : ''} found in your GeeLark account.`,
        ))
      } else {
        setBState('fail')
        setBMsg(tr(
          `✗ Token invalide : ${(d?.['msg'] as string) ?? 'vérification échouée'}. Vérifie que tu copies bien la valeur "API Key" (pas l’App ID).`,
          `✗ Invalid token: ${(d?.['msg'] as string) ?? 'verification failed'}. Make sure you copy the "API Key" value (not the App ID).`,
        ))
      }
    } catch (e) {
      setBState('fail')
      setBMsg(tr(
        `✗ Erreur réseau : ${e instanceof Error ? e.message : String(e)}`,
        `✗ Network error: ${e instanceof Error ? e.message : String(e)}`,
      ))
    }
  }

  async function finish() {
    if (!bearer.trim()) return
    setSaving(true); setSaveErr(null)
    const now = new Date().toISOString()
    let error: { message: string } | null = null
    if (orgId) {
      const r = await supabase.from('org_config').upsert({
        org_id:       orgId,
        bearer_token: bearer.trim(),
        updated_at:   now,
      }, { onConflict: 'org_id' })
      error = r.error
      await supabase.from('app_config').upsert({
        user_id: user.id, onboarded_at: now, theme: 'Bleu', updated_at: now,
      }, { onConflict: 'user_id' })
    } else {
      const r = await supabase.from('app_config').upsert({
        user_id:      user.id,
        bearer_token: bearer.trim(),
        theme:        'Bleu',
        onboarded_at: now,
        updated_at:   now,
      }, { onConflict: 'user_id' })
      error = r.error
    }
    setSaving(false)
    if (error) {
      setSaveErr(tr(`Impossible de sauvegarder : ${error.message}. Vérifie ta connexion et réessaie.`, `Unable to save: ${error.message}. Check your connection and try again.`))
      return
    }
    onComplete()
  }

  async function skip() {
    setSaving(true); setSaveErr(null)
    const now = new Date().toISOString()
    const { error } = await supabase.from('app_config').upsert({
      user_id:      user.id,
      onboarded_at: now,
      updated_at:   now,
    }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) {
      if (/onboarded_at/i.test(error.message)) {
        await supabase.from('app_config').upsert({
          user_id: user.id, theme: 'Bleu', updated_at: now,
        }, { onConflict: 'user_id' })
      } else {
        setSaveErr(tr(`Impossible de sauvegarder : ${error.message}.`, `Unable to save: ${error.message}.`))
        return
      }
    }
    onComplete()
  }

  function StateIcon({ s }: { s: TestState }) {
    if (s === 'testing') return <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
    if (s === 'ok')      return <svg className="text-ok" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
    if (s === 'fail')    return <svg className="text-danger" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    return null
  }

  const sfAccent    = { color: '#6366F1' }
  const sfUnderline = { color: '#818CF8', textDecoration: 'underline', textUnderlineOffset: '2px' }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: '#05030f' }}
    >
      <div className="sf-aurora absolute" style={{ width: 600, height: 600, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)', backgroundSize: '48px 48px' }}
      />

      <button
        onClick={skip}
        disabled={saving}
        className="sf-btn sf-btn-secondary sf-btn-sm sf-press"
        style={{ position: 'absolute', top: 'var(--sp-5)', right: 'var(--sp-6)', zIndex: 20 }}
      >
        {tr('Ignorer pour l’instant →', 'Skip for now →')}
      </button>

      <div className="w-full max-w-lg relative z-10 sf-stack" style={{ gap: 'var(--sp-6)' }}>

        {/* Logo + title */}
        <div className="text-center sf-anim-slide-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <div className="sf-anim-scale-spring" style={{ width: 64, height: 64, borderRadius: 'var(--r-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.08)', border: '1px solid var(--border-accent)', boxShadow: 'var(--glow-accent)' }}>
            <SFLogoMark />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              <span style={{ color: 'var(--text-1)' }}>{tr('Bienvenue sur ', 'Welcome to ')}</span>
              <span className="sf-text-gradient">ScaleFlow</span>
            </h1>
            <p className="sf-page-sub" style={{ marginTop: 4 }}>{tr('Une seule chose pour commencer.', 'Just one thing to get started.')}</p>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center" style={{ gap: 'var(--sp-3)' }}>
          {[1, 2].map(n => (
            <div key={n} style={{ height: 6, borderRadius: 99, transition: 'all var(--t-base)', width: step === n ? 28 : 6, background: step >= n ? 'var(--accent)' : 'var(--border-accent)' }} />
          ))}
        </div>

        {/* ── STEP 1: GéeLark token ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="sf-card sf-glass sf-anim-slide-up sf-d50 sf-stack" style={{ padding: 'var(--sp-6)', gap: 'var(--sp-5)' }}>
            <div className="sf-cluster" style={{ gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
              <div className="sf-page-icon sf-page-icon-sm"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4zM12 18h.01" /></svg></div>
              <div style={{ minWidth: 0 }}>
                <h2 className="sf-page-title" style={{ fontSize: 18 }}>{tr('Token GéeLark', 'GeeLark token')}</h2>
                <p className="sf-page-sub" style={{ marginTop: 4 }}>{tr('Requis pour piloter tes cloud phones. Tu pourras configurer les clés IA plus tard dans Paramètres.', 'Required to control your cloud phones. You can set up your AI keys later in Settings.')}</p>
              </div>
            </div>

            <div className="sf-banner is-accent sf-stack" style={{ gap: 'var(--sp-2)', alignItems: 'stretch' }}>
              <p className="sf-section-label">{tr('Comment obtenir ton token', 'How to get your token')}</p>
              <div className="sf-stack" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-2)' }}>
                <div className="flex gap-2"><span style={sfAccent} className="font-bold sf-tabular">1.</span><span>{tr('Connecte-toi sur ', 'Sign in at ')}<button onClick={() => openExternal('https://app.geelark.com')} style={sfUnderline}>app.geelark.com</button></span></div>
                <div className="flex gap-2"><span style={sfAccent} className="font-bold sf-tabular">2.</span><span>{tr('En haut à droite → ', 'Top right → ')}<strong style={{ color: 'var(--text-1)' }}>{tr('ton avatar', 'your avatar')}</strong> → <strong style={{ color: 'var(--text-1)' }}>API</strong></span></div>
                <div className="flex gap-2"><span style={sfAccent} className="font-bold sf-tabular">3.</span><span>{tr('Section ', 'Section ')}<strong style={{ color: 'var(--text-1)' }}>API Key</strong> <span style={{ color: 'var(--warn)' }}>{tr('(⚠ pas l’App ID)', '(⚠ not the App ID)')}</span></span></div>
                <div className="flex gap-2"><span style={sfAccent} className="font-bold sf-tabular">4.</span><span>{tr('Copie ou crée un token', 'Copy or create a token')}</span></div>
              </div>
            </div>

            <div className="sf-stack" style={{ gap: 'var(--sp-3)' }}>
              <Input
                label={tr('Bearer Token / API Key GéeLark', 'GeeLark Bearer Token / API Key')}
                type="password"
                placeholder={tr('Colle ton token ici…', 'Paste your token here…')}
                value={bearer}
                onChange={e => { setBearer(e.target.value); setBState('idle') }}
                hint={bearer ? tr(`${bearer.length} caractères`, `${bearer.length} characters`) : undefined}
              />
              <Button onClick={testBearer} loading={bearerState === 'testing'} disabled={!bearer.trim()} variant="secondary">
                <StateIcon s={bearerState} />
                {bearerState === 'testing' ? tr('Test…', 'Testing…') : (
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" /></svg>
                    {tr('Tester la connexion', 'Test connection')}
                  </span>
                )}
              </Button>
              {bearerMsg && (
                <div className={`sf-banner ${bearerState === 'ok' ? 'is-accent' : 'is-danger'}`} style={bearerState === 'ok' ? { background: 'var(--ok-dim)', borderColor: 'rgba(34,197,94,0.28)', color: 'var(--ok)' } : undefined}>
                  <span style={{ fontSize: 12.5 }}>{bearerMsg}</span>
                </div>
              )}
            </div>

            <Button className="w-full" disabled={!bearer.trim()} onClick={() => setStep(2)}>
              {tr('Suivant →', 'Next →')}
            </Button>
          </div>
        )}

        {/* ── STEP 2: Done ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="sf-card sf-glass sf-anim-slide-up sf-d50 text-center sf-stack" style={{ padding: 'var(--sp-6)', gap: 'var(--sp-5)' }}>
            <div className="sf-stack" style={{ gap: 'var(--sp-2)', alignItems: 'center' }}>
              <div className="sf-empty-icon sf-anim-scale-spring" style={{ color: 'var(--accent)', width: 64, height: 64 }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
              </div>
              <h2 className="sf-empty-title" style={{ fontSize: 20 }}>{tr('Prêt à démarrer !', 'Ready to go!')}</h2>
              <p className="sf-page-sub" style={{ maxWidth: 320 }}>{tr('Ton token GéeLark est configuré. Tu peux maintenant accéder à ScaleFlow.', 'Your GeeLark token is set up. You can now access ScaleFlow.')}</p>
            </div>

            <div className="sf-banner is-accent text-left sf-stack" style={{ gap: 6, alignItems: 'stretch' }}>
              <p className="sf-section-label">{tr('Configurer plus tard dans Paramètres', 'Set up later in Settings')}</p>
              <div className="flex gap-2" style={{ fontSize: 12.5, color: 'var(--text-2)' }}><span style={sfAccent}>✦</span><span><strong style={{ color: 'var(--text-1)' }}>Groq API Key</strong>{tr(' — génération de captions & hashtags IA', ' — AI caption & hashtag generation')}</span></div>
              <div className="flex gap-2" style={{ fontSize: 12.5, color: 'var(--text-2)' }}><span style={sfAccent}>✦</span><span><strong style={{ color: 'var(--text-1)' }}>Anthropic API Key</strong>{tr(' — remix vidéo avec Claude Vision', ' — video remix with Claude Vision')}</span></div>
              <div className="flex gap-2" style={{ fontSize: 12.5, color: 'var(--text-2)' }}><span style={sfAccent}>✦</span><span><strong style={{ color: 'var(--text-1)' }}>Session ID Instagram</strong>{tr(' — stats & monitoring des comptes', ' — account stats & monitoring')}</span></div>
            </div>

            {saveErr && (
              <div className="sf-banner is-danger text-left">
                <span style={{ fontSize: 12.5 }}>✗ {saveErr}</span>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>{tr('← Retour', '← Back')}</Button>
              <Button className="flex-1" onClick={finish} loading={saving}>
                {tr('Entrer dans ScaleFlow →', 'Enter ScaleFlow →')}
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
