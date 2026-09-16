// Filet anti-coût pour les runs CLIENT (posting/story/cross immédiats).
//
// Un post immédiat est piloté par le navigateur : il démarre les téléphones puis les
// éteint à la fin (finally de postReelToPhone…). MAIS si l'onglet est fermé / rafraîchi
// / planté en plein run, ce « éteindre » n'arrive jamais → le téléphone reste allumé
// (on a vu 317 min !). On inscrit donc les téléphones dans `phone_power_watch` avec une
// heure-limite `stop_at` : le watchdog serveur (edge function run-scheduled-posts,
// étape 0, tick cron) éteint tout téléphone dont `stop_at` est dépassé, même app fermée.
import { supabase } from './supabase'

export async function registerPhoneWatch(
  geelarkIds: (string | null | undefined)[],
  opts: { orgId: string | null; userId: string; stopAt: Date },
): Promise<void> {
  const ids = [...new Set(geelarkIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return
  try {
    await supabase.from('phone_power_watch').upsert(
      ids.map(geelark_id => ({
        geelark_id, org_id: opts.orgId, user_id: opts.userId,
        reason: 'client_run', stop_at: opts.stopAt.toISOString(),
      })),
      { onConflict: 'geelark_id' },
    )
  } catch { /* best-effort — le filet ne doit jamais casser un run */ }
}

export async function unregisterPhoneWatch(geelarkIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(geelarkIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return
  try { await supabase.from('phone_power_watch').delete().in('geelark_id', ids) } catch { /* best-effort */ }
}
