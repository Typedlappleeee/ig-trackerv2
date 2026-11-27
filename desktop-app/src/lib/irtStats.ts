// Stats Instagram (HikerAPI) des comptes iRemoTech, relues au plus une fois par 24 h et par compte (et à la demande) :
// abonnés / abonnements, Reels publiés ces 24 h et leurs vues, Reels > 5 000 vues en 48 h (mis en avant), Story en ligne
// avec ou sans lien. Partagées dans l'agence via les réglages d'équipe (`irtTeam.igstats`).
import { supabase } from './supabase'

const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'

export interface IgStat {
  username: string
  missing?: boolean                 // compte introuvable (supprimé / suspendu / renommé)
  followers?: number | null
  following?: number | null
  media?: number | null
  reels24?: number                  // Reels publiés ces dernières 24 h
  views24?: number                  // vues cumulées de ces Reels
  viral48?: { code: string; views: number; at: number }[]   // Reels ≥ 5 000 vues publiés ces 48 h
  top?: { code: string; views: number } | null              // Reel le plus vu (parmi les derniers)
  story?: boolean                   // Story en ligne
  storyLink?: boolean               // … avec un sticker lien (CTA)
  at: string                        // date de la lecture
}
export const STATS_TTL = 24 * 3600_000

/** Réponse brute du relais → stat compacte (sans miniatures, pour rester légère dans les réglages d'équipe). Pure. */
export function compactStat(raw: unknown): IgStat | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const u = String(r.username ?? '').toLowerCase()
  if (!u) return null
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  if (r.missing) return { username: u, missing: true, at: String(r.at ?? new Date().toISOString()) }
  const viral = Array.isArray(r.viral48) ? (r.viral48 as Record<string, unknown>[]).map(v => ({ code: String(v.code ?? ''), views: Number(v.views) || 0, at: Number(v.at) || 0 })).filter(v => v.code) : []
  const tr = (r.top ?? r.topReel) as Record<string, unknown> | null | undefined
  const top = tr && typeof tr === 'object' ? { code: String(tr.code ?? ''), views: Number(tr.views) || 0 } : null
  return {
    username: u, followers: n(r.followers), following: n(r.following), media: n(r.media),
    reels24: Number(r.reels24) || 0, views24: Number(r.views24) || 0, viral48: viral.slice(0, 3), top: top?.code ? top : null,
    story: !!r.story, storyLink: !!r.storyLink, at: String(r.at ?? new Date().toISOString()),
  }
}
/** Comptes à relire : jamais lus ou lus il y a plus de 24 h (ou tous si `force`). Pure. */
export function staleAccounts(usernames: string[], stats: Record<string, IgStat>, now = Date.now(), force = false): string[] {
  return [...new Set(usernames.map(u => u.replace(/^@/, '').toLowerCase()).filter(Boolean))]
    .filter(u => force || !stats[u] || now - Date.parse(stats[u].at) > STATS_TTL)
}

/** Lit les stats par paquets de 8 (relais Vercel /api/iremotech op `stats`). */
export async function fetchIgStats(apiKey: string, usernames: string[], onBatch?: (s: Record<string, IgStat>) => void): Promise<Record<string, IgStat>> {
  const out: Record<string, IgStat> = {}
  for (let i = 0; i < usernames.length; i += 8) {
    try {
      const part = usernames.slice(i, i + 8)
      // 1) fonction Supabase (clé HikerAPI = secret Supabase), 2) repli : relais Vercel (si HIKERAPI_KEY y est aussi)
      let j: { ok?: boolean; stats?: Record<string, unknown> } = {}
      try {
        const { data: s } = await supabase.auth.getSession()
        const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify({ irt: 'stats', usernames: part }) })
        j = await r.json()
      } catch { /* repli */ }
      if (!j.ok) {
        const r = await fetch('/api/iremotech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'stats', apiKey, usernames: part }) })
        j = await r.json()
      }
      const batch: Record<string, IgStat> = {}
      for (const v of Object.values(j.stats ?? {})) { const c = compactStat(v); if (c) batch[c.username] = c }
      Object.assign(out, batch)
      onBatch?.(batch)
    } catch { /* paquet suivant */ }
  }
  return out
}
