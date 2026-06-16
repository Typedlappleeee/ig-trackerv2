export interface AppNotification {
  id: string
  title: string
  body?: string
  level: 'ok' | 'warn' | 'error' | 'info'
  time: string
  /** Optional deep-link: page id to navigate to when the notification is clicked */
  page?: string
}

type Listener = () => void

const STORAGE_KEY = 'sf-notifications'
const MAX_NOTIFICATIONS = 50

let notifications: AppNotification[] = []
let unread = 0
const listeners = new Set<Listener>()

// ── Persistence ──────────────────────────────────────────────────────────────
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notifications, unread }))
  } catch {
    /* quota exceeded / private mode — non-fatal */
  }
}

function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { notifications?: unknown; unread?: unknown }
    if (Array.isArray(parsed.notifications)) {
      notifications = parsed.notifications
        .filter((n): n is AppNotification =>
          !!n && typeof n === 'object' &&
          typeof (n as AppNotification).id === 'string' &&
          typeof (n as AppNotification).title === 'string')
        .slice(0, MAX_NOTIFICATIONS)
    }
    if (typeof parsed.unread === 'number' && Number.isFinite(parsed.unread)) {
      unread = Math.max(0, Math.min(parsed.unread, notifications.length))
    }
  } catch {
    /* corrupted payload — start fresh */
    notifications = []
    unread = 0
  }
}

// Hydrate once at module load (app boot)
hydrate()

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
  notifications = [{ ...n, id: `${Date.now()}-${Math.random()}`, time }, ...notifications].slice(0, MAX_NOTIFICATIONS)
  unread++
  persist()
  notify()
}

export function markAllRead() {
  if (unread === 0) return
  unread = 0
  persist()
  notify()
}

export function clearNotifications() {
  notifications = []
  unread = 0
  persist()
  notify()
}
