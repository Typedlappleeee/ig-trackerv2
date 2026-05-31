import { createContext, useContext } from 'react'
import { supabase } from './supabase'

export type Plan = 'standard' | 'pro' | 'organisation'

export interface LicenseStatus {
  valid: boolean
  expiresAt: Date | null   // null = no expiry (set by admin for long-term keys)
  daysLeft: number | null  // null = no expiry
  source: 'own' | 'org_owner' | 'none'
  isSuperAdmin: boolean
  plan: Plan | null
  // Org owner's plan — used for phone limits so a Pro member doesn't bypass a Standard org's limit.
  // null when not in org mode or when the user IS the org owner.
  orgOwnerPlan: Plan | null
}

const FAIL_CLOSED: LicenseStatus = { valid: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null }

// ── License cache ──────────────────────────────────────────────────────────────
// On network/Supabase errors we fall back to the last known-valid state (48 h TTL).
// This prevents legitimate users from being locked out during brief outages
// while still closing access after extended offline periods.
const LICENSE_CACHE_KEY = 'sf_lic_v1'
const CACHE_TTL_MS = 48 * 60 * 60 * 1000

function readLicenseCache(userId: string): LicenseStatus | null {
  try {
    const raw = localStorage.getItem(LICENSE_CACHE_KEY)
    if (!raw) return null
    const { uid, ts, data } = JSON.parse(raw)
    if (uid !== userId || Date.now() - (ts ?? 0) > CACHE_TTL_MS) return null
    return data as LicenseStatus
  } catch { return null }
}

function writeLicenseCache(userId: string, status: LicenseStatus) {
  try {
    if (!status.valid && !status.isSuperAdmin) return
    localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify({ uid: userId, ts: Date.now(), data: status }))
  } catch {}
}

export function clearLicenseCache() {
  try { localStorage.removeItem(LICENSE_CACHE_KEY) } catch {}
}

// ── Main check ─────────────────────────────────────────────────────────────────

export async function checkLicense(userId: string, orgId?: string | null): Promise<LicenseStatus> {
  try {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('is_super_admin, email')
      .eq('id', userId)
      .maybeSingle()

    if (profileErr) return readLicenseCache(userId) ?? FAIL_CLOSED

    const isSuperAdmin = profile?.is_super_admin === true

    if (isSuperAdmin) {
      const result: LicenseStatus = { valid: true, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: true, plan: 'organisation', orgOwnerPlan: null }
      writeLicenseCache(userId, result)
      return result
    }

    // Helper: resolve org owner plan (null if not in org mode or user is the owner)
    let orgOwnerPlan: LicenseStatus['plan'] = null
    if (orgId) {
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('owner_id')
        .eq('id', orgId)
        .maybeSingle()

      if (orgErr) return readLicenseCache(userId) ?? FAIL_CLOSED

      if (org?.owner_id && org.owner_id !== userId) {
        const { data: ownerProfile, error: ownerProfileErr } = await supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', org.owner_id)
          .maybeSingle()

        if (ownerProfileErr) return readLicenseCache(userId) ?? FAIL_CLOSED

        if (ownerProfile?.is_super_admin) {
          orgOwnerPlan = 'pro'
        } else {
          const { data: ownerKey, error: ownerKeyErr } = await supabase
            .from('license_keys')
            .select('expires_at, plan')
            .eq('user_id', org.owner_id)
            .eq('is_active', true)
            .maybeSingle()

          if (ownerKeyErr) return readLicenseCache(userId) ?? FAIL_CLOSED

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

    if (ownErr) return readLicenseCache(userId) ?? FAIL_CLOSED

    if (ownKey) {
      const expiresAt = ownKey.expires_at ? new Date(ownKey.expires_at) : null
      if (!expiresAt || expiresAt > new Date()) {
        const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null
        const plan = (ownKey.plan as LicenseStatus['plan']) ?? 'standard'
        const result: LicenseStatus = { valid: true, expiresAt, daysLeft, source: 'own', isSuperAdmin: false, plan, orgOwnerPlan }
        writeLicenseCache(userId, result)
        return result
      }
    }

    // Org owner has an active key → member gets access via org
    if (orgOwnerPlan) {
      const result: LicenseStatus = { valid: true, expiresAt: null, daysLeft: null, source: 'org_owner', isSuperAdmin: false, plan: orgOwnerPlan, orgOwnerPlan }
      writeLicenseCache(userId, result)
      return result
    }
  } catch {
    return readLicenseCache(userId) ?? FAIL_CLOSED
  }

  return FAIL_CLOSED
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

  // Invalidate cache so the new key is picked up on next check
  clearLicenseCache()

  return { success: true }
}

// React context so any component can read the license status
// Resolve the effective plan for phone/feature limits (org member uses owner's plan)
export function effectivePlan(license: LicenseStatus): Plan | null {
  return license.orgOwnerPlan ?? license.plan
}

export const LicenseContext = createContext<LicenseStatus>({
  valid: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null,
})

export function useLicense() {
  return useContext(LicenseContext)
}
