import { createContext, useContext } from 'react'
import { supabase } from './supabase'

// Crédits mensuels par plan. Cibles : Standard 25 comptes, Pro 75, Org 150
// (2 vidéos + 1 story / compte / jour ≈ 150 crédits/compte/mois). Valeur
// dégressive : plus le plan est gros, moins le crédit coûte.
export const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  standard:     3750,
  pro:          11250,
  organisation: 22500,
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
  remix:        0,    // gratuit (outil vidéo)
  clone_vid:    0,    // gratuit (Spoof / outil vidéo)
  posting:      2,    // per phone (Posting) — 2 crédits par vidéo postée
  mass_posting: 2,    // per phone (MassPosting) — idem posting (anti-bypass)
  story:        1,    // per phone (Story / StoryLink)
  // Tâches automatiques (recurring_tasks) :
  //   task_daily  : 50 crédits/jour par tâche active, débités à minuit UTC.
  //                 Le premier jour, débités au moment du premier posting (pas à minuit).
  //   task_per_run: N téléphones × 2 crédits à chaque exécution (même logique que mass_posting).
  //   Si les crédits sont insuffisants, la tâche est mise en pause automatiquement.
  task_daily:   50,   // per active task per day
  task_per_run: 2,    // per phone per run (same as mass_posting)
} as const

// Cost of a scheduled post, derived from its type — used for deduction at
// scheduling time and refund on cancellation.
export function scheduledPostCost(type: string, phoneCount: number): number {
  const perPhone = type === 'mass_posting' ? CREDIT_COSTS.mass_posting
    : type === 'story' ? CREDIT_COSTS.story
    : CREDIT_COSTS.posting
  return phoneCount * perPhone
}

// Packs de crédits à la carte — toujours PLUS chers au crédit que les
// abonnements (Standard 0,0133$/cr · Pro 0,0089$/cr · Org 0,0067$/cr) pour
// pousser l'abo mensuel, mais dégressifs (plus gros pack = meilleur tarif).
// Le meilleur pack (Ultra 0,0138$/cr) reste juste au-dessus du Standard.
// Packs dégressifs visés en PRIX PAR COMPTE : ~2$/compte (petits) → ~1,10$/compte
// (gros), sur la base de 150 crédits/compte/mois. Plancher > 1$ pour que l'abo
// Organisation (1,00$/compte) reste toujours le meilleur deal.
export const CREDIT_PACKS = [
  { credits: 1000,  price: 12.99,  label: '1 000 crédits',  perCr: 0.0130 },
  { credits: 2500,  price: 27.99,  label: '2 500 crédits',  perCr: 0.0112 },
  { credits: 6000,  price: 54.99,  label: '6 000 crédits',  perCr: 0.0092 },
  { credits: 15000, price: 119.99, label: '15 000 crédits', perCr: 0.0080 },
  { credits: 40000, price: 289.99, label: '40 000 crédits', perCr: 0.0073 },
]

export interface CreditState {
  balance: number
  loading: boolean
  refresh: () => void
  setBalance: (b: number) => void
  ownerId: string   // user_id whose credits are shown/charged (org owner in org mode, self otherwise)
}

export const CreditContext = createContext<CreditState>({
  balance: 0,
  loading: true,
  refresh: () => {},
  setBalance: () => {},
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
// Falls back to direct user_credits lookup when the RPC doesn't exist yet.
export async function fetchOrgBalance(orgId: string, ownerUserId?: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_org_credit_balance', { p_org_id: orgId })
    if (error) throw error
    return typeof data === 'number' ? data : 0
  } catch {
    if (ownerUserId) return fetchBalance(ownerUserId)
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
    return data ?? { ok: false, error: 'Erreur inconnue' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Refund credits (e.g. cancelled scheduled post). Uses the refund_user_credits
// RPC (see supabase/migrations/20260611_credits_and_heartbeat.sql). Silently
// no-ops if the RPC isn't deployed yet — the deduction stays, which is the
// safe direction for the business.
export async function refundCredits(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true
  try {
    const { error } = await supabase.rpc('refund_user_credits', {
      p_user_id: userId,
      p_amount:  amount,
    })
    return !error
  } catch {
    return false
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

export async function redeemCreditCodeForOrg(
  code: string,
  orgId: string,
): Promise<{ ok: boolean; amount?: number; balance?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('redeem_credit_code_for_org', {
      p_code:   code.toUpperCase().replace(/\s/g, ''),
      p_org_id: orgId,
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
