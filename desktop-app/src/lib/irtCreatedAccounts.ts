// Comptes Instagram créés via l'automatisation iRemoTech — enregistrés localement
// (identifiants + numéro + logs). P2 : bascule possible vers une table Supabase partagée.
export interface CreatedAccount {
  at: number                 // timestamp de création (ms)
  device: string             // public_id du téléphone
  deviceName?: string
  container: string
  username?: string
  password?: string
  fullName?: string
  phone?: string             // numéro utilisé
  provider?: string          // HeroSMS / 5sim
  price?: number
  country?: string
  ok: boolean                // inscription terminée
  log?: string[]             // journal de la création
}

const KEY = 'sf-irt-created-accounts'

export function loadCreatedAccounts(): CreatedAccount[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as CreatedAccount[] } catch { return [] }
}

export function addCreatedAccount(a: CreatedAccount): void {
  try {
    const list = loadCreatedAccounts()
    list.unshift(a)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 500)))
  } catch { /* best-effort */ }
}

export function removeCreatedAccount(at: number): void {
  try { localStorage.setItem(KEY, JSON.stringify(loadCreatedAccounts().filter(a => a.at !== at))) } catch { /* noop */ }
}

export function clearCreatedAccounts(): void {
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
}
