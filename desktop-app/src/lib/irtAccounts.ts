// Onglet « Comptes » du studio iRemoTech : tout est relu depuis l'historique des jobs iRemoTech (scan des comptes,
// statut, warm-up) — partagé avec toute l'équipe sans table — plus les profils Instagram (photo, abonnés…).
import type { IrtJob } from './iremotech'
import { supabase } from './supabase'

/** Les 6 indicateurs du statut Instagram (« account_status ») avec un libellé clair. */
export const STATE_LABELS: Record<string, string> = {
  removed_content_and_messaging_issues: 'Contenu supprimé / messages',
  what_cant_be_recommended: 'Contenu non recommandable',
  monetization: 'Monétisation',
  features_you_cant_use: 'Fonctions bloquées',
  who_dont_follow_you: 'Non recommandé aux non-abonnés',
  under_18: 'Moins de 18 ans',
}
export type Health = { level: 'ok' | 'warn' | 'unknown'; issues: string[] }

/** Santé d'un compte à partir de account_state (green / warning / unknown par indicateur). */
export function healthOf(state: Record<string, unknown> | null | undefined): Health {
  if (!state || typeof state !== 'object') return { level: 'unknown', issues: [] }
  const issues = Object.entries(state).filter(([, v]) => v === 'warning').map(([k]) => STATE_LABELS[k] ?? k)
  if (issues.length) return { level: 'warn', issues }
  return Object.values(state).some(v => v === 'green') ? { level: 'ok', issues: [] } : { level: 'unknown', issues: [] }
}

const pending = (j: IrtJob) => j.status === 'queued' || j.status === 'dispatched'
const newest = (a: IrtJob, b: IrtJob) => Date.parse(b.created_at) - Date.parse(a.created_at)

export interface AccountView {
  username: string
  health: Health
  checkedAt: string | null
  warmup: { at: string; seconds: number | null; likes: number | null; reels: number | null } | null
  running: 'account_status' | 'warm_up' | null
}
export interface DeviceAccounts { accounts: AccountView[]; scannedAt: string | null; scanning: boolean }

/** Comptes d'un iPhone : dernier scan terminé (list_accounts) ∪ comptes déjà connus (`known`, ex. cibles « @nom »)
 *  ∪ comptes vus dans un job de statut / warm-up. Statut et warm-up = derniers jobs terminés de chaque compte. */
export function deviceAccounts(jobs: IrtJob[], known: string[] = []): DeviceAccounts {
  const js = [...jobs].sort(newest)
  const lastScan = js.find(j => j.type === 'list_accounts' && j.status === 'completed')
  const names = new Set<string>()
  for (const u of (lastScan?.result?.accounts as string[] | undefined) ?? []) names.add(String(u).toLowerCase())
  for (const u of known) names.add(u.replace(/^@/, '').toLowerCase())
  for (const j of js) if (j.account) names.add(j.account.toLowerCase())
  const accounts: AccountView[] = [...names].sort().map(u => {
    const mine = js.filter(j => (j.account ?? '').toLowerCase() === u)
    const st = mine.find(j => j.type === 'account_status' && j.status === 'completed')
    const wu = mine.find(j => j.type === 'warm_up' && j.status === 'completed')
    const run = mine.find(pending)
    return {
      username: u,
      health: healthOf(st?.result?.account_state as Record<string, unknown> | undefined),
      checkedAt: st?.finished_at ?? null,
      warmup: wu ? { at: wu.finished_at ?? wu.created_at, seconds: (wu.result?.session_duration_s as number) ?? null, likes: (wu.result?.likes as number) ?? null, reels: (wu.result?.reels_viewed as number) ?? null } : null,
      running: run ? (run.type as 'account_status' | 'warm_up') : null,
    }
  })
  return { accounts, scannedAt: lastScan?.finished_at ?? null, scanning: js.some(j => j.type === 'list_accounts' && pending(j)) }
}

/** « il y a 5 min » */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'jamais'
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'à l’instant'
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`
  return `il y a ${Math.round(s / 86400)} j`
}
/** 12 300 → « 12,3 k » */
export function compactNum(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M`
  if (n >= 10_000) return `${Math.round(n / 1000)} k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} k`
  return String(n)
}

// ── Profils Instagram (photo, abonnés, abonnements, publications) via l'edge function ─────────────────────
export interface IgProfile { username: string; full_name: string | null; profile_pic: string | null; followers: number | null; following: number | null; media_count: number | null; is_verified: boolean; at: string }
const FN_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co/functions/v1/run-scheduled-posts'
const PKEY = 'sf-irt-profiles'
export function loadProfileCache(): Record<string, IgProfile> {
  try { return JSON.parse(localStorage.getItem(PKEY) || '{}') as Record<string, IgProfile> } catch { return {} }
}
/** Profils des comptes (30 par appel ; cache navigateur 6 h, cache serveur 6 h). */
export async function fetchProfiles(usernames: string[], force = false): Promise<Record<string, IgProfile>> {
  const cache = loadProfileCache()
  const todo = [...new Set(usernames.map(u => u.replace(/^@/, '').toLowerCase()))].filter(u => force || !cache[u] || Date.now() - Date.parse(cache[u].at) > 6 * 3600_000)
  if (todo.length) {
    const { data: s } = await supabase.auth.getSession()
    for (let i = 0; i < todo.length; i += 30) {
      try {
        const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` }, body: JSON.stringify({ irt: 'profiles', usernames: todo.slice(i, i + 30), force }) })
        const j = await r.json() as { ok?: boolean; profiles?: Record<string, IgProfile | null> }
        for (const [u, p] of Object.entries(j.profiles ?? {})) if (p) cache[u] = p
      } catch { /* profils facultatifs */ }
    }
    try { localStorage.setItem(PKEY, JSON.stringify(cache)) } catch { /* plein */ }
  }
  return cache
}
/** Image de profil affichable (proxy de l'edge function si c'est encore un lien Instagram). */
export const avatarSrc = (u: string | null | undefined, user: string) => !u ? null
  : /\/storage\/v1\/object\/public\/viral\//.test(u) ? u : `${FN_URL}?img=${encodeURIComponent(u)}&user=${encodeURIComponent(user)}`
