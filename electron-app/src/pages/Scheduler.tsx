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

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useT, useLang } from '@/lib/i18n'
import { useOrg } from '@/lib/orgContext'
import {
  loadScheduledPosts, cancelScheduledPost, claimScheduledPost,
  executeScheduledPost, finishScheduledPost, failStaleRunningPosts,
  fmtScheduledTime, timeUntil, createScheduledPost,
  loadManualRuns, isManualRun,
  type ScheduledPost, type ScheduleStatus,
} from '@/lib/schedulerService'
import { Spinner } from '@/components/ui/Spinner'
import { CreateScheduleModal } from '@/components/CreateScheduleModal'
import { CreateStoryScheduleModal } from '@/components/CreateStoryScheduleModal'
import { ScheduleModal } from '@/components/ScheduleModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useCredits } from '@/lib/credits'
import { useToast } from '@/components/Toast'
import { pushNotification } from '@/lib/notificationStore'

// setTimeout overflows int32 (~24.8 days) and fires immediately beyond this —
// chain shorter timeouts instead of arming one long timer.
const MAX_TIMEOUT_MS = 2_147_000_000
const RESCHEDULE_CHUNK_MS = 24 * 60 * 60 * 1000 // re-arm every 24 h for far-future posts

interface Props { user: User; onNavigate?: (page: string, tab?: string) => void }

type TabFilter = 'pending' | 'calendar' | 'history'

// STATUS_LABEL and TYPE_LABEL are now built dynamically inside components using t()

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

function IconRefresh({ size = 15, color = 'currentColor', spinning = false }: { size?: number; color?: string; spinning?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={spinning ? { animation: 'spin 0.75s linear infinite' } : undefined}>
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

function IconCalendarSm({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>
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

function IconClose({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2l8 8M10 2l-8 8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconSearch({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="5" stroke={color} strokeWidth="1.4" />
      <path d="M11 11l3 3" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ScheduleStatus }) {
  const t = useT()
  const STATUS_LABELS: Record<ScheduleStatus, string> = {
    pending:   t('schedulerStatusPending'),
    running:   t('schedulerStatusInProgress'),
    done:      t('schedulerStatusDone'),
    failed:    t('schedulerStatusFailed'),
    cancelled: t('schedulerStatusCancelled'),
  }

  // Map to design-system sf-badge variants
  const cfg: Record<ScheduleStatus, { cls: string; icon: JSX.Element }> = {
    pending:   { cls: 'sf-badge sf-badge-violet', icon: <IconClock   size={11} color="var(--accent-l)" /> },
    running:   { cls: 'sf-badge sf-badge-violet', icon: <IconSpinner size={11} color="var(--accent-l)" /> },
    done:      { cls: 'sf-badge sf-badge-green',  icon: <IconCheck   size={11} color="var(--ok)" /> },
    failed:    { cls: 'sf-badge sf-badge-red',    icon: <IconX       size={11} color="var(--err)" /> },
    cancelled: { cls: 'sf-badge',                 icon: <IconBan     size={11} color="rgba(148,163,184,0.52)" /> },
  }
  const { cls, icon } = cfg[status]
  return (
    <span className={cls} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontVariantNumeric: 'tabular-nums' }}>
      {icon}
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Type badge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const t = useT()
  const TYPE_LABELS: Record<string, string> = {
    posting:      t('schedulerTypePosting'),
    mass_posting: t('schedulerTypeMassPosting'),
    story:        'Story',
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: 'rgba(99,102,241,0.10)', color: 'var(--accent)',
      border: '1px solid rgba(99,102,241,0.22)', borderRadius: 6,
      padding: '3px 9px', fontSize: 11, fontWeight: 600,
    }}>
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

// ── Stat chip ──────────────────────────────────────────────────────────────────

function StatChip({ icon, label }: { icon: JSX.Element; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'rgba(255,255,255,0.04)', color: 'var(--muted)',
      border: '1px solid rgba(255,255,255,0.055)', borderRadius: 6,
      padding: '3px 9px', fontSize: 11, fontVariantNumeric: 'tabular-nums',
    }}>
      {icon}
      {label}
    </span>
  )
}

// ── Terminal log panel ─────────────────────────────────────────────────────────

function TerminalLogs({ logs, onClose }: { logs: string[]; onClose: () => void }) {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  function lineColor(msg: string): string {
    const m = msg.trim()
    if (
      m.startsWith('✓') || m.startsWith('[OK]') ||
      m.toLowerCase().includes('success') || m.toLowerCase().includes('done')
    ) return 'var(--ok)'
    if (
      m.startsWith('✗') || m.startsWith('[ERR]') ||
      m.toLowerCase().includes('error') || m.toLowerCase().includes('failed') ||
      m.startsWith('❌')
    ) return 'var(--err)'
    if (m.startsWith('✅')) return 'var(--ok)'
    return 'rgba(148,163,184,0.65)'
  }

  return (
    <div style={{
      marginTop: 12,
      background: '#050508',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      padding: '14px 18px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          color: 'rgba(148,163,184,0.52)', textTransform: 'uppercase',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--ok)',
            boxShadow: '0 0 6px var(--ok)',
            display: 'inline-block',
            animation: 'pulse 1.4s ease-in-out infinite',
          }} />
          {t('schedulerLiveLogs')}
        </span>
        <button
          onClick={onClose}
          className="sf-btn sf-btn-ghost sf-btn-sm sf-btn-icon"
          style={{ width: 22, height: 22 }}
          aria-label="Close logs"
        >
          <IconClose size={10} color="rgba(148,163,184,0.52)" />
        </button>
      </div>

      {/* Log lines */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: 260, overflowY: 'auto', scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(99,102,241,0.3) transparent',
        }}
      >
        {logs.map((msg, i) => (
          <div key={i} style={{
            fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
            fontSize: 12,
            lineHeight: 1.7,
            color: lineColor(msg),
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            <span style={{ color: 'rgba(148,163,184,0.25)', userSelect: 'none', marginRight: 8 }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            {msg}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Vue calendrier (semaine) avec drag & drop pour reprogrammer ───────────────
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Lundi = 0
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - day)
  return x
}
const CAL_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const CAL_ROW_H = 46 // px par heure

// Date → valeur d'un <input type="datetime-local"> local (YYYY-MM-DDTHH:MM)
function toSchedInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CalendarWeek({ posts, onMove, onOpen, onSlotClick, onDuplicate, onDelete }: {
  posts: ScheduledPost[]
  onMove: (post: ScheduledPost, date: Date) => void
  onOpen: (post: ScheduledPost) => void
  onSlotClick: (date: Date) => void
  onDuplicate: (post: ScheduledPost) => void
  onDelete: (post: ScheduledPost) => void
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const dragId = useRef<string | null>(null)
  const [, force] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; post: ScheduledPost } | null>(null)

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const now = new Date()

  const byDay: ScheduledPost[][] = Array.from({ length: 7 }, () => [])
  for (const p of posts) {
    const dt = new Date(p.scheduled_at)
    const dayMidnight = new Date(dt); dayMidnight.setHours(0, 0, 0, 0)
    const idx = Math.round((dayMidnight.getTime() - weekStart.getTime()) / 86400000)
    if (idx >= 0 && idx < 7) byDay[idx].push(p)
  }

  const shiftWeek = (n: number) => { const d = new Date(weekStart); d.setDate(d.getDate() + n * 7); setWeekStart(d) }

  const handleDrop = (dayIdx: number, e: React.DragEvent) => {
    e.preventDefault()
    const id = dragId.current; dragId.current = null
    force(x => x + 1)
    if (!id) return
    const post = posts.find(p => p.id === id)
    if (!post) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    let mins = Math.round(((e.clientY - rect.top) / CAL_ROW_H) * 60 / 5) * 5
    mins = Math.max(0, Math.min(24 * 60 - 5, mins))
    const nd = new Date(weekStart)
    nd.setDate(nd.getDate() + dayIdx)
    nd.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
    if (nd.getTime() < Date.now() + 60_000) { // pas dans le passé → +2 min mini
      const bump = new Date(Date.now() + 2 * 60_000)
      nd.setTime(bump.getTime())
    }
    onMove(post, nd)
  }

  const weekLabel = `${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Barre de navigation semaine */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button onClick={() => shiftWeek(-1)} className="sf-btn sf-btn-ghost sf-btn-sm">‹</button>
        <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="sf-btn sf-btn-ghost sf-btn-sm">Aujourd'hui</button>
        <button onClick={() => shiftWeek(1)} className="sf-btn sf-btn-ghost sf-btn-sm">›</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ivory)', marginLeft: 4 }}>{weekLabel}</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 'auto' }}>Glisse un post pour le reprogrammer</span>
      </div>

      {/* En-têtes des jours */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div />
        {days.map((d, i) => {
          const isToday = d.getTime() === today.getTime()
          return (
            <div key={i} style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.55)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{CAL_DAYS[i]}</div>
              <div style={{
                fontSize: 15, fontWeight: 700, marginTop: 2,
                color: isToday ? '#fff' : 'var(--ivory)',
                width: 26, height: 26, lineHeight: '26px', borderRadius: '50%', margin: '2px auto 0',
                background: isToday ? 'var(--accent)' : 'transparent',
              }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* Grille scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', position: 'relative' }}>
          {/* Gouttière des heures */}
          <div style={{ position: 'relative' }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{ height: CAL_ROW_H, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -6, right: 6, fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>
                  {h > 0 ? `${String(h).padStart(2, '0')}:00` : ''}
                </span>
              </div>
            ))}
          </div>

          {/* Colonnes des jours */}
          {days.map((day, dayIdx) => {
            const isToday = day.getTime() === today.getTime()
            return (
              <div
                key={dayIdx}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(dayIdx, e)}
                onContextMenu={e => {
                  if (e.target !== e.currentTarget) return // clic droit sur un bloc → son propre menu
                  e.preventDefault()
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  let mins = Math.round(((e.clientY - rect.top) / CAL_ROW_H) * 60 / 5) * 5
                  mins = Math.max(0, Math.min(24 * 60 - 5, mins))
                  const nd = new Date(weekStart); nd.setDate(nd.getDate() + dayIdx)
                  nd.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
                  if (nd.getTime() < Date.now()) return // pas dans le passé
                  onSlotClick(nd)
                }}
                title="Clic droit sur un créneau vide pour programmer un post"
                style={{ position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.05)', height: 24 * CAL_ROW_H }}
              >
                {/* Lignes horaires (transparentes aux clics → le créneau reçoit le clic) */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} style={{ height: CAL_ROW_H, borderTop: '1px solid rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
                ))}

                {/* Ligne "maintenant" */}
                {isToday && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0,
                    top: (now.getHours() + now.getMinutes() / 60) * CAL_ROW_H,
                    borderTop: '2px solid #f87171', zIndex: 3, pointerEvents: 'none',
                  }} />
                )}

                {/* Blocs de posts */}
                {byDay[dayIdx].map(p => {
                  const dt = new Date(p.scheduled_at)
                  const top = (dt.getHours() + dt.getMinutes() / 60) * CAL_ROW_H
                  const canDrag = p.status === 'pending'
                  const typeLabel = p.type === 'story' ? 'Story' : p.type === 'mass_posting' ? 'Mass' : 'Reel'
                  // Couleur par statut : à venir (violet), en cours (ambre),
                  // publié (vert), échec (rouge), annulé (gris).
                  const col = p.status === 'pending'   ? { bg: 'rgba(99,102,241,0.22)',  bd: 'rgba(99,102,241,0.55)' }
                            : p.status === 'running'   ? { bg: 'rgba(234,179,8,0.22)',   bd: 'rgba(234,179,8,0.5)' }
                            : p.status === 'done'      ? { bg: 'rgba(16,185,129,0.18)',  bd: 'rgba(16,185,129,0.45)' }
                            : p.status === 'failed'    ? { bg: 'rgba(248,113,113,0.18)', bd: 'rgba(248,113,113,0.45)' }
                            : { bg: 'rgba(148,163,184,0.14)', bd: 'rgba(148,163,184,0.35)' }
                  return (
                    <div
                      key={p.id}
                      draggable={canDrag}
                      onDragStart={() => { dragId.current = p.id }}
                      onDragEnd={() => { dragId.current = null }}
                      onClick={e => { e.stopPropagation(); onOpen(p) }}
                      onContextMenu={e => {
                        e.preventDefault(); e.stopPropagation()
                        if (isManualRun(p)) return  // run manuel = lecture seule
                        setMenu({ x: e.clientX, y: e.clientY, post: p })
                      }}
                      title={isManualRun(p)
                        ? `${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · Mass Posting manuel · ${p.phones.length} compte(s)`
                        : `${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${p.phones.length} compte(s) — clic droit pour dupliquer`}
                      style={{
                        position: 'absolute', left: 3, right: 3, top: top + 1, minHeight: 34,
                        background: col.bg, border: `1px solid ${col.bd}`,
                        opacity: (p.status === 'done' || p.status === 'failed' || p.status === 'cancelled') ? 0.82 : 1,
                        borderRadius: 7, padding: '3px 6px', cursor: canDrag ? 'grab' : 'pointer',
                        overflow: 'hidden', zIndex: 2,
                      }}
                    >
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                        {dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {typeLabel}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.phones.length} compte{p.phones.length > 1 ? 's' : ''}{p.caption ? ` · ${p.caption.slice(0, 24)}` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Menu contextuel (clic droit sur un post) */}
      {menu && (
        <>
          <div onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }}
            style={{ position: 'fixed', inset: 0, zIndex: 1500 }} />
          <div style={{
            position: 'fixed', top: Math.min(menu.y, window.innerHeight - 140), left: Math.min(menu.x, window.innerWidth - 200),
            zIndex: 1501, background: '#14141c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
            padding: 4, minWidth: 190, boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
          }}>
            {([
              { label: 'Dupliquer', fn: () => onDuplicate(menu.post) },
              ...(menu.post.status === 'pending' || menu.post.status === 'running' ? [
                { label: 'Reprogrammer (heure précise)', fn: () => onOpen(menu.post) },
                { label: 'Supprimer', danger: true, fn: () => onDelete(menu.post) },
              ] : []),
            ] as { label: string; danger?: boolean; fn: () => void }[]).map((it, i) => (
              <button key={i}
                onClick={() => { it.fn(); setMenu(null) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 7,
                  background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13,
                  color: (it as { danger?: boolean }).danger ? '#f87171' : 'var(--ivory)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Modal détails d'un post programmé ─────────────────────────────────────────
function SchedDetailModal({ post, onClose, onReschedule, onDuplicate }: {
  post: ScheduledPost
  onClose: () => void
  onReschedule?: () => void
  onDuplicate: () => void
}) {
  const phones = Array.isArray(post.phones) ? post.phones : []
  const results = post.result?.phone_results ?? []
  const okList = results.filter(r => r.ok)
  const koList = results.filter(r => !r.ok)
  const typeLabel = post.type === 'story' ? 'Story' : post.type === 'mass_posting' ? 'Mass Posting' : 'Reel'
  const statusLabel = post.status === 'pending' ? 'À venir' : post.status === 'running' ? 'En cours'
    : post.status === 'done' ? 'Publié' : post.status === 'failed' ? 'Échec' : 'Annulé'
  const Chip = ({ children }: { children: ReactNode }) => (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(233,234,240,0.6)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: '3px 10px' }}>{children}</span>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: 'min(540px,100%)', maxHeight: '82vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#E9EAF0' }}>Détail du post</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(233,234,240,0.5)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'rgba(233,234,240,0.5)' }}>
          {typeLabel} · {fmtScheduledTime(post.executed_at ?? post.scheduled_at)}
          {results.length > 0 && <> · <span style={{ color: '#34D399' }}>{okList.length} réussi{okList.length > 1 ? 's' : ''}</span> · <span style={{ color: '#f87171' }}>{koList.length} échoué{koList.length > 1 ? 's' : ''}</span></>}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <Chip>{statusLabel}</Chip>
          <Chip>{phones.length} compte{phones.length > 1 ? 's' : ''}</Chip>
          {Array.isArray(post.videos) && <Chip>{post.videos.length} vidéo{post.videos.length > 1 ? 's' : ''}</Chip>}
        </div>
        {post.caption && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'rgba(233,234,240,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Légende</div>
            <div style={{ fontSize: 12.5, color: '#E9EAF0', lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px' }}>{post.caption}</div>
          </div>
        )}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'rgba(233,234,240,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Comptes</div>
          {results.length > 0 ? (
            [...koList, ...okList].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: r.ok ? '#34D399' : '#f87171', fontWeight: 800, fontSize: 13 }}>{r.ok ? '✓' : '✕'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: '#E9EAF0' }}>{r.name}</div>
                  {!r.ok && r.error && <div style={{ fontSize: 11, color: 'rgba(233,234,240,0.45)' }}>{r.error}</div>}
                </div>
              </div>
            ))
          ) : (
            phones.map((p, i) => <div key={i} style={{ fontSize: 12.5, color: '#E9EAF0', padding: '4px 0' }}>{p.ig_username ?? p.phone_name}</div>)
          )}
        </div>
        {!isManualRun(post) && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onDuplicate} className="sf-btn sf-btn-primary" style={{ flex: 1 }}>Dupliquer</button>
            {onReschedule && <button onClick={onReschedule} className="sf-btn sf-btn-ghost" style={{ flex: 1 }}>Reprogrammer</button>}
          </div>
        )}
      </div>
    </div>
  )
}

export function Scheduler({ user, onNavigate }: Props) {
  const t                         = useT()
  const { role }                  = useOrg()
  const credits                   = useCredits()
  const toast                     = useToast()
  const [posts, setPosts]         = useState<ScheduledPost[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<TabFilter>('pending')
  const [search, setSearch]       = useState('')
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<ScheduledPost | null>(null)
  const [reschedule, setReschedule] = useState<ScheduledPost | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showStoryCreate, setShowStoryCreate] = useState(false)
  const [showTypeChoice, setShowTypeChoice] = useState(false)
  const [presetSchedAt, setPresetSchedAt] = useState<string | undefined>(undefined)
  const [detailPost, setDetailPost] = useState<ScheduledPost | null>(null)
  const [showPlatformChoice, setShowPlatformChoice] = useState(false)
  const [reelPlatform, setReelPlatform] = useState<'instagram' | 'tiktok'>(
    (localStorage.getItem('sf-mp-platform') as 'instagram' | 'tiktok' | null) ?? 'instagram')
  const [runningPost, setRunningPost] = useState<string | null>(null)
  const [runLogs, setRunLogs]     = useState<{ id: string; msgs: string[] } | null>(null)
  const timersRef                 = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const runningRef                = useRef<Set<string>>(new Set())

  // 30 s ticker: keeps the relative "dans Xh Ymin" labels fresh without reloading
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Can cancel: own post OR org admin/owner
  function canCancel(post: ScheduledPost) {
    if (post.user_id === user.id) return true
    return role === 'owner' || role === 'admin'
  }

  const reload = useCallback(async () => {
    setLoading(true)
    // Self-heal: posts stuck in 'running' (app closed mid-execution) → failed
    await failStaleRunningPosts().catch(() => {})
    // Posts programmés + Mass Posting lancés à la main (post_runs) dans le même agenda.
    const [all, manual] = await Promise.all([
      loadScheduledPosts(),
      loadManualRuns().catch(() => [] as ScheduledPost[]),
    ])
    setPosts([...all, ...manual])
    setLoading(false)
  }, [])

  // Register a timeout for a pending post and execute when due
  const scheduleExecution = useCallback((post: ScheduledPost) => {
    if (runningRef.current.has(post.id)) return
    // Guard against duplicate timers (realtime updates re-trigger the effect)
    if (timersRef.current.has(post.id)) return

    const run = async () => {
      timersRef.current.delete(post.id)
      // Re-verify due time before claiming — protects against early fires
      // (int32 setTimeout overflow, system clock changes, rescheduled posts)
      if (new Date(post.scheduled_at).getTime() - Date.now() > 1500) {
        arm()
        return
      }
      if (runningRef.current.has(post.id)) return
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
      const typeLabel = post.type === 'story' ? 'Story programmée' : post.type === 'mass_posting' ? 'Mass posting programmé' : 'Publication programmée'
      const n = post.phones.length
      // In-page toast
      toast.show({
        title: ok ? `${typeLabel} terminé ✓` : `${typeLabel} échoué`,
        body: `${n} compte${n > 1 ? 's' : ''}`,
        kind: ok ? 'ok' : 'error',
      })
      // Persistent bell notification
      pushNotification({
        title: ok ? `${typeLabel} terminée ✓` : `${typeLabel} échouée`,
        body:  `${n} compte${n > 1 ? 's' : ''}${post.created_by_name ? ' · ' + post.created_by_name : ''}`,
        level: ok ? 'ok' : 'error',
        page:  'scheduler',
      })
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(ok ? `${typeLabel} terminée ✓` : `${typeLabel} échouée`, {
          body: `${n} compte${n > 1 ? 's' : ''} — ScaleFlow`,
        })
      }
      reload()
    }

    // Arm a timer; for delays beyond the int32 setTimeout limit (~24.8 days),
    // chain a 24 h timeout that re-arms until the real deadline is reachable.
    const arm = () => {
      const delay = new Date(post.scheduled_at).getTime() - Date.now()
      if (delay <= 0) { void run(); return }
      if (delay > MAX_TIMEOUT_MS) {
        const timer = setTimeout(() => {
          timersRef.current.delete(post.id)
          arm()
        }, RESCHEDULE_CHUNK_MS)
        timersRef.current.set(post.id, timer)
      } else {
        const timer = setTimeout(() => { void run() }, delay)
        timersRef.current.set(post.id, timer)
      }
    }

    arm()
  }, [reload, toast])

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
    const timers = timersRef.current
    return () => { timers.forEach(timer => clearTimeout(timer)); timers.clear() }
  }, [])

  async function cancel(id: string) {
    if (id.startsWith('run-')) return  // run manuel : rien à annuler
    setCancelling(id)
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    try {
      const { refunded } = await cancelScheduledPost(id, credits.ownerId)
      // Verify the cancellation actually landed in DB before updating the UI
      const { data, error } = await supabase.from('scheduled_posts')
        .select('status').eq('id', id).maybeSingle()
      if (error || (data && data.status !== 'cancelled')) {
        toast.show({ title: 'Annulation échouée', body: `Le post n'a pas pu être annulé — statut rechargé.`, kind: 'error' })
        await reload()
        return
      }
      setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'cancelled' } : p))
      if (refunded > 0) {
        credits.refresh()
        toast.show({ title: 'Post annulé', body: `${refunded} crédits remboursés`, kind: 'ok' })
      } else {
        toast.show({ title: 'Post annulé', kind: 'ok' })
      }
    } catch (e) {
      toast.show({
        title: 'Annulation échouée',
        body: e instanceof Error ? e.message : 'Erreur réseau — réessaie.',
        kind: 'error',
      })
      await reload()
    } finally {
      setCancelling(null)
    }
  }

  // Reschedule a pending post: clear its timer, update scheduled_at in DB,
  // then let the auto-schedule effect re-arm a fresh timer.
  async function doReschedule(post: ScheduledPost, date: Date) {
    if (isManualRun(post)) return  // run manuel : rien à reprogrammer
    const timer = timersRef.current.get(post.id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(post.id) }
    try {
      const { data, error } = await supabase.from('scheduled_posts')
        .update({ scheduled_at: date.toISOString() })
        .eq('id', post.id).eq('status', 'pending')
        .select('id')
      if (error || !data?.length) {
        toast.show({ title: 'Report échoué', body: `Le post n'est plus en attente — statut rechargé.`, kind: 'error' })
        setReschedule(null)
        await reload()
        return
      }
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, scheduled_at: date.toISOString() } : p))
      setReschedule(null)
      toast.show({ title: 'Post reporté', body: `Nouveau départ : ${fmtScheduledTime(date.toISOString())}`, kind: 'ok' })
    } catch (e) {
      setReschedule(null)
      toast.show({
        title: 'Report échoué',
        body: e instanceof Error ? e.message : 'Erreur réseau — réessaie.',
        kind: 'error',
      })
      await reload()
    }
  }

  // Duplique un post : recrée la même config dans un nouveau post en attente,
  // programmé 1h après l'original (ou dans 1h si l'original est passé).
  async function duplicateSchedPost(post: ScheduledPost) {
    if (isManualRun(post)) return  // run manuel : pas de config à dupliquer
    try {
      const base = new Date(post.scheduled_at).getTime()
      const when = new Date(Math.max(Date.now() + 5 * 60_000, base + 60 * 60_000))
      const created = await createScheduledPost({
        userId: user.id, orgId: post.org_id, createdByName: post.created_by_name || (user.email ?? 'Moi'),
        type: post.type, scheduledAt: when, phones: post.phones, videos: post.videos,
        caption: post.caption, delayMinutes: post.delay_minutes, mode: post.mode,
        bearerToken: '', reelsTrial: post.reels_trial, platform: post.platform,
      })
      setPosts(prev => [created, ...prev])
      toast.show({ title: 'Post dupliqué ✓', body: `Copie programmée le ${fmtScheduledTime(when.toISOString())}.`, kind: 'ok' })
    } catch (e) {
      toast.show({ title: 'Duplication échouée', body: e instanceof Error ? e.message : String(e), kind: 'error' })
    }
  }

  const pending = posts.filter(p => p.status === 'pending' || p.status === 'running')
  const history = posts.filter(p => p.status === 'done' || p.status === 'failed' || p.status === 'cancelled')

  // Apply search filter
  const baseShown = tab === 'pending' ? pending : history
  const shown = search.trim()
    ? baseShown.filter(p =>
        p.caption?.toLowerCase().includes(search.toLowerCase()) ||
        p.phones.some(ph => (ph.ig_username ?? ph.phone_name ?? '').toLowerCase().includes(search.toLowerCase()))
      )
    : baseShown

  const doneCount = history.filter(p => p.status === 'done').length
  const headStats: Array<[string, number, string]> = [
    ['En attente', pending.length, '#818CF8'],
    ['Publiés', doneCount, '#34D399'],
    ['Total', posts.length, '#94A3B8'],
  ]

  return (
    <div className="sf-page anim-page" style={{ position: 'relative' }}>
      <style>{`@keyframes sch-shimmer{0%{background-position:-160% 0}100%{background-position:260% 0}}@keyframes sch-float{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,22px)}}`}</style>
      {/* Ambient glow */}
      <div aria-hidden style={{ position: 'absolute', top: -110, left: '14%', width: 520, height: 340, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.12), transparent 68%)', filter: 'blur(60px)', pointerEvents: 'none', animation: 'sch-float 22s ease-in-out infinite', zIndex: 0 }} />

      {/* ── Page header ─────────────────────────────────────────────────────────── */}
      <div className="sf-page-header" style={{ position: 'relative', zIndex: 1, flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: '24px 28px 0', borderBottom: 'none' }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, minWidth: 0 }}>
            {/* Icon */}
            <div className="sf-anim-scale-spring" style={{
              width: 52, height: 52, borderRadius: 15, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
              boxShadow: '0 12px 28px -8px rgba(99,102,241,0.6), inset 0 1px 0 0 rgba(255,255,255,0.35)',
            }}>
              <IconCalendarSm size={25} color="#fff" />
            </div>

            {/* Text */}
            <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(129,140,248,0.75)', marginBottom: 3 }}>Programmation</div>
              <h1 style={{
                margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.0,
                background: 'linear-gradient(100deg,#fff 20%,#a5b4fc 55%,#6ee7b7 90%)', backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'sch-shimmer 7s linear infinite',
              }}>
                {t('schedulerTitle')}
              </h1>
            </div>
          </div>

          {/* Right: schedule button */}
          <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { setPresetSchedAt(undefined); setShowTypeChoice(true) }}
              className="sf-btn sf-btn-lg cursor-pointer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', color: '#fff',
                background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                boxShadow: '0 12px 28px -10px rgba(99,102,241,0.7), inset 0 1px 0 0 rgba(255,255,255,0.3)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Programmer
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          {headStats.map(([label, val, color], i) => {
            const clickable = i === 1 && onNavigate && doneCount > 0
            return (
              <button
                key={label}
                onClick={clickable ? () => onNavigate?.('history') : undefined}
                title={clickable ? "Voir l'historique complet" : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 9, padding: '9px 15px 9px 11px', borderRadius: 12,
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
                  border: '1px solid rgba(255,255,255,0.08)', cursor: clickable ? 'pointer' : 'default',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
                <span style={{ fontSize: 19, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{val}</span>
                <span style={{ fontSize: 12, color: 'rgba(233,234,240,0.5)', fontWeight: 600 }}>{label}</span>
                {clickable && <span style={{ opacity: 0.5, marginLeft: 2 }}>›</span>}
              </button>
            )
          })}
        </div>

        {/* Tabs — underline style */}
        <div className="sf-anim-slide-up sf-d150" style={{
          display: 'flex', gap: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {([
            { id: 'pending' as TabFilter, label: t('schedulerTabPending'), count: pending.length },
            { id: 'calendar' as TabFilter, label: 'Calendrier', count: 0 },
          ]).map(tabItem => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className="cursor-pointer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === tabItem.id ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                color: tab === tabItem.id ? 'var(--ivory)' : 'rgba(148,163,184,0.45)',
                fontSize: 13, fontWeight: tab === tabItem.id ? 600 : 500,
                transition: 'color 0.15s, border-color 0.15s',
                marginBottom: -1,
                outline: 'none',
              }}
              onMouseEnter={e => {
                if (tab !== tabItem.id) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(233,234,240,0.7)'
              }}
              onMouseLeave={e => {
                if (tab !== tabItem.id) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.45)'
              }}
            >
              {tabItem.label}
              {tabItem.count > 0 && (
                <span style={{
                  background: tab === tabItem.id ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.05)',
                  color: tab === tabItem.id ? 'var(--accent)' : 'rgba(148,163,184,0.4)',
                  borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                  transition: 'background 0.15s, color 0.15s',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {tabItem.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────────── */}
      <div className="sf-toolbar sf-anim-slide-up sf-d200">
        {/* Search */}
        <div className="sf-search" style={{ flex: 1, maxWidth: 320, position: 'relative' }}>
          <span className="sf-search-icon" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <IconSearch size={14} color="rgba(100,116,139,0.5)" />
          </span>
          <input
            type="text"
            className="sf-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (légende, compte)…"
            style={{ paddingLeft: 32, height: 32, fontSize: 12.5 }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* Refresh */}
        <button
          onClick={reload}
          disabled={loading}
          className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: loading ? 0.6 : 1 }}
        >
          <IconRefresh size={13} color="rgba(233,234,240,0.72)" spinning={loading} />
          {t('refresh') || 'Refresh'}
        </button>
      </div>

      {/* ── Page body ─────────────────────────────────────────────────────────────── */}
      <div className="sf-page-body">
        {loading ? (
          /* ── Skeleton loading ─────────────────────────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="sf-skeleton"
                style={{
                  height: 88,
                  borderRadius: 14,
                  opacity: 1 - i * 0.18,
                }}
              />
            ))}
          </div>
        ) : tab === 'calendar' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '9px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)', fontSize: 12, color: 'var(--muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-l)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <span>Clique un créneau vide pour programmer un post · glisse un post en attente pour le déplacer.</span>
            </div>
            <CalendarWeek
              posts={posts.filter(p => p.status !== 'cancelled')}
              onMove={(p, d) => { void doReschedule(p, d) }}
              onOpen={p => setDetailPost(p)}
              onSlotClick={d => { setPresetSchedAt(toSchedInput(d)); setShowTypeChoice(true) }}
              onDuplicate={p => { void duplicateSchedPost(p) }}
              onDelete={p => { if (p.status === 'running') cancel(p.id); else setConfirmCancel(p) }}
            />
          </div>
        ) : shown.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────────────────── */
          <div className="sf-card" style={{
            marginTop: 8,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '56px 32px', textAlign: 'center',
          }}>
            {/* Illustration area */}
            <div style={{
              width: 80, height: 80, borderRadius: 20, marginBottom: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.18)',
              boxShadow: '0 0 40px -12px rgba(99,102,241,0.35)',
            }}>
              <IconCalendar size={36} color="rgba(99,102,241,0.6)" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)', marginBottom: 8 }}>
              {tab === 'pending' ? t('schedulerEmptyPending') : t('schedulerEmptyHistory')}
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--muted)', marginBottom: 20, maxWidth: 320 }}>
              {tab === 'pending' ? t('schedulerEmptyPendingHint') : t('schedulerEmptyHistoryHint')}
            </p>
            {tab === 'pending' && (
              <button
                className="sf-btn sf-btn-primary cursor-pointer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                onClick={() => { setPresetSchedAt(undefined); setShowTypeChoice(true) }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                {posts.length === 0 ? 'Programmer ton premier post' : t('schedulerSchedulePost')}
              </button>
            )}
          </div>
        ) : (
          /* ── Post card list with stagger animation ────────────────────────────── */
          <div className="anim-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shown.map((post, index) => (
              <PostCard
                key={post.id}
                post={post}
                index={index}
                isOwn={post.user_id === user.id}
                canCancel={canCancel(post)}
                isRunning={runningPost === post.id}
                runLogs={runLogs?.id === post.id ? runLogs.msgs : null}
                cancelling={cancelling === post.id}
                onCancel={() => {
                  // Stuck-running posts are stopped directly (no refund, no config to lose)
                  if (post.status === 'running') cancel(post.id)
                  else setConfirmCancel(post)
                }}
                onReschedule={post.status === 'pending' && post.user_id === user.id
                  ? () => setReschedule(post)
                  : undefined}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── Confirm cancel ───────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmCancel}
        title="Annuler ce post programmé ?"
        message="Les crédits seront remboursés, mais tu devras tout reconfigurer (téléphones, vidéos, légende) pour le reprogrammer."
        confirmLabel="Annuler le post"
        cancelLabel="Garder"
        danger
        busy={!!confirmCancel && cancelling === confirmCancel.id}
        onConfirm={async () => {
          if (!confirmCancel) return
          const id = confirmCancel.id
          await cancel(id)
          setConfirmCancel(null)
        }}
        onCancel={() => setConfirmCancel(null)}
      />

      {/* ── Reschedule modal — reuses ScheduleModal to pick the new date ─────── */}
      {reschedule && (
        <ScheduleModal
          type={reschedule.type === 'mass_posting' ? 'mass_posting' : 'posting'}
          phonesCount={reschedule.phones.length}
          videosCount={reschedule.videos.length}
          onConfirm={date => { void doReschedule(reschedule, date) }}
          onClose={() => setReschedule(null)}
        />
      )}

      {detailPost && (
        <SchedDetailModal
          post={detailPost}
          onClose={() => setDetailPost(null)}
          onReschedule={detailPost.status === 'pending' && detailPost.user_id === user.id ? () => { setReschedule(detailPost); setDetailPost(null) } : undefined}
          onDuplicate={() => { void duplicateSchedPost(detailPost); setDetailPost(null) }}
        />
      )}

      {/* ── Create modal — Reel ──────────────────────────────────────────────── */}
      {showCreate && (
        <CreateScheduleModal
          user={user}
          initialPlatform={reelPlatform}
          initialSchedAt={presetSchedAt}
          onCreated={() => { setShowCreate(false); setPresetSchedAt(undefined); reload() }}
          onClose={() => { setShowCreate(false); setPresetSchedAt(undefined) }}
        />
      )}

      {/* ── Platform chooser : Instagram ou TikTok (pour un Reel) ─────────── */}
      {showPlatformChoice && (
        <div
          tabIndex={-1}
          ref={el => el?.focus()}
          onKeyDown={e => { if (e.key === 'Escape') setShowPlatformChoice(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000, outline: 'none',
            background: 'rgba(6,6,8,0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowPlatformChoice(false) }}
        >
          <div className="anim-scale-in" style={{
            width: '100%', maxWidth: 500, position: 'relative',
            background: 'linear-gradient(170deg, #16171F, #0F1014)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <div aria-hidden style={{ position: 'absolute', top: -70, left: '30%', width: 300, height: 180, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(236,72,153,0.14), transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', padding: '22px 24px 4px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(129,140,248,0.75)' }}>Reel programmé</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                Où veux-tu publier ?
              </p>
            </div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 22 }}>
              {([
                {
                  k: 'instagram' as const, label: 'Instagram', desc: 'Reels — publication native',
                  grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.5)', accent: '#F472B6',
                  icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="#fff" stroke="none"/></svg>,
                },
                {
                  k: 'tiktok' as const, label: 'TikTok', desc: 'Vidéos — publication native',
                  grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', glow: 'rgba(34,211,238,0.5)', accent: '#22D3EE',
                  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 3c.4 2.4 2 4.1 4.5 4.4v3c-1.7.1-3.2-.4-4.6-1.3v6.2c0 3.6-2.7 5.9-6 5.9-3.2 0-5.6-2.5-5.6-5.5 0-3.4 2.9-5.9 6.4-5.3v3.1c-.4-.1-.9-.2-1.3-.2-1.4 0-2.4 1-2.4 2.4 0 1.4 1 2.4 2.5 2.4 1.6 0 2.6-1.1 2.6-2.9V3h3.9z"/></svg>,
                },
              ]).map(p => (
                <button
                  key={p.k}
                  onClick={() => {
                    setReelPlatform(p.k)
                    localStorage.setItem('sf-mp-platform', p.k)
                    setShowPlatformChoice(false)
                    setShowCreate(true)
                  }}
                  className="cursor-pointer"
                  style={{
                    padding: 18, borderRadius: 16, textAlign: 'center',
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
                    border: `1px solid ${reelPlatform === p.k ? `${p.accent}59` : 'rgba(255,255,255,0.09)'}`,
                    transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s, border-color 0.25s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 22px 46px -20px ${p.glow}`; e.currentTarget.style.borderColor = `${p.accent}66` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = reelPlatform === p.k ? `${p.accent}59` : 'rgba(255,255,255,0.09)' }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.grad, boxShadow: `0 10px 22px -8px ${p.glow}, inset 0 1px 0 rgba(255,255,255,0.3)` }}>{p.icon}</div>
                  <div>
                    <p style={{ margin: '0 0 3px', fontSize: 14.5, fontWeight: 800, color: '#fff' }}>{p.label}</p>
                    <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: 'rgba(233,234,240,0.5)' }}>{p.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setShowPlatformChoice(false); setShowTypeChoice(true) }}
                className="sf-btn sf-btn-ghost cursor-pointer"
                style={{ flex: 1 }}
              >
                Retour
              </button>
              <button
                onClick={() => setShowPlatformChoice(false)}
                className="sf-btn sf-btn-ghost cursor-pointer"
                style={{ flex: 1 }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create modal — Story ─────────────────────────────────────────────── */}
      {showStoryCreate && (
        <CreateStoryScheduleModal
          user={user}
          onCreated={() => { setShowStoryCreate(false); reload() }}
          onClose={() => setShowStoryCreate(false)}
        />
      )}

      {/* ── Type chooser : Reel ou Story ─────────────────────────────────── */}
      {showTypeChoice && (
        <div
          tabIndex={-1}
          ref={el => el?.focus()}
          onKeyDown={e => { if (e.key === 'Escape') setShowTypeChoice(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000, outline: 'none',
            background: 'rgba(6,6,8,0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowTypeChoice(false) }}
        >
          <div className="anim-scale-in" style={{
            width: '100%', maxWidth: 520, position: 'relative',
            background: 'linear-gradient(170deg, #16171F, #0F1014)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <div aria-hidden style={{ position: 'absolute', top: -70, left: '30%', width: 300, height: 180, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.18), transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', padding: '22px 24px 4px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(129,140,248,0.75)' }}>Nouvelle programmation</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                Que veux-tu programmer ?
              </p>
            </div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 22 }}>
              {([
                {
                  onClick: () => { setShowTypeChoice(false); setShowPlatformChoice(true) },
                  title: 'Reel', tag: 'Vidéo', accent: '#818CF8',
                  grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.5)',
                  desc: 'Vidéos de la banque, légende, mode séquentiel ou aléatoire. Part même app fermée.',
                  icon: <IconVideo size={21} color="#fff" />,
                },
                {
                  onClick: () => { setShowTypeChoice(false); setShowStoryCreate(true) },
                  title: 'Story avec lien', tag: 'Sticker lien', accent: '#FBBF24',
                  grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.45)',
                  desc: 'Photos + sticker lien par compte. Configure et programme directement ici.',
                  icon: (
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  ),
                },
              ]).map((opt, i) => (
                <button
                  key={i}
                  onClick={opt.onClick}
                  className="cursor-pointer"
                  style={{
                    padding: 18, borderRadius: 16, textAlign: 'left',
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
                    border: '1px solid rgba(255,255,255,0.09)',
                    transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s, border-color 0.25s',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 22px 46px -20px ${opt.glow}`; e.currentTarget.style.borderColor = `${opt.accent}66` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: opt.grad, boxShadow: `0 10px 22px -8px ${opt.glow}, inset 0 1px 0 rgba(255,255,255,0.3)` }}>{opt.icon}</div>
                  <div>
                    <p style={{ margin: '0 0 1px', fontSize: 15, fontWeight: 800, color: '#fff' }}>{opt.title}</p>
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: opt.accent }}>{opt.tag}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: 'rgba(233,234,240,0.55)' }}>{opt.desc}</p>
                </button>
              ))}
            </div>
            <div style={{ position: 'relative', padding: '0 22px 18px' }}>
              <button
                onClick={() => setShowTypeChoice(false)}
                className="sf-btn sf-btn-ghost cursor-pointer"
                style={{ width: '100%' }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Post card ──────────────────────────────────────────────────────────────────

function PostCard({ post, index, isOwn, canCancel, isRunning, runLogs, cancelling, onCancel, onReschedule }: {
  post: ScheduledPost
  index: number
  isOwn: boolean
  canCancel: boolean
  isRunning: boolean
  runLogs: string[] | null
  cancelling: boolean
  onCancel: () => void
  onReschedule?: () => void
}) {
  const t = useT()
  // Logs dépliés d'office quand le post a échoué → on voit tout de suite pourquoi.
  const [showLogs, setShowLogs] = useState(post.status === 'failed')
  const [hovered, setHovered]   = useState(false)
  const isPending   = post.status === 'pending'
  // A 'running' post not executing in THIS session is stuck (app closed mid-run) — allow stopping it
  const isStuckRunning = post.status === 'running' && !isRunning
  const allLogs = runLogs ?? (post.result?.logs ?? [])

  // Status-based left border color per design spec
  const statusBorderColor =
    post.status === 'pending'   ? 'var(--accent)'
    : post.status === 'running' ? 'var(--warn)'
    : post.status === 'done'    ? 'var(--ok)'
    : post.status === 'failed'  ? 'var(--err)'
    : 'rgba(148,163,184,0.2)'   // cancelled

  // Running posts get an accent glow box-shadow
  const cardBoxShadow = isRunning
    ? '0 0 0 1px var(--accent), 0 6px 24px -8px rgba(99,102,241,0.35)'
    : hovered
    ? '0 6px 24px -8px rgba(0,0,0,0.4)'
    : 'none'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="sf-card"
      style={{
        borderLeft: `3px solid ${statusBorderColor}`,
        padding: '16px 20px',
        transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
        boxShadow: cardBoxShadow,
        background: hovered ? 'rgba(99,102,241,0.032)' : undefined,
      }}
    >
      {/* ── Row 1: status + type + user — right: actions ──────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <StatusPill status={post.status} />
          <TypeBadge type={post.type} />

          {post.created_by_name && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: isOwn ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)',
              color: isOwn ? 'var(--accent)' : 'rgba(233,234,240,0.5)',
              border: `1px solid ${isOwn ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.055)'}`,
              borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 500,
            }}>
              <IconUser size={11} color={isOwn ? 'var(--accent)' : 'rgba(233,234,240,0.5)'} />
              {isOwn ? t('schedulerMe') : post.created_by_name}
            </span>
          )}

          {isRunning && (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Spinner size="sm" />
            </span>
          )}
        </div>

        {/* Cancel / Stop-stuck button */}
        {(isPending || isStuckRunning) && canCancel && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="sf-btn sf-btn-danger sf-btn-sm cursor-pointer"
            style={{
              flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: cancelling ? 0.5 : 1,
              cursor: cancelling ? 'not-allowed' : 'pointer',
            }}
          >
            <IconX size={11} color="var(--err)" />
            {cancelling ? t('schedulerCancelling') : isStuckRunning ? 'Arrêter' : t('cancel')}
          </button>
        )}
      </div>

      {/* ── Row 2: prominent time chip with clock icon ─────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {/* Time chip */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.22)',
          borderRadius: 8,
          padding: '4px 10px',
          color: 'var(--accent-l)', fontSize: 12.5, fontWeight: 700,
          letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums',
        }}>
          <IconClock size={13} color="var(--accent-l)" />
          {fmtScheduledTime(post.scheduled_at)}
        </span>
        {isPending && (
          <span style={{
            fontSize: 12, color: 'var(--muted)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            paddingLeft: 10, fontVariantNumeric: 'tabular-nums',
          }}>
            {timeUntil(post.scheduled_at)}
          </span>
        )}
      </div>

      {/* ── Row 3: stat chips (phones + videos + delay + mode) ────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {(post.status === 'done' || post.status === 'failed') && (post.result?.phone_results?.length ?? 0) > 0 && (() => {
          const prs = post.result!.phone_results!
          const okN = prs.filter(r => r.ok).length
          const allOk = okN === prs.length
          return (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99,
              fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              background: allOk ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
              color: allOk ? '#34D399' : '#FBBF24',
              border: `1px solid ${allOk ? 'rgba(52,211,153,0.28)' : 'rgba(251,191,36,0.28)'}`,
            }}>
              {allOk
                ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 8v5"/><path d="M12 16h.01"/></svg>}
              {okN}/{prs.length} réussi{okN > 1 ? 's' : ''}
            </span>
          )
        })()}
        <StatChip
          icon={<IconPhone size={11} color="rgba(233,234,240,0.72)" />}
          label={`${post.phones.length} ${post.phones.length !== 1 ? t('schedulerPhonePlural') : t('schedulerPhone')}`}
        />
        {post.type !== 'story' && (
          <StatChip
            icon={<IconVideo size={11} color="rgba(233,234,240,0.72)" />}
            label={`${post.videos.length} ${post.videos.length !== 1 ? t('schedulerVideoPlural') : t('schedulerVideo')}`}
          />
        )}
        {post.delay_minutes > 0 && (
          <StatChip
            icon={<IconTime size={11} color="rgba(233,234,240,0.72)" />}
            label={`${post.delay_minutes} ${t('schedulerMinBetween')}`}
          />
        )}
        {post.type === 'mass_posting' && (
          <StatChip
            icon={post.mode === 'random'
              ? <IconShuffle size={11} color="rgba(233,234,240,0.72)" />
              : <IconArrowRight size={11} color="rgba(233,234,240,0.72)" />}
            label={post.mode === 'random' ? t('schedulerRandom') : t('schedulerSequential')}
          />
        )}
      </div>

      {/* ── Caption preview ───────────────────────────────────────────────── */}
      {post.caption && (
        <p style={{
          marginTop: 10, marginBottom: 0,
          fontSize: 12, lineHeight: 1.6,
          color: 'var(--muted)',
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
              background: 'rgba(255,255,255,0.03)', color: 'rgba(233,234,240,0.6)',
              border: '1px solid rgba(255,255,255,0.055)', borderRadius: 5,
              padding: '2px 8px', fontSize: 11,
            }}>
              {p.ig_username ?? p.phone_name}
            </span>
          ))}
          {post.phones.length > 6 && (
            <span className="sf-badge sf-badge-violet" style={{ borderRadius: 5, padding: '2px 8px', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              +{post.phones.length - 6} {t('schedulerMoreItems')}
            </span>
          )}
        </div>
      )}

      {/* ── Run logs — terminal panel ──────────────────────────────────────── */}
      {allLogs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {!showLogs ? (
            <button
              onClick={() => setShowLogs(true)}
              className="cursor-pointer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(99,102,241,0.8)', fontSize: 12, fontWeight: 600, padding: 0,
                transition: 'color 0.12s', fontVariantNumeric: 'tabular-nums',
              }}
            >
              <IconChevron size={11} color="rgba(99,102,241,0.8)" rotated={false} />
              {t('schedulerShowLogs')} ({allLogs.length})
            </button>
          ) : (
            <TerminalLogs logs={allLogs} onClose={() => setShowLogs(false)} />
          )}
        </div>
      )}

      {/* ── Error message ─────────────────────────────────────────────────── */}
      {post.error_msg && post.status === 'failed' && (
        <p style={{
          marginTop: 10, marginBottom: 0,
          fontSize: 12, lineHeight: 1.6,
          padding: '8px 12px',
          background: 'rgba(248,113,113,0.07)', color: 'var(--err)',
          border: '1px solid rgba(248,113,113,0.18)', borderRadius: 8,
          fontFamily: 'ui-monospace, monospace',
        }}>
          {post.error_msg}
        </p>
      )}
    </div>
  )
}
