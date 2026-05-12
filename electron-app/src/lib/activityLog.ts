import { supabase } from './supabase'

// Logs an action to the activity_logs table (org mode only — silent no-op in solo mode).
export async function logActivity(opts: {
  orgId:     string | null
  userId:    string
  userEmail: string
  action:    string
  details?:  Record<string, unknown>
}): Promise<void> {
  if (!opts.orgId) return
  try {
    await supabase.from('activity_logs').insert({
      org_id:     opts.orgId,
      user_id:    opts.userId,
      user_email: opts.userEmail,
      action:     opts.action,
      details:    opts.details ?? {},
    })
  } catch { /* silent — logs must never break the main flow */ }
}
