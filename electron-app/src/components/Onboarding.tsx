import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
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
  return (
    <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="ob-main" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1d4ed8"/>
          <stop offset="28%"  stopColor="#3b5af0"/>
          <stop offset="58%"  stopColor="#7c3aed"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <linearGradient id="ob-depth" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0c1f6e"/>
          <stop offset="55%"  stopColor="#2e1065"/>
          <stop offset="100%" stopColor="#3b0764"/>
        </linearGradient>
        <linearGradient id="ob-arr" x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#db2777"/>
          <stop offset="100%" stopColor="#f472b6"/>
        </linearGradient>
      </defs>
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#ob-depth)" strokeWidth="18" strokeLinecap="round" fill="none"
        transform="translate(2.5,4.5)" opacity="0.65"
      />
      <path
        d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
        stroke="url(#ob-main)" strokeWidth="16" strokeLinecap="round" fill="none"
      />
      <line x1="66" y1="22" x2="88" y2="2" stroke="url(#ob-arr)" strokeWidth="11" strokeLinecap="round"/>
      <line x1="77" y1="1" x2="90" y2="1" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
      <line x1="90" y1="1" x2="90" y2="15" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
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
        setBMsg(`✓ Token valide — ${total} téléphone${total !== 1 ? 's' : ''} trouvé${total !== 1 ? 's' : ''} dans ton compte GéeLark.`)
      } else {
        setBState('fail')
        setBMsg(`✗ Token invalide : ${(d?.['msg'] as string) ?? 'vérification échouée'}. Vérifie que tu copies bien la valeur "API Key" (pas l'App ID).`)
      }
    } catch (e) {
      setBState('fail')
      setBMsg(`✗ Erreur réseau : ${e instanceof Error ? e.message : String(e)}`)
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
      setSaveErr(`Impossible de sauvegarder : ${error.message}. Vérifie ta connexion et réessaie.`)
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
        setSaveErr(`Impossible de sauvegarder : ${error.message}.`)
        return
      }
    }
    onComplete()
  }

  function StateIcon({ s }: { s: TestState }) {
    if (s === 'testing') return <span className="animate-spin" style={{ color: '#a78bfa' }}>↻</span>
    if (s === 'ok')      return <span className="text-ok">✓</span>
    if (s === 'fail')    return <span className="text-danger">✗</span>
    return null
  }

  const sfAccent    = { color: '#a78bfa' }
  const sfUnderline = { color: '#c4b5fd', textDecoration: 'underline', textUnderlineOffset: '2px' }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: '#05030f' }}
    >
      <div className="sf-aurora absolute" style={{ width: 600, height: 600, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'linear-gradient(rgba(139,92,246,1) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)', backgroundSize: '48px 48px' }}
      />

      <button
        onClick={skip}
        disabled={saving}
        className="absolute top-5 right-6 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-40"
        style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)' }}
      >
        Ignorer pour l'instant →
      </button>

      <div className="w-full max-w-lg space-y-6 relative z-10">

        {/* Logo + title */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 0 32px rgba(139,92,246,0.12)' }}>
            <SFLogoMark />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-white">Bienvenue sur </span>
              <span className="sf-text-gradient">ScaleFlow</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(196,181,253,0.5)' }}>Une seule chose pour commencer.</p>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2].map(n => (
            <div key={n} className="w-2 h-2 rounded-full transition-all"
              style={{ background: step >= n ? '#7c3aed' : 'rgba(139,92,246,0.2)', transform: step === n ? 'scale(1.4)' : 'scale(1)' }}
            />
          ))}
        </div>

        {/* ── STEP 1: GéeLark token ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-text flex items-center gap-2">
                <span className="text-2xl">📱</span> Token GéeLark
              </h2>
              <p className="text-sm text-text2 mt-1">Requis pour piloter tes cloud phones. Tu pourras configurer les clés IA plus tard dans Paramètres.</p>
            </div>

            <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
              <p className="font-semibold text-xs uppercase tracking-wider" style={{ color: 'rgba(196,181,253,0.5)' }}>Comment obtenir ton token :</p>
              <div className="space-y-1.5 text-xs" style={{ color: 'rgba(196,181,253,0.6)' }}>
                <div className="flex gap-2"><span style={sfAccent} className="font-bold">1.</span><span>Connecte-toi sur <button onClick={() => openExternal('https://app.geelark.com')} style={sfUnderline}>app.geelark.com</button></span></div>
                <div className="flex gap-2"><span style={sfAccent} className="font-bold">2.</span><span>En haut à droite → <strong className="text-text">ton avatar</strong> → <strong className="text-text">API</strong></span></div>
                <div className="flex gap-2"><span style={sfAccent} className="font-bold">3.</span><span>Section <strong className="text-text">API Key</strong> <span style={{ color: '#f59e0b' }}>(⚠ pas l'App ID)</span></span></div>
                <div className="flex gap-2"><span style={sfAccent} className="font-bold">4.</span><span>Copie ou crée un token</span></div>
              </div>
            </div>

            <div className="space-y-3">
              <Input
                label="Bearer Token / API Key GéeLark"
                type="password"
                placeholder="Colle ton token ici…"
                value={bearer}
                onChange={e => { setBearer(e.target.value); setBState('idle') }}
                hint={bearer ? `${bearer.length} caractères` : undefined}
              />
              <Button onClick={testBearer} loading={bearerState === 'testing'} disabled={!bearer.trim()} variant="secondary">
                <StateIcon s={bearerState} />
                {bearerState === 'testing' ? 'Test…' : '🔍 Tester la connexion'}
              </Button>
              {bearerMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${bearerState === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>
                  {bearerMsg}
                </p>
              )}
            </div>

            <Button className="w-full" disabled={!bearer.trim()} onClick={() => setStep(2)}>
              Suivant →
            </Button>
          </div>
        )}

        {/* ── STEP 2: Done ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="glass-card rounded-2xl p-6 space-y-5 text-center">
            <div className="space-y-2">
              <div className="text-5xl">🚀</div>
              <h2 className="text-xl font-bold text-text">Prêt à démarrer !</h2>
              <p className="text-sm text-text2">Ton token GéeLark est configuré. Tu peux maintenant accéder à ScaleFlow.</p>
            </div>

            <div className="text-left rounded-xl p-4 space-y-1 text-xs" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)', color: 'rgba(196,181,253,0.6)' }}>
              <p className="font-semibold text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(196,181,253,0.5)' }}>Configurer plus tard dans Paramètres :</p>
              <div className="flex gap-2"><span style={sfAccent}>✦</span><span><strong className="text-text">Groq API Key</strong> — génération de captions & hashtags IA</span></div>
              <div className="flex gap-2"><span style={sfAccent}>✦</span><span><strong className="text-text">Anthropic API Key</strong> — remix vidéo avec Claude Vision</span></div>
              <div className="flex gap-2"><span style={sfAccent}>✦</span><span><strong className="text-text">Session ID Instagram</strong> — stats & monitoring des comptes</span></div>
            </div>

            {saveErr && (
              <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-left">
                ✗ {saveErr}
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>← Retour</Button>
              <Button className="flex-1" onClick={finish} loading={saving}>
                Entrer dans ScaleFlow →
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
