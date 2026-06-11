import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT, useLang } from '@/lib/i18n'
import { playNav, playTick } from '@/lib/sounds'
import { supabase } from '@/lib/supabase'
import { useCredits } from '@/lib/credits'
import { timeUntil, fmtScheduledTime } from '@/lib/schedulerService'
import type { ScheduledPost } from '@/lib/schedulerService'
import type { Page } from '@/components/Layout'
import {
  ACCENT as GOLD, ACCENT_L as GOLD_L, ACCENT_D as GOLD_D,
  TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR,
  BG_0 as BG, BG_1 as BG2, OK, ERR, SANS,
} from '@/lib/theme'

// ── SVG paths ──────────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  phone:    'M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z',
  send:     'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  zap:      'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  video:    'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
  chat:     'M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a1.994 1.994 0 0 1-1.414-.586m0 0L11 14h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v4',
  flame:    'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z',
  sparkles: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
  refresh:  'M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15',
  edit:     'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  link:     'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  check:    'M20 6 9 17l-5-5',
  x:        'M18 6 6 18M6 6l12 12',
  layers:   'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
}

function SvgIcon({ d, size = 16, color = 'currentColor', strokeWidth = 1.6 }: {
  d: string; size?: number; color?: string; strokeWidth?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// ── Animation CSS ──────────────────────────────────────────────────────────────
const HUB_CSS = `
  @keyframes hub-fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes hub-pulse-bg {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 0.9; }
  }
`
function useHubCSS() {
  useEffect(() => {
    const id = 'sf-hub-css'
    if (!document.getElementById(id)) {
      const el = document.createElement('style')
      el.id = id; el.textContent = HUB_CSS
      document.head.appendChild(el)
    }
  }, [])
}

// ── KPI card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, loading, accent, delay = 0 }: {
  label: string; value: string | number; icon: string
  loading?: boolean; accent?: boolean; delay?: number
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '18px 22px',
      background: BG2,
      border: `1px solid ${accent ? 'rgba(99,102,241,0.22)' : HAIR}`,
      borderRadius: 10,
      animation: `hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}s both`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: MUTED, fontFamily: SANS,
        }}>{label}</span>
        <span style={{ color: accent ? GOLD : 'rgba(233,234,240,0.18)' }}>
          <SvgIcon d={ICONS[icon]} size={15} color="currentColor" />
        </span>
      </div>
      {loading ? (
        <div style={{
          height: 26, width: 56, borderRadius: 5, background: HAIR,
          animation: 'hub-pulse-bg 1.4s ease-in-out infinite',
        }} />
      ) : (
        <p style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em',
          color: accent ? GOLD_L : IVORY, margin: 0, lineHeight: 1,
          fontFamily: SANS,
        }}>{value}</p>
      )}
    </div>
  )
}

// ── Quick-action button ────────────────────────────────────────────────────────
function QuickBtn({ label, icon, primary, onClick }: {
  label: string; icon: string; primary?: boolean; onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 9,
        padding: '11px 20px', borderRadius: 8, cursor: 'pointer',
        border: primary ? 'none' : `1px solid ${hover ? 'rgba(99,102,241,0.4)' : HAIR}`,
        background: primary
          ? (hover ? GOLD_D : GOLD)
          : (hover ? 'rgba(99,102,241,0.08)' : BG2),
        color: primary ? '#fff' : (hover ? GOLD_L : IVORY),
        fontFamily: SANS, fontSize: 13.5, fontWeight: 600,
        transition: 'all 0.18s',
      }}
    >
      <SvgIcon d={ICONS[icon]} size={15} color="currentColor" strokeWidth={2} />
      {label}
    </button>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const t = useT()
  const cfg: Record<string, { color: string; bg: string; label: string }> = {
    done:      { color: OK,        bg: 'rgba(52,211,153,0.1)',   label: t('hubStatusDone') },
    failed:    { color: ERR,       bg: 'rgba(248,113,113,0.1)',  label: t('hubStatusFailed') },
    pending:   { color: GOLD_L,    bg: 'rgba(99,102,241,0.12)',  label: t('hubStatusPending') },
    running:   { color: '#FBBF24', bg: 'rgba(251,191,36,0.1)',   label: t('hubStatusRunning') },
    cancelled: { color: MUTED,     bg: 'rgba(233,234,240,0.05)', label: t('hubStatusCancelled') },
  }
  const c = cfg[status] ?? cfg.cancelled
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4,
      color: c.color, background: c.bg, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  )
}

// ── Tool chip ──────────────────────────────────────────────────────────────────
function ToolChip({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={() => { playNav(); onClick() }}
      onMouseEnter={() => { setHover(true); playTick() }}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 15px', borderRadius: 7, cursor: 'pointer',
        border: `1px solid ${hover ? 'rgba(99,102,241,0.35)' : HAIR}`,
        background: hover ? 'rgba(99,102,241,0.07)' : 'transparent',
        color: hover ? GOLD_L : MUTED,
        fontFamily: SANS, fontSize: 12.5, fontWeight: 500,
        transition: 'all 0.16s', whiteSpace: 'nowrap',
      }}
    >
      <SvgIcon d={ICONS[icon]} size={13} color="currentColor" />
      {label}
    </button>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{
      padding: '16px 22px 14px',
      borderBottom: `1px solid ${HAIR}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, fontFamily: SANS }}>{title}</span>
      {action && onAction && (
        <button
          onClick={onAction}
          style={{
            fontSize: 11, color: GOLD, background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: SANS,
          }}
        >{action} →</button>
      )}
    </div>
  )
}

// ── Main Hub page ──────────────────────────────────────────────────────────────
export default function Hub({ user, onNavigate }: { user: User; onNavigate: (p: Page) => void }) {
  const t = useT()
  const { balance, loading: credLoading } = useCredits()
  useHubCSS()

  const [loading, setLoading] = useState(true)
  const [phoneCount, setPhoneCount]   = useState(0)
  const [videoCount, setVideoCount]   = useState(0)
  const [weekPosts,  setWeekPosts]    = useState(0)
  const [upcoming,   setUpcoming]     = useState<ScheduledPost[]>([])
  const [recent,     setRecent]       = useState<ScheduledPost[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [phonesRes, videosRes, weekRes, upcomingRes, recentRes] = await Promise.all([
      supabase.from('phones').select('id', { count: 'exact', head: true }),
      supabase.from('content_bank').select('id', { count: 'exact', head: true }),
      supabase.from('scheduled_posts')
        .select('id', { count: 'exact', head: true })
        .in('status', ['done', 'failed'])
        .gte('created_at', weekAgo),
      supabase.from('scheduled_posts')
        .select('*')
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(5),
      supabase.from('scheduled_posts')
        .select('*')
        .in('status', ['done', 'failed'])
        .order('executed_at', { ascending: false })
        .limit(5),
    ])
    setPhoneCount(phonesRes.count ?? 0)
    setVideoCount(videosRes.count ?? 0)
    setWeekPosts(weekRes.count ?? 0)
    setUpcoming((upcomingRes.data ?? []) as ScheduledPost[])
    setRecent((recentRes.data ?? []) as ScheduledPost[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Live refresh: any change to scheduled_posts (post done, new schedule…)
  // reloads the dashboard so KPIs and lists stay current.
  useEffect(() => {
    const ch = supabase.channel('hub-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_posts' }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const { lang } = useLang()
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const firstName = (user.email?.split('@')[0] ?? 'créateur').replace(/[._]/g, ' ')
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6)  return t('hubGreetingNight')
    if (h < 12) return t('hubGreetingMorning')
    if (h < 18) return t('hubGreetingAfternoon')
    return t('hubGreetingEvening')
  })().replace(/,\s*$/, '')
  const dateLabel = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })

  const TOOL_SHORTCUTS: { id: Page; label: string; icon: string }[] = [
    { id: 'phones',      label: t('navPhones'),      icon: 'phone' },
    { id: 'posting',     label: t('navPosting'),     icon: 'send' },
    { id: 'massposting', label: t('navMassPosting'), icon: 'zap' },
    { id: 'scheduler',   label: t('navScheduler'),   icon: 'calendar' },
    { id: 'bank',        label: t('navBank'),        icon: 'video' },
    { id: 'warmup',      label: t('navWarmup'),      icon: 'flame' },
    { id: 'repurpose',   label: t('navRepurpose'),   icon: 'refresh' },
    { id: 'remix',       label: t('navRemix'),       icon: 'layers' },
    { id: 'aitools',     label: t('navAiTools'),     icon: 'sparkles' },
    { id: 'storylink',   label: t('navStoryLink'),   icon: 'link' },
    { id: 'community',   label: t('navCommunity'),   icon: 'chat' },
  ]

  return (
    <div style={{ minHeight: '100%', background: BG, padding: '40px 48px 80px', boxSizing: 'border-box' }}>

      {/* subtle ambient glow */}
      <div style={{
        position: 'fixed', top: 0, left: '30%', width: 700, height: 300,
        background: 'radial-gradient(ellipse, rgba(99,102,241,0.04), transparent 65%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          marginBottom: 32,
          animation: 'hub-fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <div>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.09em',
              textTransform: 'uppercase', color: 'rgba(99,102,241,0.6)',
              margin: '0 0 5px', fontFamily: SANS,
            }}>{dateLabel}</p>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em',
              color: IVORY, fontFamily: SANS, lineHeight: 1.1,
            }}>
              {greeting},&nbsp;
              <span style={{ color: GOLD_L }}>{firstName}</span>
            </h1>
          </div>
          <button
            onClick={load}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${HAIR}`, background: 'transparent',
              color: MUTED, fontSize: 12, fontWeight: 500, fontFamily: SANS,
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.borderColor = 'rgba(99,102,241,0.3)'
              el.style.color = GOLD_L
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.borderColor = HAIR
              el.style.color = MUTED
            }}
          >
            <SvgIcon d={ICONS.refresh} size={13} color="currentColor" />
            {t('hubRefresh')}
          </button>
        </div>

        {/* ── KPI row ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard label={t('hubKpiPhones')}    value={loading ? '…' : phoneCount} icon="phone"    delay={0.05} />
          <KpiCard label={t('hubKpiVideos')}    value={loading ? '…' : videoCount} icon="video"    delay={0.10} />
          <KpiCard label={t('hubKpiWeekPosts')} value={loading ? '…' : weekPosts} icon="send"    delay={0.15} />
          <KpiCard label={t('hubKpiCredits')}   value={credLoading ? '…' : balance.toLocaleString(locale)}
                   icon="sparkles" accent delay={0.20} />
        </div>

        {/* ── Quick actions ──────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap',
          animation: 'hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.25s both',
        }}>
          <QuickBtn label="Mass Posting"  icon="zap"      primary onClick={() => { playNav(); onNavigate('massposting') }} />
          <QuickBtn label={t('hubQuickSchedule')} icon="calendar" onClick={() => { playNav(); onNavigate('scheduler') }} />
          <QuickBtn label={t('hubQuickBank')}     icon="video"    onClick={() => { playNav(); onNavigate('bank') }} />
          <QuickBtn label={t('hubKpiPhones')}     icon="phone"    onClick={() => { playNav(); onNavigate('phones') }} />
        </div>

        {/* ── Two-column: Upcoming + Recent ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>

          {/* Upcoming posts */}
          <div style={{
            background: BG2, border: `1px solid ${HAIR}`, borderRadius: 10, overflow: 'hidden',
            animation: 'hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.30s both',
          }}>
            <SectionHead title={t('hubUpcoming')} action={t('hubSeeAll')} onAction={() => { playNav(); onNavigate('scheduler') }} />
            {loading ? (
              <div style={{ padding: '24px 22px', color: FAINT, fontSize: 12, fontFamily: SANS }}>{t('hubLoading')}</div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: '32px 22px', textAlign: 'center' }}>
                <p style={{ color: FAINT, fontSize: 12.5, margin: '0 0 14px', fontFamily: SANS }}>{t('hubNoUpcoming')}</p>
                <button
                  onClick={() => { playNav(); onNavigate('scheduler') }}
                  style={{
                    fontSize: 12, padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
                    border: `1px solid rgba(99,102,241,0.35)`,
                    background: 'rgba(99,102,241,0.08)', color: GOLD_L,
                    fontWeight: 600, fontFamily: SANS,
                  }}
                >{t('hubSchedulePost')}</button>
              </div>
            ) : (
              upcoming.map((post, i) => {
                const phones = Array.isArray(post.phones) ? post.phones : []
                return (
                  <div key={post.id} style={{
                    padding: '12px 22px',
                    borderBottom: i < upcoming.length - 1 ? `1px solid ${HAIR}` : 'none',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: 'rgba(99,102,241,0.1)', border: `1px solid rgba(99,102,241,0.2)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <SvgIcon d={ICONS.calendar} size={15} color={GOLD} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: IVORY,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontFamily: SANS,
                      }}>
                        {phones.length} {t('hubAccounts')}
                        {post.caption ? ` · ${post.caption.slice(0, 38)}${post.caption.length > 38 ? '…' : ''}` : ''}
                      </p>
                      <p style={{ margin: 0, fontSize: 11.5, color: FAINT, fontFamily: SANS }}>
                        {fmtScheduledTime(post.scheduled_at)} · {timeUntil(post.scheduled_at)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Recent activity */}
          <div style={{
            background: BG2, border: `1px solid ${HAIR}`, borderRadius: 10, overflow: 'hidden',
            animation: 'hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.35s both',
          }}>
            <SectionHead title={t('hubActivity')} action={t('hubHistory')} onAction={() => { playNav(); onNavigate('scheduler') }} />
            {loading ? (
              <div style={{ padding: '24px 22px', color: FAINT, fontSize: 12, fontFamily: SANS }}>{t('hubLoading')}</div>
            ) : recent.length === 0 ? (
              <div style={{ padding: '32px 22px', textAlign: 'center' }}>
                <p style={{ color: FAINT, fontSize: 12.5, margin: 0, fontFamily: SANS }}>{t('hubNoActivity')}</p>
              </div>
            ) : (
              recent.map((post, i) => {
                const phones = Array.isArray(post.phones) ? post.phones : []
                const ok = post.status === 'done'
                return (
                  <div key={post.id} style={{
                    padding: '12px 22px',
                    borderBottom: i < recent.length - 1 ? `1px solid ${HAIR}` : 'none',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
                      border: `1px solid ${ok ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <SvgIcon d={ok ? ICONS.check : ICONS.x} size={14} color={ok ? '#34D399' : '#F87171'} strokeWidth={2.5} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: IVORY,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontFamily: SANS,
                      }}>
                        {phones.length} {t('hubAccounts')}
                        {post.caption ? ` · ${post.caption.slice(0, 38)}${post.caption.length > 38 ? '…' : ''}` : ''}
                      </p>
                      <p style={{ margin: 0, fontSize: 11.5, color: FAINT, fontFamily: SANS }}>
                        {fmtScheduledTime(post.executed_at ?? post.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Tool shortcuts ─────────────────────────────────────────────── */}
        <div style={{ animation: 'hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.4s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: FAINT, fontFamily: SANS,
            }}>{t('hubAllTools')}</span>
            <div style={{ flex: 1, height: 1, background: HAIR }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {TOOL_SHORTCUTS.map(tool => (
              <ToolChip
                key={tool.id}
                label={tool.label}
                icon={tool.icon}
                onClick={() => onNavigate(tool.id)}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
