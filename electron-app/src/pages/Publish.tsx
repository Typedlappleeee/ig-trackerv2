/**
 * Publish — page « Publication ».
 * À l'entrée, un popup demande la plateforme cible (Instagram ou TikTok), puis
 * rend le Mass Posting dans le bon mode. Le choix est mémorisé (localStorage
 * `sf-mp-platform`) et relisible par MassPosting. Un bouton « changer » rouvre
 * le popup.
 */
import { useState, Suspense, lazy } from 'react'
import type { User } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui/Spinner'
import { TEXT_2 as MUTED, HAIR } from '@/lib/theme'
import { useLicense } from '@/lib/license'

const MassPosting  = lazy(() => import('@/pages/MassPosting').then(m => ({ default: m.MassPosting })))
const CrossPosting = lazy(() => import('@/pages/CrossPosting').then(m => ({ default: m.CrossPosting })))

type Platform = 'instagram' | 'tiktok' | 'threads'

const PLATFORMS: {
  k: Platform; label: string; desc: string; admin?: boolean
  grad: string; glow: string; accent: string; icon: JSX.Element
}[] = [
  {
    k: 'instagram', label: 'Instagram', desc: 'Reels — publication native via RPA',
    grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.5)', accent: '#F472B6',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="#fff" stroke="none"/></svg>,
  },
  {
    k: 'tiktok', label: 'TikTok', desc: 'Vidéos — publication native GeeLark',
    grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', glow: 'rgba(34,211,238,0.5)', accent: '#22D3EE',
    icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 3c.4 2.4 2 4.1 4.5 4.4v3c-1.7.1-3.2-.4-4.6-1.3v6.2c0 3.6-2.7 5.9-6 5.9-3.2 0-5.6-2.5-5.6-5.5 0-3.4 2.9-5.9 6.4-5.3v3.1c-.4-.1-.9-.2-1.3-.2-1.4 0-2.4 1-2.4 2.4 0 1.4 1 2.4 2.5 2.4 1.6 0 2.6-1.1 2.6-2.9V3h3.9z"/></svg>,
  },
  {
    k: 'threads', label: 'Threads', desc: 'Vidéos & photos — publication native GeeLark', admin: true,
    grad: 'linear-gradient(135deg,#111,#333)', glow: 'rgba(255,255,255,0.25)', accent: '#e5e7eb',
    icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M12.5 2C7 2 4 5.2 4 12s3 10 8.5 10c4 0 6.6-2 7.2-5.3.3-1.7-.2-3.3-1.4-4.4-.9-.8-2.1-1.3-3.6-1.4.1-1-.2-1.8-.8-2.3-.6-.5-1.4-.7-2.3-.6-1.3.1-2.3.9-2.6 2.1l1.8.5c.1-.5.5-.8 1-.9.4 0 .7.1.9.3.1.1.2.3.2.6-2.4.1-4 1.2-4 3.1 0 1.7 1.4 2.8 3.2 2.8 2 0 3.3-1.3 3.6-3.4.8.1 1.4.4 1.8.8.6.5.8 1.3.7 2.2-.4 2.1-2 3.3-4.9 3.3-4 0-6.3-2.5-6.3-8s2.3-8 6.3-8c2.6 0 4.4 1.1 5.4 3.2l1.7-.8C18.4 3.5 15.9 2 12.5 2zm-.3 11.9c-.8 0-1.4-.4-1.4-1 0-.7.7-1.2 2-1.2h.4c-.2 1.4-.9 2.2-1 2.2z"/></svg>,
  },
]

export function Publish({ user }: { user: User }) {
  const { isSuperAdmin } = useLicense()
  // Threads réservé aux superadmins pour le moment.
  const platforms = PLATFORMS.filter(p => !p.admin || isSuperAdmin)
  // null = popup affiché ; une valeur = poster monté dans ce mode.
  const [platform, setPlatform] = useState<Platform | null>(null)
  const last = (localStorage.getItem('sf-mp-platform') as Platform | null) ?? 'instagram'

  function choose(p: Platform) {
    localStorage.setItem('sf-mp-platform', p)
    setPlatform(p)
  }

  if (platform === null) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="sf-anim-scale-in" style={{
          width: '100%', maxWidth: 520, position: 'relative',
          background: 'linear-gradient(170deg, #16171F, #0F1014)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
          <div aria-hidden style={{ position: 'absolute', top: -70, left: '30%', width: 300, height: 180, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(236,72,153,0.14), transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', padding: '24px 24px 4px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(129,140,248,0.75)' }}>Publication</p>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>Où veux-tu publier ?</h2>
            <p style={{ fontSize: 12.5, color: MUTED, marginTop: 6, marginBottom: 0 }}>
              Choisis la plateforme pour cette session de publication.
            </p>
          </div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${Math.min(platforms.length, 3)}, 1fr)`, gap: 14, padding: 22 }}>
            {platforms.map(p => (
              <button
                key={p.k}
                onClick={() => choose(p.k)}
                className="cursor-pointer"
                style={{
                  padding: 18, borderRadius: 16, textAlign: 'center',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
                  border: `1px solid ${last === p.k ? `${p.accent}59` : 'rgba(255,255,255,0.09)'}`,
                  transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s, border-color 0.25s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 22px 46px -20px ${p.glow}`; e.currentTarget.style.borderColor = `${p.accent}66` }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = last === p.k ? `${p.accent}59` : 'rgba(255,255,255,0.09)' }}
              >
                <div style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.grad, boxShadow: `0 10px 22px -8px ${p.glow}, inset 0 1px 0 rgba(255,255,255,0.3)` }}>{p.icon}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(233,234,240,0.5)', marginTop: 4, lineHeight: 1.45 }}>{p.desc}</div>
                </div>
                {last === p.k && (
                  <div style={{ fontSize: 9, fontWeight: 800, color: p.accent, textTransform: 'uppercase', letterSpacing: '0.1em', background: `${p.accent}1f`, border: `1px solid ${p.accent}3d`, borderRadius: 99, padding: '3px 9px' }}>Dernier choix</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Threads → poster multi-plateforme (CrossPosting) ; IG/TikTok → MassPosting.
  const isThreads = platform === 'threads'
  const cur = PLATFORMS.find(p => p.k === platform) ?? PLATFORMS[0]
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Bandeau plateforme + bouton changer */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 28px', borderBottom: `1px solid ${HAIR}`,
      }}>
        <span style={{ fontSize: 12, color: MUTED }}>Plateforme :</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 12.5, fontWeight: 800, color: cur.accent,
          background: `${cur.accent}14`, border: `1px solid ${cur.accent}3d`,
          borderRadius: 99, padding: '4px 12px',
        }}>
          <span style={{ display: 'inline-flex', transform: 'scale(0.7)', marginLeft: -3 }}>{cur.icon}</span>
          {cur.label}
        </span>
        <button
          onClick={() => setPlatform(null)}
          className="cursor-pointer"
          style={{
            marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)', color: 'var(--accent-l)',
          }}
        >Changer de plateforme</button>
      </div>

      <Suspense fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      }>
        {/* key force le remontage au changement de plateforme → MassPosting relit sf-mp-platform */}
        <div key={platform} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {isThreads ? <CrossPosting user={user} lockedPlatform="threads" /> : <MassPosting user={user} />}
        </div>
      </Suspense>
    </div>
  )
}
