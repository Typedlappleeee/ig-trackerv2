// Crédits — porté (compact) de electron-app/src/lib/{credits,withCredits}.ts.
// Modèle « débit d'avance » : on débite coût×nb_téléphones avant le run, puis on
// rembourse les téléphones échoués au settle(). Débité sur le compte du PROPRIÉTAIRE
// (owner de l'orga, ou l'utilisateur en perso). MÊMES RPC que le web.
import { supabase } from './supabase'

export const CREDIT_COSTS = { posting: 2, mass_posting: 2, story: 1 } as const

// Crédits mensuels par plan (alignés sur electron-app). 'business' = 'organisation'.
export const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  standard: 3750,
  pro: 11250,
  organisation: 22500,
  business: 22500,
}

// Octroi des crédits mensuels du plan (idempotent par mois calendaire côté RPC).
// À appeler après activation d'une clé, et au chargement pour les détenteurs de
// clé perso (top-up mensuel). Silencieux si la RPC n'est pas déployée.
export async function maybeGrantMonthlyCredits(userId: string, plan: string): Promise<void> {
  const amount = PLAN_MONTHLY_CREDITS[plan] ?? 0
  if (!amount) return
  try {
    await supabase.rpc('maybe_grant_monthly_credits', { p_user_id: userId, p_plan_credits: amount })
  } catch { /* RPC absente → ignore */ }
}

// Utiliser un code de crédits (perso). Crédite le compte de l'utilisateur.
export async function redeemCreditCode(code: string, userId: string): Promise<{ ok: boolean; amount?: number; balance?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('redeem_credit_code', { p_code: code.toUpperCase().replace(/\s/g, ''), p_user_id: userId })
    if (error) return { ok: false, error: error.message }
    return (data as any) ?? { ok: false, error: 'Erreur inconnue' }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

// Utiliser un code de crédits pour l'organisation (crédite le solde partagé).
export async function redeemCreditCodeForOrg(code: string, orgId: string): Promise<{ ok: boolean; amount?: number; balance?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('redeem_credit_code_for_org', { p_code: code.toUpperCase().replace(/\s/g, ''), p_org_id: orgId })
    if (error) return { ok: false, error: error.message }
    return (data as any) ?? { ok: false, error: 'Erreur inconnue' }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

export async function deductCredits(userId: string, amount: number): Promise<{ ok: boolean; error?: string; balance?: number }> {
  if (amount <= 0) return { ok: true }
  try {
    const { data, error } = await supabase.rpc('deduct_user_credits', { p_user_id: userId, p_amount: amount })
    if (error) return { ok: false, error: error.message }
    return (data as any) ?? { ok: false, error: 'Erreur inconnue' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function refundCredits(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true
  try {
    const { error } = await supabase.rpc('refund_user_credits', { p_user_id: userId, p_amount: amount })
    return !error
  } catch { return false }
}

export interface CreditRun {
  markFailed: () => void
  abort: () => void
  settle: () => Promise<{ refunded: number }>
}
export interface CreditRunError { insufficient: true; error: string }

export async function startCreditRun(ownerId: string, costPerUnit: number, unitCount: number): Promise<CreditRun | CreditRunError> {
  const total = costPerUnit * unitCount
  const res = await deductCredits(ownerId, total)
  if (!res.ok) return { insufficient: true, error: res.error ?? 'Crédits insuffisants' }
  let failed = 0, aborted = false, settled = false
  return {
    markFailed: () => { failed++ },
    abort: () => { aborted = true },
    settle: async () => {
      if (settled) return { refunded: 0 }
      settled = true
      const units = aborted ? unitCount : failed
      if (units <= 0) return { refunded: 0 }
      const amount = Math.min(units, unitCount) * costPerUnit
      const ok = await refundCredits(ownerId, amount)
      return { refunded: ok ? amount : 0 }
    },
  }
}

export function isCreditError(r: CreditRun | CreditRunError): r is CreditRunError {
  return (r as CreditRunError).insufficient === true
}
