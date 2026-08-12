// Store GLOBAL des fenêtres de téléphone ouvertes (self-host / cloud phones).
//
// Pourquoi : avant, l'état des fenêtres vivait dans la page CloudPhones. Dès
// qu'on changeait d'onglet, la page se démontait et les fenêtres disparaissaient.
// En le remontant ici (singleton hors React, façon activeRuns/massPostingStore),
// les fenêtres SURVIVENT au changement d'onglet et flottent par-dessus toute
// l'app (rendues par <CpWindowsLayer/> dans Layout). Elles restent déplaçables
// partout car CloudPhoneWindow est en position: fixed.
import { useSyncExternalStore } from 'react'
import { cloudPhones, type CpInstance } from '@/lib/cloudPhones'

export interface CpWindowEntry {
  id: string
  inst: CpInstance        // snapshot au moment de l'ouverture (la fenêtre gère ensuite son propre cycle)
  name: string            // nom d'affichage (meta.name || inst.name)
  proxyId?: string        // proxy assigné → IP sortante dans la barre de titre
}

interface CpWindowsState {
  openIds: string[]
  zOrder: string[]        // ordre d'empilement (dernier = au-dessus)
  entries: Record<string, CpWindowEntry>
}

let state: CpWindowsState = { openIds: [], zOrder: [], entries: {} }
const listeners = new Set<() => void>()

function set(next: Partial<CpWindowsState>): void {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

function getSnapshot(): CpWindowsState { return state }

export function subscribeCpWindows(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

// Ouvre (ou ré-active + met au premier plan) la fenêtre d'un téléphone.
export function openCpWindow(entry: CpWindowEntry): void {
  set({
    openIds: state.openIds.includes(entry.id) ? state.openIds : [...state.openIds, entry.id],
    zOrder: [...state.zOrder.filter(x => x !== entry.id), entry.id],
    entries: { ...state.entries, [entry.id]: entry },
  })
}

// Passe une fenêtre au premier plan.
export function focusCpWindow(id: string): void {
  if (!state.openIds.includes(id)) return
  set({ zOrder: [...state.zOrder.filter(x => x !== id), id] })
}

// Ferme la fenêtre = éteint le tel (il se rallume à la prochaine ouverture).
// Renvoie la promesse du stop pour que l'appelant puisse rafraîchir sa liste.
export function closeCpWindow(id: string): Promise<void> {
  set({
    openIds: state.openIds.filter(x => x !== id),
    zOrder: state.zOrder.filter(x => x !== id),
    entries: Object.fromEntries(Object.entries(state.entries).filter(([k]) => k !== id)),
  })
  return cloudPhones.stop(id).then(() => undefined).catch(() => undefined)
}

// Retire une fenêtre SANS éteindre le tel (ex. tel supprimé : le container
// n'existe déjà plus, inutile de tenter un stop).
export function dropCpWindow(id: string): void {
  if (!state.openIds.includes(id) && !state.entries[id]) return
  set({
    openIds: state.openIds.filter(x => x !== id),
    zOrder: state.zOrder.filter(x => x !== id),
    entries: Object.fromEntries(Object.entries(state.entries).filter(([k]) => k !== id)),
  })
}

export function isCpWindowOpen(id: string): boolean { return state.openIds.includes(id) }

// Hook React : re-render à chaque changement d'état des fenêtres.
export function useCpWindows(): CpWindowsState {
  return useSyncExternalStore(subscribeCpWindows, getSnapshot, getSnapshot)
}
