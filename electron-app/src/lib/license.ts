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
}

const FAIL_OPEN: LicenseStatus = { valid: true, expired: false, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: false, plan: null, orgOwnerPlan: null }

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
      return { valid: true, expired: false, expiresAt: null, daysLeft: null, source: 'own', isSuperAdmin: true, plan: 'organisation', orgOwnerPlan: null }
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

    // Check own active keys — pick the highest-plan valid key if multiple exist
    const { data: ownKeys, error: ownErr } = await supabase
      .from('license_keys')
      .select('expires_at, plan')
      .eq('user_id', userId)
      .eq('is_active', true)

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
        return { valid: true, expired: false, expiresAt, daysLeft, source: 'own', isSuperAdmin: false, plan, orgOwnerPlan }
      }
      // All keys are expired
      return { valid: false, expired: true, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null }
    }

    // Org owner has an active key → member gets access via org
    if (orgOwnerPlan) {
      return { valid: true, expired: false, expiresAt: null, daysLeft: null, source: 'org_owner', isSuperAdmin: false, plan: orgOwnerPlan, orgOwnerPlan }
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
    return { valid: false, expired: hadKey, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null }
  } catch {
    return FAIL_OPEN
  }
}

export async function activateKey(key: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const normalized = key.toUpperCase().replace(/\s/g, '')

  // Step 1: verify key exists and is unclaimed (needs lk_unactivated_select policy)
  const { data: existing, error: selectErr } = await supabase
    .from('license_keys')
    .select('id, plan, duration_days, expires_at, created_at')
    .eq('key', normalized)
    .is('user_id', null)
    .eq('is_active', true)
    .maybeSingle()

  if (selectErr) return { success: false, error: selectErr.message }
  if (!existing) return { success: false, error: 'Clé invalide ou déjà utilisée.' }

  // Durée (jours) apportée par la clé. Priorité à duration_days ; pour les clés
  // legacy (sans cette colonne), on la déduit de created_at → expires_at.
  // null = clé à vie (sans expiration).
  let addDays: number | null
  if (existing.duration_days != null) {
    addDays = existing.duration_days
  } else if (existing.expires_at) {
    const base = existing.created_at ? new Date(existing.created_at).getTime() : Date.now()
    addDays = Math.max(0, Math.ceil((new Date(existing.expires_at).getTime() - base) / 86_400_000))
  } else {
    addDays = null
  }

  // Step 2 : temps restant actuel de l'utilisateur (clés actives non expirées).
  // On part de la date d'expiration la plus lointaine → la nouvelle durée s' AJOUTE
  // par-dessus (cumul). Ex. 26 j restants + clé 30 j = 56 j.
  const now = Date.now()
  const { data: activeKeys } = await supabase
    .from('license_keys')
    .select('id, plan, expires_at')
    .eq('user_id', userId)
    .eq('is_active', true)

  let baseExpiry = now
  let hasLifetime = false
  let bestRank = PLAN_RANK[(existing.plan as Plan) ?? 'standard'] ?? 0
  for (const k of activeKeys ?? []) {
    const rank = PLAN_RANK[(k.plan as Plan) ?? 'standard'] ?? 0
    if (rank > bestRank) bestRank = rank // on garde le meilleur plan (jamais de downgrade)
    if (!k.expires_at) { hasLifetime = true; continue }
    const t = new Date(k.expires_at).getTime()
    if (t > now && t > baseExpiry) baseExpiry = t
  }

  // Nouvelle expiration cumulée (à vie si la clé ou un abo existant est à vie).
  const newExpiresAt = (addDays == null || hasLifetime)
    ? null
    : new Date(baseExpiry + addDays * 86_400_000).toISOString()

  // Plan résultant = le meilleur rang entre la clé et les abos en cours.
  const resultPlan = (Object.keys(PLAN_RANK) as Plan[]).find(p => PLAN_RANK[p] === bestRank)
    ?? ((existing.plan as Plan) ?? 'standard')

  // Step 3 : on réclame la clé en y inscrivant l'expiration cumulée + le plan retenu.
  const { error: updateErr } = await supabase
    .from('license_keys')
    .update({ user_id: userId, activated_at: new Date().toISOString(), expires_at: newExpiresAt, plan: resultPlan })
    .eq('id', existing.id)

  if (updateErr) return { success: false, error: updateErr.message }

  // Step 4 : les anciennes clés actives sont désactivées — leur temps restant est
  // déjà replié dans la nouvelle clé (qui porte l'expiration cumulée).
  for (const old of activeKeys ?? []) {
    await supabase.from('license_keys').update({ is_active: false }).eq('id', old.id)
  }

  // Step 5 : crédits mensuels du plan (best-effort ; une fois par mois calendaire).
  try {
    const { maybeGrantMonthlyCredits } = await import('./credits')
    await maybeGrantMonthlyCredits(userId, resultPlan)
  } catch { /* ignore */ }

  return { success: true }
}

// React context so any component can read the license status
// Resolve the effective plan for phone/feature limits (org member uses owner's plan)
export function effectivePlan(license: LicenseStatus): Plan | null {
  return license.orgOwnerPlan ?? license.plan
}

export const LicenseContext = createContext<LicenseStatus>({
  valid: false, expired: false, expiresAt: null, daysLeft: null, source: 'none', isSuperAdmin: false, plan: null, orgOwnerPlan: null,
})

export function useLicense() {
  return useContext(LicenseContext)
}
