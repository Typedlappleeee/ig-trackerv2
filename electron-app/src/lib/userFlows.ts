// Stockage des flows créés par l'utilisateur (workshop). Pour l'instant en
// localStorage — même format `Flow` que les flows officiels, donc joué par le
// même interpréteur. Migration Supabase (partage org/officiels) prévue ensuite,
// sans changer le format.
import type { Flow } from './flowRunner'

const KEY = 'sf-user-flows'

export function loadUserFlows(): Flow[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Flow[] } catch { return [] }
}
export function saveUserFlow(flow: Flow): void {
  const all = loadUserFlows().filter(f => f.id !== flow.id)
  all.push(flow)
  localStorage.setItem(KEY, JSON.stringify(all))
}
export function deleteUserFlow(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(loadUserFlows().filter(f => f.id !== id)))
}
export function newFlowId(): string {
  const hex = Array.from({ length: 8 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
  return `user-${hex}`
}
