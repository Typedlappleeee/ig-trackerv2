// Registre GLOBAL des runs en cours (posting, story, cross, studio, auto-contenu…).
// Singleton hors React → survit à la navigation entre onglets. Chaque run rapporte
// sa progression ici ; un widget flottant l'affiche partout et permet d'annuler.
import { useSyncExternalStore } from 'react'

export type RunKind = 'reels' | 'story' | 'cross' | 'studio' | 'auto' | 'farm'
export interface RunState {
  id: string
  kind: RunKind
  label: string
  total: number
  done: number
  failed: number
  status: 'running' | 'done' | 'cancelled' | 'error'
  detail?: string
  startedAt: number
  cancelled: boolean          // drapeau interne lu par la boucle du run
}

// Handle rendu au run pour reporter sa progression.
export interface RunHandle {
  id: string
  isCancelled: () => boolean
  setTotal: (n: number) => void
  tick: (ok: boolean) => void      // +1 done, +1 failed si !ok
  detail: (s: string) => void
  finish: (status?: RunState['status']) => void
}

const runs = new Map<string, RunState>()
const listeners = new Set<() => void>()
let snap: RunState[] = []
function emit() { snap = [...runs.values()].sort((a, b) => b.startedAt - a.startedAt); listeners.forEach(l => l()) }

export function startRun(kind: RunKind, label: string, total: number): RunHandle {
  const id = 'run-' + Math.random().toString(36).slice(2, 9)
  const st: RunState = { id, kind, label, total, done: 0, failed: 0, status: 'running', startedAt: Date.now(), cancelled: false }
  runs.set(id, st); emit()
  const upd = (f: (s: RunState) => void) => { const s = runs.get(id); if (s) { f(s); emit() } }
  return {
    id,
    isCancelled: () => runs.get(id)?.cancelled ?? false,
    setTotal: (n) => upd(s => { s.total = n }),
    tick: (ok) => upd(s => { s.done += 1; if (!ok) s.failed += 1 }),
    detail: (d) => upd(s => { s.detail = d }),
    finish: (status) => {
      upd(s => { s.status = status ?? (s.cancelled ? 'cancelled' : 'done') })
      // Auto-nettoyage après quelques secondes (garde l'écran propre).
      setTimeout(() => { runs.delete(id); emit() }, 6000)
    },
  }
}

export function cancelRun(id: string) { const s = runs.get(id); if (s) { s.cancelled = true; s.detail = 'Annulation…'; emit() } }
export function dismissRun(id: string) { runs.delete(id); emit() }

export function useRuns(): RunState[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => snap,
    () => snap,
  )
}
