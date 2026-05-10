/**
 * Background IG-stats refresh singleton.
 * Runs every 5 minutes, survives page navigation.
 */
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

type Phone = { id: string; ig_username: string | null; ig_sessionid: string | null }

let _timer: ReturnType<typeof setInterval> | null = null
let _userId = ''

async function refresh() {
  if (!_userId || !window.electronAPI?.fetchInstagramBySession) return
  const { data: phones } = await supabase
    .from('phones')
    .select('id, ig_username, ig_sessionid')
    .eq('user_id', _userId)

  const targets = (phones ?? []).filter((p: Phone) => p.ig_username && p.ig_sessionid)
  for (const phone of targets) {
    try {
      const r = await window.electronAPI.fetchInstagramBySession({
        username: phone.ig_username!,
        sessionid: phone.ig_sessionid!,
      })
      if (r.ok) {
        await supabase.from('phones').update({
          followers:    r.followers   ?? 0,
          following:    r.following   ?? 0,
          total_views:  r.total_views ?? 0,
          posts:        r.posts       ?? 0,
          bio:          r.bio         ?? null,
          ig_status:    'active',
        }).eq('id', phone.id)
      } else if (r.error === 'session_expired') {
        await supabase.from('phones').update({ ig_status: 'expired' }).eq('id', phone.id)
      } else {
        await supabase.from('phones').update({ ig_status: 'error' }).eq('id', phone.id)
      }
    } catch { /* silent */ }
  }
}

export function initIgStatsPoller(user: User) {
  _userId = user.id
  if (_timer) return  // already running
  _timer = setInterval(refresh, 5 * 60 * 1000)
  // Run immediately after 10s to not block startup
  setTimeout(refresh, 10_000)
}
