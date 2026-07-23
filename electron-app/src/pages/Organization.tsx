/**
 * « Mon organisation » — onglet dédié (au lieu d'être enterré dans les Réglages).
 * Gère l'équipe : membres, invitations (par code), rôles & permissions par membre,
 * rôles personnalisés, journal d'activité. Tout est déjà porté par OrganizationPanel ;
 * cette page ne fait que lui donner un vrai cadre plein écran.
 */
import type { User } from '@supabase/supabase-js'
import { OrganizationPanel } from '@/components/OrganizationPanel'

export function Organization({ user }: { user: User }) {
  return (
    <div
      className="anim-page"
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative' }}
    >
      {/* Ambient glow — signature ScaleFlow indigo/violet */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)',
          width: 620, height: 360, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.12), rgba(139,92,246,0.06) 45%, transparent 70%)',
          filter: 'blur(64px)', pointerEvents: 'none', zIndex: 0,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 940, margin: '0 auto', padding: '24px 28px 72px' }}>
        <OrganizationPanel user={user} />
      </div>
    </div>
  )
}
