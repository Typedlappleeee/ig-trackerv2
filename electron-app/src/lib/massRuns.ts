/**
 * Registre des runs de Mass Posting CLIENT en cours — permet de lancer PLUSIEURS
 * postings en parallèle sans être « bloqué » sur les logs d'un seul.
 *
 * Chaque run porte son propre état vivant (logs + statut par téléphone + annulation),
 * totalement isolé des autres. La page MassPosting s'abonne à ce registre pour
 * afficher la liste des runs actifs et les logs du run sélectionné.
 *
 * ⚠️ Purement en mémoire (le posting immédiat tourne côté client) : ne survit pas
 * à un refresh. La reprise après refresh reste gérée par massPostingStore pour le
 * dernier run. Les publications, elles, continuent chez GeeLark quoi qu'il arrive.
 */
import type { TaskLog, TaskStatus } from './massPostingStore'

export interface MassRunLive {
  id:         string
  label:      string
  startedAt:  number
  running:    boolean
  logs:       TaskLog[]
  statuses:   Map<string, TaskStatus>   // phoneId → statut
  total:      number
  cancel:     () => void
}

const runs = new Map<string, MassRunLive>()
const subs = new Set<() => void>()

function notify() { subs.forEach(cb => { try { cb() } catch { /* ignore */ } }) }

export function createMassRun(id: string, label: string, total: number, cancel: () => void): MassRunLive {
  const run: MassRunLive = {
    id, label, total, cancel,
    startedAt: Date.now(),
    running:   true,
    logs:      [],
    statuses:  new Map(),
  }
  runs.set(id, run)
  notify()
  return run
}

export function massRunLog(id: string, message: string, level: TaskLog['level'] = 'info'): void {
  const r = runs.get(id); if (!r) return
  r.logs.push({
    message, level,
    time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  })
  // Cap mémoire : on garde les 500 dernières lignes.
  if (r.logs.length > 500) r.logs.splice(0, r.logs.length - 500)
  notify()
}

export function massRunSetStatus(id: string, phoneId: string, status: TaskStatus): void {
  const r = runs.get(id); if (!r) return
  r.statuses.set(phoneId, status)
  notify()
}

// Termine un run : garde la carte ~10s pour montrer le bilan, puis la retire.
export function endMassRun(id: string): void {
  const r = runs.get(id); if (!r) return
  r.running = false
  notify()
  setTimeout(() => { runs.delete(id); notify() }, 10_000)
}

export function getMassRun(id: string): MassRunLive | undefined { return runs.get(id) }
export function listMassRuns(): MassRunLive[] {
  return [...runs.values()].sort((a, b) => b.startedAt - a.startedAt)
}
export function hasRunningMassRun(): boolean {
  for (const r of runs.values()) if (r.running) return true
  return false
}
export function subscribeMassRuns(cb: () => void): () => void {
  subs.add(cb); return () => { subs.delete(cb) }
}
