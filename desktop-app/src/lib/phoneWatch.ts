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

// Propriétaire pas encore posé par App (course au démarrage) : avant, le bail était
// IGNORÉ en silence → téléphone jamais surveillé. On le retrouve depuis la session.
async function resolveOwner(): Promise<{ userId: string; orgId: string | null } | null> {
  if (owner) return owner
  try {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return null
    let orgId: string | null = null
    try { orgId = localStorage.getItem('ig-tracker-current-org') } catch { /* stockage indisponible */ }
    return { userId, orgId }
  } catch { return null }
}

async function upsertLease(geelarkId: string, stopAt: number, reason: string): Promise<void> {
  const o = await resolveOwner()
  if (!o) return
  try {
    await supabase.from('phone_power_watch').upsert(
      { geelark_id: geelarkId, org_id: o.orgId, user_id: o.userId, reason, stop_at: new Date(stopAt).toISOString() },
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

// ── Watchguard client ────────────────────────────────────────────────────────
// Second filet, tant que l'app est ouverte : même logique que le watchguard serveur
// (edge function run-scheduled-posts, étape 0-bis — copie de planWatchguard dans
// supabase/functions/run-scheduled-posts/watchguard.ts, gardées identiques par test).
//   • téléphone allumé sans bail → bail « seen_running » de WATCHGUARD_MIN minutes ;
//   • bail expiré depuis > SERVER_GRACE_MS et téléphone toujours allumé → le cron
//     serveur ne fait pas son travail : l'app l'éteint elle-même.
export const SEEN_RUNNING = 'seen_running'
export const WATCHGUARD_MIN = 10
const SERVER_GRACE_MS = 2 * 60_000

export interface WatchLease { geelark_id: string; reason?: string | null; stop_at: string }
export interface WatchPhone { id: string; status: number }

export function isPhoneOn(status: number): boolean { return status === 0 || status === 2 }

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

/** Téléphones allumés dont le bail a expiré depuis plus que la marge laissée au serveur. */
export function overdueOn(phones: WatchPhone[], leases: WatchLease[], nowMs = Date.now()): string[] {
  const on = new Set(phones.filter(p => isPhoneOn(Number(p.status))).map(p => String(p.id)))
  return leases.filter(l => on.has(String(l.geelark_id)) && Date.parse(l.stop_at) < nowMs - SERVER_GRACE_MS).map(l => String(l.geelark_id))
}

export interface WatchguardResult { on: number; leased: number; stopped: string[]; serverLate: boolean }
let lastResult: WatchguardResult | null = null
const wgListeners = new Set<(r: WatchguardResult) => void>()
export function onWatchguard(cb: (r: WatchguardResult) => void): () => void {
  wgListeners.add(cb); if (lastResult) cb(lastResult)
  return () => { wgListeners.delete(cb) }
}

/** Un passage du watchguard client. Dépendances injectées (pas d'import de geelark.ts → pas de cycle). */
export async function runClientWatchguard(deps: {
  listPhones: () => Promise<WatchPhone[]>
  stopPhones: (ids: string[]) => Promise<unknown>
}, nowMs = Date.now()): Promise<WatchguardResult> {
  const phones = (await deps.listPhones()).map(p => ({ id: String(p.id), status: Number(p.status) }))
  const ids = phones.map(p => p.id)
  const leases: WatchLease[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('phone_power_watch').select('geelark_id, reason, stop_at').in('geelark_id', ids.slice(i, i + 200))
    leases.push(...((data ?? []) as WatchLease[]))
  }
  const plan = planWatchguard(phones, leases, nowMs)
  const o = await resolveOwner()
  let leased = 0
  if (o && plan.add.length) {
    const stopAt = new Date(nowMs + WATCHGUARD_MIN * 60_000).toISOString()
    const { error } = await supabase.from('phone_power_watch').upsert(
      plan.add.map(geelark_id => ({ geelark_id, org_id: o.orgId, user_id: o.userId, reason: SEEN_RUNNING, stop_at: stopAt })),
      { onConflict: 'geelark_id', ignoreDuplicates: true },
    )
    if (!error) leased = plan.add.length
  }
  if (plan.drop.length) {
    await supabase.from('phone_power_watch').delete().in('geelark_id', plan.drop)
      .or(`reason.eq.${SEEN_RUNNING},stop_at.lt.${new Date(nowMs).toISOString()}`)
  }
  // Ce que cet onglet pilote encore (bail tenu par battement) n'est jamais « en retard ».
  const overdue = overdueOn(phones, leases, nowMs).filter(id => (known.get(id)?.stopAt ?? 0) <= nowMs)
  const stopped: string[] = []
  if (overdue.length) {
    try { await deps.stopPhones(overdue); stopped.push(...overdue) } catch { /* réessai au prochain passage */ }
    for (const id of stopped) await releasePhone(id)
  }
  const res: WatchguardResult = { on: phones.filter(p => isPhoneOn(p.status)).length, leased, stopped, serverLate: overdue.length > 0 }
  lastResult = res
  wgListeners.forEach(f => f(res))
  return res
}
