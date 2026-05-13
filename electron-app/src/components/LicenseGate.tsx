import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { activateKey } from '@/lib/license'
import { useOrg } from '@/lib/orgContext'

interface Props {
  userId: string
  email?: string | null
  onActivated: () => void
}

type Tab = 'subscribe' | 'license' | 'org'

const STRIPE_LINKS = {
  standard: 'https://buy.stripe.com/test_aFa3cu2Lw00LdymdHT5EY00',
  pro:      'https://buy.stripe.com/test_eVq7sK4TEaFp9i6cDP5EY01',
}

export function LicenseGate({ userId, email, onActivated }: Props) {
  const { myOrgs, switchOrg } = useOrg()
  const [tab, setTab]         = useState<Tab>('subscribe')

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

  // Org invite
  const [code, setCode]       = useState('')
  const [orgErr, setOrgErr]   = useState<string | null>(null)
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgSuccess, setOrgSuccess] = useState(false)

  async function handleLicense(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    setKeyLoading(true)
    setKeyErr(null)
    const res = await activateKey(key, userId)
    setKeyLoading(false)
    if (res.success) {
      onActivated()
    } else {
      setKeyErr(res.error ?? 'Erreur inconnue')
    }
  }

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
      setOrgSuccess(true)
      // Persist the newly joined org so orgContext restores it after reload
      if (data) localStorage.setItem('ig-tracker-current-org', data as string)
      setTimeout(() => window.location.reload(), 1500)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030307]">
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 45%, #1e0b3a44 0%, transparent 70%)',
      }} />

      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <svg width="52" height="52" viewBox="0 0 100 100" fill="none" className="mb-4">
            <defs>
              <linearGradient id="lg-main" x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#1d4ed8"/>
                <stop offset="58%"  stopColor="#7c3aed"/>
                <stop offset="100%" stopColor="#a855f7"/>
              </linearGradient>
              <linearGradient id="lg-arr" x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#db2777"/>
                <stop offset="100%" stopColor="#f472b6"/>
              </linearGradient>
            </defs>
            <path d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
              stroke="url(#lg-main)" strokeWidth="16" strokeLinecap="round" fill="none"/>
            <line x1="66" y1="22" x2="88" y2="2" stroke="url(#lg-arr)" strokeWidth="11" strokeLinecap="round"/>
            <line x1="77" y1="1"  x2="90" y2="1"  stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
            <line x1="90" y1="1"  x2="90" y2="15" stroke="#f472b6" strokeWidth="9" strokeLinecap="round"/>
          </svg>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Scale<span style={{ background: 'linear-gradient(130deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
          </h1>
          <p className="text-[11px] text-[#4a3f7a] uppercase tracking-widest mt-1">Accès requis</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
          {/* Tabs */}
          <div className="flex border-b border-[#1a1230]">
            {([['subscribe', '💎 S\'abonner'], ['license', '🔑 Clé'], ['org', '🏢 Orga']] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-[11px] font-semibold transition-colors ${
                  tab === t
                    ? 'text-white border-b-2 border-[#8b5cf6] bg-[#0d0a1a]'
                    : 'text-[#4a3f7a] hover:text-[#8b5cf6]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-4">
            {tab === 'subscribe' ? (
              <>
                <p className="text-xs text-[#6b5fa0] text-center">
                  Choisis ton plan. Activation & crédits automatiques après paiement.
                </p>

                <button
                  onClick={() => openStripe('standard')}
                  className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.30)' }}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="text-white text-sm font-bold">Standard</div>
                    <div className="text-white text-sm"><span className="text-lg font-black">29,99€</span><span className="text-[10px] text-[#6b5fa0]">/mois</span></div>
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
                    <div className="text-white text-sm"><span className="text-lg font-black">79,99€</span><span className="text-[10px] text-[#6b5fa0]">/mois</span></div>
                  </div>
                  <div className="text-[11px] text-[#6b5fa0] mt-1">5 500 crédits / mois</div>
                </button>

                <p className="text-[10px] text-[#4a3f7a] text-center pt-2">
                  Paiement sécurisé via Stripe — annulable à tout moment
                </p>
              </>
            ) : tab === 'license' ? (
              <>
                <p className="text-xs text-[#6b5fa0] text-center">
                  Entre ta clé pour activer ton accès solo.
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
              </>
            ) : (
              <>
                {/* Already a member — switch directly */}
                {myOrgs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-[#4a3f7a] uppercase tracking-widest text-center">Tes organisations</p>
                    {myOrgs.map(({ org }) => (
                      <button
                        key={org.id}
                        onClick={() => switchOrg(org.id)}
                        className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all flex items-center gap-2"
                        style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
                      >
                        <span>🏢</span>
                        <span className="flex-1 text-left truncate">{org.name}</span>
                        <span className="text-[11px] text-blue-400">Rejoindre →</span>
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
                  Si tu as un code d'invitation, entre-le ici.<br/>
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
              </>
            )}
          </div>
        </div>

        <p className="text-[10px] text-[#2a1f48] text-center mt-4">
          ScaleFlow — Accès restreint aux comptes autorisés
        </p>
      </div>
    </div>
  )
}
