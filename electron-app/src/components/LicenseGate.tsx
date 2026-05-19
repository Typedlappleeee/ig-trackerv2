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

type Step = 'gate' | 'create_org'

const TELEGRAM_HANDLE = '@justquentin'
const TELEGRAM_URL    = 'https://t.me/justquentin'

const PLANS = [
  {
    name:    'Standard',
    price:   '$49.99',
    credits: '2 500',
    phones:  '50 téléphones',
    posting: 'Mass posting 10 comptes',
    accent:  '#60a5fa',
  },
  {
    name:    'Pro',
    price:   '$99.99',
    credits: '5 500',
    phones:  '200 téléphones',
    posting: 'Mass posting illimité',
    accent:  '#c084fc',
    popular: true,
  },
  {
    name:    'Organisation',
    price:   '$149.99',
    credits: '11 000',
    phones:  'Téléphones illimités',
    posting: 'Mass posting illimité',
    accent:  '#34d399',
    extra:   'Support 24/7 prioritaire · Proposition d\'ajouts',
  },
]

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

export function LicenseGate({ userId, email: _email, onActivated, initialStep = 'gate' }: Props) {
  const { myOrgs, switchOrg } = useOrg()
  const [step, setStep]       = useState<Step>(initialStep)
  const [view, setView]       = useState<'home' | 'join' | 'create'>('home')

  // Create org step
  const [orgName, setOrgName]         = useState('')
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

  // License key
  const [key, setKey]               = useState('')
  const [keyErr, setKeyErr]         = useState<string | null>(null)
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

  // ── Create org step ──────────────────────────────────────────────────────────
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
                  name="org-name"
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

  // ── Main gate ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030307] overflow-y-auto py-8">
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 45%, #1e0b3a44 0%, transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-lg mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <Logo gradId="gate" />
          <h1 className="text-2xl font-black text-white tracking-tight">
            Scale<span style={{ background: 'linear-gradient(130deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
          </h1>
          <p className="text-[11px] text-[#4a3f7a] uppercase tracking-widest mt-1">Accès requis</p>
        </div>

        {/* Home: 2 options */}
        {view === 'home' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="p-6 space-y-3">
              <p className="text-xs text-[#6b5fa0] text-center mb-5">
                Bienvenue sur ScaleFlow. Comment veux-tu accéder ?
              </p>
              <button
                onClick={() => setView('join')}
                className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02] flex items-center gap-4"
                style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.28)' }}>
                <div className="text-2xl">🏢</div>
                <div>
                  <div className="text-white text-sm font-bold">Rejoindre une orga</div>
                  <div className="text-[11px] text-[#6b5fa0] mt-0.5">Tu as un code d'invitation</div>
                </div>
                <div className="ml-auto text-[#3b82f6] text-lg">→</div>
              </button>
              <button
                onClick={() => setView('create')}
                className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02] flex items-center gap-4 relative overflow-hidden"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.18),rgba(236,72,153,0.18))', border: '1px solid rgba(168,85,247,0.40)' }}>
                <div className="absolute top-2 right-2 text-[9px] font-bold text-white px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>NOUVEAU</div>
                <div className="text-2xl">✨</div>
                <div>
                  <div className="text-white text-sm font-bold">Créer une orga</div>
                  <div className="text-[11px] text-[#6b5fa0] mt-0.5">Clé de licence via Telegram</div>
                </div>
                <div className="ml-auto text-[#a855f7] text-lg">→</div>
              </button>
            </div>
          </div>
        )}

        {/* Join org */}
        {view === 'join' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="p-6 space-y-4">
              <button onClick={() => setView('home')} className="flex items-center gap-1 text-[11px] text-[#4a3f7a] hover:text-[#8b5cf6] transition-colors mb-2">
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
                      style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
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
                    name="invite-code"
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
                    style={{ background: 'linear-gradient(130deg,#1d4ed8,#7c3aed)' }}>
                    {orgLoading ? 'Vérification…' : 'Rejoindre →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Create / subscribe */}
        {view === 'create' && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <div className="p-6 space-y-4">
                <button onClick={() => setView('home')} className="flex items-center gap-1 text-[11px] text-[#4a3f7a] hover:text-[#8b5cf6] transition-colors">
                  ← Retour
                </button>

                {/* Plans */}
                <p className="text-[10px] text-[#4a3f7a] uppercase tracking-widest text-center">Choisir un plan</p>
                <div className="space-y-2">
                  {PLANS.map(p => (
                    <div key={p.name}
                      className="rounded-xl p-3.5 relative"
                      style={{ background: p.popular ? 'linear-gradient(130deg,rgba(124,58,237,0.15),rgba(236,72,153,0.15))' : 'rgba(255,255,255,0.03)', border: `1px solid ${p.popular ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
                      {p.popular && (
                        <div className="absolute -top-2.5 right-4 text-[9px] font-black text-white px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>POPULAIRE</div>
                      )}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-black" style={{ color: p.accent }}>{p.name}</span>
                        <span className="text-white font-black text-sm">{p.price}<span className="text-[10px] text-[#6b5fa0] font-normal">/mois</span></span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {[`${p.credits} crédits/mois`, p.phones, p.posting, 'Support 24/7', ...(p.extra ? [p.extra] : [])].map(f => (
                          <span key={f} className="text-[10px]" style={{ color: '#6b5fa0' }}>· {f}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Telegram CTA */}
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl p-4 transition-all hover:scale-[1.01] no-underline"
                  style={{ background: 'rgba(33,150,243,0.12)', border: '1px solid rgba(33,150,243,0.35)', textDecoration: 'none' }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 flex-shrink-0" style={{ color: '#29b6f6' }}>
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                  </svg>
                  <div>
                    <div className="text-white text-sm font-bold">Obtenir ma clé via Telegram</div>
                    <div className="text-[11px]" style={{ color: '#29b6f6' }}>Contacte {TELEGRAM_HANDLE} pour souscrire</div>
                  </div>
                  <div className="ml-auto text-[#29b6f6] text-lg">→</div>
                </a>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.15)' }} />
                  <span className="text-[10px] text-[#4a3f7a]">déjà une clé ?</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.15)' }} />
                </div>

                {/* Key activation */}
                <form onSubmit={handleLicense} className="space-y-3">
                  <input
                    name="license-key"
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
                    style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}>
                    {keyLoading ? 'Vérification…' : 'Activer la clé →'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] text-[#2a1f48] text-center mt-4">
          ScaleFlow — Accès restreint aux comptes autorisés
        </p>
      </div>
      <SignOutButton />
    </div>
  )
}
