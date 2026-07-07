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
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 28px 60px' }}>
        <OrganizationPanel user={user} />
      </div>
    </div>
  )
}
