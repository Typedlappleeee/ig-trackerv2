/**
 * Singleton store for MassPosting page state — survives React unmounts/navigation.
 */
import type { ContentItem } from './supabase'

export interface TaskLog {
  message: string
  level:   'info' | 'ok' | 'error' | 'warn'
  time:    string
}

export interface TaskStatus {
  status:  'idle' | 'pending' | 'uploading' | 'posting' | 'done' | 'error' | 'cancelled'
  taskId?: string
  detail?: string
}

export interface SelectedVideo {
  item:      ContentItem
  localPath: string | null
  // Légende propre à la vidéo (description saisie dans la banque). Prioritaire
  // sur la légende globale au moment de poster ; null → repli sur la globale.
  caption?:  string | null
}

// Téléphones impliqués dans le run en cours (pour reprendre le suivi après un
// refresh : on garde de quoi poller les tâches GeeLark et éteindre les tél).
// token + caption permettent en plus de RELANCER un téléphone jamais parti
// (média déjà hébergé chez GeeLark → pas de ré-upload, pas de nouveau débit).
export interface RunPhone { phoneId: string; geelarkId: string; phoneName: string; token?: string; caption?: string }

interface MassPostingState {
  posting:        boolean
  logs:           TaskLog[]
  taskStatuses:   Map<string, TaskStatus>
  selectedPhones: Set<string>
  selectedVideos: SelectedVideo[]
  caption:        string
  startedAt:      number        // timestamp du lancement (0 si aucun run)
  runPhones:      RunPhone[]     // téléphones du run courant
  platform:       string        // 'instagram' | 'tiktok' — pour la reprise d'exécution
  reelsTrial:     boolean        // option shareType (reprise d'exécution)
}

const state: MassPostingState = {
  posting:        false,
  logs:           [],
  taskStatuses:   new Map(),
  selectedPhones: new Set(),
  selectedVideos: [],
  caption:        '',
  startedAt:      0,
  runPhones:      [],
  platform:       'instagram',
  reelsTrial:     false,
}

const subs = new Set<() => void>()
function notify() { subs.forEach(cb => cb()) }

// ── Persistance du run (survit à un refresh) ─────────────────────────────────
const RUN_KEY = 'sf-mass-run'
export interface PersistedRun {
  startedAt:    number
  logs:         TaskLog[]
  taskStatuses: [string, TaskStatus][]
  runPhones:    RunPhone[]
  platform?:    string
  reelsTrial?:  boolean
}
function persistRun() {
  try {
    if (state.posting && state.runPhones.length) {
      const payload: PersistedRun = {
        startedAt: state.startedAt || Date.now(),
        logs: state.logs.slice(-200),
        taskStatuses: [...state.taskStatuses.entries()],
        runPhones: state.runPhones,
        platform: state.platform,
        reelsTrial: state.reelsTrial,
      }
      localStorage.setItem(RUN_KEY, JSON.stringify(payload))
    } else {
      localStorage.removeItem(RUN_KEY)
    }
  } catch { /* quota / privacy mode — best-effort */ }
}
export function loadPersistedRun(): PersistedRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PersistedRun
    if (!p || !Array.isArray(p.runPhones) || !p.runPhones.length) return null
    return p
  } catch { return null }
}
export function clearPersistedRun() {
  try { localStorage.removeItem(RUN_KEY) } catch { /* ignore */ }
}

export function getMassPostingState(): MassPostingState {
  return {
    ...state,
    taskStatuses:   new Map(state.taskStatuses),
    selectedPhones: new Set(state.selectedPhones),
    selectedVideos: [...state.selectedVideos],
    runPhones:      [...state.runPhones],
  }
}

export function setMassPostingState(patch: Partial<MassPostingState>) {
  if (patch.taskStatuses)   state.taskStatuses   = new Map(patch.taskStatuses)
  if (patch.selectedPhones) state.selectedPhones = new Set(patch.selectedPhones)
  if (patch.selectedVideos) state.selectedVideos = [...patch.selectedVideos]
  if (patch.runPhones)      state.runPhones      = [...patch.runPhones]
  const rest = { ...patch }
  delete rest.taskStatuses; delete rest.selectedPhones; delete rest.selectedVideos; delete rest.runPhones
  const postingChanged = 'posting' in rest && rest.posting !== state.posting
  Object.assign(state, rest)
  notify()
  persistRun()
  if (postingChanged) {
    window.electronAPI?.setMassPostingRunning?.(!!state.posting)
  }
}

export function resetMassPosting() {
  state.posting      = false
  state.logs         = []
  state.taskStatuses = new Map()
  state.startedAt    = 0
  state.runPhones    = []
  clearPersistedRun()
  notify()
}

export function subscribeMassPosting(cb: () => void): () => void {
  subs.add(cb)
  return () => subs.delete(cb)
}
