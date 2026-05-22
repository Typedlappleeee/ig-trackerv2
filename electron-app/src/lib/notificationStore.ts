export interface AppNotification {
  id: string
  title: string
  body?: string
  level: 'ok' | 'warn' | 'error' | 'info'
  time: string
}

type Listener = () => void

let notifications: AppNotification[] = []
let unread = 0
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach(l => l())
}

export function subscribeNotifications(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getNotifications(): AppNotification[] {
  return notifications
}

export function unreadCount(): number {
  return unread
}

export function pushNotification(n: Omit<AppNotification, 'id' | 'time'>) {
  const now = new Date()
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  notifications = [{ ...n, id: `${Date.now()}-${Math.random()}`, time }, ...notifications].slice(0, 50)
  unread++
  notify()
}

export function markAllRead() {
  unread = 0
  notify()
}

export function clearNotifications() {
  notifications = []
  unread = 0
  notify()
}
