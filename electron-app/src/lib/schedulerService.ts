import { supabase } from './supabase'

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
  result:          { logs: string[] } | null
  error_msg:       string | null
  created_at:      string
  executed_at:     string | null
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
  }).select().single()
  if (error) throw new Error(error.message)
  return data as ScheduledPost
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

export async function cancelScheduledPost(id: string): Promise<void> {
  // 'running' included: a post stuck in running (app closed mid-execution) must be stoppable
  await supabase.from('scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', id).in('status', ['pending', 'running'])
}

// Self-healing: a post claimed as 'running' whose execution started more than
// maxAgeMin ago can't still be alive (executions cap at ~11 min) — the app was
// closed mid-run. Mark those as failed so they stop showing as "en cours".
// Stories get a much wider window (6 h): sequential UI automation with
// delay_minutes between accounts can legitimately run for hours.
export async function failStaleRunningPosts(maxAgeMin = 30): Promise<number> {
  const cutoff      = new Date(Date.now() - maxAgeMin * 60_000).toISOString()
  const storyCutoff = new Date(Date.now() - 6 * 60 * 60_000).toISOString()
  const errorMsg = "Interrompu — l'application a été fermée pendant l'exécution"
  const [a, b] = await Promise.all([
    supabase.from('scheduled_posts')
      .update({ status: 'failed', error_msg: errorMsg })
      .eq('status', 'running')
      .neq('type', 'story')
      .or(`executed_at.lt.${cutoff},and(executed_at.is.null,created_at.lt.${cutoff})`)
      .select('id'),
    supabase.from('scheduled_posts')
      .update({ status: 'failed', error_msg: errorMsg })
      .eq('status', 'running')
      .eq('type', 'story')
      .or(`executed_at.lt.${storyCutoff},and(executed_at.is.null,created_at.lt.${storyCutoff})`)
      .select('id'),
  ])
  return (a.data?.length ?? 0) + (b.data?.length ?? 0)
}

// Loads all posts visible to the user (RLS handles org filtering)
export async function loadScheduledPosts(): Promise<ScheduledPost[]> {
  const { data } = await supabase.from('scheduled_posts')
    .select('*')
    .order('scheduled_at', { ascending: false })
    .limit(200)
  return (data ?? []) as ScheduledPost[]
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
  await supabase.from('scheduled_posts').update({
    status:    success ? 'done' : 'failed',
    result:    { logs },
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
  const phones = (typeof post.phones === 'string'
    ? JSON.parse(post.phones as unknown as string)
    : post.phones) as ScheduledPhoneRecord[]

  let okCount = 0
  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i]
    const name = phone.ig_username ?? phone.phone_name
    if (!phone.story_photo || !phone.story_link) {
      onLog(`⚠ ${name} : assignation incomplète (photo ou lien manquant) — ignoré`)
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
        { imageUrl: phone.story_photo, linkUrl: phone.story_link, linkText: phone.story_text || undefined },
        m => onLog(`   ${m}`),
      )
      if (res.ok) { okCount++; onLog(`✅ Story publiée : ${name}`) }
      else onLog(`❌ Échec (${name}) : ${res.error ?? 'inconnu'}`)
    } catch (err) {
      onLog(`❌ Erreur (${name}) : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      await stopPhone(bearer, phone.geelark_id).catch(() => {})
    }
  }
  onLog(okCount > 0
    ? `✅ Terminé : ${okCount}/${phones.length} story(s) publiée(s)`
    : '❌ Aucune story publiée')
  return okCount > 0
}

export async function executeScheduledPost(
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

  // Supabase Realtime can deliver jsonb columns as strings — parse defensively
  const phones = (typeof post.phones === 'string'
    ? JSON.parse(post.phones as unknown as string)
    : post.phones) as ScheduledPhoneRecord[]
  const videos = (typeof post.videos === 'string'
    ? JSON.parse(post.videos as unknown as string)
    : post.videos) as ScheduledVideoRecord[]

  const geelarkIds = phones.map(p => p.geelark_id)

  try {
    // 1. Start phones
    onLog(`▶ Démarrage de ${phones.length} téléphone(s)…`)
    const startRes = await gPost(bearer, '/phone/start', { ids: geelarkIds }) as any
    if (startRes.code !== 0) onLog(`⚠ Démarrage: ${startRes.msg ?? startRes.code}`)

    // 2. Wait for boot
    onLog('⏳ Boot téléphones (30s)…')
    await sleep(30_000)

    // 3. Create RPA tasks
    onLog('📤 Envoi des tâches de posting…')
    const taskIds: string[] = []
    let failedCount = 0

    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i]
      if (i > 0 && delay_minutes > 0) {
        onLog(`⏳ Délai ${delay_minutes} min entre comptes…`)
        await sleep(delay_minutes * 60_000)
      }
      const videoIdx = mode === 'random'
        ? Math.floor(Math.random() * videos.length)
        : i % videos.length
      const res = await gPost(bearer, '/rpa/task/instagramPubReels', {
        id:          phone.geelark_id,
        scheduleAt:  Math.floor(Date.now() / 1000),
        description: caption,
        video:       [videos[videoIdx].token],
        ...(reels_trial ? { shareType: 2 } : {}),
      }) as any
      onLog(`📦 Réponse GeelarK (${phone.ig_username ?? phone.phone_name}): code=${res.code} msg=${res.msg ?? '?'} data=${JSON.stringify(res.data ?? null)}`)
      const taskId = res.data?.id ?? res.data?.taskId ?? res.taskId ?? res.id ?? null
      if (res.code === 0) {
        if (taskId) taskIds.push(taskId)
        onLog(`✅ Tâche créée : ${phone.ig_username ?? phone.phone_name}`)
      } else {
        failedCount++
        onLog(`❌ Tâche refusée (${phone.ig_username ?? phone.phone_name}): code=${res.code} msg=${res.msg ?? '?'}`)
      }
    }

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
          if (st === 3) { pollSuccessCount++; onLog(`✅ Succès : ${tid}`); pending.delete(tid) }
          else if (st === 4) { pollFailCount++; onLog(`❌ Échec GeelarK : ${it.failDesc ?? tid}`); pending.delete(tid) }
          else if ([7, 8].includes(st)) { pollFailCount++; onLog(`🚫 Annulé : ${tid}`); pending.delete(tid) }
        }
      }
      if (pending.size > 0) onLog(`⏳ ${pending.size} tâche(s) toujours en attente après timeout`)
    }

    // 5. Stop phones
    onLog('⏹ Arrêt des téléphones…')
    await gPost(bearer, '/phone/stop', { ids: geelarkIds })

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
    return false
  }
}

// ── Time helpers ───────────────────────────────────────────────────────────────

// Format for display (local time)
export function fmtScheduledTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
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
