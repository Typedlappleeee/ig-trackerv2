// Noms propres pour la Banque : jamais de nom technique (« hf_20261104_124000_<uuid> » de Higgsfield,
// identifiants « 5674172E-867F-… »…). Un tel nom devient « <Dossier> 012 » (numéro suivant dans
// l'espace), et ses variantes « <Dossier> 012 · v1, v2… ».
import { supabase } from './supabase'
import { leafOf } from './bankFolders'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
/** Nom technique à remplacer (base du titre, avant « · variante »). */
export function isUglyTitle(title: string | null | undefined): boolean {
  const base = String(title ?? '').split(' · ')[0].trim()
  if (!base) return true
  return /^hf[_\-\s]/i.test(base) || UUID.test(base) || /^[0-9a-f]{24,}$/i.test(base)
}
export const prefixFor = (folder: string | null | undefined) => (folder ? leafOf(folder) : '') || 'Média'
export const numbered = (prefix: string, n: number) => `${prefix} ${String(n).padStart(3, '0')}`
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Plus grand numéro « <prefix> NNN » parmi des titres. */
export function maxNumber(prefix: string, titles: Iterable<string | null | undefined>): number {
  const re = new RegExp(`^${esc(prefix)} (\\d+)`, 'i')
  let max = 0
  for (const t of titles) { const m = re.exec(t ?? ''); if (m) max = Math.max(max, Number(m[1])) }
  return max
}

// Numéros réservés pendant la session (deux traitements en parallèle n'ont jamais le même).
const last = new Map<string, number>()
export async function allocTitle(scope: { orgId: string | null; userId: string }, prefix: string): Promise<string> {
  const key = `${scope.orgId ?? 'u:' + scope.userId}|${prefix.toLowerCase()}`
  if (!last.has(key)) {
    let q = supabase.from('content_bank').select('title').ilike('title', `${prefix} %`).limit(5000)
    q = scope.orgId ? q.eq('org_id', scope.orgId) : q.eq('user_id', scope.userId).is('org_id', null)
    const { data } = await q
    last.set(key, maxNumber(prefix, ((data ?? []) as { title: string | null }[]).map(r => r.title)))
  }
  const n = (last.get(key) ?? 0) + 1
  last.set(key, n)
  return numbered(prefix, n)
}
/** Titre de base propre pour un média : le sien s'il est lisible, sinon « <Dossier> NNN ». */
export async function niceBase(scope: { orgId: string | null; userId: string }, title: string | null | undefined, folder: string | null | undefined): Promise<string> {
  const base = String(title ?? '').split(' · ')[0].trim()
  return isUglyTitle(base) ? allocTitle(scope, prefixFor(folder)) : base
}
