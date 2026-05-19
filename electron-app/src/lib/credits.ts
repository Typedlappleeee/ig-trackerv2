import { createContext, useContext } from 'react'
import { supabase } from './supabase'

export const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  standard:     2500,
  pro:          5500,
  organisation: 11000,
}

// Max phones per plan (Infinity = unlimited)
export const PLAN_MAX_PHONES: Record<string, number> = {
  standard:     50,
  pro:          200,
  organisation: Infinity,
}

// Max accounts in a single mass-posting batch
export const PLAN_MAX_MASS_POSTING: Record<string, number> = {
  standard:     10,
  pro:          Infinity,
  organisation: Infinity,
}

export const CREDIT_COSTS = {
  montage:      1,
  remix:        2,
  posting:      1,  // per phone
  mass_posting: 2,  // per phone
} as const

// Credit packs — intentionally more expensive per credit than subscriptions
// to encourage monthly plans (Standard = $0.020/cr, Pro = $0.0182/cr, Org = $0.0136/cr)
export const CREDIT_PACKS = [
  { credits: 500,   price: 19.99,  label: '500 crédits',    perCr: 0.040 },
  { credits: 1200,  price: 39.99,  label: '1 200 crédits',  perCr: 0.033 },
  { credits: 2500,  price: 74.99,  label: '2 500 crédits',  perCr: 0.030 },
  { credits: 6000,  price: 164.99, label: '6 000 crédits',  perCr: 0.027 },
  { credits: 15000, price: 374.99, label: '15 000 crédits', perCr: 0.025 },
]

export interface CreditState {
  balance: number
  loading: boolean
  refresh: () => void
  ownerId: string   // user_id whose credits are shown/charged (org owner in org mode, self otherwise)
}

export const CreditContext = createContext<CreditState>({
  balance: 0,
  loading: true,
  refresh: () => {},
  ownerId: '',
})

export function useCredits() {
  return useContext(CreditContext)
}

export async function fetchBalance(userId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.balance ?? 0
  } catch {
    return 0
  }
}

// Fetch org owner's balance via SECURITY DEFINER RPC (bypasses RLS for members).
// Falls back to own balance if the function doesn't exist yet.
export async function fetchOrgBalance(orgId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_org_credit_balance', { p_org_id: orgId })
    if (error) throw error
    return typeof data === 'number' ? data : 0
  } catch {
    return 0
  }
}

export async function checkAndDeductCredits(
  userId: string,
  amount: number,
): Promise<{ ok: boolean; error?: string; balance?: number }> {
  try {
    const { data, error } = await supabase.rpc('deduct_user_credits', {
      p_user_id: userId,
      p_amount:  amount,
    })
    if (error) return { ok: false, error: error.message }
    if (!data?.ok) return { ok: false, error: data?.error ?? 'Crédits insuffisants' }
    return { ok: true, balance: data.balance }
  } catch {
    // Table doesn't exist yet — fail open so features still work
    return { ok: true, balance: 0 }
  }
}

export async function redeemCreditCode(
  code: string,
  userId: string,
): Promise<{ ok: boolean; amount?: number; balance?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('redeem_credit_code', {
      p_code:    code.toUpperCase().replace(/\s/g, ''),
      p_user_id: userId,
    })
    if (error) return { ok: false, error: error.message }
    return data ?? { ok: false, error: 'Erreur inconnue' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function maybeGrantMonthlyCredits(userId: string, plan: string): Promise<void> {
  const amount = PLAN_MONTHLY_CREDITS[plan] ?? 0
  if (!amount) return
  try {
    await supabase.rpc('maybe_grant_monthly_credits', {
      p_user_id:      userId,
      p_plan_credits: amount,
    })
  } catch {
    // Silently ignore if the function doesn't exist yet
  }
}
