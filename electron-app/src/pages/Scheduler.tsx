/*
 * SQL — Système de programmes d'automation ScaleFlow
 *
 * CREATE TABLE IF NOT EXISTS automation_programs (
 *   id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id         uuid REFERENCES auth.users NOT NULL,
 *   org_id          uuid,
 *   name            text NOT NULL DEFAULT '',
 *   description     text DEFAULT '',
 *   status          text DEFAULT 'active' CHECK (status IN ('active','paused')),
 *   frequency       text DEFAULT 'daily' CHECK (frequency IN ('daily','weekly','custom')),
 *   days            jsonb DEFAULT '["mon","tue","wed","thu","fri","sat","sun"]',
 *   time_hour       integer NOT NULL DEFAULT 18,
 *   time_minute     integer NOT NULL DEFAULT 0,
 *   timezone        text DEFAULT 'Europe/Paris',
 *   posts_per_day   integer DEFAULT 1,
 *   phones          jsonb DEFAULT '[]',
 *   video_folders   jsonb DEFAULT '[]',
 *   video_behavior  text DEFAULT 'random' CHECK (video_behavior IN ('random','sequential','smart')),
 *   delay_min_sec   integer DEFAULT 30,
 *   delay_max_sec   integer DEFAULT 90,
 *   avoid_duplicates boolean DEFAULT true,
 *   caption_mode    text DEFAULT 'fixed' CHECK (caption_mode IN ('fixed','ai','random')),
 *   caption_template text DEFAULT '',
 *   hashtags        text DEFAULT '',
 *   bearer_token    text DEFAULT '',
 *   ignore_offline  boolean DEFAULT true,
 *   retry_on_error  boolean DEFAULT true,
 *   delete_metadata boolean DEFAULT false,
 *   total_runs      integer DEFAULT 0,
 *   success_runs    integer DEFAULT 0,
 *   last_run_at     timestamptz,
 *   created_at      timestamptz DEFAULT now()
 * );
 * ALTER TABLE automation_programs ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "prog_own" ON automation_programs FOR ALL USING (auth.uid() = user_id);
 *
 * ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES automation_programs(id);
 * CREATE INDEX IF NOT EXISTS idx_sp_program ON scheduled_posts(program_id);
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import {
  claimScheduledPost, executeScheduledPost, finishScheduledPost,
  type ScheduledPost,
} from '@/lib/schedulerService'

interface Props { user: User }

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhoneRecord {
  id: string
  geelark_id: string
  phone_name: string
  ig_username: string | null
  status?: string
}

interface FolderInfo { name: string; count: number }

interface AutomationProgram {
  id: string
  user_id: string
  org_id: string | null
  name: string
  description: string
  status: 'active' | 'paused'
  frequency: 'daily' | 'weekly' | 'custom'
  days: string[]
  time_hour: number
  time_minute: number
  timezone: string
  posts_per_day: number
  phones: PhoneRecord[]
  video_folders: string[]
  video_behavior: 'random' | 'sequential' | 'smart'
  delay_min_sec: number
  delay_max_sec: number
  avoid_duplicates: boolean
  caption_mode: 'fixed' | 'ai' | 'random'
  caption_template: string
  hashtags: string
  bearer_token: string
  ignore_offline: boolean
  retry_on_error: boolean
  delete_metadata: boolean
  total_runs: number
  success_runs: number
  last_run_at: string | null
  created_at: string
}

interface ProgramDraft {
  name: string; description: string; status: 'active' | 'paused'
  frequency: 'daily' | 'weekly' | 'custom'
  days: string[]; time_hour: number; time_minute: number; ampm: 'AM' | 'PM'
  timezone: string; posts_per_day: number
  selected_phones: PhoneRecord[]
  video_folders: string[]; video_behavior: 'random' | 'sequential' | 'smart'
  delay_min_sec: number; delay_max_sec: number; avoid_duplicates: boolean
  caption_mode: 'fixed' | 'ai' | 'random'; caption_template: string; hashtags: string
  bearer_token: string
  ignore_offline: boolean; retry_on_error: boolean; delete_metadata: boolean
}

function defaultDraft(): ProgramDraft {
  return {
    name: '', description: '', status: 'active',
    frequency: 'daily', days: ['mon','tue','wed','thu','fri','sat','sun'],
    time_hour: 10, time_minute: 0, ampm: 'AM',
    timezone: 'Europe/Paris', posts_per_day: 1,
    selected_phones: [], video_folders: [], video_behavior: 'random',
    delay_min_sec: 30, delay_max_sec: 90, avoid_duplicates: true,
    caption_mode: 'fixed', caption_template: '', hashtags: '',
    bearer_token: localStorage.getItem('sf_bearer') || '',
    ignore_offline: true, retry_on_error: true, delete_metadata: false,
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { key: 'mon', label: 'Lun' }, { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mer' }, { key: 'thu', label: 'Jeu' },
  { key: 'fri', label: 'Ven' }, { key: 'sat', label: 'Sam' },
  { key: 'sun', label: 'Dim' },
]

const TIMEZONES = [
  'Europe/Paris', 'Europe/London', 'America/New_York',
  'America/Los_Angeles', 'America/Chicago', 'Asia/Tokyo',
  'Asia/Dubai', 'Australia/Sydney',
]

const WIZARD_STEPS = [
  { id: 0, label: 'Général' },
  { id: 1, label: 'Horaire' },
  { id: 2, label: 'Téléphones' },
  { id: 3, label: 'Pool de vidéos' },
  { id: 4, label: 'Options avancées' },
  { id: 5, label: 'Résumé' },
]

const FREQ_LABELS: Record<string, string> = {
  daily: 'Quotidien', weekly: 'Hebdomadaire', custom: 'Personnalisé',
}
const BEHAV_LABELS: Record<string, string> = {
  random: 'Aléatoire', sequential: 'Séquentiel', smart: 'Smart Rotation',
}
const CAPTION_LABELS: Record<string, string> = {
  fixed: 'Caption fixe', ai: 'Génération IA', random: 'Aléatoire',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(h: number, m: number, ap: 'AM' | 'PM') {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`
}

function nextRunLabel(prog: AutomationProgram): string {
  const now = new Date()
  const next = new Date()
  next.setHours(prog.time_hour, prog.time_minute, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  const diff = next.getTime() - now.getTime()
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  return hrs === 0 ? `Dans ${mins}min` : `Dans ${hrs}h${mins > 0 ? `${mins}m` : ''}`
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative',
        background: value ? 'linear-gradient(130deg,#7C3AED,#8B5CF6)' : 'rgba(255,255,255,0.1)' }}>
      <span style={{
        position: 'absolute', top: 3, width: 18, height: 18, borderRadius: 9,
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'transform 0.15s', transform: value ? 'translateX(21px)' : 'translateX(3px)',
        display: 'block',
      }} />
    </button>
  )
}

// ─── Main Scheduler ───────────────────────────────────────────────────────────

export function Scheduler({ user }: Props) {
  const { currentOrg } = useOrg()

  // Programs
  const [programs,     setPrograms]     = useState<AutomationProgram[]>([])
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)

  // Wizard
  const [showWizard,   setShowWizard]   = useState(false)
  const [editProgram,  setEditProgram]  = useState<AutomationProgram | null>(null)
  const [wizardStep,   setWizardStep]   = useState(0)
  const [draft,        setDraft]        = useState<ProgramDraft>(defaultDraft())

  // Phone / folder data
  const [phones,       setPhones]       = useState<PhoneRecord[]>([])
  const [videoFolders, setVideoFolders] = useState<FolderInfo[]>([])
  const [phoneSearch,  setPhoneSearch]  = useState('')

  // Execution state
  const [runningPost,  setRunningPost]  = useState<string | null>(null)
  const [runLogs,      setRunLogs]      = useState<{ id: string; msgs: string[] } | null>(null)
  const [programPosts, setProgramPosts] = useState<ScheduledPost[]>([])

  // Sidebar
  const [search,       setSearch]       = useState('')
  const [deleting,     setDeleting]     = useState<string | null>(null)
  const [toggling,     setToggling]     = useState<string | null>(null)

  // Refs for execution engine
  const runningProgramsRef = useRef<Set<string>>(new Set())
  const runningPostsRef    = useRef<Set<string>>(new Set())
  const postTimersRef      = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const selectedProgram = programs.find(p => p.id === selectedId) ?? null

  // ── Data loaders ────────────────────────────────────────────────────────────

  const loadPrograms = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('automation_programs').select('*').order('created_at', { ascending: false })
    q = currentOrg
      ? (q as any).eq('org_id', currentOrg.id)
      : (q as any).eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      phones:       typeof r.phones       === 'string' ? JSON.parse(r.phones)       : (r.phones       ?? []),
      video_folders: typeof r.video_folders === 'string' ? JSON.parse(r.video_folders) : (r.video_folders ?? []),
      days:         typeof r.days         === 'string' ? JSON.parse(r.days)         : (r.days         ?? []),
    })) as AutomationProgram[]
    setPrograms(rows)
    if (rows.length > 0 && !selectedId) setSelectedId(rows[0].id)
    setLoading(false)
  }, [currentOrg?.id, user.id])

  const loadPhones = useCallback(async () => {
    const { data } = await supabase
      .from('phones')
      .select('id,geelark_id,phone_name,ig_username,status')
      .order('phone_name')
    // Deduplicate by id just in case
    const seen = new Set<string>()
    const unique = (data ?? []).filter((p: any) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
    setPhones(unique as PhoneRecord[])
  }, [])

  const loadFolders = useCallback(async () => {
    let q = supabase.from('content_bank').select('folder')
    q = currentOrg
      ? (q as any).eq('org_id', currentOrg.id)
      : (q as any).eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    const counts = new Map<string, number>()
    for (const r of data ?? []) {
      const f = (r as any).folder
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1)
    }
    setVideoFolders([...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)))
  }, [currentOrg?.id, user.id])

  const loadProgramPosts = useCallback(async (progId: string) => {
    const { data } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('program_id', progId)
      .order('created_at', { ascending: false })
      .limit(50)
    const posts = (data ?? []).map((r: any) => ({
      ...r,
      phones: typeof r.phones === 'string' ? JSON.parse(r.phones) : (r.phones ?? []),
      videos: typeof r.videos === 'string' ? JSON.parse(r.videos) : (r.videos ?? []),
      result: typeof r.result === 'string' ? JSON.parse(r.result) : r.result,
    })) as ScheduledPost[]
    setProgramPosts(posts)
  }, [])

  useEffect(() => {
    loadPrograms()
    loadPhones()
    loadFolders()
  }, [loadPrograms, loadPhones, loadFolders])

  useEffect(() => {
    if (selectedId) loadProgramPosts(selectedId)
  }, [selectedId, loadProgramPosts])

  // Cleanup timers on unmount
  useEffect(() => {
    const t = postTimersRef.current
    return () => { t.forEach(clearTimeout); t.clear() }
  }, [])

  // ── Execution engine ────────────────────────────────────────────────────────

  // Get a signed URL for a storage path so Geelark can download it
  async function getVideoToken(storagePath: string | null, fileUrl: string | null): Promise<string | null> {
    // Prefer direct file_url if it looks like an http URL
    if (fileUrl && /^https?:\/\//.test(fileUrl)) return fileUrl
    // Otherwise create a 2-hour signed URL from Supabase storage
    if (storagePath) {
      const { data } = await supabase.storage.from('content').createSignedUrl(storagePath, 7200)
      return data?.signedUrl ?? null
    }
    return null
  }

  // Pick one video from the program's pool, respecting behavior & anti-dup
  async function pickVideo(prog: AutomationProgram): Promise<{ token: string; title: string } | null> {
    if (!prog.video_folders.length) return null

    let q = supabase.from('content_bank').select('id,storage_path,file_url,title').in('folder', prog.video_folders)
    q = currentOrg
      ? (q as any).eq('org_id', currentOrg.id)
      : (q as any).eq('user_id', user.id).is('org_id', null)
    const { data: all } = await q
    if (!all || !all.length) return null

    let pool = all as any[]

    // Anti-duplicate: filter out recently used tokens
    if (prog.avoid_duplicates || prog.video_behavior === 'smart') {
      const { data: recent } = await supabase
        .from('scheduled_posts')
        .select('videos')
        .eq('program_id', prog.id)
        .order('created_at', { ascending: false })
        .limit(pool.length * 2)

      const usedTokens = new Set<string>(
        (recent ?? []).flatMap((p: any) => {
          const vids = typeof p.videos === 'string' ? JSON.parse(p.videos) : (p.videos ?? [])
          return vids.map((v: any) => v.token as string)
        })
      )

      const unused = pool.filter(v => !usedTokens.has(v.storage_path ?? '') && !usedTokens.has(v.file_url ?? ''))

      if (unused.length > 0) {
        pool = unused
      } else if (prog.avoid_duplicates && prog.video_behavior !== 'smart') {
        return null // strict no-dup: all used, don't post
      }
      // smart: pool = all (restart rotation)
    }

    let picked: any
    if (prog.video_behavior === 'sequential') {
      const { count } = await supabase.from('scheduled_posts')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', prog.id)
      picked = pool[(count ?? 0) % pool.length]
    } else {
      picked = pool[Math.floor(Math.random() * pool.length)]
    }

    const token = await getVideoToken(picked.storage_path ?? null, picked.file_url ?? null)
    if (!token) return null
    return { token, title: picked.title ?? 'Vidéo' }
  }

  // Build the caption from program config
  function buildCaption(prog: AutomationProgram): string {
    let base = ''
    if (prog.caption_mode === 'fixed') {
      base = prog.caption_template
    } else if (prog.caption_mode === 'random') {
      const lines = prog.caption_template.split('\n').map(l => l.trim()).filter(Boolean)
      base = lines.length ? lines[Math.floor(Math.random() * lines.length)] : ''
    } else {
      // ai mode: use template as-is for now
      base = prog.caption_template
    }
    return base + (prog.hashtags?.trim() ? (base ? '\n\n' : '') + prog.hashtags.trim() : '')
  }

  // Schedule and execute a single scheduled_post entry
  const schedulePostExecution = useCallback((post: ScheduledPost) => {
    if (runningPostsRef.current.has(post.id)) return

    const execute = async () => {
      runningPostsRef.current.add(post.id)
      const claimed = await claimScheduledPost(post.id)
      if (!claimed) { runningPostsRef.current.delete(post.id); return }

      setRunningPost(post.id)
      const msgs: string[] = []
      setRunLogs({ id: post.id, msgs: [] })

      const ok = await executeScheduledPost(post, msg => {
        msgs.push(msg)
        setRunLogs({ id: post.id, msgs: [...msgs] })
      })

      await finishScheduledPost(post.id, ok, msgs, ok ? undefined : msgs[msgs.length - 1])

      // Update program run counters
      if (post.program_id) {
        const { data: cur } = await supabase.from('automation_programs')
          .select('total_runs,success_runs').eq('id', post.program_id).single()
        if (cur) {
          await supabase.from('automation_programs').update({
            total_runs:   (cur.total_runs   ?? 0) + 1,
            success_runs: (cur.success_runs ?? 0) + (ok ? 1 : 0),
          }).eq('id', post.program_id)
        }
      }

      setRunningPost(null)
      runningPostsRef.current.delete(post.id)
      if (selectedId) loadProgramPosts(selectedId)
      loadPrograms()
    }

    const delay = new Date(post.scheduled_at).getTime() - Date.now()
    if (delay <= 0) {
      execute()
    } else {
      const t = setTimeout(execute, delay)
      postTimersRef.current.set(post.id, t)
    }
  }, [selectedId, loadProgramPosts, loadPrograms])

  // Run a program: pick video, build caption, create scheduled_post(s), execute
  const runProgram = useCallback(async (prog: AutomationProgram) => {
    if (runningProgramsRef.current.has(prog.id)) return
    runningProgramsRef.current.add(prog.id)

    try {
      const bearer = prog.bearer_token?.trim() || localStorage.getItem('sf_bearer') || ''
      if (!bearer) {
        console.warn(`[Scheduler] "${prog.name}": bearer token manquant`)
        return
      }

      const video = await pickVideo(prog)
      if (!video) {
        console.warn(`[Scheduler] "${prog.name}": aucune vidéo disponible dans les dossiers`)
        return
      }

      const caption = buildCaption(prog)
      const now = new Date()

      for (let i = 0; i < prog.posts_per_day; i++) {
        const scheduledAt = new Date(now)
        if (i > 0) {
          // Stagger posts: add randomised delay between them
          const delay = prog.delay_min_sec + Math.random() * Math.max(0, prog.delay_max_sec - prog.delay_min_sec)
          scheduledAt.setSeconds(scheduledAt.getSeconds() + Math.round(delay) * i)
        }

        const { data: postData, error } = await supabase.from('scheduled_posts').insert({
          user_id:          user.id,
          org_id:           currentOrg?.id ?? null,
          created_by_name:  user.email ?? 'Automation',
          type:             'mass_posting',
          status:           'pending',
          scheduled_at:     scheduledAt.toISOString(),
          phones:           prog.phones,
          videos:           [video],
          caption,
          delay_minutes:    Math.round(prog.delay_min_sec / 60),
          mode:             prog.video_behavior === 'sequential' ? 'seq' : 'random',
          bearer_token:     bearer,
          program_id:       prog.id,
        }).select().single()

        if (!error && postData) {
          const post = postData as ScheduledPost
          setProgramPosts(prev => [post, ...prev])
          schedulePostExecution(post)
        } else {
          console.error('[Scheduler] Erreur création post:', error)
        }
      }

      // Stamp last_run_at
      await supabase.from('automation_programs')
        .update({ last_run_at: now.toISOString() })
        .eq('id', prog.id)
      setPrograms(prev => prev.map(p => p.id === prog.id ? { ...p, last_run_at: now.toISOString() } : p))

    } finally {
      runningProgramsRef.current.delete(prog.id)
    }
  }, [currentOrg?.id, user.id, user.email, schedulePostExecution])

  // Every 30s: check if any active program should fire right now
  const checkAndRunPrograms = useCallback(async () => {
    if (!programs.length) return
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat']
    const todayKey = DAY_KEYS[now.getDay()]

    for (const prog of programs) {
      if (prog.status !== 'active') continue
      if (prog.time_hour !== h || prog.time_minute !== m) continue
      if (!prog.days.includes(todayKey)) continue
      if (runningProgramsRef.current.has(prog.id)) continue

      // Anti double-fire: was a post already created in the last 2 minutes?
      const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString()
      const { count } = await supabase
        .from('scheduled_posts')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', prog.id)
        .gte('created_at', twoMinAgo)

      if ((count ?? 0) > 0) continue

      runProgram(prog)
    }
  }, [programs, runProgram])

  useEffect(() => {
    const interval = setInterval(checkAndRunPrograms, 30_000)
    return () => clearInterval(interval)
  }, [checkAndRunPrograms])

  // On load: schedule execution of any existing pending posts for our programs
  useEffect(() => {
    if (!programs.length) return
    const progIds = new Set(programs.map(p => p.id))
    supabase.from('scheduled_posts')
      .select('*')
      .in('program_id', [...progIds])
      .eq('status', 'pending')
      .then(({ data }) => {
        const posts = (data ?? []).map((r: any) => ({
          ...r,
          phones: typeof r.phones === 'string' ? JSON.parse(r.phones) : (r.phones ?? []),
          videos: typeof r.videos === 'string' ? JSON.parse(r.videos) : (r.videos ?? []),
          result: typeof r.result === 'string' ? JSON.parse(r.result) : r.result,
        })) as ScheduledPost[]
        posts.forEach(schedulePostExecution)
      })
  }, [programs.length, schedulePostExecution])

  // Realtime: new post created for our programs → schedule execution
  useEffect(() => {
    const ch = supabase.channel('scheduler-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scheduled_posts' }, payload => {
        const raw = payload.new as any
        if (!raw.program_id) return
        const post: ScheduledPost = {
          ...raw,
          phones: typeof raw.phones === 'string' ? JSON.parse(raw.phones) : (raw.phones ?? []),
          videos: typeof raw.videos === 'string' ? JSON.parse(raw.videos) : (raw.videos ?? []),
          result: typeof raw.result === 'string' ? JSON.parse(raw.result) : raw.result,
        }
        if (post.status === 'pending' && post.user_id === user.id) schedulePostExecution(post)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scheduled_posts' }, payload => {
        const raw = payload.new as any
        if (!raw.program_id) return
        setProgramPosts(prev => prev.map(p => p.id === raw.id ? {
          ...raw,
          phones: typeof raw.phones === 'string' ? JSON.parse(raw.phones) : (raw.phones ?? []),
          videos: typeof raw.videos === 'string' ? JSON.parse(raw.videos) : (raw.videos ?? []),
          result: typeof raw.result === 'string' ? JSON.parse(raw.result) : raw.result,
        } : p))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user.id, schedulePostExecution])

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async function toggleStatus(prog: AutomationProgram) {
    setToggling(prog.id)
    const ns = prog.status === 'active' ? 'paused' : 'active'
    await supabase.from('automation_programs').update({ status: ns }).eq('id', prog.id)
    setPrograms(prev => prev.map(p => p.id === prog.id ? { ...p, status: ns } : p))
    setToggling(null)
  }

  async function deleteProgram(id: string) {
    if (!confirm('Supprimer ce programme ?')) return
    setDeleting(id)
    await supabase.from('automation_programs').delete().eq('id', id)
    setPrograms(prev => prev.filter(p => p.id !== id))
    if (selectedId === id) setSelectedId(programs.find(p => p.id !== id)?.id ?? null)
    setDeleting(null)
  }

  async function duplicateProgram(prog: AutomationProgram) {
    const { data } = await supabase.from('automation_programs').insert({
      ...prog, id: undefined, name: `${prog.name} (copie)`,
      status: 'paused', total_runs: 0, success_runs: 0, last_run_at: null,
      created_at: undefined, user_id: user.id, org_id: currentOrg?.id ?? null,
    }).select().single()
    if (data) setPrograms(prev => [data as AutomationProgram, ...prev])
  }

  function openCreate() {
    setDraft(defaultDraft())
    setEditProgram(null)
    setWizardStep(0)
    setShowWizard(true)
  }

  function openEdit(prog: AutomationProgram) {
    setDraft({
      name: prog.name, description: prog.description, status: prog.status,
      frequency: prog.frequency, days: prog.days,
      time_hour: prog.time_hour % 12 || 12,
      time_minute: prog.time_minute,
      ampm: prog.time_hour >= 12 ? 'PM' : 'AM',
      timezone: prog.timezone, posts_per_day: prog.posts_per_day,
      selected_phones: prog.phones, video_folders: prog.video_folders,
      video_behavior: prog.video_behavior,
      delay_min_sec: prog.delay_min_sec, delay_max_sec: prog.delay_max_sec,
      avoid_duplicates: prog.avoid_duplicates,
      caption_mode: prog.caption_mode, caption_template: prog.caption_template,
      hashtags: prog.hashtags, bearer_token: prog.bearer_token,
      ignore_offline: prog.ignore_offline, retry_on_error: prog.retry_on_error,
      delete_metadata: prog.delete_metadata,
    })
    setEditProgram(prog)
    setWizardStep(0)
    setShowWizard(true)
  }

  async function saveProgram() {
    setSaving(true)
    const hour24 = draft.ampm === 'PM'
      ? (draft.time_hour === 12 ? 12 : draft.time_hour + 12)
      : (draft.time_hour === 12 ? 0 : draft.time_hour)

    const payload = {
      user_id: user.id, org_id: currentOrg?.id ?? null,
      name: draft.name.trim() || 'Programme sans nom',
      description: draft.description, status: draft.status,
      frequency: draft.frequency, days: draft.days,
      time_hour: hour24, time_minute: draft.time_minute,
      timezone: draft.timezone, posts_per_day: draft.posts_per_day,
      phones: draft.selected_phones, video_folders: draft.video_folders,
      video_behavior: draft.video_behavior,
      delay_min_sec: draft.delay_min_sec, delay_max_sec: draft.delay_max_sec,
      avoid_duplicates: draft.avoid_duplicates,
      caption_mode: draft.caption_mode, caption_template: draft.caption_template,
      hashtags: draft.hashtags, bearer_token: draft.bearer_token,
      ignore_offline: draft.ignore_offline, retry_on_error: draft.retry_on_error,
      delete_metadata: draft.delete_metadata,
    }

    // Persist bearer token to localStorage for reuse
    if (draft.bearer_token.trim()) localStorage.setItem('sf_bearer', draft.bearer_token.trim())

    if (editProgram) {
      const { data } = await supabase.from('automation_programs').update(payload).eq('id', editProgram.id).select().single()
      if (data) setPrograms(prev => prev.map(p => p.id === editProgram.id ? {
        ...(data as AutomationProgram),
        phones: typeof (data as any).phones === 'string' ? JSON.parse((data as any).phones) : ((data as any).phones ?? []),
        video_folders: typeof (data as any).video_folders === 'string' ? JSON.parse((data as any).video_folders) : ((data as any).video_folders ?? []),
        days: typeof (data as any).days === 'string' ? JSON.parse((data as any).days) : ((data as any).days ?? []),
      } : p))
    } else {
      const { data } = await supabase.from('automation_programs').insert({
        ...payload, total_runs: 0, success_runs: 0,
      }).select().single()
      if (data) {
        const prog = {
          ...(data as AutomationProgram),
          phones: typeof (data as any).phones === 'string' ? JSON.parse((data as any).phones) : ((data as any).phones ?? []),
          video_folders: typeof (data as any).video_folders === 'string' ? JSON.parse((data as any).video_folders) : ((data as any).video_folders ?? []),
          days: typeof (data as any).days === 'string' ? JSON.parse((data as any).days) : ((data as any).days ?? []),
        }
        setPrograms(prev => [prog, ...prev])
        setSelectedId(prog.id)
      }
    }
    setSaving(false)
    setShowWizard(false)
  }

  const patchDraft = (patch: Partial<ProgramDraft>) => setDraft(prev => ({ ...prev, ...patch }))

  // ── Stats ────────────────────────────────────────────────────────────────────
  const activeCount  = programs.filter(p => p.status === 'active').length
  const todayPosts   = programs.filter(p => p.status === 'active').reduce((s, p) => s + p.posts_per_day, 0)
  // Count unique phone IDs across all active programs
  const uniquePhoneIds = new Set(programs.filter(p => p.status === 'active').flatMap(p => p.phones.map(ph => ph.id)))
  const totalPhones  = uniquePhoneIds.size
  const totalFolders = new Set(programs.flatMap(p => p.video_folders)).size
  const allRuns      = programs.reduce((s, p) => s + p.total_runs, 0)
  const allSuccess   = programs.reduce((s, p) => s + p.success_runs, 0)
  const successRate  = allRuns === 0 ? 100 : Math.round(allSuccess / allRuns * 100)

  const filtered = programs.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  // ── Render step ──────────────────────────────────────────────────────────────

  function renderStep() {
    switch (wizardStep) {
      case 0: return <StepGeneral    draft={draft} patch={patchDraft} />
      case 1: return <StepHoraire    draft={draft} patch={patchDraft} />
      case 2: return <StepPhones     draft={draft} patch={patchDraft} phones={phones} search={phoneSearch} setSearch={setPhoneSearch} />
      case 3: return <StepVideos     draft={draft} patch={patchDraft} folders={videoFolders} />
      case 4: return <StepOptions    draft={draft} patch={patchDraft} />
      case 5: return <StepResume     draft={draft} onSave={saveProgram} saving={saving} />
      default: return null
    }
  }

  const STATS = [
    { icon: '📅', label: 'Programmes actifs',  value: activeCount,    sub: 'En cours',    color: '#8B5CF6' },
    { icon: '⚡', label: 'Posts aujourd\'hui',  value: todayPosts,     sub: 'Prévus',      color: '#A855F7' },
    { icon: '📱', label: 'Téléphones assignés', value: totalPhones,    sub: 'Uniques',     color: '#6D28D9' },
    { icon: '🎬', label: 'Dossiers vidéos',     value: totalFolders,   sub: 'Pools actifs',color: '#7C3AED' },
    { icon: '✅', label: 'Taux de réussite',    value: `${successRate}%`, sub: 'Global',   color: '#22C55E' },
  ]

  // ── JSX ──────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07070B' }}>

      {/* Stats bar */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-black text-white leading-none tracking-tight">Programmation</h1>
            <p className="text-[12px] mt-1" style={{ color: '#6B6B7A' }}>Automation massive — rotation intelligente — posts autonomes</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold"
              style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
              📖 Guide rapide
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold"
              style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}>
              + Créer une programmation
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          {STATS.map(s => (
            <div key={s.label} className="flex-1 rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                style={{ background: `${s.color}18`, border: `1px solid ${s.color}25` }}>
                {s.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[20px] font-black leading-none" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: '#6B6B7A' }}>{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid rgba(139,92,246,0.1)', background: '#07070B' }}>
          <div className="flex-shrink-0 px-4 pt-4 pb-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 text-sm">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] focus:outline-none"
                style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.15)', color: '#fff' }} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-4xl mb-3">🤖</p>
                <p className="text-[13px] font-bold text-white mb-1">Aucun programme</p>
                <p className="text-[12px]" style={{ color: '#6B6B7A' }}>Crée ton premier programme d'automation</p>
                <button onClick={openCreate} className="mt-4 px-4 py-2 rounded-xl text-[12px] font-bold"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }}>
                  + Créer
                </button>
              </div>
            ) : filtered.map(prog => (
              <ProgramSidebarCard
                key={prog.id} prog={prog}
                selected={prog.id === selectedId}
                isRunning={runningProgramsRef.current.has(prog.id)}
                toggling={toggling === prog.id}
                onSelect={() => setSelectedId(prog.id)}
                onToggle={() => toggleStatus(prog)}
                onEdit={() => openEdit(prog)}
                onDuplicate={() => duplicateProgram(prog)}
                onDelete={() => deleteProgram(prog.id)}
                onRunNow={() => runProgram(prog)}
              />
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedProgram ? (
            <ProgramOverview
              prog={selectedProgram}
              posts={programPosts}
              runningPostId={runningPost}
              runLogs={runLogs}
              isRunning={runningProgramsRef.current.has(selectedProgram.id)}
              onEdit={() => openEdit(selectedProgram)}
              onToggle={() => toggleStatus(selectedProgram)}
              onRunNow={() => runProgram(selectedProgram)}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-4xl"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  🤖
                </div>
                <div>
                  <p className="text-[18px] font-black text-white">Aucun programme sélectionné</p>
                  <p className="text-[13px] mt-1" style={{ color: '#6B6B7A' }}>Sélectionne un programme ou crée-en un nouveau</p>
                </div>
                <button onClick={openCreate} className="px-6 py-3 rounded-xl text-[14px] font-bold"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}>
                  + Créer un programme
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wizard overlay */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#07070B' }}>
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-8 py-4"
            style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(14,14,22,0.95)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)' }}>✦</div>
              <div>
                <p className="text-[15px] font-black text-white leading-none">
                  {editProgram ? `Modifier — ${editProgram.name}` : 'Nouvelle programmation'}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#6B6B7A' }}>
                  Étape {wizardStep + 1} / {WIZARD_STEPS.length} — {WIZARD_STEPS[wizardStep].label}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {WIZARD_STEPS.map((_, i) => (
                  <button key={i} onClick={() => setWizardStep(i)}
                    style={{ height: 8, borderRadius: 4,
                      width: i === wizardStep ? 24 : 8,
                      background: i < wizardStep ? '#8B5CF6' : i === wizardStep ? 'linear-gradient(90deg,#7C3AED,#8B5CF6)' : 'rgba(255,255,255,0.1)',
                      transition: 'all 0.2s',
                    }} />
                ))}
              </div>
              <button onClick={() => setShowWizard(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#A1A1AA', border: '1px solid rgba(255,255,255,0.08)' }}>
                ✕
              </button>
            </div>
          </div>

          {/* 3-column body */}
          <div className="flex-1 min-h-0 flex overflow-hidden">

            {/* Left: step nav */}
            <div className="w-56 flex-shrink-0 flex flex-col py-6 px-4 gap-1 overflow-y-auto"
              style={{ borderRight: '1px solid rgba(139,92,246,0.1)', background: 'rgba(7,7,11,0.8)' }}>
              {WIZARD_STEPS.map((s, i) => (
                <button key={i} onClick={() => setWizardStep(i)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: i === wizardStep ? 'rgba(139,92,246,0.12)' : 'transparent',
                    borderLeft: i === wizardStep ? '2px solid #8B5CF6' : '2px solid transparent',
                  }}>
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0"
                    style={{
                      background: i < wizardStep ? 'rgba(34,197,94,0.2)' : i === wizardStep ? 'linear-gradient(130deg,#7C3AED,#8B5CF6)' : 'rgba(255,255,255,0.05)',
                      color: i < wizardStep ? '#22C55E' : i === wizardStep ? '#fff' : '#6B6B7A',
                    }}>
                    {i < wizardStep ? '✓' : i + 1}
                  </span>
                  <span className="text-[13px] font-semibold"
                    style={{ color: i === wizardStep ? '#fff' : i < wizardStep ? '#A1A1AA' : '#6B6B7A' }}>
                    {s.label}
                  </span>
                </button>
              ))}
              {draft.name && (
                <div className="mt-6 rounded-xl p-3"
                  style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <p className="text-[11px] font-bold text-white truncate">{draft.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#6B6B7A' }}>
                    {FREQ_LABELS[draft.frequency]} · {fmtTime(draft.time_hour, draft.time_minute, draft.ampm)}
                  </p>
                  {draft.selected_phones.length > 0 && (
                    <p className="text-[10px] mt-0.5" style={{ color: '#a78bfa' }}>
                      📱 {draft.selected_phones.length} téléphones
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Center: form */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-2xl mx-auto">{renderStep()}</div>
              </div>
              {/* Nav buttons */}
              <div className="flex-shrink-0 flex items-center justify-between px-8 py-4"
                style={{ borderTop: '1px solid rgba(139,92,246,0.1)' }}>
                <button
                  onClick={() => wizardStep > 0 ? setWizardStep(s => s - 1) : setShowWizard(false)}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#A1A1AA', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {wizardStep === 0 ? '✕ Annuler' : '← Retour'}
                </button>
                <span className="text-[12px]" style={{ color: '#6B6B7A' }}>{wizardStep + 1} / {WIZARD_STEPS.length}</span>
                {wizardStep < WIZARD_STEPS.length - 1 ? (
                  <button onClick={() => setWizardStep(s => s + 1)}
                    className="px-6 py-2.5 rounded-xl text-[13px] font-bold"
                    style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff', boxShadow: '0 4px 16px rgba(124,58,237,0.35)' }}>
                    Suivant →
                  </button>
                ) : (
                  <button onClick={saveProgram} disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold disabled:opacity-60"
                    style={{ background: 'linear-gradient(130deg,#22C55E,#16a34a)', color: '#fff' }}>
                    {saving ? <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Enregistrement…</> : <>✅ {editProgram ? 'Mettre à jour' : 'Créer'}</>}
                  </button>
                )}
              </div>
            </div>

            {/* Right: live summary */}
            <div className="w-72 flex-shrink-0 flex flex-col overflow-y-auto py-6 px-5"
              style={{ borderLeft: '1px solid rgba(139,92,246,0.1)', background: 'rgba(7,7,11,0.8)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: '#6B6B7A' }}>
                📋 Récapitulatif
              </p>
              <WizardSummary draft={draft} />
              <div className="mt-auto pt-4">
                <button onClick={saveProgram} disabled={saving}
                  className="w-full py-3 rounded-xl text-[13px] font-bold disabled:opacity-60"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }}>
                  {saving ? '…' : editProgram ? '✓ Mettre à jour' : '✓ Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar card ─────────────────────────────────────────────────────────────

function ProgramSidebarCard({ prog, selected, isRunning, toggling, onSelect, onToggle, onEdit, onDuplicate, onDelete, onRunNow }: {
  prog: AutomationProgram; selected: boolean; isRunning: boolean; toggling: boolean
  onSelect: () => void; onToggle: () => void; onEdit: () => void
  onDuplicate: () => void; onDelete: () => void; onRunNow: () => void
}) {
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menu])

  return (
    <div onClick={onSelect}
      className="rounded-2xl p-4 cursor-pointer group relative"
      style={{
        background: selected ? 'rgba(139,92,246,0.1)' : '#0E0E16',
        border: selected ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(139,92,246,0.1)',
        boxShadow: selected ? '0 0 20px rgba(139,92,246,0.1)' : 'none',
      }}>
      <div className="absolute top-0 left-4 right-4 h-[2px] rounded-full"
        style={{ background: prog.status === 'active' ? 'linear-gradient(90deg,#7C3AED,#8B5CF6)' : 'rgba(255,255,255,0.06)' }} />

      <div className="flex items-start justify-between gap-2 mt-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isRunning && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />}
            <p className="text-[14px] font-bold text-white truncate">{prog.name}</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={prog.status === 'active'
                ? { background: 'rgba(34,197,94,0.12)', color: '#22C55E' }
                : { background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              {prog.status === 'active' ? '● Actif' : '⏸ Pause'}
            </span>
            <span className="text-[11px]" style={{ color: '#6B6B7A' }}>{FREQ_LABELS[prog.frequency]}</span>
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button onClick={e => { e.stopPropagation(); setMenu(v => !v) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#A1A1AA' }}>
            ⋯
          </button>
          {menu && (
            <div className="absolute right-0 top-9 w-48 rounded-xl overflow-hidden z-10"
              style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              {[
                { icon: '▶', label: 'Lancer maintenant', action: () => { onRunNow(); setMenu(false) } },
                { icon: '✏', label: 'Modifier',           action: () => { onEdit(); setMenu(false) } },
                { icon: '⏯', label: prog.status === 'active' ? 'Mettre en pause' : 'Activer', action: () => { onToggle(); setMenu(false) } },
                { icon: '⧉', label: 'Dupliquer',          action: () => { onDuplicate(); setMenu(false) } },
                { icon: '✕', label: 'Supprimer',          action: () => { onDelete(); setMenu(false) }, danger: true },
              ].map(item => (
                <button key={item.label}
                  onClick={e => { e.stopPropagation(); item.action() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] font-semibold text-left"
                  style={{ color: (item as any).danger ? '#EF4444' : '#A1A1AA' }}
                  onMouseEnter={e => (e.currentTarget.style.background = (item as any).danger ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <span className="text-[11px] font-bold" style={{ color: '#a78bfa' }}>
          🕐 {String(prog.time_hour).padStart(2,'0')}:{String(prog.time_minute).padStart(2,'0')}
        </span>
        <span className="text-[11px]" style={{ color: '#6B6B7A' }}>📱 {prog.phones.length}</span>
        <span className="text-[11px]" style={{ color: '#6B6B7A' }}>🎬 {prog.video_folders.length}</span>
      </div>
      <p className="text-[10px] mt-1.5" style={{ color: '#6B6B7A' }}>
        Prochain post : <span style={{ color: '#8B5CF6' }}>{nextRunLabel(prog)}</span>
      </p>
    </div>
  )
}

// ─── Program overview ─────────────────────────────────────────────────────────

function ProgramOverview({ prog, posts, runningPostId, runLogs, isRunning, onEdit, onToggle, onRunNow }: {
  prog: AutomationProgram; posts: ScheduledPost[]
  runningPostId: string | null; runLogs: { id: string; msgs: string[] } | null
  isRunning: boolean; onEdit: () => void; onToggle: () => void; onRunNow: () => void
}) {
  const pending = posts.filter(p => p.status === 'pending' || p.status === 'running')
  const history = posts.filter(p => p.status === 'done' || p.status === 'failed' || p.status === 'cancelled')
  const allRuns    = prog.total_runs
  const rate       = allRuns === 0 ? '—' : `${Math.round(prog.success_runs / allRuns * 100)}%`

  return (
    <div className="px-8 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            {isRunning && <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />}
            <h2 className="text-[22px] font-black text-white">{prog.name}</h2>
            <span className="text-[12px] font-bold px-3 py-1 rounded-full"
              style={prog.status === 'active'
                ? { background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }
                : { background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>
              {prog.status === 'active' ? '● Actif' : '⏸ Pause'}
            </span>
          </div>
          {prog.description && <p className="text-[13px] mt-1" style={{ color: '#6B6B7A' }}>{prog.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRunNow} disabled={isRunning}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
            {isRunning ? '⏳ En cours…' : '▶ Lancer maintenant'}
          </button>
          <button onClick={onToggle}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold"
            style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
            {prog.status === 'active' ? '⏸ Pause' : '▶ Activer'}
          </button>
          <button onClick={onEdit}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold"
            style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }}>
            ✏ Modifier
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: '📅', label: 'Fréquence',  value: FREQ_LABELS[prog.frequency] },
          { icon: '🕐', label: 'Heure',       value: `${String(prog.time_hour).padStart(2,'0')}:${String(prog.time_minute).padStart(2,'0')}` },
          { icon: '🌍', label: 'Timezone',    value: prog.timezone.split('/')[1] || prog.timezone },
          { icon: '📊', label: 'Posts/jour',  value: String(prog.posts_per_day) },
        ].map(item => (
          <div key={item.label} className="rounded-2xl p-4" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span>{item.icon}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B6B7A' }}>{item.label}</span>
            </div>
            <p className="text-[18px] font-black text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total exécutions', value: allRuns,          color: '#8B5CF6' },
          { label: 'Succès',           value: prog.success_runs, color: '#22C55E' },
          { label: 'Taux de réussite', value: rate,             color: '#A855F7' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 text-center" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
            <p className="text-[24px] font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[11px] mt-1" style={{ color: '#6B6B7A' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Phones + Videos */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-5" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span>📱</span>
              <p className="text-[13px] font-bold text-white">Téléphones</p>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
              {prog.phones.length} assignés
            </span>
          </div>
          {prog.phones.length === 0
            ? <p className="text-[12px]" style={{ color: '#6B6B7A' }}>Aucun téléphone</p>
            : (
              <div className="flex flex-wrap gap-2">
                {prog.phones.slice(0, 10).map(ph => (
                  <div key={ph.id} className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black"
                      style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                      {(ph.ig_username || ph.phone_name).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[9px] max-w-[40px] truncate text-center" style={{ color: '#6B6B7A' }}>
                      {ph.ig_username || ph.phone_name}
                    </span>
                  </div>
                ))}
                {prog.phones.length > 10 && (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold"
                    style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>
                    +{prog.phones.length - 10}
                  </div>
                )}
              </div>
            )}
        </div>

        <div className="rounded-2xl p-5" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span>🎬</span>
              <p className="text-[13px] font-bold text-white">Pool de vidéos</p>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
              {BEHAV_LABELS[prog.video_behavior]}
            </span>
          </div>
          {prog.video_folders.length === 0
            ? <p className="text-[12px]" style={{ color: '#6B6B7A' }}>Aucun dossier</p>
            : (
              <div className="space-y-2">
                {prog.video_folders.map(f => (
                  <div key={f} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                    style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
                    <span className="text-base">📂</span>
                    <span className="flex-1 text-[12px] font-semibold text-white truncate">{f}</span>
                    {prog.avoid_duplicates && <span className="text-[10px]" style={{ color: '#22C55E' }}>✓ anti-dup</span>}
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* Weekly calendar */}
      <WeekCalendar prog={prog} />

      {/* Queue + Activity */}
      <div className="grid grid-cols-2 gap-4">
        {/* Queue */}
        <div className="rounded-2xl p-5" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
          <div className="flex items-center gap-2 mb-4">
            <span>⚡</span>
            <p className="text-[13px] font-bold text-white">Prochains posts</p>
            {pending.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                {pending.length}
              </span>
            )}
          </div>
          {pending.length === 0 ? (
            <p className="text-[12px] text-center py-4" style={{ color: '#6B6B7A' }}>Aucun post en attente</p>
          ) : (
            <div className="space-y-2">
              {pending.slice(0, 6).map(post => {
                const isRunning = post.id === runningPostId
                const logs = runLogs?.id === post.id ? runLogs.msgs : null
                return (
                  <div key={post.id} className="rounded-xl overflow-hidden"
                    style={{ background: isRunning ? 'rgba(245,158,11,0.06)' : 'rgba(139,92,246,0.06)', border: isRunning ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="flex items-center gap-3 px-3 py-2">
                      <span className="text-sm">{isRunning ? '🔄' : '⏳'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-white truncate">
                          {post.phones?.[0]?.ig_username || post.phones?.[0]?.phone_name || '?'} {post.phones.length > 1 ? `+${post.phones.length - 1}` : ''}
                        </p>
                        <p className="text-[10px]" style={{ color: '#6B6B7A' }}>
                          {new Date(post.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {post.caption ? ` · "${post.caption.slice(0, 30)}${post.caption.length > 30 ? '…' : ''}"` : ''}
                        </p>
                      </div>
                    </div>
                    {logs && logs.length > 0 && (
                      <div className="px-3 pb-2 space-y-0.5 max-h-24 overflow-y-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {logs.slice(-4).map((msg, i) => (
                          <p key={i} className="text-[10px] font-mono leading-snug"
                            style={{ color: msg.startsWith('❌') ? '#EF4444' : msg.startsWith('✅') ? '#22C55E' : '#6B6B7A' }}>
                            {msg}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Activity */}
        <div className="rounded-2xl p-5" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
          <div className="flex items-center gap-2 mb-4">
            <span>📋</span>
            <p className="text-[13px] font-bold text-white">Activité récente</p>
          </div>
          {history.length === 0 ? (
            <p className="text-[12px] text-center py-4" style={{ color: '#6B6B7A' }}>Aucune activité</p>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 6).map(post => (
                <div key={post.id} className="flex items-start gap-3 px-3 py-2 rounded-xl"
                  style={{ background: post.status === 'done' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)' }}>
                  <span className="text-sm mt-0.5">{post.status === 'done' ? '✅' : '❌'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white truncate">
                      {post.phones?.[0]?.ig_username || post.phones?.[0]?.phone_name || 'Post'}
                      {post.phones.length > 1 ? ` +${post.phones.length - 1}` : ''}
                    </p>
                    <p className="text-[10px]" style={{ color: '#6B6B7A' }}>
                      {post.executed_at ? new Date(post.executed_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                    {post.error_msg && (
                      <p className="text-[10px] truncate" style={{ color: '#EF4444' }}>{post.error_msg}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Caption preview */}
      {(prog.caption_template || prog.hashtags) && (
        <div className="rounded-2xl p-5" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span>✍</span>
            <p className="text-[13px] font-bold text-white">Caption / Description</p>
            <span className="text-[11px] px-2 py-0.5 rounded-full ml-auto"
              style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
              {CAPTION_LABELS[prog.caption_mode]}
            </span>
          </div>
          {prog.caption_template && (
            <p className="text-[12px] leading-relaxed" style={{ color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>
              {prog.caption_template.slice(0, 200)}{prog.caption_template.length > 200 ? '…' : ''}
            </p>
          )}
          {prog.hashtags && (
            <p className="text-[12px] mt-2" style={{ color: '#8B5CF6' }}>{prog.hashtags}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Weekly calendar ──────────────────────────────────────────────────────────

function WeekCalendar({ prog }: { prog: AutomationProgram }) {
  const today = new Date()
  const startOfWeek = new Date(today)
  const diff = today.getDay() === 0 ? -6 : 1 - today.getDay()
  startOfWeek.setDate(today.getDate() + diff)
  const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat']

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    const active = prog.days.includes(DAY_KEYS[d.getDay()])
    return { date: d, active, isToday: d.toDateString() === today.toDateString() }
  })

  return (
    <div className="rounded-2xl p-5" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span>📆</span>
          <p className="text-[13px] font-bold text-white">Calendrier de la semaine</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map(({ date, active, isToday }) => (
          <div key={date.toISOString()}
            className="rounded-xl flex flex-col items-center py-4 gap-2"
            style={{
              background: isToday ? 'rgba(139,92,246,0.12)' : active ? 'rgba(139,92,246,0.05)' : 'rgba(255,255,255,0.02)',
              border: isToday ? '1px solid rgba(139,92,246,0.35)' : active ? '1px solid rgba(139,92,246,0.15)' : '1px solid rgba(255,255,255,0.05)',
            }}>
            <p className="text-[10px] font-bold uppercase" style={{ color: isToday ? '#8B5CF6' : '#6B6B7A' }}>
              {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][date.getDay()]}
            </p>
            <p className="text-[18px] font-black" style={{ color: isToday ? '#fff' : active ? '#A1A1AA' : '#2a2a3a' }}>
              {date.getDate()}
            </p>
            {active ? (
              <div className="text-center">
                <p className="text-[11px] font-black" style={{ color: '#8B5CF6' }}>
                  {String(prog.time_hour).padStart(2,'0')}:{String(prog.time_minute).padStart(2,'0')}
                </p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                  {prog.posts_per_day}x
                </span>
              </div>
            ) : (
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Wizard steps ─────────────────────────────────────────────────────────────

const INP: React.CSSProperties = { background: '#07070B', border: '1px solid rgba(139,92,246,0.2)', color: '#fff', borderRadius: 12 }

function SectionTitle({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>{icon}</div>
        <div>
          <h3 className="text-[17px] font-black text-white leading-none">{title}</h3>
          {sub && <p className="text-[12px] mt-0.5" style={{ color: '#6B6B7A' }}>{sub}</p>}
        </div>
      </div>
      <div className="mt-4 h-px" style={{ background: 'rgba(139,92,246,0.1)' }} />
    </div>
  )
}

function FL({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#6B6B7A' }}>{children}</p>
}

function StepGeneral({ draft, patch }: { draft: ProgramDraft; patch: (p: Partial<ProgramDraft>) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle icon="✦" title="Général" sub="Nomme et configure ton programme d'automation" />
      <div>
        <FL>Nom du programme</FL>
        <input value={draft.name} onChange={e => patch({ name: e.target.value })}
          placeholder="Ex: TikTok Daily 18H00"
          className="w-full px-4 py-3 text-[14px] focus:outline-none" style={INP} />
      </div>
      <div>
        <FL>Type de programme</FL>
        <div className="flex gap-2">
          {(['daily','weekly','custom'] as const).map(f => (
            <button key={f} onClick={() => patch({ frequency: f })}
              className="flex-1 py-3 rounded-xl text-[13px] font-bold transition-all"
              style={draft.frequency === f
                ? { background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff', boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }
                : { background: 'rgba(255,255,255,0.03)', color: '#6B6B7A', border: '1px solid rgba(255,255,255,0.07)' }}>
              {f === 'daily' ? '📅 Quotidien' : f === 'weekly' ? '📆 Hebdomadaire' : '⚙ Personnalisé'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <FL>Description (optionnelle)</FL>
        <textarea value={draft.description} onChange={e => patch({ description: e.target.value })}
          placeholder="Notes sur ce programme…" rows={3}
          className="w-full px-4 py-3 text-[13px] focus:outline-none resize-none" style={INP} />
      </div>
      <div>
        <FL>Clé API Geelark (Bearer Token)</FL>
        <input value={draft.bearer_token} onChange={e => patch({ bearer_token: e.target.value })}
          placeholder="Bearer token Geelark…" type="password"
          className="w-full px-4 py-3 text-[13px] focus:outline-none font-mono" style={INP} />
        <p className="text-[11px] mt-1.5" style={{ color: '#6B6B7A' }}>
          Utilisé pour poster via l'API Geelark. Stocké localement.
        </p>
      </div>
      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.15)' }}>
        <div>
          <p className="text-[13px] font-bold text-white">Statut du programme</p>
          <p className="text-[11px] mt-0.5" style={{ color: '#6B6B7A' }}>
            {draft.status === 'active' ? 'Démarre immédiatement' : 'Mis en pause'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-semibold" style={{ color: draft.status === 'active' ? '#22C55E' : '#6B6B7A' }}>
            {draft.status === 'active' ? 'Actif' : 'En pause'}
          </span>
          <Toggle value={draft.status === 'active'} onChange={v => patch({ status: v ? 'active' : 'paused' })} />
        </div>
      </div>
    </div>
  )
}

function StepHoraire({ draft, patch }: { draft: ProgramDraft; patch: (p: Partial<ProgramDraft>) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle icon="🕐" title="Horaire" sub="Configure la fréquence et l'heure d'exécution" />
      <div>
        <FL>Heure de lancement</FL>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl flex-1"
            style={{ background: '#07070B', border: '1px solid rgba(139,92,246,0.25)' }}>
            <input type="number" min={1} max={12} value={draft.time_hour}
              onChange={e => patch({ time_hour: Math.max(1, Math.min(12, Number(e.target.value))) })}
              className="w-14 text-center text-[22px] font-black bg-transparent focus:outline-none text-white" />
            <span className="text-[18px] font-black" style={{ color: '#6B6B7A' }}>:</span>
            <input type="number" min={0} max={59} value={String(draft.time_minute).padStart(2,'0')}
              onChange={e => patch({ time_minute: Math.max(0, Math.min(59, Number(e.target.value))) })}
              className="w-14 text-center text-[22px] font-black bg-transparent focus:outline-none text-white" />
          </div>
          <div className="flex gap-1">
            {(['AM','PM'] as const).map(ap => (
              <button key={ap} onClick={() => patch({ ampm: ap })}
                className="px-4 py-3 rounded-xl text-[14px] font-bold transition-all"
                style={draft.ampm === ap
                  ? { background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#6B6B7A', border: '1px solid rgba(255,255,255,0.07)' }}>
                {ap}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <FL>Fuseau horaire</FL>
        <select value={draft.timezone} onChange={e => patch({ timezone: e.target.value })}
          className="w-full px-4 py-3 text-[13px] focus:outline-none" style={INP}>
          {TIMEZONES.map(tz => <option key={tz} value={tz} style={{ background: '#07070B' }}>{tz.replace(/_/g,' ')}</option>)}
        </select>
      </div>
      <div>
        <FL>Jours actifs</FL>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map(d => (
            <button key={d.key}
              onClick={() => {
                const active = draft.days.includes(d.key)
                patch({ days: active ? draft.days.filter(x => x !== d.key) : [...draft.days, d.key] })
              }}
              className="px-4 py-2 rounded-xl text-[13px] font-bold transition-all"
              style={draft.days.includes(d.key)
                ? { background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.04)', color: '#6B6B7A', border: '1px solid rgba(255,255,255,0.08)' }}>
              {d.label}
            </button>
          ))}
        </div>
        {draft.days.length === 7 && <p className="text-[11px] mt-2" style={{ color: '#22C55E' }}>✓ Tous les jours actifs</p>}
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <FL>Posts par jour</FL>
          <span className="text-[15px] font-black" style={{ color: '#8B5CF6' }}>{draft.posts_per_day}</span>
        </div>
        <input type="range" min={1} max={10} value={draft.posts_per_day}
          onChange={e => patch({ posts_per_day: Number(e.target.value) })}
          className="w-full accent-violet-500" />
        <div className="flex justify-between mt-1">
          <span className="text-[10px]" style={{ color: '#6B6B7A' }}>1</span>
          <span className="text-[10px]" style={{ color: '#6B6B7A' }}>10</span>
        </div>
      </div>
    </div>
  )
}

function StepPhones({ draft, patch, phones, search, setSearch }: {
  draft: ProgramDraft; patch: (p: Partial<ProgramDraft>) => void
  phones: PhoneRecord[]; search: string; setSearch: (s: string) => void
}) {
  const filtered = phones.filter(p => (p.ig_username || p.phone_name).toLowerCase().includes(search.toLowerCase()))
  const toggle = (ph: PhoneRecord) => {
    const already = draft.selected_phones.find(x => x.id === ph.id)
    patch({ selected_phones: already ? draft.selected_phones.filter(x => x.id !== ph.id) : [...draft.selected_phones, ph] })
  }

  return (
    <div className="space-y-5">
      <SectionTitle icon="📱" title="Téléphones" sub="Sélectionne les téléphones qui participeront" />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 text-sm">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] focus:outline-none" style={INP} />
        </div>
        <button onClick={() => patch({ selected_phones: phones })}
          className="px-3 py-2 rounded-xl text-[12px] font-semibold"
          style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
          Tout
        </button>
        <button onClick={() => patch({ selected_phones: [] })}
          className="px-3 py-2 rounded-xl text-[12px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#6B6B7A', border: '1px solid rgba(255,255,255,0.08)' }}>
          Aucun
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
          {draft.selected_phones.length} / {phones.length} sélectionnés
        </span>
      </div>
      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {filtered.length === 0
          ? <p className="text-center py-8 text-[13px]" style={{ color: '#6B6B7A' }}>Aucun téléphone trouvé</p>
          : filtered.map(ph => {
            const sel = !!draft.selected_phones.find(x => x.id === ph.id)
            return (
              <button key={ph.id} onClick={() => toggle(ph)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{
                  background: sel ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)',
                  border: sel ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
                  style={{ background: sel ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)', color: sel ? '#a78bfa' : '#6B6B7A' }}>
                  {(ph.ig_username || ph.phone_name).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate">{ph.ig_username || ph.phone_name}</p>
                  {ph.ig_username && <p className="text-[11px] truncate" style={{ color: '#6B6B7A' }}>{ph.phone_name}</p>}
                </div>
                {ph.status && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: ph.status === 'online' ? 'rgba(34,197,94,0.15)' : 'rgba(107,107,122,0.15)', color: ph.status === 'online' ? '#22C55E' : '#6B6B7A' }}>
                    {ph.status === 'online' ? '● En ligne' : '○ Offline'}
                  </span>
                )}
                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: sel ? '#8B5CF6' : 'rgba(255,255,255,0.05)', border: sel ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                  {sel && <span className="text-[10px] text-white font-black">✓</span>}
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )
}

function StepVideos({ draft, patch, folders }: {
  draft: ProgramDraft; patch: (p: Partial<ProgramDraft>) => void; folders: FolderInfo[]
}) {
  const toggle = (name: string) => {
    const active = draft.video_folders.includes(name)
    patch({ video_folders: active ? draft.video_folders.filter(x => x !== name) : [...draft.video_folders, name] })
  }
  return (
    <div className="space-y-5">
      <SectionTitle icon="🎬" title="Pool de vidéos" sub="Choisis les dossiers de la banque à utiliser" />
      <div>
        <FL>Dossiers disponibles</FL>
        {folders.length === 0
          ? <div className="rounded-xl p-6 text-center" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
              <p className="text-[13px]" style={{ color: '#6B6B7A' }}>Aucun dossier dans la banque vidéos</p>
            </div>
          : <div className="space-y-2 max-h-64 overflow-y-auto">
              {folders.map(f => {
                const active = draft.video_folders.includes(f.name)
                return (
                  <button key={f.name} onClick={() => toggle(f.name)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                    style={{
                      background: active ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)',
                      border: active ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    }}>
                    <span className="text-xl">📂</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate">{f.name}</p>
                      <p className="text-[11px]" style={{ color: '#6B6B7A' }}>{f.count} vidéo{f.count > 1 ? 's' : ''}</p>
                    </div>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: active ? '#8B5CF6' : 'rgba(255,255,255,0.05)', border: active ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                      {active && <span className="text-[10px] text-white font-black">✓</span>}
                    </div>
                  </button>
                )
              })}
            </div>}
      </div>
      <div>
        <FL>Comportement de sélection</FL>
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: 'random',     icon: '🔀', label: 'Aléatoire',   desc: 'Vidéo au hasard' },
            { key: 'sequential', icon: '➡', label: 'Séquentiel',  desc: 'Dans l\'ordre' },
            { key: 'smart',      icon: '🧠', label: 'Smart',       desc: 'Évite les récents' },
          ] as const).map(b => (
            <button key={b.key} onClick={() => patch({ video_behavior: b.key })}
              className="flex flex-col items-center gap-1.5 py-4 rounded-xl transition-all"
              style={draft.video_behavior === b.key
                ? { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xl">{b.icon}</span>
              <span className="text-[12px] font-bold" style={{ color: draft.video_behavior === b.key ? '#a78bfa' : '#A1A1AA' }}>{b.label}</span>
              <span className="text-[10px]" style={{ color: '#6B6B7A' }}>{b.desc}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
        <div>
          <p className="text-[13px] font-bold text-white">Éviter les doublons</p>
          <p className="text-[11px] mt-0.5" style={{ color: '#6B6B7A' }}>Ne pas reposter les vidéos récentes</p>
        </div>
        <Toggle value={draft.avoid_duplicates} onChange={v => patch({ avoid_duplicates: v })} />
      </div>
    </div>
  )
}

function StepOptions({ draft, patch }: { draft: ProgramDraft; patch: (p: Partial<ProgramDraft>) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle icon="⚙" title="Options avancées" sub="Comportement, captions et règles" />
      <div className="rounded-xl p-5 space-y-4" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
        <p className="text-[13px] font-bold text-white">⏱ Délai entre les posts</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FL>Délai minimum (sec)</FL>
            <input type="number" min={0} value={draft.delay_min_sec}
              onChange={e => patch({ delay_min_sec: Number(e.target.value) })}
              className="w-full px-4 py-2.5 rounded-xl text-[14px] font-bold focus:outline-none" style={INP} />
          </div>
          <div>
            <FL>Délai maximum (sec)</FL>
            <input type="number" min={0} value={draft.delay_max_sec}
              onChange={e => patch({ delay_max_sec: Number(e.target.value) })}
              className="w-full px-4 py-2.5 rounded-xl text-[14px] font-bold focus:outline-none" style={INP} />
          </div>
        </div>
        <p className="text-[11px]" style={{ color: '#6B6B7A' }}>
          Délai aléatoire entre {draft.delay_min_sec}s et {draft.delay_max_sec}s
        </p>
      </div>
      <div className="rounded-xl p-5 space-y-4" style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.12)' }}>
        <p className="text-[13px] font-bold text-white">✍ Captions / Descriptions</p>
        <div className="grid grid-cols-3 gap-2">
          {(['fixed','ai','random'] as const).map(m => (
            <button key={m} onClick={() => patch({ caption_mode: m })}
              className="py-2.5 rounded-xl text-[12px] font-bold transition-all"
              style={draft.caption_mode === m
                ? { background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.04)', color: '#6B6B7A', border: '1px solid rgba(255,255,255,0.07)' }}>
              {CAPTION_LABELS[m]}
            </button>
          ))}
        </div>
        <textarea value={draft.caption_template}
          onChange={e => patch({ caption_template: e.target.value })}
          placeholder={
            draft.caption_mode === 'fixed'  ? 'Caption fixe pour tous les posts…' :
            draft.caption_mode === 'random' ? 'Plusieurs captions, une par ligne (rotation aléatoire)…' :
            'Template de base pour la génération IA…'
          }
          rows={4}
          className="w-full px-4 py-3 rounded-xl text-[13px] focus:outline-none resize-none" style={INP} />
        <div>
          <FL>Hashtags (ajoutés à chaque post)</FL>
          <input value={draft.hashtags} onChange={e => patch({ hashtags: e.target.value })}
            placeholder="#viral #trending #fyp"
            className="w-full px-4 py-2.5 rounded-xl text-[13px] focus:outline-none" style={INP} />
        </div>
      </div>
      <div className="space-y-2">
        {[
          { key: 'ignore_offline'  as const, icon: '📴', label: 'Ignorer les téléphones hors ligne', sub: 'Passe au suivant si offline' },
          { key: 'retry_on_error'  as const, icon: '🔄', label: 'Retry auto en cas d\'erreur',        sub: 'Réessaie jusqu\'à 3 fois' },
          { key: 'delete_metadata' as const, icon: '🔒', label: 'Supprimer les métadonnées vidéo',    sub: 'Plus discret sur les plateformes' },
        ].map(opt => (
          <div key={opt.key} className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.1)' }}>
            <div className="flex items-center gap-3">
              <span className="text-base">{opt.icon}</span>
              <div>
                <p className="text-[13px] font-semibold text-white">{opt.label}</p>
                <p className="text-[11px]" style={{ color: '#6B6B7A' }}>{opt.sub}</p>
              </div>
            </div>
            <Toggle value={draft[opt.key] as boolean} onChange={v => patch({ [opt.key]: v })} />
          </div>
        ))}
      </div>
    </div>
  )
}

function StepResume({ draft, onSave, saving }: { draft: ProgramDraft; onSave: () => void; saving: boolean }) {
  const hour24 = draft.ampm === 'PM' ? (draft.time_hour === 12 ? 12 : draft.time_hour + 12) : (draft.time_hour === 12 ? 0 : draft.time_hour)

  const rows = [
    { icon: '✦', label: 'Programme',   value: draft.name || '(sans nom)' },
    { icon: '📅', label: 'Type',        value: FREQ_LABELS[draft.frequency] },
    { icon: '🕐', label: 'Heure',       value: fmtTime(draft.time_hour, draft.time_minute, draft.ampm) },
    { icon: '📆', label: 'Jours',       value: draft.days.length === 7 ? 'Tous les jours' : `${draft.days.length} jours/sem` },
    { icon: '📱', label: 'Téléphones',  value: draft.selected_phones.length > 0 ? `${draft.selected_phones.length} sélectionnés` : '⚠ Aucun' },
    { icon: '🎬', label: 'Pool vidéos', value: draft.video_folders.length > 0 ? draft.video_folders.join(', ') : '⚠ Aucun dossier' },
    { icon: '📊', label: 'Posts/jour',  value: `${draft.posts_per_day} post${draft.posts_per_day > 1 ? 's' : ''}` },
    { icon: '✍', label: 'Captions',    value: CAPTION_LABELS[draft.caption_mode] },
    { icon: '⏱', label: 'Délai',       value: `${draft.delay_min_sec}–${draft.delay_max_sec}s` },
    { icon: '🔑', label: 'Bearer',      value: draft.bearer_token ? '✓ Configuré' : '⚠ Manquant', color: draft.bearer_token ? '#22C55E' : '#EF4444' },
    { icon: '●',  label: 'Statut',      value: draft.status === 'active' ? 'Actif' : 'En pause', color: draft.status === 'active' ? '#22C55E' : '#F59E0B' },
  ]

  const warns = [
    !draft.selected_phones.length && '❌ Aucun téléphone sélectionné',
    !draft.video_folders.length   && '❌ Aucun dossier vidéo sélectionné',
    !draft.bearer_token.trim()    && '⚠ Bearer token manquant (requis pour poster)',
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      <SectionTitle icon="✅" title="Résumé" sub="Vérifie la configuration avant de créer le programme" />

      {warns.length > 0 && (
        <div className="rounded-xl p-4 space-y-1"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {warns.map((w, i) => <p key={i} className="text-[12px] font-semibold" style={{ color: '#f87171' }}>{w}</p>)}
        </div>
      )}

      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-4 px-4 py-3 rounded-xl"
            style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.1)' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: 'rgba(139,92,246,0.1)' }}>{r.icon}</div>
            <span className="text-[11px] font-bold uppercase tracking-wide w-24 flex-shrink-0" style={{ color: '#6B6B7A' }}>{r.label}</span>
            <span className="text-[13px] font-bold text-white truncate" style={{ color: (r as any).color || '#fff' }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Days pills */}
      <div>
        <FL>Jours actifs</FL>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(d => (
            <span key={d.key} className="text-[11px] font-bold px-3 py-1 rounded-lg"
              style={draft.days.includes(d.key)
                ? { background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }
                : { background: 'rgba(255,255,255,0.03)', color: '#3a3a4a' }}>
              {d.label}
            </span>
          ))}
        </div>
      </div>

      <button onClick={onSave} disabled={saving || !!warns.length}
        className="w-full py-4 rounded-2xl text-[15px] font-black disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff', boxShadow: '0 8px 32px rgba(124,58,237,0.4)' }}>
        {saving
          ? <><span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />Création…</>
          : '✅ Créer le programme'}
      </button>
    </div>
  )
}

// ─── Wizard summary panel ─────────────────────────────────────────────────────

function WizardSummary({ draft }: { draft: ProgramDraft }) {
  const rows = [
    { label: 'Nom',         value: draft.name || '—' },
    { label: 'Type',        value: FREQ_LABELS[draft.frequency] },
    { label: 'Heure',       value: fmtTime(draft.time_hour, draft.time_minute, draft.ampm) },
    { label: 'Jours',       value: draft.days.length === 7 ? 'Tous' : `${draft.days.length} jours` },
    { label: 'Téléphones',  value: draft.selected_phones.length > 0 ? `${draft.selected_phones.length}` : '—' },
    { label: 'Pool vidéos', value: draft.video_folders.length > 0 ? draft.video_folders.join(', ') : '—' },
    { label: 'Posts/jour',  value: `${draft.posts_per_day}` },
    { label: 'Statut',      value: draft.status === 'active' ? 'Actif' : 'En pause', color: draft.status === 'active' ? '#22C55E' : '#F59E0B' },
  ]
  return (
    <div className="space-y-1">
      {rows.map(r => (
        <div key={r.label} className="flex items-start gap-2 py-2.5"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
          <span className="text-[11px] flex-shrink-0 w-24" style={{ color: '#6B6B7A' }}>{r.label}</span>
          <span className="text-[12px] font-bold text-right flex-1 truncate"
            style={{ color: (r as any).color || '#fff' }}>{r.value}</span>
        </div>
      ))}
      {draft.days.length > 0 && draft.days.length < 7 && (
        <div className="pt-2">
          <div className="flex flex-wrap gap-1 mt-1">
            {DAYS.map(d => (
              <span key={d.key} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={draft.days.includes(d.key)
                  ? { background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }
                  : { background: 'rgba(255,255,255,0.03)', color: '#3a3a4a' }}>
                {d.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
