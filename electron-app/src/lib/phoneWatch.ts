// Garde-fou anti-coût — suivi des téléphones démarrés par l'automation.
//
// À chaque /phone/start lancé par ScaleFlow, on inscrit le(s) téléphone(s) dans
// la table `phone_power_watch` avec une heure-limite. Si l'app se ferme avant
// d'avoir éteint le téléphone, le watchdog serveur (cron run-scheduled-posts)
// l'éteint dès que stop_at est dépassé. Les téléphones démarrés à la main dans
// GeeLark ne passent jamais par ici → jamais touchés par le watchdog.

import { supabase } from './supabase'

// Plafond dur : aucun téléphone démarré par l'automation ne doit rester allumé
// plus de 5 minutes (sauf override explicite pour les posts à intervalle).
export const PHONE_MAX_RUN_MS = 5 * 60_000

interface WatchScope {
  orgId:  string | null
  userId: string
}

// Scope courant (org + user actifs), défini une fois par l'app au login / changement
// d'org. Permet aux fonctions bas-niveau de geelark.ts (warmup, login, story…) qui
// n'ont pas le contexte d'inscrire quand même les téléphones qu'elles démarrent.
let _scope: WatchScope | null = null
export function setWatchScope(scope: WatchScope | null): void { _scope = scope }

// Variante sans contexte : utilise le scope courant. No-op si non défini.
export async function registerStartedPhonesAuto(
  geelarkIds: string[],
  opts?: { stopAt?: Date; reason?: string },
): Promise<void> {
  if (!_scope) return
  return registerStartedPhones(geelarkIds, _scope, opts)
}

// Inscrit des téléphones comme « démarrés par l'automation ». Best-effort :
// une erreur réseau ne doit jamais bloquer le posting (le client a aussi son
// propre auto-stop ; ceci n'est que le filet de sécurité serveur).
export async function registerStartedPhones(
  geelarkIds: string[],
  scope: WatchScope,
  opts?: { stopAt?: Date; reason?: string },
): Promise<void> {
  const ids = geelarkIds.filter(Boolean)
  if (ids.length === 0) return
  const stop_at = (opts?.stopAt ?? new Date(Date.now() + PHONE_MAX_RUN_MS)).toISOString()
  const rows = ids.map(id => ({
    geelark_id: id,
    org_id:     scope.orgId,
    user_id:    scope.userId,
    reason:     opts?.reason ?? null,
    stop_at,
  }))
  try {
    await supabase.from('phone_power_watch').upsert(rows, { onConflict: 'geelark_id' })
  } catch { /* best-effort */ }
}

// Retire des téléphones du suivi (appelé quand on les éteint proprement côté client).
export async function unregisterPhones(geelarkIds: string[]): Promise<void> {
  const ids = geelarkIds.filter(Boolean)
  if (ids.length === 0) return
  try {
    await supabase.from('phone_power_watch').delete().in('geelark_id', ids)
  } catch { /* best-effort */ }
}

// Relie une ligne du watchdog à la tâche RPA GeeLark. Le webhook de fin de
// tâche pourra alors avancer l'extinction du téléphone (sinon le +5 min reste).
export async function setPhoneTaskId(geelarkId: string, taskId: string): Promise<void> {
  if (!geelarkId || !taskId) return
  try {
    await supabase.from('phone_power_watch').update({ task_id: taskId }).eq('geelark_id', geelarkId)
  } catch { /* best-effort */ }
}
