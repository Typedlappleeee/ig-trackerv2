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
  private?: boolean                 // compte passé en privé
  recent?: { at: number; views: number }[]   // 12 derniers Reels (date, vues) → santé du compte
  at: string                        // date de la lecture
}

export type Health = 'banned' | 'private' | 'drop' | 'low' | 'ok' | 'unknown'
export const HEALTH_LABEL: Record<Health, string> = {
  banned: '🔴 Introuvable (suspendu, banni ou renommé)', private: '🟠 Compte privé', drop: '🟠 Portée en chute (shadowban possible)',
  low: '🟡 Portée très faible', ok: '🟢 OK', unknown: '—',
}
/** État d'un compte d'après ses stats : introuvable = suspendu / banni / renommé ; Reels récents (≥ 24 h, vues stabilisées)
 *  à moins d'un quart des précédents = portée en chute (shadowban possible) ; tous les Reels sous 30 vues = portée très
 *  faible. Indicatif : Instagram ne publie pas l'état « flag » d'un compte. Pure. */
export function accountHealth(s: IgStat | undefined, now = Date.now()): Health {
  if (!s) return 'unknown'
  if (s.missing) return 'banned'
  if (s.private) return 'private'
  const mature = (s.recent ?? []).filter(r => now - r.at >= 24 * 3600_000).sort((a, b) => b.at - a.at)
  const med = (v: number[]) => { const x = [...v].sort((a, b) => a - b); return x.length ? x[Math.floor(x.length / 2)] : 0 }
  if (mature.length >= 5) {
    const newest = med(mature.slice(0, 3).map(r => r.views)), older = med(mature.slice(3).map(r => r.views))
    if (older >= 200 && newest < older * 0.25) return 'drop'
  }
  if (mature.length >= 6 && mature.every(r => r.views < 30)) return 'low'
  return 'ok'
}
export const STATS_TTL = 24 * 3600_000
/** Raison du dernier échec de lecture (affichée sous le bouton « Relire les stats »), null si tout va bien. */
export let lastStatsError: string | null = null

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
    story: !!r.story, storyLink: !!r.storyLink, private: !!r.private,
    recent: Array.isArray(r.recent) ? (r.recent as Record<string, unknown>[]).map(v => ({ at: Number(v.at) || 0, views: Number(v.views) || 0 })).filter(v => v.at).slice(0, 12) : undefined,
    at: String(r.at ?? new Date().toISOString()),
  }
}
/** Comptes à relire : jamais lus ou lus il y a plus de 24 h (ou tous si `force`). Pure. */
export function staleAccounts(usernames: string[], stats: Record<string, IgStat>, now = Date.now(), force = false): string[] {
  return [...new Set(usernames.map(u => u.replace(/^@/, '').toLowerCase()).filter(Boolean))]
    .filter(u => force || !stats[u] || now - Date.parse(stats[u].at) > STATS_TTL)
}

// Comptes déjà DEMANDÉS récemment (même si la lecture a échoué) : sans ce mémo, un compte dont la lecture rate n'était
// jamais enregistré → relu à chaque ouverture de page, toutes les 3 h et à chaque détection, sur chaque PC → requêtes
// HikerAPI qui s'envolaient. Une seule tentative par compte toutes les 12 h (navigateur), sauf « Relire les stats ».
const TRIED_KEY = 'sf-irt-igstats-tried'
const TRIED_TTL = 12 * 3600_000
function loadTried(): Record<string, number> { try { return JSON.parse(localStorage.getItem(TRIED_KEY) ?? '{}') } catch { return {} } }
export function recentlyTried(u: string, now = Date.now()): boolean { const t = loadTried()[u]; return !!t && now - t < TRIED_TTL }
function markTried(us: string[]) {
  const now = Date.now(), t = loadTried()
  for (const [k, v] of Object.entries(t)) if (now - v > TRIED_TTL) delete t[k]
  for (const u of us) t[u] = now
  try { localStorage.setItem(TRIED_KEY, JSON.stringify(t)) } catch { /* plein */ }
}

/** Lit les stats par paquets de 8 (relais Vercel /api/iremotech op `stats`). */
export async function fetchIgStats(apiKey: string, usernames: string[], onBatch?: (s: Record<string, IgStat>) => void): Promise<Record<string, IgStat>> {
  const out: Record<string, IgStat> = {}
  lastStatsError = null
  markTried(usernames)
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
      lastStatsError = j.ok ? null : String((j as { error?: string }).error ?? 'lecture impossible')
      const batch: Record<string, IgStat> = {}
      for (const v of Object.values(j.stats ?? {})) { const c = compactStat(v); if (c) batch[c.username] = c }
      Object.assign(out, batch)
      onBatch?.(batch)
    } catch { /* paquet suivant */ }
  }
  return out
}

// ── Stockage PARTAGÉ dans l'agence, à part des réglages d'équipe ─────────────────────────────────────────────────
// Ligne sentinelle `__sf_igstats__` de `iremotech_device_meta` (colonne `accounts`, aucun SQL). Avant, les stats étaient
// dans `irtTeam` : un ScaleFlow resté sur une ANCIENNE version (autre PC / onglet) réécrivait ces réglages sans elles et
// les effaçait pour tout le monde (vu le 27/11/2026). Ici, seule la version actuelle écrit, en FUSIONNANT (jamais d'écrasement).
const STATS_ROW = '__sf_igstats__'
type Scope = { orgId: string | null; userId: string }
const statsRow = (s: Scope) => s.orgId ? { scope_id: s.orgId, is_org: true } : { scope_id: s.userId, is_org: false }
const statsCacheKey = (s: Scope) => `sf-irt-igstats:${statsRow(s).scope_id}`
/** Lecture brute → stats propres (600 comptes max). Pure. */
export function parseStats(raw: unknown): Record<string, IgStat> {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, compactStat(v)] as const).filter((e): e is [string, IgStat] => !!e[1]).slice(-600))
}
/** Fusion : pour chaque compte, la lecture la plus récente gagne. Pure. */
export function mergeStats(a: Record<string, IgStat>, b: Record<string, IgStat>): Record<string, IgStat> {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) if (!out[k] || Date.parse(v.at) >= Date.parse(out[k].at)) out[k] = v
  return out
}
export function loadStatsCache(s: Scope): Record<string, IgStat> {
  try { return parseStats(JSON.parse(localStorage.getItem(statsCacheKey(s)) ?? '{}')) } catch { return {} }
}
export async function pullIgStats(s: Scope): Promise<Record<string, IgStat> | null> {
  const { data, error } = await supabase.from('iremotech_device_meta').select('accounts').eq('scope_id', statsRow(s).scope_id).eq('device_id', STATS_ROW).maybeSingle()
  if (error) return null
  const st = mergeStats(loadStatsCache(s), parseStats(data?.accounts))
  try { localStorage.setItem(statsCacheKey(s), JSON.stringify(st)) } catch { /* plein */ }
  return st
}
/** Ajoute des stats : relit la version partagée, fusionne, enregistre (les écritures sont mises en file : pas de course). */
let saveChain: Promise<unknown> = Promise.resolve()
export function saveIgStats(s: Scope, batch: Record<string, IgStat>): Promise<Record<string, IgStat>> {
  const run = saveChain.then(async () => {
    const fresh = (await pullIgStats(s).catch(() => null)) ?? loadStatsCache(s)
    const st = mergeStats(fresh, batch)
    try { localStorage.setItem(statsCacheKey(s), JSON.stringify(st)) } catch { /* plein */ }
    await supabase.from('iremotech_device_meta').upsert({ ...statsRow(s), device_id: STATS_ROW, accounts: st, updated_at: new Date().toISOString() }, { onConflict: 'scope_id,device_id' })
    return st
  })
  saveChain = run.catch(() => undefined)
  return run
}
