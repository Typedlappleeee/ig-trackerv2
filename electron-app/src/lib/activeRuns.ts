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
  // Chargé depuis localStorage après un refresh : plus aucune boucle cliente ne
  // pilote ce run. Il doit être « adopté » (repris par une reprise de suivi) ou,
  // à défaut, clôturé automatiquement — sinon il resterait « En cours » à l'infini.
  orphaned?: boolean
}

const KEY = 'sf-active-runs'
const STALE_MS = 24 * 60 * 60 * 1000  // un run "running" > 24h = mort (aligné sur la fenêtre de reprise mass posting)
const ORPHAN_GRACE_MS = 30_000       // délai laissé à une reprise pour adopter un run

function loadRuns(): Map<string, ActiveRun> {
  const m = new Map<string, ActiveRun>()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return m
    const now = Date.now()
    for (const r of JSON.parse(raw) as ActiveRun[]) {
      if (r.status === 'running' && now - r.startedAt > STALE_MS) continue  // purge les morts
      // Tout run « running » relu au démarrage est orphelin tant qu'une reprise
      // ne l'a pas adopté.
      m.set(r.id, r.status === 'running' ? { ...r, orphaned: true } : r)
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

// ── Reprise après refresh : adoption / clôture des orphelins ─────────────────

// Un run orphelin (relu du localStorage après un refresh) de ce type, le plus
// récent. Sert à une page de reprise pour retrouver SON run et continuer à le
// mettre à jour au lieu d'en créer un nouveau.
export function findOrphanRun(type: RunType): ActiveRun | undefined {
  return [...runs.values()]
    .filter(r => r.type === type && r.status === 'running' && r.orphaned)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
}

// Une reprise a repris le pilotage de ce run : il n'est plus orphelin, donc la
// clôture automatique ne le touchera pas.
export function adoptRun(id: string): void {
  const r = runs.get(id); if (!r) return
  runs.set(id, { ...r, orphaned: false })
}

// Après le délai de grâce, tout run encore orphelin n'a aucune boucle pour le
// faire avancer (warmup/threads non repris, ou reprise mass/story absente) → on
// le clôture (statut déduit du détail par téléphone) au lieu de le laisser figé.
function reconcileOrphans(): void {
  let changed = false
  for (const r of [...runs.values()]) {
    if (r.status === 'running' && r.orphaned) {
      const status = r.phones?.some(p => p.status === 'error') ? 'error' : 'done'
      runs.set(r.id, { ...r, status, orphaned: false })
      changed = true
    }
  }
  if (!changed) return
  notify()
  setTimeout(() => {
    for (const [id, r] of [...runs.entries()]) if (r.status !== 'running') runs.delete(id)
    notify()
  }, 10_000)
}
try { if (typeof window !== 'undefined') setTimeout(reconcileOrphans, ORPHAN_GRACE_MS) } catch { /* SSR */ }

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
