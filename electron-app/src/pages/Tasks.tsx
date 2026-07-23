/**
 * Tasks.tsx — Tâches automatiques (recurring tasks)
 * Manages recurring posting tasks that run on a schedule.
 *
 * Table: recurring_tasks (must exist in Supabase)
 * CREATE TABLE IF NOT EXISTS recurring_tasks (
 *   id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id       uuid REFERENCES auth.users NOT NULL,
 *   org_id        uuid,
 *   name          text NOT NULL DEFAULT '',
 *   status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
 *   phones        jsonb NOT NULL DEFAULT '[]',
 *   videos        jsonb NOT NULL DEFAULT '[]',
 *   caption       text NOT NULL DEFAULT '',
 *   mode          text NOT NULL DEFAULT 'seq' CHECK (mode IN ('seq','random')),
 *   delay_minutes integer NOT NULL DEFAULT 0,
 *   recur_hours   numeric NOT NULL DEFAULT 24,
 *   next_run_at   timestamptz NOT NULL DEFAULT now(),
 *   reels_trial   boolean NOT NULL DEFAULT false,
 *   last_run_at   timestamptz,
 *   run_count     integer NOT NULL DEFAULT 0,
 *   created_at    timestamptz DEFAULT now()
 * );
 * ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "tasks_own" ON recurring_tasks FOR ALL USING (auth.uid() = user_id);
 *
 * -- Lien exécution → tâche (alimente l'onglet Historique) :
 * ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS task_id uuid;
 *
 * Migration complète : supabase/migrations/20260618_recurring_tasks_dashboard.sql
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { canAccessPhoneGroup, filterAccessiblePhones, accessibleGroupNames } from '@/lib/permissions'
import { BankPicker } from '@/pages/Bank'
import { postInstagramStory, stopPhone } from '@/lib/geelark'
import { registerStartedPhones } from '@/lib/phoneWatch'
import { pushNotification } from '@/lib/notificationStore'
import { TaskWizard } from '@/components/TaskWizard'
import { useTr, tr } from '@/lib/i18n'

type TaskType = 'publication' | 'story'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TaskPhone {
  id: string
  geelark_id: string
  phone_name: string
  ig_username: string | null
  link?: string   // Story : lien du sticker pour ce compte
}

interface TaskVideo {
  token: string   // GeeLark resourceUrl token OR Supabase signed URL (edge fn uploads server-side)
  title: string
}

// A segment = an independent sub-task within a task. Phones are shared at the
// task level; each segment has its own type, media pool, interval, caption…
interface TaskSegment {
  id: string
  type: TaskType
  videos: TaskVideo[]
  caption: string
  story_texts: string[]
  mode: 'seq' | 'random'
  recur_hours: number
  delay_minutes: number
  reels_trial: boolean
  auto_remove_videos: boolean
  next_run_at: string
}

interface RecurringTask {
  id: string
  user_id: string
  org_id: string | null
  name: string
  status: 'active' | 'paused'
  task_type: TaskType
  phones: TaskPhone[]
  videos: TaskVideo[]
  caption: string
  story_texts: string[]
  mode: 'seq' | 'random'
  delay_minutes: number
  recur_hours: number
  next_run_at: string
  reels_trial: boolean
  auto_remove_videos: boolean
  segments: TaskSegment[]
  steps?: TaskStep[]
  created_at: string
  last_run_at?: string | null
  run_count?: number | null
}

// A single execution of a task (a child scheduled_post linked by task_id)
interface TaskRun {
  id: string
  task_id: string | null
  created_by_name: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  scheduled_at: string
  executed_at: string | null
  phones: TaskPhone[]
  videos: TaskVideo[]
  caption: string
  result: { logs: string[] } | null
  error_msg: string | null
}

type StepType = 'publication' | 'story' | 'warmup'

interface TaskStep {
  id: string
  type: StepType
  // Publication-specific
  videos?: TaskVideo[]
  caption?: string
  reels_trial?: boolean
  auto_remove_videos?: boolean
  // Story-specific
  images?: TaskVideo[]
  story_texts?: string[]
  phone_links?: Record<string, string>
  // Warmup-specific
  warmup_minutes?: number
  // Common
  mode?: 'seq' | 'random'
  delay_minutes?: number
  delay_after_minutes?: number
}

interface SelVideo {
  filePath: string
  title: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCountdown(nextRunAt: string): string {
  const diff = new Date(nextRunAt).getTime() - Date.now()
  if (diff <= 0) return tr('Maintenant', 'Now')
  const h = Math.floor(diff / (1000 * 60 * 60))
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (h > 24) {
    const d = Math.floor(h / 24)
    const rh = h % 24
    return tr(`dans ${d}j ${rh}h`, `in ${d}d ${rh}h`)
  }
  if (h > 0) return tr(`dans ${h}h ${m}m`, `in ${h}h ${m}m`)
  return tr(`dans ${m}m`, `in ${m}m`)
}

// ── Client-side task execution (même logique que MassPosting) ──────────────────

const GL_BASE = 'https://openapi.geelark.com/open/v1'

async function glPost(bearer: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const url  = `${GL_BASE}${path}`
  const hdrs = { Authorization: `Bearer ${bearer}` }
  if (window.electronAPI?.geelarkRequest) {
    const r = await window.electronAPI.geelarkRequest({ method: 'POST', url, headers: hdrs, body })
    return (r?.data ?? {}) as Record<string, unknown>
  }
  const res = await fetch('/api/geelark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'POST', url, headers: hdrs, body }),
  })
  const r = await res.json() as { data?: unknown }
  return (r.data ?? {}) as Record<string, unknown>
}

async function resolveTaskVideoToken(bearer: string, video: TaskVideo): Promise<string> {
  const t = video.token
  if (!t.includes('supabase.co')) return t  // déjà un token GeeLark

  // Re-signe l'URL depuis le chemin de stockage Supabase
  let signedUrl = t
  const m = t.match(/\/storage\/v1\/object\/(?:sign|authenticated)\/content\/(.+?)(?:\?|$)/)
  if (m) {
    const { data } = await supabase.storage.from('content').createSignedUrl(m[1], 3600)
    if (data?.signedUrl) signedUrl = data.signedUrl
  }

  // Electron et Web : uploadVideoGeelark détecte https:// et route vers /api/geelark-upload (pas de CORS)
  if (window.electronAPI) {
    const up = await window.electronAPI.uploadVideoGeelark({ bearer, filePath: signedUrl })
    if (!up.ok || !up.token) throw new Error(tr(`Erreur upload GeeLark: ${up.error ?? '?'}`, `GeeLark upload error: ${up.error ?? '?'}`))
    return up.token
  }

  // Web : proxy Vercel /api/geelark-upload (timeout 60s)
  const r = await fetch('/api/geelark-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedUrl, bearer }),
  })
  if (!r.ok) throw new Error(`Proxy HTTP ${r.status}`)
  const j = await r.json() as { ok: boolean; token?: string; error?: string }
  if (!j.ok || !j.token) throw new Error(tr(`Proxy upload échoué: ${j.error ?? 'no token'}`, `Proxy upload failed: ${j.error ?? 'no token'}`))
  return j.token
}

// Story : on a juste besoin d'une URL https fraîche (pas d'upload GeeLark).
// Re-signe l'URL Supabase si nécessaire pour qu'elle ne soit pas expirée.
async function resolveTaskMediaUrl(media: TaskVideo): Promise<string> {
  const t = media.token
  const m = t.match(/\/storage\/v1\/object\/(?:sign|authenticated)\/content\/(.+?)(?:\?|$)/)
  if (m) {
    const { data } = await supabase.storage.from('content').createSignedUrl(m[1], 3600)
    if (data?.signedUrl) return data.signedUrl
  }
  return t
}

// A "unit" of work = the executable fields of either a legacy task or a segment.
interface RunUnit {
  type: TaskType
  videos: TaskVideo[]
  caption: string
  story_texts: string[]
  mode: 'seq' | 'random'
  delay_minutes: number
  reels_trial: boolean
  recur_hours: number
}

// Déclenche l'exécution des tâches dues CÔTÉ SERVEUR — la MÊME edge function que
// le cron (chaque minute). On ne poste plus directement depuis le client : ce
// chemin ne débitait AUCUN crédit (posting récurrent gratuit tant que l'app était
// ouverte) et pouvait double-exécuter une tâche (aucun verrou). L'edge function,
// elle, débite les crédits, réserve la tâche de façon atomique (anti-double) et
// crée le scheduled_post. Filtrée sur l'utilisateur courant via son JWT.
async function triggerDueTasksOnServer(): Promise<void> {
  try { await supabase.functions.invoke('run-scheduled-posts', { body: {} }) }
  catch { /* le cron serveur prendra le relais à la minute suivante */ }
}

// Entry point — routes to the segmented or legacy single-task flow.
// ⚠ Déprécié pour le déclenchement automatique (contournait la facturation) —
// conservé pour référence ; l'exécution passe par triggerDueTasksOnServer().
async function runTaskNow(task: RecurringTask, bearer: string): Promise<void> {
  if (task.segments && task.segments.length > 0) {
    const now = Date.now()
    const due = task.segments.filter(s => new Date(s.next_run_at).getTime() <= now)
    for (const seg of due) {
      await runSegmentNow(task, seg, bearer)
    }
    return
  }

  // Legacy single-task flow (no segments) — preserved as-is.
  const nowIso     = new Date().toISOString()
  const recurHours = Number(task.recur_hours) || 24
  const nextRunAt  = new Date(Date.now() + recurHours * 60 * 60 * 1000).toISOString()
  await executeUnit(
    task,
    {
      type: task.task_type, videos: task.videos, caption: task.caption,
      story_texts: task.story_texts, mode: task.mode, delay_minutes: task.delay_minutes,
      reels_trial: task.reels_trial, recur_hours: recurHours,
    },
    bearer,
    async () => {
      await supabase.from('recurring_tasks').update({
        next_run_at: nextRunAt,
        last_run_at: nowIso,
        run_count:   (Number(task.run_count) || 0) + 1,
      }).eq('id', task.id)
    },
  )
}

// Run a single segment of a task, then advance only that segment's timer and
// recompute the task-level next_run_at (= min of all segments) for the cron.
async function runSegmentNow(task: RecurringTask, segment: TaskSegment, bearer: string): Promise<void> {
  const nowIso     = new Date().toISOString()
  const recurHours = Number(segment.recur_hours) || 24
  const segNextRun = new Date(Date.now() + recurHours * 60 * 60 * 1000).toISOString()
  await executeUnit(
    task,
    {
      type: segment.type, videos: segment.videos, caption: segment.caption,
      story_texts: segment.story_texts, mode: segment.mode, delay_minutes: segment.delay_minutes,
      reels_trial: segment.reels_trial, recur_hours: recurHours,
    },
    bearer,
    async () => {
      // Re-fetch segments to avoid clobbering a sibling segment that ran in parallel
      const { data } = await supabase.from('recurring_tasks').select('segments').eq('id', task.id).maybeSingle()
      const raw = (data as { segments?: unknown } | null)?.segments
      let segs: TaskSegment[] = Array.isArray(raw) ? raw as TaskSegment[]
        : (typeof raw === 'string' ? JSON.parse(raw) as TaskSegment[] : task.segments)
      segs = segs.map(s => s.id === segment.id ? { ...s, next_run_at: segNextRun } : s)
      const minNext = segs.reduce((min, s) => {
        const t = new Date(s.next_run_at).getTime()
        return t < min ? t : min
      }, Infinity)
      await supabase.from('recurring_tasks').update({
        segments:    segs,
        next_run_at: new Date(isFinite(minNext) ? minNext : Date.now() + recurHours * 60 * 60 * 1000).toISOString(),
        last_run_at: nowIso,
        run_count:   (Number(task.run_count) || 0) + 1,
      }).eq('id', task.id)
    },
  )
}

// Executes one unit of work (legacy task or a segment). `updateTimer` is the
// caller-provided callback that advances the right timer afterwards.
async function executeUnit(
  task: RecurringTask,
  unit: RunUnit,
  bearer: string,
  updateTimer: () => Promise<void>,
): Promise<void> {
  const nowIso     = new Date().toISOString()
  const logs: string[] = []
  const log = (msg: string) => { logs.push(msg); console.log('[Task]', msg) }
  const recurHours = Number(unit.recur_hours) || 24

  // Toujours écrire l'historique + reset le timer, même en cas d'erreur
  const saveResult = async (status: 'done' | 'failed', errorMsg?: string) => {
    await supabase.from('scheduled_posts').insert({
      user_id:         task.user_id,
      org_id:          task.org_id ?? null,
      created_by_name: task.name || tr('Tâche auto', 'Auto task'),
      type:            unit.type === 'story' ? 'story' : 'mass_posting',
      status,
      scheduled_at:    nowIso,
      executed_at:     new Date().toISOString(),
      phones:          task.phones,
      videos:          unit.videos,
      caption:         unit.caption,
      delay_minutes:   unit.delay_minutes ?? 0,
      mode:            unit.mode ?? 'seq',
      bearer_token:    '',
      reels_trial:     unit.reels_trial ?? false,
      task_id:         task.id,
      result:          { logs },
      error_msg:       errorMsg ?? null,
    }).then(() => {}, () => {})
    await updateTimer()
  }

  if (!bearer) {
    log(tr('❌ Configuration GéeLark manquante', '❌ Missing GeeLark configuration'))
    await saveResult('failed', tr('bearer vide', 'empty bearer'))
    return
  }
  if (!task.phones.length) {
    log(tr('❌ Aucun téléphone dans la tâche', '❌ No phone in the task'))
    await saveResult('failed', tr('aucun téléphone', 'no phone'))
    return
  }
  if (!unit.videos.length) {
    log(unit.type === 'story' ? tr('❌ Aucune image dans la tâche', '❌ No image in the task') : tr('❌ Aucune vidéo dans la tâche', '❌ No video in the task'))
    await saveResult('failed', unit.type === 'story' ? tr('aucune image', 'no image') : tr('aucune vidéo', 'no video'))
    return
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STORY : flow comme l'onglet Story (image + lien sticker par compte).
  // Pas d'upload GeeLark ni de RPA Reels : postInstagramStory pilote le téléphone.
  // ─────────────────────────────────────────────────────────────────────────────
  if (unit.type === 'story') {
    try {
      const texts = Array.isArray(unit.story_texts) ? unit.story_texts.filter(Boolean) : []

      // Résolution des URLs d'images (re-signe les URLs Supabase)
      log(tr(`▶ Préparation de ${unit.videos.length} image(s)…`, `▶ Preparing ${unit.videos.length} image(s)…`))
      const imageUrls: (string | null)[] = []
      for (let i = 0; i < unit.videos.length; i++) {
        try {
          imageUrls.push(await resolveTaskMediaUrl(unit.videos[i]))
        } catch (err) {
          log(tr(`❌ Image indisponible (${unit.videos[i].title || '?'})`, `❌ Image unavailable (${unit.videos[i].title || '?'})`))
          imageUrls.push(null)
        }
      }
      const validImages = imageUrls.filter((u): u is string => Boolean(u))
      if (!validImages.length) {
        log(tr('❌ Aucune image exploitable', '❌ No usable image'))
        await saveResult('failed', tr('Aucune image exploitable', 'No usable image'))
        return
      }

      // Pré-filtrer les téléphones valides (lien requis)
      const validPhones = task.phones.map((phone, i) => ({
        phone, i,
        name: phone.ig_username ?? phone.phone_name,
        link: (phone.link ?? '').trim(),
      }))
      validPhones.filter(p => !p.link).forEach(p => log(tr(`❌ ${p.name} : aucun lien configuré`, `❌ ${p.name}: no link configured`)))
      const phonesWithLink = validPhones.filter(p => p.link)

      // Démarrage groupé — UN seul appel /phone/start avec tous les IDs
      if (phonesWithLink.length > 0) {
        log(tr(`▶ Démarrage de ${phonesWithLink.length} téléphone(s)…`, `▶ Starting ${phonesWithLink.length} phone(s)…`))
        const storyIds = phonesWithLink.map(p => p.phone.geelark_id)
        const startRes = await glPost(bearer, '/phone/start', { ids: storyIds })
        const started = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
        log(tr(`  ${started} démarré(s)`, `  ${started} started`))
        registerStartedPhones(storyIds, { orgId: task.org_id ?? null, userId: task.user_id }, { reason: 'task_story' })
        log(tr('⏳ Attente 30s (démarrage)…', '⏳ Waiting 30s (startup)…'))
        await new Promise(r => setTimeout(r, 30_000))
      }

      const results = await Promise.all(phonesWithLink.map(async ({ phone, i, name, link }) => {
        const imageUrl = unit.mode === 'random'
          ? validImages[Math.floor(Math.random() * validImages.length)]
          : validImages[i % validImages.length]
        const linkText = texts.length
          ? (unit.mode === 'random' ? texts[Math.floor(Math.random() * texts.length)] : texts[i % texts.length])
          : undefined
        log(tr(`▶ Story ${name}…`, `▶ Story ${name}…`))
        try {
          const res = await postInstagramStory(
            bearer, phone.geelark_id,
            { imageUrl, linkUrl: link, linkText },
            m => log(`  ${name}: ${m}`),
          )
          if (res.ok) { log(tr(`✅ ${name} — story publiée`, `✅ ${name} — story published`)); return true }
          else { log(tr(`❌ ${name} : ${res.error ?? 'échec'}`, `❌ ${name}: ${res.error ?? 'failed'}`)); return false }
        } catch (err) {
          log(tr(`❌ ${name} : échec de la story`, `❌ ${name}: story failed`))
          return false
        } finally {
          try { await stopPhone(bearer, phone.geelark_id) } catch { /* ignore */ }
        }
      }))
      const okN = results.filter(Boolean).length

      log(tr(`⏰ Prochaine story dans ${recurHours}h`, `⏰ Next story in ${recurHours}h`))
      await saveResult(okN > 0 ? 'done' : 'failed', okN > 0 ? undefined : tr('Aucune story publiée', 'No story published'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(tr('❌ Erreur inattendue', '❌ Unexpected error'))
      await saveResult('failed', msg)
    }
    return
  }

  try {
    const phoneIds = task.phones.map(p => p.geelark_id)

    // Fetch fresh reels_trial_unsupported flags so we respect per-phone eligibility
    const { data: phoneFlagsRaw } = await supabase
      .from('phones').select('geelark_id, reels_trial_unsupported').in('geelark_id', phoneIds)
    const phoneFlags = new Map<string, boolean>(
      (phoneFlagsRaw ?? []).map(r => [r.geelark_id, r.reels_trial_unsupported ?? false])
    )

    // ── Step 1 : upload des vidéos vers GéeLark (séquentiel, AVANT le démarrage) ──
    // Exactement comme MassPosting : on upload d'abord, on démarre les téléphones
    // après. Sinon le téléphone reste inactif pendant l'upload et GéeLark l'éteint.
    log(tr(`📤 Envoi de ${unit.videos.length} vidéo(s)…`, `📤 Uploading ${unit.videos.length} video(s)…`))
    const tokenByIndex: (string | null)[] = await Promise.all(
      unit.videos.map(async (v, i) => {
        try {
          const tok = await resolveTaskVideoToken(bearer, v)
          log(tr(`✅ Vidéo ${i + 1}/${unit.videos.length} prête`, `✅ Video ${i + 1}/${unit.videos.length} ready`))
          return tok
        } catch (err) {
          log(tr(`❌ Vidéo ${i + 1} indisponible (${v.title || '?'})`, `❌ Video ${i + 1} unavailable (${v.title || '?'})`))
          return null
        }
      })
    )
    const validTokens = tokenByIndex.filter((t): t is string => Boolean(t))
    if (!validTokens.length) {
      const errMsg = tr('Envoi de toutes les vidéos a échoué', 'Upload of all videos failed')
      log(`❌ ${errMsg}`)
      await saveResult('failed', errMsg)
      return
    }

    // ── Step 2 : démarrage des téléphones (après upload) ──────────────────────
    log(tr(`▶ Démarrage de ${phoneIds.length} téléphone(s)…`, `▶ Starting ${phoneIds.length} phone(s)…`))
    const startRes = await glPost(bearer, '/phone/start', { ids: phoneIds })
    const started  = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
    log(tr(`  ${started} démarré(s)`, `  ${started} started`))
    registerStartedPhones(phoneIds, { orgId: task.org_id ?? null, userId: task.user_id }, { reason: 'task_publication' })
    if (started === 0) {
      log(tr('❌ Aucun téléphone démarré', '❌ No phone started'))
      log(tr(`⏰ Prochain post dans ${recurHours}h`, `⏰ Next post in ${recurHours}h`))
      await saveResult('failed', tr('Aucun téléphone démarré', 'No phone started'))
      return
    }

    // ── Step 3 : attente boot 20s ─────────────────────────────────────────────
    log(tr('⏳ Attente 20s (démarrage)…', '⏳ Waiting 20s (startup)…'))
    await new Promise(r => setTimeout(r, 20_000))

    // ── Step 4 : création des tâches RPA (séquentiel) ─────────────────────────
    log(tr(`▶ Lancement du posting sur ${task.phones.length} téléphone(s)…`, `▶ Starting posting on ${task.phones.length} phone(s)…`))
    const baseTs = Math.floor(Date.now() / 1000)
    const taskIdByGid: Record<string, string> = {}
    const rpaIds: string[] = []
    const trialReelsActive = new Set<string>()  // geelark_ids where shareType:2 was sent
    let fails = 0
    let rpaCreated = 0
    for (let i = 0; i < task.phones.length; i++) {
      const phone  = task.phones[i]
      const name   = phone.ig_username ?? phone.phone_name
      const vidIdx = unit.mode === 'random'
        ? Math.floor(Math.random() * validTokens.length)
        : i % validTokens.length
      const trialUnsupported = phoneFlags.get(phone.geelark_id) ?? false
      const useTrialReels = task.reels_trial && !trialUnsupported
      if (task.reels_trial && trialUnsupported)
        log(tr(`⚠ Trial Reels désactivé pour ${name} (compte non éligible)`, `⚠ Trial Reels disabled for ${name} (account not eligible)`))
      const res = await glPost(bearer, '/rpa/task/instagramPubReels', {
        id:          phone.geelark_id,
        scheduleAt:  baseTs + i * (unit.delay_minutes ?? 0) * 60,
        description: unit.caption,
        video:       [validTokens[vidIdx]],
        ...(unit.reels_trial ? { shareType: 2 } : {}),
      })
      if (res['code'] === 0) {
        rpaCreated++
        // GeeLark peut renvoyer l'ID sous data directement (string) ou data.id / data.taskId
        const d = res['data']
        let tid: string | undefined
        if (typeof d === 'string' && d) {
          tid = d
        } else if (d && typeof d === 'object') {
          const dObj = d as Record<string, unknown>
          const raw  = dObj['id'] ?? dObj['taskId'] ?? dObj['task_id']
          if (raw != null) tid = String(raw)
        }
        console.log('[Task] instagramPubReels response data:', JSON.stringify(d))
        if (tid) { rpaIds.push(tid); taskIdByGid[phone.geelark_id] = tid }
        if (useTrialReels) trialReelsActive.add(phone.geelark_id)
        log(tr(`✅ Publication lancée : ${name}`, `✅ Post started: ${name}`))
      } else {
        fails++
        log(`❌ ${name} : ${res['msg'] ?? tr('Instagram a refusé la publication', 'Instagram refused the post')}`)
        // Task refused while trial reels was active → mark phone
        if (useTrialReels) {
          await supabase.from('phones').update({ reels_trial_unsupported: true }).eq('geelark_id', phone.geelark_id)
          log(tr(`🔕 ${name} marqué : Trial Reels non supporté`, `🔕 ${name} flagged: Trial Reels unsupported`))
          phoneFlags.set(phone.geelark_id, true)
        }
      }
    }

    if (rpaCreated === 0) {
      log(tr('❌ Aucune publication lancée', '❌ No post started'))
      log(tr(`⏰ Prochain post dans ${recurHours}h`, `⏰ Next post in ${recurHours}h`))
      await saveResult('failed', tr('Aucune tâche RPA créée', 'No RPA task created'))
      await new Promise(r => setTimeout(r, 5_000))
      await glPost(bearer, '/phone/stop', { ids: phoneIds }).catch(() => {})
      return
    }

    // Si tâches créées mais IDs non extraits → même logique qu'MassPosting : auto-stop 5 min
    if (rpaIds.length === 0) {
      log(tr(`⏳ ${rpaCreated} publication(s) lancée(s) — arrêt automatique dans 5 min…`, `⏳ ${rpaCreated} post(s) started — auto-stop in 5 min…`))
      await new Promise(r => setTimeout(r, 5 * 60 * 1000))
      log(tr(`⏰ Prochain post dans ${recurHours}h`, `⏰ Next post in ${recurHours}h`))
      await saveResult('done')
      await glPost(bearer, '/phone/stop', { ids: phoneIds }).catch(() => {})
      return
    }

    // ── Step 5 : poll jusqu'à complétion (max 8 min) — éteint chaque tél fini ──
    log(tr(`⏳ Suivi de ${rpaIds.length} publication(s)…`, `⏳ Tracking ${rpaIds.length} post(s)…`))
    let pollDone = 0
    let pollFail = 0
    const pending  = new Set(rpaIds)
    const stopped  = new Set<string>()
    const deadline = Date.now() + 8 * 60 * 1000
    const gidByTid = new Map<string, string>()
    for (const [gid, tid] of Object.entries(taskIdByGid)) gidByTid.set(tid, gid)
    const STATUS: Record<number, string> = { 1: tr('En attente', 'Pending'), 2: tr('En cours', 'In progress'), 3: tr('✅ Terminé', '✅ Done'), 4: tr('❌ Échec', '❌ Failed'), 7: tr('Annulé', 'Cancelled') }
    while (pending.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 10_000))
      let qRes: Record<string, unknown>
      try {
        qRes = await glPost(bearer, '/task/query', { ids: [...pending] })
      } catch { continue }
      const d     = (qRes['data'] as Record<string, unknown>) ?? qRes
      const items = (d['items'] ?? d['list'] ?? d['tasks'] ?? d['records']) as Array<Record<string, unknown>> | undefined
      for (const item of (Array.isArray(items) ? items : [])) {
        const tid    = (item['id'] ?? item['taskId']) as string
        const status = Number(item['status'])
        if ([3, 4, 7].includes(status)) {
          pending.delete(tid)
          const gid  = gidByTid.get(tid)
          const phone = task.phones.find(p => p.geelark_id === gid)
          const name  = phone?.ig_username ?? phone?.phone_name ?? tid
          const fail  = item['failDesc'] ? ` — ${item['failDesc']}` : ''
          log(`${STATUS[status] ?? status} ${name}${fail}`)
          if (status === 3) {
            pollDone++
          } else {
            pollFail++
            // If trial reels was used for this phone and it failed → mark as unsupported
            if (gid && trialReelsActive.has(gid) && !(phoneFlags.get(gid) ?? false)) {
              await supabase.from('phones').update({ reels_trial_unsupported: true }).eq('geelark_id', gid)
              log(tr(`🔕 ${name} marqué : Trial Reels non supporté`, `🔕 ${name} flagged: Trial Reels unsupported`))
              phoneFlags.set(gid, true)
            }
          }
          // Éteint ce téléphone dès que sa tâche est finie
          if (gid && !stopped.has(gid)) {
            stopped.add(gid)
            await glPost(bearer, '/phone/stop', { ids: [gid] }).catch(() => {})
          }
        }
      }
    }
    if (pending.size > 0) log(tr(`⚠ ${pending.size} tâche(s) non confirmée(s) après 8 min`, `⚠ ${pending.size} task(s) not confirmed after 8 min`))

    // Arrêt des téléphones restants (timeout / pas de confirmation)
    const remaining = phoneIds.filter(id => !stopped.has(id))
    if (remaining.length > 0) {
      log(tr(`▶ Arrêt des ${remaining.length} téléphone(s) restant(s)…`, `▶ Stopping ${remaining.length} remaining phone(s)…`))
      await glPost(bearer, '/phone/stop', { ids: remaining }).catch(() => {})
    }

    const finalStatus = pollDone > 0 ? 'done' : (fails + pollFail >= task.phones.length ? 'failed' : 'done')
    log(tr(`⏰ Prochain post dans ${recurHours}h`, `⏰ Next post in ${recurHours}h`))
    await saveResult(finalStatus, finalStatus === 'failed' ? tr('Aucun posting réussi', 'No successful post') : undefined)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(tr(`❌ Erreur inattendue: ${msg}`, `❌ Unexpected error: ${msg}`))
    await saveResult('failed', msg)
  }
}

// A task is due if its (legacy) timer is reached, OR any segment is due.
function isTaskDue(task: RecurringTask): boolean {
  if (task.segments && task.segments.length > 0) {
    return task.segments.some(s => new Date(s.next_run_at).getTime() <= Date.now())
  }
  return new Date(task.next_run_at).getTime() <= Date.now()
}

// Earliest upcoming run across a task (segment-aware).
function taskNextRun(task: RecurringTask): string {
  if (task.segments && task.segments.length > 0) {
    return [...task.segments]
      .sort((a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime())[0]?.next_run_at
      ?? task.next_run_at
  }
  return task.next_run_at
}

function formatInterval(hours: number): string {
  if (hours < 1) return tr(`toutes les ${Math.round(hours * 60)} min`, `every ${Math.round(hours * 60)} min`)
  if (hours >= 24 && hours % 24 === 0) return tr(`toutes les ${hours / 24}j`, `every ${hours / 24}d`)
  return tr(`toutes les ${hours}h`, `every ${hours}h`)
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatRelativePast(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return tr('à venir', 'upcoming')
  const m = Math.floor(diff / 60000)
  if (m < 1) return tr("à l'instant", 'just now')
  if (m < 60) return tr(`il y a ${m} min`, `${m} min ago`)
  const h = Math.floor(m / 60)
  if (h < 24) return tr(`il y a ${h}h`, `${h}h ago`)
  const d = Math.floor(h / 24)
  return tr(`il y a ${d}j`, `${d}d ago`)
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────

function IconBolt({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  )
}

function IconPlus({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function IconEdit({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2l3 3L5 14H2v-3L11 2z"/>
    </svg>
  )
}

function IconTrash({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
    </svg>
  )
}

function IconPause({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/>
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/>
    </svg>
  )
}

function IconPlay({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4 2l10 6-10 6V2z" fill="currentColor"/>
    </svg>
  )
}

function IconX({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

function IconRepeat({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 3H5a4 4 0 0 0 0 8h2M3 13l2-2-2-2"/>
      <path d="M3 3h8a4 4 0 0 1 0 8h-2M13 3l-2 2 2 2"/>
    </svg>
  )
}

function IconPhone({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="3" y="1" width="8" height="12" rx="2" stroke={color} strokeWidth="1.3"/>
      <circle cx="7" cy="11" r="0.8" fill={color}/>
    </svg>
  )
}

function IconVideo({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="1" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.3"/>
      <path d="M9 5.5l4-2v7l-4-2V5.5z" stroke={color} strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

function IconLinkType({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  )
}

function IconClock({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="1.3"/>
      <path d="M7 4.5V7l1.5 1.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconCheck({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" fill="none">
      <path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Confirm Delete Dialog ──────────────────────────────────────────────────────

function ConfirmDeleteDialog({
  taskName,
  onConfirm,
  onCancel,
  busy,
}: {
  taskName: string
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
}) {
  const tr = useTr()
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(6,6,8,0.88)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#0F1014', border: '1px solid rgba(233,234,240,0.08)',
        borderRadius: 14, padding: '28px 28px 22px', maxWidth: 400, width: '100%',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          color: '#F87171',
        }}>
          <IconTrash size={18} />
        </div>
        <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--ivory)' }}>
          {tr('Supprimer cette tâche ?', 'Delete this task?')}
        </p>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          <span style={{ color: 'rgba(233,234,240,0.7)', fontWeight: 600 }}>"{taskName}"</span>{' '}
          {tr('sera définitivement supprimée. Cette action est irréversible.', 'will be permanently deleted. This action cannot be undone.')}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            className="sf-btn sf-btn-ghost cursor-pointer"
            style={{ flex: 1, opacity: busy ? 0.5 : 1 }}
          >
            {tr('Annuler', 'Cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="sf-btn sf-btn-danger cursor-pointer"
            style={{
              flex: 1, opacity: busy ? 0.5 : 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {busy ? tr('Suppression…', 'Deleting…') : tr('Supprimer', 'Delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CaptionBankPicker ──────────────────────────────────────────────────────────
// Modal to pick text items from caption_bank and append to a story's caption pool.

interface CaptionBankPickerProps {
  user: User
  currentOrg: { id: string } | null
  onSelect: (texts: string[]) => void
  onClose: () => void
}

interface CaptionPickerItem { id: string; title: string; content: string; folder: string | null }

function CaptionBankPicker({ user, currentOrg, onSelect, onClose }: CaptionBankPickerProps) {
  const tr = useTr()
  const [items, setItems]   = useState<CaptionPickerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    const base = supabase.from('caption_bank').select('id,title,content,folder').order('created_at', { ascending: false })
    const q = currentOrg
      ? base.eq('org_id', currentOrg.id)
      : base.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      setItems((data ?? []) as CaptionPickerItem[])
      setLoading(false)
    })
  }, [currentOrg?.id, user.id])

  const filtered = items.filter(it => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return it.title.toLowerCase().includes(q) || it.content.toLowerCase().includes(q)
  })

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  const confirm = () => {
    const texts = items.filter(it => selected.has(it.id)).map(it => it.content).filter(Boolean)
    onSelect(texts)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(6,6,8,0.92)', backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="anim-scale-in"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 80px)',
          background: '#0F1014', border: '1px solid rgba(233,234,240,0.08)',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(233,234,240,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#E9EAF0' }}>{tr('Banque de captions', 'Caption bank')}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(233,234,240,0.42)' }}>
              {selected.size > 0 ? tr(`${selected.size} caption${selected.size > 1 ? 's' : ''} sélectionnée${selected.size > 1 ? 's' : ''}`, `${selected.size} caption${selected.size > 1 ? 's' : ''} selected`) : tr('Sélectionne les captions à ajouter au pool', 'Select the captions to add to the pool')}
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer"
            style={{ background: 'none', border: 'none', color: 'rgba(233,234,240,0.42)', display: 'flex', padding: 6, borderRadius: 8 }}>
            <IconX size={12} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(233,234,240,0.06)', flexShrink: 0 }}>
          <input
            type="text"
            placeholder={tr('Rechercher…', 'Search…')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{
              width: '100%', height: 34, padding: '0 12px', fontSize: 13, boxSizing: 'border-box',
              background: 'rgba(233,234,240,0.03)', color: '#E9EAF0',
              border: '1px solid rgba(233,234,240,0.1)', borderRadius: 8, outline: 'none',
            }}
          />
        </div>

        {/* Items list */}
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', padding: '8px 12px' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'rgba(233,234,240,0.4)' }}>{tr('Chargement…', 'Loading…')}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'rgba(233,234,240,0.4)' }}>{tr('Aucune caption trouvée', 'No caption found')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {filtered.map(it => {
                const on = selected.has(it.id)
                return (
                  <button key={it.id} onClick={() => toggle(it.id)} className="cursor-pointer"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
                      padding: '9px 11px', borderRadius: 8, border: 'none',
                      background: on ? 'rgba(139,92,246,0.1)' : 'rgba(233,234,240,0.02)',
                      outline: on ? '1px solid rgba(139,92,246,0.32)' : '1px solid transparent',
                      transition: 'all 0.12s',
                    }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
                      background: on ? 'linear-gradient(135deg,#818CF8,#8B5CF6)' : 'transparent',
                      border: on ? 'none' : '1px solid rgba(233,234,240,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {on && <IconCheck size={7} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {it.title && (
                        <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: 'rgba(233,234,240,0.6)', letterSpacing: '0.02em' }}>{it.title}</p>
                      )}
                      <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(233,234,240,0.82)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {it.content.length > 160 ? it.content.slice(0, 160) + '…' : it.content}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid rgba(233,234,240,0.08)', flexShrink: 0,
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} className="cursor-pointer"
            style={{ padding: '9px 16px', fontSize: 11, fontWeight: 700, background: 'transparent', color: 'rgba(233,234,240,0.42)', border: '1px solid rgba(233,234,240,0.08)', borderRadius: 8 }}>
            {tr('Annuler', 'Cancel')}
          </button>
          <button
            onClick={confirm}
            disabled={selected.size === 0}
            className="cursor-pointer"
            style={{
              padding: '9px 20px', fontSize: 11, fontWeight: 800,
              background: selected.size > 0 ? 'linear-gradient(135deg,#6366F1,#8B5CF6)' : 'rgba(233,234,240,0.08)',
              color: selected.size > 0 ? '#fff' : 'rgba(233,234,240,0.3)',
              border: 'none', borderRadius: 8,
            }}
          >
            {tr('Ajouter', 'Add')} {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CreateTaskModal ────────────────────────────────────────────────────────────

const GOLD  = '#6366F1'
const IVORY = '#E9EAF0'
const MUTED = 'rgba(233,234,240,0.42)'
const HAIR  = 'rgba(233,234,240,0.08)'

function defaultNextRun(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Modal-only UI state for one segment (interval split into value + unit, etc.)
interface SegmentDraft {
  type: TaskType
  videos: SelVideo[]
  caption: string
  story_texts: string[]
  mode: 'seq' | 'random'
  recurValue: number
  recurUnit: 'minutes' | 'heures' | 'jours'
  delay_minutes: number
  reels_trial: boolean
  auto_remove_videos: boolean
  next_run_at: string   // datetime-local string ("YYYY-MM-DDTHH:mm")
}

function segUid(): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function emptySegmentDraft(): SegmentDraft {
  return {
    type: 'publication', videos: [], caption: '', story_texts: [],
    mode: 'seq', recurValue: 24, recurUnit: 'heures',
    delay_minutes: 0, reels_trial: false, auto_remove_videos: false,
    next_run_at: defaultNextRun(),
  }
}

function draftRecurHours(d: SegmentDraft): number {
  return d.recurUnit === 'jours' ? d.recurValue * 24
    : d.recurUnit === 'minutes' ? d.recurValue / 60
    : d.recurValue
}

function draftToSegment(draft: SegmentDraft, id: string, uploaded: TaskVideo[]): TaskSegment {
  return {
    id,
    type: draft.type,
    videos: uploaded,
    caption: draft.caption.trim(),
    story_texts: draft.type === 'story' ? draft.story_texts.filter(Boolean) : [],
    mode: draft.mode,
    recur_hours: draftRecurHours(draft),
    delay_minutes: draft.delay_minutes,
    reels_trial: draft.type === 'story' ? false : draft.reels_trial,
    auto_remove_videos: draft.auto_remove_videos,
    next_run_at: new Date(draft.next_run_at).toISOString(),
  }
}

function segmentToDraft(seg: TaskSegment): SegmentDraft {
  const recurUnit: 'minutes' | 'heures' | 'jours' = seg.recur_hours < 1 ? 'minutes'
    : seg.recur_hours % 24 === 0 && seg.recur_hours >= 24 ? 'jours' : 'heures'
  const recurValue = recurUnit === 'minutes' ? Math.round(seg.recur_hours * 60)
    : recurUnit === 'jours' ? seg.recur_hours / 24 : seg.recur_hours
  return {
    type: seg.type,
    videos: (seg.videos ?? []).map(v => ({ filePath: v.token, title: v.title })),
    caption: seg.caption ?? '',
    story_texts: seg.story_texts ?? [],
    mode: seg.mode ?? 'seq',
    recurValue, recurUnit,
    delay_minutes: seg.delay_minutes ?? 0,
    reels_trial: seg.reels_trial ?? false,
    auto_remove_videos: seg.auto_remove_videos ?? false,
    next_run_at: (seg.next_run_at ?? defaultNextRun()).slice(0, 16),
  }
}

interface CreateTaskModalProps {
  user: User
  editTask?: RecurringTask | null
  onSaved: () => void
  onClose: () => void
}

function CreateTaskModal({ user, editTask, onSaved, onClose }: CreateTaskModalProps) {
  const tr = useTr()
  const { currentOrg, role, perms } = useOrg()
  const conns = useConnections(user)
  const bearer = conns.bearer ?? ''

  const [phones, setPhones]           = useState<Phone[]>([])
  const [selPhones, setSelPhones]     = useState<Set<string>>(new Set(editTask?.phones.map(p => p.id) ?? []))
  const [phoneSearch, setPhoneSearch] = useState('')
  const [groups, setGroups]           = useState<string[]>(['Tous'])
  const [groupFilter, setGroupFilter] = useState('Tous')
  const [name, setName]               = useState(editTask?.name ?? '')

  // Segments — the heart of a task. Initialise from the edited task:
  //   • task with segments → one draft per segment
  //   • legacy task (no segments) → a single draft built from its top-level fields
  //   • new task → one empty draft
  const [segments, setSegments] = useState<SegmentDraft[]>(() => {
    if (editTask?.segments && editTask.segments.length > 0) {
      return editTask.segments.map(segmentToDraft)
    }
    if (editTask) {
      return [segmentToDraft({
        id: segUid(),
        type: editTask.task_type ?? 'publication',
        videos: editTask.videos ?? [],
        caption: editTask.caption ?? '',
        story_texts: editTask.story_texts ?? [],
        mode: editTask.mode ?? 'seq',
        recur_hours: editTask.recur_hours ?? 24,
        delay_minutes: editTask.delay_minutes ?? 0,
        reels_trial: editTask.reels_trial ?? false,
        auto_remove_videos: editTask.auto_remove_videos ?? false,
        next_run_at: editTask.next_run_at ?? new Date().toISOString(),
      })]
    }
    return [emptySegmentDraft()]
  })
  const [expandedIdx, setExpandedIdx]           = useState(0)
  const [showBankPickerFor, setShowBankPickerFor] = useState<number | null>(null)
  const [storyTextDraft, setStoryTextDraft]     = useState('')

  // Liens par compte (Story) — pré-remplis depuis la tâche éditée, sinon depuis l'onglet Story (localStorage)
  const [phoneLinks, setPhoneLinks]   = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    editTask?.phones.forEach(p => { if (p.link) init[p.id] = p.link })
    return init
  })
  const [taskType, setTaskType]         = useState<TaskType>(editTask?.task_type ?? segments[0]?.type ?? 'publication')
  const [showCaptionPickerFor, setShowCaptionPickerFor] = useState<number | null>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [progress, setProgress]       = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [sequenceMode, setSequenceMode] = useState(editTask ? ((editTask.steps?.length ?? 0) > 0 || (editTask.segments?.length ?? 0) > 0) : false)
  const [steps, setSteps]             = useState<TaskStep[]>(() => {
    if (editTask?.steps?.length) return editTask.steps
    return []
  })
  const [bankPickerTarget, setBankPickerTarget] = useState<{ stepIdx: number; field: 'videos' | 'images' } | null>(null)

  // Segment mutation helpers
  const patchSegment = (idx: number, patch: Partial<SegmentDraft>) =>
    setSegments(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  const addSegment = () => {
    setSegments(prev => [...prev, emptySegmentDraft()])
    setExpandedIdx(segments.length)   // expand the newly added one
    setStoryTextDraft('')
  }
  const removeSegment = (idx: number) => {
    setSegments(prev => prev.filter((_, i) => i !== idx))
    setExpandedIdx(prev => (prev >= idx && prev > 0 ? prev - 1 : prev))
  }

  useEffect(() => {
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg
      ? q.eq('org_id', currentOrg.id)
      : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      // 🔒 Filtre à la source : le membre ne voit que ses groupes autorisés.
      const ps = filterAccessiblePhones((data ?? []) as Phone[], role, perms)
      setPhones(ps)
      const grps = accessibleGroupNames(ps, role, perms)
      setGroups(['Tous', ...grps])
      // Auto-fill phone links from DB (phones.link column), unless already set by the editTask
      setPhoneLinks(prev => {
        const next = { ...prev }
        for (const p of ps) {
          if (p.link && !(p.id in next)) next[p.id] = p.link
        }
        return next
      })
    })
  }, [currentOrg?.id, user.id])

  const visiblePhones = phones.filter(p => {
    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
    if (groupFilter !== 'Tous' && p.group_name !== groupFilter) return false
    if (phoneSearch) {
      const q = phoneSearch.toLowerCase()
      return p.phone_name?.toLowerCase().includes(q) || p.ig_username?.toLowerCase().includes(q)
    }
    return true
  })

  const phoneList = phones.filter(p => selPhones.has(p.id))

  function togglePhone(id: string) {
    setSelPhones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Story : lien d'un compte — priorité : état local > DB (phone.link) > localStorage
  const getPhoneLink = (id: string): string => {
    if (id in phoneLinks) return phoneLinks[id]
    const dbPhone = phones.find(p => p.id === id)
    if (dbPhone?.link) return dbPhone.link
    return localStorage.getItem(`sf-story-link-${id}`) ?? ''
  }
  const setPhoneLink = (id: string, link: string) => {
    setPhoneLinks(prev => ({ ...prev, [id]: link }))
    if (link.trim()) localStorage.setItem(`sf-story-link-${id}`, link.trim())
    else localStorage.removeItem(`sf-story-link-${id}`)
  }
  function addStoryText(idx: number) {
    const v = storyTextDraft.trim()
    if (!v) return
    patchSegment(idx, { story_texts: [...segments[idx].story_texts, v] })
    setStoryTextDraft('')
  }

  const anyStory = segments.some(s => s.type === 'story')
  const phonesWithLink = phoneList.filter(p => getPhoneLink(p.id).trim()).length

  const isEdit = !!editTask
  // Le nom est optionnel — un nom est généré automatiquement s'il est vide.
  const canSubmit = !submitting
    && phoneList.length > 0
    && segments.length > 0
    && segments.every(s => s.videos.length > 0)
    && (!anyStory || phonesWithLink === phoneList.length)

  const totalMedia = segments.reduce((n, s) => n + s.videos.length, 0)

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: GOLD, display: 'block', marginBottom: 8,
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      // Upload each segment's media (publication local files → GeeLark; story/https → kept)
      const builtSegments: TaskSegment[] = []
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si]
        const isStory = seg.type === 'story'
        const uploaded: TaskVideo[] = []
        for (let i = 0; i < seg.videos.length; i++) {
          const v = seg.videos[i]
          setProgress(tr(`Segment ${si + 1}/${segments.length} — ${isStory ? 'image' : 'vidéo'} ${i + 1}/${seg.videos.length}…`, `Segment ${si + 1}/${segments.length} — ${isStory ? 'image' : 'video'} ${i + 1}/${seg.videos.length}…`))
          if (isStory || v.filePath.startsWith('http://') || v.filePath.startsWith('https://')) {
            uploaded.push({ token: v.filePath, title: v.title })
            continue
          }
          if (!bearer || !window.electronAPI) {
            uploaded.push({ token: v.filePath, title: v.title })
            continue
          }
          const up = await window.electronAPI.uploadVideoGeelark({ bearer, filePath: v.filePath })
          if (up && up.ok && up.token) uploaded.push({ token: up.token, title: v.title })
          else throw new Error(tr(`Upload "${v.title}" échoué : ${up?.error ?? 'erreur inconnue'}`, `Upload "${v.title}" failed: ${up?.error ?? 'unknown error'}`))
        }
        builtSegments.push(draftToSegment(seg, segUid(), uploaded))
      }

      setProgress(tr('Sauvegarde de la tâche…', 'Saving task…'))

      const minNext = builtSegments.reduce(
        (min, s) => Math.min(min, new Date(s.next_run_at).getTime()), Infinity,
      )
      const first = builtSegments[0]
      const autoName = tr(`Tâche du ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`, `Task ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}`)
      const taskData = {
        user_id:       user.id,
        org_id:        currentOrg?.id ?? null,
        name:          name.trim() || autoName,
        status:        (editTask?.status ?? 'active') as 'active' | 'paused',
        segments:      builtSegments,
        // Top-level mirror of the first segment — keeps the server cron & older code working
        task_type:     first.type,
        phones:        phoneList.map(p => ({
          id: p.id, geelark_id: p.geelark_id,
          phone_name: p.phone_name, ig_username: p.ig_username ?? null,
          ...(anyStory ? { link: getPhoneLink(p.id).trim() } : {}),
        })),
        videos:        first.videos,
        caption:       first.caption,
        story_texts:   first.story_texts,
        mode:          first.mode,
        delay_minutes: first.delay_minutes,
        recur_hours:        first.recur_hours,
        next_run_at:        new Date(isFinite(minNext) ? minNext : Date.now()).toISOString(),
        reels_trial:        first.reels_trial,
        auto_remove_videos: first.auto_remove_videos,
        steps:              sequenceMode ? steps : [],
      }

      const saveTask = async (payload: Record<string, unknown>) => {
        if (isEdit && editTask) {
          return supabase.from('recurring_tasks').update(payload).eq('id', editTask.id)
        }
        return supabase.from('recurring_tasks').insert(payload)
      }

      let { error: err } = await saveTask(taskData)
      // Rétro-compat : colonne segments manquante (migration non appliquée) → on
      // sauvegarde la première sous-tâche en mode legacy (mono-segment).
      if (err && /segments/i.test(err.message) && /column|schema|cache/i.test(err.message)) {
        const { segments: _seg, ...fallback } = taskData
        ;({ error: err } = await saveTask(fallback))
        if (!err && builtSegments.length > 1) {
          setError(tr('⚠ Multi-segments non supporté tant que la migration SQL n\'est pas appliquée — seul le 1er segment a été sauvegardé.', '⚠ Multi-segments not supported until the SQL migration is applied — only the 1st segment was saved.'))
        }
      }
      // Rétro-compat : colonnes task_type / story_texts manquantes
      if (err && /(task_type|story_texts)/i.test(err.message) && /column|schema|cache/i.test(err.message)) {
        const { task_type: _t, story_texts: _s, segments: _sg, ...fallback } = taskData
        ;({ error: err } = await saveTask(fallback))
      }
      // Rétro-compat : colonne auto_remove_videos manquante
      if (err && /auto_remove_videos/i.test(err.message) && /column|schema|cache/i.test(err.message)) {
        const { auto_remove_videos: _omit, segments: _sg2, ...fallback } = taskData
        ;({ error: err } = await saveTask(fallback))
      }
      // Rétro-compat : colonne recur_hours integer au lieu de numeric → arrondir
      if (err && /recur_hours/i.test(err.message) && /integer/i.test(err.message)) {
        const rounded = { ...taskData, recur_hours: Math.max(1, Math.round(taskData.recur_hours)) }
        ;({ error: err } = await saveTask(rounded))
        if (!err) setError(tr('⚠ Intervalles en minutes non supportés tant que la migration SQL n\'est pas appliquée — sauvegardé en heures.', '⚠ Minute intervals not supported until the SQL migration is applied — saved in hours.'))
      }
      // Rétro-compat : colonne steps manquante
      if (err && /steps/i.test(err.message) && /column|schema|cache/i.test(err.message)) {
        const { steps: _omit, ...fallback } = taskData
        ;({ error: err } = await saveTask(fallback))
      }
      if (err) throw err

      onSaved()
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message
        : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message)
        : String(e)
      setError(msg)
      setSubmitting(false)
      setProgress('')
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(6,6,8,0.9)', backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={() => !submitting && onClose()}
    >
      <div
        className="anim-scale-in"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: 'calc(100vh - 48px)',
          background: '#0F1014', border: `1px solid ${HAIR}`,
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '17px 22px', borderBottom: `1px solid ${HAIR}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconBolt size={16} color={GOLD} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: IVORY }}>
              {isEdit ? tr('Modifier la tâche', 'Edit task') : tr('Nouvelle tâche automatique', 'New automatic task')}
            </span>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="cursor-pointer"
            style={{ background: 'none', border: 'none', color: MUTED, display: 'flex', padding: 6, borderRadius: 8 }}
          >
            <IconX size={12} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 22px',
          display: 'flex', flexDirection: 'column', gap: 22, scrollbarWidth: 'thin',
        }}>

          {!bearer && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              border: '1px solid rgba(217,185,127,0.35)', fontSize: 12, color: '#D9B97F',
              background: 'rgba(217,185,127,0.06)',
            }}>
              {tr('Token GéeLark manquant — configure-le dans Paramètres → Connexions.', 'Missing GeeLark token — configure it in Settings → Connections.')}
            </div>
          )}

          {/* ── Nom ── */}
          <section>
            <span style={labelStyle}>
              {tr('Nom de la tâche', 'Task name')}
              <span style={{ color: MUTED, letterSpacing: 'normal', fontSize: 10, textTransform: 'none', fontWeight: 500 }}> {tr('— optionnel', '— optional')}</span>
            </span>
            <input
              type="text"
              className="sf-input"
              placeholder={tr('Ex : Posts quotidiens lifestyle…', 'e.g. Daily lifestyle posts…')}
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', height: 38 }}
            />
          </section>

          {/* ── Téléphones ── */}
          <section>
            <span style={labelStyle}>
              {tr('Téléphones', 'Phones')}{phoneList.length > 0 && (
                <span style={{ color: IVORY, letterSpacing: 'normal', fontSize: 11, textTransform: 'none', fontWeight: 500 }}>
                  {' '}{tr(`— ${phoneList.length} sélectionné${phoneList.length > 1 ? 's' : ''}`, `— ${phoneList.length} selected`)}
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              {groups.length > 1 && (
                <select
                  value={groupFilter}
                  onChange={e => setGroupFilter(e.target.value)}
                  className="cursor-pointer"
                  style={{
                    height: 30, padding: '0 8px', fontSize: 12,
                    background: 'transparent', color: IVORY,
                    border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none',
                  }}
                >
                  {groups.map(g => (
                    <option key={g} value={g} style={{ background: '#0F1014', color: IVORY }}>{g === 'Tous' ? tr('Tous', 'All') : g}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder={tr('Rechercher…', 'Search…')}
                value={phoneSearch}
                onChange={e => setPhoneSearch(e.target.value)}
                style={{
                  flex: 1, height: 30, padding: '0 2px', fontSize: 12,
                  background: 'transparent', color: IVORY,
                  border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(99,102,241,0.6)' }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = HAIR }}
              />
              <button
                onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
                className="cursor-pointer"
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: GOLD, background: 'none', border: 'none', padding: '0 4px' }}
              >
                {tr('Tous', 'All')}
              </button>
              <button
                onClick={() => setSelPhones(new Set())}
                className="cursor-pointer"
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, background: 'none', border: 'none', padding: '0 4px' }}
              >
                {tr('Aucun', 'None')}
              </button>
            </div>
            {visiblePhones.length === 0 ? (
              <div style={{
                padding: '24px 16px', fontSize: 12, color: MUTED, textAlign: 'center',
                border: `1px solid ${HAIR}`, borderRadius: 10,
              }}>
                {tr('Aucun téléphone', 'No phone')}
              </div>
            ) : (
              <div style={{
                maxHeight: 224, overflowY: 'auto', scrollbarWidth: 'thin',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7,
                padding: 2,
              }}>
                {visiblePhones.map(phone => {
                  const checked = selPhones.has(phone.id)
                  const initial = (phone.ig_username ?? phone.phone_name ?? '?').charAt(0).toUpperCase()
                  return (
                    <button
                      key={phone.id}
                      onClick={() => togglePhone(phone.id)}
                      className="cursor-pointer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '8px 10px', textAlign: 'left', borderRadius: 10,
                        border: `1px solid ${checked ? 'rgba(99,102,241,0.5)' : HAIR}`,
                        background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: checked ? GOLD : 'rgba(255,255,255,0.05)',
                        color: checked ? '#fff' : 'rgba(233,234,240,0.55)',
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {initial}
                      </div>
                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0, fontSize: 12, fontWeight: 600,
                          color: checked ? IVORY : 'rgba(233,234,240,0.7)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {phone.phone_name}
                        </p>
                        <p style={{
                          margin: 0, fontSize: 10.5,
                          color: checked ? 'rgba(129,140,248,0.8)' : MUTED,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {phone.ig_username ? `@${phone.ig_username}` : (phone.group_name || tr('sans groupe', 'no group'))}
                        </p>
                      </div>
                      {/* Check indicator */}
                      <div style={{
                        width: 16, height: 16, flexShrink: 0, borderRadius: 5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: checked ? GOLD : 'transparent',
                        border: checked ? 'none' : '1px solid rgba(233,234,240,0.18)',
                      }}>
                        {checked && <IconCheck />}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Mode séquence toggle ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setSequenceMode(v => !v)}
                className="cursor-pointer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', borderRadius: 10, width: '100%', textAlign: 'left',
                  border: `1px solid ${sequenceMode ? 'rgba(99,102,241,0.5)' : HAIR}`,
                  background: sequenceMode ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: sequenceMode ? GOLD : 'rgba(255,255,255,0.05)',
                  color: sequenceMode ? '#fff' : 'rgba(233,234,240,0.55)',
                }}>
                  <IconRepeat size={16} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: sequenceMode ? IVORY : 'rgba(233,234,240,0.72)' }}>
                    {tr('Mode séquence', 'Sequence mode')}
                  </p>
                  <p style={{ margin: 0, fontSize: 10.5, color: sequenceMode ? 'rgba(129,140,248,0.85)' : MUTED }}>
                    {tr('Enchaîner plusieurs actions (publication, story, warmup…)', 'Chain multiple actions (post, story, warmup…)')}
                  </p>
                </div>
                <div style={{
                  marginLeft: 'auto', width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                  background: sequenceMode ? GOLD : 'rgba(233,234,240,0.12)',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute', top: 3, left: sequenceMode ? 18 : 3, width: 14, height: 14,
                    borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </div>
              </button>
            </div>
          </section>

          {/* ── Séquence builder ── */}
          {sequenceMode && (
            <section>
              <span style={labelStyle}>{tr("Séquence d'actions", 'Action sequence')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {steps.map((step, idx) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    index={idx}
                    total={steps.length}
                    phones={phoneList}
                    getPhoneLink={getPhoneLink}
                    setPhoneLink={setPhoneLink}
                    onChange={updated => setSteps(prev => prev.map((s, i) => i === idx ? updated : s))}
                    onDelete={() => setSteps(prev => prev.filter((_, i) => i !== idx))}
                    onMoveUp={() => {
                      if (idx === 0) return
                      setSteps(prev => {
                        const next = [...prev]
                        ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                        return next
                      })
                    }}
                    onMoveDown={() => {
                      if (idx === steps.length - 1) return
                      setSteps(prev => {
                        const next = [...prev]
                        ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                        return next
                      })
                    }}
                    onShowBankPicker={field => setBankPickerTarget({ stepIdx: idx, field })}
                  />
                ))}
                <button
                  onClick={() => setSteps(prev => [
                    ...prev,
                    { id: Math.random().toString(36).slice(2), type: 'publication', videos: [], caption: '' },
                  ])}
                  className="cursor-pointer"
                  style={{
                    padding: '10px 16px', fontSize: 10.5, fontWeight: 700,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    background: 'transparent', color: GOLD,
                    border: `1px dashed rgba(99,102,241,0.4)`, borderRadius: 8,
                    transition: 'all 0.15s',
                  }}
                >
                  {tr('+ Ajouter une étape', '+ Add a step')}
                </button>
              </div>
            </section>
          )}


          {/* ── Liens par compte (Story) ── */}
          {anyStory && phoneList.length > 0 && (
            <section>
              <span style={labelStyle}>
                {tr('Lien par compte', 'Link per account')}
                <span style={{ color: phonesWithLink === phoneList.length ? '#34D399' : '#F59E0B', letterSpacing: 'normal', fontSize: 11, textTransform: 'none', fontWeight: 600 }}>
                  {' '}— {phonesWithLink}/{phoneList.length}
                </span>
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 220, overflowY: 'auto', scrollbarWidth: 'thin', padding: 2 }}>
                {phoneList.map(p => {
                  const link = getPhoneLink(p.id)
                  const filled = !!link.trim()
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.05)', color: 'rgba(233,234,240,0.6)',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {(p.ig_username ?? p.phone_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 11.5, color: 'rgba(233,234,240,0.7)', width: 120, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.ig_username ? `@${p.ig_username}` : p.phone_name}
                      </span>
                      <input
                        type="url"
                        value={link}
                        onChange={e => setPhoneLink(p.id, e.target.value)}
                        placeholder={tr('https://lien-de-ce-compte…', 'https://link-for-this-account…')}
                        style={{
                          flex: 1, height: 32, padding: '0 10px', fontSize: 12,
                          background: 'rgba(233,234,240,0.02)', color: IVORY,
                          border: `1px solid ${filled ? 'rgba(52,211,153,0.4)' : 'rgba(245,158,11,0.4)'}`,
                          borderRadius: 8, outline: 'none',
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Segments ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <span style={{ ...labelStyle, marginBottom: 2 }}>{tr('Sous-tâches', 'Sub-tasks')}</span>
                <p style={{ margin: 0, fontSize: 11, color: MUTED }}>
                  {tr("Chaque sous-tâche s'exécute indépendamment sur les mêmes téléphones.", 'Each sub-task runs independently on the same phones.')}
                </p>
              </div>
              <button
                onClick={addSegment}
                className="cursor-pointer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', fontSize: 11, fontWeight: 700,
                  background: 'rgba(99,102,241,0.1)', color: '#818CF8',
                  border: '1px solid rgba(99,102,241,0.28)', borderRadius: 8,
                  flexShrink: 0,
                }}
              >
                <IconPlus size={10} /> {tr('Nouvelle sous-tâche', 'New sub-task')}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {segments.map((seg, idx) => {
                const isStory = seg.type === 'story'
                const open = expandedIdx === idx
                const storyAccent = '#A78BFA'
                const pubAccent   = '#818CF8'
                const accent = isStory ? storyAccent : pubAccent
                const accentAlpha = isStory ? 'rgba(167,139,250,' : 'rgba(129,140,248,'
                const intervalLabel = formatInterval(draftRecurHours(seg))
                return (
                  <div key={idx} style={{
                    borderRadius: 12,
                    border: `1px solid ${open ? accentAlpha + '0.35)' : HAIR}`,
                    background: open ? accentAlpha + '0.03)' : 'rgba(255,255,255,0.015)',
                    overflow: 'hidden', transition: 'border-color 0.18s, background 0.18s',
                  }}>
                    {/* Card header — always visible */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 0,
                      borderLeft: `3px solid ${open ? accent : 'transparent'}`,
                      transition: 'border-color 0.18s',
                    }}>
                      <button
                        onClick={() => setExpandedIdx(open ? -1 : idx)}
                        className="cursor-pointer"
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 14px 12px 13px', background: 'transparent', border: 'none', textAlign: 'left',
                        }}
                      >
                        {/* Type pill */}
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: isStory ? 'rgba(139,92,246,0.1)' : 'rgba(99,102,241,0.1)',
                          color: accent,
                          border: `1px solid ${isStory ? 'rgba(139,92,246,0.28)' : 'rgba(99,102,241,0.28)'}`,
                          borderRadius: 8, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, flexShrink: 0,
                        }}>
                          {isStory ? <IconLinkType size={11} /> : <IconVideo size={11} />}
                          {isStory ? tr('Story', 'Story') : tr('Publication', 'Post')}
                        </span>
                        {/* Summary */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, color: IVORY, fontWeight: 600 }}>
                            {intervalLabel}
                          </span>
                          <span style={{ fontSize: 11, color: MUTED, marginLeft: 8 }}>
                            · {seg.videos.length} {isStory ? tr('image', 'image') : tr('vidéo', 'video')}{seg.videos.length !== 1 ? 's' : ''}
                            {isStory && seg.story_texts.length > 0 && ` · ${seg.story_texts.length} caption${seg.story_texts.length > 1 ? 's' : ''}`}
                          </span>
                        </div>
                        {/* Chevron */}
                        <span style={{ display: 'flex', color: MUTED, flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}>
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </span>
                      </button>
                      {/* Delete — only when multiple segments */}
                      {segments.length > 1 && (
                        <button
                          onClick={() => removeSegment(idx)}
                          title={tr('Supprimer cette sous-tâche', 'Delete this sub-task')}
                          className="cursor-pointer"
                          style={{
                            width: 36, height: 36, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'none', border: 'none', marginRight: 6,
                            color: 'rgba(248,113,113,0.55)', borderRadius: 8,
                          }}
                        >
                          <IconTrash size={12} />
                        </button>
                      )}
                    </div>

                    {/* Expanded body */}
                    {open && (
                      <div style={{ borderTop: `1px solid ${HAIR}`, padding: '16px 16px 20px' }}>

                        {/* ── Type ── */}
                        <div style={{ marginBottom: 18 }}>
                          <p style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>Type</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {([
                              { k: 'publication' as const, title: tr('Publication', 'Post'), sub: tr('Reels Instagram', 'Instagram Reels'), icon: <IconVideo size={16} color="currentColor" /> },
                              { k: 'story'       as const, title: tr('Story', 'Story'),       sub: tr('Image + lien', 'Image + link'),  icon: <IconLinkType size={16} color="currentColor" /> },
                            ]).map(opt => {
                              const active = seg.type === opt.k
                              const optAccent = opt.k === 'story' ? storyAccent : pubAccent
                              return (
                                <button key={opt.k}
                                  onClick={() => patchSegment(idx, { type: opt.k })}
                                  className="cursor-pointer"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 11,
                                    padding: '11px 14px', borderRadius: 8,
                                    border: `1px solid ${active ? (opt.k === 'story' ? 'rgba(167,139,250,0.45)' : 'rgba(99,102,241,0.45)') : HAIR}`,
                                    background: active ? (opt.k === 'story' ? 'rgba(167,139,250,0.08)' : 'rgba(99,102,241,0.08)') : 'rgba(255,255,255,0.02)',
                                    color: active ? optAccent : 'rgba(233,234,240,0.55)',
                                    transition: 'all 0.15s',
                                  }}>
                                  <span style={{
                                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: active ? (opt.k === 'story' ? 'rgba(167,139,250,0.12)' : 'rgba(99,102,241,0.12)') : 'rgba(255,255,255,0.04)',
                                  }}>
                                    {opt.icon}
                                  </span>
                                  <div style={{ textAlign: 'left' }}>
                                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: active ? IVORY : 'rgba(233,234,240,0.6)' }}>{opt.title}</p>
                                    <p style={{ margin: 0, fontSize: 10.5, color: active ? (opt.k === 'story' ? 'rgba(167,139,250,0.7)' : 'rgba(129,140,248,0.7)') : MUTED }}>{opt.sub}</p>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* ── Médias ── */}
                        <div style={{ marginBottom: 18 }}>
                          <p style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>
                            {isStory ? tr('Images', 'Images') : tr('Vidéos', 'Videos')}
                            {seg.videos.length > 0 && <span style={{ color: IVORY, letterSpacing: 'normal', textTransform: 'none', fontWeight: 500, fontSize: 11 }}> — {seg.videos.length}</span>}
                          </p>
                          {seg.videos.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                              {seg.videos.map((v, i) => (
                                <span key={i} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '4px 8px 4px 6px', borderRadius: 8,
                                  border: `1px solid ${HAIR}`,
                                  fontSize: 11.5, color: 'rgba(233,234,240,0.7)',
                                  background: 'rgba(233,234,240,0.03)',
                                }}>
                                  <span style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: accentAlpha + '0.15)', color: accent, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                                  {v.title.length > 22 ? v.title.slice(0, 22) + '…' : v.title}
                                  <button
                                    onClick={() => patchSegment(idx, { videos: seg.videos.filter((_, j) => j !== i) })}
                                    className="cursor-pointer"
                                    style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.6)', display: 'flex', padding: 0, cursor: 'pointer' }}
                                  >
                                    <IconX size={8} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => setShowBankPickerFor(idx)}
                            className="cursor-pointer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 7,
                              padding: '7px 14px', fontSize: 11, fontWeight: 700,
                              background: accentAlpha + '0.1)', color: accent,
                              border: `1px solid ${accentAlpha + '0.28)'}`, borderRadius: 8,
                            }}
                          >
                            <IconPlus size={10} /> {tr('Depuis la banque de médias', 'From the media bank')}
                          </button>
                        </div>

                        {/* ── Légende (Publication) ── */}
                        {!isStory && (
                          <div style={{ marginBottom: 18 }}>
                            <p style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>{tr('Légende', 'Caption')}</p>
                            <textarea
                              value={seg.caption}
                              onChange={e => patchSegment(idx, { caption: e.target.value })}
                              rows={3}
                              placeholder={tr('Description Instagram…', 'Instagram description…')}
                              style={{
                                width: '100%', minHeight: 68, padding: '10px 12px', fontSize: 13, lineHeight: 1.6,
                                background: 'rgba(233,234,240,0.02)', color: IVORY, resize: 'vertical',
                                border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none',
                                fontFamily: 'inherit', boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        )}

                        {/* ── Pool de captions (Story) ── */}
                        {isStory && (
                          <div style={{ marginBottom: 18 }}>
                            <p style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>{tr('Pool de captions', 'Caption pool')}</p>
                            <p style={{ fontSize: 11, color: MUTED, margin: '0 0 10px' }}>{tr('Chaque compte pioche une caption aléatoire dans ce pool.', 'Each account picks a random caption from this pool.')}</p>
                            {/* Existing captions */}
                            {seg.story_texts.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                                {seg.story_texts.map((txt, i) => (
                                  <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '7px 10px', borderRadius: 8,
                                    border: `1px solid ${HAIR}`,
                                    background: 'rgba(233,234,240,0.02)',
                                  }}>
                                    <span style={{ width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(167,139,250,0.12)', color: storyAccent, fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                                    <span style={{ flex: 1, fontSize: 12, color: 'rgba(233,234,240,0.75)', lineHeight: 1.5, wordBreak: 'break-word' }}>{txt}</span>
                                    <button
                                      onClick={() => patchSegment(idx, { story_texts: seg.story_texts.filter((_, j) => j !== i) })}
                                      className="cursor-pointer"
                                      style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.55)', display: 'flex', padding: 0, flexShrink: 0 }}
                                    >
                                      <IconX size={9} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Add caption row */}
                            <div style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                              <input
                                type="text"
                                value={open ? storyTextDraft : ''}
                                onChange={e => setStoryTextDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStoryText(idx) } }}
                                placeholder={tr('Ex : Voir le lien en bio 👆', 'e.g. See the link in bio 👆')}
                                style={{
                                  flex: 1, height: 36, padding: '0 12px', fontSize: 13,
                                  background: 'rgba(233,234,240,0.02)', color: IVORY,
                                  border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none',
                                }}
                              />
                              <button
                                onClick={() => addStoryText(idx)}
                                disabled={!storyTextDraft.trim()}
                                className="cursor-pointer"
                                style={{
                                  padding: '0 14px', fontSize: 11, fontWeight: 700,
                                  background: storyTextDraft.trim() ? 'rgba(167,139,250,0.12)' : 'rgba(233,234,240,0.05)',
                                  color: storyTextDraft.trim() ? storyAccent : MUTED,
                                  border: `1px solid ${storyTextDraft.trim() ? 'rgba(167,139,250,0.3)' : HAIR}`,
                                  borderRadius: 8,
                                }}
                              >
                                {tr('Ajouter', 'Add')}
                              </button>
                            </div>
                            {/* Import from caption bank */}
                            <button
                              onClick={() => setShowCaptionPickerFor(idx)}
                              className="cursor-pointer"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 7,
                                padding: '7px 13px', fontSize: 11, fontWeight: 700,
                                background: 'rgba(167,139,250,0.07)', color: storyAccent,
                                border: '1px solid rgba(167,139,250,0.25)', borderRadius: 8,
                              }}
                            >
                              <IconPlus size={10} /> {tr('Depuis la banque de captions', 'From the caption bank')}
                            </button>
                          </div>
                        )}

                        {/* ── Paramètres ── */}
                        <div>
                          <p style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px' }}>{tr('Paramètres', 'Settings')}</p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                            {/* Intervalle */}
                            <div>
                              <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{tr('Intervalle', 'Interval')}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="number" min={1} max={9999} value={seg.recurValue}
                                  onChange={e => patchSegment(idx, { recurValue: Math.max(1, Number(e.target.value) || 24) })}
                                  style={{ width: 62, height: 34, padding: '0 8px', fontSize: 13, textAlign: 'center', background: 'rgba(233,234,240,0.02)', color: IVORY, border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none' }} />
                                <select value={seg.recurUnit}
                                  onChange={e => patchSegment(idx, { recurUnit: e.target.value as 'minutes' | 'heures' | 'jours' })}
                                  className="cursor-pointer"
                                  style={{ height: 34, padding: '0 6px', fontSize: 12, background: '#0F1014', color: IVORY, border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none' }}>
                                  <option value="minutes">min</option>
                                  <option value="heures">h</option>
                                  <option value="jours">{tr('j', 'd')}</option>
                                </select>
                              </div>
                            </div>
                            {/* Premier post */}
                            <div style={{ gridColumn: 'span 2' }}>
                              <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{tr('Premier post', 'First post')}</p>
                              <input type="datetime-local" value={seg.next_run_at}
                                onChange={e => patchSegment(idx, { next_run_at: e.target.value })}
                                style={{ height: 34, padding: '0 10px', fontSize: 12, colorScheme: 'dark', background: 'rgba(233,234,240,0.02)', color: IVORY, border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                            </div>
                            {/* Mode */}
                            <div>
                              <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{tr('Ordre médias', 'Media order')}</p>
                              <div style={{ display: 'flex', border: `1px solid ${HAIR}`, borderRadius: 8, overflow: 'hidden', height: 34 }}>
                                {([{ k: 'seq', l: tr('Seq.', 'Seq.') }, { k: 'random', l: tr('Aléa.', 'Rand.') }] as const).map(m => (
                                  <button key={m.k} onClick={() => patchSegment(idx, { mode: m.k })} className="cursor-pointer"
                                    style={{
                                      flex: 1, padding: '0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                                      background: seg.mode === m.k ? IVORY : 'transparent',
                                      color: seg.mode === m.k ? '#0A0B0E' : MUTED, border: 'none',
                                    }}>
                                    {m.l}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Délai / compte (Publication) */}
                            {!isStory && (
                              <div>
                                <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{tr('Délai / compte', 'Delay / account')}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input type="number" min={0} max={120} value={seg.delay_minutes}
                                    onChange={e => patchSegment(idx, { delay_minutes: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })}
                                    style={{ width: 54, height: 34, padding: '0 8px', fontSize: 13, textAlign: 'center', background: 'rgba(233,234,240,0.02)', color: IVORY, border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none' }} />
                                  <span style={{ fontSize: 11, color: MUTED }}>min</span>
                                </div>
                              </div>
                            )}
                            {/* Reels trial (Publication) */}
                            {!isStory && (
                              <div>
                                <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Reels Trial</p>
                                <button onClick={() => patchSegment(idx, { reels_trial: !seg.reels_trial })} className="cursor-pointer"
                                  style={{ height: 34, padding: '0 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: seg.reels_trial ? GOLD : 'transparent', color: seg.reels_trial ? '#0A0B0E' : MUTED, border: seg.reels_trial ? 'none' : `1px solid ${HAIR}`, borderRadius: 8 }}>
                                  {seg.reels_trial ? tr('Activé', 'On') : tr('Désactivé', 'Off')}
                                </button>
                              </div>
                            )}
                            {/* Usage unique */}
                            <div>
                              <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{tr('Usage unique', 'Single use')}</p>
                              <button onClick={() => patchSegment(idx, { auto_remove_videos: !seg.auto_remove_videos })}
                                title={tr('Retire chaque média du pool après utilisation', 'Removes each media from the pool after use')} className="cursor-pointer"
                                style={{ height: 34, padding: '0 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: seg.auto_remove_videos ? '#F59E0B' : 'transparent', color: seg.auto_remove_videos ? '#0A0B0E' : MUTED, border: seg.auto_remove_videos ? 'none' : `1px solid ${HAIR}`, borderRadius: 8 }}>
                                {seg.auto_remove_videos ? tr('Activé', 'On') : tr('Désactivé', 'Off')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              border: '1px solid rgba(240,160,171,0.4)',
              background: 'rgba(240,160,171,0.06)',
              fontSize: 12, color: '#F0A0AB',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
          padding: '13px 22px', borderTop: `1px solid ${HAIR}`,
        }}>
          <div style={{ flex: 1, display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, color: MUTED }}>
              <span style={{ fontSize: 16, color: phoneList.length ? GOLD : 'rgba(233,234,240,0.22)' }}>{phoneList.length}</span> {tr('tél.', 'ph.')}
            </span>
            {!sequenceMode && (
              <>
                <span style={{ fontSize: 11, color: MUTED }}>
                  <span style={{ fontSize: 16, color: segments.length ? GOLD : 'rgba(233,234,240,0.22)' }}>{segments.length}</span> {tr('seg.', 'seg.')}
                </span>
                <span style={{ fontSize: 11, color: MUTED }}>
                  <span style={{ fontSize: 16, color: totalMedia ? GOLD : 'rgba(233,234,240,0.22)' }}>{totalMedia}</span> {tr('médias', 'media')}
                </span>
                {anyStory && phoneList.length > 0 && phonesWithLink < phoneList.length && (
                  <span style={{ fontSize: 11, color: '#F59E0B' }}>
                    {tr(`${phoneList.length - phonesWithLink} lien(s) manquant(s)`, `${phoneList.length - phonesWithLink} missing link(s)`)}
                  </span>
                )}
                {progress && <span style={{ fontSize: 11.5, color: GOLD }}>{progress}</span>}
              </>
            )}
            {phoneList.length > 0 && (
              <span style={{ fontSize: 11, color: MUTED }}
                title={tr('Coût : 2 crédits × nb téléphones à chaque exécution, plus 50 crédits/jour tant que la tâche est active.', 'Cost: 2 credits × number of phones per run, plus 50 credits/day while the task is active.')}>
                ≈ <span style={{ color: GOLD, fontWeight: 700 }}>{phoneList.length * 2}</span> {tr('cr/exéc', 'cr/run')}
                {' · '}<span style={{ color: GOLD, fontWeight: 700 }}>50</span> {tr('cr/jour', 'cr/day')}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="cursor-pointer"
            style={{
              padding: '10px 18px', fontSize: 10.5, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              background: 'transparent', color: MUTED,
              border: `1px solid ${HAIR}`, borderRadius: 8,
              opacity: submitting ? 0.4 : 1,
            }}
          >
            {tr('Annuler', 'Cancel')}
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="cursor-pointer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 24px', fontSize: 10.5, fontWeight: 800,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              background: canSubmit ? GOLD : 'rgba(233,234,240,0.08)',
              color: canSubmit ? '#fff' : MUTED,
              border: 'none', borderRadius: 8, transition: 'all 0.18s',
            }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = '#818CF8' }}
            onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = canSubmit ? GOLD : 'rgba(233,234,240,0.08)' }}
          >
            {submitting && (
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                animation: 'spin 0.75s linear infinite',
                display: 'inline-block',
                flexShrink: 0,
              }} />
            )}
            {submitting ? tr('Sauvegarde…', 'Saving…') : isEdit ? tr('Enregistrer', 'Save') : tr('Créer la tâche', 'Create task')}
          </button>
        </div>
      </div>

      {/* Bank picker — adds to the targeted segment's media pool */}
      {showBankPickerFor !== null && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const segIdx = showBankPickerFor
            const pathArr = paths as string[]
            setSegments(prev => prev.map((s, i) => {
              if (i !== segIdx) return s
              const newOnes = pathArr
                .map((p, j) => ({
                  filePath: p,
                  title: titles?.[j] ?? p.replace(/\\/g, '/').split('/').pop()?.split('?')[0] ?? p,
                }))
                .filter(v => !s.videos.some(existing => existing.filePath === v.filePath))
              return { ...s, videos: [...s.videos, ...newOnes] }
            }))
            setShowBankPickerFor(null)
          }}
          onClose={() => setShowBankPickerFor(null)}
        />
      )}

      {/* Caption bank picker — adds text captions to a story segment's pool */}
      {showCaptionPickerFor !== null && (
        <CaptionBankPicker
          user={user}
          currentOrg={currentOrg}
          onSelect={texts => {
            const segIdx = showCaptionPickerFor
            setSegments(prev => prev.map((s, i) => {
              if (i !== segIdx) return s
              const merged = [...s.story_texts]
              for (const t of texts) {
                if (!merged.includes(t)) merged.push(t)
              }
              return { ...s, story_texts: merged }
            }))
            setShowCaptionPickerFor(null)
          }}
          onClose={() => setShowCaptionPickerFor(null)}
        />
      )}

      {/* Bank picker for step builder */}
      {bankPickerTarget !== null && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const pathArr = paths as string[]
            const newItems = pathArr.map((p, i) => ({
              token: p,
              title: titles?.[i] ?? p.replace(/\\/g, '/').split('/').pop()?.split('?')[0] ?? p,
            }))
            const { stepIdx, field } = bankPickerTarget
            setSteps(prev => prev.map((s, i) => {
              if (i !== stepIdx) return s
              if (field === 'images') {
                const existing = s.images ?? []
                return { ...s, images: [...existing, ...newItems.filter(n => !existing.some(e => e.token === n.token))] }
              } else {
                const existing = s.videos ?? []
                return { ...s, videos: [...existing, ...newItems.filter(n => !existing.some(e => e.token === n.token))] }
              }
            }))
            setBankPickerTarget(null)
          }}
          onClose={() => setBankPickerTarget(null)}
        />
      )}
    </div>
  )
}

// ── Step Editor ────────────────────────────────────────────────────────────────

function StepEditor({
  step,
  index,
  total,
  phones,
  getPhoneLink,
  setPhoneLink,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onShowBankPicker,
}: {
  step: TaskStep
  index: number
  total: number
  phones: Phone[]
  getPhoneLink: (id: string) => string
  setPhoneLink: (id: string, link: string) => void
  onChange: (s: TaskStep) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onShowBankPicker: (target: 'images' | 'videos') => void
}) {
  const tr = useTr()
  const [storyTextDraft, setStoryTextDraft] = useState('')

  function addStoryText() {
    const v = storyTextDraft.trim()
    if (!v) return
    onChange({ ...step, story_texts: [...(step.story_texts ?? []), v] })
    setStoryTextDraft('')
  }

  const mediaList = step.type === 'story' ? (step.images ?? []) : (step.videos ?? [])

  return (
    <div style={{
      border: `1px solid ${
        step.type === 'publication' ? 'rgba(99,102,241,0.25)'
        : step.type === 'story' ? 'rgba(139,92,246,0.25)'
        : 'rgba(245,158,11,0.25)'}`,
      borderRadius: 12,
      padding: '14px 16px',
      background: step.type === 'publication' ? 'rgba(99,102,241,0.04)'
        : step.type === 'story' ? 'rgba(139,92,246,0.04)'
        : 'rgba(245,158,11,0.04)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Step header: number badge + type chips + move/delete buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(233,234,240,0.08)', fontSize: 11, fontWeight: 800, color: MUTED,
        }}>
          {index + 1}
        </span>
        {/* Type chips */}
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          {(['publication', 'story', 'warmup'] as StepType[]).map(t => (
            <button
              key={t}
              onClick={() => onChange({ ...step, type: t })}
              className="cursor-pointer"
              style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                borderRadius: 8, border: '1px solid',
                borderColor: step.type === t
                  ? (t === 'publication' ? 'rgba(99,102,241,0.55)' : t === 'story' ? 'rgba(139,92,246,0.55)' : 'rgba(245,158,11,0.55)')
                  : 'rgba(233,234,240,0.1)',
                background: step.type === t
                  ? (t === 'publication' ? 'rgba(99,102,241,0.18)' : t === 'story' ? 'rgba(139,92,246,0.18)' : 'rgba(245,158,11,0.18)')
                  : 'transparent',
                color: step.type === t
                  ? (t === 'publication' ? '#818CF8' : t === 'story' ? '#A78BFA' : '#F59E0B')
                  : MUTED,
              }}
            >
              {t === 'publication' ? tr('Publication', 'Post') : t === 'story' ? 'Story' : 'Warmup'}
            </button>
          ))}
        </div>
        {/* Move / delete */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onMoveUp} disabled={index === 0} className="cursor-pointer"
            style={{ width: 24, height: 24, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'none', color: MUTED, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: index === 0 ? 0.3 : 1 }}>
            ↑
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="cursor-pointer"
            style={{ width: 24, height: 24, borderRadius: 8, border: `1px solid ${HAIR}`, background: 'none', color: MUTED, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: index === total - 1 ? 0.3 : 1 }}>
            ↓
          </button>
          <button onClick={onDelete} className="cursor-pointer"
            style={{ width: 24, height: 24, borderRadius: 8, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.06)', color: '#F87171', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconX size={8} />
          </button>
        </div>
      </div>

      {/* Warmup */}
      {step.type === 'warmup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: MUTED }}>{tr('Durée :', 'Duration:')}</span>
            <input
              type="number"
              min={1}
              max={120}
              value={step.warmup_minutes ?? 5}
              onChange={e => onChange({ ...step, warmup_minutes: Math.max(1, Number(e.target.value) || 5) })}
              style={{
                width: 64, height: 30, padding: '0 10px', fontSize: 12,
                textAlign: 'center', background: 'rgba(233,234,240,0.03)', color: IVORY,
                border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none',
              }}
            />
            <span style={{ fontSize: 11, color: MUTED }}>min</span>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(245,158,11,0.7)', fontStyle: 'italic' }}>
            {tr('Bientôt disponible — pause entre les étapes.', 'Coming soon — pause between steps.')}
          </p>
        </div>
      )}

      {/* Publication or Story: media list */}
      {step.type !== 'warmup' && (
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: GOLD }}>
            {step.type === 'story' ? tr('Images', 'Images') : tr('Vidéos', 'Videos')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {mediaList.map((v, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 7px', borderRadius: 8,
                border: `1px solid ${HAIR}`, fontSize: 11,
                color: 'rgba(233,234,240,0.7)', background: 'rgba(233,234,240,0.03)',
              }}>
                <span style={{ fontWeight: 600, color: GOLD }}>{i + 1}</span>
                {v.title.length > 22 ? v.title.slice(0, 22) + '…' : v.title}
                <button
                  onClick={() => {
                    if (step.type === 'story') {
                      onChange({ ...step, images: (step.images ?? []).filter((_, j) => j !== i) })
                    } else {
                      onChange({ ...step, videos: (step.videos ?? []).filter((_, j) => j !== i) })
                    }
                  }}
                  className="cursor-pointer"
                  style={{ background: 'none', border: 'none', color: '#F0A0AB', display: 'flex', padding: 0 }}
                >
                  <IconX size={7} />
                </button>
              </span>
            ))}
            <button
              onClick={() => onShowBankPicker(step.type === 'story' ? 'images' : 'videos')}
              className="cursor-pointer"
              style={{
                padding: '4px 10px', fontSize: 9.5, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                background: GOLD, color: '#fff', border: 'none', borderRadius: 5,
              }}
            >
              {tr('+ Banque', '+ Bank')}
            </button>
          </div>

          {/* Mode de distribution (séquentiel / aléatoire) + usage unique */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: MUTED }}>{tr('Distribution :', 'Distribution:')}</span>
            {(['seq', 'random'] as const).map(m => {
              const active = (step.mode ?? 'seq') === m
              return (
                <button
                  key={m}
                  onClick={() => onChange({ ...step, mode: m })}
                  className="cursor-pointer"
                  style={{
                    padding: '4px 10px', fontSize: 10, fontWeight: 700,
                    borderRadius: 8, border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : HAIR}`,
                    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: active ? '#818CF8' : MUTED,
                  }}
                >
                  {m === 'seq' ? tr('Séquentiel', 'Sequential') : tr('Aléatoire', 'Random')}
                </button>
              )
            })}
            <button
              onClick={() => onChange({ ...step, auto_remove_videos: !step.auto_remove_videos })}
              className="cursor-pointer"
              title={tr('Retire les médias utilisés de la pool après chaque exécution', 'Removes used media from the pool after each run')}
              style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', fontSize: 10, fontWeight: 700,
                borderRadius: 8, border: `1px solid ${step.auto_remove_videos ? 'rgba(245,158,11,0.45)' : HAIR}`,
                background: step.auto_remove_videos ? 'rgba(245,158,11,0.12)' : 'transparent',
                color: step.auto_remove_videos ? '#F59E0B' : MUTED,
              }}
            >
              <span style={{
                width: 13, height: 13, borderRadius: 4, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step.auto_remove_videos ? '#F59E0B' : 'transparent',
                border: step.auto_remove_videos ? 'none' : '1px solid rgba(233,234,240,0.25)',
              }}>
                {step.auto_remove_videos && <IconCheck size={7} />}
              </span>
              {tr('Usage unique', 'Single use')}
            </button>
          </div>
        </div>
      )}

      {/* Publication: caption */}
      {step.type === 'publication' && (
        <div>
          <p style={{ margin: '0 0 5px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: GOLD }}>{tr('Légende', 'Caption')}</p>
          <textarea
            value={step.caption ?? ''}
            onChange={e => onChange({ ...step, caption: e.target.value })}
            rows={2}
            placeholder={tr('Description Instagram…', 'Instagram description…')}
            style={{
              width: '100%', padding: '8px 10px',
              fontSize: 12, lineHeight: 1.5,
              background: 'rgba(233,234,240,0.02)', color: IVORY,
              resize: 'vertical', border: `1px solid ${HAIR}`,
              borderRadius: 8, outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Story: per-phone links */}
      {step.type === 'story' && phones.length > 0 && (
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: GOLD }}>{tr('Liens par compte', 'Links per account')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {phones.map(p => {
              const link = (step.phone_links ?? {})[p.id] ?? getPhoneLink(p.id)
              const filled = !!link.trim()
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 11, color: 'rgba(233,234,240,0.7)', width: 100, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.ig_username ? `@${p.ig_username}` : p.phone_name}
                  </span>
                  <input
                    type="url"
                    value={link}
                    onChange={e => {
                      const newLinks = { ...(step.phone_links ?? {}), [p.id]: e.target.value }
                      onChange({ ...step, phone_links: newLinks })
                      setPhoneLink(p.id, e.target.value)
                    }}
                    placeholder="https://…"
                    style={{
                      flex: 1, height: 28, padding: '0 8px', fontSize: 11,
                      background: 'rgba(233,234,240,0.02)', color: IVORY,
                      border: `1px solid ${filled ? 'rgba(52,211,153,0.4)' : 'rgba(245,158,11,0.4)'}`,
                      borderRadius: 8, outline: 'none',
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Story: sticker texts */}
      {step.type === 'story' && (
        <div>
          <p style={{ margin: '0 0 5px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: GOLD }}>
            {tr('Textes du sticker', 'Sticker texts')} <span style={{ color: MUTED, fontWeight: 400, textTransform: 'none' }}>{tr('— optionnel', '— optional')}</span>
          </p>
          <div style={{ display: 'flex', gap: 6, marginBottom: (step.story_texts ?? []).length ? 7 : 0 }}>
            <input
              type="text"
              value={storyTextDraft}
              onChange={e => setStoryTextDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStoryText() } }}
              placeholder={tr('Ex : Voir le lien 👆', 'e.g. See the link 👆')}
              style={{
                flex: 1, height: 30, padding: '0 10px', fontSize: 12,
                background: 'rgba(233,234,240,0.02)', color: IVORY,
                border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none',
              }}
            />
            <button
              onClick={addStoryText}
              disabled={!storyTextDraft.trim()}
              className="cursor-pointer"
              style={{
                padding: '0 12px', fontSize: 9.5, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                background: storyTextDraft.trim() ? GOLD : 'rgba(233,234,240,0.08)',
                color: storyTextDraft.trim() ? '#fff' : MUTED,
                border: 'none', borderRadius: 8,
              }}
            >
              +
            </button>
          </div>
          {(step.story_texts ?? []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(step.story_texts ?? []).map((txt, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 7px', borderRadius: 8,
                  border: `1px solid ${HAIR}`, fontSize: 11,
                  color: 'rgba(233,234,240,0.7)', background: 'rgba(233,234,240,0.03)',
                }}>
                  {txt.length > 28 ? txt.slice(0, 28) + '…' : txt}
                  <button
                    onClick={() => onChange({ ...step, story_texts: (step.story_texts ?? []).filter((_, j) => j !== i) })}
                    className="cursor-pointer"
                    style={{ background: 'none', border: 'none', color: '#F0A0AB', display: 'flex', padding: 0 }}
                  >
                    <IconX size={7} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delay after step (not last) */}
      {index < total - 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: MUTED }}>{tr('Attendre', 'Wait')}</span>
          <input
            type="number"
            min={0}
            max={120}
            value={step.delay_after_minutes ?? 0}
            onChange={e => onChange({ ...step, delay_after_minutes: Math.max(0, Number(e.target.value) || 0) })}
            style={{
              width: 56, height: 28, padding: '0 8px', fontSize: 12,
              textAlign: 'center', background: 'rgba(233,234,240,0.03)', color: IVORY,
              border: `1px solid ${HAIR}`, borderRadius: 8, outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: MUTED }}>{tr("min avant l'étape suivante", 'min before the next step')}</span>
        </div>
      )}
    </div>
  )
}

// ── Task Card ──────────────────────────────────────────────────────────────────

// ── Workflow pipeline — building blocks ─────────────────────────────────────
// Style visuel par type d'étape (repris des accents des hubs).
const WF_STEP_META: Record<string, { grad: string; glow: string; accent: string; label: string }> = {
  publication: { grad: 'linear-gradient(135deg,#6366F1,#818CF8)', glow: 'rgba(129,140,248,0.4)', accent: '#818CF8', label: 'Reels' },
  story:       { grad: 'linear-gradient(135deg,#F59E0B,#FBBF24)', glow: 'rgba(251,191,36,0.35)', accent: '#FBBF24', label: 'Story' },
  warmup:      { grad: 'linear-gradient(135deg,#EA580C,#FB923C)', glow: 'rgba(251,146,60,0.35)', accent: '#FB923C', label: 'Warmup' },
}

// Connecteur du rail : ligne dégradée + comète lumineuse qui voyage (si actif).
function FlowConnector({ active, from, to, flowDelay }: { active: boolean; from: string; to: string; flowDelay: number }) {
  return (
    <div style={{ position: 'relative', width: 44, height: 2, flexShrink: 0, margin: '0 3px', alignSelf: 'flex-start', marginTop: 25 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: `linear-gradient(90deg, ${from}66, ${to}66)` }} />
      {active && (
        <div style={{
          position: 'absolute', top: -2, left: 0, width: 16, height: 6,
          animation: 'wf-flow 2.4s cubic-bezier(.45,0,.55,1) infinite', animationDelay: `${flowDelay}s`,
        }}>
          {/* traînée de la comète */}
          <div style={{ position: 'absolute', right: 5, top: 2, width: 11, height: 2, borderRadius: 2, background: 'linear-gradient(90deg, transparent, rgba(199,210,254,0.9))' }} />
          {/* tête lumineuse */}
          <div style={{ position: 'absolute', right: 0, top: 0, width: 6, height: 6, borderRadius: 999, background: '#E0E7FF', boxShadow: '0 0 10px 3px rgba(165,180,252,0.85)' }} />
        </div>
      )}
    </div>
  )
}

// Nœud du rail : tuile 52px + label + sous-texte.
function FlowNode({ grad, glow, accent, label, sub, index, icon, onAdd, addTitle }: {
  grad: string; glow: string; accent: string; label: string; sub: React.ReactNode
  index?: number; icon: React.ReactNode; onAdd?: () => void; addTitle?: string
}) {
  const tr = useTr()
  const [h, setH] = useState(false)
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1)', transform: h ? 'translateY(-3px)' : 'none', minWidth: 68 }}
    >
      <div style={{
        position: 'relative', width: 52, height: 52, borderRadius: 16,
        background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        boxShadow: `0 0 ${h ? 26 : 16}px ${glow}, inset 0 1px 0 rgba(255,255,255,0.28)`, transition: 'box-shadow 0.25s',
      }}>
        {icon}
        {typeof index === 'number' && (
          <span style={{
            position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: 999,
            fontSize: 9, fontWeight: 800, color: '#0A0B0E', background: '#F3F4F6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0A0B0E',
          }}>{index}</span>
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: 10, color: 'rgba(233,234,240,0.45)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
        {sub}
        {onAdd && (
          <button
            onClick={e => { e.stopPropagation(); onAdd() }}
            title={addTitle ?? tr('Ajouter des médias', 'Add media')}
            className="cursor-pointer"
            style={{
              width: 15, height: 15, borderRadius: 4, border: 'none',
              background: 'rgba(99,102,241,0.16)', color: '#818CF8',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          ><IconPlus size={7} /></button>
        )}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  onToggle,
  onEdit,
  onDelete,
  onRunNow,
  onDuplicate,
  onOpenAddVideos,
  toggling,
  deleting,
}: {
  task: RecurringTask
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onRunNow: () => void
  onDuplicate: () => void
  onOpenAddVideos: (segmentId?: string) => void
  toggling: boolean
  deleting: boolean
}) {
  const tr = useTr()
  const [hovered, setHovered] = useState(false)
  const isActive = task.status === 'active'
  const hasSegments = !!task.segments && task.segments.length > 0
  const segs = task.segments ?? []
  const creditsPerRun = task.phones.length * 2

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', borderRadius: 20, padding: '18px 20px 14px',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))',
        border: `1px solid ${hovered ? 'rgba(129,140,248,0.3)' : 'rgba(255,255,255,0.08)'}`,
        transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.16,1,0.3,1)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered
          ? '0 12px 40px rgba(0,0,0,0.45), 0 0 60px -20px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.07)'
          : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 26px -18px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}
    >
      {/* Barre d'accent statut */}
      <div style={{
        position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: '0 3px 3px 0',
        background: isActive ? 'linear-gradient(180deg,#34D399,#10B981)' : 'rgba(255,255,255,0.12)',
        boxShadow: isActive ? '0 0 12px rgba(52,211,153,0.5)' : 'none', transition: 'background 0.3s, box-shadow 0.3s',
      }} />

      <div style={{ paddingLeft: 8 }}>
        {/* ── Row 1 : nom + badge + countdown + actions ──────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <p style={{
            margin: 0, minWidth: 0, maxWidth: '38%',
            fontSize: 15.5, fontWeight: 800, color: '#F3F4F6',
            letterSpacing: '-0.015em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.name || tr('Workflow sans nom', 'Untitled workflow')}
          </p>

          {/* Badge statut */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, height: 21, padding: '0 9px', borderRadius: 999,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: isActive ? '#34D399' : 'rgba(233,234,240,0.45)',
            background: isActive ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${isActive ? 'rgba(52,211,153,0.28)' : 'rgba(255,255,255,0.1)'}`,
          }}>
            {isActive && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#34D399', boxShadow: '0 0 6px rgba(52,211,153,0.8)', animation: 'wf-pulse 2s ease-in-out infinite' }} />}
            {isActive ? tr('Actif', 'Active') : tr('En pause', 'Paused')}
          </span>

          {/* Chip prochain run (niveau tâche, mode plat) */}
          {!hasSegments && isActive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, height: 21, padding: '0 10px', borderRadius: 999,
              fontSize: 10.5, fontWeight: 700, color: '#A5B4FC', background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.25)', fontVariantNumeric: 'tabular-nums',
            }}>
              <IconClock size={10} color="#A5B4FC" />
              {formatCountdown(task.next_run_at)}
            </span>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>
            <button
              onClick={onRunNow}
              disabled={toggling}
              title={tr('Lancer maintenant', 'Run now')}
              className="cursor-pointer"
              style={{
                width: 32, height: 32, borderRadius: 10, border: 'none',
                background: 'rgba(56,189,248,0.1)', color: '#38BDF8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', opacity: toggling ? 0.5 : 1, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.1)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>
            </button>
            <button
              onClick={onDuplicate}
              title={tr('Dupliquer', 'Duplicate')}
              className="cursor-pointer"
              style={{
                width: 32, height: 32, borderRadius: 10, border: 'none',
                background: 'rgba(99,102,241,0.08)', color: '#818CF8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button
              onClick={onToggle}
              disabled={toggling}
              title={isActive ? tr('Mettre en pause', 'Pause') : tr('Reprendre', 'Resume')}
              className="cursor-pointer"
              style={{
                width: 32, height: 32, borderRadius: 10, border: 'none',
                background: isActive ? 'rgba(245,158,11,0.1)' : 'rgba(52,211,153,0.1)',
                color: isActive ? '#F59E0B' : '#34d399',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', opacity: toggling ? 0.5 : 1, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isActive ? 'rgba(245,158,11,0.22)' : 'rgba(52,211,153,0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'rgba(245,158,11,0.1)' : 'rgba(52,211,153,0.1)' }}
            >
              {isActive ? <IconPause size={12} /> : <IconPlay size={12} />}
            </button>
            <button
              onClick={onEdit}
              title={tr('Modifier', 'Edit')}
              className="cursor-pointer"
              style={{
                width: 32, height: 32, borderRadius: 10, border: 'none',
                background: 'rgba(99,102,241,0.08)', color: '#818CF8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
            >
              <IconEdit size={12} />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              title={tr('Supprimer', 'Delete')}
              className="cursor-pointer"
              style={{
                width: 32, height: 32, borderRadius: 10, border: 'none',
                background: 'rgba(248,113,113,0.06)', color: 'rgba(248,113,113,0.65)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', opacity: deleting ? 0.5 : 1, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.16)'; e.currentTarget.style.color = '#F87171' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.06)'; e.currentTarget.style.color = 'rgba(248,113,113,0.65)' }}
            >
              <IconTrash size={12} />
            </button>
          </div>
        </div>

        {/* ── Row 2 : LE PIPELINE ────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: 14, marginBottom: 12,
          overflowX: 'auto', paddingBottom: 4,
          filter: isActive ? 'none' : 'saturate(0.3) brightness(0.75)',
          opacity: isActive ? 1 : 0.7,
          transition: 'filter 0.4s ease, opacity 0.4s ease',
        }}>
          {/* Nœud trigger */}
          <FlowNode
            grad="linear-gradient(135deg,#6366F1,#8B5CF6)" glow="rgba(139,92,246,0.4)" accent="#A5B4FC"
            label={tr('Déclencheur', 'Trigger')}
            sub={<span style={{ fontVariantNumeric: 'tabular-nums' }}>↻ {formatInterval(task.recur_hours)}</span>}
            icon={<IconClock size={22} color="#fff" />}
          />

          {hasSegments ? (
            segs.map((seg, i) => {
              const meta = WF_STEP_META[seg.type] ?? WF_STEP_META.publication
              const prev = i === 0 ? '#8B5CF6' : (WF_STEP_META[segs[i - 1].type] ?? WF_STEP_META.publication).accent
              const story = seg.type === 'story'
              return (
                <React.Fragment key={seg.id}>
                  <FlowConnector active={isActive} from={prev} to={meta.accent} flowDelay={i * 0.4} />
                  <FlowNode
                    grad={meta.grad} glow={meta.glow} accent={meta.accent} label={meta.label} index={i + 1}
                    sub={<>
                      <span>{seg.videos.length} {story ? tr('image', 'image') : tr('vidéo', 'video')}{seg.videos.length > 1 ? 's' : ''}</span>
                      {isActive && <span style={{ color: '#A5B4FC', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>· {formatCountdown(seg.next_run_at)}</span>}
                    </>}
                    icon={story ? <IconLinkType size={20} color="#fff" /> : <IconVideo size={20} color="#fff" />}
                    onAdd={() => onOpenAddVideos(seg.id)}
                    addTitle={tr('Ajouter des médias à cette étape', 'Add media to this step')}
                  />
                </React.Fragment>
              )
            })
          ) : (
            (() => {
              const meta = WF_STEP_META[task.task_type] ?? WF_STEP_META.publication
              const story = task.task_type === 'story'
              return (
                <>
                  <FlowConnector active={isActive} from="#8B5CF6" to={meta.accent} flowDelay={0} />
                  <FlowNode
                    grad={meta.grad} glow={meta.glow} accent={meta.accent} label={meta.label}
                    sub={<span>{task.videos.length} {story ? tr('image', 'image') : tr('vidéo', 'video')}{task.videos.length > 1 ? 's' : ''}</span>}
                    icon={story ? <IconLinkType size={20} color="#fff" /> : <IconVideo size={20} color="#fff" />}
                    onAdd={() => onOpenAddVideos()}
                  />
                </>
              )
            })()
          )}

          {/* Indicateur de répétition */}
          <FlowConnector active={isActive} from={hasSegments ? (WF_STEP_META[segs[segs.length - 1]?.type] ?? WF_STEP_META.publication).accent : (WF_STEP_META[task.task_type] ?? WF_STEP_META.publication).accent} to="rgba(233,234,240,0.35)" flowDelay={(hasSegments ? segs.length : 1) * 0.4} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 999, marginTop: 8,
              border: '1.5px dashed rgba(255,255,255,0.22)', color: 'rgba(233,234,240,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: isActive ? 'wf-rotate 9s linear infinite' : 'none',
            }}>
              <IconRepeat size={15} color="currentColor" />
            </div>
            <span style={{ fontSize: 9.5, color: 'rgba(233,234,240,0.35)', fontWeight: 700 }}>{tr('en boucle', 'looping')}</span>
          </div>
        </div>

        {/* ── Row 3 : footer méta ────────────────────────────────────────── */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10,
          display: 'flex', alignItems: 'center', gap: 16, fontSize: 11.5, color: 'rgba(233,234,240,0.45)', flexWrap: 'wrap',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <IconPhone size={12} color="rgba(233,234,240,0.4)" />
            {task.phones.length} {tr('téléphone', 'phone')}{task.phones.length > 1 ? 's' : ''}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <IconBolt size={12} color="rgba(233,234,240,0.4)" />
            <span style={{ color: '#FBBF24', fontWeight: 700 }}>{tr(`~${creditsPerRun} crédits`, `~${creditsPerRun} credits`)}</span>/run
          </span>
          {(task.run_count ?? 0) > 0 && (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{task.run_count} run{(task.run_count ?? 0) > 1 ? 's' : ''}</span>
          )}
          {task.last_run_at && (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontVariantNumeric: 'tabular-nums' }}>
              {tr('Dernier run :', 'Last run:')} {formatRelativePast(task.last_run_at)}
              <span style={{ color: '#34D399', display: 'inline-flex' }}><IconCheck size={9} /></span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton loading ───────────────────────────────────────────────────────────

function TaskSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="sf-skeleton sf-skeleton-card"
          style={{ height: 148, opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  const tr = useTr()
  // Pipeline fantôme animé : vend la promesse du workflow avant même d'en créer un.
  const ghostTiles = [
    { grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', icon: <IconClock size={19} color="#fff" /> },
    { grad: 'linear-gradient(135deg,#EA580C,#FB923C)', icon: <IconBolt size={19} color="#fff" /> },
    { grad: 'linear-gradient(135deg,#6366F1,#818CF8)', icon: <IconVideo size={18} color="#fff" /> },
    { grad: 'linear-gradient(135deg,#F59E0B,#FBBF24)', icon: <IconLinkType size={18} color="#fff" /> },
  ]
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '72px 32px', textAlign: 'center',
    }}>
      {/* Ghost pipeline */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 30 }}>
        {ghostTiles.map((tile, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{ position: 'relative', width: 42, height: 2, margin: '0 3px' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: 'linear-gradient(90deg, rgba(139,92,246,0.35), rgba(129,140,248,0.35))' }} />
                <div style={{ position: 'absolute', top: -2, left: 0, width: 16, height: 6, animation: 'wf-flow 2.4s cubic-bezier(.45,0,.55,1) infinite', animationDelay: `${i * 0.4}s` }}>
                  <div style={{ position: 'absolute', right: 5, top: 2, width: 11, height: 2, borderRadius: 2, background: 'linear-gradient(90deg, transparent, rgba(199,210,254,0.9))' }} />
                  <div style={{ position: 'absolute', right: 0, top: 0, width: 6, height: 6, borderRadius: 999, background: '#E0E7FF', boxShadow: '0 0 10px 3px rgba(165,180,252,0.85)' }} />
                </div>
              </div>
            )}
            <div style={{
              width: 46, height: 46, borderRadius: 14, opacity: 0.75,
              background: tile.grad, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}>{tile.icon}</div>
          </React.Fragment>
        ))}
        <div style={{ position: 'relative', width: 34, height: 2, margin: '0 3px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: 'linear-gradient(90deg, rgba(251,191,36,0.35), rgba(233,234,240,0.2))' }} />
        </div>
        <div style={{
          width: 34, height: 34, borderRadius: 999,
          border: '1.5px dashed rgba(255,255,255,0.22)', color: 'rgba(233,234,240,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'wf-rotate 9s linear infinite',
        }}>
          <IconRepeat size={14} color="currentColor" />
        </div>
      </div>

      <p style={{ fontSize: 19, fontWeight: 800, color: '#F3F4F6', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        {tr('Crée ton premier workflow', 'Create your first workflow')}
      </p>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'rgba(233,234,240,0.5)', margin: '0 0 26px', maxWidth: 420 }}>
        {tr('Enchaîne warmup, Reels et Stories sur tous tes téléphones, en boucle, sans lever le petit doigt.', 'Chain warmup, Reels and Stories across all your phones, on a loop, without lifting a finger.')}
      </p>

      <button
        onClick={onNew}
        className="sf-btn sf-btn-lg cursor-pointer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800,
          border: 'none', color: '#fff',
          background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
          boxShadow: '0 12px 28px -10px rgba(99,102,241,0.7), inset 0 1px 0 rgba(255,255,255,0.3)',
        }}
      >
        <IconPlus size={11} />
        {tr('Créer mon premier workflow', 'Create my first workflow')}
      </button>
    </div>
  )
}

// ── Upcoming run row ───────────────────────────────────────────────────────────

function UpcomingRow({ task, index }: { task: RecurringTask; index: number }) {
  const tr = useTr()
  const segs = task.segments ?? []
  const nextSeg = segs.length > 0
    ? [...segs].sort((a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime())[0]
    : null
  const effNextRun  = nextSeg ? nextSeg.next_run_at : task.next_run_at
  const effType     = nextSeg ? nextSeg.type : task.task_type
  const effVideos   = nextSeg ? nextSeg.videos.length : task.videos.length
  const effInterval = nextSeg ? nextSeg.recur_hours : task.recur_hours
  const diff = new Date(effNextRun).getTime() - Date.now()
  const imminent = diff <= 60 * 60 * 1000 // within 1h
  const accent = imminent ? 'var(--ok)' : 'var(--accent-lt)'

  return (
    <div
      className="sf-reveal"
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(17,17,32,0.85), rgba(12,12,21,0.85))',
        border: '1px solid rgba(233,234,240,0.07)',
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* Timeline dot + countdown */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: 84, flexShrink: 0, gap: 4,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 800, color: accent, letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums', textAlign: 'center', lineHeight: 1.1,
        }}>
          {formatCountdown(effNextRun).replace('dans ', '')}
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatAbsolute(effNextRun)}</span>
      </div>

      {/* Vertical divider with glow dot */}
      <div style={{ position: 'relative', alignSelf: 'stretch', width: 2, background: 'rgba(233,234,240,0.07)', flexShrink: 0 }}>
        <span style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 8, height: 8, borderRadius: '50%', background: accent,
          boxShadow: imminent ? `0 0 8px ${accent}` : 'none',
          animation: imminent ? 'pulse 1.4s ease-in-out infinite' : 'none',
        }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: '0 0 5px', fontSize: 14, fontWeight: 700, color: 'var(--ivory)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {effType === 'story' && (
            <span style={{ display: 'inline-flex', color: '#A78BFA' }} title="Story"><IconLinkType size={13} /></span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.name || tr('Tâche sans nom', 'Untitled task')}</span>
          {segs.length > 1 && (
            <span style={{
              flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#818CF8',
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 5, padding: '1px 6px',
            }}>
              {segs.length} {tr('segments', 'segments')}
            </span>
          )}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            <IconPhone size={11} color="rgba(233,234,240,0.5)" /> {task.phones.length}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            {effType === 'story' ? <IconLinkType size={11} color="rgba(233,234,240,0.5)" /> : <IconVideo size={11} color="rgba(233,234,240,0.5)" />} {effVideos}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#818CF8' }}>
            <IconRepeat size={11} color="#818CF8" /> {formatInterval(effInterval)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── History run row ────────────────────────────────────────────────────────────

function HistoryRow({ run, index }: { run: TaskRun; index: number }) {
  const tr = useTr()
  const [showLogs, setShowLogs] = useState(false)
  const logs = run.result?.logs ?? []

  const cfg = {
    done:      { color: 'var(--ok)',     bg: 'var(--ok-dim)',     border: 'rgba(34,197,94,0.25)',  label: tr('Réussi', 'Succeeded') },
    failed:    { color: 'var(--danger)', bg: 'var(--danger-dim)', border: 'rgba(239,68,68,0.25)',   label: tr('Échoué', 'Failed') },
    running:   { color: 'var(--accent-lt)', bg: 'var(--accent-dim)', border: 'var(--border-accent)', label: tr('En cours', 'In progress') },
    pending:   { color: 'var(--warn)',   bg: 'var(--warn-dim)',   border: 'rgba(245,158,11,0.25)', label: tr('En attente', 'Pending') },
    cancelled: { color: 'var(--text-3)', bg: 'rgba(255,255,255,0.04)', border: 'var(--border-md)', label: tr('Annulé', 'Cancelled') },
  }[run.status] ?? { color: 'var(--text-3)', bg: 'rgba(255,255,255,0.04)', border: 'var(--border-md)', label: run.status }

  const when = run.executed_at ?? run.scheduled_at

  return (
    <div
      className="sf-reveal"
      style={{
        borderRadius: 12, overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(17,17,32,0.85), rgba(12,12,21,0.85))',
        border: '1px solid rgba(233,234,240,0.07)',
        borderLeft: `3px solid ${cfg.color}`,
        animationDelay: `${index * 40}ms`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px' }}>
        {/* Status icon */}
        <span style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
        }}>
          {run.status === 'done' ? <IconCheck size={12} />
            : run.status === 'failed' ? <IconX size={11} />
            : <IconClock size={13} color={cfg.color} />}
        </span>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--ivory)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {run.created_by_name || tr('Tâche', 'Task')}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="sf-badge" style={{
              color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
            }}>
              {cfg.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatAbsolute(when)}</span>
            <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>· {formatRelativePast(when)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
              <IconPhone size={10} color="rgba(233,234,240,0.5)" /> {run.phones.length}
            </span>
          </div>
        </div>

        {/* Logs toggle */}
        {logs.length > 0 && (
          <button
            onClick={() => setShowLogs(v => !v)}
            className="cursor-pointer"
            style={{
              flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#818CF8',
              background: 'none', border: 'none', padding: '4px 8px',
            }}
          >
            {showLogs ? tr('Masquer', 'Hide') : tr(`Logs (${logs.length})`, `Logs (${logs.length})`)}
          </button>
        )}
      </div>

      {/* Error message */}
      {run.error_msg && run.status === 'failed' && !showLogs && (
        <p style={{
          margin: 0, padding: '0 16px 12px 60px',
          fontSize: 11.5, color: 'var(--danger)', fontFamily: 'ui-monospace, monospace',
        }}>
          {run.error_msg}
        </p>
      )}

      {/* Expanded logs */}
      {showLogs && logs.length > 0 && (
        <div style={{
          margin: '0 16px 14px', padding: '12px 14px',
          background: '#050508', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
          maxHeight: 220, overflowY: 'auto', scrollbarWidth: 'thin',
        }}>
          {logs.map((l, i) => (
            <div key={i} style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 11.5, lineHeight: 1.7,
              color: l.startsWith('❌') ? 'var(--danger)' : l.startsWith('✅') ? 'var(--ok)' : 'var(--text-3)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Tasks page ────────────────────────────────────────────────────────────

type TaskTab = 'upcoming' | 'tasks' | 'history'

export function Tasks({ user }: { user: User }) {
  const tr = useTr()
  const { currentOrg } = useOrg()
  const conns = useConnections(user)

  const [tasks, setTasks]           = useState<RecurringTask[]>([])
  const [history, setHistory]       = useState<TaskRun[]>([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<TaskTab>('upcoming')
  const [showCreate, setShowCreate] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [editTask, setEditTask]     = useState<RecurringTask | null>(null)
  const [deleteTask, setDeleteTask] = useState<RecurringTask | null>(null)
  const [toggling, setToggling]         = useState<string | null>(null)
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [addVideosTaskId, setAddVideosTaskId] = useState<{ taskId: string; segmentId?: string } | null>(null)

  // Countdown ticker state + refs (effect that uses `load` is declared after load below)
  const [, setTick] = useState(0)
  const tasksRef      = useRef<RecurringTask[]>([])
  const triggeringRef = useRef(false)
  const bearerRef     = useRef('')
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => { if (conns.bearer) bearerRef.current = conns.bearer }, [conns.bearer])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Tasks
      let q = supabase.from('recurring_tasks').select('*').order('created_at', { ascending: false })
      q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
      const { data, error } = await q
      if (!error && data) {
        setTasks(data.map((t: Record<string, unknown>) => ({
          ...t,
          phones:             typeof t.phones === 'string' ? JSON.parse(t.phones as string) : (t.phones ?? []),
          videos:             typeof t.videos === 'string' ? JSON.parse(t.videos as string) : (t.videos ?? []),
          story_texts:        typeof t.story_texts === 'string' ? JSON.parse(t.story_texts as string) : (t.story_texts ?? []),
          segments:           typeof t.segments === 'string' ? JSON.parse(t.segments as string) : (t.segments ?? []),
          task_type:          (t.task_type as TaskType) ?? 'publication',
          auto_remove_videos: (t.auto_remove_videos as boolean) ?? false,
          steps: (() => {
            const raw = t.steps
            if (!raw) return []
            const parsed = typeof raw === 'string' ? JSON.parse(raw as string) : raw
            return Array.isArray(parsed) ? parsed : []
          })(),
        })) as RecurringTask[])
      }

      // History — child scheduled_posts linked by task_id
      let hq = supabase.from('scheduled_posts').select('*')
        .not('task_id', 'is', null)
        .order('scheduled_at', { ascending: false })
        .limit(100)
      hq = currentOrg ? hq.eq('org_id', currentOrg.id) : hq.eq('user_id', user.id).is('org_id', null)
      const { data: hData, error: hErr } = await hq
      if (!hErr && hData) {
        setHistory(hData.map((r: Record<string, unknown>) => ({
          ...r,
          phones: typeof r.phones === 'string' ? JSON.parse(r.phones as string) : (r.phones ?? []),
          videos: typeof r.videos === 'string' ? JSON.parse(r.videos as string) : (r.videos ?? []),
          result: typeof r.result === 'string' ? JSON.parse(r.result as string) : r.result,
        })) as TaskRun[])
      }
    } finally {
      setLoading(false)
    }
  }, [currentOrg?.id, user.id])

  useEffect(() => {
    void load().then(() => {
      // Déclenche immédiatement si des tâches sont déjà en retard à l'ouverture de la page
      if (triggeringRef.current) return
      const overdue = tasksRef.current.filter(
        t => t.status === 'active' && isTaskDue(t),
      )
      if (!overdue.length) return
      triggeringRef.current = true
      triggerDueTasksOnServer()
        .then(() => load())
        .finally(() => { triggeringRef.current = false })
    })
  }, [load])

  // Countdown ticker — refresh every 30s.
  // Also auto-triggers the edge function when any active task is overdue,
  // so tasks run even if pg_cron hasn't been set up.
  useEffect(() => {
    const id = setInterval(async () => {
      setTick(t => t + 1)
      if (triggeringRef.current) return
      const hasOverdue = tasksRef.current.some(
        t => t.status === 'active' && isTaskDue(t),
      )
      if (!hasOverdue) return
      triggeringRef.current = true
      try {
        await triggerDueTasksOnServer()
        await load()
      } catch { /* silent */ }
      finally { triggeringRef.current = false }
    }, 30_000)
    return () => clearInterval(id)
  }, [load])

  async function toggleTask(task: RecurringTask) {
    setToggling(task.id)
    try {
      const newStatus = task.status === 'active' ? 'paused' : 'active'
      const updates: Partial<RecurringTask> = { status: newStatus }
      if (newStatus === 'active') {
        if (task.segments && task.segments.length > 0) {
          // Reset each segment's timer to now + its own interval
          const segs = task.segments.map(s => ({
            ...s,
            next_run_at: new Date(Date.now() + (Number(s.recur_hours) || 24) * 60 * 60 * 1000).toISOString(),
          }))
          updates.segments = segs
          const minNext = segs.reduce((min, s) => Math.min(min, new Date(s.next_run_at).getTime()), Infinity)
          updates.next_run_at = new Date(isFinite(minNext) ? minNext : Date.now()).toISOString()
        } else {
          updates.next_run_at = new Date(Date.now() + task.recur_hours * 60 * 60 * 1000).toISOString()
        }
      }
      await supabase.from('recurring_tasks').update(updates).eq('id', task.id)
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates } : t))
    } finally {
      setToggling(null)
    }
  }

  async function deleteTaskById(id: string) {
    setDeleting(id)
    try {
      await supabase.from('recurring_tasks').delete().eq('id', id)
      setTasks(prev => prev.filter(t => t.id !== id))
      setDeleteTask(null)
    } finally {
      setDeleting(null)
    }
  }

  // Dupliquer une tâche — copie toute la config, remise à zéro des timers/compteurs.
  // Créée EN PAUSE pour éviter une exécution (et une facturation) surprise.
  async function duplicateTask(task: RecurringTask) {
    setToggling(task.id)
    try {
      const recur = Number(task.recur_hours) || 24
      const now = Date.now()
      const segs = (task.segments && task.segments.length > 0)
        ? task.segments.map(s => ({ ...s, next_run_at: new Date(now + (Number(s.recur_hours) || 24) * 3_600_000).toISOString() }))
        : []
      const copy: Record<string, unknown> = {
        user_id: user.id, org_id: currentOrg?.id ?? null,
        name: tr(`${task.name ?? 'Tâche'} (copie)`, `${task.name ?? 'Task'} (copy)`), status: 'paused',
        task_type: task.task_type, phones: task.phones, videos: task.videos,
        caption: task.caption, story_texts: task.story_texts, mode: task.mode,
        delay_minutes: task.delay_minutes, recur_hours: recur,
        next_run_at: new Date(now + recur * 3_600_000).toISOString(),
        reels_trial: task.reels_trial, auto_remove_videos: (task as { auto_remove_videos?: boolean }).auto_remove_videos ?? false,
        steps: task.steps ?? [], segments: segs,
      }
      const { data, error } = await supabase.from('recurring_tasks').insert(copy).select().single()
      if (!error && data) setTasks(prev => [data as RecurringTask, ...prev])
    } finally { setToggling(null) }
  }

  // Lancer une tâche maintenant : on avance next_run_at à maintenant et on déclenche
  // l'edge function (qui débite + réserve atomiquement). Permet de tester une config
  // sans attendre l'échéance.
  async function runTaskNowManually(task: RecurringTask) {
    setToggling(task.id)
    try {
      const nowIso = new Date().toISOString()
      const updates: Partial<RecurringTask> = { next_run_at: nowIso, status: 'active' }
      if (task.segments && task.segments.length > 0) {
        updates.segments = task.segments.map(s => ({ ...s, next_run_at: nowIso }))
      }
      await supabase.from('recurring_tasks').update(updates).eq('id', task.id)
      await triggerDueTasksOnServer()
      await load()
    } finally { setToggling(null) }
  }

  // Pause / reprise EN MASSE de toutes les tâches.
  async function pauseAllTasks() {
    const ids = tasks.filter(t => t.status === 'active').map(t => t.id)
    if (!ids.length) return
    await supabase.from('recurring_tasks').update({ status: 'paused' }).in('id', ids)
    setTasks(prev => prev.map(t => t.status === 'active' ? { ...t, status: 'paused' } : t))
  }
  async function resumeAllTasks() {
    const paused = tasks.filter(t => t.status === 'paused')
    if (!paused.length) return
    const now = Date.now()
    await Promise.all(paused.map(t =>
      supabase.from('recurring_tasks')
        .update({ status: 'active', next_run_at: new Date(now + (Number(t.recur_hours) || 24) * 3_600_000).toISOString() })
        .eq('id', t.id)))
    await load()
  }

  async function addVideosToTask(taskId: string, newVids: SelVideo[], segmentId?: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    // Segmented task → append to the targeted segment's pool
    if (segmentId && task.segments && task.segments.length > 0) {
      const segs = task.segments.map(s => {
        if (s.id !== segmentId) return s
        const merged: TaskVideo[] = [
          ...s.videos,
          ...newVids
            .filter(v => !s.videos.some(ev => ev.token === v.filePath))
            .map(v => ({ token: v.filePath, title: v.title })),
        ]
        return { ...s, videos: merged }
      })
      await supabase.from('recurring_tasks').update({ segments: segs }).eq('id', taskId)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, segments: segs } : t))
      setAddVideosTaskId(null)
      return
    }

    // Legacy task → append to the single pool
    const appended: TaskVideo[] = [
      ...task.videos,
      ...newVids
        .filter(v => !task.videos.some(ev => ev.token === v.filePath))
        .map(v => ({ token: v.filePath, title: v.title })),
    ]
    await supabase.from('recurring_tasks').update({ videos: appended }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, videos: appended } : t))
    setAddVideosTaskId(null)
  }

  const activeTasks  = tasks.filter(t => t.status === 'active')
  const pausedTasks  = tasks.filter(t => t.status === 'paused')
  const upcoming     = [...activeTasks].sort(
    (a, b) => new Date(taskNextRun(a)).getTime() - new Date(taskNextRun(b)).getTime()
  )
  const totalRuns    = history.filter(r => r.status === 'done').length
  const nextRun      = upcoming[0] ? taskNextRun(upcoming[0]) : undefined

  const TABS: { id: TaskTab; label: string; count: number }[] = [
    { id: 'upcoming', label: tr('À venir', 'Upcoming'),    count: upcoming.length },
    { id: 'tasks',    label: tr('Tâches', 'Tasks'),     count: tasks.length },
    { id: 'history',  label: tr('Historique', 'History'), count: history.length },
  ]

  return (
    <div className="sf-page anim-page" style={{ position: 'relative' }}>
      <style>{`
        @keyframes wf-shimmer { 0%{background-position:-160% 0} 100%{background-position:260% 0} }
        @keyframes wf-flow { 0%{left:0;opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{left:calc(100% - 16px);opacity:0} }
        @keyframes wf-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.55;transform:scale(.85)} }
        @keyframes wf-rotate { to{transform:rotate(360deg)} }
        @keyframes wf-float { 0%,100%{transform:translate(0,0)} 50%{transform:translate(30px,22px)} }
        @keyframes wf-card-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      {/* Ambient glow */}
      <div aria-hidden style={{ position: 'absolute', top: -110, left: '16%', width: 540, height: 340, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.12), transparent 68%)', filter: 'blur(60px)', pointerEvents: 'none', animation: 'wf-float 24s ease-in-out infinite', zIndex: 0 }} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sf-page-header" style={{
        position: 'relative', zIndex: 1,
        flexDirection: 'column', alignItems: 'stretch', gap: 0,
        padding: '24px 28px 0', borderBottom: 'none',
      }}>
        <div className="sf-cluster" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 16 }}>
          <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
            <div className="sf-page-icon sf-anim-scale-spring">
              <IconBolt size={24} color="#fff" />
            </div>
            <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
              <div className="sf-eyebrow" style={{ marginBottom: 4 }}>{tr('Automatisation', 'Automation')}</div>
              <h1 className="sf-page-title sf-title-grad">
                {tr("Workflows d'automatisation", 'Automation workflows')}
              </h1>
              <p className="sf-page-sub">
                {tr('Tes chaînes de publication tournent toutes seules, en boucle.', 'Your posting chains run on their own, on a loop.')}
              </p>
            </div>
          </div>

          <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
            <button
              onClick={() => { setEditTask(null); setShowCreate(true) }}
              className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
              title={tr('Mode avancé : séquences multi-étapes (publication + story + warmup)', 'Advanced mode: multi-step sequences (post + story + warmup)')}
            >
              {tr('Avancé', 'Advanced')}
            </button>
            <button
              onClick={() => { setEditTask(null); setShowWizard(true) }}
              className="sf-btn sf-btn-primary sf-btn-lg cursor-pointer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <IconPlus />
              {tr('Nouveau workflow', 'New workflow')}
            </button>
          </div>
        </div>

        {/* ── Stats strip — pills premium ─────────────────────────────────── */}
        <div className="sf-anim-slide-up sf-d150" style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          {[
            { label: tr('workflows actifs', 'active workflows'), value: activeTasks.length, color: 'var(--ok)', pulse: activeTasks.length > 0 },
            { label: tr('en pause', 'paused'), value: pausedTasks.length, color: 'var(--text-3)', pulse: false },
            { label: tr('publications', 'posts'), value: totalRuns, color: 'var(--accent-lt)', pulse: false },
          ].map(stat => (
            <div key={stat.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 9, height: 36, padding: '0 15px 0 12px',
              borderRadius: 999,
              background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: stat.color, flexShrink: 0,
                animation: stat.pulse ? 'wf-pulse 2s ease-in-out infinite' : 'none',
                boxShadow: `0 0 8px ${stat.color}`,
              }} />
              <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {stat.value}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(233,234,240,0.5)', fontWeight: 600 }}>{stat.label}</span>
            </div>
          ))}
          {nextRun && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 15px',
              borderRadius: 999, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
            }}>
              <IconClock size={12} color="#A5B4FC" />
              <span style={{ fontSize: 12, color: 'rgba(165,180,252,0.8)', fontWeight: 600 }}>{tr('Prochain run', 'Next run')}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#A5B4FC', fontVariantNumeric: 'tabular-nums' }}>
                {formatCountdown(nextRun).replace('dans ', '')}
              </span>
            </div>
          )}
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="sf-tabs sf-anim-slide-up sf-d200">
          {TABS.map(tabItem => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`sf-tab cursor-pointer${tab === tabItem.id ? ' active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              {tabItem.label}
              {tabItem.count > 0 && (
                <span style={{
                  background: tab === tabItem.id ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)',
                  color: tab === tabItem.id ? 'var(--accent-lt)' : 'var(--text-4)',
                  borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {tabItem.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="sf-page-body">
        {loading ? (
          <TaskSkeleton />
        ) : tasks.length === 0 && history.length === 0 ? (
          <div className="sf-card" style={{ marginTop: 8 }}>
            <EmptyState onNew={() => { setEditTask(null); setShowWizard(true) }} />
          </div>
        ) : tab === 'upcoming' ? (
          /* ── À venir ──────────────────────────────────────────────────── */
          upcoming.length === 0 ? (
            <EmptyTab
              icon={<IconClock size={34} color="rgba(99,102,241,0.55)" />}
              title={tr('Aucune exécution prévue', 'No scheduled run')}
              text={tr('Active une tâche pour voir ses prochaines publications ici.', 'Activate a task to see its upcoming posts here.')}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.map((task, i) => <UpcomingRow key={task.id} task={task} index={i} />)}
            </div>
          )
        ) : tab === 'tasks' ? (
          /* ── Tâches (management) ──────────────────────────────────────── */
          tasks.length === 0 ? (
            <EmptyTab
              icon={<IconBolt size={34} color="rgba(99,102,241,0.55)" />}
              title={tr('Aucune tâche', 'No task')}
              text={tr('Crée ta première tâche automatique.', 'Create your first automatic task.')}
              onNew={() => { setEditTask(null); setShowWizard(true) }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1120 }}>
              {(activeTasks.length > 0 || pausedTasks.length > 0) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 'auto' }}>
                    {tr(`${activeTasks.length} active${activeTasks.length > 1 ? 's' : ''} · ${pausedTasks.length} en pause`, `${activeTasks.length} active · ${pausedTasks.length} paused`)}
                  </span>
                  {activeTasks.length > 0 && (
                    <button onClick={() => void pauseAllTasks()} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">
                      {tr('⏸ Tout mettre en pause', '⏸ Pause all')}
                    </button>
                  )}
                  {pausedTasks.length > 0 && (
                    <button onClick={() => void resumeAllTasks()} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">
                      {tr('▶ Tout reprendre', '▶ Resume all')}
                    </button>
                  )}
                </div>
              )}
              {tasks.map((task, ti) => (
                <div key={task.id} style={{ animation: 'wf-card-in .45s cubic-bezier(.2,.8,.2,1) both', animationDelay: `${ti * 70}ms` }}>
                  <TaskCard
                    task={task}
                    toggling={toggling === task.id}
                    deleting={deleting === task.id}
                    onToggle={() => void toggleTask(task)}
                    onEdit={() => { setEditTask(task); setShowCreate(true) }}
                    onDelete={() => setDeleteTask(task)}
                    onRunNow={() => void runTaskNowManually(task)}
                    onDuplicate={() => void duplicateTask(task)}
                    onOpenAddVideos={(segmentId?: string) => setAddVideosTaskId({ taskId: task.id, segmentId })}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          /* ── Historique ───────────────────────────────────────────────── */
          history.length === 0 ? (
            <EmptyTab
              icon={<IconCheck size={30} />}
              title={tr('Aucun historique', 'No history')}
              text={tr('Les publications exécutées par tes tâches apparaîtront ici.', 'Posts run by your tasks will appear here.')}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {history.map((run, i) => <HistoryRow key={run.id} run={run} index={i} />)}
            </div>
          )
        )}

        {/* Info banner */}
        <div className="sf-banner is-accent sf-reveal sf-d300" style={{ marginTop: 28, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>
            <IconRepeat size={14} color="currentColor" />
          </span>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
            {tr('Les tâches s\'exécutent automatiquement sur le serveur, ', 'Tasks run automatically on the server, ')}<strong style={{ color: 'var(--text-1)' }}>{tr('même ScaleFlow fermé', 'even when ScaleFlow is closed')}</strong>{tr('. Chaque publication apparaît dans l\'historique.', '. Every post appears in the history.')}
          </p>
        </div>
      </div>

      {/* ── Create / Edit modal ───────────────────────────────────────────── */}
      {showWizard && (
        <TaskWizard
          user={user}
          onSaved={() => { setShowWizard(false); void load() }}
          onClose={() => setShowWizard(false)}
        />
      )}

      {showCreate && (
        <CreateTaskModal
          user={user}
          editTask={editTask}
          onSaved={() => { setShowCreate(false); setEditTask(null); void load() }}
          onClose={() => { setShowCreate(false); setEditTask(null) }}
        />
      )}

      {/* ── Delete confirm ────────────────────────────────────────────────── */}
      {deleteTask && (
        <ConfirmDeleteDialog
          taskName={deleteTask.name}
          busy={deleting === deleteTask.id}
          onConfirm={() => void deleteTaskById(deleteTask.id)}
          onCancel={() => setDeleteTask(null)}
        />
      )}

      {/* ── Inline add videos to task ─────────────────────────────────────── */}
      {addVideosTaskId && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const newVids = (paths as string[]).map((p, i) => ({
              filePath: p,
              title: titles?.[i] ?? p.split('/').pop()?.split('?')[0] ?? p,
            }))
            void addVideosToTask(addVideosTaskId.taskId, newVids, addVideosTaskId.segmentId)
          }}
          onClose={() => setAddVideosTaskId(null)}
        />
      )}
    </div>
  )
}

// ── Empty tab placeholder ──────────────────────────────────────────────────────

function EmptyTab({ icon, title, text, onNew }: {
  icon: React.ReactNode
  title: string
  text: string
  onNew?: () => void
}) {
  const tr = useTr()
  return (
    <div className="sf-card" style={{
      marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '56px 32px', textAlign: 'center',
    }}>
      <div style={{
        width: 76, height: 76, borderRadius: 20, marginBottom: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)',
        boxShadow: '0 0 40px -12px rgba(99,102,241,0.35)',
      }}>
        {icon}
      </div>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ivory)', margin: '0 0 8px' }}>{title}</p>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-3)', margin: '0 0 20px', maxWidth: 340 }}>{text}</p>
      {onNew && (
        <button onClick={onNew} className="sf-btn sf-btn-primary cursor-pointer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <IconPlus size={11} /> {tr('Nouvelle tâche', 'New task')}
        </button>
      )}
    </div>
  )
}
