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
  // Super admin always valid
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.is_super_admin) {
    return { valid: true, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: true }
  }

  // Check own active key
  const { data: ownKey } = await supabase
    .from('license_keys')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (ownKey) {
    const expiresAt = ownKey.expires_at ? new Date(ownKey.expires_at) : null
    if (!expiresAt || expiresAt > new Date()) {
      const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null
      return { valid: true, expiresAt, daysLeft, source: 'own', isSuperAdmin: false }
    }
  }

  // Check org owner's key
  if (orgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', orgId)
      .maybeSingle()

    if (org?.owner_id && org.owner_id !== userId) {
      const { data: ownerKey } = await supabase
        .from('license_keys')
        .select('expires_at')
        .eq('user_id', org.owner_id)
        .eq('is_active', true)
        .maybeSingle()

      if (ownerKey) {
        const expiresAt = ownerKey.expires_at ? new Date(ownerKey.expires_at) : null
        if (!expiresAt || expiresAt > new Date()) {
          const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null
          return { valid: true, expiresAt, daysLeft, source: 'org_owner', isSuperAdmin: false }
        }
      }
    }
  }

  return { valid: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false }
}

export async function activateKey(key: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const normalized = key.toUpperCase().replace(/\s/g, '')
  const { data, error } = await supabase
    .from('license_keys')
    .update({ user_id: userId, activated_at: new Date().toISOString() })
    .eq('key', normalized)
    .is('user_id', null)
    .eq('is_active', true)
    .select()
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data)  return { success: false, error: 'Clé invalide ou déjà utilisée.' }
  return { success: true }
}

// React context so any component can read the license status
export const LicenseContext = createContext<LicenseStatus>({
  valid: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false,
})

export function useLicense() {
  return useContext(LicenseContext)
}
