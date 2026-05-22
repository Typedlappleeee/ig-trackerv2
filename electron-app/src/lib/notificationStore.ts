export type NotifLevel = 'ok' | 'error' | 'warn' | 'info'

export interface AppNotification {
  id:      string
  title:   string
  body?:   string
  level:   NotifLevel
  time:    string   // HH:MM
  read:    boolean
}

const MAX = 50

const state = {
  items: [] as AppNotification[],
}

const subs = new Set<() => void>()
function notify() { subs.forEach(cb => cb()) }

export function subscribeNotifications(cb: () => void): () => void {
  subs.add(cb)
  return () => { subs.delete(cb) }
}

export function getNotifications() {
  return [...state.items]
}

export function pushNotification(n: Omit<AppNotification, 'id' | 'time' | 'read'>) {
  const item: AppNotification = {
    ...n,
    id:   crypto.randomUUID(),
    time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    read: false,
  }
  state.items = [item, ...state.items].slice(0, MAX)
  notify()
}

export function markAllRead() {
  state.items = state.items.map(i => ({ ...i, read: true }))
  notify()
}

export function clearNotifications() {
  state.items = []
  notify()
}

export function unreadCount() {
  return state.items.filter(i => !i.read).length
}
