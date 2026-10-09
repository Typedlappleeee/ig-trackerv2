// Watchguard : aucun téléphone ne doit rester allumé sans tâche ScaleFlow.
//
// Le watchdog « bail » (phone_power_watch) n'éteint que les téléphones inscrits.
// Un téléphone allumé autrement (à la main, tâche GeeLark, bail jamais écrit car
// l'onglet a été fermé) restait allumé indéfiniment. Le watchguard liste les
// téléphones réellement allumés et pose un bail « seen_running » (10 min) sur
// ceux qui n'en ont pas → le watchdog les éteint à expiration, même app fermée.
// Un bail existant (warmup, tâche en cours) n'est JAMAIS raccourci.
//
// Logique pure (aucun import) : partagée par l'edge function (Deno) et le client
// (desktop-app/src/lib/phoneWatch.ts), et testée par vitest.

export const SEEN_RUNNING = 'seen_running'
export const WATCHGUARD_MIN = 10

export interface WatchLease { geelark_id: string; reason?: string | null; stop_at: string }
export interface WatchPhone { id: string; status: number }

// 0 = allumé, 2 = en démarrage → consomme ; 1 = éteint, 3 = en cours d'arrêt.
export function isPhoneOn(status: number): boolean { return status === 0 || status === 2 }

/**
 * Compare les téléphones GeeLark et les baux connus :
 *  - `add`  : téléphones allumés sans bail → poser un bail seen_running ;
 *  - `drop` : baux de téléphones désormais éteints, s'ils sont seen_running ou déjà
 *             expirés (inutile de réessayer /phone/stop chaque minute) → supprimer.
 */
export function planWatchguard(phones: WatchPhone[], leases: WatchLease[], nowMs = Date.now()): { add: string[]; drop: string[] } {
  const leased = new Map(leases.map(l => [String(l.geelark_id), l]))
  const add: string[] = []
  const drop: string[] = []
  for (const p of phones) {
    const id = String(p.id)
    const l = leased.get(id)
    if (isPhoneOn(Number(p.status))) { if (!l) add.push(id) }
    else if (l && (l.reason === SEEN_RUNNING || Date.parse(l.stop_at) <= nowMs)) drop.push(id)
  }
  return { add, drop }
}
