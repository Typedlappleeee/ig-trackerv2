// Gestion des connexions Google Drive (modèle compte de service).
//
// L'utilisateur partage son dossier Drive avec l'email du compte de service,
// puis enregistre l'ID du dossier ici. La synchro réelle (download → upload
// Supabase → insertion banque) est faite côté serveur par l'edge function
// `sync-drive` (cron horaire). On peut aussi la déclencher à la demande.

import { supabase } from './supabase'
import type { DriveConnection } from './supabase'

export interface UpsertDriveConnectionInput {
  id?:           string
  user_id:       string
  org_id:        string | null
  name:          string
  folder_id:     string
  target_folder: string | null
  recursive:     boolean
}

// Accepte soit un ID de dossier brut, soit une URL Drive (.../folders/<id>?...).
export function parseDriveFolderId(input: string): string {
  const s = input.trim()
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  const open = s.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (open) return open[1]
  return s
}

export async function listDriveConnections(opts: { orgId: string | null; userId: string }): Promise<DriveConnection[]> {
  let q = supabase.from('drive_connections').select('*').order('created_at', { ascending: false })
  q = opts.orgId ? q.eq('org_id', opts.orgId) : q.eq('user_id', opts.userId).is('org_id', null)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as DriveConnection[]
}

export async function saveDriveConnection(input: UpsertDriveConnectionInput): Promise<DriveConnection> {
  const row = {
    user_id:       input.user_id,
    org_id:        input.org_id,
    name:          input.name.trim() || 'Google Drive',
    folder_id:     parseDriveFolderId(input.folder_id),
    target_folder: input.target_folder,
    recursive:     input.recursive,
    status:        'active' as const,
    updated_at:    new Date().toISOString(),
  }
  const query = input.id
    ? supabase.from('drive_connections').update(row).eq('id', input.id).select().single()
    : supabase.from('drive_connections').insert(row).select().single()
  const { data, error } = await query
  if (error) throw error
  return data as DriveConnection
}

export async function setDriveConnectionStatus(id: string, status: 'active' | 'paused'): Promise<void> {
  const { error } = await supabase.from('drive_connections')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteDriveConnection(id: string): Promise<void> {
  const { error } = await supabase.from('drive_connections').delete().eq('id', id)
  if (error) throw error
}

export interface SyncResult {
  connections: number
  imported:    number
  errors:      string[]
}

// Déclenche la synchro côté serveur pour les connexions de l'utilisateur courant.
export async function triggerDriveSync(): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke('sync-drive', { body: {} })
  if (error) throw error
  return data as SyncResult
}
