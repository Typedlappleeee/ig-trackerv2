// Récupération de l'historique des dernières 24 h depuis GeeLark.
//
// Avant l'historique « dès le lancement » (runHistory.ts), un run interrompu (onglet
// fermé, rafraîchi, plantage) ne laissait AUCUNE ligne dans post_runs alors que les
// posts partaient. On reconstitue ces runs depuis l'historique des tâches GeeLark du
// compte (jeton de l'utilisateur, donc exécuté chez lui) :
//   • tâches des 24 dernières heures, hors celles déjà connues (post_runs, programmés) ;
//   • regroupées en runs (tâches rapprochées de moins de 10 min) ;
//   • insérées dans post_runs avec `recovered: true` et le taskId de chaque compte
//     (relancer la récupération ne crée donc jamais de doublon).
// L'endpoint d'historique de GeeLark n'est pas documenté publiquement : on essaie les
// formes connues et on le dit clairement s'il ne répond pas.
import { supabase } from './supabase'
import { geelarkFetch } from './geelark'
import type { HistoryEntry } from './runHistory'

export interface GeelarkTaskRecord {
  id: string
  phoneId: string
  phoneName: string
  at: number            // ms
  status: number        // 3 = terminée, 4/7/8 = échec, autre = en cours / en attente
  error?: string
  kind: string          // 'story' | 'warmup' | 'mass_posting'
}

const DAY_MS = 24 * 3600_000
const GAP_MS = 10 * 60_000

function toMs(v: unknown): number {
  const n = typeof v === 'string' && !/^\d+$/.test(v) ? Date.parse(v) : Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 1e12 ? n * 1000 : n      // secondes → ms
}

function kindOf(it: Record<string, unknown>): string {
  const label = `${it['planName'] ?? ''} ${it['name'] ?? ''} ${it['taskName'] ?? ''} ${it['flowName'] ?? ''}`.toLowerCase()
  if (/story/.test(label)) return 'story'
  if (/warm|chauffe|browse|brows/.test(label)) return 'warmup'
  return 'mass_posting'
}

/** Normalise un enregistrement de tâche GeeLark (champs tolérants). */
export function parseTaskRecord(it: Record<string, unknown>): GeelarkTaskRecord | null {
  const id = String(it['id'] ?? it['taskId'] ?? '')
  if (!id) return null
  const at = toMs(it['scheduleAt'] ?? it['startAt'] ?? it['startTime'] ?? it['createAt'] ?? it['createTime'] ?? it['createdAt'] ?? it['finishAt'])
  if (!at) return null
  const fd = (it['failDesc'] ?? it['failMsg'] ?? it['msg']) as string | undefined
  return {
    id,
    phoneId: String(it['envId'] ?? it['phoneId'] ?? it['envSerialNo'] ?? ''),
    phoneName: String(it['serialName'] ?? it['envName'] ?? it['phoneName'] ?? it['serialNo'] ?? ''),
    at, status: Number(it['status']), error: fd || undefined, kind: kindOf(it),
  }
}

/** Regroupe des tâches en runs : même type, moins de 10 min entre deux tâches. */
export function clusterTasks(tasks: GeelarkTaskRecord[]): GeelarkTaskRecord[][] {
  const out: GeelarkTaskRecord[][] = []
  const byKind = new Map<string, GeelarkTaskRecord[]>()
  for (const t of tasks) byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), t])
  for (const list of byKind.values()) {
    list.sort((a, b) => a.at - b.at)
    let cur: GeelarkTaskRecord[] = []
    for (const t of list) {
      if (cur.length && t.at - cur[cur.length - 1].at > GAP_MS) { out.push(cur); cur = [] }
      cur.push(t)
    }
    if (cur.length) out.push(cur)
  }
  return out.sort((a, b) => a[0].at - b[0].at)
}

export function toEntry(t: GeelarkTaskRecord, label: string): HistoryEntry {
  const done = t.status === 3, failed = [4, 7, 8].includes(t.status)
  return {
    name: label, ok: done, taskId: t.id, geelark_id: t.phoneId || undefined, recovered: true,
    ...(failed ? { error: t.error ?? `statut ${t.status}` } : {}),
    ...(!done && !failed ? { pending: true } : {}),
  }
}

// Formes d'appel essayées pour l'historique des tâches (la 1re qui répond code 0 gagne).
const PROBES: [string, (page: number, lastId?: string) => Record<string, unknown>][] = [
  ['/task/historyRecords', (_p, lastId) => ({ size: 100, ...(lastId ? { lastId } : {}) })],
  ['/task/history', (page) => ({ page, pageSize: 100 })],
  ['/task/list', (page) => ({ page, pageSize: 100 })],
]

async function fetchRecentTasks(bearer: string, sinceMs: number): Promise<GeelarkTaskRecord[] | null> {
  for (const [path, body] of PROBES) {
    try {
      // Ordre des pages inconnu (récent→ancien ou l'inverse) : on parcourt jusqu'à la
      // dernière page (< 100 éléments) ou une page sans nouveauté (pagination ignorée).
      const out = new Map<string, GeelarkTaskRecord>()
      let lastId: string | undefined
      let answered = false
      for (let page = 1; page <= 20; page++) {
        const res = await geelarkFetch(path, body(page, lastId), bearer)
        if (Number(res['code']) !== 0) break
        answered = true
        const d = (res['data'] ?? {}) as Record<string, unknown>
        const list = ((d['items'] ?? d['list'] ?? d['records'] ?? d['tasks'] ?? []) as Record<string, unknown>[])
        let fresh = 0
        for (const t of list.map(parseTaskRecord)) {
          if (!t || out.has(t.id)) continue
          fresh++
          if (t.at >= sinceMs) out.set(t.id, t)
          else out.set(t.id, { ...t, kind: '__old' })
        }
        if (list.length < 100 || fresh === 0) break
        lastId = String(list[list.length - 1]['id'] ?? '') || undefined
      }
      if (answered) return [...out.values()].filter(t => t.kind !== '__old')
    } catch { /* forme suivante */ }
  }
  return null
}

// taskIds déjà présents dans l'historique (post_runs + programmés) → pas de doublon.
function collectTaskIds(v: unknown, into: Set<string>): void {
  if (Array.isArray(v)) { v.forEach(x => collectTaskIds(x, into)); return }
  if (!v || typeof v !== 'object') return
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if ((k === 'taskId' || k === 'task_id') && (typeof x === 'string' || typeof x === 'number')) into.add(String(x))
    else if (/task_?ids/i.test(k) && Array.isArray(x)) x.forEach(t => into.add(String(t)))
    else if (typeof x === 'object') collectTaskIds(x, into)
  }
}

export interface RecoverResult { ok: boolean; runs: number; tasks: number; error?: string }

export async function recoverLast24h(opts: { bearer: string; userId: string; orgId: string | null }, nowMs = Date.now()): Promise<RecoverResult> {
  const since = nowMs - DAY_MS
  const tasks = await fetchRecentTasks(opts.bearer, since)
  if (tasks === null) return { ok: false, runs: 0, tasks: 0, error: 'GeeLark ne fournit pas l’historique des tâches pour ce compte.' }

  const scope = (q: any) => opts.orgId ? q.eq('org_id', opts.orgId) : q.eq('user_id', opts.userId).is('org_id', null)
  const sinceIso = new Date(since - DAY_MS).toISOString()
  const [pr, sp, ph] = await Promise.all([
    scope(supabase.from('post_runs').select('details')).gte('created_at', sinceIso),
    scope(supabase.from('scheduled_posts').select('result')).gte('created_at', new Date(since - 7 * DAY_MS).toISOString()),
    scope(supabase.from('phones').select('geelark_id, phone_name, ig_username')),
  ])
  const known = new Set<string>()
  for (const r of (pr.data ?? []) as { details: unknown }[]) collectTaskIds(r.details, known)
  for (const r of (sp.data ?? []) as { result: unknown }[]) collectTaskIds(r.result, known)
  const label = new Map<string, string>()
  for (const p of (ph.data ?? []) as { geelark_id: string | null; phone_name: string | null; ig_username: string | null }[]) {
    if (p.geelark_id) label.set(String(p.geelark_id), p.ig_username ? `@${p.ig_username}` : (p.phone_name ?? ''))
  }

  const fresh = tasks.filter(t => !known.has(t.id))
  let runs = 0
  for (const group of clusterTasks(fresh)) {
    const details = group.map(t => toEntry(t, label.get(t.phoneId) || t.phoneName || t.phoneId || '—'))
    const { error } = await supabase.from('post_runs').insert({
      user_id: opts.userId, org_id: opts.orgId, type: group[0].kind,
      ok_count: details.filter(d => d.ok).length,
      err_count: details.filter(d => !d.ok && !d.pending).length,
      total: details.length, details,
      created_at: new Date(group[0].at).toISOString(),
    })
    if (error) return { ok: false, runs, tasks: fresh.length, error: error.message }
    runs++
  }
  return { ok: true, runs, tasks: fresh.length }
}
