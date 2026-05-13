import { createContext, useContext } from 'react'
import { supabase } from './supabase'

export const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  standard: 2000,
  pro:      5500,
  lifetime: 5500,
}

export const CREDIT_COSTS = {
  montage: 1,
  remix:   2,
} as const

export const CREDIT_PACKS = [
  { credits: 100,  price: 2,   label: '100 crédits',  bonus: '' },
  { credits: 500,  price: 8,   label: '500 crédits',  bonus: '+25 bonus' },
  { credits: 1500, price: 20,  label: '1 500 crédits', bonus: '+150 bonus' },
  { credits: 5000, price: 55,  label: '5 000 crédits', bonus: '+500 bonus' },
]

export interface CreditState {
  balance: number
  loading: boolean
  refresh: () => void
}

export const CreditContext = createContext<CreditState>({
  balance: 0,
  loading: true,
  refresh: () => {},
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
