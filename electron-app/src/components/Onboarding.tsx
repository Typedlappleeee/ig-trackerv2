import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

interface OnboardingProps {
  user:       User
  onComplete: () => void
}

type Step = 1 | 2 | 3

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

function openExternal(url: string) {
  // works in Electron via shell.openExternal or target="_blank" on anchor
  window.open(url, '_blank')
}

export function Onboarding({ user, onComplete }: OnboardingProps) {
  const [step, setStep]         = useState<Step>(1)
  const [bearer, setBearer]     = useState('')
  const [groqKey, setGroqKey]   = useState('')
  const [bearerState, setBState]= useState<TestState>('idle')
  const [bearerMsg, setBMsg]    = useState('')
  const [groqState, setGState]  = useState<TestState>('idle')
  const [groqMsg, setGMsg]      = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveErr, setSaveErr]   = useState<string | null>(null)

  // ── Step 1: test GéeLark bearer ──────────────────────────────────────────
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

  // ── Step 2: test Groq key ────────────────────────────────────────────────
  async function testGroq() {
    if (!groqKey.trim()) return
    setGState('testing'); setGMsg('')
    try {
      const r = await window.electronAPI!.groqRequest({
        apiKey:    groqKey.trim(),
        messages:  [{ role: 'user', content: 'Reply with just: OK' }],
        maxTokens: 5,
      })
      const d = r.data as Record<string, unknown>
      const choice = ((d?.['choices'] as unknown[])?.[0] as Record<string, unknown>)
      const reply  = (choice?.['message'] as Record<string, unknown>)?.['content'] as string
      if (r.ok && reply) {
        setGState('ok')
        setGMsg(`✓ Clé valide — modèle Llama opérationnel (réponse : "${reply.trim()}").`)
      } else {
        setGState('fail')
        setGMsg(`✗ Clé invalide ou compte Groq sans accès. Erreur : ${(d?.['error'] as Record<string, unknown>)?.['message'] ?? 'inconnue'}.`)
      }
    } catch (e) {
      setGState('fail')
      setGMsg(`✗ Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Save and finish ──────────────────────────────────────────────────────
  async function finish() {
    if (!bearer.trim()) return
    setSaving(true); setSaveErr(null)
    const now = new Date().toISOString()
    const { error } = await supabase.from('app_config').upsert({
      user_id:      user.id,
      bearer_token: bearer.trim(),
      groq_api_key: groqKey.trim(),
      theme:        'Bleu',
      onboarded_at: now,
      updated_at:   now,
    }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) {
      setSaveErr(`Impossible de sauvegarder : ${error.message}. Vérifie ta connexion et réessaie.`)
      return
    }
    // Verify it actually persisted before moving on (so the next login won't show onboarding again)
    const { data: check } = await supabase.from('app_config').select('bearer_token').eq('user_id', user.id).maybeSingle()
    if (!check?.bearer_token) {
      setSaveErr('La sauvegarde semble ne pas être persistée (RLS ?). Reconnecte-toi puis réessaie.')
      return
    }
    onComplete()
  }

  // Skip the wizard entirely: still mark the account as onboarded so we never
  // re-prompt. The user can configure their keys later in Settings → Connexions.
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
      // Tolerate the column being missing on legacy schemas — fall back to a
      // light-touch upsert so the user can still pass the wizard.
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function StateIcon({ s }: { s: TestState }) {
    if (s === 'testing') return <span className="animate-spin text-accent">↻</span>
    if (s === 'ok')      return <span className="text-ok">✓</span>
    if (s === 'fail')    return <span className="text-danger">✗</span>
    return null
  }

  const stepLabels = ['GéeLark', 'Groq IA', 'Terminé']

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 relative">
      {/* Skip link — top right, always visible */}
      <button
        onClick={skip}
        disabled={saving}
        className="absolute top-4 right-6 text-xs text-text2 hover:text-text underline underline-offset-2"
        title="Passer cette configuration. Tu pourras la faire plus tard dans Paramètres → Connexions."
      >
        Ignorer pour l'instant →
      </button>

      <div className="w-full max-w-lg space-y-6">

        {/* Logo + title */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-accent/20 text-accent flex items-center justify-center text-2xl font-bold mx-auto">
            IG
          </div>
          <h1 className="text-2xl font-bold text-text">Configuration d'IG Tracker</h1>
          <p className="text-sm text-text2">Connecte tes services pour démarrer. Prend ~2 minutes.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 justify-center">
          {stepLabels.map((label, i) => {
            const n = (i + 1) as Step
            const done = step > n
            const active = step === n
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  active ? 'bg-accent text-white' :
                  done   ? 'bg-ok/20 text-ok' :
                           'bg-surface2 text-text2'
                }`}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-current">
                    {done ? '✓' : n}
                  </span>
                  {label}
                </div>
                {i < 2 && <span className="text-border text-xs">──</span>}
              </div>
            )
          })}
        </div>

        {/* ── STEP 1: GéeLark ────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-text flex items-center gap-2">
                <span className="text-2xl">📱</span> Token GéeLark
              </h2>
              <p className="text-sm text-text2 mt-1">
                Requis pour piloter tes cloud phones (démarrer, arrêter, poster).
              </p>
            </div>

            {/* Instructions */}
            <div className="bg-surface2 rounded-xl p-4 space-y-2 text-sm">
              <p className="font-semibold text-text text-xs uppercase tracking-wider text-text2">Comment obtenir ton token :</p>
              <div className="space-y-1.5 text-text2 text-xs">
                <div className="flex gap-2"><span className="text-accent font-bold">1.</span><span>Connecte-toi sur <button onClick={() => openExternal('https://app.geelark.com')} className="text-accent underline underline-offset-2 hover:no-underline">app.geelark.com</button></span></div>
                <div className="flex gap-2"><span className="text-accent font-bold">2.</span><span>En haut à droite → <strong className="text-text">ton avatar</strong> → <strong className="text-text">API</strong></span></div>
                <div className="flex gap-2"><span className="text-accent font-bold">3.</span><span>Section <strong className="text-text">API Key</strong> (⚠ pas l'App ID — c'est différent)</span></div>
                <div className="flex gap-2"><span className="text-accent font-bold">4.</span><span>Clique <strong className="text-text">Créer un token</strong> ou copie la clé existante</span></div>
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
              <div className="flex items-center gap-3">
                <Button onClick={testBearer} loading={bearerState === 'testing'} disabled={!bearer.trim()} variant="secondary">
                  <StateIcon s={bearerState} />
                  {bearerState === 'testing' ? 'Test…' : '🔍 Tester la connexion'}
                </Button>
              </div>
              {bearerMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${bearerState === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>
                  {bearerMsg}
                </p>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!bearer.trim()}
              onClick={() => setStep(2)}
            >
              Suivant →
            </Button>
          </div>
        )}

        {/* ── STEP 2: Groq ───────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-text flex items-center gap-2">
                <span className="text-2xl">✨</span> Clé API Groq <span className="text-xs text-text2 font-normal ml-1">(optionnel)</span>
              </h2>
              <p className="text-sm text-text2 mt-1">
                Pour générer des captions, hashtags et hooks IA automatiquement.
                <br />Gratuit : 14 400 requêtes/jour avec Llama 3.3.
              </p>
            </div>

            <div className="bg-surface2 rounded-xl p-4 space-y-2 text-sm">
              <p className="font-semibold text-text text-xs uppercase tracking-wider text-text2">Comment obtenir ta clé :</p>
              <div className="space-y-1.5 text-text2 text-xs">
                <div className="flex gap-2"><span className="text-accent font-bold">1.</span><span>Créé un compte sur <button onClick={() => openExternal('https://console.groq.com')} className="text-accent underline underline-offset-2 hover:no-underline">console.groq.com</button></span></div>
                <div className="flex gap-2"><span className="text-accent font-bold">2.</span><span>Menu gauche → <strong className="text-text">API Keys</strong> → <strong className="text-text">Create API Key</strong></span></div>
                <div className="flex gap-2"><span className="text-accent font-bold">3.</span><span>Copie la clé qui commence par <code className="bg-surface px-1 rounded">gsk_</code></span></div>
              </div>
            </div>

            <div className="space-y-3">
              <Input
                label="Groq API Key"
                type="password"
                placeholder="gsk_…"
                value={groqKey}
                onChange={e => { setGroqKey(e.target.value); setGState('idle') }}
              />
              <div className="flex items-center gap-3">
                <Button onClick={testGroq} loading={groqState === 'testing'} disabled={!groqKey.trim()} variant="secondary">
                  <StateIcon s={groqState} />
                  {groqState === 'testing' ? 'Test…' : '🔍 Tester la clé'}
                </Button>
              </div>
              {groqMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${groqState === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>
                  {groqMsg}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>← Retour</Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                {groqKey.trim() ? 'Suivant →' : 'Passer cette étape →'}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5 text-center">
            <div className="space-y-2">
              <div className="text-5xl">🎉</div>
              <h2 className="text-xl font-bold text-text">Tout est prêt !</h2>
              <p className="text-sm text-text2">
                Voici ce que tu peux faire maintenant :
              </p>
            </div>

            <div className="text-left space-y-2.5">
              {[
                { icon: '📱', title: 'Téléphones', desc: 'Synchronise tes cloud phones GéeLark et vois leur statut en temps réel' },
                { icon: '📈', title: 'Stats IG',   desc: 'Consulte les stats Instagram de chaque compte (followers, vues, vidéos)' },
                { icon: '🚀', title: 'Posting',    desc: 'Poste des Reels automatiquement sur tes phones via GéeLark' },
                { icon: '✨', title: 'Outils IA',  desc: 'Génère captions, hashtags, hooks et bios avec Groq Llama 3.3' },
                { icon: '🎞', title: 'Montage',    desc: 'Assemble et découpe tes vidéos avec l\'éditeur de montage' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 px-4 py-3 bg-surface2 rounded-xl">
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-text">{title}</p>
                    <p className="text-xs text-text2">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-text2">
              Tu peux modifier ces clés à tout moment dans <strong className="text-text">Paramètres → Connexions</strong>.
            </p>

            {saveErr && (
              <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-left">
                ✗ {saveErr}
              </p>
            )}
            <Button className="w-full" onClick={finish} loading={saving}>
              🚀 Entrer dans IG Tracker
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
