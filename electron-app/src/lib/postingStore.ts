/**
 * Singleton store for Posting page state — survives React unmounts/navigation.
 */
export interface TaskLog {
  message: string
  level:   'info' | 'ok' | 'error' | 'warn'
  time:    string
}

interface PostingState {
  posting:        boolean
  progress:       number
  logs:           TaskLog[]
  filePath:       string | null
  caption:        string
  selectedPhones: Set<string>
}

const state: PostingState = {
  posting:        false,
  progress:       0,
  logs:           [],
  filePath:       null,
  caption:        '',
  selectedPhones: new Set(),
}

const subs = new Set<() => void>()

function notify() { subs.forEach(cb => cb()) }

export function getPostingState(): PostingState {
  return { ...state, selectedPhones: new Set(state.selectedPhones) }
}

export function setPostingState(patch: Partial<PostingState>) {
  if (patch.selectedPhones) {
    state.selectedPhones = new Set(patch.selectedPhones)
    patch = { ...patch }
    delete patch.selectedPhones
  }
  Object.assign(state, patch)
  notify()
}

export function subscribePosting(cb: () => void): () => void {
  subs.add(cb)
  return () => subs.delete(cb)
}
