// Ce qu'il y a VRAIMENT dans chaque container (lu à l'écran), par iPhone : vide / @compte / bloqué.
// Mis à jour par la vérification (« 🔎 Vérifier »), la création « Tout auto » et chaque compte créé.
// localStorage `sf-irt-cont-state` : { [deviceId]: { [container]: { state, username?, at } } }

export type ContState = { state: 'empty' | 'account' | 'blocked' | 'unknown'; username?: string; at: number }
export type ContStateMap = Record<string, Record<string, ContState>>

const KEY = 'sf-irt-cont-state'

export function loadContStates(): ContStateMap {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

export function setContState(dev: string, container: string, s: Omit<ContState, 'at'>): ContStateMap {
  const all = loadContStates()
  all[dev] = { ...(all[dev] ?? {}), [container]: { ...s, at: Date.now() } }
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* noop */ }
  return all
}

/** Containers à remplir d'après la dernière vérification : vides seulement (ou tous, si on déconnecte aussi
 *  les comptes présents). Un container jamais vérifié est gardé (il sera vérifié avant tout achat). Pure. */
export function containersToFill(list: string[], states: Record<string, ContState> | undefined, includeAccounts: boolean): string[] {
  return list.filter(c => {
    const s = states?.[c]
    if (!s) return true
    if (s.state === 'blocked') return false
    return s.state !== 'account' || includeAccounts
  })
}
