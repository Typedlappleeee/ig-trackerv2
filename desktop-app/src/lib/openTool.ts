// Ouverture d'un OUTIL précis (et pas seulement d'une page) : Explorer, ⌘K et l'accueil
// écrivent la cible ici, la page la lit UNE fois dans son useState initial
// (onglet Studio, format Publish, onglet Warmup / Liens / Veille / Réglages…).
// Garde aussi les « récemment utilisés » pour Explorer.
const OPEN_KEY = 'sf-open'
const RECENT_KEY = 'sf-recent-tools'
const MAX_AGE = 10_000

export type OpenArg = Record<string, unknown>

/** Prépare l'ouverture de `page` avec `arg`, mémorise l'outil récent, puis navigue. */
export function openTool<P extends string>(setPage: (p: P) => void, page: P, arg?: OpenArg, toolId?: string): void {
  try { sessionStorage.setItem(OPEN_KEY, JSON.stringify({ page, arg: arg ?? null, t: Date.now() })) } catch { /* ignore */ }
  if (toolId) pushRecent(toolId)
  setPage(page)
}

/** Argument d'ouverture pour `page` (lu une seule fois, ignoré après 10 s). */
export function takeOpenArg<T extends OpenArg = OpenArg>(page: string, now = Date.now()): T | null {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { page: string; arg: T | null; t: number }
    if (v.page !== page) return null
    sessionStorage.removeItem(OPEN_KEY)
    return now - v.t <= MAX_AGE ? v.arg : null
  } catch { return null }
}

/** Lecture sans consommer (pour plusieurs useState d'une même page). */
export function peekOpenArg<T extends OpenArg = OpenArg>(page: string, now = Date.now()): T | null {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { page: string; arg: T | null; t: number }
    return v.page === page && now - v.t <= MAX_AGE ? v.arg : null
  } catch { return null }
}

export function pushRecent(id: string): void {
  try {
    const cur = recentTools().filter(x => x !== id)
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...cur].slice(0, 8)))
  } catch { /* ignore */ }
}
export function recentTools(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] }
}
