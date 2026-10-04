// Filet anti-coût : aucun téléphone démarré par ScaleFlow ne doit rester allumé.
//
// Les tâches éteignent déjà le téléphone à la fin (succès OU échec, via le `finally`
// des primitives de geelark.ts). Mais si l'onglet est fermé / rafraîchi / planté en
// plein run, ou si l'arrêt échoue, ce « éteindre » n'arrive jamais → téléphone
// allumé indéfiniment (on a vu 317 min !).
//
// Modèle « bail » : chaque téléphone démarré par l'app est inscrit dans
// `phone_power_watch` avec une heure-limite `stop_at`. Tant qu'une tâche tourne,
// le bail est prolongé (battement) ; le watchdog serveur (edge function
// run-scheduled-posts, étape 0, cron chaque minute) éteint tout téléphone dont le
// bail a expiré — même app fermée. Résultat : un téléphone resté allumé sans tâche
// active est éteint au plus tard LEASE_MIN minutes après le dernier signe de vie.
// Warmup : bail long (durée prévue + marge) au lieu des 10 min.
import { supabase } from './supabase'

export const LEASE_MIN = 10
const HEARTBEAT_EVERY_MS = 60_000

let owner: { userId: string; orgId: string | null } | null = null
// Propriétaire des baux (RLS : user_id = auth.uid() ou membre de l'org). Posé par App.
export function setLeaseOwner(o: { userId: string; orgId: string | null } | null): void { owner = o }

// stop_at actuellement connu par cet onglet, par téléphone → un battement ne
// raccourcit JAMAIS un bail plus long (ex. warmup) et n'écrit qu'une fois/minute.
const known = new Map<string, { stopAt: number; wroteAt: number }>()

async function upsertLease(geelarkId: string, stopAt: number, reason: string): Promise<void> {
  if (!owner) return
  try {
    await supabase.from('phone_power_watch').upsert(
      { geelark_id: geelarkId, org_id: owner.orgId, user_id: owner.userId, reason, stop_at: new Date(stopAt).toISOString() },
      { onConflict: 'geelark_id' },
    )
  } catch { /* best-effort — le filet ne doit jamais casser un run */ }
}

// Pose ou prolonge le bail d'un téléphone : il sera éteint par le serveur si aucun
// nouveau signe de vie n'arrive avant `minutes`. Ne raccourcit jamais un bail existant.
export async function leasePhone(geelarkId: string, minutes = LEASE_MIN, reason = 'client_task'): Promise<void> {
  if (!geelarkId) return
  const now = Date.now()
  const stopAt = now + minutes * 60_000
  const k = known.get(geelarkId)
  if (k && k.stopAt >= stopAt - HEARTBEAT_EVERY_MS && now - k.wroteAt < HEARTBEAT_EVERY_MS) return
  if (k && k.stopAt > stopAt) return
  known.set(geelarkId, { stopAt, wroteAt: now })
  await upsertLease(geelarkId, stopAt, reason)
}

// Battement : à appeler pendant qu'une tâche tourne (sonde RPA, commandes ADB…).
export function heartbeatPhone(geelarkId: string): void { void leasePhone(geelarkId, LEASE_MIN, 'client_task') }

// Téléphone confirmé éteint → plus besoin de bail.
export async function releasePhone(geelarkId: string): Promise<void> {
  known.delete(geelarkId)
  try { await supabase.from('phone_power_watch').delete().eq('geelark_id', geelarkId) } catch { /* best-effort */ }
}

// Extinction non confirmée → on demande au serveur de s'en charger au prochain tick.
export async function escalatePhoneStop(geelarkId: string): Promise<void> {
  known.set(geelarkId, { stopAt: Date.now(), wroteAt: Date.now() })
  await upsertLease(geelarkId, Date.now(), 'stop_unconfirmed')
}

// ── API historique (composers) ───────────────────────────────────────────────
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
    ids.forEach(id => known.set(id, { stopAt: opts.stopAt.getTime(), wroteAt: Date.now() }))
  } catch { /* best-effort */ }
}

export async function unregisterPhoneWatch(geelarkIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(geelarkIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return
  ids.forEach(id => known.delete(id))
  try { await supabase.from('phone_power_watch').delete().in('geelark_id', ids) } catch { /* best-effort */ }
}
