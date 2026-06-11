/**
 * Background IG-stats collector singleton.
 *
 * Architecture « étalée » : au lieu d'une rafale de N requêtes toutes les
 * 5 minutes (pattern que Instagram détecte et rate-limite), on traite UN
 * compte toutes les ~20 s avec un jitter aléatoire, en rotation continue.
 * Même fraîcheur moyenne, zéro pattern.
 *
 * Chaque mise à jour écrit :
 *  - phones (followers, following, total_views, posts, ig_status) → la page
 *    Stats écoute cette table en Realtime, l'UI est donc « live »
 *  - account_stats_history (snapshot max 1×/h par compte) → courbes 7/30 j
 */
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

type Phone = {
  id: string
  org_id: string | null
  ig_username: string | null
  ig_sessionid: string | null
}

const TICK_MS          = 20_000        // un compte toutes les ~20 s
const JITTER_MS        = 8_000         // + jitter aléatoire 0-8 s
const SNAPSHOT_MIN_MS  = 60 * 60_000   // max 1 snapshot d'historique par compte par heure

let _timer: ReturnType<typeof setTimeout> | null = null
let _userId = ''
let _queue: Phone[] = []
let _lastSnapshot = new Map<string, number>()

async function refillQueue() {
  const { data } = await supabase
    .from('phones')
    .select('id, org_id, ig_username, ig_sessionid')
    .eq('user_id', _userId)
  _queue = ((data ?? []) as Phone[]).filter(p => p.ig_username && p.ig_sessionid)
}

async function processOne() {
  if (!_userId || !window.electronAPI?.fetchInstagramBySession) return
  if (_queue.length === 0) {
    await refillQueue()
    if (_queue.length === 0) return
  }
  const phone = _queue.shift()!

  try {
    const r = await window.electronAPI.fetchInstagramBySession({
      username:  phone.ig_username!,
      sessionid: phone.ig_sessionid!,
    })
    if (r.ok) {
      const stats = {
        followers:   r.followers   ?? 0,
        following:   r.following   ?? 0,
        total_views: r.total_views ?? 0,
        posts:       r.posts       ?? 0,
      }
      await supabase.from('phones').update({
        ...stats,
        video_count: stats.posts,   // la page Stats lit video_count
        bio:         r.bio ?? null,
        ig_status:   'active',
      }).eq('id', phone.id)

      // Snapshot d'historique (throttle 1 h par compte). Silencieux si la
      // table n'est pas encore migrée.
      const last = _lastSnapshot.get(phone.id) ?? 0
      if (Date.now() - last > SNAPSHOT_MIN_MS) {
        _lastSnapshot.set(phone.id, Date.now())
        await supabase.from('account_stats_history').insert({
          user_id:  _userId,
          org_id:   phone.org_id,
          phone_id: phone.id,
          ...stats,
        }).then(() => {}, () => {})
      }
    } else if (r.error === 'session_expired') {
      await supabase.from('phones').update({ ig_status: 'expired' }).eq('id', phone.id)
    } else {
      await supabase.from('phones').update({ ig_status: 'error' }).eq('id', phone.id)
    }
  } catch { /* silent */ }
}

function scheduleNext() {
  const delay = TICK_MS + Math.random() * JITTER_MS
  _timer = setTimeout(async () => {
    await processOne()
    scheduleNext()
  }, delay)
}

export function initIgStatsPoller(user: User) {
  _userId = user.id
  if (_timer) return  // already running
  // Premier passage 10 s après le démarrage pour ne pas bloquer le boot
  _timer = setTimeout(async () => {
    await processOne()
    scheduleNext()
  }, 10_000)
}

export function stopIgStatsPoller() {
  if (_timer) { clearTimeout(_timer); _timer = null }
  _queue = []
}
