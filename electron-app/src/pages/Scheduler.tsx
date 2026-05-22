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
import { useOrg } from '@/lib/orgContext'
import {
  loadScheduledPosts, cancelScheduledPost, claimScheduledPost,
  executeScheduledPost, finishScheduledPost, fmtScheduledTime, timeUntil,
  type ScheduledPost, type ScheduleStatus,
} from '@/lib/schedulerService'
import { Spinner } from '@/components/ui/Spinner'

interface Props { user: User }

type TabFilter = 'pending' | 'history'

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

// ── SVG icon components ────────────────────────────────────────────────────────

function IconClock({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.4" />
      <path d="M8 5v3.5l2 1.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconSpinner({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ animation: 'spin 0.9s linear infinite' }}>
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}

function IconCheck({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.4" />
      <path d="M5.5 8.5l2 2 3-3.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconX({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.4" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconBan({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.4" />
      <path d="M4.5 11.5l7-7" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconRefresh({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.5 2v2.5H10" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCalendar({ size = 48, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="10" width="36" height="32" rx="4" stroke={color} strokeWidth="2" />
      <path d="M6 20h36" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 6v8M32 6v8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <rect x="14" y="26" width="6" height="6" rx="1.5" fill={color} opacity="0.4" />
      <rect x="28" y="26" width="6" height="6" rx="1.5" fill={color} opacity="0.4" />
    </svg>
  )
}

function IconPhone({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="1" width="8" height="12" rx="2" stroke={color} strokeWidth="1.3" />
      <circle cx="7" cy="11" r="0.8" fill={color} />
    </svg>
  )
}

function IconVideo({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.3" />
      <path d="M9 5.5l4-2v7l-4-2V5.5z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function IconTime({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="1.3" />
      <path d="M7 4.5V7l1.5 1.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconArrowRight({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 6h8M7 3l3 3-3 3" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconShuffle({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 3h2c1.5 0 2.5 1.5 3 3s1.5 3 3 3h2" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M1 9h2c1.5 0 2.5-1.5 3-3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 1l2 2-2 2M9 7l2 2-2 2" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconInfo({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.4" />
      <path d="M8 7v5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="4.5" r="0.8" fill={color} />
    </svg>
  )
}

function IconUser({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="4" r="2.5" stroke={color} strokeWidth="1.2" />
      <path d="M1 11c0-2.2 2.2-4 5-4s5 1.8 5 4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconChevron({ size = 12, color = 'currentColor', rotated = false }: { size?: number; color?: string; rotated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ transform: rotated ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease' }}>
      <path d="M4 2l4 4-4 4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ScheduleStatus }) {
  const cfg: Record<ScheduleStatus, { bg: string; color: string; icon: JSX.Element }> = {
    pending:   { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B', icon: <IconClock  size={12} color="#F59E0B" /> },
    running:   { bg: 'rgba(139,92,246,0.12)',  color: '#8B5CF6', icon: <IconSpinner size={12} color="#8B5CF6" /> },
    done:      { bg: 'rgba(34,197,94,0.12)',   color: '#22C55E', icon: <IconCheck  size={12} color="#22C55E" /> },
    failed:    { bg: 'rgba(239,68,68,0.12)',   color: '#EF4444', icon: <IconX      size={12} color="#EF4444" /> },
    cancelled: { bg: 'rgba(148,163,184,0.08)', color: 'rgba(148,163,184,0.52)', icon: <IconBan size={12} color="rgba(148,163,184,0.52)" /> },
  }
  const { bg, color, icon } = cfg[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: bg, color, borderRadius: 6,
      padding: '3px 9px', fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
    }}>
      {icon}
      {STATUS_LABEL[status]}
    </span>
  )
}

// ── Type badge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: 'rgba(124,58,237,0.10)', color: '#A78BFA',
      border: '1px solid rgba(139,92,246,0.22)', borderRadius: 6,
      padding: '3px 9px', fontSize: 11, fontWeight: 600,
    }}>
      {TYPE_LABEL[type] ?? type}
    </span>
  )
}

// ── Stat chip ──────────────────────────────────────────────────────────────────

function StatChip({ icon, label }: { icon: JSX.Element; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.72)',
      border: '1px solid rgba(255,255,255,0.055)', borderRadius: 6,
      padding: '3px 9px', fontSize: 12,
    }}>
      {icon}
      {label}
    </span>
  )
}

export function Scheduler({ user }: Props) {
  const { role }                  = useOrg()
  const [posts, setPosts]         = useState<ScheduledPost[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<TabFilter>('pending')
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [runningPost, setRunningPost] = useState<string | null>(null)
  const [runLogs, setRunLogs]     = useState<{ id: string; msgs: string[] } | null>(null)
  const timersRef                 = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const runningRef                = useRef<Set<string>>(new Set())

  // Can cancel: own post OR org admin/owner
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
      }, payload => {
        // Supabase Realtime returns jsonb columns as strings — parse defensively
        const raw = payload.new as any
        const p: ScheduledPost = {
          ...raw,
          phones: typeof raw.phones === 'string' ? JSON.parse(raw.phones) : (raw.phones ?? []),
          videos: typeof raw.videos === 'string' ? JSON.parse(raw.videos) : (raw.videos ?? []),
          result: typeof raw.result === 'string' ? JSON.parse(raw.result) : raw.result,
        }
        setPosts(prev => prev.some(x => x.id === p.id) ? prev : [p, ...prev])
        // Only auto-execute our own posts
        if (p.status === 'pending' && p.user_id === user.id) scheduleExecution(p)
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'scheduled_posts',
      }, payload => {
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#07070C' }}>

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: '28px 32px 0',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#F2F0FF', margin: 0, lineHeight: 1 }}>
              Programmation
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.52)', marginTop: 5, marginBottom: 0 }}>
              Posts automatiques — exécutés même app fermée
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {pending.length > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(34,197,94,0.1)', color: '#22C55E',
                border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8,
                padding: '4px 10px', fontSize: 11, fontWeight: 700,
              }}>
                <IconClock size={11} color="#22C55E" />
                {pending.length} en attente
              </span>
            )}
            <button
              onClick={reload}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '6px 14px',
                background: '#111120', border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 8, cursor: 'pointer', color: 'rgba(196,181,253,0.72)',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              <IconRefresh size={13} color="rgba(196,181,253,0.72)" />
              Actualiser
            </button>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0 }}>
          {([
            { id: 'pending' as TabFilter, label: 'En attente', count: pending.length },
            { id: 'history' as TabFilter, label: 'Historique',  count: history.length },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px',
                background: tab === t.id ? '#111120' : 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid #7C3AED' : '2px solid transparent',
                cursor: 'pointer',
                color: tab === t.id ? '#F2F0FF' : 'rgba(148,163,184,0.52)',
                fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  background: tab === t.id ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.05)',
                  color: tab === t.id ? '#A78BFA' : 'rgba(148,163,184,0.4)',
                  borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Post list ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 32px 32px', scrollbarWidth: 'none' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
            <Spinner size="lg" />
          </div>
        ) : shown.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────────────── */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 24px', textAlign: 'center',
            background: '#0C0C15', border: '1px solid rgba(255,255,255,0.055)',
            borderRadius: 15, marginTop: 8,
          }}>
            <span style={{ color: 'rgba(139,92,246,0.35)', marginBottom: 18 }}>
              <IconCalendar size={48} color="rgba(139,92,246,0.35)" />
            </span>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#F2F0FF', margin: 0 }}>
              {tab === 'pending' ? 'Aucune tâche programmée' : 'Aucun historique'}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.52)', marginTop: 8, marginBottom: 0 }}>
              {tab === 'pending'
                ? 'Programme un post depuis Posting ou Mass Posting.'
                : 'Les posts exécutés apparaîtront ici.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

      {/* ── Info banner ───────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '12px 32px 16px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 16px',
          background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(139,92,246,0.12)',
          borderRadius: 11,
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>
            <IconInfo size={14} color="rgba(139,92,246,0.7)" />
          </span>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(196,181,253,0.72)', margin: 0 }}>
            Les posts sont exécutés{' '}
            <strong style={{ color: 'rgba(242,240,255,0.7)' }}>automatiquement</strong>{' '}
            à l'heure choisie. Si l'app est ouverte, elle s'en charge. Sinon, la{' '}
            <strong style={{ color: 'rgba(242,240,255,0.7)' }}>Supabase Edge Function</strong>{' '}
            prend le relais. La vidéo est uploadée au moment de la programmation.
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
  const [hovered, setHovered]   = useState(false)
  const isPending   = post.status === 'pending'
  const allLogs = runLogs ?? (post.result?.logs ?? [])

  const accentColor =
    post.status === 'done'      ? '#22C55E'
    : post.status === 'failed'  ? '#EF4444'
    : post.status === 'running' ? '#8B5CF6'
    : post.status === 'cancelled' ? 'rgba(148,163,184,0.2)'
    : '#7C3AED'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(124,58,237,0.04)' : '#0C0C15',
        border: '1px solid rgba(255,255,255,0.055)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 11,
        padding: '14px 18px',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* ── Row 1: status + type + title ──────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <StatusPill status={post.status} />
          <TypeBadge type={post.type} />

          {post.created_by_name && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: isOwn ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.04)',
              color: isOwn ? '#A78BFA' : 'rgba(196,181,253,0.5)',
              border: `1px solid ${isOwn ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.055)'}`,
              borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 500,
            }}>
              <IconUser size={11} color={isOwn ? '#A78BFA' : 'rgba(196,181,253,0.5)'} />
              {isOwn ? 'Moi' : post.created_by_name}
            </span>
          )}

          {isRunning && (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Spinner size="sm" />
            </span>
          )}
        </div>

        {/* Cancel button */}
        {isPending && canCancel && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            style={{
              flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px',
              background: cancelling ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.08)',
              color: '#EF4444',
              border: '1px solid rgba(239,68,68,0.18)',
              borderRadius: 8, cursor: cancelling ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 600,
              opacity: cancelling ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
          >
            <IconX size={11} color="#EF4444" />
            {cancelling ? 'Annulation…' : 'Annuler'}
          </button>
        )}
      </div>

      {/* ── Row 2: scheduled time + time until ─────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          color: '#A78BFA', fontSize: 12, fontWeight: 600,
        }}>
          <IconClock size={12} color="#A78BFA" />
          {fmtScheduledTime(post.scheduled_at)}
        </span>
        {isPending && (
          <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.52)' }}>
            {timeUntil(post.scheduled_at)}
          </span>
        )}
      </div>

      {/* ── Row 3: stat chips ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <StatChip
          icon={<IconPhone size={11} color="rgba(196,181,253,0.72)" />}
          label={`${post.phones.length} téléphone${post.phones.length !== 1 ? 's' : ''}`}
        />
        <StatChip
          icon={<IconVideo size={11} color="rgba(196,181,253,0.72)" />}
          label={`${post.videos.length} vidéo${post.videos.length !== 1 ? 's' : ''}`}
        />
        {post.delay_minutes > 0 && (
          <StatChip
            icon={<IconTime size={11} color="rgba(196,181,253,0.72)" />}
            label={`${post.delay_minutes} min entre comptes`}
          />
        )}
        {post.type === 'mass_posting' && (
          <StatChip
            icon={post.mode === 'random'
              ? <IconShuffle size={11} color="rgba(196,181,253,0.72)" />
              : <IconArrowRight size={11} color="rgba(196,181,253,0.72)" />}
            label={post.mode === 'random' ? 'Aléatoire' : 'Séquentiel'}
          />
        )}
      </div>

      {/* ── Caption preview ───────────────────────────────────────────────── */}
      {post.caption && (
        <p style={{
          marginTop: 10, marginBottom: 0,
          fontSize: 12, lineHeight: 1.6,
          color: 'rgba(148,163,184,0.52)',
          fontStyle: 'italic',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          "{post.caption.slice(0, 120)}{post.caption.length > 120 ? '…' : ''}"
        </p>
      )}

      {/* ── Phone tags ────────────────────────────────────────────────────── */}
      {post.phones.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {post.phones.slice(0, 6).map(p => (
            <span key={p.id} style={{
              background: 'rgba(255,255,255,0.03)', color: 'rgba(196,181,253,0.6)',
              border: '1px solid rgba(255,255,255,0.055)', borderRadius: 5,
              padding: '2px 8px', fontSize: 11,
            }}>
              {p.ig_username ?? p.phone_name}
            </span>
          ))}
          {post.phones.length > 6 && (
            <span style={{
              background: 'rgba(124,58,237,0.1)', color: '#A78BFA',
              borderRadius: 5, padding: '2px 8px', fontSize: 11,
            }}>
              +{post.phones.length - 6} autres
            </span>
          )}
        </div>
      )}

      {/* ── Run logs ──────────────────────────────────────────────────────── */}
      {allLogs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowLogs(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(139,92,246,0.8)', fontSize: 12, fontWeight: 600, padding: 0,
            }}
          >
            <IconChevron size={11} color="rgba(139,92,246,0.8)" rotated={showLogs} />
            {showLogs ? 'Masquer' : 'Afficher'} les logs ({allLogs.length})
          </button>
          {showLogs && (
            <div style={{
              marginTop: 8,
              background: '#07070C', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 11, padding: '12px 14px',
              fontFamily: 'monospace', fontSize: 12,
              overflowY: 'auto', maxHeight: 300,
              scrollbarWidth: 'thin',
            }}>
              {allLogs.map((msg, i) => (
                <p key={i} style={{
                  margin: '1px 0', lineHeight: 1.6,
                  color: msg.startsWith('❌') || msg.toLowerCase().startsWith('error')
                    ? '#EF4444'
                    : msg.startsWith('✅') || msg.toLowerCase().startsWith('success')
                    ? '#22C55E'
                    : 'rgba(196,181,253,0.72)',
                }}>
                  {msg}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Error message ─────────────────────────────────────────────────── */}
      {post.error_msg && post.status === 'failed' && (
        <p style={{
          marginTop: 10, marginBottom: 0,
          fontSize: 12, lineHeight: 1.6,
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.07)', color: '#EF4444',
          border: '1px solid rgba(239,68,68,0.14)', borderRadius: 8,
        }}>
          {post.error_msg}
        </p>
      )}
    </div>
  )
}
