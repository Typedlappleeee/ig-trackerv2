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

import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { BankPicker } from '@/pages/Bank'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TaskPhone {
  id: string
  geelark_id: string
  phone_name: string
  ig_username: string | null
}

interface TaskVideo {
  token: string   // GeeLark resourceUrl token OR Supabase signed URL (edge fn uploads server-side)
  title: string
}

interface RecurringTask {
  id: string
  user_id: string
  org_id: string | null
  name: string
  status: 'active' | 'paused'
  phones: TaskPhone[]
  videos: TaskVideo[]
  caption: string
  mode: 'seq' | 'random'
  delay_minutes: number
  recur_hours: number
  next_run_at: string
  reels_trial: boolean
  auto_remove_videos: boolean
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

interface SelVideo {
  filePath: string
  title: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCountdown(nextRunAt: string): string {
  const diff = new Date(nextRunAt).getTime() - Date.now()
  if (diff <= 0) return 'Maintenant'
  const h = Math.floor(diff / (1000 * 60 * 60))
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (h > 24) {
    const d = Math.floor(h / 24)
    const rh = h % 24
    return `dans ${d}j ${rh}h`
  }
  if (h > 0) return `dans ${h}h ${m}m`
  return `dans ${m}m`
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
    if (!up.ok || !up.token) throw new Error(`Erreur upload GeeLark: ${up.error ?? '?'}`)
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
  if (!j.ok || !j.token) throw new Error(`Proxy upload échoué: ${j.error ?? 'no token'}`)
  return j.token
}

async function runTaskNow(task: RecurringTask, bearer: string): Promise<void> {
  const nowIso     = new Date().toISOString()
  const logs: string[] = []
  const log = (msg: string) => { logs.push(msg); console.log('[Task]', msg) }
  const recurHours = Number(task.recur_hours) || 24
  const nextRunAt  = new Date(Date.now() + recurHours * 60 * 60 * 1000).toISOString()

  // Toujours écrire l'historique + reset le timer, même en cas d'erreur
  const saveResult = async (status: 'done' | 'failed', errorMsg?: string) => {
    await supabase.from('scheduled_posts').insert({
      user_id:         task.user_id,
      org_id:          task.org_id ?? null,
      created_by_name: task.name || 'Tâche auto',
      type:            'mass_posting',
      status,
      scheduled_at:    nowIso,
      executed_at:     new Date().toISOString(),
      phones:          task.phones,
      videos:          task.videos,
      caption:         task.caption,
      delay_minutes:   task.delay_minutes ?? 0,
      mode:            task.mode ?? 'seq',
      bearer_token:    '',
      reels_trial:     task.reels_trial ?? false,
      task_id:         task.id,
      result:          { logs },
      error_msg:       errorMsg ?? null,
    }).then(() => {}, () => {})
    await supabase.from('recurring_tasks').update({
      next_run_at: nextRunAt,
      last_run_at: nowIso,
      run_count:   (Number(task.run_count) || 0) + 1,
    }).eq('id', task.id)
  }

  if (!bearer) {
    log('❌ Aucun token GéeLark configuré (bearer vide)')
    await saveResult('failed', 'bearer vide')
    return
  }
  if (!task.phones.length) {
    log('❌ Aucun téléphone dans la tâche')
    await saveResult('failed', 'aucun téléphone')
    return
  }
  if (!task.videos.length) {
    log('❌ Aucune vidéo dans la tâche')
    await saveResult('failed', 'aucune vidéo')
    return
  }

  try {
    // 1. Résolution des tokens vidéo — en parallèle + démarrage phones simultané
    const phoneIds = task.phones.map(p => p.geelark_id)
    log(`▶ Upload de ${task.videos.length} vidéo(s) + démarrage de ${phoneIds.length} téléphone(s)…`)

    const [tokenResults, startRes] = await Promise.all([
      Promise.allSettled(task.videos.map(v => resolveTaskVideoToken(bearer, v))),
      glPost(bearer, '/phone/start', { ids: phoneIds }),
    ])

    const validTokens: string[] = []
    const tokenByIndex: (string | null)[] = tokenResults.map((r, i) => {
      if (r.status === 'fulfilled') {
        log(`✅ Vidéo OK : ${task.videos[i].title || r.value.slice(0, 40)}`)
        validTokens.push(r.value)
        return r.value
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        log(`❌ Vidéo échouée (${task.videos[i].title || '?'}): ${msg}`)
        return null
      }
    })
    void tokenByIndex

    if (!validTokens.length) {
      const errMsg = 'Résolution de tous les tokens vidéo a échoué'
      log(`❌ ${errMsg}`)
      await saveResult('failed', errMsg)
      return
    }
    if (startRes['code'] !== 0) log(`⚠ Démarrage téléphones: ${startRes['msg'] ?? startRes['code']}`)

    // Boot wait — pendant que les uploads se faisaient, les téléphones ont déjà démarré
    log('⏳ Attente boot (30s)…')
    await new Promise(r => setTimeout(r, 30_000))

    // 3. Tâches RPA — toutes lancées en parallèle
    log(`▶ Lancement RPA sur ${task.phones.length} téléphone(s)…`)
    const baseTs = Math.floor(Date.now() / 1000)
    const rpaResults = await Promise.allSettled(
      task.phones.map((phone, i) => {
        const vidIdx = task.mode === 'random'
          ? Math.floor(Math.random() * validTokens.length)
          : i % validTokens.length
        return glPost(bearer, '/rpa/task/instagramPubReels', {
          id:          phone.geelark_id,
          scheduleAt:  baseTs + i * (task.delay_minutes ?? 0) * 60,
          description: task.caption,
          video:       [validTokens[vidIdx]],
          ...(task.reels_trial ? { shareType: 2 } : {}),
        })
      })
    )

    const rpaIds: string[] = []
    let fails = 0
    rpaResults.forEach((r, i) => {
      const phone = task.phones[i]
      const name  = phone.ig_username ?? phone.phone_name
      if (r.status === 'fulfilled' && r.value['code'] === 0) {
        const tid = (r.value['data'] as Record<string, unknown>)?.['id'] as string | undefined
        if (tid) rpaIds.push(tid)
        log(`✅ ${name}`)
      } else {
        fails++
        const detail = r.status === 'rejected'
          ? (r.reason instanceof Error ? r.reason.message : String(r.reason))
          : String(r.value['msg'] ?? 'code=' + String(r.value['code']))
        log(`❌ ${name}: ${detail}`)
      }
    })

    if (fails >= task.phones.length) {
      log('❌ Toutes les tâches RPA ont échoué')
      log(`⏰ Prochain post dans ${recurHours}h`)
      await saveResult('failed', 'Toutes les tâches RPA ont échoué')
      await new Promise(r => setTimeout(r, 5_000))
      await glPost(bearer, '/phone/stop', { ids: phoneIds }).catch(() => {})
      return
    }

    // 4. Poll task statuses jusqu'à complétion (max 8 min), puis arrêt + saveResult
    let pollDone = 0
    let pollFail = 0
    if (rpaIds.length > 0) {
      log(`⏳ Suivi de ${rpaIds.length} tâche(s) RPA…`)
      const pending   = new Set(rpaIds)
      const stopped   = new Set<string>()
      const deadline  = Date.now() + 8 * 60 * 1000
      const tidToGid  = new Map<string, string>()
      for (let i = 0; i < task.phones.length; i++) {
        const tid = rpaIds[i]
        if (tid) tidToGid.set(tid, task.phones[i].geelark_id)
      }
      const STATUS: Record<number, string> = { 1: 'Pending', 2: 'En cours', 3: '✅ Done', 4: '❌ Failed', 7: 'Annulé' }
      while (pending.size > 0 && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 10_000))
        try {
          const qRes  = await glPost(bearer, '/task/query', { ids: [...pending] })
          const d     = (qRes['data'] as Record<string, unknown>) ?? qRes
          const items = (d['items'] ?? d['list'] ?? d['tasks'] ?? d['records']) as Array<Record<string, unknown>> | undefined
          for (const item of (Array.isArray(items) ? items : [])) {
            const tid    = (item['id'] ?? item['taskId']) as string
            const status = Number(item['status'])
            if ([3, 4, 7].includes(status)) {
              pending.delete(tid)
              const gid  = tidToGid.get(tid)
              const fail = item['failDesc'] ? ` — ${item['failDesc']}` : ''
              log(`${STATUS[status] ?? status}${fail}`)
              if (status === 3) pollDone++; else pollFail++
              if (gid && !stopped.has(gid)) {
                stopped.add(gid)
                await glPost(bearer, '/phone/stop', { ids: [gid] }).catch(() => {})
              }
            }
          }
        } catch { /* retry next tick */ }
      }
      if (pending.size > 0) log(`⚠ ${pending.size} tâche(s) non terminée(s) après 8 min`)
      const remaining = phoneIds.filter(id => !stopped.has(id))
      if (remaining.length > 0) {
        await glPost(bearer, '/phone/stop', { ids: remaining }).catch(() => {})
      }
    } else {
      await new Promise(r => setTimeout(r, 5_000))
      await glPost(bearer, '/phone/stop', { ids: phoneIds }).catch(() => {})
    }

    const finalStatus = pollDone > 0 ? 'done' : (fails + pollFail >= task.phones.length ? 'failed' : 'done')
    log(`⏰ Prochain post dans ${recurHours}h`)
    await saveResult(finalStatus, finalStatus === 'failed' ? 'Aucun posting réussi' : undefined)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`❌ Erreur inattendue: ${msg}`)
    await saveResult('failed', msg)
  }
}

function formatInterval(hours: number): string {
  if (hours < 1) return `toutes les ${Math.round(hours * 60)} min`
  if (hours >= 24 && hours % 24 === 0) return `toutes les ${hours / 24}j`
  return `toutes les ${hours}h`
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatRelativePast(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'à venir'
  const m = Math.floor(diff / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  return `il y a ${d}j`
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
          Supprimer cette tâche ?
        </p>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          <span style={{ color: 'rgba(233,234,240,0.7)', fontWeight: 600 }}>"{taskName}"</span>{' '}
          sera définitivement supprimée. Cette action est irréversible.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            className="sf-btn sf-btn-ghost cursor-pointer"
            style={{ flex: 1, opacity: busy ? 0.5 : 1 }}
          >
            Annuler
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
            {busy ? 'Suppression…' : 'Supprimer'}
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

interface CreateTaskModalProps {
  user: User
  editTask?: RecurringTask | null
  onSaved: () => void
  onClose: () => void
}

function CreateTaskModal({ user, editTask, onSaved, onClose }: CreateTaskModalProps) {
  const { currentOrg, role, perms } = useOrg()
  const conns = useConnections(user)
  const bearer = conns.bearer ?? ''

  const [phones, setPhones]           = useState<Phone[]>([])
  const [selPhones, setSelPhones]     = useState<Set<string>>(new Set(editTask?.phones.map(p => p.id) ?? []))
  const [phoneSearch, setPhoneSearch] = useState('')
  const [groups, setGroups]           = useState<string[]>(['Tous'])
  const [groupFilter, setGroupFilter] = useState('Tous')
  const [videos, setVideos]           = useState<SelVideo[]>(
    editTask?.videos.map(v => ({ filePath: v.token, title: v.title })) ?? []
  )
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [name, setName]               = useState(editTask?.name ?? '')
  const [caption, setCaption]         = useState(editTask?.caption ?? '')
  const [mode, setMode]               = useState<'seq' | 'random'>(editTask?.mode ?? 'seq')
  const [recurUnit, setRecurUnit]     = useState<'minutes' | 'heures' | 'jours'>(
    editTask
      ? (editTask.recur_hours < 1 ? 'minutes'
        : editTask.recur_hours % 24 === 0 && editTask.recur_hours >= 24 ? 'jours' : 'heures')
      : 'heures'
  )
  const [recurValue, setRecurValue]   = useState(
    editTask
      ? (editTask.recur_hours < 1 ? Math.round(editTask.recur_hours * 60)
        : editTask.recur_hours % 24 === 0 && editTask.recur_hours >= 24 ? editTask.recur_hours / 24 : editTask.recur_hours)
      : 24
  )
  const [nextRunAt, setNextRunAt]     = useState(
    editTask ? editTask.next_run_at.slice(0, 16) : defaultNextRun()
  )
  const [delayMin, setDelayMin]       = useState(editTask?.delay_minutes ?? 0)
  const [reelsTrial, setReelsTrial]   = useState(editTask?.reels_trial ?? false)
  const [autoRemove, setAutoRemove]   = useState(editTask?.auto_remove_videos ?? false)
  const [submitting, setSubmitting]   = useState(false)
  const [progress, setProgress]       = useState('')
  const [error, setError]             = useState<string | null>(null)

  const recurHours = recurUnit === 'jours' ? recurValue * 24
    : recurUnit === 'minutes' ? recurValue / 60
    : recurValue

  useEffect(() => {
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg
      ? q.eq('org_id', currentOrg.id)
      : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      const ps = (data ?? []) as Phone[]
      setPhones(ps)
      const grps = [...new Set(ps.map(p => p.group_name).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
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

  const isEdit = !!editTask
  // Le nom est optionnel — un nom est généré automatiquement s'il est vide.
  const canSubmit = !submitting && phoneList.length > 0 && videos.length > 0

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: GOLD, display: 'block', marginBottom: 8,
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      const uploadedVideos: TaskVideo[] = []

      for (let i = 0; i < videos.length; i++) {
        const v = videos[i]
        setProgress(`Préparation vidéo ${i + 1}/${videos.length}…`)
        // Supabase signed URLs are stored as-is; the edge function uploads to GeeLark server-side.
        if (v.filePath.startsWith('http://') || v.filePath.startsWith('https://')) {
          uploadedVideos.push({ token: v.filePath, title: v.title })
          continue
        }
        // Local file — upload to GeeLark now (Electron only)
        if (!bearer || !window.electronAPI) {
          uploadedVideos.push({ token: v.filePath, title: v.title })
          continue
        }
        const up = await window.electronAPI.uploadVideoGeelark({ bearer, filePath: v.filePath })
        if (up && up.ok && up.token) {
          uploadedVideos.push({ token: up.token, title: v.title })
        } else {
          throw new Error(`Upload "${v.title}" échoué : ${up?.error ?? 'erreur inconnue'}`)
        }
      }

      setProgress('Sauvegarde de la tâche…')

      const nextRunDate = new Date(nextRunAt)
      const autoName = `Tâche du ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`
      const taskData = {
        user_id:       user.id,
        org_id:        currentOrg?.id ?? null,
        name:          name.trim() || autoName,
        status:        (editTask?.status ?? 'active') as 'active' | 'paused',
        phones:        phoneList.map(p => ({
          id: p.id, geelark_id: p.geelark_id,
          phone_name: p.phone_name, ig_username: p.ig_username ?? null,
        })),
        videos:        uploadedVideos,
        caption:       caption.trim(),
        mode,
        delay_minutes: delayMin,
        recur_hours:        recurHours,
        next_run_at:        nextRunDate.toISOString(),
        reels_trial:        reelsTrial,
        auto_remove_videos: autoRemove,
      }

      // Rétro-compat : si la colonne auto_remove_videos n'existe pas encore
      // (migration non appliquée), on réessaie sans elle.
      const saveTask = async (payload: Record<string, unknown>) => {
        if (isEdit && editTask) {
          return supabase.from('recurring_tasks').update(payload).eq('id', editTask.id)
        }
        return supabase.from('recurring_tasks').insert(payload)
      }

      let { error: err } = await saveTask(taskData)
      // Rétro-compat : colonne auto_remove_videos manquante (migration non appliquée)
      if (err && /auto_remove_videos/i.test(err.message) && /column|schema|cache/i.test(err.message)) {
        const { auto_remove_videos: _omit, ...fallback } = taskData
        ;({ error: err } = await saveTask(fallback))
      }
      // Rétro-compat : colonne recur_hours est integer au lieu de numeric → arrondir à l'heure la plus proche
      if (err && /recur_hours/i.test(err.message) && /integer/i.test(err.message)) {
        const rounded = { ...taskData, recur_hours: Math.max(1, Math.round(taskData.recur_hours as number)) }
        ;({ error: err } = await saveTask(rounded))
        if (!err) setError('⚠ Intervalles en minutes non supportés tant que la migration SQL n\'est pas appliquée — sauvegardé en heures.')
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
              width: 32, height: 32, borderRadius: 9,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconBolt size={16} color={GOLD} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: IVORY }}>
              {isEdit ? 'Modifier la tâche' : 'Nouvelle tâche automatique'}
            </span>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="cursor-pointer"
            style={{ background: 'none', border: 'none', color: MUTED, display: 'flex', padding: 6, borderRadius: 6 }}
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
              Token GéeLark manquant — configure-le dans Paramètres → Connexions.
            </div>
          )}

          {/* ── Nom ── */}
          <section>
            <span style={labelStyle}>
              Nom de la tâche
              <span style={{ color: MUTED, letterSpacing: 'normal', fontSize: 10, textTransform: 'none', fontWeight: 500 }}> — optionnel</span>
            </span>
            <input
              type="text"
              className="sf-input"
              placeholder="Ex : Posts quotidiens lifestyle…"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', height: 38 }}
            />
          </section>

          {/* ── Téléphones ── */}
          <section>
            <span style={labelStyle}>
              Téléphones{phoneList.length > 0 && (
                <span style={{ color: IVORY, letterSpacing: 'normal', fontSize: 11, textTransform: 'none', fontWeight: 500 }}>
                  {' '}— {phoneList.length} sélectionné{phoneList.length > 1 ? 's' : ''}
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
                    <option key={g} value={g} style={{ background: '#0F1014', color: IVORY }}>{g}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder="Rechercher…"
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
                Tous
              </button>
              <button
                onClick={() => setSelPhones(new Set())}
                className="cursor-pointer"
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, background: 'none', border: 'none', padding: '0 4px' }}
              >
                Aucun
              </button>
            </div>
            {visiblePhones.length === 0 ? (
              <div style={{
                padding: '24px 16px', fontSize: 12, color: MUTED, textAlign: 'center',
                border: `1px solid ${HAIR}`, borderRadius: 10,
              }}>
                Aucun téléphone
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
                        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
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
                          {phone.ig_username ? `@${phone.ig_username}` : (phone.group_name || 'sans groupe')}
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

          {/* ── Vidéos ── */}
          <section>
            <span style={labelStyle}>
              Vidéos{videos.length > 0 && (
                <span style={{ color: IVORY, letterSpacing: 'normal', fontSize: 11, textTransform: 'none', fontWeight: 500 }}>
                  {' '}— {videos.length}
                </span>
              )}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 38 }}>
              {videos.map((v, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '5px 9px', borderRadius: 7,
                  border: `1px solid ${HAIR}`, fontSize: 11.5,
                  color: 'rgba(233,234,240,0.7)', background: 'rgba(233,234,240,0.03)',
                }}>
                  <span style={{ fontWeight: 600, color: GOLD }}>{i + 1}</span>
                  {v.title.length > 28 ? v.title.slice(0, 28) + '…' : v.title}
                  <button
                    onClick={() => setVideos(prev => prev.filter((_, j) => j !== i))}
                    className="cursor-pointer"
                    style={{ background: 'none', border: 'none', color: '#F0A0AB', display: 'flex', padding: 0, cursor: 'pointer' }}
                  >
                    <IconX size={8} />
                  </button>
                </span>
              ))}
              <button
                onClick={() => setShowBankPicker(true)}
                className="cursor-pointer"
                style={{
                  padding: '6px 13px', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                  background: GOLD, color: '#fff', border: 'none', borderRadius: 6,
                  transition: 'background 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#818CF8' }}
                onMouseLeave={e => { e.currentTarget.style.background = GOLD }}
              >
                + Depuis la banque
              </button>
            </div>
          </section>

          {/* ── Légende ── */}
          <section>
            <span style={labelStyle}>Légende</span>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={3}
              placeholder="Description Instagram…"
              style={{
                width: '100%', minHeight: 72, padding: '10px 12px',
                fontSize: 13, lineHeight: 1.6,
                background: 'rgba(233,234,240,0.02)', color: IVORY,
                resize: 'vertical', border: `1px solid ${HAIR}`,
                borderRadius: 8, outline: 'none', fontFamily: 'inherit',
                transition: 'border-color 0.2s', boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
              onBlur={e => { e.currentTarget.style.borderColor = HAIR }}
            />
          </section>

          {/* ── Paramètres ── */}
          <section>
            <span style={labelStyle}>Paramètres</span>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>

              {/* Mode */}
              <div>
                <p style={{ fontSize: 10.5, color: MUTED, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', margin: '0 0 6px' }}>Mode</p>
                <div style={{ display: 'flex', border: `1px solid ${HAIR}`, borderRadius: 7, overflow: 'hidden' }}>
                  {([{ k: 'seq', l: 'Séquentiel' }, { k: 'random', l: 'Aléatoire' }] as const).map(m => (
                    <button
                      key={m.k}
                      onClick={() => setMode(m.k)}
                      className="cursor-pointer"
                      style={{
                        padding: '8px 14px', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                        background: mode === m.k ? IVORY : 'transparent',
                        color: mode === m.k ? '#0A0B0E' : MUTED,
                        border: 'none', transition: 'all 0.18s',
                      }}
                    >
                      {m.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Intervalle */}
              <div>
                <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Intervalle</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={recurValue}
                    onChange={e => setRecurValue(Math.max(1, Number(e.target.value) || 24))}
                    style={{
                      width: 72, height: 34, padding: '0 10px', fontSize: 13,
                      textAlign: 'center', background: 'rgba(233,234,240,0.02)',
                      color: IVORY, border: `1px solid ${HAIR}`, borderRadius: 7, outline: 'none',
                    }}
                  />
                  <select
                    value={recurUnit}
                    onChange={e => setRecurUnit(e.target.value as 'minutes' | 'heures' | 'jours')}
                    style={{
                      height: 34, padding: '0 8px', fontSize: 12,
                      background: '#0F1014', color: IVORY,
                      border: `1px solid ${HAIR}`, borderRadius: 7, outline: 'none',
                    }}
                  >
                    <option value="minutes">minutes</option>
                    <option value="heures">heures</option>
                    <option value="jours">jours</option>
                  </select>
                </div>
              </div>

              {/* Premier post */}
              <div>
                <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Premier post</p>
                <input
                  type="datetime-local"
                  value={nextRunAt}
                  onChange={e => setNextRunAt(e.target.value)}
                  style={{
                    height: 34, padding: '0 10px', fontSize: 13, colorScheme: 'dark',
                    background: 'rgba(233,234,240,0.02)', color: IVORY,
                    border: `1px solid ${HAIR}`, borderRadius: 7, outline: 'none',
                  }}
                />
              </div>

              {/* Délai entre comptes */}
              <div>
                <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Délai / compte</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={delayMin}
                    onChange={e => setDelayMin(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
                    style={{
                      width: 64, height: 34, padding: '0 10px', fontSize: 13,
                      textAlign: 'center', background: 'rgba(233,234,240,0.02)',
                      color: IVORY, border: `1px solid ${HAIR}`, borderRadius: 7, outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, color: MUTED }}>min</span>
                </div>
              </div>

              {/* Essai Reels */}
              <div>
                <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Essai Reels</p>
                <button
                  onClick={() => setReelsTrial(v => !v)}
                  className="cursor-pointer"
                  style={{
                    height: 34, padding: '0 16px', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    background: reelsTrial ? GOLD : 'transparent',
                    color: reelsTrial ? '#0A0B0E' : MUTED,
                    border: reelsTrial ? 'none' : `1px solid ${HAIR}`,
                    borderRadius: 7, transition: 'all 0.18s',
                  }}
                >
                  {reelsTrial ? 'Activé' : 'Désactivé'}
                </button>
              </div>

              {/* Auto-suppression des vidéos */}
              <div>
                <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Vidéo → usage unique</p>
                <button
                  onClick={() => setAutoRemove(v => !v)}
                  title="Supprime chaque vidéo de la pool après qu'elle a été postée"
                  className="cursor-pointer"
                  style={{
                    height: 34, padding: '0 16px', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    background: autoRemove ? '#F59E0B' : 'transparent',
                    color: autoRemove ? '#0A0B0E' : MUTED,
                    border: autoRemove ? 'none' : `1px solid ${HAIR}`,
                    borderRadius: 7, transition: 'all 0.18s',
                  }}
                >
                  {autoRemove ? 'Activé' : 'Désactivé'}
                </button>
              </div>
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
              <span style={{ fontSize: 16, color: phoneList.length ? GOLD : 'rgba(233,234,240,0.22)' }}>{phoneList.length}</span> tél.
            </span>
            <span style={{ fontSize: 11, color: MUTED }}>
              <span style={{ fontSize: 16, color: videos.length ? GOLD : 'rgba(233,234,240,0.22)' }}>{videos.length}</span> vidéos
            </span>
            {progress && <span style={{ fontSize: 11.5, color: GOLD }}>{progress}</span>}
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="cursor-pointer"
            style={{
              padding: '10px 18px', fontSize: 10.5, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              background: 'transparent', color: MUTED,
              border: `1px solid ${HAIR}`, borderRadius: 7,
              opacity: submitting ? 0.4 : 1,
            }}
          >
            Annuler
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
              border: 'none', borderRadius: 7, transition: 'all 0.18s',
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
            {submitting ? 'Sauvegarde…' : isEdit ? 'Enregistrer' : 'Créer la tâche'}
          </button>
        </div>
      </div>

      {/* Bank picker */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const pathArr = paths as string[]
            const newOnes = pathArr
              .map((p, i) => ({
                filePath: p,
                title: titles?.[i] ?? p.replace(/\\/g, '/').split('/').pop()?.split('?')[0] ?? p,
              }))
              .filter(v => !videos.some(existing => existing.filePath === v.filePath))
            setVideos(prev => [...prev, ...newOnes])
            setShowBankPicker(false)
          }}
          onClose={() => setShowBankPicker(false)}
        />
      )}
    </div>
  )
}

// ── Task Card ──────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onToggle,
  onEdit,
  onDelete,
  onOpenAddVideos,
  toggling,
  deleting,
}: {
  task: RecurringTask
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenAddVideos: () => void
  toggling: boolean
  deleting: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const isActive = task.status === 'active'

  const statusColor  = isActive ? '#34d399' : '#F59E0B'
  const statusBg     = isActive ? 'rgba(52,211,153,0.08)' : 'rgba(245,158,11,0.08)'
  const statusBorder = isActive ? 'rgba(52,211,153,0.22)' : 'rgba(245,158,11,0.22)'
  const glowColor    = isActive ? 'rgba(52,211,153,0.08)' : 'rgba(245,158,11,0.06)'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? 'linear-gradient(135deg, rgba(99,102,241,0.045), rgba(99,102,241,0.02))'
          : 'linear-gradient(135deg, rgba(17,17,32,0.9), rgba(12,12,21,0.9))',
        border: `1px solid ${hovered ? 'rgba(99,102,241,0.22)' : 'rgba(233,234,240,0.07)'}`,
        borderRadius: 14,
        padding: '20px 22px',
        transition: 'all 0.18s ease',
        boxShadow: hovered
          ? '0 8px 32px -8px rgba(99,102,241,0.18), 0 0 0 1px rgba(99,102,241,0.1)'
          : '0 2px 12px rgba(0,0,0,0.25)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Status accent top line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: isActive
          ? 'linear-gradient(90deg, transparent, rgba(52,211,153,0.5), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(245,158,11,0.4), transparent)',
        opacity: hovered ? 1 : 0.5,
        transition: 'opacity 0.18s',
      }} />

      {/* Background glow blob */}
      <div style={{
        position: 'absolute', top: -30, right: -30, width: 120, height: 120,
        borderRadius: '50%', background: glowColor,
        pointerEvents: 'none', filter: 'blur(20px)',
      }} />

      {/* Row 1: name + status badges + action buttons */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--ivory)',
            letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.name || 'Tâche sans nom'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {/* Status */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: statusBg, color: statusColor,
              border: `1px solid ${statusBorder}`,
              borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: statusColor,
                boxShadow: isActive ? `0 0 6px ${statusColor}` : 'none',
                display: 'inline-block',
                animation: isActive ? 'pulse 1.4s ease-in-out infinite' : 'none',
              }} />
              {isActive ? 'Actif' : 'En pause'}
            </span>

            {/* Interval */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(99,102,241,0.08)', color: '#818CF8',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
            }}>
              <IconRepeat size={11} color="#818CF8" />
              {formatInterval(task.recur_hours)}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onToggle}
            disabled={toggling}
            title={isActive ? 'Mettre en pause' : 'Reprendre'}
            className="cursor-pointer"
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: isActive ? 'rgba(245,158,11,0.1)' : 'rgba(52,211,153,0.1)',
              color: isActive ? '#F59E0B' : '#34d399',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', opacity: toggling ? 0.5 : 1, cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = isActive ? 'rgba(245,158,11,0.2)' : 'rgba(52,211,153,0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isActive ? 'rgba(245,158,11,0.1)' : 'rgba(52,211,153,0.1)'
            }}
          >
            {isActive ? <IconPause size={13} /> : <IconPlay size={13} />}
          </button>

          <button
            onClick={onEdit}
            title="Modifier"
            className="cursor-pointer"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(99,102,241,0.08)', color: '#818CF8',
              border: '1px solid rgba(99,102,241,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.16)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
          >
            <IconEdit size={13} />
          </button>

          <button
            onClick={onDelete}
            disabled={deleting}
            title="Supprimer"
            className="cursor-pointer"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(248,113,113,0.06)', color: 'rgba(248,113,113,0.7)',
              border: '1px solid rgba(248,113,113,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', opacity: deleting ? 0.5 : 1, cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(248,113,113,0.14)'
              e.currentTarget.style.color = '#F87171'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(248,113,113,0.06)'
              e.currentTarget.style.color = 'rgba(248,113,113,0.7)'
            }}
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      {/* Row 2: stats chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(255,255,255,0.04)', color: 'var(--muted)',
          border: '1px solid rgba(255,255,255,0.055)', borderRadius: 6,
          padding: '3px 10px', fontSize: 11,
        }}>
          <IconPhone size={11} color="rgba(233,234,240,0.6)" />
          {task.phones.length} téléphone{task.phones.length > 1 ? 's' : ''}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(255,255,255,0.04)', color: 'var(--muted)',
          border: '1px solid rgba(255,255,255,0.055)', borderRadius: 6,
          padding: '3px 6px 3px 10px', fontSize: 11,
        }}>
          <IconVideo size={11} color="rgba(233,234,240,0.6)" />
          {task.videos.length} vidéo{task.videos.length > 1 ? 's' : ''}
          <button
            onClick={e => { e.stopPropagation(); onOpenAddVideos() }}
            title="Ajouter des vidéos à la pool"
            className="cursor-pointer"
            style={{
              width: 18, height: 18, borderRadius: 5, border: 'none',
              background: 'rgba(99,102,241,0.15)', color: '#818CF8',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)' }}
          >
            <IconPlus size={8} />
          </button>
        </span>
        {task.mode === 'random' && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(99,102,241,0.06)', color: '#818CF8',
            border: '1px solid rgba(99,102,241,0.15)', borderRadius: 6,
            padding: '3px 10px', fontSize: 11,
          }}>
            Aléatoire
          </span>
        )}
        {task.reels_trial && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(167,139,250,0.06)', color: '#a78bfa',
            border: '1px solid rgba(167,139,250,0.18)', borderRadius: 6,
            padding: '3px 10px', fontSize: 11,
          }}>
            Essai Reels
          </span>
        )}
        {task.auto_remove_videos && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(245,158,11,0.06)', color: '#F59E0B',
            border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6,
            padding: '3px 10px', fontSize: 11,
          }}>
            Usage unique
          </span>
        )}
      </div>

      {/* Row 3: next run */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        padding: '8px 12px', borderRadius: 8,
        background: isActive ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${isActive ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.05)'}`,
      }}>
        <IconClock size={12} color={isActive ? 'var(--accent-l)' : 'var(--muted)'} />
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Prochain post :</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: isActive ? 'var(--accent-l)' : 'var(--muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {isActive ? formatCountdown(task.next_run_at) : 'En pause'}
        </span>
      </div>

      {/* Caption preview */}
      {task.caption && (
        <p style={{
          margin: 0,
          fontSize: 11.5, lineHeight: 1.6, color: 'var(--muted)',
          fontStyle: 'italic',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          "{task.caption.slice(0, 100)}{task.caption.length > 100 ? '…' : ''}"
        </p>
      )}
    </div>
  )
}

// ── Skeleton loading ───────────────────────────────────────────────────────────

function TaskSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="sf-skeleton"
          style={{ height: 180, borderRadius: 14, opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '72px 32px', textAlign: 'center',
    }}>
      <div style={{
        position: 'relative', marginBottom: 24,
        width: 96, height: 96,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 96, height: 96, borderRadius: 24,
          background: 'rgba(99,102,241,0.07)',
          border: '1px solid rgba(99,102,241,0.18)',
          boxShadow: '0 0 60px -12px rgba(99,102,241,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconBolt size={40} color="rgba(99,102,241,0.55)" />
        </div>
        <div style={{
          position: 'absolute', top: 6, right: 8, width: 10, height: 10,
          borderRadius: '50%', background: '#34d399',
          boxShadow: '0 0 8px #34d399',
          animation: 'pulse 1.6s ease-in-out infinite',
        }} />
      </div>

      <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--ivory)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        Aucune tâche automatique
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--muted)', margin: '0 0 28px', maxWidth: 360 }}>
        Les tâches automatiques postent sur tes comptes à intervalles réguliers, sans action de ta part.
      </p>

      <button
        onClick={onNew}
        className="sf-btn sf-btn-primary cursor-pointer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}
      >
        <IconPlus size={11} />
        Créer ma première tâche
      </button>
    </div>
  )
}

// ── KPI Stat Card ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, icon, pulse,
}: {
  label: string
  value: string | number
  sub?: string
  accent: string
  icon: React.ReactNode
  pulse?: boolean
}) {
  return (
    <div style={{
      flex: '1 1 180px', minWidth: 160,
      background: 'linear-gradient(135deg, rgba(17,17,32,0.9), rgba(12,12,21,0.9))',
      border: '1px solid rgba(233,234,240,0.07)',
      borderRadius: 14, padding: '16px 18px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -24, right: -24, width: 90, height: 90,
        borderRadius: '50%', background: accent, opacity: 0.07,
        filter: 'blur(18px)', pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}1a`, border: `1px solid ${accent}33`, color: accent,
        }}>
          {icon}
        </span>
        <span style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--muted)',
        }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 26, fontWeight: 800, color: 'var(--ivory)', letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>
          {value}
        </span>
        {pulse && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: accent,
            boxShadow: `0 0 6px ${accent}`, display: 'inline-block',
            animation: 'pulse 1.4s ease-in-out infinite',
          }} />
        )}
      </div>
      {sub && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>{sub}</p>}
    </div>
  )
}

// ── Upcoming run row ───────────────────────────────────────────────────────────

function UpcomingRow({ task, index }: { task: RecurringTask; index: number }) {
  const diff = new Date(task.next_run_at).getTime() - Date.now()
  const imminent = diff <= 60 * 60 * 1000 // within 1h
  const accent = imminent ? '#34d399' : '#818CF8'

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
          {formatCountdown(task.next_run_at).replace('dans ', '')}
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatAbsolute(task.next_run_at)}</span>
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
        }}>
          {task.name || 'Tâche sans nom'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            <IconPhone size={11} color="rgba(233,234,240,0.5)" /> {task.phones.length}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            <IconVideo size={11} color="rgba(233,234,240,0.5)" /> {task.videos.length}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#818CF8' }}>
            <IconRepeat size={11} color="#818CF8" /> {formatInterval(task.recur_hours)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── History run row ────────────────────────────────────────────────────────────

function HistoryRow({ run, index }: { run: TaskRun; index: number }) {
  const [showLogs, setShowLogs] = useState(false)
  const logs = run.result?.logs ?? []

  const cfg = {
    done:      { color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)', label: 'Réussi' },
    failed:    { color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)', label: 'Échoué' },
    running:   { color: '#818CF8', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', label: 'En cours' },
    pending:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: 'En attente' },
    cancelled: { color: 'rgba(148,163,184,0.7)', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', label: 'Annulé' },
  }[run.status] ?? { color: 'var(--muted)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', label: run.status }

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
            margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: 'var(--ivory)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {run.created_by_name || 'Tâche'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: cfg.color,
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              borderRadius: 20, padding: '2px 9px',
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
            {showLogs ? 'Masquer' : `Logs (${logs.length})`}
          </button>
        )}
      </div>

      {/* Error message */}
      {run.error_msg && run.status === 'failed' && !showLogs && (
        <p style={{
          margin: 0, padding: '0 16px 12px 60px',
          fontSize: 11.5, color: '#F0A0AB', fontFamily: 'ui-monospace, monospace',
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
              color: l.startsWith('❌') ? '#F0A0AB' : l.startsWith('✅') ? '#34d399' : 'rgba(148,163,184,0.7)',
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
  const { currentOrg } = useOrg()
  const conns = useConnections(user)

  const [tasks, setTasks]           = useState<RecurringTask[]>([])
  const [history, setHistory]       = useState<TaskRun[]>([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<TaskTab>('upcoming')
  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask]     = useState<RecurringTask | null>(null)
  const [deleteTask, setDeleteTask] = useState<RecurringTask | null>(null)
  const [toggling, setToggling]         = useState<string | null>(null)
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [addVideosTaskId, setAddVideosTaskId] = useState<string | null>(null)

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
          auto_remove_videos: (t.auto_remove_videos as boolean) ?? false,
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
      const now     = Date.now()
      const overdue = tasksRef.current.filter(
        t => t.status === 'active' && new Date(t.next_run_at).getTime() <= now,
      )
      if (!overdue.length) return
      triggeringRef.current = true
      Promise.all(overdue.map(t => runTaskNow(t, bearerRef.current).catch(() => {})))
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
      const now = Date.now()
      const hasOverdue = tasksRef.current.some(
        t => t.status === 'active' && new Date(t.next_run_at).getTime() <= now,
      )
      if (!hasOverdue) return
      triggeringRef.current = true
      try {
        const overdue = tasksRef.current.filter(
          t => t.status === 'active' && new Date(t.next_run_at).getTime() <= Date.now(),
        )
        await Promise.all(overdue.map(t => runTaskNow(t, bearerRef.current).catch(() => {})))
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
        const next = new Date(Date.now() + task.recur_hours * 60 * 60 * 1000)
        updates.next_run_at = next.toISOString()
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

  async function addVideosToTask(taskId: string, newVids: SelVideo[]) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
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
    (a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime()
  )
  const totalRuns    = history.filter(r => r.status === 'done').length
  const nextRun      = upcoming[0]?.next_run_at

  const TABS: { id: TaskTab; label: string; count: number }[] = [
    { id: 'upcoming', label: 'À venir',    count: upcoming.length },
    { id: 'tasks',    label: 'Tâches',     count: tasks.length },
    { id: 'history',  label: 'Historique', count: history.length },
  ]

  return (
    <div className="sf-page anim-page">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sf-page-header" style={{
        flexDirection: 'column', alignItems: 'stretch', gap: 0,
        padding: '24px 28px 0', borderBottom: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sf-anim-scale-spring" style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.28)',
            }}>
              <IconBolt size={22} color="var(--accent)" />
            </div>
            <div className="sf-anim-slide-up sf-d50">
              <h1 className="sf-page-title" style={{ fontSize: 22, letterSpacing: '-0.03em' }}>
                Tâches automatiques
              </h1>
              <p className="sf-page-sub">
                Tableau de bord de tes publications récurrentes
              </p>
            </div>
          </div>

          <div className="sf-anim-slide-up sf-d100">
            <button
              onClick={() => { setEditTask(null); setShowCreate(true) }}
              className="sf-btn sf-btn-primary cursor-pointer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <IconPlus />
              Nouvelle tâche
            </button>
          </div>
        </div>

        {/* ── KPI stat cards ──────────────────────────────────────────────── */}
        <div className="sf-anim-slide-up sf-d150" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard
            label="Actives" value={activeTasks.length}
            accent="#34d399" pulse={activeTasks.length > 0}
            sub={activeTasks.length > 0 ? 'en cours d\'exécution' : 'aucune active'}
            icon={<IconBolt size={15} color="#34d399" />}
          />
          <StatCard
            label="En pause" value={pausedTasks.length}
            accent="#F59E0B"
            sub={pausedTasks.length > 0 ? 'mises en pause' : '—'}
            icon={<IconPause size={13} />}
          />
          <StatCard
            label="Publications" value={totalRuns}
            accent="#818CF8"
            sub="exécutées avec succès"
            icon={<IconCheck size={13} />}
          />
          <StatCard
            label="Prochaine" value={nextRun ? formatCountdown(nextRun).replace('dans ', '') : '—'}
            accent="#6366F1"
            sub={nextRun ? formatAbsolute(nextRun) : 'aucune prévue'}
            icon={<IconClock size={14} color="#6366F1" />}
          />
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="sf-anim-slide-up sf-d200" style={{
          display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {TABS.map(tabItem => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className="cursor-pointer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', background: 'transparent', border: 'none',
                borderBottom: tab === tabItem.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === tabItem.id ? 'var(--ivory)' : 'rgba(148,163,184,0.45)',
                fontSize: 13, fontWeight: tab === tabItem.id ? 600 : 500,
                transition: 'color 0.15s, border-color 0.15s', marginBottom: -1, outline: 'none',
              }}
            >
              {tabItem.label}
              {tabItem.count > 0 && (
                <span style={{
                  background: tab === tabItem.id ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.05)',
                  color: tab === tabItem.id ? 'var(--accent)' : 'rgba(148,163,184,0.4)',
                  borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700,
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
            <EmptyState onNew={() => { setEditTask(null); setShowCreate(true) }} />
          </div>
        ) : tab === 'upcoming' ? (
          /* ── À venir ──────────────────────────────────────────────────── */
          upcoming.length === 0 ? (
            <EmptyTab
              icon={<IconClock size={34} color="rgba(99,102,241,0.55)" />}
              title="Aucune exécution prévue"
              text="Active une tâche pour voir ses prochaines publications ici."
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
              title="Aucune tâche"
              text="Crée ta première tâche automatique."
              onNew={() => { setEditTask(null); setShowCreate(true) }}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  toggling={toggling === task.id}
                  deleting={deleting === task.id}
                  onToggle={() => void toggleTask(task)}
                  onEdit={() => { setEditTask(task); setShowCreate(true) }}
                  onDelete={() => setDeleteTask(task)}
                  onOpenAddVideos={() => setAddVideosTaskId(task.id)}
                />
              ))}
            </div>
          )
        ) : (
          /* ── Historique ───────────────────────────────────────────────── */
          history.length === 0 ? (
            <EmptyTab
              icon={<IconCheck size={30} />}
              title="Aucun historique"
              text="Les publications exécutées par tes tâches apparaîtront ici."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {history.map((run, i) => <HistoryRow key={run.id} run={run} index={i} />)}
            </div>
          )
        )}

        {/* Info banner */}
        <div className="sf-reveal sf-d300" style={{
          marginTop: 28,
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 16px',
          background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.14)',
          borderRadius: 11,
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>
            <IconRepeat size={14} color="rgba(52,211,153,0.7)" />
          </span>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)', margin: 0 }}>
            Les tâches s'exécutent automatiquement sur le serveur, <strong style={{ color: 'rgba(233,234,240,0.7)' }}>même ScaleFlow fermé</strong>. Chaque publication apparaît dans l'historique.
          </p>
        </div>
      </div>

      {/* ── Create / Edit modal ───────────────────────────────────────────── */}
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
            void addVideosToTask(addVideosTaskId, newVids)
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
      <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)', margin: '0 0 8px' }}>{title}</p>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--muted)', margin: '0 0 20px', maxWidth: 340 }}>{text}</p>
      {onNew && (
        <button onClick={onNew} className="sf-btn sf-btn-primary cursor-pointer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <IconPlus size={11} /> Nouvelle tâche
        </button>
      )}
    </div>
  )
}
