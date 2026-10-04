import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { activateKey } from '@/lib/license'

// Écran de licence : affiché après connexion quand le compte n'a PAS de licence valide.
// Sans clé activée → impossible d'accéder à l'app (comme l'ancien web).
export default function LicenseGate({ user, expired, onActivated, onSignOut }: {
  user: User; expired: boolean; onActivated: () => void; onSignOut: () => void
}) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    const k = key.trim()
    if (!k || loading) return
    setLoading(true); setErr(null)
    const res = await activateKey(k, user.id)
    setLoading(false)
    if (!res.ok) { setErr(res.error ?? 'Clé invalide ou déjà utilisée.'); return }
    onActivated()
  }

  const input: CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 46, padding: '0 14px', borderRadius: 11,
    background: 'rgba(255,255,255,0.04)', border: `1px solid ${err ? 'rgba(248,113,113,0.5)' : 'rgba(168,85,247,0.35)'}`,
    color: '#F2F0FF', fontSize: 15, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em', outline: 'none', textAlign: 'center',
  }
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 20, background: '#0A0B0E', fontFamily: "'Manrope',system-ui,sans-serif" }}>
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(55% 40% at 50% 0%, rgba(168,85,247,0.2), transparent 70%)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 420, padding: 30, borderRadius: 20, background: 'linear-gradient(168deg, rgba(24,20,44,0.7), rgba(12,10,22,0.85))', border: '1px solid rgba(168,85,247,0.24)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(145deg,#A855F7,#7C3AED)', boxShadow: '0 10px 30px -10px rgba(168,85,247,0.9)' }}>
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M15 7a2 2 0 0 1 2 2m4-2a6 6 0 0 1-7.7 5.7L10 16H8v2H6v2H2v-4l6.3-6.3A6 6 0 1 1 21 7z" /></svg>
          </div>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: '#F7F5FF' }}>
          {expired ? 'Ta licence a expiré' : 'Licence requise'}
        </h1>
        <p style={{ margin: '10px 0 20px', fontSize: 13.5, lineHeight: 1.6, color: '#A9A6B8' }}>
          {expired
            ? 'Ta clé n’est plus valide. Entre une nouvelle clé pour continuer à utiliser ScaleFlow.'
            : 'Ton compte n’a pas encore de licence. Entre ta clé d’activation pour accéder à ScaleFlow.'}
        </p>

        <input value={key} onChange={e => { setKey(e.target.value.toUpperCase()); setErr(null) }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="XXXX-XXXX-XXXX-XXXX" autoFocus spellCheck={false} autoComplete="off" style={input} />
        {err && <div style={{ marginTop: 10, fontSize: 12.5, color: '#FCA5A5' }}>{err}</div>}

        <button onClick={submit} disabled={loading || !key.trim()} style={{
          width: '100%', marginTop: 16, height: 46, borderRadius: 11, border: 'none', cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', fontSize: 14.5, fontWeight: 800, color: '#fff',
          background: loading || !key.trim() ? 'rgba(124,58,237,0.4)' : 'linear-gradient(135deg,#A855F7,#7C3AED)',
          boxShadow: loading || !key.trim() ? 'none' : '0 12px 30px -12px rgba(168,85,247,0.9)',
        }}>{loading ? 'Vérification…' : 'Activer la clé →'}</button>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a href="https://t.me/justquentin" target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#A78BFA', textDecoration: 'none', fontWeight: 700 }}>Pas de clé ? Nous contacter →</a>
          <button onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: '#6B6878' }}>
            Se déconnecter ({user.email})
          </button>
        </div>
      </div>
    </div>
  )
}
