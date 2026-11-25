// iRemoTech sur SERVEUR (PC éteint) — côté ScaleFlow : envoi d'une session dans la file (irt_server_runs), liste des
// sessions de l'espace, journal en direct (irt_server_logs), arrêt, et état des serveurs (irt_workers).
// SQL : supabase/migrations/20261125_irt_server.sql · serveur : public/irt-worker/ (install.sh, worker.mjs).
import { supabase } from './supabase'
import { planTotal, type ServerPlan } from './irtServerSession'

export type ServerRunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export interface ServerRun {
  id: string; title: string | null; status: ServerRunStatus; cancel_requested: boolean
  progress: { total?: number; done?: number; ok?: number }; error: string | null
  created_by_name: string | null; created_at: string; started_at: string | null; finished_at: string | null; worker_id: string | null
}
export interface ServerLog { id: number; at: string; line: string }
type Scope = { orgId: string | null; userId: string }
const missing = (m: string) => /relation|does not exist|schema cache|not find/i.test(m)

/** Serveurs en ligne (battement < 90 s). null = tables pas encore créées (SQL à passer). */
export async function serversOnline(): Promise<number | null> {
  const { data, error } = await supabase.from('irt_workers').select('id').gt('last_seen', new Date(Date.now() - 90_000).toISOString())
  if (error) return missing(error.message) ? null : 0
  return (data ?? []).length
}

export async function enqueueServerRun(s: Scope, plan: ServerPlan, title: string, byName: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const devices = plan.phones.map(p => p.dev)
  const { data, error } = await supabase.from('irt_server_runs').insert({
    org_id: s.orgId, user_id: s.userId, kind: plan.kind, title, devices, plan, created_by_name: byName,
    progress: { total: planTotal(plan), done: 0, ok: 0 },
  }).select('id').maybeSingle()
  if (error) return { ok: false, error: missing(error.message) ? 'tables du serveur absentes : colle le SQL 20261125_irt_server.sql dans Supabase' : error.message }
  return { ok: true, id: (data as { id: string } | null)?.id }
}

export async function listServerRuns(s: Scope, limit = 12): Promise<ServerRun[] | null> {
  const { data, error } = await supabase.from('irt_server_runs')
    .select('id,title,status,cancel_requested,progress,error,created_by_name,created_at,started_at,finished_at,worker_id')
    .eq('space', s.orgId ?? `u:${s.userId}`).order('created_at', { ascending: false }).limit(limit)
  if (error) return missing(error.message) ? null : []
  return (data ?? []) as ServerRun[]
}

export async function fetchServerLogs(runId: string, afterId = 0): Promise<ServerLog[]> {
  const { data } = await supabase.from('irt_server_logs').select('id,at,line').eq('run_id', runId).gt('id', afterId).order('id').limit(500)
  return (data ?? []) as ServerLog[]
}

/** Arrêt demandé : le serveur termine le post en cours puis s'arrête (une session en attente est annulée tout de suite). */
export async function cancelServerRun(r: ServerRun): Promise<void> {
  if (r.status === 'queued') await supabase.from('irt_server_runs').update({ status: 'cancelled', cancel_requested: true, finished_at: new Date().toISOString() }).eq('id', r.id).eq('status', 'queued')
  else await supabase.from('irt_server_runs').update({ cancel_requested: true }).eq('id', r.id)
}
