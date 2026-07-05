/**
 * Registre GLOBAL des postings en cours (mass posting, story, warmup, threads).
 * Permet un suivi visible partout dans l'app (widget flottant), qui survit à la
 * navigation ET au refresh (persisté en localStorage), et de détecter quand deux
 * runs utilisent le MÊME proxy en même temps (risque de ban).
 *
 * ⚠️ Ne survit PAS à la fermeture de l'app (le posting immédiat tourne côté client).
 */
export type RunType = 'mass' | 'story' | 'warmup' | 'threads'

export type PhaseStatus = 'idle' | 'running' | 'done' | 'error'

// Détail par téléphone d'un run — permet d'afficher « quel tel a fini, lequel
// est en cours » quand on déplie une carte du widget.
export interface RunPhase {
  id:     string
  name:   string
  status: PhaseStatus
}

export interface ActiveRun {
  id:        string
  type:      RunType
  label:     string        // ex. "Mass posting · 12 comptes"
  proxyKeys: string[]      // proxies (server:port) utilisés par ce run
  done:      number
  total:     number
  status:    'running' | 'done' | 'error'
  startedAt: number
  page?:     string        // page à ouvrir au clic (ex. 'posting')
  phones?:   RunPhase[]    // détail par téléphone (optionnel)
}

const KEY = 'sf-active-runs'
const STALE_MS = 2 * 60 * 60 * 1000  // un run "running" > 2h = probablement mort (app fermée)

function loadRuns(): Map<string, ActiveRun> {
  const m = new Map<string, ActiveRun>()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return m
    const now = Date.now()
    for (const r of JSON.parse(raw) as ActiveRun[]) {
      if (r.status === 'running' && now - r.startedAt > STALE_MS) continue  // purge les morts
      m.set(r.id, r)
    }
  } catch { /* ignore */ }
  return m
}

const runs = loadRuns()
const subs = new Set<() => void>()

function persist() { try { localStorage.setItem(KEY, JSON.stringify([...runs.values()])) } catch { /* quota */ } }
function notify() { persist(); subs.forEach(f => { try { f() } catch { /* ignore */ } }) }

export function startRun(r: Omit<ActiveRun, 'status' | 'startedAt'> & { startedAt?: number }): void {
  runs.set(r.id, { ...r, status: 'running', startedAt: r.startedAt ?? Date.now() })
  notify()
}
export function updateRun(id: string, patch: Partial<ActiveRun>): void {
  const r = runs.get(id); if (!r) return
  runs.set(id, { ...r, ...patch }); notify()
}
export function endRun(id: string, status: 'done' | 'error' = 'done'): void {
  const r = runs.get(id); if (!r) return
  runs.set(id, { ...r, status })
  notify()
  // On garde la carte ~10s pour montrer le bilan, puis on la retire.
  setTimeout(() => { runs.delete(id); notify() }, 10_000)
}
export function removeRun(id: string): void { runs.delete(id); notify() }

// Met à jour le statut d'UN téléphone d'un run et recalcule `done`
// (nb de téléphones terminés = done + error). No-op si le run n'a pas de détail.
export function setRunPhase(runId: string, phoneId: string, status: PhaseStatus): void {
  const r = runs.get(runId); if (!r || !r.phones) return
  const phones = r.phones.map(p => p.id === phoneId ? { ...p, status } : p)
  const done = phones.filter(p => p.status === 'done' || p.status === 'error').length
  runs.set(runId, { ...r, phones, done })
  notify()
}

// Termine un run en déduisant le statut du détail par téléphone : erreur si au
// moins un téléphone a échoué, sinon terminé. À utiliser quand chaque téléphone
// a été suivi via setRunPhase.
export function finishRun(id: string): void {
  const r = runs.get(id); if (!r) return
  endRun(id, r.phones?.some(p => p.status === 'error') ? 'error' : 'done')
}

export function getActiveRuns(): ActiveRun[] {
  return [...runs.values()].sort((a, b) => b.startedAt - a.startedAt)
}
export function subscribeActiveRuns(cb: () => void): () => void {
  subs.add(cb); return () => { subs.delete(cb) }
}

// Proxies (server:port) déjà utilisés par un AUTRE run actif — pour l'alerte anti-ban.
export function proxyConflicts(keys: string[], excludeId?: string): string[] {
  const inUse = new Set<string>()
  for (const r of runs.values()) {
    if (r.id === excludeId || r.status !== 'running') continue
    r.proxyKeys.forEach(k => inUse.add(k))
  }
  return [...new Set(keys)].filter(k => inUse.has(k))
}
