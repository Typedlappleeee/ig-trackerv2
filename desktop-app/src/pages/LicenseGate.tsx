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
    width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', borderRadius: 6,
    background: '#161618', border: `1px solid ${err ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.09)'}`,
    color: '#EDEDEF', fontSize: 14, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em', outline: 'none', textAlign: 'center',
  }
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto', background: '#0A0A0B' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 400, boxSizing: 'border-box', padding: 28, borderRadius: 10, background: '#111113', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 8, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)' }}>
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#C4BBFB" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M15 7a2 2 0 0 1 2 2m4-2a6 6 0 0 1-7.7 5.7L10 16H8v2H6v2H2v-4l6.3-6.3A6 6 0 1 1 21 7z" /></svg>
          </div>
        </div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: '#EDEDEF' }}>
          {expired ? 'Ta licence a expiré' : 'Licence requise'}
        </h1>
        <p style={{ margin: '8px 0 20px', fontSize: 13, lineHeight: 1.6, color: '#8B8B94' }}>
          {expired
            ? 'Ta clé n’est plus valide. Entre une nouvelle clé pour continuer à utiliser ScaleFlow.'
            : 'Ton compte n’a pas encore de licence. Entre ta clé d’activation pour accéder à ScaleFlow.'}
        </p>

        <input value={key} onChange={e => { setKey(e.target.value.toUpperCase()); setErr(null) }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="XXXX-XXXX-XXXX-XXXX" autoFocus spellCheck={false} autoComplete="off" style={input} />
        {err && <div style={{ marginTop: 8, fontSize: 12, color: '#F87171' }}>{err}</div>}

        <button type="button" onClick={submit} disabled={loading || !key.trim()} style={{
          width: '100%', marginTop: 12, height: 40, borderRadius: 6, border: '1px solid #EDEDEF', cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
          fontSize: 13, fontWeight: 500, color: '#0A0A0B', background: '#EDEDEF',
          opacity: loading || !key.trim() ? 0.4 : 1, transition: 'opacity .12s ease',
        }}>{loading ? 'Vérification…' : 'Activer la clé →'}</button>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <a href="https://t.me/justquentin" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#C4BBFB', textDecoration: 'none', fontWeight: 500 }}>Pas de clé ? Nous contacter →</a>
          <button type="button" onClick={onSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: '#71717A' }}>
            Se déconnecter ({user.email})
          </button>
        </div>
      </div>
    </div>
  )
}
