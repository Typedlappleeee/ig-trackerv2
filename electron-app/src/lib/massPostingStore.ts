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
  status:  'idle' | 'pending' | 'uploading' | 'posting' | 'done' | 'error'
  taskId?: string
  detail?: string
}

export interface SelectedVideo {
  item:      ContentItem
  localPath: string | null
}

interface MassPostingState {
  posting:        boolean
  logs:           TaskLog[]
  taskStatuses:   Map<string, TaskStatus>
  selectedPhones: Set<string>
  selectedVideos: SelectedVideo[]
  caption:        string
}

const state: MassPostingState = {
  posting:        false,
  logs:           [],
  taskStatuses:   new Map(),
  selectedPhones: new Set(),
  selectedVideos: [],
  caption:        '',
}

const subs = new Set<() => void>()
function notify() { subs.forEach(cb => cb()) }

export function getMassPostingState(): MassPostingState {
  return {
    ...state,
    taskStatuses:   new Map(state.taskStatuses),
    selectedPhones: new Set(state.selectedPhones),
    selectedVideos: [...state.selectedVideos],
  }
}

export function setMassPostingState(patch: Partial<MassPostingState>) {
  if (patch.taskStatuses)   state.taskStatuses   = new Map(patch.taskStatuses)
  if (patch.selectedPhones) state.selectedPhones = new Set(patch.selectedPhones)
  if (patch.selectedVideos) state.selectedVideos = [...patch.selectedVideos]
  const rest = { ...patch }
  delete rest.taskStatuses; delete rest.selectedPhones; delete rest.selectedVideos
  Object.assign(state, rest)
  notify()
}

export function subscribeMassPosting(cb: () => void): () => void {
  subs.add(cb)
  return () => subs.delete(cb)
}
