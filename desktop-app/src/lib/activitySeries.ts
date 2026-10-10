// Série quotidienne des publications (accueil) : comptes publiés / en échec par jour,
// à partir des runs directs (post_runs) et des posts programmés exécutés (scheduled_posts).
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'

export interface DayPoint { day: string; ts: number; ok: number; failed: number }
export interface SeriesSummary {
  days: DayPoint[]
  ok7: number; failed7: number; okPrev7: number; failedPrev7: number
  rate7: number | null; ratePrev7: number | null
}

interface RunRow { created_at: string; ok_count: number | null; err_count: number | null }
interface SchedRow { executed_at: string | null; created_at: string; status: string; phones: unknown; result: unknown }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const asArr = (v: unknown): unknown[] => Array.isArray(v) ? v : typeof v === 'string' ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } })() : []

/** Pur : construit `nDays` jours (le plus ancien d'abord, aujourd'hui en dernier). */
export function buildDailySeries(runs: RunRow[], sched: SchedRow[], nDays: number, now = new Date()): SeriesSummary {
  const days: DayPoint[] = []
  const idx = new Map<string, DayPoint>()
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const p = { day: dayKey(d), ts: d.getTime(), ok: 0, failed: 0 }
    days.push(p); idx.set(p.day, p)
  }
  for (const r of runs) {
    const p = idx.get(dayKey(new Date(r.created_at)))
    if (p) { p.ok += r.ok_count ?? 0; p.failed += r.err_count ?? 0 }
  }
  for (const s of sched) {
    const p = idx.get(dayKey(new Date(s.executed_at ?? s.created_at)))
    if (!p) continue
    const det = asArr((s.result as { details?: unknown } | null)?.details) as { ok?: boolean }[]
    if (det.length) { for (const d of det) { if (d?.ok) p.ok++; else p.failed++ } }
    else { const n = asArr(s.phones).length; if (s.status === 'done') p.ok += n; else p.failed += n }
  }
  const sum = (a: DayPoint[], k: 'ok' | 'failed') => a.reduce((s, x) => s + x[k], 0)
  const last7 = days.slice(-7), prev7 = days.slice(-14, -7)
  const ok7 = sum(last7, 'ok'), failed7 = sum(last7, 'failed'), okPrev7 = sum(prev7, 'ok'), failedPrev7 = sum(prev7, 'failed')
  const rate = (ok: number, ko: number) => ok + ko > 0 ? Math.round((ok / (ok + ko)) * 100) : null
  return { days, ok7, failed7, okPrev7, failedPrev7, rate7: rate(ok7, failed7), ratePrev7: rate(okPrev7, failedPrev7) }
}

export function useActivitySeries(user: User, org: OrgState, nDays = 14) {
  const { currentOrg } = org
  const [data, setData] = useState<SeriesSummary | null>(null)
  const load = useCallback(async () => {
    const since = new Date(Date.now() - nDays * 86400000).toISOString()
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [pr, sp] = await Promise.all([
      scope(supabase.from('post_runs').select('created_at,ok_count,err_count')).gte('created_at', since).limit(2000),
      scope(supabase.from('scheduled_posts').select('executed_at,created_at,status,phones,result')).in('status', ['done', 'failed']).gte('created_at', since).limit(2000),
    ])
    setData(buildDailySeries((pr.data ?? []) as RunRow[], (sp.data ?? []) as SchedRow[], nDays))
  }, [currentOrg?.id, user.id, nDays])
  useEffect(() => { void load() }, [load])
  return { series: data, reloadSeries: load }
}
