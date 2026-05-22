/*
 * SQL à exécuter dans Supabase → SQL Editor :
 *
 * CREATE TABLE IF NOT EXISTS scheduled_posts (
 *   id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id        uuid REFERENCES auth.users NOT NULL,
 *   org_id         uuid,
 *   type           text NOT NULL CHECK (type IN ('posting', 'mass_posting')),
 *   status         text NOT NULL DEFAULT 'pending'
 *                        CHECK (status IN ('pending','running','done','failed','cancelled')),
 *   scheduled_at   timestamptz NOT NULL,
 *   phones         jsonb NOT NULL DEFAULT '[]',
 *   videos         jsonb NOT NULL DEFAULT '[]',
 *   caption        text NOT NULL DEFAULT '',
 *   delay_minutes  integer NOT NULL DEFAULT 0,
 *   mode           text NOT NULL DEFAULT 'seq',
 *   bearer_token   text NOT NULL DEFAULT '',
 *   result         jsonb,
 *   error_msg      text,
 *   created_at     timestamptz DEFAULT now(),
 *   executed_at    timestamptz
 * );
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import {
  loadScheduledPosts, cancelScheduledPost, claimScheduledPost,
  executeScheduledPost, finishScheduledPost, fmtScheduledTime, timeUntil,
  type ScheduledPost, type ScheduleStatus,
  createScheduledPost, type ScheduledPhoneRecord, type ScheduledVideoRecord,
} from '@/lib/schedulerService'
import { Spinner } from '@/components/ui/Spinner'
import { useConnections } from '@/lib/connections'
import { type ContentItem, type Phone } from '@/lib/supabase'
import { VideoThumbnail } from '@/pages/Bank'

interface Props { user: User; onNavigate?: (page: string) => void }

type TabFilter = 'pending' | 'history'

const STATUS_CFG: Record<ScheduleStatus, { label: string; fg: string; bg: string; bar: string }> = {
  pending:   { label: 'En attente', fg: '#60A5FA', bg: 'rgba(37,99,235,0.12)',   bar: 'linear-gradient(90deg,#2563eb,#7c3aed)' },
  running:   { label: 'En cours',   fg: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  bar: 'linear-gradient(90deg,#fbbf24,#f59e0b)' },
  done:      { label: 'Terminé',    fg: '#34D399', bg: 'rgba(52,211,153,0.12)',  bar: 'linear-gradient(90deg,#34d399,#059669)' },
  failed:    { label: 'Échoué',     fg: '#F87171', bg: 'rgba(239,68,68,0.12)',   bar: 'linear-gradient(90deg,#ef4444,#dc2626)' },
  cancelled: { label: 'Annulé',     fg: '#71717A', bg: 'rgba(255,255,255,0.06)', bar: 'rgba(255,255,255,0.08)' },
}

const TYPE_LABEL: Record<string, string> = {
  posting:      'Posting',
  mass_posting: 'Mass Posting',
}

export function Scheduler({ user, onNavigate }: Props) {
  const { role }                    = useOrg()
  const [posts, setPosts]           = useState<ScheduledPost[]>([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<TabFilter>('pending')
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [runningPost, setRunningPost] = useState<string | null>(null)
  const [runLogs, setRunLogs]       = useState<{ id: string; msgs: string[] } | null>(null)
  const [view, setView]             = useState<'list' | 'create' | 'simple'>('list')
  const timersRef                   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const runningRef                  = useRef<Set<string>>(new Set())

  // Breadcrumb in topbar
  useEffect(() => {
    const detail =
      view === 'create' ? ['Créer un post'] :
      view === 'simple' ? ['Créer un post', 'Programmation simple'] :
      null
    window.dispatchEvent(new CustomEvent('sf:breadcrumb', { detail }))
    return () => { window.dispatchEvent(new CustomEvent('sf:breadcrumb', { detail: null })) }
  }, [view])

  function canCancel(post: ScheduledPost) {
    if (post.user_id === user.id) return true
    return role === 'owner' || role === 'admin'
  }

  const reload = useCallback(async () => {
    setLoading(true)
    const all = await loadScheduledPosts()
    setPosts(all)
    setLoading(false)
  }, [])

  const scheduleExecution = useCallback((post: ScheduledPost) => {
    if (runningRef.current.has(post.id)) return
    const delay = new Date(post.scheduled_at).getTime() - Date.now()
    const run = async () => {
      runningRef.current.add(post.id)
      const claimed = await claimScheduledPost(post.id)
      if (!claimed) { runningRef.current.delete(post.id); return }
      setRunningPost(post.id)
      const msgs: string[] = []
      setRunLogs({ id: post.id, msgs })
      const onLog = (msg: string) => { msgs.push(msg); setRunLogs({ id: post.id, msgs: [...msgs] }) }
      const ok = await executeScheduledPost(post, onLog)
      await finishScheduledPost(post.id, ok, msgs, ok ? undefined : msgs[msgs.length - 1])
      setRunningPost(null)
      runningRef.current.delete(post.id)
      reload()
    }
    if (delay <= 0) { run() } else {
      const t = setTimeout(run, delay)
      timersRef.current.set(post.id, t)
    }
  }, [reload])

  useEffect(() => { reload() }, [reload])
  useEffect(() => { posts.filter(p => p.status === 'pending').forEach(scheduleExecution) }, [posts, scheduleExecution])

  useEffect(() => {
    const ch = supabase.channel('scheduler-page')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scheduled_posts' }, payload => {
        const raw = payload.new as any
        const p: ScheduledPost = {
          ...raw,
          phones: typeof raw.phones === 'string' ? JSON.parse(raw.phones) : (raw.phones ?? []),
          videos: typeof raw.videos === 'string' ? JSON.parse(raw.videos) : (raw.videos ?? []),
          result: typeof raw.result === 'string' ? JSON.parse(raw.result) : raw.result,
        }
        setPosts(prev => prev.some(x => x.id === p.id) ? prev : [p, ...prev])
        if (p.status === 'pending' && p.user_id === user.id) scheduleExecution(p)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scheduled_posts' }, payload => {
        const raw = payload.new as any
        const updated: ScheduledPost = {
          ...raw,
          phones: typeof raw.phones === 'string' ? JSON.parse(raw.phones) : (raw.phones ?? []),
          videos: typeof raw.videos === 'string' ? JSON.parse(raw.videos) : (raw.videos ?? []),
          result: typeof raw.result === 'string' ? JSON.parse(raw.result) : raw.result,
        }
        setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user.id, scheduleExecution])

  useEffect(() => {
    const t = timersRef.current
    return () => { t.forEach(timer => clearTimeout(timer)); t.clear() }
  }, [])

  async function cancel(id: string) {
    setCancelling(id)
    const t = timersRef.current.get(id)
    if (t) { clearTimeout(t); timersRef.current.delete(id) }
    await cancelScheduledPost(id)
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'cancelled' } : p))
    setCancelling(null)
  }

  const pending = posts.filter(p => p.status === 'pending' || p.status === 'running')
  const history = posts.filter(p => p.status === 'done' || p.status === 'failed' || p.status === 'cancelled')
  const shown   = tab === 'pending' ? pending : history

  if (view === 'create') {
    return <CreatePostView onBack={() => setView('list')} onNavigate={onNavigate} onSimple={() => setView('simple')} />
  }
  if (view === 'simple') {
    return <SimplePostWizard user={user} onBack={() => setView('create')} onDone={() => setView('list')} />
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07070B' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-6 pb-5 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
        <div>
          <h1 className="text-[22px] font-black tracking-tight leading-none" style={{
            background: 'linear-gradient(135deg,#FFFFFF 0%,rgba(196,181,253,0.85) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Programmation</h1>
          <p className="text-[12px] mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>
            Posts automatiques — exécutés même app fermée
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <span className="text-[11px] font-bold px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}>
              {pending.length} en attente
            </span>
          )}
          <button onClick={reload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all hover:bg-white/[0.04]"
            style={{ border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(148,163,184,0.5)' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M9.5 2A5 5 0 1 0 10 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M9.5 0V2.5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Actualiser
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 px-8 pt-4 pb-0">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
          {([
            { id: 'pending' as TabFilter, label: 'En attente', count: pending.length,
              icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
            { id: 'history' as TabFilter, label: 'Historique', count: history.length,
              icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 3.5V6l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold transition-all"
              style={tab === t.id
                ? { background: 'linear-gradient(130deg,rgba(37,99,235,0.3),rgba(124,58,237,0.3))', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.3)' }
                : { color: 'rgba(148,163,184,0.4)' }}>
              <span style={{ color: tab === t.id ? '#C4B5FD' : 'rgba(148,163,184,0.3)' }}>{t.icon}</span>
              {t.label}
              {t.count > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                  style={tab === t.id
                    ? { background: 'rgba(196,181,253,0.2)', color: '#C4B5FD' }
                    : { background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 pt-5" style={{ scrollbarWidth: 'none' }}>
        {loading ? (
          <div className="flex items-center justify-center h-40 gap-3" style={{ color: 'rgba(148,163,184,0.4)' }}>
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'rgba(139,92,246,0.5)', borderTopColor: 'transparent' }} />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'rgba(139,92,246,0.07)', border: '1px dashed rgba(139,92,246,0.2)' }}>
              {tab === 'pending' ? (
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                  <rect x="2" y="3" width="22" height="21" rx="3" stroke="rgba(82,82,91,0.6)" strokeWidth="1.5"/>
                  <path d="M8 1v4M18 1v4M2 9h22" stroke="rgba(82,82,91,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M13 13v4M11 15h4" stroke="rgba(82,82,91,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                  <circle cx="13" cy="13" r="11" stroke="rgba(82,82,91,0.6)" strokeWidth="1.5"/>
                  <path d="M13 7v6l4 3" stroke="rgba(82,82,91,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <p className="text-[15px] font-bold text-white mb-2">
              {tab === 'pending' ? 'Aucun post programmé' : 'Aucun historique'}
            </p>
            <p className="text-[12px] max-w-[260px] leading-relaxed mb-6" style={{ color: 'rgba(148,163,184,0.4)' }}>
              {tab === 'pending'
                ? 'Programme un post depuis la page Posting ou Mass Posting.'
                : 'Les posts exécutés apparaîtront ici.'}
            </p>
            {tab === 'pending' && (
              <button onClick={() => setView('create')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', color: '#fff', boxShadow: '0 4px 20px -4px rgba(124,58,237,0.5)' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                Créer un post
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map(post => (
              <PostCard
                key={post.id}
                post={post}
                isOwn={post.user_id === user.id}
                canCancel={canCancel(post)}
                isRunning={runningPost === post.id}
                runLogs={runLogs?.id === post.id ? runLogs.msgs : null}
                cancelling={cancelling === post.id}
                onCancel={() => cancel(post.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="flex-shrink-0 px-8 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.1)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <circle cx="5.5" cy="5.5" r="4.5" stroke="#60A5FA" strokeWidth="1.1"/>
              <path d="M5.5 3.5v2.5M5.5 7.5v.1" stroke="#60A5FA" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.55)' }}>
            Les posts sont exécutés <span style={{ color: '#93C5FD', fontWeight: 600 }}>automatiquement</span> à l'heure choisie.
            Si l'app est ouverte, elle s'en charge. Sinon, la <span style={{ color: '#93C5FD', fontWeight: 600 }}>Supabase Edge Function</span> prend le relais.
            La vidéo est uploadée au moment de la programmation.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Simple post wizard ─────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4

function SimplePostWizard({ user, onBack, onDone }: {
  user: import('@supabase/supabase-js').User
  onBack: () => void
  onDone: () => void
}) {
  const { currentOrg } = useOrg()
  const conns = useConnections(user)

  const [step, setStep]         = useState<WizardStep>(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Step 1 – Videos ─────────────────────────────────────────────
  const [videos, setVideos]           = useState<ContentItem[]>([])
  const [videosLoading, setVideosLoading] = useState(true)
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set())
  const [videoSearch, setVideoSearch] = useState('')
  const [videoTab, setVideoTab]       = useState<'bank' | 'folders'>('bank')
  const [folders, setFolders]         = useState<string[]>([])
  const [folderFilter, setFolderFilter] = useState<string>('all')

  // ── Step 2 – Phones ─────────────────────────────────────────────
  const [phones, setPhones]           = useState<Phone[]>([])
  const [phonesLoading, setPhonesLoading] = useState(true)
  const [selectedPhoneIds, setSelectedPhoneIds] = useState<Set<string>>(new Set())
  const [targetTab, setTargetTab]     = useState<'phones' | 'groups'>('phones')
  const [phoneSearch, setPhoneSearch] = useState('')

  // ── Step 3 – Schedule ────────────────────────────────────────────
  const [scheduleMode, setScheduleMode] = useState<'ponctuel' | 'recurrent'>('ponctuel')
  const todayStr = new Date().toISOString().split('T')[0]
  const defaultTime = (() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0)
    return d.toTimeString().slice(0,5)
  })()
  const [scheduleDate, setScheduleDate] = useState(todayStr)
  const [scheduleTime, setScheduleTime] = useState(defaultTime)
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [caption, setCaption]         = useState('')

  // Recurrence
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([1]) // 0=Sun,...,6=Sat
  const [recurrenceTime, setRecurrenceTime] = useState(defaultTime)
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')

  // ── Load data ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setVideosLoading(true)
      let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false })
      if (currentOrg) q = q.eq('org_id', currentOrg.id)
      else q = q.eq('user_id', user.id).is('org_id', null)
      const { data } = await q
      const items = (data ?? []) as ContentItem[]
      setVideos(items)
      const fs = Array.from(new Set(items.map(v => v.folder).filter(Boolean))) as string[]
      setFolders(fs)
      setVideosLoading(false)
    }
    load()
  }, [currentOrg?.id, user.id])

  useEffect(() => {
    async function load() {
      setPhonesLoading(true)
      let q = supabase.from('phones').select('*').order('phone_name')
      if (currentOrg) q = q.eq('org_id', currentOrg.id)
      else q = q.eq('user_id', user.id).is('org_id', null)
      const { data } = await q
      setPhones((data ?? []) as Phone[])
      setPhonesLoading(false)
    }
    load()
  }, [currentOrg?.id, user.id])

  // ── Derived ──────────────────────────────────────────────────────
  const filteredVideos = videos.filter(v => {
    if (folderFilter !== 'all' && v.folder !== folderFilter) return false
    if (videoSearch) {
      const q = videoSearch.toLowerCase()
      return v.title.toLowerCase().includes(q) || (v.notes ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const filteredPhones = phones.filter(p => {
    if (!phoneSearch) return true
    const q = phoneSearch.toLowerCase()
    return p.phone_name.toLowerCase().includes(q) ||
      (p.ig_username ?? '').toLowerCase().includes(q) ||
      (p.group_name ?? '').toLowerCase().includes(q)
  })

  const groups = Array.from(new Set(phones.map(p => p.group_name).filter(Boolean))) as string[]
  const selectedVideos = videos.filter(v => selectedVideoIds.has(v.id))
  const selectedPhones = phones.filter(p => selectedPhoneIds.has(p.id))

  function fmtDuration(sec: number | null): string {
    if (!sec) return '—'
    const m = Math.floor(sec / 60), s = sec % 60
    return `${m}:${s.toString().padStart(2,'0')}`
  }

  function fmtDate(dateStr: string, timeStr: string): string {
    const d = new Date(`${dateStr}T${timeStr}`)
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      + ` à ${timeStr}`
  }

  // ── Submit ────────────────────────────────────────────────────────
  async function submit() {
    if (!conns.bearer) { setSubmitError('Token GéeLark manquant — configure-le dans Paramètres.'); return }
    setSubmitting(true); setSubmitError(null)
    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`)
      const phoneRecords: ScheduledPhoneRecord[] = selectedPhones.map(p => ({
        id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username,
      }))
      const videoRecords: ScheduledVideoRecord[] = selectedVideos.map(v => ({
        token: v.storage_path ?? v.file_url ?? '', title: v.title,
      }))
      await createScheduledPost({
        userId: user.id, orgId: currentOrg?.id ?? null,
        createdByName: user.email ?? 'Moi',
        type: 'posting', scheduledAt, phones: phoneRecords,
        videos: videoRecords, caption, delayMinutes: 0, mode: 'seq',
        bearerToken: conns.bearer,
      })
      onDone()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur lors de la programmation.')
      setSubmitting(false)
    }
  }

  // ── Stepper ───────────────────────────────────────────────────────
  const STEPS = [
    { n: 1, label: 'Contenu',      sub: 'Sélectionne tes vidéos' },
    { n: 2, label: 'Cibles',       sub: 'Choisis tes téléphones ou groupes' },
    { n: 3, label: 'Planification',sub: 'Configure la date et la récurrence' },
  ]

  const canNext =
    step === 1 ? selectedVideoIds.size > 0 :
    step === 2 ? selectedPhoneIds.size > 0 :
    step === 3 ? !!scheduleDate && !!scheduleTime :
    false

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07070B' }}>

      {/* ── Sub-header ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-5 pb-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#2563EB,#3B82F6)', boxShadow: '0 4px 12px -2px rgba(37,99,235,0.4)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <h2 className="text-[18px] font-black text-white leading-none">Programmation simple</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>
              Programme ce post à une date et heure précise de façon récurrente.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBack}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-white/[0.04]"
            style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.55)' }}>
            Quitter
          </button>
          <button
            className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-white/[0.04]"
            style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.55)' }}>
            Enregistrer le brouillon
          </button>
          {step < 4 ? (
            <button onClick={() => canNext && setStep(s => (s + 1) as WizardStep)} disabled={!canNext}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-35"
              style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff', boxShadow: canNext ? '0 4px 16px -4px rgba(124,58,237,0.5)' : 'none' }}>
              Étape suivante
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff', boxShadow: '0 4px 16px -4px rgba(124,58,237,0.5)' }}>
              {submitting ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              )}
              {submitting ? 'Programmation…' : 'Programmer le post'}
            </button>
          )}
        </div>
      </div>

      {/* ── Stepper ───────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 py-4 flex items-center gap-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {STEPS.map((s, i) => {
          const done    = step > s.n || step === 4
          const active  = step === s.n
          const lineClr = done ? '#8B5CF6' : 'rgba(255,255,255,0.08)'
          return (
            <div key={s.n} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? '1' : '0' }}>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                {/* Circle */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black transition-all flex-shrink-0"
                  style={done
                    ? { background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', color: '#fff' }
                    : active
                    ? { background: 'rgba(139,92,246,0.15)', border: '2px solid #8B5CF6', color: '#C4B5FD' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.35)' }
                  }>
                  {done ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : s.n}
                </div>
                {/* Labels */}
                <div>
                  <p className="text-[12px] font-bold leading-none"
                    style={{ color: done || active ? '#fff' : 'rgba(148,163,184,0.35)' }}>
                    {s.label}
                  </p>
                  <p className="text-[10px] mt-0.5 leading-none"
                    style={{ color: done || active ? 'rgba(148,163,184,0.5)' : 'rgba(148,163,184,0.25)' }}>
                    {s.sub}
                  </p>
                </div>
              </div>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px mx-4" style={{ background: lineClr, transition: 'background 0.3s' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {/* ── Step 1: Vidéos ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 px-8 pt-5 pb-3">
              <h3 className="text-[16px] font-black text-white">Sélectionne tes vidéos</h3>
              <p className="text-[12px] mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>Choisis les vidéos que tu souhaites publier.</p>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 px-8 mb-3">
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
                {([
                  { id: 'bank' as const, label: 'Banque vidéos', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 8l6 4-6 4V8z"/></svg> },
                  { id: 'folders' as const, label: 'Dossiers de la banque', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
                ]).map(t => (
                  <button key={t.id} onClick={() => setVideoTab(t.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                    style={videoTab === t.id
                      ? { background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.25)' }
                      : { color: 'rgba(148,163,184,0.45)' }}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search + filters */}
            <div className="flex-shrink-0 px-8 mb-3 flex items-center gap-2">
              <div className="flex-1 relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-30" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input type="text" placeholder="Rechercher une vidéo…" value={videoSearch}
                  onChange={e => setVideoSearch(e.target.value)}
                  className="w-full rounded-xl pl-9 pr-4 py-2 text-[13px] focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                />
              </div>
              {videoTab === 'folders' && folders.length > 0 && (
                <div className="relative">
                  <select value={folderFilter} onChange={e => setFolderFilter(e.target.value)}
                    className="appearance-none rounded-xl px-3 py-2 pr-7 text-[12px] focus:outline-none cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}>
                    <option value="all">Tous les dossiers</option>
                    {folders.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                Filtres
              </button>
            </div>

            {/* Video table */}
            <div className="flex-1 overflow-y-auto px-8 pb-4" style={{ scrollbarWidth: 'none' }}>
              {videosLoading ? (
                <div className="flex justify-center py-16"><Spinner size="lg" /></div>
              ) : filteredVideos.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-[13px] text-text2">Aucune vidéo trouvée.</p>
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {/* Table header */}
                  <div className="grid items-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ gridTemplateColumns: '36px 1fr 90px 120px 36px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: 'rgba(148,163,184,0.4)' }}>
                    <span />
                    <span>Vidéos ({filteredVideos.length})</span>
                    <span>Durée</span>
                    <span>Ajouté le</span>
                    <span />
                  </div>
                  {filteredVideos.map((video, i) => {
                    const checked = selectedVideoIds.has(video.id)
                    return (
                      <div key={video.id}
                        className="grid items-center px-4 py-3 cursor-pointer group transition-colors hover:bg-white/[0.025]"
                        style={{ gridTemplateColumns: '36px 1fr 90px 120px 36px', borderBottom: i < filteredVideos.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                        onClick={() => setSelectedVideoIds(prev => {
                          const next = new Set(prev)
                          next.has(video.id) ? next.delete(video.id) : next.add(video.id)
                          return next
                        })}>
                        {/* Checkbox */}
                        <div className="flex items-center justify-center">
                          <div className="w-4 h-4 rounded flex items-center justify-center transition-all flex-shrink-0"
                            style={checked
                              ? { background: '#8B5CF6', border: '1px solid #8B5CF6' }
                              : { background: 'transparent', border: '1px solid rgba(148,163,184,0.25)' }}>
                            {checked && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </div>
                        {/* Thumbnail + title */}
                        <div className="flex items-center gap-3 min-w-0 pr-3">
                          <div className="w-14 h-[38px] rounded-lg overflow-hidden flex-shrink-0 relative"
                            style={{ background: '#0E0E16', border: checked ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.06)' }}>
                            <VideoThumbnail filePath={video.file_url} thumbnailPath={video.thumbnail_path} storagePath={video.storage_path} />
                            <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(0,0,0,0.7)', color: '#e2e8f0' }}>
                              {fmtDuration(video.duration)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-white truncate">{video.title}</p>
                            {video.folder && <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>{video.folder}</p>}
                          </div>
                        </div>
                        {/* Duration */}
                        <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{fmtDuration(video.duration)}</span>
                        {/* Date */}
                        <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.4)' }}>
                          {new Date(video.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        {/* Kebab */}
                        <div className="opacity-0 group-hover:opacity-60 flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'rgba(148,163,184,0.6)' }}><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-8 py-4 flex items-center justify-between"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold" style={{ color: selectedVideoIds.size > 0 ? '#C4B5FD' : 'rgba(148,163,184,0.35)' }}>
                  {selectedVideoIds.size} vidéo{selectedVideoIds.size !== 1 ? 's' : ''} sélectionnée{selectedVideoIds.size !== 1 ? 's' : ''}
                </span>
                {selectedVideoIds.size > 0 && (
                  <button onClick={() => setSelectedVideoIds(new Set())}
                    className="text-[12px] transition-colors hover:text-white"
                    style={{ color: 'rgba(148,163,184,0.4)' }}>
                    Effacer la sélection
                  </button>
                )}
              </div>
              <button onClick={() => canNext && setStep(2)} disabled={!canNext}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90 disabled:opacity-30"
                style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }}>
                Étape suivante
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Cibles ─────────────────────────────────────── */}
        {step === 2 && (
          <div className="h-full flex overflow-hidden">

            {/* Left: phone list */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-shrink-0 px-8 pt-5 pb-3">
                <h3 className="text-[16px] font-black text-white">Choisis tes cibles</h3>
                <p className="text-[12px] mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>Sélectionne les téléphones ou groupes qui publieront ce post.</p>
              </div>

              {/* Tabs */}
              <div className="flex-shrink-0 px-8 mb-3">
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
                  {([
                    { id: 'phones' as const, label: 'Téléphones', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> },
                    { id: 'groups' as const, label: 'Groupes', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                  ]).map(t => (
                    <button key={t.id} onClick={() => setTargetTab(t.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                      style={targetTab === t.id
                        ? { background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.25)' }
                        : { color: 'rgba(148,163,184,0.45)' }}>
                      {t.icon}{t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="flex-shrink-0 px-8 mb-3 flex items-center gap-2">
                <div className="flex-1 relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-30" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input type="text" placeholder="Rechercher un téléphone…" value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    className="w-full rounded-xl pl-9 pr-4 py-2 text-[13px] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                  />
                </div>
                <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  Filtres
                </button>
              </div>

              {/* Phone list */}
              <div className="flex-1 overflow-y-auto px-8 pb-4" style={{ scrollbarWidth: 'none' }}>
                {phonesLoading ? (
                  <div className="flex justify-center py-16"><Spinner size="lg" /></div>
                ) : targetTab === 'phones' ? (
                  <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {filteredPhones.length === 0 ? (
                      <p className="px-5 py-10 text-center text-[13px] text-text2">Aucun téléphone trouvé.</p>
                    ) : filteredPhones.map((phone, i) => {
                      const checked = selectedPhoneIds.has(phone.id)
                      const col = phoneColorWiz(phone.phone_name)
                      return (
                        <div key={phone.id}
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.025]"
                          style={{
                            borderBottom: i < filteredPhones.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                            borderLeft: checked ? '2px solid #8B5CF6' : '2px solid transparent',
                          }}
                          onClick={() => setSelectedPhoneIds(prev => {
                            const next = new Set(prev)
                            next.has(phone.id) ? next.delete(phone.id) : next.add(phone.id)
                            return next
                          })}>
                          {/* Phone icon */}
                          <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-[14px]"
                            style={{ background: `linear-gradient(135deg,${col}22,${col}11)`, border: `1px solid ${col}30` }}>
                            📱
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-white truncate">{phone.phone_name}</p>
                            <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(196,181,253,0.6)' }}>
                              {phone.group_name ?? 'Sans groupe'}
                            </p>
                          </div>
                          {/* Status */}
                          <div className="flex-shrink-0">
                            {phone.status === 'online' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(0,204,170,0.1)', color: '#00ccaa', border: '1px solid rgba(0,204,170,0.15)' }}>
                                <span className="w-1 h-1 rounded-full bg-ok" />En ligne
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(71,85,105,0.12)', color: '#64748b', border: '1px solid rgba(71,85,105,0.2)' }}>
                                <span className="w-1 h-1 rounded-full bg-current" />Hors ligne
                              </span>
                            )}
                          </div>
                          {/* Checkbox */}
                          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                            style={checked
                              ? { background: '#8B5CF6', border: '1px solid #8B5CF6' }
                              : { background: 'transparent', border: '1px solid rgba(148,163,184,0.22)' }}>
                            {checked && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* Groups view */
                  <div className="space-y-2">
                    {groups.length === 0 ? (
                      <p className="text-center py-10 text-[13px] text-text2">Aucun groupe trouvé.</p>
                    ) : groups.filter(g => !phoneSearch || g.toLowerCase().includes(phoneSearch.toLowerCase())).map(group => {
                      const groupPhones = phones.filter(p => p.group_name === group)
                      const allChecked  = groupPhones.every(p => selectedPhoneIds.has(p.id))
                      const someChecked = groupPhones.some(p => selectedPhoneIds.has(p.id))
                      return (
                        <div key={group}
                          className="rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-all hover:bg-white/[0.03]"
                          style={{ background: 'rgba(255,255,255,0.02)', border: allChecked ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.07)' }}
                          onClick={() => setSelectedPhoneIds(prev => {
                            const next = new Set(prev)
                            if (allChecked) groupPhones.forEach(p => next.delete(p.id))
                            else groupPhones.forEach(p => next.add(p.id))
                            return next
                          })}>
                          <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-white">{group}</p>
                            <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.45)' }}>{groupPhones.length} téléphone{groupPhones.length > 1 ? 's' : ''}</p>
                          </div>
                          <div className="w-4 h-4 rounded flex items-center justify-center transition-all"
                            style={allChecked
                              ? { background: '#8B5CF6', border: '1px solid #8B5CF6' }
                              : someChecked
                              ? { background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.5)' }
                              : { background: 'transparent', border: '1px solid rgba(148,163,184,0.22)' }}>
                            {(allChecked || someChecked) && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 px-8 py-4 flex items-center justify-between"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-white/[0.04]"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.5 6h-7M5.5 9L2.5 6l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Étape précédente
                </button>
                <button onClick={() => selectedPhoneIds.size > 0 && setStep(3)} disabled={selectedPhoneIds.size === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90 disabled:opacity-30"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }}>
                  Étape suivante
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>

            {/* Right: selected phones panel */}
            {selectedPhoneIds.size > 0 && (
              <div className="w-[280px] flex-shrink-0 flex flex-col border-l overflow-hidden"
                style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(10,10,20,0.5)' }}>
                <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-[13px] font-bold text-white">{selectedPhoneIds.size} sélectionnés</span>
                  <button onClick={() => setSelectedPhoneIds(new Set())}
                    className="text-[11px] transition-colors hover:text-white"
                    style={{ color: 'rgba(148,163,184,0.4)' }}>
                    Tout désélectionner
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ scrollbarWidth: 'none' }}>
                  {selectedPhones.map(p => (
                    <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                      style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
                      <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[13px]"
                        style={{ background: 'rgba(139,92,246,0.1)' }}>📱</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white truncate">{p.phone_name}</p>
                        <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.45)' }}>
                          {p.group_name ?? '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={p.status === 'online'
                            ? { background: 'rgba(0,204,170,0.12)', color: '#00ccaa' }
                            : { background: 'rgba(71,85,105,0.15)', color: '#64748b' }}>
                          {p.status === 'online' ? 'En ligne' : 'Hors ligne'}
                        </span>
                        <button onClick={() => setSelectedPhoneIds(prev => { const n = new Set(prev); n.delete(p.id); return n })}
                          className="w-4 h-4 flex items-center justify-center rounded opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: 'rgba(148,163,184,0.6)' }}>
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Planification ───────────────────────────────── */}
        {step === 3 && (
          <div className="h-full flex overflow-hidden">

            {/* Left: form */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-8 py-5" style={{ scrollbarWidth: 'none' }}>
              <h3 className="text-[16px] font-black text-white mb-0.5">Planifie la publication</h3>
              <p className="text-[12px] mb-5" style={{ color: 'rgba(148,163,184,0.45)' }}>Choisis quand et à quelle fréquence ton post sera publié.</p>

              {/* Mode */}
              <div className="mb-5">
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 block" style={{ color: 'rgba(148,163,184,0.45)' }}>Mode de planification</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { id: 'ponctuel' as const, label: 'Ponctuel', sub: 'Publier à une date et heure précises',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                    { id: 'recurrent' as const, label: 'Récurrent', sub: 'Répéter selon une fréquence',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> },
                  ]).map(m => (
                    <button key={m.id} onClick={() => setScheduleMode(m.id)}
                      className="flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-all"
                      style={scheduleMode === m.id
                        ? { background: 'rgba(139,92,246,0.08)', border: '1.5px solid rgba(139,92,246,0.4)', color: '#C4B5FD' }
                        : { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}>
                      <div className={`mt-0.5 flex-shrink-0 ${scheduleMode === m.id ? 'text-accent' : ''}`}>{m.icon}</div>
                      <div>
                        <p className="text-[13px] font-bold text-white">{m.label}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>{m.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {scheduleMode === 'ponctuel' ? (
                <>
                  {/* Date + Time */}
                  <div className="mb-5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 block" style={{ color: 'rgba(148,163,184,0.45)' }}>Date et heure</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                          className="flex-1 bg-transparent text-[13px] font-semibold text-white focus:outline-none"
                          min={todayStr}
                        />
                      </div>
                      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                          className="flex-1 bg-transparent text-[13px] font-semibold text-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Timezone */}
                  <div className="mb-5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 block" style={{ color: 'rgba(148,163,184,0.45)' }}>Fuseau horaire</label>
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      <span className="text-[13px] font-semibold text-white flex-1">{timezone}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Recurrence type */}
                  <div className="mb-5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 block" style={{ color: 'rgba(148,163,184,0.45)' }}>Fréquence</label>
                    <div className="flex gap-2">
                      {([
                        { id: 'daily' as const, label: 'Quotidien' },
                        { id: 'weekly' as const, label: 'Hebdomadaire' },
                        { id: 'monthly' as const, label: 'Mensuel' },
                      ]).map(r => (
                        <button key={r.id} onClick={() => setRecurrenceType(r.id)}
                          className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
                          style={recurrenceType === r.id
                            ? { background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.3)' }
                            : { background: 'rgba(255,255,255,0.03)', color: 'rgba(148,163,184,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Weekly days picker */}
                  {recurrenceType === 'weekly' && (
                    <div className="mb-5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 block" style={{ color: 'rgba(148,163,184,0.45)' }}>Jours de la semaine</label>
                      <div className="flex gap-2">
                        {['D','L','M','M','J','V','S'].map((d, i) => {
                          const active = recurrenceDays.includes(i)
                          return (
                            <button key={i} onClick={() => setRecurrenceDays(prev =>
                              active ? prev.filter(x => x !== i) : [...prev, i]
                            )}
                              className="w-9 h-9 rounded-xl text-[12px] font-bold transition-all"
                              style={active
                                ? { background: 'rgba(139,92,246,0.2)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.4)' }
                                : { background: 'rgba(255,255,255,0.03)', color: 'rgba(148,163,184,0.4)', border: '1px solid rgba(255,255,255,0.07)' }}>
                              {d}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Time */}
                  <div className="mb-5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 block" style={{ color: 'rgba(148,163,184,0.45)' }}>Heure de publication</label>
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl w-48"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <input type="time" value={recurrenceTime} onChange={e => setRecurrenceTime(e.target.value)}
                        className="flex-1 bg-transparent text-[13px] font-semibold text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* End date */}
                  <div className="mb-5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 block" style={{ color: 'rgba(148,163,184,0.45)' }}>Date de fin (optionnel)</label>
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl w-64"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <input type="date" value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)}
                        className="flex-1 bg-transparent text-[13px] font-semibold text-white focus:outline-none"
                        min={todayStr}
                        placeholder="Indéfini"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Caption */}
              <div className="mb-5">
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 block" style={{ color: 'rgba(148,163,184,0.45)' }}>Légende (optionnel)</label>
                <textarea value={caption} onChange={e => setCaption(e.target.value)}
                  placeholder="Écris ta légende ici…"
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', lineHeight: '1.6' }}
                />
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-white/[0.04]"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.5 6h-7M5.5 9L2.5 6l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Étape précédente
                </button>
                <button onClick={() => setStep(4)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff' }}>
                  Étape suivante
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>

            {/* Right: preview */}
            <div className="w-[300px] flex-shrink-0 flex flex-col border-l overflow-y-auto px-6 py-5" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(10,10,20,0.4)', scrollbarWidth: 'none' }}>
              <h4 className="text-[13px] font-black text-white mb-4">Aperçu planification</h4>

              {/* Publication time */}
              <div className="rounded-xl px-4 py-3.5 mb-4" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'rgba(96,165,250,0.6)' }}>Le post sera publié :</p>
                {scheduleDate && scheduleTime ? (
                  <>
                    <div className="flex items-center gap-2 mb-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <span className="text-[12px] font-semibold text-white">{fmtDate(scheduleDate, scheduleMode === 'ponctuel' ? scheduleTime : recurrenceTime)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{timezone}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[12px]" style={{ color: 'rgba(148,163,184,0.35)' }}>Sélectionne une date</p>
                )}
              </div>

              {/* Recap */}
              <div className="rounded-xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(148,163,184,0.4)' }}>Récapitulatif</p>
                {[
                  { label: 'Vidéos',  value: `${selectedVideoIds.size} vidéo${selectedVideoIds.size !== 1 ? 's' : ''}` },
                  { label: 'Cibles',  value: `${selectedPhoneIds.size} téléphone${selectedPhoneIds.size !== 1 ? 's' : ''}` },
                  { label: 'Mode',    value: scheduleMode === 'ponctuel' ? 'Ponctuel' : `Récurrent (${recurrenceType === 'daily' ? 'Quotidien' : recurrenceType === 'weekly' ? 'Hebdo' : 'Mensuel'})` },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1.5"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[12px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{row.label}</span>
                    <span className="text-[12px] font-semibold text-white">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Bon à savoir */}
              <div className="mt-4 rounded-xl px-4 py-3.5" style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.12)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#60A5FA" strokeWidth="1.1"/><path d="M6 4v2.5M6 7.5v.5" stroke="#60A5FA" strokeWidth="1.1" strokeLinecap="round"/></svg>
                  <span className="text-[11px] font-bold" style={{ color: '#60A5FA' }}>Bon à savoir</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Les posts seront publiés dans l'ordre de la liste des téléphones sélectionnés.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Récapitulatif ───────────────────────────────── */}
        {step === 4 && (
          <div className="h-full flex overflow-hidden">

            {/* Left: content summary */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-8 py-5" style={{ scrollbarWidth: 'none' }}>
              <h3 className="text-[16px] font-black text-white mb-0.5">Récapitulatif</h3>
              <p className="text-[12px] mb-5" style={{ color: 'rgba(148,163,184,0.45)' }}>Vérifie les informations avant de programmer ton post.</p>

              {/* Videos */}
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(148,163,184,0.4)' }}>Contenu</p>
                <div className="flex gap-2 flex-wrap">
                  {selectedVideos.map(v => (
                    <div key={v.id} className="relative w-[90px] h-[62px] rounded-xl overflow-hidden flex-shrink-0"
                      style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                      <VideoThumbnail filePath={v.file_url} thumbnailPath={v.thumbnail_path} storagePath={v.storage_path} />
                      <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(0,0,0,0.75)', color: '#e2e8f0' }}>
                        {fmtDuration(v.duration)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phones */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(148,163,184,0.4)' }}>Cibles</p>
                <p className="text-[12px] mb-3" style={{ color: 'rgba(148,163,184,0.5)' }}>{selectedPhoneIds.size} téléphone{selectedPhoneIds.size !== 1 ? 's' : ''} sélectionné{selectedPhoneIds.size !== 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {selectedPhones.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="text-[14px]">📱</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white truncate">{p.phone_name}</p>
                        <p className="text-[10px] truncate" style={{ color: 'rgba(196,181,253,0.6)' }}>{p.group_name ?? '—'}</p>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={p.status === 'online'
                          ? { background: 'rgba(0,204,170,0.1)', color: '#00ccaa' }
                          : { background: 'rgba(71,85,105,0.15)', color: '#64748b' }}>
                        {p.status === 'online' ? 'En ligne' : 'Hors ligne'}
                      </span>
                      <button onClick={() => setSelectedPhoneIds(prev => { const n = new Set(prev); n.delete(p.id); return n })}
                        className="w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
                        style={{ color: 'rgba(148,163,184,0.7)' }}>
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Error */}
              {submitError && (
                <div className="mt-4 px-4 py-3 rounded-xl flex items-start gap-2"
                  style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 mt-0.5"><circle cx="6" cy="6" r="5" stroke="#f87171" strokeWidth="1.2"/><path d="M6 3.5v3M6 8v.5" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  <p className="text-[12px]">{submitError}</p>
                </div>
              )}

              {/* Footer nav */}
              <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all hover:bg-white/[0.04]"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.5 6h-7M5.5 9L2.5 6l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Étape précédente
                </button>
                <button onClick={submit} disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(130deg,#7C3AED,#8B5CF6)', color: '#fff', boxShadow: '0 4px 20px -4px rgba(124,58,237,0.5)' }}>
                  {submitting ? (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  )}
                  {submitting ? 'Programmation…' : 'Programmer le post'}
                </button>
              </div>
            </div>

            {/* Right: schedule card */}
            <div className="w-[300px] flex-shrink-0 flex flex-col border-l overflow-y-auto px-6 py-5" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(10,10,20,0.4)', scrollbarWidth: 'none' }}>
              <h4 className="text-[13px] font-black text-white mb-4">Planification</h4>

              <div className="rounded-xl px-4 py-4 mb-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {[
                  { label: 'Mode',       value: scheduleMode === 'ponctuel' ? 'Ponctuel' : 'Récurrent' },
                  { label: 'Date et heure', value: scheduleDate && scheduleTime ? fmtDate(scheduleDate, scheduleMode === 'ponctuel' ? scheduleTime : recurrenceTime) : '—' },
                  { label: 'Fuseau horaire', value: timezone },
                ].map((row, i, arr) => (
                  <div key={row.label} className="py-2.5" style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(148,163,184,0.38)' }}>{row.label}</p>
                    <p className="text-[12px] font-semibold text-white">{row.value}</p>
                  </div>
                ))}
              </div>

              {/* Ready banner */}
              <div className="rounded-xl px-4 py-3.5" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(34,197,94,0.15)' }}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: '#22C55E' }}>Prêt à être programmé</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Ton post sera publié à la date et heure sélectionnées sur les {selectedPhoneIds.size} téléphone{selectedPhoneIds.size !== 1 ? 's' : ''}.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function phoneColorWiz(name: string): string {
  const palette = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

// ── Post card ──────────────────────────────────────────────────────────────────

function PostCard({ post, isOwn, canCancel, isRunning, runLogs, cancelling, onCancel }: {
  post: ScheduledPost
  isOwn: boolean
  canCancel: boolean
  isRunning: boolean
  runLogs: string[] | null
  cancelling: boolean
  onCancel: () => void
}) {
  const [showLogs, setShowLogs] = useState(false)
  const isPending = post.status === 'pending' || post.status === 'running'
  const cfg       = STATUS_CFG[post.status]
  const allLogs   = runLogs ?? (post.result?.logs ?? [])

  return (
    <div className="rounded-2xl overflow-hidden transition-all"
      style={{ background: '#0E0E16', border: `1px solid rgba(255,255,255,0.06)`, boxShadow: '0 4px 24px -4px rgba(0,0,0,0.5)' }}>

      {/* Top accent bar */}
      <div className="h-[2px]" style={{ background: cfg.bar }} />

      <div className="px-5 py-4">
        {/* Header row */}
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)' }}>
            {post.type === 'mass_posting' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[14px] font-black text-white">{TYPE_LABEL[post.type]}</span>
              {post.created_by_name && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: isOwn ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.05)', color: isOwn ? '#a78bfa' : 'rgba(196,181,253,0.5)' }}>
                  {isOwn ? 'Moi' : post.created_by_name}
                </span>
              )}
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: cfg.bg, color: cfg.fg }}>
                {cfg.label}
              </span>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: '#FBBF24' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                  Exécution…
                </span>
              )}
            </div>

            {/* Time */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#60A5FA' }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.1"/>
                  <path d="M5.5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {fmtScheduledTime(post.scheduled_at)}
              </div>
              {isPending && (
                <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.4)' }}>
                  {timeUntil(post.scheduled_at)}
                </span>
              )}
            </div>
          </div>

          {/* Cancel button */}
          {isPending && canCancel && (
            <button onClick={onCancel} disabled={cancelling}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-40"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              {cancelling ? (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              )}
              {cancelling ? 'Annulation…' : 'Annuler'}
            </button>
          )}
        </div>

        {/* Chips */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Chip icon={
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2" y="0.5" width="6" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.1"/></svg>
          } label={`${post.phones.length} téléphone${post.phones.length > 1 ? 's' : ''}`} />
          <Chip icon={
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0.5" y="2" width="7" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1"/><path d="M7.5 4l2-1.5v5L7.5 6V4Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/></svg>
          } label={`${post.videos.length} vidéo${post.videos.length > 1 ? 's' : ''}`} />
          {post.delay_minutes > 0 && (
            <Chip icon={
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.1"/><path d="M5 2.5V5l1.5 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            } label={`${post.delay_minutes} min entre comptes`} />
          )}
          {post.type === 'mass_posting' && (
            <Chip icon={
              post.mode === 'random'
                ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 3h7M6 1.5L8 3l-2 1.5M1 7h7M6 5.5L8 7l-2 1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 5h8M6 2.5L8.5 5 6 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            } label={post.mode === 'random' ? 'Aléatoire' : 'Séquentiel'} />
          )}
        </div>

        {/* Caption preview */}
        {post.caption && (
          <p className="mt-3 text-[12px] leading-relaxed line-clamp-2 italic"
            style={{ color: 'rgba(148,163,184,0.45)', borderLeft: '2px solid rgba(139,92,246,0.2)', paddingLeft: 10 }}>
            {post.caption.slice(0, 140)}{post.caption.length > 140 ? '…' : ''}
          </p>
        )}

        {/* Phone chips */}
        {post.phones.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.phones.slice(0, 7).map(p => (
              <span key={p.id} className="text-[11px] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {p.ig_username ? `@${p.ig_username}` : p.phone_name}
              </span>
            ))}
            {post.phones.length > 7 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>
                +{post.phones.length - 7}
              </span>
            )}
          </div>
        )}

        {/* Logs toggle */}
        {allLogs.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowLogs(v => !v)}
              className="flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:text-white"
              style={{ color: 'rgba(139,92,246,0.7)' }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                style={{ transform: showLogs ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {showLogs ? 'Masquer' : 'Voir'} les logs ({allLogs.length})
            </button>
            {showLogs && (
              <div className="mt-2 rounded-xl p-3 max-h-40 overflow-auto font-mono text-[11px] space-y-1"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(139,92,246,0.1)', scrollbarWidth: 'none' }}>
                {allLogs.map((msg, i) => (
                  <div key={i} className="flex gap-2">
                    <span style={{ color: 'rgba(71,85,105,0.8)' }}>{i + 1}</span>
                    <span style={{ color: msg.startsWith('❌') ? '#f87171' : msg.startsWith('✅') ? '#34d399' : 'rgba(196,181,253,0.6)' }}>{msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {post.error_msg && post.status === 'failed' && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 mt-0.5">
              <circle cx="6" cy="6" r="5" stroke="#f87171" strokeWidth="1.2"/>
              <path d="M6 3.5v3M6 8v.5" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <p className="text-[12px]" style={{ color: '#f87171' }}>{post.error_msg}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
      style={{ background: 'rgba(37,99,235,0.07)', color: 'rgba(147,197,253,0.7)', border: '1px solid rgba(37,99,235,0.12)' }}>
      <span style={{ color: 'rgba(96,165,250,0.6)' }}>{icon}</span>
      <span>{label}</span>
    </span>
  )
}

// ── Create post subview ────────────────────────────────────────────────────────

function CreatePostView({ onBack, onNavigate, onSimple }: { onBack: () => void; onNavigate?: (page: string) => void; onSimple?: () => void }) {
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07070B' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-6 pb-5 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
        <div>
          <h1 className="text-[22px] font-black tracking-tight leading-none" style={{
            background: 'linear-gradient(135deg,#FFFFFF 0%,rgba(196,181,253,0.85) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Créer un post</h1>
          <p className="text-[12px] mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>
            Choisis le mode de publication qui te convient
          </p>
        </div>
        <button onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:bg-white/[0.05]"
          style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Annuler
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-7" style={{ scrollbarWidth: 'none' }}>

        {/* Two option cards */}
        <div className="grid grid-cols-2 gap-5 mb-8">

          {/* Mass Posting card */}
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{
            background: 'linear-gradient(145deg,#0E0E16 0%,#11101C 100%)',
            border: '1px solid rgba(139,92,246,0.2)',
            boxShadow: '0 8px 40px -8px rgba(124,58,237,0.2)',
          }}>
            <div className="flex-1 px-8 pt-8 pb-6 flex flex-col items-center text-center">
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#A855F7)', boxShadow: '0 8px 24px -4px rgba(124,58,237,0.5)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <h2 className="text-[20px] font-black text-white mb-2">Via Mass Posting</h2>
              <p className="text-[13px] leading-relaxed mb-6" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Programme ce post comme un scénario<br/>dans Mass Posting avec plusieurs téléphones<br/>et options avancées.
              </p>
              {/* Features */}
              <div className="w-full space-y-2.5 mb-6 text-left">
                {['Scénarios multi-téléphones', 'Rotation des contenus', 'Filtres et conditions', 'Suivi des exécutions'].map(f => (
                  <div key={f} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#A78BFA" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-[13px]" style={{ color: 'rgba(226,232,240,0.8)' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* CTA */}
            <div className="px-6 pb-6">
              <button onClick={() => onNavigate?.('massposting')}
                className="w-full py-3.5 rounded-xl text-[14px] font-black text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'linear-gradient(130deg,#7C3AED,#A855F7)', boxShadow: '0 4px 20px -4px rgba(124,58,237,0.55)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                Aller à Mass Posting
              </button>
            </div>
          </div>

          {/* Simple scheduling card */}
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{
            background: 'linear-gradient(145deg,#0E0E16 0%,#0F1420 100%)',
            border: '1px solid rgba(37,99,235,0.2)',
            boxShadow: '0 8px 40px -8px rgba(37,99,235,0.15)',
          }}>
            <div className="flex-1 px-8 pt-8 pb-6 flex flex-col items-center text-center">
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'linear-gradient(135deg,#2563EB,#3B82F6)', boxShadow: '0 8px 24px -4px rgba(37,99,235,0.4)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <h2 className="text-[20px] font-black text-white mb-2">Programmation simple</h2>
              <p className="text-[13px] leading-relaxed mb-6" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Programme ce post à une date et heure précise.<br/>Idéal pour un planning ponctuel ou récurrent.
              </p>
              {/* Features */}
              <div className="w-full space-y-2.5 mb-6 text-left">
                {['Ponctuel ou récurrent', 'Tous les jours / Semaines / Mois', 'Heure précise', 'Répétitions automatiques'].map(f => (
                  <div key={f} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.3)' }}>
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#60A5FA" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-[13px]" style={{ color: 'rgba(226,232,240,0.8)' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* CTA */}
            <div className="px-6 pb-6">
              <button onClick={() => onSimple?.()}
                className="w-full py-3.5 rounded-xl text-[14px] font-black text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'linear-gradient(130deg,#1D4ED8,#2563EB,#3B82F6)', boxShadow: '0 4px 20px -4px rgba(37,99,235,0.5)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Aller à la programmation
              </button>
            </div>
          </div>
        </div>

        {/* Comparison section */}
        <div>
          <h3 className="text-[15px] font-black text-white mb-4">Quelle différence ?</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-4 p-4 rounded-2xl"
              style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.1)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(139,92,246,0.15)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-bold text-white mb-1">Mass Posting</p>
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Idéal pour des campagnes à grande échelle avec rotation de contenus et contrôle avancé sur plusieurs appareils.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-2xl"
              style={{ background: '#0E0E16', border: '1px solid rgba(37,99,235,0.1)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(37,99,235,0.15)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-bold text-white mb-1">Programmation simple</p>
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Idéal pour planifier un post unique ou récurrent automatiquement sans configuration avancée.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
