import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'

// Licence — porté de electron-app/src/lib/license.ts.
// `valid` = le compte a le droit d'utiliser l'app (clé active non expirée, OU membre
// d'une org dont l'owner a une clé, OU superadmin). Sans ça → écran d'activation.
export interface License {
  isSuperAdmin: boolean
  blowsome: boolean
  valid: boolean
  expired: boolean   // avait une clé mais elle a expiré (≠ n'a jamais eu de clé)
  loading: boolean
}

const HARDCODED_SUPER_ADMINS = ['tintin.aunea@gmail.com']

// Sécurité DISPONIBILITÉ : si la BASE est injoignable (500, réseau, cache schéma), on
// n'enferme PAS tout le monde dehors → on considère l'accès valide (fail-open). Le
// verrouillage licence ne doit jamais transformer une panne Supabase en panne totale.
const FAIL_OPEN: Omit<License, 'loading'> = { isSuperAdmin: false, blowsome: false, valid: true, expired: false }

async function checkLicense(userId: string, orgId: string | null): Promise<Omit<License, 'loading'>> {
  let authEmail = ''
  try { authEmail = (await supabase.auth.getUser()).data.user?.email ?? '' } catch { /* hors ligne */ }
  if (HARDCODED_SUPER_ADMINS.includes(authEmail)) return { isSuperAdmin: true, blowsome: true, valid: true, expired: false }

  // SOURCE AUTORITAIRE : RPC SECURITY DEFINER `my_license` — lit la licence de
  // l'appelant côté serveur (auth.uid()), en contournant la RLS de lecture. Sans
  // ça, si la policy `lk_owner_select` n'est pas déployée, un compte AVEC licence
  // valide était renvoyé sur l'écran d'activation. Fallback direct si non déployée.
  try {
    const { data, error } = await supabase.rpc('my_license')
    if (!error && data) {
      const r = data as { valid?: boolean; expired?: boolean; blowsome?: boolean; super?: boolean; own?: boolean; plan?: string; authless?: boolean }
      // Session pas encore prête côté serveur → on ne verrouille pas (fail-open).
      if (r.authless) return FAIL_OPEN
      // Top-up mensuel best-effort pour les détenteurs de clé PERSO (pas les membres
      // d'org : leurs crédits vont au propriétaire). Idempotent par mois côté RPC.
      if (r.valid && r.own && r.plan && !r.super) {
        try { const { maybeGrantMonthlyCredits } = await import('./credits'); void maybeGrantMonthlyCredits(userId, r.plan) } catch { /* ignore */ }
      }
      return { isSuperAdmin: !!r.super, blowsome: !!r.blowsome, valid: !!r.valid, expired: !!r.expired }
    }
    // error PGRST202 (RPC pas déployée) ou autre → on tombe sur le fallback direct.
  } catch { /* fallback direct */ }

  try {
    const { data: profile, error: profErr } = await supabase
      .from('profiles').select('is_super_admin, email').eq('id', userId).maybeSingle()
    if (profErr) return FAIL_OPEN
    const isSuperAdmin = !!(profile as any)?.is_super_admin || HARDCODED_SUPER_ADMINS.includes((profile as any)?.email ?? '')
    if (isSuperAdmin) return { isSuperAdmin: true, blowsome: true, valid: true, expired: false }

    // Accès hérité de l'organisation (l'OWNER a une clé) — best-effort via RPC.
    let orgValid = false, orgBlowsome = false
    if (orgId) {
      try { const { data } = await supabase.rpc('org_owner_plan', { p_org: orgId }); if (data) orgValid = true } catch { /* RPC absente */ }
      try { const { data } = await supabase.rpc('org_owner_blowsome', { p_org: orgId }); if (data === true) { orgBlowsome = true; orgValid = true } } catch { /* ignore */ }
    }

    // Clés PERSO actives. La colonne blowsome peut manquer → on retente sans.
    let res = await supabase.from('license_keys').select('expires_at, blowsome, is_active').eq('user_id', userId).eq('is_active', true)
    if (res.error && /blowsome/.test(res.error.message)) {
      res = await supabase.from('license_keys').select('expires_at, is_active').eq('user_id', userId).eq('is_active', true) as typeof res
    }
    if (res.error) return FAIL_OPEN
    const ownKeys = (res.data ?? []) as { expires_at: string | null; blowsome?: boolean }[]
    const now = Date.now()
    const validKeys = ownKeys.filter(k => !k.expires_at || new Date(k.expires_at).getTime() > now)

    if (validKeys.length > 0) {
      const blowsome = validKeys.some(k => k.blowsome === true) || orgBlowsome
      return { isSuperAdmin: false, blowsome, valid: true, expired: false }
    }
    if (ownKeys.length > 0) {
      // Avait des clés mais toutes expirées → invalide (sauf si l'org couvre encore).
      if (orgValid) return { isSuperAdmin: false, blowsome: orgBlowsome, valid: true, expired: false }
      return { isSuperAdmin: false, blowsome: false, valid: false, expired: true }
    }
    // Aucune clé perso : accès via org, sinon → écran d'activation.
    if (orgValid) return { isSuperAdmin: false, blowsome: orgBlowsome, valid: true, expired: false }
    // Distingue « clé expirée/désactivée » de « jamais eu de clé ».
    const { data: anyKey } = await supabase.from('license_keys').select('expires_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return { isSuperAdmin: false, blowsome: false, valid: false, expired: !!anyKey }
  } catch {
    return FAIL_OPEN
  }
}

// Active une clé pour le compte (RPC SECURITY DEFINER : claim atomique côté serveur).
// Priorité à `claim_license_key(p_key)` qui se base sur auth.uid() → plus de
// « Non autorisé » par mismatch d'id. Fallback vers l'ancienne RPC si non déployée.
export async function activateKey(key: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const k = key.trim()
  type RpcRes = { ok?: boolean; error?: string; plan?: string } | null
  try {
    let res: RpcRes = null
    const claim = await supabase.rpc('claim_license_key', { p_key: k })
    if (claim.error && /PGRST202|not find|schema cache/i.test(claim.error.message)) {
      // RPC pas déployée → ancienne signature (p_key, p_user_id).
      const legacy = await supabase.rpc('activate_license_key', { p_key: k, p_user_id: userId })
      if (legacy.error) return { ok: false, error: legacy.error.message }
      res = legacy.data as RpcRes
    } else if (claim.error) {
      return { ok: false, error: claim.error.message }
    } else {
      res = claim.data as RpcRes
    }
    if (!res?.ok) return { ok: false, error: res?.error ?? 'Clé invalide ou déjà utilisée.' }
    // Crédits mensuels du plan (best-effort ; idempotent par mois calendaire).
    try { const { maybeGrantMonthlyCredits } = await import('./credits'); await maybeGrantMonthlyCredits(userId, res.plan ?? 'standard') } catch { /* ignore */ }
    return { ok: true }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau.' } }
}

export function useLicense(user: User, org: OrgState): License {
  const { currentOrg } = org
  const [lic, setLic] = useState<License>({ isSuperAdmin: false, blowsome: false, valid: true, expired: false, loading: true })
  useEffect(() => {
    let cancelled = false
    setLic(l => ({ ...l, loading: true }))
    checkLicense(user.id, currentOrg?.id ?? null).then(r => {
      if (!cancelled) setLic({ ...r, loading: false })
    })
    return () => { cancelled = true }
  }, [user.id, currentOrg?.id])
  return lic
}
