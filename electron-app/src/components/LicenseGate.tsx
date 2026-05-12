import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { activateKey } from '@/lib/license'

interface Props {
  userId: string
  onActivated: () => void
}

type Tab = 'license' | 'org'

export function LicenseGate({ userId, onActivated }: Props) {
  const [tab, setTab]         = useState<Tab>('license')

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
    const { error } = await supabase.rpc('accept_org_invite', { p_token: code.trim() })
    setOrgLoading(false)
    if (error) {
      const msg = /invite_not_found/.test(error.message)    ? 'Code invalide ou expiré'
                : /invite_already_used/.test(error.message) ? 'Ce code a déjà été utilisé'
                : /invite_expired/.test(error.message)      ? 'Code expiré'
                : error.message
      setOrgErr(msg)
    } else {
      setOrgSuccess(true)
      // Re-check license — org owner may unlock access
      setTimeout(() => onActivated(), 1500)
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
            {([['license', '🔑 Clé de licence'], ['org', '🏢 Rejoindre une orga']] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${
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
            {tab === 'license' ? (
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
                <p className="text-xs text-[#6b5fa0] text-center">
                  Si tu as un code d'invitation, entre-le ici.<br/>
                  Tant que l'owner de l'orga a un abonnement actif, tu as accès.
                </p>
                {orgSuccess ? (
                  <div className="text-center py-4">
                    <p className="text-green-400 font-semibold text-sm">✓ Organisation rejointe !</p>
                    <p className="text-xs text-[#6b5fa0] mt-1">Connexion en cours…</p>
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
