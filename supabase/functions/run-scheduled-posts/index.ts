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

const GEELARK = 'https://openapi.geelark.com/open/v1'

// Une exécution d'edge function est limitée en temps (~150-400 s). Stratégie :
// - démarrage des téléphones + 30 s de boot                            → ok
// - création des tâches RPA avec scheduleAt décalé (delay_minutes)     → pas de sleep entre comptes
// - delay = 0 : polling court (3 min max) puis arrêt des téléphones    → ok
// - delay > 0 : les tâches sont planifiées chez GeeLark, on marque le
//   post "done" avec un log explicite — les téléphones restent allumés
//   le temps que GeeLark exécute les tâches.

interface PhoneRec { geelark_id: string; phone_name: string; ig_username: string | null }
interface VideoRec { token: string; title: string }

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
  const summary: Record<string, string> = {}

  // 1. Auto-heal : posts "running" trop vieux (> 30 min) → failed
  // Les stories ont une fenêtre de 6 h (automation séquentielle avec délais).
  const cutoff      = new Date(Date.now() - 30 * 60_000).toISOString()
  const storyCutoff = new Date(Date.now() - 6 * 60 * 60_000).toISOString()
  await db.from('scheduled_posts')
    .update({ status: 'failed', error_msg: 'Interrompu — exécution abandonnée (timeout serveur)' })
    .eq('status', 'running')
    .neq('type', 'story')
    .or(`executed_at.lt.${cutoff},and(executed_at.is.null,created_at.lt.${cutoff})`)
  await db.from('scheduled_posts')
    .update({ status: 'failed', error_msg: 'Interrompu — exécution abandonnée (timeout serveur)' })
    .eq('status', 'running')
    .eq('type', 'story')
    .or(`executed_at.lt.${storyCutoff},and(executed_at.is.null,created_at.lt.${storyCutoff})`)

  // 1ter. Balayage d'arrêt des téléphones — éteint les téléphones laissés allumés
  // par des posts à délai (tâches RPA planifiées chez GeeLark) dont l'échéance
  // d'arrêt est passée. Évite que les téléphones restent allumés indéfiniment.
  try {
    const { data: toStop } = await db.from('scheduled_posts')
      .select('id, user_id, org_id, stop_phone_ids')
      .not('stop_phones_at', 'is', null)
      .lte('stop_phones_at', nowIso)
      .limit(10)
    for (const row of toStop ?? []) {
      const ids: string[] = Array.isArray(row.stop_phone_ids)
        ? row.stop_phone_ids
        : (typeof row.stop_phone_ids === 'string' ? JSON.parse(row.stop_phone_ids) : [])
      if (ids.length > 0) {
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
        if (bearer) await gPost(bearer, '/phone/stop', { ids }).catch(() => {})
      }
      // Marque comme traité (évite de réessayer chaque minute)
      await db.from('scheduled_posts').update({ stop_phones_at: null, stop_phone_ids: null }).eq('id', row.id)
      summary[`stop:${row.id}`] = `stopped ${ids.length} phone(s)`
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
        .select('id, user_id, credits_charged_date')
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
    let dueTasksQuery = db.from('recurring_tasks')
      .select('*')
      .eq('status', 'active')
      .lte('next_run_at', nowIso)
      .order('next_run_at', { ascending: true })
      .limit(5)
    if (filterUserId) dueTasksQuery = dueTasksQuery.eq('user_id', filterUserId)
    const { data: dueTasks } = await dueTasksQuery

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
      const nextRun = new Date(Date.now() + recurHours * 60 * 60 * 1000).toISOString()
      // Crée l'exécution (scheduled_post enfant)
      const { error: insErr } = await db.from('scheduled_posts').insert({
        user_id:         task.user_id,
        org_id:          task.org_id,
        created_by_name: task.name || 'Tâche auto',
        type:            'mass_posting',
        status:          'pending',
        scheduled_at:    nowIso,
        phones:          task.phones,
        videos:          task.videos,
        caption:         task.caption,
        delay_minutes:   task.delay_minutes ?? 0,
        mode:            task.mode ?? 'seq',
        bearer_token:    '',
        reels_trial:     task.reels_trial ?? false,
        task_id:         task.id,
      })
      // Reprogramme la prochaine occurrence + compteurs (best-effort)
      await db.from('recurring_tasks').update({
        next_run_at: nextRun,
        last_run_at: nowIso,
        run_count:   (Number(task.run_count) || 0) + 1,
      }).eq('id', task.id)
      summary[`task:${task.id}`] = insErr ? `task insert failed: ${insErr.message}` : `task queued (−${totalCost} crédits)`
    }
  } catch (err) {
    summary['recurring_tasks'] = `error: ${err instanceof Error ? err.message : String(err)}`
  }

  // 2. Posts dus (limite 2 par invocation pour rester sous la limite de temps)
  // type='story' exclu : les stories passent par de l'automation UI (~2 min par
  // téléphone) qui dépasse les limites serverless — elles s'exécutent côté app.
  let duePostsQuery = db.from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .neq('type', 'story')
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
      let failedCount = 0
      const baseTs = Math.floor(Date.now() / 1000)
      const usedVideoIndices = new Set<number>()
      // Pre-resolve video tokens (upload Supabase URLs to GeeLark once, deduplicated)
      const resolvedTokens: string[] = []
      for (let vi = 0; vi < videos.length; vi++) {
        resolvedTokens.push(await resolveVideoToken(db, bearer, videos[vi]))
      }
      for (let i = 0; i < phones.length; i++) {
        const phone = phones[i]
        const videoIdx = post.mode === 'random'
          ? Math.floor(Math.random() * videos.length)
          : i % videos.length
        usedVideoIndices.add(videoIdx)
        const res = await gPost(bearer, '/rpa/task/instagramPubReels', {
          id:          phone.geelark_id,
          scheduleAt:  baseTs + i * delayMin * 60,
          description: post.caption,
          video:       [resolvedTokens[videoIdx]],
          ...(post.reels_trial ? { shareType: 2 } : {}),
        })
        const taskId = res.data?.id ?? res.data?.taskId ?? null
        if (res.code === 0) {
          if (taskId) taskIds.push(taskId)
          log(`✅ Tâche créée : ${phone.ig_username ?? phone.phone_name}${delayMin && i ? ` (départ +${i * delayMin} min)` : ''}`)
        } else {
          failedCount++
          log(`❌ Tâche refusée (${phone.ig_username ?? phone.phone_name}): code=${res.code} msg=${res.msg ?? '?'}`)
        }
      }

      if (failedCount >= phones.length) {
        await gPost(bearer, '/phone/stop', { ids: geelarkIds }).catch(() => {})
        throw new Error(`Toutes les tâches ont été refusées (${failedCount}/${phones.length})`)
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
        // 7. Polling court (3 min max) puis arrêt des téléphones
        let elapsed = 0
        const pending = new Set(taskIds)
        while (pending.size > 0 && elapsed < 3 * 60_000) {
          await sleep(15_000); elapsed += 15_000
          const q = await gPost(bearer, '/task/query', { ids: [...pending] })
          const items: any[] = q.data?.items ?? q.data?.list ?? []
          for (const it of items) {
            const tid = it.id ?? it.taskId
            const st = Number(it.status)
            if (st === 3) { log(`✅ Succès : ${tid}`); pending.delete(tid) }
            else if ([4, 7, 8].includes(st)) { log(`❌ Échec/annulé : ${it.failDesc ?? tid}`); pending.delete(tid) }
          }
        }
        if (pending.size > 0) log(`⏳ ${pending.size} tâche(s) encore en cours après 3 min — GeelarK continue en arrière-plan.`)
        log('⏹ Arrêt des téléphones…')
        await gPost(bearer, '/phone/stop', { ids: geelarkIds }).catch(() => {})
      }

      log('✅ Post programmé exécuté par le serveur.')
      // Marque done + planifie l'arrêt différé des téléphones. Si les colonnes
      // stop_phones_at/stop_phone_ids n'existent pas (migration non appliquée),
      // on retombe sur un arrêt immédiat pour ne pas laisser les téléphones allumés.
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

  return new Response(JSON.stringify({ processed: Object.keys(summary).length, summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
