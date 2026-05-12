import { createContext, useContext } from 'react'
import { supabase } from './supabase'

export interface LicenseStatus {
  valid: boolean
  expiresAt: Date | null   // null = lifetime
  daysLeft: number | null  // null = lifetime
  source: 'own' | 'org_owner' | 'none'
  isSuperAdmin: boolean
}

export async function checkLicense(userId: string, orgId?: string | null): Promise<LicenseStatus> {
  try {
    // Super admin always valid
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.is_super_admin) {
      return { valid: true, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: true }
    }

    // Check own active key (table may not exist yet → silently skip)
    const { data: ownKey, error: ownErr } = await supabase
      .from('license_keys')
      .select('expires_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (!ownErr && ownKey) {
      const expiresAt = ownKey.expires_at ? new Date(ownKey.expires_at) : null
      if (!expiresAt || expiresAt > new Date()) {
        const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null
        return { valid: true, expiresAt, daysLeft, source: 'own', isSuperAdmin: false }
      }
    }

    // Check org owner's key (or super admin status)
    if (orgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('owner_id')
        .eq('id', orgId)
        .maybeSingle()

      if (org?.owner_id && org.owner_id !== userId) {
        // Owner is super admin → all members get access
        const { data: ownerProfile } = await supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', org.owner_id)
          .maybeSingle()

        if (ownerProfile?.is_super_admin) {
          return { valid: true, expiresAt: null, daysLeft: null, source: 'org_owner', isSuperAdmin: false }
        }

        // Owner has an active license key → all members get access
        const { data: ownerKey, error: ownerErr } = await supabase
          .from('license_keys')
          .select('expires_at')
          .eq('user_id', org.owner_id)
          .eq('is_active', true)
          .maybeSingle()

        if (!ownerErr && ownerKey) {
          const expiresAt = ownerKey.expires_at ? new Date(ownerKey.expires_at) : null
          if (!expiresAt || expiresAt > new Date()) {
            const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null
            return { valid: true, expiresAt, daysLeft, source: 'org_owner', isSuperAdmin: false }
          }
        }
      }
    }
  } catch {
    // Network error or schema not applied yet — fail open to avoid blocking the user
  }

  return { valid: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false }
}

export async function activateKey(key: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const normalized = key.toUpperCase().replace(/\s/g, '')

  // Step 1: verify key exists and is unclaimed (needs lk_unactivated_select policy)
  const { data: existing, error: selectErr } = await supabase
    .from('license_keys')
    .select('id')
    .eq('key', normalized)
    .is('user_id', null)
    .eq('is_active', true)
    .maybeSingle()

  if (selectErr) return { success: false, error: selectErr.message }
  if (!existing) return { success: false, error: 'Clé invalide ou déjà utilisée.' }

  // Step 2: claim it
  const { error: updateErr } = await supabase
    .from('license_keys')
    .update({ user_id: userId, activated_at: new Date().toISOString() })
    .eq('id', existing.id)

  if (updateErr) return { success: false, error: updateErr.message }
  return { success: true }
}

// React context so any component can read the license status
export const LicenseContext = createContext<LicenseStatus>({
  valid: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false,
})

export function useLicense() {
  return useContext(LicenseContext)
}
