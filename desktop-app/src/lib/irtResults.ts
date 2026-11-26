// Résultats des automatisations iRemoTech, compte par compte (page « Résultats ») : chaque Reel / Story / carrousel /
// setup / warm-up réussi ou raté est enregistré dans `post_runs` (une ligne par lancement, `type` = irt_<action>,
// `details` = une entrée par compte traité) — table existante, aucun SQL. Partagé dans l'agence (RLS de post_runs).
import { supabase } from './supabase'

export type IrtAction = 'reel' | 'story' | 'carousel' | 'setup' | 'warmup'
export const IRT_ACTIONS: IrtAction[] = ['reel', 'story', 'carousel', 'setup', 'warmup']
export interface IrtResultEntry {
  name: string          // compte (« @nom ») ou container
  ok: boolean
  error?: string
  device: string        // id iRemoTech de l'iPhone
  phone: string         // nom affiché de l'iPhone
  at: number            // horodatage (ms)
  action: IrtAction
}

/** Journal d'un lancement : `rec` ajoute un compte traité (écrit en base par paquets), `finish` force l'écriture. */
export function startIrtLog(scope: { userId: string; orgId: string | null }, action: IrtAction) {
  const entries: IrtResultEntry[] = []
  let id: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let chain: Promise<void> = Promise.resolve()
  const row = () => ({ ok_count: entries.filter(e => e.ok).length, err_count: entries.filter(e => !e.ok).length, total: entries.length, details: entries })
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null }
    chain = chain.then(async () => {
      if (!entries.length) return
      try {
        if (id) await supabase.from('post_runs').update(row()).eq('id', id)
        else {
          // `post_runs.type` a une contrainte CHECK (posting / mass_posting / story) dans certaines bases : « irt_<action> »
          // y est REFUSÉ (rien ne s'enregistrait — page Résultats vide le 26/11/2026) → repli sur « posting » / « story »,
          // la ligne reste reconnue comme iRemoTech par ses `details` (champ `action` + `device`)
          let r = await supabase.from('post_runs').insert({ user_id: scope.userId, org_id: scope.orgId, type: `irt_${action}`, ...row() }).select('id').single()
          if (r.error) r = await supabase.from('post_runs').insert({ user_id: scope.userId, org_id: scope.orgId, type: action === 'story' ? 'story' : 'posting', ...row() }).select('id').single()
          id = (r.data as { id: string } | null)?.id ?? null
        }
      } catch { /* réseau : réessayé au prochain enregistrement */ }
    })
    return chain
  }
  return {
    rec(device: string, phone: string, name: string, ok: boolean, error?: string) {
      entries.push({ name, ok, ...(error ? { error } : {}), device, phone, at: Date.now(), action })
      if (!timer) timer = setTimeout(() => { void flush() }, 2500)
    },
    finish: () => flush(),
  }
}

export interface ActionStat { ok: number; err: number; lastOk: number | null; lastErr: number | null; lastError?: string }
export interface AccountResults {
  key: string; name: string; device: string; phone: string
  by: Record<IrtAction, ActionStat>
  last: number            // dernière activité (réussie ou non)
}
const emptyStat = (): ActionStat => ({ ok: 0, err: 0, lastOk: null, lastErr: null })

/** Regroupe les entrées par compte (iPhone + compte), depuis `since` (ms). Pure. */
export function aggregateResults(entries: IrtResultEntry[], since = 0): AccountResults[] {
  const map = new Map<string, AccountResults>()
  for (const e of entries) {
    if (!e || !e.name || !IRT_ACTIONS.includes(e.action) || !(e.at >= since)) continue
    const key = `${e.device}::${e.name.toLowerCase()}`
    let a = map.get(key)
    if (!a) { a = { key, name: e.name, device: e.device, phone: e.phone, by: Object.fromEntries(IRT_ACTIONS.map(k => [k, emptyStat()])) as Record<IrtAction, ActionStat>, last: 0 }; map.set(key, a) }
    const s = a.by[e.action]
    if (e.ok) { s.ok++; s.lastOk = Math.max(s.lastOk ?? 0, e.at) } else if (!s.lastErr || e.at > s.lastErr) { s.err++; s.lastErr = e.at; s.lastError = e.error } else s.err++
    if (e.at >= a.last) { a.last = e.at; a.phone = e.phone || a.phone }
  }
  return [...map.values()].sort((x, y) => x.phone.localeCompare(y.phone, 'fr', { numeric: true }) || x.name.localeCompare(y.name, 'fr'))
}

/** Entrées iRemoTech de l'espace depuis `since` (ms). */
export async function loadIrtResults(scope: { userId: string; orgId: string | null }, since: number): Promise<IrtResultEntry[]> {
  let q = supabase.from('post_runs').select('details,created_at').or('type.like.irt_%,type.eq.posting,type.eq.story').gte('created_at', new Date(since - 864e5).toISOString()).order('created_at', { ascending: false }).limit(2000)
  q = scope.orgId ? q.eq('org_id', scope.orgId) : q.eq('user_id', scope.userId).is('org_id', null)
  const { data } = await q
  // seulement les entrées iRemoTech (les runs GeeLark « posting » / « story » n'ont ni `action` ni `device`)
  return (data ?? []).flatMap(r => (Array.isArray((r as { details?: unknown }).details) ? (r as { details: IrtResultEntry[] }).details : []))
    .filter(e => e && typeof e === 'object' && IRT_ACTIONS.includes(e.action) && typeof e.device === 'string' && typeof e.at === 'number')
}
