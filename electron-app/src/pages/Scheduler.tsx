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
 * ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "sched_own" ON scheduled_posts FOR ALL USING (auth.uid() = user_id);
 *
 * -- Edge Function (exécution même app fermée) :
 * -- Crée la fonction dans Supabase → Edge Functions, puis active le cron :
 * -- SELECT cron.schedule('scheduled-poster','* * * * *',$$SELECT net.http_post(
 * --   url := 'https://TON-PROJECT.supabase.co/functions/v1/scheduled-poster',
 * --   headers := '{"Authorization":"Bearer TON-SERVICE-ROLE-KEY"}'
 * -- )$$);
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  loadScheduledPosts, cancelScheduledPost, claimScheduledPost,
  executeScheduledPost, finishScheduledPost, fmtScheduledTime, timeUntil,
  type ScheduledPost, type ScheduleStatus,
} from '@/lib/schedulerService'
import { Spinner } from '@/components/ui/Spinner'

interface Props { user: User }

type TabFilter = 'pending' | 'history'

const STATUS_ICON: Record<ScheduleStatus, string> = {
  pending:   '⏳',
  running:   '🔄',
  done:      '✅',
  failed:    '❌',
  cancelled: '🚫',
}

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  pending:   'En attente',
  running:   'En cours',
  done:      'Terminé',
  failed:    'Échoué',
  cancelled: 'Annulé',
}

const TYPE_LABEL: Record<string, string> = {
  posting:      'Posting',
  mass_posting: 'Mass Posting',
}

export function Scheduler({ user }: Props) {
  const [posts, setPosts]         = useState<ScheduledPost[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<TabFilter>('pending')
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [runningPost, setRunningPost] = useState<string | null>(null)
  const [runLogs, setRunLogs]     = useState<{ id: string; msgs: string[] } | null>(null)
  const timersRef                 = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const runningRef                = useRef<Set<string>>(new Set())

  const reload = useCallback(async () => {
    setLoading(true)
    const all = await loadScheduledPosts(user.id)
    setPosts(all)
    setLoading(false)
  }, [user.id])

  // Register a timeout for a pending post and execute when due
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

      const onLog = (msg: string) => {
        msgs.push(msg)
        setRunLogs({ id: post.id, msgs: [...msgs] })
      }

      const ok = await executeScheduledPost(post, onLog)
      await finishScheduledPost(post.id, ok, msgs, ok ? undefined : msgs[msgs.length - 1])
      setRunningPost(null)
      runningRef.current.delete(post.id)
      reload()
    }

    if (delay <= 0) {
      run()
    } else {
      const t = setTimeout(run, delay)
      timersRef.current.set(post.id, t)
    }
  }, [reload])

  useEffect(() => {
    reload().then(() => {
      // Schedule execution of all pending posts on load
    })
  }, [reload])

  // Auto-schedule pending posts when list is loaded
  useEffect(() => {
    posts.filter(p => p.status === 'pending').forEach(scheduleExecution)
  }, [posts, scheduleExecution])

  // Realtime: new post → schedule it
  useEffect(() => {
    const ch = supabase.channel('scheduler-page')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'scheduled_posts',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        const p = payload.new as ScheduledPost
        setPosts(prev => [p, ...prev])
        if (p.status === 'pending') scheduleExecution(p)
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'scheduled_posts',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        const updated = payload.new as ScheduledPost
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

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#06040f' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.9)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
            style={{ background: 'linear-gradient(135deg,rgba(37,99,235,0.25),rgba(139,92,246,0.15))', border: '1px solid rgba(37,99,235,0.3)' }}>
            📅
          </div>
          <div>
            <p className="text-[15px] font-black text-white leading-tight">Programmation</p>
            <p className="text-[10px] leading-tight" style={{ color: 'rgba(196,181,253,0.4)' }}>
              Posts automatiques — exécutés même application fermée
            </p>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { id: 'pending' as TabFilter, label: `En attente`, count: pending.length },
            { id: 'history' as TabFilter, label: 'Historique',  count: history.length },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-bold transition-all"
              style={tab === t.id
                ? { background: 'linear-gradient(130deg,#2563eb,#7c3aed)', color: 'white' }
                : { color: 'rgba(196,181,253,0.35)' }}>
              {t.label}
              {t.count > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                  style={tab === t.id
                    ? { background: 'rgba(255,255,255,0.2)', color: 'white' }
                    : { background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.12)' }}>
              {tab === 'pending' ? '📅' : '🕐'}
            </div>
            <div className="space-y-1">
              <p className="font-bold text-white">
                {tab === 'pending' ? 'Aucun post programmé' : 'Aucun historique'}
              </p>
              <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                {tab === 'pending'
                  ? 'Programme un post depuis Posting ou Mass Posting.'
                  : 'Les posts exécutés apparaîtront ici.'}
              </p>
            </div>
          </div>
        ) : shown.map(post => (
          <PostCard
            key={post.id}
            post={post}
            isRunning={runningPost === post.id}
            runLogs={runLogs?.id === post.id ? runLogs.msgs : null}
            cancelling={cancelling === post.id}
            onCancel={() => cancel(post.id)}
          />
        ))}
      </div>

      {/* Info banner */}
      <div className="flex-shrink-0 px-5 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(6,4,15,0.8)' }}>
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)' }}>
          <span className="text-sm mt-0.5 flex-shrink-0">💡</span>
          <p className="text-[10.5px] leading-relaxed" style={{ color: 'rgba(196,181,253,0.5)' }}>
            Les posts sont exécutés <strong style={{ color: 'rgba(196,181,253,0.75)' }}>automatiquement</strong> à l'heure choisie.
            Si l'app est ouverte, elle s'en charge. Sinon, la <strong style={{ color: 'rgba(196,181,253,0.75)' }}>Supabase Edge Function</strong> prend le relais.
            La vidéo est uploadée au moment de la programmation.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Post card ──────────────────────────────────────────────────────────────────

function PostCard({ post, isRunning, runLogs, cancelling, onCancel }: {
  post: ScheduledPost
  isRunning: boolean
  runLogs: string[] | null
  cancelling: boolean
  onCancel: () => void
}) {
  const [showLogs, setShowLogs] = useState(false)
  const isPending   = post.status === 'pending'
  const isHistory   = post.status === 'done' || post.status === 'failed' || post.status === 'cancelled'
  const borderColor = post.status === 'done'      ? 'rgba(52,211,153,0.2)'
                    : post.status === 'failed'     ? 'rgba(239,68,68,0.2)'
                    : post.status === 'cancelled'  ? 'rgba(255,255,255,0.06)'
                    : post.status === 'running'    ? 'rgba(251,191,36,0.25)'
                    : 'rgba(37,99,235,0.2)'
  const glowColor   = post.status === 'done'      ? 'rgba(52,211,153,0.08)'
                    : post.status === 'failed'     ? 'rgba(239,68,68,0.06)'
                    : post.status === 'running'    ? 'rgba(251,191,36,0.06)'
                    : 'rgba(37,99,235,0.06)'

  const allLogs = runLogs ?? (post.result?.logs ?? [])

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: `rgba(8,5,20,0.9)`, border: `1px solid ${borderColor}`, boxShadow: `0 4px 20px ${glowColor}` }}>

      {/* Top accent line */}
      <div className="h-[2.5px]" style={{
        background: post.status === 'done'     ? 'linear-gradient(90deg,#34d399,#059669)'
                  : post.status === 'failed'   ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                  : post.status === 'running'  ? 'linear-gradient(90deg,#fbbf24,#f59e0b)'
                  : post.status === 'cancelled'? 'rgba(255,255,255,0.08)'
                  : 'linear-gradient(90deg,#2563eb,#7c3aed)'
      }} />

      <div className="p-4">
        {/* Row 1: type + status + time */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.15)' }}>
            {post.type === 'mass_posting' ? '⚡' : '🚀'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-black text-white">{TYPE_LABEL[post.type]}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: post.status === 'done'     ? 'rgba(52,211,153,0.12)'
                            : post.status === 'failed'   ? 'rgba(239,68,68,0.12)'
                            : post.status === 'running'  ? 'rgba(251,191,36,0.12)'
                            : post.status === 'cancelled'? 'rgba(255,255,255,0.05)'
                            : 'rgba(37,99,235,0.12)',
                  color: post.status === 'done'     ? '#34d399'
                       : post.status === 'failed'   ? '#f87171'
                       : post.status === 'running'  ? '#fbbf24'
                       : post.status === 'cancelled'? 'rgba(196,181,253,0.4)'
                       : '#60a5fa',
                }}>
                {STATUS_ICON[post.status]} {STATUS_LABEL[post.status]}
              </span>
              {isRunning && <Spinner size="sm" />}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-[11px] font-semibold" style={{ color: '#60a5fa' }}>
                🕐 {fmtScheduledTime(post.scheduled_at)}
              </span>
              {isPending && (
                <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.45)' }}>
                  {timeUntil(post.scheduled_at)}
                </span>
              )}
            </div>
          </div>

          {isPending && (
            <button onClick={onCancel} disabled={cancelling}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              {cancelling ? '…' : 'Annuler'}
            </button>
          )}
        </div>

        {/* Row 2: stats chips */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Chip icon="📱" label={`${post.phones.length} téléphone${post.phones.length > 1 ? 's' : ''}`} />
          <Chip icon="🎬" label={`${post.videos.length} vidéo${post.videos.length > 1 ? 's' : ''}`} />
          {post.delay_minutes > 0 && <Chip icon="⏱" label={`${post.delay_minutes} min entre comptes`} />}
          {post.type === 'mass_posting' && <Chip icon={post.mode === 'random' ? '🔀' : '➡'} label={post.mode === 'random' ? 'Aléatoire' : 'Séquentiel'} />}
        </div>

        {/* Caption preview */}
        {post.caption && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed line-clamp-2"
            style={{ color: 'rgba(196,181,253,0.5)', fontStyle: 'italic' }}>
            "{post.caption.slice(0, 120)}{post.caption.length > 120 ? '…' : ''}"
          </p>
        )}

        {/* Phones list */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.phones.slice(0, 6).map(p => (
            <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {p.ig_username ?? p.phone_name}
            </span>
          ))}
          {post.phones.length > 6 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
              +{post.phones.length - 6} autres
            </span>
          )}
        </div>

        {/* Logs */}
        {allLogs.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setShowLogs(v => !v)}
              className="text-[10px] font-semibold flex items-center gap-1"
              style={{ color: 'rgba(139,92,246,0.7)' }}>
              {showLogs ? '▲' : '▼'} {showLogs ? 'Masquer' : 'Voir'} les logs ({allLogs.length})
            </button>
            {showLogs && (
              <div className="mt-2 rounded-xl p-3 space-y-0.5 max-h-40 overflow-y-auto"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {allLogs.map((msg, i) => (
                  <p key={i} className="text-[10.5px] leading-relaxed font-mono"
                    style={{ color: msg.startsWith('❌') ? '#f87171' : msg.startsWith('✅') ? '#34d399' : 'rgba(196,181,253,0.6)' }}>
                    {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {post.error_msg && post.status === 'failed' && (
          <p className="mt-2 text-[10.5px] px-2.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.12)' }}>
            ❌ {post.error_msg}
          </p>
        )}
      </div>
    </div>
  )
}

function Chip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(37,99,235,0.08)', color: 'rgba(147,197,253,0.7)', border: '1px solid rgba(37,99,235,0.12)' }}>
      <span>{icon}</span><span>{label}</span>
    </span>
  )
}
