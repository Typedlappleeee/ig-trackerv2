import { createContext, useContext } from 'react'
import { supabase } from './supabase'

export interface LicenseStatus {
  valid: boolean
  expiresAt: Date | null   // null = lifetime
  daysLeft: number | null  // null = lifetime
  source: 'own' | 'org_owner' | 'none'
  isSuperAdmin: boolean
  plan: 'standard' | 'pro' | 'lifetime' | null
  // Org owner's plan — used for phone limits so a Pro member doesn't bypass a Standard org's limit.
  // null when not in org mode or when the user IS the org owner.
  orgOwnerPlan: 'standard' | 'pro' | 'lifetime' | null
}

const FAIL_OPEN: LicenseStatus = { valid: true, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: false, plan: null, orgOwnerPlan: null }

export async function checkLicense(userId: string, orgId?: string | null): Promise<LicenseStatus> {
  try {
    // Super admin always valid
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', userId)
      .maybeSingle()

    // Any Supabase error (500, network, stale schema cache) → fail open
    if (profileErr) return FAIL_OPEN

    if (profile?.is_super_admin) {
      return { valid: true, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: true, plan: 'pro', orgOwnerPlan: null }
    }

    // Helper: resolve org owner plan (null if not in org mode or user is the owner)
    let orgOwnerPlan: LicenseStatus['plan'] = null
    if (orgId) {
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('owner_id')
        .eq('id', orgId)
        .maybeSingle()

      if (orgErr) return FAIL_OPEN

      if (org?.owner_id && org.owner_id !== userId) {
        const { data: ownerProfile, error: ownerProfileErr } = await supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', org.owner_id)
          .maybeSingle()

        if (ownerProfileErr) return FAIL_OPEN

        if (ownerProfile?.is_super_admin) {
          orgOwnerPlan = 'pro'
        } else {
          const { data: ownerKey, error: ownerKeyErr } = await supabase
            .from('license_keys')
            .select('expires_at, plan')
            .eq('user_id', org.owner_id)
            .eq('is_active', true)
            .maybeSingle()

          if (ownerKeyErr) return FAIL_OPEN

          if (ownerKey) {
            const exp = ownerKey.expires_at ? new Date(ownerKey.expires_at) : null
            if (!exp || exp > new Date()) {
              orgOwnerPlan = (ownerKey.plan as LicenseStatus['plan']) ?? 'standard'
            }
          }
        }
      }
    }

    // Check own active key — gives access even without an org
    const { data: ownKey, error: ownErr } = await supabase
      .from('license_keys')
      .select('expires_at, plan')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (ownErr) return FAIL_OPEN

    if (ownKey) {
      const expiresAt = ownKey.expires_at ? new Date(ownKey.expires_at) : null
      if (!expiresAt || expiresAt > new Date()) {
        const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null
        const plan = (ownKey.plan as LicenseStatus['plan']) ?? 'standard'
        return { valid: true, expiresAt, daysLeft, source: 'own', isSuperAdmin: false, plan, orgOwnerPlan }
      }
    }

    // Org owner has an active key → member gets access via org
    if (orgOwnerPlan) {
      return { valid: true, expiresAt: null, daysLeft: null, source: 'org_owner', isSuperAdmin: false, plan: orgOwnerPlan, orgOwnerPlan }
    }
  } catch {
    return FAIL_OPEN
  }

  return { valid: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null }
}

export async function activateKey(key: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const normalized = key.toUpperCase().replace(/\s/g, '')

  // Step 1: verify key exists and is unclaimed (needs lk_unactivated_select policy)
  const { data: existing, error: selectErr } = await supabase
    .from('license_keys')
    .select('id, plan')
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

  // Step 3: grant monthly credits for the plan (best-effort; ignore errors)
  try {
    const { maybeGrantMonthlyCredits } = await import('./credits')
    await maybeGrantMonthlyCredits(userId, (existing as { plan?: string }).plan ?? 'standard')
  } catch { /* ignore */ }

  return { success: true }
}

// React context so any component can read the license status
export const LicenseContext = createContext<LicenseStatus>({
  valid: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null,
})

export function useLicense() {
  return useContext(LicenseContext)
}
