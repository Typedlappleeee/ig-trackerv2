import { supabase } from './supabase'
import { registerStartedPhones } from './phoneWatch'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScheduledPhoneRecord {
  id:          string
  geelark_id:  string
  phone_name:  string
  ig_username: string | null
  // Story scheduling (type === 'story') — per-phone assignment frozen at creation
  story_photo?:      string   // signed URL of the image (6-month TTL)
  story_photo_name?: string
  story_link?:       string
  story_text?:       string
}

export interface ScheduledVideoRecord {
  token: string
  title: string
  // Légende propre à la vidéo (description de banque) — prioritaire sur la
  // légende globale du post. Absente → repli sur post.caption.
  desc?:           string
  // Usage unique : référence banque à supprimer après publication réussie.
  bank_id?:        string
  storage_path?:   string | null
  thumbnail_path?: string | null
  remove?:         boolean
}

export type ScheduleStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
export type PostingType    = 'posting' | 'mass_posting' | 'story'

export interface ScheduledPost {
  id:              string
  user_id:         string
  org_id:          string | null
  created_by_name: string
  type:            PostingType
  status:          ScheduleStatus
  scheduled_at:    string
  phones:          ScheduledPhoneRecord[]
  videos:          ScheduledVideoRecord[]
  caption:         string
  delay_minutes:   number
  mode:            'seq' | 'random'
  bearer_token:    string
  reels_trial:     boolean
  // Proxy rotatif : rote l'IP avant de démarrer/poster (comme le toggle du Posting).
  rotating_proxy:  boolean
  recur_hours:     number | null
  platform?:       'instagram' | 'tiktok'
  result:          { logs?: string[]; phone_results?: PhoneResult[] } | null
  error_msg:       string | null
  created_at:      string
  executed_at:     string | null
}

// Résultat par téléphone d'une exécution — permet d'afficher dans l'historique
// quels comptes ont marché / échoué en cliquant sur une tâche.
export interface PhoneResult {
  name:   string
  ok:     boolean
  error?: string
}

// Fusionne les résultats par téléphone dans scheduled_posts.result (garde les logs).
export async function persistPhoneResults(postId: string, phoneResults: PhoneResult[]): Promise<void> {
  if (!phoneResults.length) return
  try {
    const { data } = await supabase.from('scheduled_posts').select('result').eq('id', postId).maybeSingle()
    const prev = (data?.result ?? {}) as Record<string, unknown>
    await supabase.from('scheduled_posts')
      .update({ result: { ...prev, phone_results: phoneResults } })
      .eq('id', postId)
  } catch { /* best-effort */ }
}

export interface CreateScheduledPostInput {
  userId:          string
  orgId:           string | null
  createdByName:   string
  type:            PostingType
  scheduledAt:     Date
  phones:          ScheduledPhoneRecord[]
  videos:          ScheduledVideoRecord[]
  caption:         string
  delayMinutes:    number
  mode:            'seq' | 'random'
  bearerToken:     string
  reelsTrial:      boolean
  rotatingProxy?:  boolean
  recurHours?:     number | null
  platform?:       'instagram' | 'tiktok'
}

// ── DB operations ──────────────────────────────────────────────────────────────

export async function createScheduledPost(input: CreateScheduledPostInput): Promise<ScheduledPost> {
  const { data, error } = await supabase.from('scheduled_posts').insert({
    user_id:          input.userId,
    org_id:           input.orgId,
    created_by_name:  input.createdByName,
    type:             input.type,
    status:           'pending',
    scheduled_at:     input.scheduledAt.toISOString(),
    phones:           input.phones,
    videos:           input.videos,
    caption:          input.caption,
    delay_minutes:    input.delayMinutes,
    mode:             input.mode,
    // Never persist the GeeLark token in the row — anyone with read access to
    // scheduled_posts (org members) would see it. It is resolved at execution
    // time from org_config / app_config instead.
    bearer_token:     '',
    reels_trial:      input.reelsTrial,
    rotating_proxy:   input.rotatingProxy ?? false,
    recur_hours:      input.recurHours ?? null,
    platform:         input.platform ?? 'instagram',
  }).select().single()
  if (error) throw new Error(error.message)
  const d = data as any
  // Normalise les jsonb en tableaux (évite un crash si renvoyés en string).
  const arr = (v: unknown): any[] => Array.isArray(v) ? v : (typeof v === 'string' ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } })() : [])
  return { ...d, phones: arr(d.phones), videos: arr(d.videos) } as ScheduledPost
}

// Resolves the GeeLark bearer at execution time. Falls back to the token
// stored in the row for posts created before this change.
export async function resolveBearerToken(post: ScheduledPost): Promise<string> {
  if (post.org_id) {
    const { data } = await supabase.from('org_config')
      .select('bearer_token').eq('org_id', post.org_id).maybeSingle()
    if (data?.bearer_token) return data.bearer_token
  }
  const { data } = await supabase.from('app_config')
    .select('bearer_token').eq('user_id', post.user_id).maybeSingle()
  if (data?.bearer_token) return data.bearer_token
  return post.bearer_token || ''
}

// Cancels a post. Pending posts are refunded (credits were deducted at
// scheduling time); running posts are stoppable but NOT refunded — the work
// is already happening.
export async function cancelScheduledPost(
  id: string,
  refundOwnerId?: string,
): Promise<{ refunded: number }> {
  // Phase 1: cancel while still pending → refund
  const { data: pendingRows } = await supabase.from('scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', id).eq('status', 'pending')
    .select('type, phones')
  if (pendingRows?.length) {
    const row = pendingRows[0] as { type: string; phones: unknown }
    const phones = (typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones) as unknown[]
    if (refundOwnerId) {
      const { scheduledPostCost, refundCredits } = await import('./credits')
      const amount = scheduledPostCost(row.type, phones?.length ?? 0)
      const ok = await refundCredits(refundOwnerId, amount)
      return { refunded: ok ? amount : 0 }
    }
    return { refunded: 0 }
  }
  // Phase 2: post already running (stuck, app closed mid-run) — stop it, no refund
  await supabase.from('scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', id).eq('status', 'running')
  return { refunded: 0 }
}

// Self-healing for posts stuck in 'running' (app closed mid-execution).
// Primary signal: heartbeat — a live execution updates heartbeat_at every 60 s,
// so anything without a beat for 5 min is dead, regardless of type or duration.
// Fallback (heartbeat column not migrated, or pre-migration rows with null
// heartbeat): fixed windows — 30 min for posts, 6 h for stories (sequential
// UI automation with delays can legitimately run for hours).
export async function failStaleRunningPosts(maxAgeMin = 30): Promise<number> {
  const errorMsg = "Interrompu — l'application a été fermée pendant l'exécution"
  const beatCutoff = new Date(Date.now() - 5 * 60_000).toISOString()

  // Heartbeat-based heal (precise) — ignore errors if the column doesn't exist yet
  let healed = 0
  try {
    const { data, error } = await supabase.from('scheduled_posts')
      .update({ status: 'failed', error_msg: errorMsg })
      .eq('status', 'running')
      .lt('heartbeat_at', beatCutoff)
      .select('id')
    if (!error) healed += data?.length ?? 0
  } catch { /* column not migrated yet */ }

  // Window-based fallback — only for rows WITHOUT a heartbeat (a live beat
  // means the execution is alive no matter how long it runs). If the column
  // isn't migrated yet, retry without the heartbeat filter (old behaviour).
  const cutoff      = new Date(Date.now() - maxAgeMin * 60_000).toISOString()
  const storyCutoff = new Date(Date.now() - 6 * 60 * 60_000).toISOString()
  const windowHeal = async (storyType: boolean, c: string, withBeatFilter: boolean) => {
    let q = supabase.from('scheduled_posts')
      .update({ status: 'failed', error_msg: errorMsg })
      .eq('status', 'running')
    q = storyType ? q.eq('type', 'story') : q.neq('type', 'story')
    if (withBeatFilter) q = q.is('heartbeat_at', null)
    const { data, error } = await q
      .or(`executed_at.lt.${c},and(executed_at.is.null,created_at.lt.${c})`)
      .select('id')
    if (error && withBeatFilter) return windowHeal(storyType, c, false)
    return data?.length ?? 0
  }
  const [a, b] = await Promise.all([
    windowHeal(false, cutoff, true),
    windowHeal(true, storyCutoff, true),
  ])
  return healed + a + b
}

// Keeps a 'running' post visibly alive: updates heartbeat_at every 60 s.
// Returns a stop() function. Failures are silent (column may not exist yet).
export function startHeartbeat(postId: string): () => void {
  const beat = () => {
    supabase.from('scheduled_posts')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('id', postId).eq('status', 'running')
      .then(() => {}, () => {})
  }
  beat()
  const timer = setInterval(beat, 60_000)
  return () => clearInterval(timer)
}

// Loads all posts visible to the user (RLS handles org filtering)
export async function loadScheduledPosts(): Promise<ScheduledPost[]> {
  const { data } = await supabase.from('scheduled_posts')
    .select('*')
    .order('scheduled_at', { ascending: false })
    .limit(200)
  // Défensif : normalise les colonnes jsonb en tableaux. Si une ligne arrive avec
  // phones/videos en STRING (réplication realtime, données legacy), un `.map`/
  // `.some` plus loin ferait planter tout l'onglet Programmation.
  const asArray = (v: unknown): any[] => {
    if (Array.isArray(v)) return v
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
    return []
  }
  return (data ?? []).map((r: any) => ({ ...r, phones: asArray(r.phones), videos: asArray(r.videos) })) as ScheduledPost[]
}

// Charge les Mass Posting lancés À LA MAIN (table post_runs) et les convertit en
// « posts » terminés pour qu'ils apparaissent aussi dans le calendrier, à leur
// heure de lancement. Read-only : id préfixé « run- » → aucune action possible.
export async function loadManualRuns(): Promise<ScheduledPost[]> {
  const { data, error } = await supabase.from('post_runs')
    .select('id, user_id, org_id, type, ok_count, err_count, total, phone_results, created_at')
    .in('type', ['mass_posting', 'tiktok'])
    .order('created_at', { ascending: false })
    .limit(400)
  if (error || !data) return []
  return data.map((r: Record<string, unknown>) => {
    const results = (r['phone_results'] as PhoneResult[] | null) ?? []
    const total   = Number(r['total'] ?? results.length ?? 0)
    const phones: ScheduledPhoneRecord[] = results.length
      ? results.map((pr, i) => ({ id: `run-${r['id']}-${i}`, geelark_id: '', phone_name: pr.name, ig_username: pr.name }))
      : Array.from({ length: total }, (_, i) => ({ id: `run-${r['id']}-${i}`, geelark_id: '', phone_name: '', ig_username: null }))
    const okCount  = Number(r['ok_count'] ?? 0)
    const errCount = Number(r['err_count'] ?? 0)
    const status: ScheduleStatus = okCount === 0 && errCount > 0 ? 'failed' : 'done'
    const createdAt = String(r['created_at'])
    return {
      id:              `run-${r['id']}`,
      user_id:         String(r['user_id'] ?? ''),
      org_id:          (r['org_id'] as string | null) ?? null,
      created_by_name: 'Manuel',
      type:            'mass_posting',
      status,
      scheduled_at:    createdAt,
      phones,
      videos:          [],
      caption:         '',
      delay_minutes:   0,
      mode:            'seq',
      bearer_token:    '',
      reels_trial:     false,
      rotating_proxy:  false,
      recur_hours:     null,
      platform:        r['type'] === 'tiktok' ? 'tiktok' : 'instagram',
      result:          results.length ? { phone_results: results } : null,
      error_msg:       null,
      created_at:      createdAt,
      executed_at:     createdAt,
    } as ScheduledPost
  })
}

// True si le post vient d'un run manuel (post_runs) → lecture seule dans l'agenda.
export function isManualRun(post: { id: string }): boolean {
  return post.id.startsWith('run-')
}

// Atomic claim: returns true if this process successfully claimed the post.
// Prevents double-execution if both the app and the edge function try to run it.
export async function claimScheduledPost(id: string): Promise<boolean> {
  const { data } = await supabase.from('scheduled_posts')
    .update({ status: 'running', executed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending')
    .select('id')
  return (data?.length ?? 0) > 0
}

export async function finishScheduledPost(
  id: string, success: boolean, logs: string[], errorMsg?: string
): Promise<void> {
  // Préserve les résultats par téléphone déjà écrits (persistPhoneResults).
  let phoneResults: PhoneResult[] | undefined
  try {
    const { data } = await supabase.from('scheduled_posts').select('result').eq('id', id).maybeSingle()
    phoneResults = (data?.result as { phone_results?: PhoneResult[] } | null)?.phone_results
  } catch { /* ignore */ }
  await supabase.from('scheduled_posts').update({
    status:    success ? 'done' : 'failed',
    result:    { logs, ...(phoneResults ? { phone_results: phoneResults } : {}) },
    error_msg: errorMsg ?? null,
  }).eq('id', id)
}

// ── Execution (app-side, uses Electron IPC for GeeLark) ───────────────────────

const GEELARK = 'https://openapi.geelark.com/open/v1'

async function gPost(bearer: string, path: string, body: unknown) {
  const r = await window.electronAPI!.geelarkRequest({
    method: 'POST', url: `${GEELARK}${path}`,
    headers: { Authorization: `Bearer ${bearer}` }, body,
  })
  return (r.data ?? {}) as Record<string, unknown>
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

// Story execution: drives Instagram via UI automation, one phone at a time.
// Runs only app-side (the edge function skips type='story' — ADB automation
// takes ~2 min per phone, far beyond serverless time limits).
async function executeScheduledStory(
  post: ScheduledPost,
  bearer: string,
  onLog: (msg: string) => void,
): Promise<boolean> {
  const { postInstagramStory, stopPhone } = await import('./geelark')
  const { loadProxyRotation } = await import('./proxyRotation')
  // Rotation d'IP uniquement si le post a le toggle « Proxy rotatif » activé.
  const rotationUrls = post.rotating_proxy
    ? (await loadProxyRotation(post.org_id ?? null, post.user_id)
        .then(c => c.enabled ? c.urls.filter(u => /^https?:\/\//i.test(u.trim())) : [])
        .catch(() => []))
    : []
  const phones = (typeof post.phones === 'string'
    ? JSON.parse(post.phones as unknown as string)
    : post.phones) as ScheduledPhoneRecord[]

  let okCount = 0
  const phoneResults: PhoneResult[] = []
  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i]
    const name = phone.ig_username ?? phone.phone_name
    if (!phone.story_photo || !phone.story_link) {
      onLog(`⚠ ${name} : assignation incomplète (photo ou lien manquant) — ignoré`)
      phoneResults.push({ name, ok: false, error: 'Assignation incomplète (photo ou lien manquant)' })
      continue
    }
    if (i > 0 && post.delay_minutes > 0) {
      onLog(`⏳ Délai ${post.delay_minutes} min avant le compte suivant…`)
      await sleep(post.delay_minutes * 60_000)
    }
    onLog(`▶ Story sur ${name}…`)
    try {
      const res = await postInstagramStory(
        bearer, phone.geelark_id,
        { imageUrl: phone.story_photo, linkUrl: phone.story_link, linkText: phone.story_text || undefined, rotationUrls },
        m => onLog(`   ${m}`),
      )
      if (res.ok) { okCount++; onLog(`✅ Story publiée : ${name}`); phoneResults.push({ name, ok: true }) }
      else { onLog(`❌ Échec (${name}) : ${res.error ?? 'inconnu'}`); phoneResults.push({ name, ok: false, error: res.error ?? 'inconnu' }) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onLog(`❌ Erreur (${name}) : ${msg}`)
      phoneResults.push({ name, ok: false, error: msg })
    } finally {
      await stopPhone(bearer, phone.geelark_id).catch(() => {})
    }
  }
  await persistPhoneResults(post.id, phoneResults)
  onLog(okCount > 0
    ? `✅ Terminé : ${okCount}/${phones.length} story(s) publiée(s)`
    : '❌ Aucune story publiée')
  return okCount > 0
}

export async function executeScheduledPost(
  post: ScheduledPost,
  onLog: (msg: string) => void,
): Promise<boolean> {
  const stopBeat = startHeartbeat(post.id)
  try {
    return await executeScheduledPostInner(post, onLog)
  } finally {
    stopBeat()
  }
}

async function executeScheduledPostInner(
  post: ScheduledPost,
  onLog: (msg: string) => void,
): Promise<boolean> {
  const { caption, delay_minutes, mode, reels_trial } = post
  const bearer = await resolveBearerToken(post)
  if (!bearer) {
    onLog('❌ Aucun token GéeLark configuré — ajoute-le dans Paramètres → Connexions')
    return false
  }

  if (post.type === 'story') return executeScheduledStory(post, bearer, onLog)

  // Rotation d'IP (reels programmés) : uniquement si le toggle « Proxy rotatif »
  // du post est activé — sinon comportement normal (démarrage groupé).
  const reelsRotationUrls = post.rotating_proxy
    ? await (await import('./proxyRotation'))
        .loadProxyRotation(post.org_id ?? null, post.user_id)
        .then(c => c.enabled ? c.urls.filter(u => /^https?:\/\//i.test(u.trim())) : [])
        .catch(() => [])
    : []

  // Supabase Realtime can deliver jsonb columns as strings — parse defensively
  const allPhones = (typeof post.phones === 'string'
    ? JSON.parse(post.phones as unknown as string)
    : post.phones) as ScheduledPhoneRecord[]
  const videos = (typeof post.videos === 'string'
    ? JSON.parse(post.videos as unknown as string)
    : post.videos) as ScheduledVideoRecord[]

  // Reprise : si le serveur (proxy rotatif) a déjà traité des téléphones et remis
  // le post en pending, on saute ceux-là pour ne pas re-poster (anti-doublon).
  const doneFromServer = new Set<string>(((post.result as any)?.reels_progress?.done as string[] | undefined) ?? [])
  const phones = doneFromServer.size ? allPhones.filter(p => !doneFromServer.has(p.geelark_id)) : allPhones
  if (phones.length === 0) {
    onLog('✅ Tous les téléphones ont déjà été traités (rien à reprendre).')
    return true
  }

  const geelarkIds = phones.map(p => p.geelark_id)
  const isTikTok = post.platform === 'tiktok'
  // Rotation d'IP active (reels IG) → on démarre les tél 1 par 1, en rotant l'IP
  // AVANT d'allumer chacun (il boote sur l'IP fraîche). Sinon comportement normal.
  const serialRotate = !isTikTok && reelsRotationUrls.length > 0

  try {
    // 1. Start phones (en mode rotation, le démarrage se fait 1 par 1 dans la boucle)
    if (!serialRotate) {
      onLog(`▶ Démarrage de ${phones.length} téléphone(s)…`)
      const startRes = await gPost(bearer, '/phone/start', { ids: geelarkIds }) as any
      if (startRes.code !== 0) onLog(`⚠ Le démarrage des téléphones a échoué${startRes.msg ? ` : ${startRes.msg}` : ''}`)
    } else {
      onLog(`▶ Mode rotation d'IP : démarrage séquentiel (1 tél à la fois, IP fraîche par tél)`)
    }

    // Safety net: immediately store phone IDs + a scheduled stop time in the DB.
    // If this client session dies before reaching the stop step (app closed, crash,
    // tab refreshed…), the server-side sweep (1ter) will call /phone/stop at
    // safetyStopAt — preventing phones from running indefinitely and billing forever.
    // safetyStopAt = last-phone delay + 5 min buffer.
    // En mode rotation série, chaque tél ajoute ~2 min (rotation + boot + post),
    // donc on étend le filet pour ne pas couper le run en plein milieu.
    const safetyOffsetMs = (phones.length - 1) * delay_minutes * 60_000 + 5 * 60_000
      + (serialRotate ? phones.length * 120_000 : 0)
    supabase.from('scheduled_posts').update({
      result:         { geelark_ids: geelarkIds, geelark_task_ids: [] },
      stop_phones_at: new Date(Date.now() + safetyOffsetMs).toISOString(),
      stop_phone_ids: geelarkIds,
    }).eq('id', post.id).then(() => {}, () => {}) // fire-and-forget
    // Garde-fou watchdog : inscrit ces téléphones (démarrés par l'automation) avec
    // la même heure-limite que le filet stop_phones_at.
    registerStartedPhones(geelarkIds, { orgId: post.org_id ?? null, userId: post.user_id }, {
      stopAt: new Date(Date.now() + safetyOffsetMs), reason: 'scheduler',
    })

    // 2. Wait for boot (en mode rotation, le boot se fait 1 par 1 dans la boucle)
    if (!serialRotate) {
      onLog('⏳ Boot téléphones (30s)…')
      await sleep(30_000)
    }

    // 3. Create RPA tasks
    onLog('📤 Envoi des tâches de posting…')
    const taskIds: string[] = []
    let failedCount = 0
    // Résultats par téléphone (historique cliquable). taskPhoneName : taskId → compte.
    const phoneResults: PhoneResult[] = []
    const taskPhoneName = new Map<string, string>()
    const nameOf = (p: ScheduledPhoneRecord) => p.ig_username ?? p.phone_name

    if (isTikTok) {
      // TikTok : un seul /task/add (taskType:1) qui batch tous les comptes.
      const now = Math.floor(Date.now() / 1000)
      const list = phones.map((phone, i) => {
        const videoIdx = mode === 'random' ? Math.floor(Math.random() * videos.length) : i % videos.length
        return { scheduleAt: now + i * delay_minutes * 60, envId: phone.geelark_id, video: videos[videoIdx].token, videoDesc: (videos[videoIdx].desc?.trim() || caption) }
      })
      const res = await gPost(bearer, '/task/add', { taskType: 1, list }) as any
      const ids: string[] = res?.data?.taskIds ?? []
      if (res.code === 0 && Array.isArray(ids) && ids.length > 0) {
        taskIds.push(...ids)
        ids.forEach((tid, idx) => { if (phones[idx]) taskPhoneName.set(tid, nameOf(phones[idx])) })
        onLog(`✅ ${ids.length} tâche(s) TikTok créée(s)`)
      } else {
        failedCount = phones.length
        phones.forEach(p => phoneResults.push({ name: nameOf(p), ok: false, error: `Tâche refusée: ${res.msg ?? res.code}` }))
        onLog(`❌ TikTok a refusé les publications${res.msg ? ` : ${res.msg}` : ''}`)
      }
    } else {
      for (let i = 0; i < phones.length; i++) {
        const phone = phones[i]
        if (i > 0 && delay_minutes > 0) {
          onLog(`⏳ Délai ${delay_minutes} min entre comptes…`)
          await sleep(delay_minutes * 60_000)
        }
        const videoIdx = mode === 'random'
          ? Math.floor(Math.random() * videos.length)
          : i % videos.length
        // Mode rotation : 🔄 rote l'IP → 📱 allume CE tél (il boote sur l'IP fraîche)
        // → boot 30s → vérif connexion. Le tél ne touche jamais l'ancienne IP.
        if (serialRotate) {
          const { rotateAllProxies, waitForPhoneConnectivity, getPhonePublicIp } = await import('./geelark')
          onLog(`🔄 Rotation IP avant démarrage (${nameOf(phone)})…`)
          await rotateAllProxies(reelsRotationUrls, m => onLog(`   ${m}`))
          onLog(`▶ Démarrage ${nameOf(phone)}…`)
          const sr = await gPost(bearer, '/phone/start', { ids: [phone.geelark_id] }) as any
          if (sr.code !== 0) onLog(`⚠ Le démarrage de ${nameOf(phone)} a échoué${sr.msg ? ` : ${sr.msg}` : ''}`)
          registerStartedPhones([phone.geelark_id], { orgId: post.org_id ?? null, userId: post.user_id }, {
            stopAt: new Date(Date.now() + 8 * 60_000), reason: 'scheduler',
          })
          onLog('⏳ Boot (30s)…')
          await sleep(30_000)
          await waitForPhoneConnectivity(bearer, phone.geelark_id, m => onLog(`   ${m}`))
          const ip = await getPhonePublicIp(bearer, phone.geelark_id)
          if (ip) onLog(`🌍 IP actuelle (${nameOf(phone)}) : ${ip}`)
        }
        const res = await gPost(bearer, '/rpa/task/instagramPubReels', {
          id:          phone.geelark_id,
          scheduleAt:  Math.floor(Date.now() / 1000),
          description: (videos[videoIdx].desc?.trim() || caption),
          video:       [videos[videoIdx].token],
          ...(reels_trial ? { shareType: 2 } : {}),
        }) as any
        const taskId = res.data?.id ?? res.data?.taskId ?? res.taskId ?? res.id ?? null
        if (res.code === 0) {
          if (taskId) { taskIds.push(taskId); taskPhoneName.set(taskId, nameOf(phone)) }
          onLog(`✅ Tâche créée : ${nameOf(phone)}`)
        } else {
          failedCount++
          phoneResults.push({ name: nameOf(phone), ok: false, error: `Tâche refusée: ${res.msg ?? res.code}` })
          onLog(`❌ Publication refusée (${nameOf(phone)})${res.msg ? ` : ${res.msg}` : ''}`)
        }
      }
    }

    // Persist actual task IDs now that we have them — if app dies before step 5
    // the sweep (1ter) can query GeeLark and mark the post done/failed correctly.
    supabase.from('scheduled_posts').update({
      result: { geelark_ids: geelarkIds, geelark_task_ids: taskIds },
    }).eq('id', post.id).then(() => {}, () => {})

    // 4. Poll until done (max 10 min)
    let pollSuccessCount = 0
    let pollFailCount = 0
    if (taskIds.length > 0) {
      onLog('⏳ Attente de complétion…')
      let elapsed = 0
      const pending = new Set(taskIds)
      while (pending.size > 0 && elapsed < 10 * 60_000) {
        await sleep(15_000)
        elapsed += 15_000
        const q = await gPost(bearer, '/task/query', { ids: [...pending] }) as any
        const d = (q.data ?? q) as any
        const items: any[] = d.items ?? d.list ?? d.tasks ?? d.records ?? []
        for (const it of items) {
          const tid = it.id ?? it.taskId
          const st  = Number(it.status)
          const nm  = taskPhoneName.get(tid) ?? tid
          if (st === 3) { pollSuccessCount++; onLog(`✅ Succès : ${nm}`); pending.delete(tid); phoneResults.push({ name: nm, ok: true }) }
          else if (st === 4) { pollFailCount++; onLog(`❌ Publication échouée : ${nm}${it.failDesc ? ` (${it.failDesc})` : ''}`); pending.delete(tid); phoneResults.push({ name: nm, ok: false, error: it.failDesc ?? 'Échec GeeLark' }) }
          else if ([7, 8].includes(st)) { pollFailCount++; onLog(`🚫 Annulé : ${nm}`); pending.delete(tid); phoneResults.push({ name: nm, ok: false, error: 'Annulé' }) }
        }
      }
      // Tâches non confirmées avant le timeout → marquées incertaines (échec).
      for (const tid of pending) {
        phoneResults.push({ name: taskPhoneName.get(tid) ?? tid, ok: false, error: 'Non confirmé (timeout)' })
      }
      if (pending.size > 0) onLog(`⏳ ${pending.size} tâche(s) toujours en attente après timeout`)
    }
    await persistPhoneResults(post.id, phoneResults)

    // 4bis. Marge d'upload — l'RPA passe « done » dès qu'il a appuyé sur Partager,
    // mais Instagram continue d'uploader le reel en arrière-plan. Sans cette pause,
    // on éteignait le téléphone au bout d'~1 min → l'upload était coupé et le reel
    // ne partait pas. On patiente 2 min pour laisser l'envoi se terminer.
    if (pollSuccessCount > 0) {
      onLog("⏳ Marge d'upload (2 min) avant l'arrêt des téléphones…")
      await sleep(120_000)
    }

    // 5. Stop phones
    onLog('⏹ Arrêt des téléphones…')
    await gPost(bearer, '/phone/stop', { ids: geelarkIds })
    // Clear the safety stop — phones are stopped, sweep no longer needed.
    supabase.from('scheduled_posts').update({ stop_phones_at: null, stop_phone_ids: null })
      .eq('id', post.id).then(() => {}, () => {})

    // Usage unique : supprime de la banque les vidéos marquées `remove` si au moins
    // un post a réussi (Bank uniquement — storage_path présent).
    if (pollSuccessCount > 0) {
      const toRemove = videos.filter(v => v.remove && v.storage_path)
      if (toRemove.length) {
        try {
          const ids = toRemove.map(v => v.bank_id).filter(Boolean) as string[]
          if (ids.length) {
            const base = supabase.from('content_bank').delete().in('id', ids)
            await (post.org_id ? (base as any).eq('org_id', post.org_id) : (base as any).eq('user_id', post.user_id).is('org_id', null))
          }
          const { deleteStorageObjects } = await import('./storage')
          await deleteStorageObjects(toRemove.flatMap(v => [v.storage_path, v.thumbnail_path]))
          onLog(`🗑️ ${toRemove.length} vidéo(s) retirée(s) de la banque (usage unique)`)
        } catch (e) {
          onLog(`⚠ Impossible de retirer les vidéos de la banque`)
        }
      }
    }

    const totalFailed = failedCount + pollFailCount
    const totalOk = phones.length - failedCount + pollSuccessCount - (taskIds.length - pollSuccessCount - pollFailCount)
    if (totalFailed > 0 && failedCount >= phones.length) {
      onLog(`❌ Toutes les tâches ont échoué (${totalFailed}/${phones.length})`)
      return false
    } else if (totalFailed > 0) {
      onLog(`⚠ Partiel : ${totalFailed} tâche(s) échouée(s) sur ${phones.length}`)
      return true
    }
    onLog('✅ Post programmé exécuté avec succès !')
    return true
  } catch (err: any) {
    onLog(`❌ Erreur : ${err.message}`)
    await gPost(bearer, '/phone/stop', { ids: geelarkIds }).catch(() => {})
    supabase.from('scheduled_posts').update({ stop_phones_at: null, stop_phone_ids: null })
      .eq('id', post.id).then(() => {}, () => {})
    return false
  }
}

// ── Time helpers ───────────────────────────────────────────────────────────────

// Format for display (local time)
export function fmtScheduledTime(iso: string): string {
  const d = new Date(iso)
  // Décalage local lisible (« UTC+1 ») pour lever toute ambiguïté de fuseau
  const offMin = -d.getTimezoneOffset()
  const sign   = offMin >= 0 ? '+' : '−'
  const hours  = Math.abs(offMin) / 60
  const tz     = `UTC${sign}${Number.isInteger(hours) ? hours : hours.toFixed(1)}`
  return `${d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} (${tz})`
}

// Default value for <input type="datetime-local"> (local time, N min from now)
export function defaultSchedValue(minutesFromNow = 60): string {
  const d   = new Date(Date.now() + minutesFromNow * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Human-readable countdown
export function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0)                        return 'maintenant'
  const m = Math.floor(diff / 60_000)
  if (m < 60)                           return `dans ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)                           return `dans ${h}h${m % 60 ? ` ${m % 60}min` : ''}`
  const d = Math.floor(h / 24)
  return `dans ${d}j${h % 24 ? ` ${h % 24}h` : ''}`
}
