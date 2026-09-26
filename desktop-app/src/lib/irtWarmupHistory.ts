// Historique local des sessions de warm-up iRemoTech (P1 : localStorage ; une table
// Supabase pourra prendre le relais pour le partage multi-appareils en P2).
export interface WarmupSession {
  at: number                 // timestamp de fin (ms)
  device: string             // public_id du téléphone
  deviceName?: string
  container: string
  durationSec: number
  reels: number
  likes: number
  comments: number
  result: 'completed' | 'stopped' | 'failed'
}

const KEY = 'sf-irt-warmup-history'

export function loadWarmupHistory(): WarmupSession[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as WarmupSession[] } catch { return [] }
}

export function addWarmupSession(s: WarmupSession): void {
  try {
    const h = loadWarmupHistory()
    h.unshift(s)
    localStorage.setItem(KEY, JSON.stringify(h.slice(0, 300)))
  } catch { /* best-effort */ }
}

// Dernière session par conteneur (clé `${device}::${container}`) — pour l'onglet Comptes.
export function lastWarmupByContainer(): Record<string, WarmupSession> {
  const out: Record<string, WarmupSession> = {}
  for (const s of loadWarmupHistory()) {
    const k = `${s.device}::${s.container}`
    if (!out[k]) out[k] = s
  }
  return out
}
