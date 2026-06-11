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
import { fetchIgStats } from './instagram'
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
  // Pas de filtre user_id : en mode organisation les téléphones peuvent avoir
  // été synchronisés par un autre membre — la RLS limite déjà la visibilité.
  const { data } = await supabase
    .from('phones')
    .select('id, org_id, ig_username, ig_sessionid')
    .not('ig_username', 'is', null)
  // Le pseudo IG suffit — le sessionid est optionnel (fetch anonyme sinon)
  _queue = ((data ?? []) as Phone[]).filter(p => p.ig_username?.trim())
}

async function writeStats(
  phone: Phone,
  stats: { followers: number; following: number; total_views?: number; posts: number },
  bio: string | null,
) {
  // NB : la table phones n'a pas de colonne `posts` — le compte de posts vit
  // dans video_count. Une colonne inconnue ferait rejeter TOUT l'update.
  const { error } = await supabase.from('phones').update({
    followers:   stats.followers,
    following:   stats.following,
    video_count: stats.posts,
    // total_views omis quand indisponible (mode anonyme) — ne pas écraser
    // une valeur session plus complète par un zéro
    ...(stats.total_views !== undefined ? { total_views: stats.total_views } : {}),
    bio,
    ig_status:   'active',
  }).eq('id', phone.id)
  if (error) console.warn('[igStatsPoller] phones update failed:', error.message)

  // Snapshot d'historique (throttle 1 h par compte). Silencieux si la
  // table n'est pas encore migrée.
  const last = _lastSnapshot.get(phone.id) ?? 0
  if (Date.now() - last > SNAPSHOT_MIN_MS) {
    _lastSnapshot.set(phone.id, Date.now())
    await supabase.from('account_stats_history').insert({
      user_id:     _userId,
      org_id:      phone.org_id,
      phone_id:    phone.id,
      followers:   stats.followers,
      following:   stats.following,
      posts:       stats.posts,
      total_views: stats.total_views ?? 0,
    }).then(() => {}, () => {})
  }
}

async function processOne() {
  if (!_userId || !window.electronAPI) return
  if (_queue.length === 0) {
    await refillQueue()
    if (_queue.length === 0) return
  }
  const phone = _queue.shift()!

  try {
    if (phone.ig_sessionid && window.electronAPI.fetchInstagramBySession) {
      // Mode session : données complètes (vues incluses)
      const r = await window.electronAPI.fetchInstagramBySession({
        username:  phone.ig_username!.replace(/^@/, '').trim(),
        sessionid: phone.ig_sessionid!,
      })
      if (r.ok) {
        await writeStats(phone, {
          followers:   r.followers   ?? 0,
          following:   r.following   ?? 0,
          total_views: r.total_views ?? 0,
          posts:       r.posts       ?? 0,
        }, r.bio ?? null)
        return
      }
      if (r.error === 'session_expired') {
        await supabase.from('phones').update({ ig_status: 'expired' }).eq('id', phone.id)
        // Session morte → tenter quand même le mode anonyme ci-dessous
      } else {
        await supabase.from('phones').update({ ig_status: 'error' }).eq('id', phone.id)
        return
      }
    }

    // Mode anonyme : le pseudo suffit. fetchIgStats enchaîne navigateur caché →
    // API publique → parsing HTML, avec cache 8 min intégré.
    const anon = await fetchIgStats(phone.ig_username!, { force: true })
    if (anon) {
      await writeStats(phone, {
        followers:   anon.followers,
        following:   anon.following,
        // total_views anonyme = somme des ~12 derniers posts seulement —
        // undefined quand vide pour ne pas écraser une valeur session
        total_views: anon.total_views > 0 ? anon.total_views : undefined,
        posts:       anon.posts,
      }, anon.bio || null)
    } else if (!phone.ig_sessionid) {
      await supabase.from('phones').update({ ig_status: 'error' }).eq('id', phone.id)
    }
  } catch (e) {
    console.warn('[igStatsPoller] poll failed for', phone.ig_username, e)
  }
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

let _pollingAll = false

/**
 * Force un passage immédiat sur tous les comptes (bouton « Actualiser » de la
 * page Stats). Espacement court de 2-4 s entre comptes — réservé aux refresh
 * manuels, la rotation de fond reste à ~20 s.
 */
export async function pollAllNow(): Promise<number> {
  if (!_userId || _pollingAll) return 0
  _pollingAll = true
  try {
    await refillQueue()
    let n = 0
    while (_queue.length > 0) {
      await processOne()
      n++
      if (_queue.length > 0) await new Promise(r => setTimeout(r, 2_000 + Math.random() * 2_000))
    }
    return n
  } finally {
    _pollingAll = false
  }
}
