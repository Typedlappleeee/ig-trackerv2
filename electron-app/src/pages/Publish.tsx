/**
 * Publish — page « Publication ».
 * À l'entrée, un popup demande la plateforme cible (Instagram ou TikTok), puis
 * rend le Mass Posting dans le bon mode. Le choix est mémorisé (localStorage
 * `sf-mp-platform`) et relisible par MassPosting. Un bouton « changer » rouvre
 * le popup.
 */
import { useState, Suspense, lazy } from 'react'
import type { User } from '@supabase/supabase-js'
import { HAIR } from '@/lib/theme'
import { useLicense } from '@/lib/license'
import { useTr } from '@/lib/i18n'

const MassPosting  = lazy(() => import('@/pages/MassPosting').then(m => ({ default: m.MassPosting })))
const CrossPosting = lazy(() => import('@/pages/CrossPosting').then(m => ({ default: m.CrossPosting })))

type Platform = 'instagram' | 'tiktok' | 'threads'

const PLATFORMS: {
  k: Platform; label: string; desc: string; descEn: string; admin?: boolean
  grad: string; glow: string; accent: string; icon: JSX.Element
}[] = [
  {
    k: 'instagram', label: 'Instagram', desc: 'Reels — publication native via RPA', descEn: 'Reels — native posting via RPA',
    grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.5)', accent: '#F472B6',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="#fff" stroke="none"/></svg>,
  },
  {
    k: 'tiktok', label: 'TikTok', desc: 'Vidéos — publication native GeeLark', descEn: 'Videos — native GeeLark posting',
    grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', glow: 'rgba(34,211,238,0.5)', accent: '#22D3EE',
    icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 3c.4 2.4 2 4.1 4.5 4.4v3c-1.7.1-3.2-.4-4.6-1.3v6.2c0 3.6-2.7 5.9-6 5.9-3.2 0-5.6-2.5-5.6-5.5 0-3.4 2.9-5.9 6.4-5.3v3.1c-.4-.1-.9-.2-1.3-.2-1.4 0-2.4 1-2.4 2.4 0 1.4 1 2.4 2.5 2.4 1.6 0 2.6-1.1 2.6-2.9V3h3.9z"/></svg>,
  },
  {
    k: 'threads', label: 'Threads', desc: 'Vidéos & photos — publication native GeeLark', descEn: 'Videos & photos — native GeeLark posting', admin: true,
    grad: 'linear-gradient(135deg,#111,#333)', glow: 'rgba(255,255,255,0.25)', accent: '#e5e7eb',
    icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M12.5 2C7 2 4 5.2 4 12s3 10 8.5 10c4 0 6.6-2 7.2-5.3.3-1.7-.2-3.3-1.4-4.4-.9-.8-2.1-1.3-3.6-1.4.1-1-.2-1.8-.8-2.3-.6-.5-1.4-.7-2.3-.6-1.3.1-2.3.9-2.6 2.1l1.8.5c.1-.5.5-.8 1-.9.4 0 .7.1.9.3.1.1.2.3.2.6-2.4.1-4 1.2-4 3.1 0 1.7 1.4 2.8 3.2 2.8 2 0 3.3-1.3 3.6-3.4.8.1 1.4.4 1.8.8.6.5.8 1.3.7 2.2-.4 2.1-2 3.3-4.9 3.3-4 0-6.3-2.5-6.3-8s2.3-8 6.3-8c2.6 0 4.4 1.1 5.4 3.2l1.7-.8C18.4 3.5 15.9 2 12.5 2zm-.3 11.9c-.8 0-1.4-.4-1.4-1 0-.7.7-1.2 2-1.2h.4c-.2 1.4-.9 2.2-1 2.2z"/></svg>,
  },
]

export function Publish({ user }: { user: User }) {
  const { isSuperAdmin } = useLicense()
  const tr = useTr()
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
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-6)' }}>
        <div className="sf-anim-scale-spring sf-elev-3" style={{
          width: '100%', maxWidth: 520, position: 'relative',
          background: 'linear-gradient(170deg, var(--surface-2), var(--surface))',
          border: '1px solid var(--border-md)',
          borderRadius: 'var(--r-xl)', overflow: 'hidden',
        }}>
          <div aria-hidden style={{ position: 'absolute', top: -70, left: '30%', width: 300, height: 180, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.16), transparent 70%)', filter: 'var(--blur-lg)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', padding: 'var(--sp-6) var(--sp-6) var(--sp-1)', textAlign: 'center' }}>
            <p className="sf-eyebrow" style={{ margin: '0 0 var(--sp-1)' }}>{tr('Publication', 'Publishing')}</p>
            <h2 className="sf-page-title" style={{ margin: 0 }}>{tr('Où veux-tu publier ?', 'Where do you want to publish?')}</h2>
            <p className="sf-page-sub" style={{ marginTop: 6, marginBottom: 0 }}>
              {tr('Choisis la plateforme pour cette session de publication.', 'Choose the platform for this publishing session.')}
            </p>
          </div>
          <div className="anim-stagger" style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${Math.min(platforms.length, 3)}, 1fr)`, gap: 'var(--sp-3)', padding: 'var(--sp-5)' }}>
            {platforms.map(p => (
              <button
                key={p.k}
                onClick={() => choose(p.k)}
                className="cursor-pointer sf-press sf-anim-slide-up"
                aria-label={p.label}
                style={{
                  padding: 'var(--sp-4)', borderRadius: 'var(--r-lg)', textAlign: 'center',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
                  border: `1px solid ${last === p.k ? `${p.accent}59` : 'var(--border-md)'}`,
                  boxShadow: last === p.k ? 'var(--elev-1)' : 'none',
                  transition: 'transform var(--t-smooth), box-shadow var(--t-base), border-color var(--t-base)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-2)',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 22px 46px -20px ${p.glow}`; e.currentTarget.style.borderColor = `${p.accent}66` }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = last === p.k ? 'var(--elev-1)' : 'none'; e.currentTarget.style.borderColor = last === p.k ? `${p.accent}59` : 'var(--border-md)' }}
              >
                <div className="sf-page-icon" style={{ ['--icon-grad' as any]: p.grad, background: p.grad, boxShadow: `0 10px 22px -8px ${p.glow}, inset 0 1px 0 rgba(255,255,255,0.3)` }}>{p.icon}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.45 }}>{tr(p.desc, p.descEn)}</div>
                </div>
                {last === p.k && (
                  <span className="sf-badge" style={{ color: p.accent, background: `${p.accent}1f`, border: `1px solid ${p.accent}3d` }}>{tr('Dernier choix', 'Last choice')}</span>
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
      <div className="sf-cluster" style={{
        flexShrink: 0, gap: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-7)', borderBottom: `1px solid ${HAIR}`,
      }}>
        <span className="sf-section-label" style={{ marginBottom: 0 }}>{tr('Plateforme', 'Platform')}</span>
        <span className="sf-status-chip" style={{
          color: cur.accent, background: `${cur.accent}14`, border: `1px solid ${cur.accent}3d`,
        }}>
          <span style={{ display: 'inline-flex', transform: 'scale(0.66)', marginLeft: -4, marginRight: -2 }}>{cur.icon}</span>
          {cur.label}
        </span>
        <button
          onClick={() => setPlatform(null)}
          className="cursor-pointer sf-btn sf-btn-secondary sf-btn-sm"
          style={{ marginLeft: 'auto' }}
        >{tr('Changer de plateforme', 'Change platform')}</button>
      </div>

      <Suspense fallback={
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', padding: 'var(--sp-6) var(--sp-7)' }}>
          <div className="sf-skeleton sf-skeleton-line" style={{ maxWidth: 320 }} />
          <div className="sf-grid-3" style={{ gap: 'var(--sp-4)' }}>
            <div className="sf-skeleton sf-skeleton-card" style={{ height: 120 }} />
            <div className="sf-skeleton sf-skeleton-card" style={{ height: 120 }} />
            <div className="sf-skeleton sf-skeleton-card" style={{ height: 120 }} />
          </div>
          <div className="sf-skeleton sf-skeleton-card" style={{ height: 220 }} />
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
