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
import { ACCENT, TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR, BG_2 as BG2 } from '@/lib/theme'

const MassPosting = lazy(() => import('@/pages/MassPosting').then(m => ({ default: m.MassPosting })))

type Platform = 'instagram' | 'tiktok'

const PLATFORMS: { k: Platform; label: string; emoji: string; desc: string; accent: string }[] = [
  { k: 'instagram', label: 'Instagram', emoji: '📸', desc: 'Reels — publication native via RPA', accent: '#E1306C' },
  { k: 'tiktok',    label: 'TikTok',    emoji: '🎵', desc: 'Vidéos — publication native GeeLark', accent: '#25F4EE' },
]

export function Publish({ user }: { user: User }) {
  // null = popup affiché ; une valeur = MassPosting monté dans ce mode.
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
          width: '100%', maxWidth: 460, background: BG2, border: `1px solid ${HAIR}`,
          borderRadius: 18, padding: '30px 30px 26px', textAlign: 'center',
          boxShadow: '0 24px 64px -16px rgba(0,0,0,0.7)',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: IVORY }}>Où veux-tu publier ?</h2>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 6, marginBottom: 22 }}>
            Choisis la plateforme pour cette session de publication.
          </p>
          <div style={{ display: 'flex', gap: 14 }}>
            {PLATFORMS.map(p => (
              <button
                key={p.k}
                onClick={() => choose(p.k)}
                className="cursor-pointer"
                style={{
                  flex: 1, padding: '22px 14px', borderRadius: 14, textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  border: `1.5px solid ${last === p.k ? 'rgba(99,102,241,0.45)' : HAIR}`,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = last === p.k ? 'rgba(99,102,241,0.45)' : HAIR; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
              >
                <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 12 }}>{p.emoji}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: IVORY }}>{p.label}</div>
                <div style={{ fontSize: 11, color: FAINT, marginTop: 5, lineHeight: 1.4 }}>{p.desc}</div>
                {last === p.k && (
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: ACCENT, marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dernier choix</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Bandeau plateforme + bouton changer */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 28px', borderBottom: `1px solid ${HAIR}`,
      }}>
        <span style={{ fontSize: 12, color: MUTED }}>Plateforme :</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: IVORY }}>
          {platform === 'tiktok' ? '🎵 TikTok' : '📸 Instagram'}
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
        <div key={platform} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <MassPosting user={user} />
        </div>
      </Suspense>
    </div>
  )
}
