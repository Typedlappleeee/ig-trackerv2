import { supabase } from './supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScheduledPhoneRecord {
  id:          string
  geelark_id:  string
  phone_name:  string
  ig_username: string | null
}

export interface ScheduledVideoRecord {
  token: string
  title: string
}

export type ScheduleStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
export type PostingType    = 'posting' | 'mass_posting'

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
    bearer_token:     input.bearerToken,
  }).select().single()
  if (error) throw new Error(error.message)
  return data as ScheduledPost
}

export async function cancelScheduledPost(id: string): Promise<void> {
  await supabase.from('scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', id).eq('status', 'pending')
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

export async function executeScheduledPost(
  post: ScheduledPost,
  onLog: (msg: string) => void,
): Promise<boolean> {
  const { bearer_token: bearer, phones, videos, caption, delay_minutes, mode } = post
  const geelarkIds = phones.map(p => p.geelark_id)

  try {
    // 1. Start phones
    onLog(`▶ Démarrage de ${phones.length} téléphone(s)…`)
    await gPost(bearer, '/phone/start', { ids: geelarkIds })

    // 2. Wait for boot
    onLog('⏳ Boot téléphones (30s)…')
    await sleep(30_000)

    // 3. Create RPA tasks
    onLog('📤 Envoi des tâches de posting…')
    const taskIds: string[] = []

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
        id:         phone.geelark_id,
        scheduleAt: Math.floor(Date.now() / 1000),
        description: caption,
        video:      [videos[videoIdx].token],
      }) as any
      if (res.data?.id) {
        taskIds.push(res.data.id)
        onLog(`✅ Tâche créée : ${phone.ig_username ?? phone.phone_name}`)
      } else {
        onLog(`⚠ Tâche échouée : ${phone.ig_username ?? phone.phone_name}`)
      }
    }

    // 4. Poll until done (max 8 min)
    if (taskIds.length > 0) {
      onLog('⏳ Attente de complétion…')
      let elapsed = 0
      while (elapsed < 8 * 60_000) {
        await sleep(15_000)
        elapsed += 15_000
        const q = await gPost(bearer, '/task/query', { ids: taskIds }) as any
        const items: any[] = q.data?.items ?? []
        let allDone = true
        for (const it of items) {
          if (it.status === 3)      onLog(`✅ Succès : ${it.id}`)
          else if (it.status === 4) onLog(`❌ Échec : ${it.failDesc ?? it.id}`)
          else                      allDone = false
        }
        if (allDone) break
      }
    }

    // 5. Stop phones
    onLog('⏹ Arrêt des téléphones…')
    await gPost(bearer, '/phone/stop', { ids: geelarkIds })
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
