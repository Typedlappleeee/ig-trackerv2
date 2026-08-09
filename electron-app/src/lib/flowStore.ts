// Stockage Supabase des automatisations (workshop). Même format `Flow` que les
// flows officiels → joué par le même interpréteur. Visibilité : privé / agence /
// communauté (partagé à tous). RLS : chacun n'écrit que ses propres flows.
import { supabase } from './supabase'
import type { Flow, Step, FlowInput } from './flowRunner'

export type Visibility = 'private' | 'org' | 'community'
export interface StoredFlow extends Flow {
  visibility: Visibility
  ownerId?: string
  installs?: number
  mine?: boolean
}

export function newFlowId(): string {
  const hex = Array.from({ length: 10 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
  return `user-${hex}`
}

interface Row {
  id: string; user_id: string; org_id: string | null; name: string; description: string | null
  app: string | null; steps: Step[] | null; inputs: FlowInput[] | null; visibility: Visibility
  official: boolean | null; installs: number | null
}
function rowToFlow(r: Row, uid: string): StoredFlow {
  return {
    id: r.id, name: r.name, description: r.description ?? undefined, app: r.app ?? undefined,
    steps: r.steps ?? [], inputs: r.inputs ?? [], official: r.official ?? false,
    visibility: r.visibility, ownerId: r.user_id, installs: r.installs ?? 0, mine: r.user_id === uid,
  }
}

// Mes automatisations (créées par moi).
export async function listMyFlows(uid: string): Promise<StoredFlow[]> {
  const { data } = await supabase.from('automation_flows').select('*').eq('user_id', uid).order('updated_at', { ascending: false })
  return (data as Row[] | null ?? []).map(r => rowToFlow(r, uid))
}

// Automatisations partagées par la communauté (classées par popularité).
export async function listCommunityFlows(uid: string): Promise<StoredFlow[]> {
  const { data } = await supabase.from('automation_flows').select('*').eq('visibility', 'community').order('installs', { ascending: false }).limit(100)
  return (data as Row[] | null ?? []).map(r => rowToFlow(r, uid)).filter(f => !f.mine) // les miennes sont déjà listées ailleurs
}

// Crée/met à jour un flow (le mien).
export async function upsertFlow(flow: Flow, opts: { userId: string; orgId: string | null; visibility: Visibility }): Promise<{ ok: boolean; error?: string }> {
  const row = {
    id: flow.id, user_id: opts.userId, org_id: opts.orgId, name: flow.name,
    description: flow.description ?? null, app: flow.app ?? null,
    steps: flow.steps, inputs: flow.inputs ?? [], visibility: opts.visibility,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('automation_flows').upsert(row, { onConflict: 'id' })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function deleteFlow(id: string): Promise<void> {
  await supabase.from('automation_flows').delete().eq('id', id)
}
export async function setVisibility(id: string, visibility: Visibility): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('automation_flows').update({ visibility }).eq('id', id)
  return error ? { ok: false, error: error.message } : { ok: true }
}
// Incrémente le compteur d'installs d'un flow communautaire (RPC security-definer).
export async function bumpInstalls(id: string): Promise<void> {
  await supabase.rpc('bump_flow_installs', { flow_id: id })
}
