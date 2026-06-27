// Supabase Edge Function — exécute les posts programmés côté serveur.
//
// Appelée toutes les minutes par pg_cron (voir supabase/migrations/20260611_scheduler_cron.sql).
// Permet aux posts de partir même quand l'application est fermée.
//
// Sécurité : requiert le header `x-cron-secret` égal au secret CRON_SECRET
// (Dashboard → Edge Functions → Secrets), ou l'Authorization service_role.
//
// Déploiement :
//   supabase functions deploy run-scheduled-posts --no-verify-jwt
//   supabase secrets set CRON_SECRET=<un-uuid-aléatoire>

import { createClient } from 'npm:@supabase/supabase-js@2'
import { postStoryServer } from './geelark-story.ts'
import { notifyOwner } from './notify.ts'

const GEELARK = 'https://openapi.geelark.com/open/v1'

// Budget temps global d'une invocation (le cron a un timeout de 5 min).
// On garde une marge pour ne pas être tué en plein milieu d'un post.
const FN_BUDGET_MS = 230_000

// Une exécution d'edge function est limitée en temps (~150-400 s). Stratégie :
// - démarrage des téléphones + 30 s de boot                            → ok
// - création des tâches RPA avec scheduleAt décalé (delay_minutes)     → pas de sleep entre comptes
// - delay = 0 : polling court (3 min max) puis arrêt des téléphones    → ok
// - delay > 0 : les tâches sont planifiées chez GeeLark, on marque le
//   post "done" avec un log explicite — les téléphones restent allumés
//   le temps que GeeLark exécute les tâches.

interface PhoneRec { geelark_id: string; phone_name: string; ig_username: string | null; reels_trial_unsupported?: boolean }
interface VideoRec { token: string; title: string }

type StepType = 'publication' | 'story' | 'warmup'
interface TaskStep {
  id: string
  type: StepType
  videos?: VideoRec[]
  caption?: string
  reels_trial?: boolean
  auto_remove_videos?: boolean
  images?: VideoRec[]
  story_texts?: string[]
  phone_links?: Record<string, string>
  mode?: 'seq' | 'random'
  delay_minutes?: number
  delay_after_minutes?: number
  warmup_minutes?: number
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

async function gPost(bearer: string, path: string, body: unknown): Promise<Record<string, any>> {
  const r = await fetch(`${GEELARK}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await r.json().catch(() => ({}))
}

// Upload a file URL to GeeLark and return the GeeLark resourceUrl token.
// Used when a task video is stored as a Supabase signed URL instead of a pre-uploaded GeeLark token.
async function uploadUrlToGeelark(bearer: string, fileUrl: string): Promise<string | null> {
  try {
    const urlRes = await gPost(bearer, '/upload/getUrl', { fileType: 'mp4' })
    if (urlRes.code !== 0) return null
    const uploadUrl   = urlRes.data?.uploadUrl   as string | undefined
    const resourceUrl = urlRes.data?.resourceUrl as string | undefined
    if (!uploadUrl || !resourceUrl) return null
    const dlRes = await fetch(fileUrl)
    if (!dlRes.ok) return null
    const bytes = await dlRes.arrayBuffer()
    const putRes = await fetch(uploadUrl, { method: 'PUT', body: bytes })
    if (!putRes.ok) return null
    return resourceUrl
  } catch { return null }
}

// If a video token is a Supabase URL, re-sign it (storage path extracted from URL)
// and upload to GeeLark server-side. Returns a valid GeeLark token or the original.
async function resolveVideoToken(
  db: ReturnType<typeof import('npm:@supabase/supabase-js@2').createClient>,
  bearer: string,
  video: VideoRec,
): Promise<string> {
  const { token } = video
  if (!token.includes('supabase.co')) return token  // already a GeeLark token or local path
  // Extract storage_path from signed URL pattern:
  // .../storage/v1/object/sign/content/<storage_path>?token=...
  const match = token.match(/\/storage\/v1\/object\/(?:sign|authenticated)\/content\/(.+?)(?:\?|$)/)
  if (match) {
    const storagePath = match[1]
    const { data } = await db.storage.from('content').createSignedUrl(storagePath, 3600)
    if (data?.signedUrl) {
      const glToken = await uploadUrlToGeelark(bearer, data.signedUrl)
      if (glToken) return glToken
    }
  }
  // Fallback: try uploading the original URL directly (may still be valid)
  const glToken = await uploadUrlToGeelark(bearer, token)
  return glToken ?? token
}

// Story : on a juste besoin d'une URL https fraîche (pas d'upload GeeLark).
// Re-signe l'URL Supabase si nécessaire pour qu'elle ne soit pas expirée.
async function resolveImageUrl(
  db: ReturnType<typeof createClient>,
  image: VideoRec,
): Promise<string> {
  const t = image.token
  const match = t.match(/\/storage\/v1\/object\/(?:sign|authenticated)\/content\/(.+?)(?:\?|$)/)
  if (match) {
    const { data } = await db.storage.from('content').createSignedUrl(match[1], 3600)
    if (data?.signedUrl) return data.signedUrl
  }
  return t
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? ''

  // Auth : secret cron OU service_role OU JWT utilisateur authentifié
  const gotSecret = req.headers.get('x-cron-secret') ?? ''
  const gotAuth   = req.headers.get('authorization') ?? ''
  let authorized   = (cronSecret && gotSecret === cronSecret) || gotAuth.includes(serviceKey)
  // filterUserId : non-null quand appelé par un client authentifié (JWT) — limite le
  // traitement aux tâches/posts de cet utilisateur pour la sécurité.
  let filterUserId: string | null = null

  if (!authorized && gotAuth.startsWith('Bearer ')) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (anonKey) {
      try {
        const tempClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: gotAuth } },
        })
        const { data: { user } } = await tempClient.auth.getUser()
        if (user?.id) { authorized = true; filterUserId = user.id }
      } catch { /* ignore */ }
    }
  }

  if (!authorized) return new Response('Unauthorized', { status: 401 })

  const db = createClient(supabaseUrl, serviceKey)
  const nowIso = new Date().toISOString()
  const fnStart = Date.now()
  const summary: Record<string, string> = {}

  // Résout le bearer GeeLark d'un (org_id, user_id) avec cache mémoire.
  const _bearerCache = new Map<string, string>()
  async function resolveBearer(orgId: string | null, userId: string | null): Promise<string> {
    const key = `${orgId ?? ''}|${userId ?? ''}`
    if (_bearerCache.has(key)) return _bearerCache.get(key)!
    let bearer = ''
    if (orgId) {
      const { data } = await db.from('org_config').select('bearer_token').eq('org_id', orgId).maybeSingle()
      bearer = data?.bearer_token ?? ''
    }
    if (!bearer && userId) {
      const { data } = await db.from('app_config').select('bearer_token').eq('user_id', userId).maybeSingle()
      bearer = data?.bearer_token ?? ''
    }
    _bearerCache.set(key, bearer)
    return bearer
  }

  // ── 0. WATCHDOG ANTI-COÛT ───────────────────────────────────────────────────
  // Éteint tout téléphone démarré par l'AUTOMATION (inscrit dans phone_power_watch)
  // dont l'heure-limite stop_at est dépassée — même si l'app cliente est fermée.
  // Les téléphones démarrés à la main ne sont jamais inscrits → jamais touchés.
  try {
    let dueWatch = db.from('phone_power_watch').select('geelark_id, org_id, user_id, stop_at').lt('stop_at', nowIso).limit(300)
    if (filterUserId) dueWatch = dueWatch.eq('user_id', filterUserId)
    const { data: due } = await dueWatch
    if (due && due.length > 0) {
      // Regroupe par bearer pour minimiser les appels /phone/stop
      const byBearer = new Map<string, string[]>()
      for (const row of due) {
        const bearer = await resolveBearer(row.org_id, row.user_id)
        if (!bearer) continue
        if (!byBearer.has(bearer)) byBearer.set(bearer, [])
        byBearer.get(bearer)!.push(row.geelark_id)
      }
      let stopped = 0
      for (const [bearer, ids] of byBearer) {
        await gPost(bearer, '/phone/stop', { ids }).catch(() => {})
        stopped += ids.length
      }
      // Purge les lignes traitées (qu'on ait pu résoudre le bearer ou non)
      await db.from('phone_power_watch').delete().in('geelark_id', due.map(r => r.geelark_id))
      summary['watchdog'] = `éteint ${stopped} téléphone(s) en dépassement (5 min)`
    }
  } catch (err) {
    summary['watchdog'] = `error: ${err instanceof Error ? err.message : String(err)}`
  }

  // 1. Auto-heal : posts "running" trop vieux (> 30 min).
  // Avant de marquer "failed", on RE-INTERROGE GeeLark avec les task_ids persistés :
  // l'invocation qui a lancé le post a souvent été tuée (budget serverless) AVANT de
  // pouvoir écrire "done", alors que GeeLark a bel et bien posté. On évite ainsi les
  // faux "timeout serveur".
  const cutoff      = new Date(Date.now() - 30 * 60_000).toISOString()
  const hardCutoff  = new Date(Date.now() - 90 * 60_000).toISOString()  // après 1h30 on abandonne même si "en cours"
  const storyCutoff = new Date(Date.now() - 6 * 60 * 60_000).toISOString()
  try {
    let staleQuery = db.from('scheduled_posts')
      .select('id, user_id, org_id, executed_at, created_at, result, bearer_token')
      .eq('status', 'running')
      .neq('type', 'story')
      .or(`executed_at.lt.${cutoff},and(executed_at.is.null,created_at.lt.${cutoff})`)
      .limit(10)
    if (filterUserId) staleQuery = staleQuery.eq('user_id', filterUserId)
    const { data: stalePosts } = await staleQuery

    for (const sp of stalePosts ?? []) {
      const res = (sp.result ?? {}) as Record<string, any>
      const taskIds: string[] = Array.isArray(res.geelark_task_ids) ? res.geelark_task_ids : []
      const geelarkIds: string[] = Array.isArray(res.geelark_ids) ? res.geelark_ids : []
      const ref = sp.executed_at ?? sp.created_at
      const veryOld = ref ? ref < hardCutoff : true

      // Pas de task_ids connus → on ne peut pas vérifier : ancien comportement (failed).
      if (taskIds.length === 0) {
        await db.from('scheduled_posts')
          .update({ status: 'failed', error_msg: 'Interrompu — exécution abandonnée (timeout serveur)' })
          .eq('id', sp.id)
        continue
      }

      // Résolution du bearer (org puis user, puis rétro-compat)
      let bearer = ''
      if (sp.org_id) {
        const { data } = await db.from('org_config').select('bearer_token').eq('org_id', sp.org_id).maybeSingle()
        bearer = data?.bearer_token ?? ''
      }
      if (!bearer) {
        const { data } = await db.from('app_config').select('bearer_token').eq('user_id', sp.user_id).maybeSingle()
        bearer = data?.bearer_token ?? ''
      }
      if (!bearer) bearer = sp.bearer_token || ''
      if (!bearer) {
        // Impossible de vérifier sans bearer → on tranche selon l'âge.
        if (veryOld) {
          await db.from('scheduled_posts')
            .update({ status: 'failed', error_msg: 'Interrompu — exécution abandonnée (timeout serveur)' })
            .eq('id', sp.id)
        }
        continue
      }

      // Interroge GeeLark pour le vrai statut des tâches RPA.
      const q = await gPost(bearer, '/task/query', { ids: taskIds }).catch(() => ({} as Record<string, any>))
      const items: any[] = q.data?.items ?? q.data?.list ?? []
      let success = 0, failed = 0, pending = 0
      for (const it of items) {
        const st = Number(it.status)
        if (st === 3) success++
        else if ([4, 7, 8].includes(st)) failed++
        else pending++
      }
      const seen = success + failed + pending
      // GeeLark ne renvoie rien d'exploitable → on tranche selon l'âge.
      if (seen === 0) {
        if (veryOld) {
          await db.from('scheduled_posts')
            .update({ status: 'failed', error_msg: 'Interrompu — exécution abandonnée (timeout serveur)' })
            .eq('id', sp.id)
        }
        continue
      }

      if (pending > 0 && !veryOld) {
        // Encore en cours chez GeeLark → on laisse "running", on revérifiera au prochain tick.
        summary[`heal:${sp.id}`] = `still running (${pending} pending)`
        continue
      }

      if (success > 0 && failed === 0) {
        // Au moins une réussite, aucun échec → le post est passé. On le marque "done".
        if (geelarkIds.length > 0) await gPost(bearer, '/phone/stop', { ids: geelarkIds }).catch(() => {})
        await db.from('scheduled_posts')
          .update({ status: 'done', error_msg: null })
          .eq('id', sp.id)
        summary[`heal:${sp.id}`] = `recovered → done (${success} ok)`
      } else if (failed > 0 && pending === 0) {
        if (geelarkIds.length > 0) await gPost(bearer, '/phone/stop', { ids: geelarkIds }).catch(() => {})
        await db.from('scheduled_posts')
          .update({ status: 'failed', error_msg: `Échec GeeLark (${failed}/${seen} tâche(s) échouée(s))` })
          .eq('id', sp.id)
        summary[`heal:${sp.id}`] = `failed (${failed} ko)`
      } else if (veryOld) {
        // Trop vieux et toujours indéterminé → abandon.
        if (geelarkIds.length > 0) await gPost(bearer, '/phone/stop', { ids: geelarkIds }).catch(() => {})
        await db.from('scheduled_posts')
          .update({ status: 'failed', error_msg: 'Interrompu — exécution abandonnée (timeout serveur)' })
          .eq('id', sp.id)
      }
    }
  } catch (err) {
    summary['auto_heal'] = `error: ${err instanceof Error ? err.message : String(err)}`
  }
  // Stories : l'exécution serveur se fait par téléphone, sur plusieurs invocations.
  // Un post "running" bloqué > 15 min (invocation crashée) est REMIS en file (pending)
  // pour reprendre là où il s'était arrêté (la progression est dans result.story_progress).
  // Seules les stories vraiment anciennes (> 6 h) sont marquées échouées.
  const storyStale = new Date(Date.now() - 15 * 60_000).toISOString()
  await db.from('scheduled_posts')
    .update({ status: 'failed', error_msg: 'Interrompu — story abandonnée (timeout serveur)' })
    .eq('status', 'running')
    .eq('type', 'story')
    .or(`executed_at.lt.${storyCutoff},and(executed_at.is.null,created_at.lt.${storyCutoff})`)
  await db.from('scheduled_posts')
    .update({ status: 'pending' })
    .eq('status', 'running')
    .eq('type', 'story')
    .lt('executed_at', storyStale)
    .gte('executed_at', storyCutoff)

  // 1ter. Balayage d'arrêt des téléphones — éteint les téléphones laissés allumés
  // par des posts à délai (tâches RPA planifiées chez GeeLark) dont l'échéance
  // d'arrêt est passée. Évite que les téléphones restent allumés indéfiniment.
  try {
    const { data: toStop } = await db.from('scheduled_posts')
      .select('id, user_id, org_id, stop_phone_ids, status, result, bearer_token')
      .not('stop_phones_at', 'is', null)
      .lte('stop_phones_at', nowIso)
      .limit(10)
    for (const row of toStop ?? []) {
      const ids: string[] = Array.isArray(row.stop_phone_ids)
        ? row.stop_phone_ids
        : (typeof row.stop_phone_ids === 'string' ? JSON.parse(row.stop_phone_ids) : [])
      // Résolution du bearer (org puis user)
      let bearer = ''
      if (row.org_id) {
        const { data } = await db.from('org_config').select('bearer_token').eq('org_id', row.org_id).maybeSingle()
        bearer = data?.bearer_token ?? ''
      }
      if (!bearer) {
        const { data } = await db.from('app_config').select('bearer_token').eq('user_id', row.user_id).maybeSingle()
        bearer = data?.bearer_token ?? ''
      }
      if (!bearer) bearer = (row as any).bearer_token ?? ''
      if (ids.length > 0 && bearer) await gPost(bearer, '/phone/stop', { ids }).catch(() => {})

      // If post is still running (client died mid-execution), resolve final status now
      // rather than waiting 30 min for the auto-heal sweep.
      let finalStatus: string | null = null
      if (row.status === 'running') {
        const res = ((row.result ?? {}) as Record<string, unknown>)
        const taskIds: string[] = Array.isArray(res['geelark_task_ids']) ? (res['geelark_task_ids'] as string[]) : []
        if (taskIds.length === 0) {
          // App died before creating RPA tasks — posting never started.
          finalStatus = 'failed'
        } else if (bearer) {
          const q = await gPost(bearer, '/task/query', { ids: taskIds }).catch(() => ({} as Record<string, unknown>))
          const items: Array<Record<string, unknown>> = (q as any).data?.items ?? (q as any).data?.list ?? []
          const success = items.filter(it => Number(it['status']) === 3).length
          const failed  = items.filter(it => [4, 7, 8].includes(Number(it['status']))).length
          // Any success with no failure → done; all failed → failed; mixed/unknown → done (optimistic)
          finalStatus = (failed > 0 && success === 0) ? 'failed' : 'done'
        } else {
          finalStatus = 'done' // no bearer — assume done (phones ran the full duration)
        }
      }

      const upd: Record<string, unknown> = { stop_phones_at: null, stop_phone_ids: null }
      if (finalStatus) upd['status'] = finalStatus
      await db.from('scheduled_posts').update(upd).eq('id', row.id)
      summary[`stop:${row.id}`] = `stopped ${ids.length} phone(s)${finalStatus ? ` → ${finalStatus}` : ''}`
    }
  } catch (err) {
    summary['phone_stop_sweep'] = `error: ${err instanceof Error ? err.message : String(err)}`
  }

  // 0-daily. Débit journalier des tâches actives (50 crédits/tâche/jour) à minuit UTC.
  // La colonne credits_charged_date protège contre le double débit (cron toutes les minutes).
  const nowUtc = new Date()
  const todayStr = nowUtc.toISOString().slice(0, 10) // 'YYYY-MM-DD'
  if (nowUtc.getUTCHours() === 0 && !filterUserId) {
    try {
      const { data: activeTasks } = await db.from('recurring_tasks')
        .select('id, user_id, org_id, name, credits_charged_date')
        .eq('status', 'active')
      for (const task of activeTasks ?? []) {
        if (task.credits_charged_date === todayStr) continue  // déjà débité aujourd'hui
        const { data: creditRes } = await db.rpc('deduct_user_credits', {
          p_user_id: task.user_id,
          p_amount:  50,
        })
        if (creditRes?.ok) {
          await db.from('recurring_tasks')
            .update({ credits_charged_date: todayStr })
            .eq('id', task.id)
          summary[`daily:${task.id}`] = 'charged 50'
        } else {
          // Crédits insuffisants — on suspend la tâche
          await db.from('recurring_tasks')
            .update({ status: 'paused' })
            .eq('id', task.id)
          summary[`daily:${task.id}`] = `paused (${creditRes?.error ?? 'insufficient credits'})`
          await notifyOwner(db, { userId: task.user_id, orgId: task.org_id },
            'task_paused',
            '⏸️ Tâche automatique mise en pause',
            `La tâche « ${task.name ?? task.id} » a été mise en pause : crédits insuffisants pour le débit quotidien de 50 crédits. Recharge ton solde puis réactive-la.`)
        }
      }
    } catch (err) {
      summary['daily_charge'] = `error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // 1bis. Tâches automatiques (recurring_tasks) dues → génère un scheduled_post
  // « enfant » lié par task_id, puis reprogramme la prochaine occurrence.
  // Le scheduled_post créé est ramassé dans la même invocation (étape 2).
  //
  // Coût crédits :
  //   - Premier jour (credits_charged_date IS NULL) : 50 crédits/jour + N téléphones × 2
  //   - Jours suivants : N téléphones × 2 (les 50/jour sont débités à minuit par l'étape 0-daily)
  try {
    // Claim atomique : on met à jour next_run_at en MÊME TEMPS qu'on lit les tâches dues.
    // Si deux instances du cron tournent en parallèle, seule la première voit les lignes
    // (la seconde trouve next_run_at déjà mis à jour au-delà de now → aucune ligne).
    // Cela empêche la double exécution et le double démarrage des téléphones.
    const tempNextRun = new Date(Date.now() + 999 * 60 * 60 * 1000).toISOString() // +999h sentinel
    let claimQuery = db.from('recurring_tasks')
      .update({ next_run_at: tempNextRun })
      .eq('status', 'active')
      .lte('next_run_at', nowIso)
      .select('*')
      .limit(5)
    if (filterUserId) claimQuery = claimQuery.eq('user_id', filterUserId)
    const { data: dueTasks } = await claimQuery

    for (const task of dueTasks ?? []) {
      const phones: unknown[] = typeof task.phones === 'string' ? JSON.parse(task.phones) : (task.phones ?? [])
      const phoneCount = phones.length
      const perRunCost = phoneCount * 2  // même logique que mass_posting

      // Premier jour : débiter aussi les 50 crédits/jour (pas encore débités à minuit)
      const isFirstRun = !task.credits_charged_date
      const dailyCost  = (isFirstRun && task.credits_charged_date !== todayStr) ? 50 : 0
      const totalCost  = dailyCost + perRunCost

      if (totalCost > 0) {
        const { data: creditRes } = await db.rpc('deduct_user_credits', {
          p_user_id: task.user_id,
          p_amount:  totalCost,
        })
        if (!creditRes?.ok) {
          await db.from('recurring_tasks').update({ status: 'paused' }).eq('id', task.id)
          summary[`task:${task.id}`] = `paused — crédits insuffisants (${creditRes?.error ?? ''})`
          await notifyOwner(db, { userId: task.user_id, orgId: task.org_id },
            'task_paused',
            '⏸️ Tâche automatique mise en pause',
            `La tâche « ${task.name ?? task.id} » a été mise en pause : crédits insuffisants pour cette exécution. Recharge ton solde puis réactive-la.`)
          continue
        }
        // Marque la date du débit journalier si on vient de le prendre
        if (dailyCost > 0) {
          await db.from('recurring_tasks')
            .update({ credits_charged_date: todayStr })
            .eq('id', task.id)
        }
      }

      const recurHours = Number(task.recur_hours) || 24
      // nextRun remplace le sentinel posé par le claim atomique ci-dessus.
      const nextRun = new Date(Date.now() + recurHours * 60 * 60 * 1000).toISOString()

      // Tâches multi-étapes (steps) vs legacy (flat fields)
      const stepsRaw = task.steps
      const steps: TaskStep[] = Array.isArray(stepsRaw) ? stepsRaw
        : (typeof stepsRaw === 'string' && stepsRaw ? JSON.parse(stepsRaw) : [])

      // Déterminer si cette tâche peut s'exécuter entièrement côté serveur.
      // Les steps story/warmup nécessitent l'automation UI côté client (ADB).
      // Si tous les steps sont 'publication' (ou pas de steps et task_type='publication'),
      // la tâche est entièrement serveur.
      const hasClientOnlySteps = steps.length > 0
        ? steps.some(s => s.type === 'story' || s.type === 'warmup')
        : (task.task_type === 'story')

      // Créer l'exécution (scheduled_post enfant)
      // Pour les tâches mixtes (publication + story), on crée quand même un scheduled_post
      // de type mass_posting pour les steps publication. Les steps story/warmup seront
      // exécutés côté client quand l'app est ouverte.
      const effectiveType = steps.length > 0
        ? (steps.some(s => s.type === 'publication') ? 'mass_posting' : 'story')
        : (task.task_type === 'story' ? 'story' : 'mass_posting')

      // Pour les tâches qui nécessitent le client (story pure), marquer comme pending
      // pour que le client les détecte et exécute. La logique d'exécution serveur
      // (étape 2) va les ignorer (neq type='story').
      const postPayload: Record<string, unknown> = {
        user_id:         task.user_id,
        org_id:          task.org_id,
        created_by_name: task.name || 'Tâche auto',
        type:            effectiveType,
        status:          'pending',
        scheduled_at:    nowIso,
        phones:          task.phones,
        videos:          steps.length > 0
          ? (steps.find(s => s.type === 'publication')?.videos ?? task.videos ?? [])
          : task.videos,
        caption:         steps.length > 0
          ? (steps.find(s => s.type === 'publication')?.caption ?? task.caption ?? '')
          : task.caption,
        delay_minutes:   task.delay_minutes ?? 0,
        mode:            task.mode ?? 'seq',
        bearer_token:    '',
        reels_trial:     steps.length > 0
          ? !!(steps.find(s => s.type === 'publication')?.reels_trial)
          : (task.reels_trial ?? false),
        task_id:         task.id,
        result:          steps.length > 0
          ? { steps, has_client_only: hasClientOnlySteps }
          : (task.task_type === 'story' ? { story_texts: task.story_texts ?? [] } : null),
      }
      let { error: insErr } = await db.from('scheduled_posts').insert(postPayload)
      // Retry without optional columns that might not exist yet (e.g. task_id if migration not applied)
      if (insErr && /task_id|column|schema|cache/i.test(insErr.message)) {
        const { task_id: _tid, ...fallbackPayload } = postPayload
        ;({ error: insErr } = await db.from('scheduled_posts').insert(fallbackPayload))
      }
      // Reprogramme la prochaine occurrence + compteurs (best-effort)
      await db.from('recurring_tasks').update({
        next_run_at: nextRun,
        last_run_at: nowIso,
        run_count:   (Number(task.run_count) || 0) + 1,
      }).eq('id', task.id)
      summary[`task:${task.id}`] = insErr ? `task insert failed: ${insErr.message}` : `task queued (−${totalCost} crédits, type=${effectiveType})`
    }
  } catch (err) {
    summary['recurring_tasks'] = `error: ${err instanceof Error ? err.message : String(err)}`
  }

  // 2. Posts dus — UNIQUEMENT ceux issus de tâches récurrentes (task_id NOT NULL).
  // Les posts manuels (Programmation tab, task_id IS NULL) sont exécutés côté client.
  // type='story' exclu : stories passent par automation UI (~2 min/tel) côté app.
  let duePostsQuery = db.from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .neq('type', 'story')
    .not('task_id', 'is', null)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(2)
  if (filterUserId) duePostsQuery = duePostsQuery.eq('user_id', filterUserId)
  const { data: due } = await duePostsQuery

  for (const post of due ?? []) {
    // 3. Claim atomique — évite la double exécution si l'app du client est ouverte
    const { data: claimed } = await db.from('scheduled_posts')
      .update({ status: 'running', executed_at: new Date().toISOString() })
      .eq('id', post.id).eq('status', 'pending')
      .select('id')
    if (!claimed?.length) { summary[post.id] = 'skipped (claimed elsewhere)'; continue }

    const logs: string[] = []
    const log = (m: string) => logs.push(m)

    try {
      // 4. Résolution du bearer (jamais stocké dans la ligne)
      let bearer = ''
      if (post.org_id) {
        const { data } = await db.from('org_config')
          .select('bearer_token').eq('org_id', post.org_id).maybeSingle()
        bearer = data?.bearer_token ?? ''
      }
      if (!bearer) {
        const { data } = await db.from('app_config')
          .select('bearer_token').eq('user_id', post.user_id).maybeSingle()
        bearer = data?.bearer_token ?? ''
      }
      if (!bearer) bearer = post.bearer_token || ''   // rétro-compat anciennes lignes
      if (!bearer) throw new Error('Aucun token GéeLark configuré')

      const phones: PhoneRec[] = typeof post.phones === 'string' ? JSON.parse(post.phones) : post.phones
      const videos: VideoRec[] = typeof post.videos === 'string' ? JSON.parse(post.videos) : post.videos
      const geelarkIds = phones.map(p => p.geelark_id)
      const delayMin: number = post.delay_minutes ?? 0

      // 5. Démarrage des téléphones
      log(`▶ [serveur] Démarrage de ${phones.length} téléphone(s)…`)
      const startRes = await gPost(bearer, '/phone/start', { ids: geelarkIds })
      if (startRes.code !== 0) log(`⚠ Démarrage: ${startRes.msg ?? startRes.code}`)
      await sleep(30_000)

      // 6. Tâches RPA — scheduleAt décalé au lieu de sleep entre comptes
      const taskIds: string[] = []
      const taskPhoneMap = new Map<string, PhoneRec>()  // taskId → phone
      let failedCount = 0
      const baseTs = Math.floor(Date.now() / 1000)
      const usedVideoIndices = new Set<number>()

      // Fetch fresh reels_trial_unsupported flags for phones
      const { data: phoneFlagsRaw } = await db.from('phones')
        .select('geelark_id, reels_trial_unsupported')
        .in('geelark_id', geelarkIds)
      const phoneFlags = new Map<string, boolean>(
        (phoneFlagsRaw ?? []).map((r: { geelark_id: string; reels_trial_unsupported: boolean }) =>
          [r.geelark_id, r.reels_trial_unsupported ?? false])
      )

      // Pre-resolve video tokens (upload Supabase URLs to GeeLark once, deduplicated)
      const resolvedTokens: string[] = []
      for (let vi = 0; vi < videos.length; vi++) {
        resolvedTokens.push(await resolveVideoToken(db, bearer, videos[vi]))
      }
      // TikTok : un seul /task/add (taskType:1) batché. Sinon : boucle IG ci-dessous.
      if (post.platform === 'tiktok') {
        const list = phones.map((phone, i) => {
          const vIdx = post.mode === 'random' ? Math.floor(Math.random() * videos.length) : i % videos.length
          usedVideoIndices.add(vIdx)
          return { scheduleAt: baseTs + i * delayMin * 60, envId: phone.geelark_id, video: resolvedTokens[vIdx], videoDesc: post.caption }
        })
        const res = await gPost(bearer, '/task/add', { taskType: 1, list })
        const ids: string[] = res.data?.taskIds ?? []
        if (res.code === 0 && Array.isArray(ids) && ids.length > 0) {
          ids.forEach((tid, idx) => { taskIds.push(tid); if (phones[idx]) taskPhoneMap.set(tid, phones[idx]) })
          log(`✅ ${ids.length} tâche(s) TikTok créée(s)`)
        } else {
          failedCount = phones.length
          log(`❌ TikTok /task/add refusé: code=${res.code} msg=${res.msg ?? '?'}`)
        }
      }

      for (let i = 0; post.platform !== 'tiktok' && i < phones.length; i++) {
        const phone = phones[i]
        const videoIdx = post.mode === 'random'
          ? Math.floor(Math.random() * videos.length)
          : i % videos.length
        usedVideoIndices.add(videoIdx)
        const trialUnsupported = phoneFlags.get(phone.geelark_id) ?? false
        const useTrialReels = post.reels_trial && !trialUnsupported
        if (post.reels_trial && trialUnsupported) {
          log(`⚠ Trial Reels désactivé pour ${phone.ig_username ?? phone.phone_name} (compte non éligible)`)
        }
        const res = await gPost(bearer, '/rpa/task/instagramPubReels', {
          id:          phone.geelark_id,
          scheduleAt:  baseTs + i * delayMin * 60,
          description: post.caption,
          video:       [resolvedTokens[videoIdx]],
          ...(useTrialReels ? { shareType: 2 } : {}),
        })
        const taskId = res.data?.id ?? res.data?.taskId ?? null
        if (res.code === 0) {
          if (taskId) { taskIds.push(taskId); taskPhoneMap.set(taskId, phone) }
          log(`✅ Tâche créée : ${phone.ig_username ?? phone.phone_name}${delayMin && i ? ` (départ +${i * delayMin} min)` : ''}`)
        } else {
          failedCount++
          log(`❌ Tâche refusée (${phone.ig_username ?? phone.phone_name}): code=${res.code} msg=${res.msg ?? '?'}`)
          // If trial reels was active for this phone and the task was refused, mark it
          if (useTrialReels) {
            await db.from('phones').update({ reels_trial_unsupported: true }).eq('geelark_id', phone.geelark_id)
            log(`🔕 ${phone.ig_username ?? phone.phone_name} marqué : Trial Reels non supporté`)
          }
        }
      }

      if (failedCount >= phones.length) {
        await gPost(bearer, '/phone/stop', { ids: geelarkIds }).catch(() => {})
        throw new Error(`Toutes les tâches ont été refusées (${failedCount}/${phones.length})`)
      }

      // Persiste les task_ids GeeLark AVANT le polling. Si cette invocation est
      // tuée (budget serverless dépassé) avant de marquer le post "done", l'auto-heal
      // d'une prochaine invocation pourra ré-interroger GeeLark pour vérifier le vrai
      // statut — au lieu de marquer un faux "timeout serveur" alors que le post est passé.
      //
      // FILET DE SÉCURITÉ : on programme aussi l'arrêt des téléphones (stop_phones_at)
      // dès maintenant. Ainsi, même si l'invocation crashe avant l'arrêt normal, le
      // balayage 1ter d'une prochaine invocation éteindra les téléphones → ils ne
      // tournent jamais à l'infini. Pour delay=0 : +15 min ; pour delay>0 : 15 min
      // après la dernière tâche planifiée. Ce filet sera écrasé (plus tôt) par l'arrêt
      // normal une fois le post terminé.
      const safetyOffsetMs = delayMin > 0 ? (phones.length - 1) * delayMin * 60_000 : 0
      // delay=0 → 5 min (posting takes <3 min) ; delay>0 → 15 min après la dernière tâche
      const safetyBuffer = delayMin === 0 ? 5 * 60_000 : 15 * 60_000
      const safetyStopAt = new Date(Date.now() + safetyOffsetMs + safetyBuffer).toISOString()
      // Watchdog unifié : inscrit aussi ces téléphones (démarrés par le serveur).
      await db.from('phone_power_watch').upsert(
        geelarkIds.map(id => ({ geelark_id: id, org_id: post.org_id, user_id: post.user_id, reason: 'server_post', stop_at: safetyStopAt })),
        { onConflict: 'geelark_id' },
      ).then(() => {}, () => {})
      const safetyUpd = await db.from('scheduled_posts').update({
        result: { logs, geelark_task_ids: taskIds, geelark_ids: geelarkIds },
        stop_phones_at: safetyStopAt, stop_phone_ids: geelarkIds,
      }).eq('id', post.id)
      if (safetyUpd.error && /stop_phones?_(at|ids)/i.test(safetyUpd.error.message)) {
        // Colonnes stop_phones_at/stop_phone_ids absentes (migration non appliquée) :
        // on persiste au moins les task_ids pour la vérification anti-faux-timeout.
        await db.from('scheduled_posts').update({
          result: { logs, geelark_task_ids: taskIds, geelark_ids: geelarkIds },
        }).eq('id', post.id)
      }

      let stopPhonesAt: string | null = null
      let stopPhoneIds: string[] | null = null
      if (delayMin > 0 && phones.length > 1) {
        // Tâches planifiées chez GeeLark — on ne peut pas attendre des heures ici.
        // On programme l'arrêt des téléphones après la dernière tâche planifiée
        // (+ 5 min de marge), ramassé par le balayage 1ter d'une prochaine invocation.
        const lastOffsetMs = (phones.length - 1) * delayMin * 60_000
        stopPhonesAt = new Date(Date.now() + lastOffsetMs + 5 * 60_000).toISOString()
        stopPhoneIds = geelarkIds
        log(`⏳ ${taskIds.length} tâche(s) planifiée(s) chez GeelarK avec ${delayMin} min d'écart.`)
        log(`⏰ Arrêt automatique des téléphones programmé après la dernière tâche (+5 min).`)
      } else {
        // delay=0 : pas de polling inline — causerait un 504 sur le free tier Supabase
        // (30 s boot + 3 min poll > 150 s limite). Le filet de sécurité a posé
        // stop_phones_at = now+5 min ; le balayage 1ter de la prochaine invocation
        // interrogera GeeLark, mettra à jour le statut et éteindra les téléphones.
        log(`⏳ ${taskIds.length} tâche(s) lancée(s). Statut et arrêt auto dans ~5 min via balayage serveur.`)
      }

      // delay>0 → marque done immédiatement + planifie l'arrêt différé des téléphones.
      // delay=0 → laisse "running" ; le sweep 1ter mettra à jour le statut dans ~5 min.
      if (stopPhonesAt !== null) {
        log('✅ Post programmé exécuté par le serveur.')
        const doneUpd = await db.from('scheduled_posts').update({
          status: 'done', result: { logs }, error_msg: null,
          stop_phones_at: stopPhonesAt, stop_phone_ids: stopPhoneIds,
        }).eq('id', post.id)
        if (doneUpd.error && /stop_phones?_(at|ids)/i.test(doneUpd.error.message)) {
          if (stopPhoneIds) await gPost(bearer, '/phone/stop', { ids: stopPhoneIds }).catch(() => {})
          await db.from('scheduled_posts').update({
            status: 'done', result: { logs }, error_msg: null,
          }).eq('id', post.id)
        }
      }

      // Auto-remove used videos from task pool (if enabled on parent task)
      if (post.task_id) {
        try {
          const { data: parentTask } = await db.from('recurring_tasks')
            .select('videos, auto_remove_videos, status')
            .eq('id', post.task_id)
            .maybeSingle()
          if (parentTask?.auto_remove_videos) {
            const pool = (parentTask.videos ?? []) as VideoRec[]
            const remaining = pool.filter((_v, idx) => !usedVideoIndices.has(idx))
            if (remaining.length === 0) {
              await db.from('recurring_tasks')
                .update({ videos: [], status: 'paused' })
                .eq('id', post.task_id)
              log('⏸ Pool de vidéos vide — tâche mise en pause.')
              await notifyOwner(db, { userId: post.user_id, orgId: post.org_id },
                'task_paused',
                '⏸️ Tâche automatique en pause',
                `La tâche a été mise en pause : toutes les vidéos de la pool ont été utilisées (usage unique). Ajoute de nouvelles vidéos puis réactive-la.`)
            } else {
              await db.from('recurring_tasks')
                .update({ videos: remaining })
                .eq('id', post.task_id)
              log(`🗑 ${pool.length - remaining.length} vidéo(s) retirée(s) de la pool (${remaining.length} restante(s)).`)
            }
          }
        } catch (_e) { /* best-effort */ }
      }

      // Auto-reschedule si récurrent
      const recurHours: number | null = (post as any).recur_hours ?? null
      if (recurHours && recurHours > 0) {
        const nextAt = new Date(Date.now() + recurHours * 60 * 60 * 1000).toISOString()
        await db.from('scheduled_posts').insert({
          user_id:         post.user_id,
          org_id:          post.org_id,
          created_by_name: post.created_by_name,
          type:            post.type,
          status:          'pending',
          scheduled_at:    nextAt,
          phones:          post.phones,
          videos:          post.videos,
          caption:         post.caption,
          delay_minutes:   post.delay_minutes,
          mode:            post.mode,
          bearer_token:    '',
          reels_trial:     post.reels_trial,
          recur_hours:     recurHours,
        })
        log(`🔄 Prochain post récurrent programmé dans ${recurHours}h`)
      }

      summary[post.id] = 'done'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logs.push(`❌ Erreur : ${msg}`)
      await db.from('scheduled_posts').update({
        status: 'failed', result: { logs }, error_msg: msg,
      }).eq('id', post.id)
      summary[post.id] = `failed: ${msg}`
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. STORIES — exécution serveur, par téléphone, sur plusieurs invocations.
  //
  // Une story prend ~2 min d'automation UI par téléphone (trop long pour traiter
  // tous les comptes dans une seule invocation serverless). On traite donc les
  // téléphones un par un dans le budget de temps de l'invocation, on enregistre
  // la progression (result.story_progress.done), puis on remet le post en
  // « pending » pour que le prochain tick du cron reprenne là où on s'est arrêté.
  // Quand tous les téléphones sont traités → status 'done' + reprogrammation.
  //
  // On ne traite que les stories « plates » (pas de result.steps : celles-ci
  // restent gérées côté client). filterUserId limite au client authentifié.
  // ───────────────────────────────────────────────────────────────────────────
  try {
    let storyQuery = db.from('scheduled_posts')
      .select('*')
      .eq('status', 'pending')
      .eq('type', 'story')
      .not('task_id', 'is', null)
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(3)
    if (filterUserId) storyQuery = storyQuery.eq('user_id', filterUserId)
    const { data: dueStories } = await storyQuery

    for (const post of dueStories ?? []) {
      if (Date.now() - fnStart > FN_BUDGET_MS - 130_000) break  // plus assez de temps pour un téléphone

      // Les stories multi-étapes (result.steps) restent côté client
      const existingResult = (typeof post.result === 'string'
        ? JSON.parse(post.result) : post.result) as Record<string, any> | null
      if (existingResult?.steps) { summary[`story:${post.id}`] = 'skipped (steps → client)'; continue }

      // Claim atomique
      const { data: claimed } = await db.from('scheduled_posts')
        .update({ status: 'running', executed_at: new Date().toISOString() })
        .eq('id', post.id).eq('status', 'pending')
        .select('id')
      if (!claimed?.length) { summary[`story:${post.id}`] = 'skipped (claimed elsewhere)'; continue }

      const progress = (existingResult?.story_progress ?? {}) as { done?: string[]; logs?: string[] }
      const doneSet = new Set<string>(progress.done ?? [])
      const logs: string[] = progress.logs ?? []
      const log = (m: string) => logs.push(m)

      try {
        // Bearer
        let bearer = ''
        if (post.org_id) {
          const { data } = await db.from('org_config').select('bearer_token').eq('org_id', post.org_id).maybeSingle()
          bearer = data?.bearer_token ?? ''
        }
        if (!bearer) {
          const { data } = await db.from('app_config').select('bearer_token').eq('user_id', post.user_id).maybeSingle()
          bearer = data?.bearer_token ?? ''
        }
        if (!bearer) bearer = post.bearer_token || ''
        if (!bearer) throw new Error('Aucun token GéeLark configuré')

        const phones: Array<PhoneRec & { link?: string }> =
          typeof post.phones === 'string' ? JSON.parse(post.phones) : post.phones
        const images: VideoRec[] = typeof post.videos === 'string' ? JSON.parse(post.videos) : (post.videos ?? [])
        const storyTexts: string[] = Array.isArray(existingResult?.story_texts) ? existingResult!.story_texts : []
        const mode: string = post.mode ?? 'seq'

        if (!images.length) throw new Error('Aucune image dans la story')

        // Traite UN téléphone par invocation : le boot du téléphone (~30-60s) +
        // l'automation story (~2 min) tiennent dans le budget serverless pour un
        // seul compte. Les autres comptes sont repris aux ticks suivants du cron.
        let processedThisRun = 0
        for (let i = 0; i < phones.length; i++) {
          const phone = phones[i]
          if (doneSet.has(phone.geelark_id)) continue
          if (processedThisRun >= 1) break  // un seul téléphone par invocation

          const name = phone.ig_username ?? phone.phone_name
          const link = (phone.link ?? '').trim()
          if (!link) { log(`❌ ${name} : aucun lien configuré`); doneSet.add(phone.geelark_id); continue }

          const imgIdx = mode === 'random' ? Math.floor(Math.random() * images.length) : i % images.length
          const imageUrl = await resolveImageUrl(db, images[imgIdx])
          const linkText = storyTexts.length
            ? (mode === 'random' ? storyTexts[Math.floor(Math.random() * storyTexts.length)] : storyTexts[i % storyTexts.length])
            : undefined

          log(`▶ [serveur] Story ${name}…`)
          // Watchdog : si l'invocation meurt avant le finally, le phone est éteint après 5 min.
          await db.from('phone_power_watch').upsert(
            [{ geelark_id: phone.geelark_id, org_id: post.org_id, user_id: post.user_id, reason: 'server_story', stop_at: new Date(Date.now() + 5 * 60_000).toISOString() }],
            { onConflict: 'geelark_id' },
          ).then(() => {}, () => {})
          try {
            const res = await postStoryServer(bearer, phone.geelark_id, { imageUrl, linkUrl: link, linkText }, m => log(`  ${name}: ${m}`))
            if (res.ok) log(`✅ ${name} — story publiée`)
            else log(`❌ ${name} : ${res.error ?? 'échec'}`)
          } catch (e) {
            log(`❌ ${name} : ${e instanceof Error ? e.message : String(e)}`)
          } finally {
            await gPost(bearer, '/phone/stop', { ids: [phone.geelark_id] }).catch(() => {})
            await db.from('phone_power_watch').delete().eq('geelark_id', phone.geelark_id).then(() => {}, () => {})
          }
          doneSet.add(phone.geelark_id)
          processedThisRun++
        }

        const allDone = phones.every(p => doneSet.has(p.geelark_id))
        if (allDone) {
          await db.from('scheduled_posts').update({
            status: 'done', error_msg: null,
            result: { logs, story_progress: { done: [...doneSet], logs } },
          }).eq('id', post.id)

          // Reprogrammation récurrente (si applicable)
          const recurHours: number | null = (post as any).recur_hours ?? null
          if (recurHours && recurHours > 0) {
            const nextAt = new Date(Date.now() + recurHours * 60 * 60 * 1000).toISOString()
            await db.from('scheduled_posts').insert({
              user_id: post.user_id, org_id: post.org_id, created_by_name: post.created_by_name,
              type: 'story', status: 'pending', scheduled_at: nextAt,
              phones: post.phones, videos: post.videos, caption: post.caption,
              delay_minutes: post.delay_minutes, mode: post.mode, bearer_token: '',
              recur_hours: recurHours, result: { story_texts: storyTexts },
            })
          }
          summary[`story:${post.id}`] = `done (${doneSet.size}/${phones.length} téléphones)`
        } else {
          // Reste des téléphones → remet en pending pour le prochain tick
          await db.from('scheduled_posts').update({
            status: 'pending',
            result: { logs, story_progress: { done: [...doneSet], logs }, story_texts: storyTexts },
          }).eq('id', post.id)
          summary[`story:${post.id}`] = `in progress (${doneSet.size}/${phones.length}, +${processedThisRun} ce tick)`
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logs.push(`❌ Erreur : ${msg}`)
        await db.from('scheduled_posts').update({ status: 'failed', result: { logs }, error_msg: msg }).eq('id', post.id)
        summary[`story:${post.id}`] = `failed: ${msg}`
      }
    }
  } catch (err) {
    summary['stories'] = `error: ${err instanceof Error ? err.message : String(err)}`
  }

  return new Response(JSON.stringify({ processed: Object.keys(summary).length, summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
