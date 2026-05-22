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
} from '@/lib/schedulerService'
import { Spinner } from '@/components/ui/Spinner'

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
  const [view, setView]             = useState<'list' | 'create'>('list')
  const timersRef                   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const runningRef                  = useRef<Set<string>>(new Set())

  // Breadcrumb in topbar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sf:breadcrumb', { detail: view === 'create' ? 'Créer un post' : null }))
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
    return <CreatePostView onBack={() => setView('list')} onNavigate={onNavigate} />
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

function CreatePostView({ onBack, onNavigate }: { onBack: () => void; onNavigate?: (page: string) => void }) {
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
              <button onClick={onBack}
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
