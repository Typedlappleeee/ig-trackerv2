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

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? ''

  // Auth : secret cron OU service_role
  const gotSecret = req.headers.get('x-cron-secret') ?? ''
  const gotAuth   = req.headers.get('authorization') ?? ''
  const authorized = (cronSecret && gotSecret === cronSecret) || gotAuth.includes(serviceKey)
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

  // 1bis. Tâches automatiques (recurring_tasks) dues → génère un scheduled_post
  // « enfant » lié par task_id, puis reprogramme la prochaine occurrence.
  // Le scheduled_post créé est ramassé dans la même invocation (étape 2).
  try {
    const { data: dueTasks } = await db.from('recurring_tasks')
      .select('*')
      .eq('status', 'active')
      .lte('next_run_at', nowIso)
      .order('next_run_at', { ascending: true })
      .limit(5)

    for (const task of dueTasks ?? []) {
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
      summary[`task:${task.id}`] = insErr ? `task insert failed: ${insErr.message}` : 'task queued'
    }
  } catch (err) {
    summary['recurring_tasks'] = `error: ${err instanceof Error ? err.message : String(err)}`
  }

  // 2. Posts dus (limite 2 par invocation pour rester sous la limite de temps)
  // type='story' exclu : les stories passent par de l'automation UI (~2 min par
  // téléphone) qui dépasse les limites serverless — elles s'exécutent côté app.
  const { data: due } = await db.from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .neq('type', 'story')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(2)

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
      for (let i = 0; i < phones.length; i++) {
        const phone = phones[i]
        const videoIdx = post.mode === 'random'
          ? Math.floor(Math.random() * videos.length)
          : i % videos.length
        const res = await gPost(bearer, '/rpa/task/instagramPubReels', {
          id:          phone.geelark_id,
          scheduleAt:  baseTs + i * delayMin * 60,
          description: post.caption,
          video:       [videos[videoIdx].token],
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

      if (delayMin > 0 && phones.length > 1) {
        // Tâches planifiées chez GeeLark — on ne peut pas attendre des heures ici
        log(`⏳ ${taskIds.length} tâche(s) planifiée(s) chez GeelarK avec ${delayMin} min d'écart.`)
        log('ℹ Les téléphones restent allumés le temps de l\'exécution des tâches.')
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
      await db.from('scheduled_posts').update({
        status: 'done', result: { logs }, error_msg: null,
      }).eq('id', post.id)

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
