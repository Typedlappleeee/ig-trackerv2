import { useState } from 'react'
import { activateKey } from '@/lib/license'

interface Props {
  userId: string
  onActivated: () => void
}

export function LicenseGate({ userId, onActivated }: Props) {
  const [key, setKey]       = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    setLoading(true)
    setError(null)
    const res = await activateKey(key, userId)
    setLoading(false)
    if (res.success) {
      onActivated()
    } else {
      setError(res.error ?? 'Erreur inconnue')
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030307]">
      {/* Background glow */}
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
          <p className="text-[11px] text-[#4a3f7a] uppercase tracking-widest mt-1">Accès sous licence</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6 space-y-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-white">Clé de licence requise</p>
            <p className="text-xs text-[#6b5fa0]">Entre ta clé pour activer ton compte.<br/>Les membres d'une organisation n'en ont pas besoin.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="w-full bg-[#0d0a1a] border border-[#2a1f48] rounded-xl px-4 py-3 text-white text-sm font-mono tracking-widest placeholder:text-[#3a2f58] focus:outline-none focus:border-[#8b5cf6] transition-colors text-center uppercase"
              spellCheck={false}
              autoComplete="off"
            />

            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
            >
              {loading ? 'Vérification…' : 'Activer la licence →'}
            </button>
          </form>

          <p className="text-[10px] text-[#3a2f58] text-center">
            Tu rejoins une organisation ? Demande à l'owner de t'inviter — aucune clé requise.
          </p>
        </div>
      </div>
    </div>
  )
}
