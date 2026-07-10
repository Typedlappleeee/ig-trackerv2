// Cycle de vie unifié des crédits : débit avant exécution, remboursement au
// prorata des unités en échec. Remplace les 5 implémentations divergentes
// (Posting, MassPosting, StoryLink, MassRemix, VideoRepurpose).
//
// Usage :
//   const run = await startCreditRun(ownerId, CREDIT_COSTS.mass_posting, phoneCount)
//   if (!run.ok) { toast(run.error); return }
//   ... pour chaque unité en échec : run.markFailed()
//   ... si abandon total : run.abort()
//   const { refunded } = await run.settle()   // rembourse les échecs
import { checkAndDeductCredits, refundCredits } from './credits'

export interface CreditRun {
  ok: true
  /** Solde après débit (si le RPC le renvoie) */
  balance?: number
  /** Marque une unité comme échouée — sera remboursée au settle() */
  markFailed: (count?: number) => void
  /** Annule TOUT le run (aucune unité consommée) → settle() rembourse la totalité.
   *  À utiliser quand rien n'a été exécuté (Stop/erreur avant tout post). Pour un
   *  arrêt EN COURS d'exécution, préférer markFailed(nb_non_publiés). */
  abort: () => void
  /** Rembourse les unités échouées/non exécutées. Idempotent. */
  settle: () => Promise<{ refunded: number }>
}

export interface CreditRunError {
  ok: false
  error: string
}

export async function startCreditRun(
  ownerId: string,
  costPerUnit: number,
  units: number,
): Promise<CreditRun | CreditRunError> {
  const total = costPerUnit * units
  const res = await checkAndDeductCredits(ownerId, total)
  if (!res.ok) return { ok: false, error: res.error ?? 'Crédits insuffisants' }

  let failed = 0
  let completed = 0
  let aborted = false
  let settled = false

  return {
    ok: true,
    balance: res.balance,
    markFailed(count = 1) { failed += count },
    abort() { aborted = true },
    settle: async () => {
      if (settled) return { refunded: 0 }
      settled = true
      void completed
      // abort() = tout le run annulé → remboursement TOTAL (borné aux unités).
      // Sinon : uniquement les unités explicitement marquées en échec.
      const refundUnits = aborted ? units : failed
      if (refundUnits <= 0) return { refunded: 0 }
      const amount = Math.min(refundUnits, units) * costPerUnit
      const ok = await refundCredits(ownerId, amount)
      return { refunded: ok ? amount : 0 }
    },
  }
}
