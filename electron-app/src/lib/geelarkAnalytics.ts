/**
 * Synchronisation des stats de comptes via l'API Analytics de GeeLark (incluse au
 * plan Pro) — alternative gratuite à RapidAPI. Enregistre les comptes dans le
 * tracking GeeLark puis rapatrie followers/vues/likes… dans `phones` +
 * `account_stats_history` (les mêmes tables que le sync RapidAPI), pour que
 * Rapports & Stats fonctionnent sans changement.
 */
import { supabase } from './supabase'
import {
  geelarkAnalyticsAddAccounts, geelarkAnalyticsDataAll,
  type GeelarkChannel, type GeelarkAnalyticsRow,
} from './geelark'

interface PhoneRow { id: string; ig_username: string | null; total_views: number | null }

export interface AnalyticsSyncResult {
  ok: boolean
  updated: number
  needsPro?: boolean
  error?: string
}

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/^@/, '').toLowerCase()

export async function syncGeelarkAnalytics(
  bearer: string,
  orgId: string | null,
  userId: string,
): Promise<AnalyticsSyncResult> {
  if (!bearer) return { ok: false, updated: 0, error: 'Token GéeLark manquant.' }

  // 1. Comptes à suivre (Instagram — seule colonne username présente sur `phones`)
  let q = supabase.from('phones').select('id, ig_username, total_views')
  q = orgId ? q.eq('org_id', orgId) : q.eq('user_id', userId).is('org_id', null)
  const { data: phones, error: pErr } = await q
  if (pErr) return { ok: false, updated: 0, error: pErr.message }
  const list = (phones ?? []) as PhoneRow[]

  const ig = list.filter(p => norm(p.ig_username))

  // 2. Enregistrement dans le tracking (idempotent : les doublons sont ignorés côté GeeLark)
  if (ig.length) await geelarkAnalyticsAddAccounts(bearer, 2, ig.map(p => ({ account: norm(p.ig_username) })))

  // 3. Récupération des stats Instagram (channel 2)
  const rowsByAccount = new Map<string, GeelarkAnalyticsRow>()
  const r = await geelarkAnalyticsDataAll(bearer, 2 as GeelarkChannel)
  if (r.needsPro) return { ok: false, updated: 0, needsPro: true, error: 'L\'analytics n\'est pas disponible (plan Pro GéeLark requis).' }
  if (r.ok) for (const row of r.items) rowsByAccount.set(`2:${norm(row.account)}`, row)

  // 4. Application aux phones + historique. -1 = pas encore synchronisé → on ignore ce champ.
  const nowIso = new Date().toISOString()
  let updated = 0
  for (const p of list) {
    const row = rowsByAccount.get(`2:${norm(p.ig_username)}`)
    if (!row) continue
    const followers = row.followerCount >= 0 ? row.followerCount : null
    const views     = row.playCount     >= 0 ? row.playCount     : null
    if (followers == null && views == null) continue

    const upd: Record<string, unknown> = {}
    if (followers != null) upd.followers = followers
    if (views != null)     upd.total_views = views
    if (Object.keys(upd).length) {
      await supabase.from('phones').update(upd).eq('id', p.id)
      updated++
      // Historique (alimente les courbes de Stats). following/posts inconnus via GeeLark.
      await supabase.from('account_stats_history').insert({
        user_id: userId, org_id: orgId, phone_id: p.id,
        followers: followers ?? 0, following: 0, posts: 0,
        total_views: views ?? (p.total_views ?? 0), recorded_at: nowIso,
      }).then(() => {}, () => {})
    }
  }

  return { ok: true, updated }
}
