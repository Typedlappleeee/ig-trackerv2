// Historique d'un run (page Activité) écrit DÈS LE LANCEMENT, puis mis à jour au fil
// de l'eau. Avant, `post_runs` n'était inséré qu'à la FIN du run : onglet fermé,
// rafraîchi ou planté en plein run → aucune trace, alors que des posts étaient partis.
//
// Chaque compte démarre « pending » ; dès que GeeLark crée sa tâche RPA, son taskId
// est enregistré → la page Activité peut retrouver le vrai résultat plus tard
// (/task/query) même si l'app a été fermée entre-temps.
import { supabase } from './supabase'
import { onGeelarkTask } from './geelark'

export interface HistoryEntry {
  name: string
  ok: boolean
  error?: string
  pending?: boolean        // résultat pas encore connu
  geelark_id?: string
  taskId?: string
  recovered?: boolean      // reconstitué depuis GeeLark (récupération 24 h)
}

export interface RunHistory {
  /** Résultat (ou taskId) d'un compte. Clé = celle donnée dans `accounts`. */
  set: (key: string, patch: Partial<Omit<HistoryEntry, 'name'>>) => void
  /** Fin du run : les comptes jamais lancés passent en échec (`notRunLabel`). */
  finish: (notRunLabel?: string) => Promise<string | null>
}

const FLUSH_MS = 3000

export function counts(entries: HistoryEntry[]): { ok: number; err: number; pending: number } {
  let ok = 0, err = 0, pending = 0
  for (const e of entries) { if (e.pending) pending++; else if (e.ok) ok++; else err++ }
  return { ok, err, pending }
}

export async function startRunHistory(opts: {
  userId: string
  orgId: string | null
  type: string
  accounts: { key: string; name: string; geelarkId?: string | null }[]
}): Promise<RunHistory> {
  const entries = new Map<string, HistoryEntry>()
  // Un téléphone peut porter plusieurs entrées (cross-posting : une par plateforme,
  // jouées l'une après l'autre) → la tâche va à la 1re entrée encore sans taskId.
  const byPhone = new Map<string, string[]>()
  for (const a of opts.accounts) {
    entries.set(a.key, { name: a.name, ok: false, pending: true, ...(a.geelarkId ? { geelark_id: a.geelarkId } : {}) })
    if (a.geelarkId) byPhone.set(a.geelarkId, [...(byPhone.get(a.geelarkId) ?? []), a.key])
  }
  const total = opts.accounts.length
  const row = () => {
    const list = [...entries.values()]
    const c = counts(list)
    return { ok_count: c.ok, err_count: c.err, total, details: list }
  }

  let id: string | null = null
  let lastError: string | null = null
  try {
    const { data, error } = await supabase.from('post_runs')
      .insert({ user_id: opts.userId, org_id: opts.orgId, type: opts.type, ...row() })
      .select('id').single()
    if (error) lastError = error.message
    else id = (data as { id: string } | null)?.id ?? null
  } catch (e) { lastError = e instanceof Error ? e.message : String(e) }

  let timer: ReturnType<typeof setTimeout> | null = null
  let flushing: Promise<void> = Promise.resolve()
  const flush = (): Promise<void> => {
    if (timer) { clearTimeout(timer); timer = null }
    flushing = flushing.then(async () => {
      try {
        if (id) {
          const { error } = await supabase.from('post_runs').update(row()).eq('id', id)
          lastError = error ? error.message : null
        } else {
          // L'insert de départ a échoué (réseau) → on retente une création.
          const { data, error } = await supabase.from('post_runs')
            .insert({ user_id: opts.userId, org_id: opts.orgId, type: opts.type, ...row() })
            .select('id').single()
          if (error) lastError = error.message
          else { id = (data as { id: string } | null)?.id ?? null; lastError = null }
        }
      } catch (e) { lastError = e instanceof Error ? e.message : String(e) }
    })
    return flushing
  }
  const schedule = () => { if (!timer) timer = setTimeout(() => { void flush() }, FLUSH_MS) }

  const set: RunHistory['set'] = (key, patch) => {
    const e = entries.get(key)
    if (!e) return
    const next: HistoryEntry = { ...e, ...patch }
    if (patch.ok !== undefined || patch.error !== undefined) next.pending = false
    entries.set(key, next)
    // Le taskId est précieux (seule trace si l'onglet se ferme) → écrit tout de suite.
    if (patch.taskId && !e.taskId) void flush(); else schedule()
  }

  const offTask = onGeelarkTask((phoneId, taskId) => {
    const keys = byPhone.get(phoneId) ?? []
    if (keys.some(k => entries.get(k)?.taskId === taskId)) return
    const key = keys.find(k => { const e = entries.get(k); return e?.pending && !e.taskId })
    if (key) set(key, { taskId })
  })

  return {
    set,
    finish: async (notRunLabel = 'non lancé (annulé)') => {
      offTask()
      for (const [k, e] of entries) if (e.pending) entries.set(k, { ...e, pending: false, ok: false, error: notRunLabel })
      await flush()
      return lastError
    },
  }
}

// ── Lecture (page Activité) ──────────────────────────────────────────────────
export const STALE_MS = 2 * 60 * 60_000

/** État d'un run : terminé, en cours (récent), ou interrompu (comptes jamais conclus). */
export function runState(entries: { pending?: boolean }[], createdAtMs: number, nowMs = Date.now()): 'done' | 'running' | 'interrupted' {
  if (!entries.some(e => e.pending)) return 'done'
  return nowMs - createdAtMs < STALE_MS ? 'running' : 'interrupted'
}
