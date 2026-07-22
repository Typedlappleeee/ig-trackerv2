import { createContext, useContext } from 'react'
import { supabase } from './supabase'

export type Plan = 'standard' | 'pro' | 'organisation'

const PLAN_RANK: Record<Plan, number> = { standard: 0, pro: 1, organisation: 2 }

export interface LicenseStatus {
  valid: boolean
  expired: boolean          // true when user had a key but it expired (vs never had one)
  expiresAt: Date | null   // null = no expiry (set by admin for long-term keys)
  daysLeft: number | null  // null = no expiry
  source: 'own' | 'org_owner' | 'none'
  isSuperAdmin: boolean
  plan: Plan | null
  // Org owner's plan — used for phone limits so a Pro member doesn't bypass a Standard org's limit.
  // null when not in org mode or when the user IS the org owner.
  orgOwnerPlan: Plan | null
  // Add-on VIP "Blowsome" : true si la clé active du user porte le flag → débloque l'onglet Blowsome.
  blowsome: boolean
}

const FAIL_OPEN: LicenseStatus = { valid: true, expired: false, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: false, plan: null, orgOwnerPlan: null, blowsome: false }

const HARDCODED_SUPER_ADMINS = ['tintin.aunea@gmail.com']

export async function checkLicense(userId: string, orgId?: string | null): Promise<LicenseStatus> {
  try {
    // Super admin always valid
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('is_super_admin, email')
      .eq('id', userId)
      .maybeSingle()

    // Any Supabase error (500, network, stale schema cache) → fail open
    if (profileErr) return FAIL_OPEN

    const isSuperAdmin = profile?.is_super_admin ||
      HARDCODED_SUPER_ADMINS.includes(profile?.email ?? '') ||
      HARDCODED_SUPER_ADMINS.includes((await supabase.auth.getUser()).data.user?.email ?? '')

    if (isSuperAdmin) {
      return { valid: true, expired: false, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: true, plan: 'organisation', orgOwnerPlan: null, blowsome: true }
    }

    // Helper: resolve org owner plan (null if not in org mode or user is the owner).
    // Primary path: SECURITY DEFINER RPC `org_owner_plan` — bypasses RLS so a
    // member can validate access via the OWNER's license without needing their
    // own key (you don't need a license to JOIN an org, only the org needs one).
    let orgOwnerPlan: LicenseStatus['plan'] = null
    if (orgId) {
      const { data: rpcPlan, error: rpcErr } = await supabase.rpc('org_owner_plan', { p_org: orgId })
      if (!rpcErr && rpcPlan) {
        orgOwnerPlan = rpcPlan as LicenseStatus['plan']
      } else {
        // Fallback (RPC not deployed yet): direct queries via RLS policies.
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
    }

    // Check own active keys — pick the highest-plan valid key if multiple exist.
    // `blowsome` peut ne pas exister si la migration n'est pas passée → on retente
    // sans la colonne pour ne rien casser (blowsome sera simplement false).
    let ownKeysRes = await supabase
      .from('license_keys')
      .select('expires_at, plan, blowsome')
      .eq('user_id', userId)
      .eq('is_active', true)
    if (ownKeysRes.error && /blowsome/.test(ownKeysRes.error.message)) {
      ownKeysRes = await supabase
        .from('license_keys')
        .select('expires_at, plan')
        .eq('user_id', userId)
        .eq('is_active', true) as typeof ownKeysRes
    }
    const { data: ownKeys, error: ownErr } = ownKeysRes

    if (ownErr) return FAIL_OPEN

    if (ownKeys && ownKeys.length > 0) {
      const now = new Date()
      const validKeys = ownKeys.filter(k => {
        const exp = k.expires_at ? new Date(k.expires_at) : null
        return !exp || exp > now
      })

      if (validKeys.length > 0) {
        const bestKey = validKeys.sort((a, b) =>
          (PLAN_RANK[(b.plan as Plan) ?? 'standard'] ?? 0) - (PLAN_RANK[(a.plan as Plan) ?? 'standard'] ?? 0)
        )[0]
        const expiresAt = bestKey.expires_at ? new Date(bestKey.expires_at) : null
        const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null
        const plan = (bestKey.plan as Plan) ?? 'standard'
        // blowsome : true si AU MOINS une clé valide porte le flag.
        const blowsome = validKeys.some(k => (k as { blowsome?: boolean }).blowsome === true)
        return { valid: true, expired: false, expiresAt, daysLeft, source: 'own', isSuperAdmin: false, plan, orgOwnerPlan, blowsome }
      }
      // All keys are expired
      return { valid: false, expired: true, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null, blowsome: false }
    }

    // Org owner has an active key → member gets access via org
    if (orgOwnerPlan) {
      return { valid: true, expired: false, expiresAt: null, daysLeft: null, source: 'org_owner', isSuperAdmin: false, plan: orgOwnerPlan, orgOwnerPlan, blowsome: false }
    }

    // No active key found — check if user ever had one (active or deactivated) to distinguish
    // "key expired/deactivated" from "never subscribed"
    const { data: anyKey } = await supabase
      .from('license_keys')
      .select('expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const hadKey = !!anyKey
    return { valid: false, expired: hadKey, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null, blowsome: false }
  } catch {
    return FAIL_OPEN
  }
}

export async function activateKey(key: string, userId: string): Promise<{ success: boolean; error?: string }> {
  // Toute la logique (vérif clé non réclamée, cumul de durée, meilleur plan,
  // claim atomique, désactivation des anciennes clés) est faite côté serveur par
  // la RPC SECURITY DEFINER — le client ne voit JAMAIS les clés non attribuées.
  const { data, error } = await supabase.rpc('activate_license_key', {
    p_key: key,
    p_user_id: userId,
  })
  if (error) return { success: false, error: error.message }

  const res = data as { ok: boolean; error?: string; plan?: string } | null
  if (!res?.ok) return { success: false, error: res?.error ?? 'Activation impossible.' }

  // Crédits mensuels du plan (best-effort ; une fois par mois calendaire).
  try {
    const { maybeGrantMonthlyCredits } = await import('./credits')
    await maybeGrantMonthlyCredits(userId, (res.plan as Plan) ?? 'standard')
  } catch { /* ignore */ }

  return { success: true }
}

// React context so any component can read the license status
// Resolve the effective plan for phone/feature limits (org member uses owner's plan)
export function effectivePlan(license: LicenseStatus): Plan | null {
  return license.orgOwnerPlan ?? license.plan
}

export const LicenseContext = createContext<LicenseStatus>({
  valid: false, expired: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null, blowsome: false,
})

export function useLicense() {
  return useContext(LicenseContext)
}
