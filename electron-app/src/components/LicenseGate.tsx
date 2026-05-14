import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { activateKey } from '@/lib/license'
import { useOrg } from '@/lib/orgContext'

interface Props {
  userId: string
  email?: string | null
  onActivated: () => void
  initialStep?: Step
}

type Step     = 'gate' | 'create_org'
type Category = null | 'join' | 'create'
type CreateMode = 'subscribe' | 'key'

const STRIPE_LINKS = {
  standard: 'https://buy.stripe.com/test_aFa3cu2Lw00LdymdHT5EY00',
  pro:      'https://buy.stripe.com/test_eVq7sK4TEaFp9i6cDP5EY01',
}

const Logo = ({ gradId }: { gradId: string }) => (
  <svg width="52" height="52" viewBox="0 0 100 100" fill="none" className="mb-4">
    <defs>
      <linearGradient id={`lg-main-${gradId}`} x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="#1d4ed8"/>
        <stop offset="58%"  stopColor="#7c3aed"/>
        <stop offset="100%" stopColor="#a855f7"/>
      </linearGradient>
      <linearGradient id={`lg-arr-${gradId}`} x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="#db2777"/>
        <stop offset="100%" stopColor="#f472b6"/>
      </linearGradient>
    </defs>
    <path d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
      stroke={`url(#lg-main-${gradId})`} strokeWidth="16" strokeLinecap="round" fill="none"/>
    <line x1="66" y1="22" x2="88" y2="2" stroke={`url(#lg-arr-${gradId})`} strokeWidth="11" strokeLinecap="round"/>
    <line x1="77" y1="1"  x2="90" y2="1"  stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
    <line x1="90" y1="1"  x2="90" y2="15" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
  </svg>
)

export function LicenseGate({ userId, email, onActivated, initialStep = 'gate' }: Props) {
  const { myOrgs, switchOrg } = useOrg()
  const [step, setStep]           = useState<Step>(initialStep)
  const [category, setCategory]   = useState<Category>(null)
  const [createMode, setCreateMode] = useState<CreateMode>('subscribe')

  // Create org step
  const [orgName, setOrgName]           = useState('')
  const [orgCreateErr, setOrgCreateErr] = useState<string | null>(null)
  const [orgCreateLoading, setOrgCreateLoading] = useState(false)

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!orgName.trim()) return
    setOrgCreateLoading(true)
    setOrgCreateErr(null)
    const { data, error } = await supabase.rpc('create_org', { p_name: orgName.trim() })
    setOrgCreateLoading(false)
    if (error) {
      setOrgCreateErr(error.message)
    } else {
      if (data) localStorage.setItem('ig-tracker-current-org', data as string)
      onActivated()
    }
  }

  function openStripe(plan: 'standard' | 'pro') {
    const url = new URL(STRIPE_LINKS[plan])
    url.searchParams.set('client_reference_id', userId)
    if (email) url.searchParams.set('prefilled_email', email)
    window.location.href = url.toString()
  }

  // License key
  const [key, setKey]         = useState('')
  const [keyErr, setKeyErr]   = useState<string | null>(null)
  const [keyLoading, setKeyLoading] = useState(false)

  async function handleLicense(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    setKeyLoading(true)
    setKeyErr(null)
    const res = await activateKey(key, userId)
    setKeyLoading(false)
    if (res.success) {
      setStep('create_org')
    } else {
      setKeyErr(res.error ?? 'Erreur inconnue')
    }
  }

  // Org invite
  const [code, setCode]           = useState('')
  const [orgErr, setOrgErr]       = useState<string | null>(null)
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgSuccess, setOrgSuccess] = useState(false)

  async function handleOrgJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setOrgLoading(true)
    setOrgErr(null)
    const { data, error } = await supabase.rpc('accept_org_invite', { p_token: code.trim() })
    setOrgLoading(false)
    if (error) {
      const msg = /invite_not_found/.test(error.message)    ? 'Code invalide ou expiré'
                : /invite_already_used/.test(error.message) ? 'Ce code a déjà été utilisé'
                : /invite_expired/.test(error.message)      ? 'Code expiré'
                : error.message
      setOrgErr(msg)
    } else {
      // Verify the org has an active license before letting the user in.
      const orgId = data as string | null
      if (orgId) {
        const { data: org } = await supabase
          .from('organizations').select('owner_id').eq('id', orgId).maybeSingle()
        const { data: ownerKey } = await supabase
          .from('license_keys').select('expires_at')
          .eq('user_id', org?.owner_id ?? '').eq('is_active', true).maybeSingle()
        const expired = ownerKey?.expires_at ? new Date(ownerKey.expires_at) < new Date() : false
        if (!ownerKey || expired) {
          setOrgErr("Cette organisation n'a pas d'abonnement actif.")
          return
        }
        localStorage.setItem('ig-tracker-current-org', orgId)
      }
      setOrgSuccess(true)
      setTimeout(() => window.location.reload(), 1500)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const SignOutButton = () => (
    <button
      onClick={signOut}
      className="fixed bottom-5 right-6 z-[10000] px-3 py-1.5 rounded-lg text-xs text-[#a89bd4] hover:text-white transition-colors"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      Se déconnecter →
    </button>
  )

  // ── Create org step (after activation) ──────────────────────────────────
  if (step === 'create_org') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030307]">
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 50% 45%, #1e0b3a44 0%, transparent 70%)' }} />
        <div className="relative z-10 w-full max-w-sm mx-4">
          <div className="flex flex-col items-center mb-8">
            <Logo gradId="co" />
            <h1 className="text-2xl font-black text-white tracking-tight">
              Scale<span style={{ background: 'linear-gradient(130deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
            </h1>
            <p className="text-[11px] text-[#4a3f7a] uppercase tracking-widest mt-1">Créer mon organisation</p>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="p-6 space-y-4">
              <p className="text-xs text-[#6b5fa0] text-center">
                Ton abonnement est activé ! 🎉<br/>
                Crée ton organisation pour commencer.
              </p>
              <form onSubmit={handleCreateOrg} className="space-y-3">
                <input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="Nom de l'organisation"
                  className="w-full bg-[#0d0a1a] border border-[#2a1f48] rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#3a2f58] focus:outline-none focus:border-[#8b5cf6] transition-colors"
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                />
                {orgCreateErr && <p className="text-xs text-red-400 text-center">{orgCreateErr}</p>}
                <button
                  type="submit"
                  disabled={orgCreateLoading || !orgName.trim()}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
                >
                  {orgCreateLoading ? 'Création…' : 'Créer mon organisation →'}
                </button>
              </form>
            </div>
          </div>
          <p className="text-[10px] text-[#2a1f48] text-center mt-4">ScaleFlow — Accès restreint aux comptes autorisés</p>
        </div>
        <SignOutButton />
      </div>
    )
  }

  // ── Main gate ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030307]">
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 45%, #1e0b3a44 0%, transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Logo gradId="gate" />
          <h1 className="text-2xl font-black text-white tracking-tight">
            Scale<span style={{ background: 'linear-gradient(130deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
          </h1>
          <p className="text-[11px] text-[#4a3f7a] uppercase tracking-widest mt-1">Accès requis</p>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>

          {/* ── Home: 2 categories ── */}
          {category === null && (
            <div className="p-6 space-y-3">
              <p className="text-xs text-[#6b5fa0] text-center mb-5">
                Bienvenue sur ScaleFlow. Comment veux-tu accéder ?
              </p>

              {/* Rejoindre une orga */}
              <button
                onClick={() => setCategory('join')}
                className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02] flex items-center gap-4"
                style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.28)' }}
              >
                <div className="text-2xl">🏢</div>
                <div>
                  <div className="text-white text-sm font-bold">Rejoindre une orga</div>
                  <div className="text-[11px] text-[#6b5fa0] mt-0.5">Tu as un code d'invitation</div>
                </div>
                <div className="ml-auto text-[#3b82f6] text-lg">→</div>
              </button>

              {/* Créer une orga */}
              <button
                onClick={() => setCategory('create')}
                className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02] flex items-center gap-4 relative overflow-hidden"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.18),rgba(236,72,153,0.18))', border: '1px solid rgba(168,85,247,0.40)' }}
              >
                <div className="absolute top-2 right-2 text-[9px] font-bold text-white px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>NOUVEAU</div>
                <div className="text-2xl">✨</div>
                <div>
                  <div className="text-white text-sm font-bold">Créer une orga</div>
                  <div className="text-[11px] text-[#6b5fa0] mt-0.5">Abonnement ou clé de licence</div>
                </div>
                <div className="ml-auto text-[#a855f7] text-lg">→</div>
              </button>
            </div>
          )}

          {/* ── Rejoindre une orga ── */}
          {category === 'join' && (
            <div className="p-6 space-y-4">
              <button onClick={() => setCategory(null)} className="flex items-center gap-1 text-[11px] text-[#4a3f7a] hover:text-[#8b5cf6] transition-colors mb-2">
                ← Retour
              </button>

              {myOrgs.length > 0 && (
                <div className="space-y-2 mb-2">
                  <p className="text-[10px] text-[#4a3f7a] uppercase tracking-widest text-center">Tes organisations</p>
                  {myOrgs.map(({ org }) => (
                    <button
                      key={org.id}
                      onClick={() => { switchOrg(org.id); window.location.reload() }}
                      className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all flex items-center gap-2"
                      style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
                    >
                      <span>🏢</span>
                      <span className="flex-1 text-left truncate">{org.name}</span>
                      <span className="text-[11px] text-blue-400">Accéder →</span>
                    </button>
                  ))}
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px" style={{ background: 'rgba(74,63,122,0.4)' }} />
                    <span className="text-[10px] text-[#3a2f58]">ou code d'invitation</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(74,63,122,0.4)' }} />
                  </div>
                </div>
              )}

              <p className="text-xs text-[#6b5fa0] text-center">
                Entre ton code d'invitation.<br/>
                Tant que l'owner de l'orga a un abonnement actif, tu as accès.
              </p>
              {orgSuccess ? (
                <div className="text-center py-4">
                  <p className="text-green-400 font-semibold text-sm">✓ Organisation rejointe !</p>
                  <p className="text-xs text-[#6b5fa0] mt-1">Chargement en cours…</p>
                </div>
              ) : (
                <form onSubmit={handleOrgJoin} className="space-y-3">
                  <input
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="Code d'invitation"
                    className="w-full bg-[#0d0a1a] border border-[#2a1f48] rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-[#3a2f58] focus:outline-none focus:border-[#8b5cf6] transition-colors text-center"
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus
                  />
                  {orgErr && <p className="text-xs text-red-400 text-center">{orgErr}</p>}
                  <button
                    type="submit"
                    disabled={orgLoading || !code.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                    style={{ background: 'linear-gradient(130deg,#1d4ed8,#7c3aed)' }}
                  >
                    {orgLoading ? 'Vérification…' : 'Rejoindre →'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── Créer une orga ── */}
          {category === 'create' && (
            <div className="p-6 space-y-4">
              <button onClick={() => setCategory(null)} className="flex items-center gap-1 text-[11px] text-[#4a3f7a] hover:text-[#8b5cf6] transition-colors mb-2">
                ← Retour
              </button>

              {/* Sub-tabs */}
              <div className="flex rounded-xl overflow-hidden border border-[#1a1230]">
                {([['subscribe', '💎 S\'abonner'], ['key', '🔑 Clé de licence']] as [CreateMode, string][]).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setCreateMode(m)}
                    className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${
                      createMode === m
                        ? 'text-white bg-[#0d0a1a] border-b-2 border-[#8b5cf6]'
                        : 'text-[#4a3f7a] hover:text-[#8b5cf6]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Subscribe */}
              {createMode === 'subscribe' && (
                <div className="space-y-3">
                  <p className="text-xs text-[#6b5fa0] text-center">
                    Choisis ton plan. Activation automatique après paiement.
                  </p>

                  <button
                    onClick={() => openStripe('standard')}
                    className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02]"
                    style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.30)' }}
                  >
                    <div className="flex items-baseline justify-between">
                      <div className="text-white text-sm font-bold">Standard</div>
                      <div className="text-white text-sm"><span className="text-lg font-black">49,99$</span><span className="text-[10px] text-[#6b5fa0]">/mois</span></div>
                    </div>
                    <div className="text-[11px] text-[#6b5fa0] mt-1">2 000 crédits / mois</div>
                  </button>

                  <button
                    onClick={() => openStripe('pro')}
                    className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02] relative overflow-hidden"
                    style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.18),rgba(236,72,153,0.18))', border: '1px solid rgba(168,85,247,0.45)' }}
                  >
                    <div className="absolute top-2 right-2 text-[9px] font-bold text-white px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>POPULAIRE</div>
                    <div className="flex items-baseline justify-between">
                      <div className="text-white text-sm font-bold">Pro</div>
                      <div className="text-white text-sm"><span className="text-lg font-black">99,99$</span><span className="text-[10px] text-[#6b5fa0]">/mois</span></div>
                    </div>
                    <div className="text-[11px] text-[#6b5fa0] mt-1">5 500 crédits / mois</div>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.15)' }} />
                    <span className="text-[10px] text-[#4a3f7a]">ou</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.15)' }} />
                  </div>

                  <a
                    href="https://t.me/justquentin"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center gap-3 rounded-xl p-4 transition-all hover:scale-[1.02]"
                    style={{ background: 'rgba(33,150,243,0.10)', border: '1px solid rgba(33,150,243,0.30)', textDecoration: 'none' }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: '#29b6f6' }}>
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-bold">Payer en crypto via Telegram</div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#29b6f6' }}>Contacte @justquentin</div>
                    </div>
                  </a>

                  <p className="text-[10px] text-[#4a3f7a] text-center">
                    Stripe (carte) ou crypto via Telegram — annulable à tout moment
                  </p>
                </div>
              )}

              {/* License key */}
              {createMode === 'key' && (
                <div className="space-y-3">
                  <p className="text-xs text-[#6b5fa0] text-center">
                    Tu as déjà une clé de licence ? Active-la ici.
                  </p>
                  <form onSubmit={handleLicense} className="space-y-3">
                    <input
                      value={key}
                      onChange={e => setKey(e.target.value)}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      className="w-full bg-[#0d0a1a] border border-[#2a1f48] rounded-xl px-4 py-3 text-white text-sm font-mono tracking-widest placeholder:text-[#3a2f58] focus:outline-none focus:border-[#8b5cf6] transition-colors text-center uppercase"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {keyErr && <p className="text-xs text-red-400 text-center">{keyErr}</p>}
                    <button
                      type="submit"
                      disabled={keyLoading || !key.trim()}
                      className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                      style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
                    >
                      {keyLoading ? 'Vérification…' : 'Activer →'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-[10px] text-[#2a1f48] text-center mt-4">
          ScaleFlow — Accès restreint aux comptes autorisés
        </p>
      </div>
      <SignOutButton />
    </div>
  )
}
