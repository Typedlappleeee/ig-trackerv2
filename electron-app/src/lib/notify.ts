/**
 * Client-side notification sender. Loads the owner's notification_settings
 * (org_config or app_config) and fans out via the /api/notify proxy.
 * Best-effort: never throws, silently no-ops if nothing is configured or the
 * event is disabled.
 */
import { supabase } from './supabase'

export async function sendNotification(opts: {
  userId: string
  orgId: string | null
  event: string
  subject: string
  message: string
}): Promise<void> {
  try {
    const table  = opts.orgId ? 'org_config' : 'app_config'
    const keyCol = opts.orgId ? 'org_id' : 'user_id'
    const keyVal = opts.orgId ?? opts.userId
    const { data } = await supabase.from(table).select('notification_settings').eq(keyCol, keyVal).maybeSingle()
    const s = data?.notification_settings as { events?: Record<string, boolean> } | null
    if (!s || Object.keys(s).length === 0) return
    if (s.events && s.events[opts.event] === false) return
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: s, subject: opts.subject, message: opts.message }),
    }).catch(() => {})
  } catch { /* best-effort */ }
}
