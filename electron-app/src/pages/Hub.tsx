import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT, useLang } from '@/lib/i18n'
import { playNav, playTick } from '@/lib/sounds'
import { supabase } from '@/lib/supabase'
import { useCredits } from '@/lib/credits'
import { useOrg } from '@/lib/orgContext'
import { canSeeTab } from '@/lib/permissions'
import { useLicense, effectivePlan } from '@/lib/license'
import { timeUntil, fmtScheduledTime } from '@/lib/schedulerService'
import type { ScheduledPost } from '@/lib/schedulerService'
import type { Page } from '@/components/Layout'
import {
  ACCENT as GOLD,
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
  @keyframes hub-shimmer { 0%{background-position:-160% 0} 100%{background-position:260% 0} }
  @keyframes hub-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(34px,24px)} }
  @keyframes hub-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-28px,30px)} }
  @keyframes hub-line-grow { from{transform:scaleX(0)} to{transform:scaleX(1)} }
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
function KpiCard({ label, value, icon, loading, delay = 0, grad, glow, accentColor }: {
  label: string; value: string | number; icon: string
  loading?: boolean; delay?: number; grad: string; glow: string; accentColor: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, minWidth: 190,
        padding: 20, borderRadius: 16,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))',
        border: '1px solid rgba(255,255,255,0.08)',
        animation: `hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}s both`,
        transform: hover ? 'translateY(-4px)' : 'none',
        boxShadow: hover
          ? `0 26px 54px -26px ${glow}, inset 0 1px 0 0 rgba(255,255,255,0.1)`
          : 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 8px 26px -18px rgba(0,0,0,0.6)',
        transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s',
        position: 'relative', overflow: 'hidden', isolation: 'isolate',
      }}
    >
      <div aria-hidden style={{ position: 'absolute', top: -40, right: -30, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, ${glow}, transparent 68%)`, opacity: hover ? 0.55 : 0.28, transition: 'opacity 0.3s', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: MUTED, fontFamily: SANS,
        }}>{label}</span>
        <span style={{
          width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', background: grad, boxShadow: `0 8px 20px -8px ${glow}, inset 0 1px 0 0 rgba(255,255,255,0.35)`,
          transform: hover ? 'scale(1.08) rotate(-4deg)' : 'none', transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <SvgIcon d={ICONS[icon]} size={16} color="currentColor" strokeWidth={2} />
        </span>
      </div>
      {loading ? (
        <div style={{
          height: 30, width: 60, borderRadius: 6, background: HAIR,
          animation: 'hub-pulse-bg 1.4s ease-in-out infinite',
        }} />
      ) : (
        <p style={{
          position: 'relative', zIndex: 1,
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.035em',
          color: accentColor, margin: 0, lineHeight: 1,
          fontFamily: SANS, fontVariantNumeric: 'tabular-nums',
        }}>{value}</p>
      )}
    </div>
  )
}

// ── Quick-action button ────────────────────────────────────────────────────────
function QuickBtn({ label, icon, primary, onClick }: {
  label: string; icon: string; primary?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => playTick()}
      className={primary ? 'sf-btn sf-btn-primary' : 'sf-btn sf-btn-secondary'}
      style={{ fontSize: 13, gap: 8, height: 38, padding: '0 18px' }}
    >
      <SvgIcon d={ICONS[icon]} size={14} color="currentColor" strokeWidth={2} />
      {label}
    </button>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const t = useT()
  const cfg: Record<string, { variant: string; label: string }> = {
    done:      { variant: 'ok',     label: t('hubStatusDone') },
    failed:    { variant: 'danger', label: t('hubStatusFailed') },
    pending:   { variant: 'accent', label: t('hubStatusPending') },
    running:   { variant: 'warn',   label: t('hubStatusRunning') },
    cancelled: { variant: 'muted',  label: t('hubStatusCancelled') },
  }
  const c = cfg[status] ?? cfg.cancelled
  return (
    <span className={`sf-badge sf-badge-${c.variant}`} style={{ whiteSpace: 'nowrap' }}>{c.label}</span>
  )
}

// ── Tool chip ──────────────────────────────────────────────────────────────────
function ToolChip({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={() => { playNav(); onClick() }}
      onMouseEnter={() => playTick()}
      className="sf-btn sf-btn-ghost"
      style={{ fontSize: 12.5, height: 32, gap: 7, padding: '0 13px', fontWeight: 500 }}
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
      padding: '16px 20px',
      borderBottom: `1px solid ${HAIR}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: IVORY, fontFamily: SANS }}>{title}</span>
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
  const { currentOrg, role, perms } = useOrg()
  const license = useLicense()
  useHubCSS()

  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [phoneCount, setPhoneCount]   = useState(0)
  const [videoCount, setVideoCount]   = useState(0)
  const [weekPosts,  setWeekPosts]    = useState(0)
  const [upcoming,   setUpcoming]     = useState<ScheduledPost[]>([])
  const [recent,     setRecent]       = useState<Array<{ kind: 'scheduled'; data: ScheduledPost } | { kind: 'run'; data: { id: string; type: string; ok_count: number; err_count: number; total: number; created_at: string } }>>([])


  const load = useCallback(async () => {
    setLoading(true)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const phonesQ = currentOrg
      ? supabase.from('phones').select('id', { count: 'exact', head: true }).eq('org_id', currentOrg.id)
      : supabase.from('phones').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('org_id', null)
    const bankQ = currentOrg
      ? supabase.from('content_bank').select('id', { count: 'exact', head: true }).eq('org_id', currentOrg.id)
      : supabase.from('content_bank').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('org_id', null)
    const spQ  = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const prQ  = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [phonesRes, videosRes, weekRes, runsRes, upcomingRes, recentRes, directRunsRes] = await Promise.all([
      phonesQ,
      bankQ,
      spQ(supabase.from('scheduled_posts').select('id', { count: 'exact', head: true }))
        .in('status', ['done', 'failed'])
        .gte('created_at', weekAgo),
      // Runs directs (Posting / Mass Posting) — chaque ligne porte son ok_count
      prQ(supabase.from('post_runs').select('ok_count'))
        .gte('created_at', weekAgo),
      spQ(supabase.from('scheduled_posts').select('*'))
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(5),
      spQ(supabase.from('scheduled_posts').select('*'))
        .in('status', ['done', 'failed'])
        .order('executed_at', { ascending: false })
        .limit(8),
      // Recent direct runs (for activity feed)
      prQ(supabase.from('post_runs').select('*'))
        .order('created_at', { ascending: false })
        .limit(8),
    ])
    setPhoneCount(phonesRes.count ?? 0)
    setVideoCount(videosRes.count ?? 0)
    const runPosts = ((runsRes.data ?? []) as Array<{ ok_count: number | null }>)
      .reduce((sum, r) => sum + (r.ok_count ?? 0), 0)
    setWeekPosts((weekRes.count ?? 0) + runPosts)
    setUpcoming((upcomingRes.data ?? []) as ScheduledPost[])

    // Merge scheduled posts + direct runs, sort by date, keep 5 most recent
    const recentScheduled = ((recentRes.data ?? []) as ScheduledPost[]).map(d => ({ kind: 'scheduled' as const, data: d, _date: d.executed_at ?? d.created_at ?? '' }))
    const recentRuns      = ((directRunsRes?.data ?? []) as Array<{ id: string; type: string; ok_count: number; err_count: number; total: number; created_at: string }>).map(d => ({ kind: 'run' as const, data: d, _date: d.created_at }))
    const merged = [...recentScheduled, ...recentRuns].sort((a, b) => b._date.localeCompare(a._date)).slice(0, 5)
    setRecent(merged.map(({ kind, data }) => ({ kind, data } as typeof merged[number])))
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.display_name) setDisplayName(data.display_name) })
  }, [user.id])

  // Live refresh: any change to scheduled_posts (post done, new schedule…)
  // reloads the dashboard so KPIs and lists stay current.
  useEffect(() => {
    // Debounce 1,5 s : des updates Realtime rapprochés (run en cours) ne
    // déclenchent qu'un seul reload — évite le re-jeu des animations KPI.
    let t: ReturnType<typeof setTimeout> | null = null
    const ch = supabase.channel('hub-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_posts' }, () => {
        if (t) clearTimeout(t)
        t = setTimeout(load, 1_500)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_runs' }, () => {
        if (t) clearTimeout(t)
        t = setTimeout(load, 1_500)
      })
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
  }, [load])

  const { lang } = useLang()
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const firstName = displayName ?? (user.email?.split('@')[0] ?? 'créateur').replace(/[._]/g, ' ')
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6)  return t('hubGreetingNight')
    if (h < 12) return t('hubGreetingMorning')
    if (h < 18) return t('hubGreetingAfternoon')
    return t('hubGreetingEvening')
  })().replace(/,\s*$/, '')
  const dateLabel = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })

  const isSuperAdmin = license?.isSuperAdmin === true
  // Création de contenu réservée à partir de Pro (cf. Layout).
  const planNow = effectivePlan(license)
  const hasContentCreation = isSuperAdmin || planNow === 'pro' || planNow === 'organisation'
  const CONTENT_CREATION_IDS = new Set(['remix', 'spoof', 'subtitles', 'mixer', 'montage', 'aitools'])
  const allToolShortcuts: { id: Page; label: string; icon: string; superAdminOnly?: boolean; dev?: boolean }[] = [
    { id: 'phones',      label: t('navPhones'),      icon: 'phone' },
    { id: 'posting',     label: t('navPosting'),     icon: 'send' },
    { id: 'massposting', label: t('navMassPosting'), icon: 'zap' },
    { id: 'scheduler',   label: t('navScheduler'),   icon: 'calendar' },
    { id: 'bank',        label: t('navBank'),        icon: 'video' },
    { id: 'warmup',      label: t('navWarmup'),      icon: 'flame',    dev: true },
    { id: 'remix',       label: t('navRemix'),       icon: 'layers' },
    { id: 'aitools',     label: t('navAiTools'),     icon: 'sparkles' },
    { id: 'storylink',   label: t('navStoryLink'),   icon: 'link' },
  ]
  const TOOL_SHORTCUTS = allToolShortcuts.filter(tool => {
    if (tool.superAdminOnly && !isSuperAdmin) return false
    if (tool.dev && !isSuperAdmin) return false
    if (tool.id === 'licences') return false
    if (CONTENT_CREATION_IDS.has(tool.id) && !hasContentCreation) return false
    if (role && !canSeeTab(role, perms, tool.id as import('@/lib/supabase').PageKey)) return false
    return true
  })

  return (
    <div style={{ minHeight: '100%', background: BG, padding: '28px 28px 80px', boxSizing: 'border-box' }}>

      {/* ambient animated glows */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: -120, left: '18%', width: 560, height: 420,
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.13), transparent 66%)',
          filter: 'blur(70px)', animation: 'hub-float-a 20s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', top: 40, right: '6%', width: 460, height: 380,
          background: 'radial-gradient(ellipse, rgba(16,185,129,0.09), transparent 68%)',
          filter: 'blur(72px)', animation: 'hub-float-b 24s ease-in-out infinite',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          gap: 10, marginBottom: 24,
          animation: 'hub-fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <div>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', color: 'rgba(99,102,241,0.6)',
              margin: '0 0 6px', fontFamily: SANS,
            }}>{dateLabel}</p>
            <h1 style={{
              margin: 0, fontSize: 34, fontWeight: 900, letterSpacing: '-0.045em',
              color: IVORY, fontFamily: SANS, lineHeight: 1.02,
            }}>
              {greeting},&nbsp;
              <span style={{
                background: 'linear-gradient(100deg,#818CF8 10%,#c4b5fd 50%,#6ee7b7 90%)',
                backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text', animation: 'hub-shimmer 6s linear infinite',
              }}>{firstName}</span>
            </h1>
          </div>
          <button
            onClick={load}
            className="sf-btn sf-btn-secondary sf-btn-sm"
            style={{ gap: 7 }}
          >
            <SvgIcon d={ICONS.refresh} size={13} color="currentColor" />
            {t('hubRefresh')}
          </button>
        </div>

        {/* ── KPI row ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard label={t('hubKpiPhones')}    value={loading ? '…' : phoneCount} icon="phone" delay={0.05}
                   grad="linear-gradient(135deg,#6366F1,#8B5CF6)" glow="rgba(99,102,241,0.5)"  accentColor="#fff" />
          <KpiCard label={t('hubKpiVideos')}    value={loading ? '…' : videoCount} icon="video" delay={0.10}
                   grad="linear-gradient(135deg,#EC4899,#8B5CF6)" glow="rgba(236,72,153,0.5)"  accentColor="#fff" />
          <KpiCard label={t('hubKpiWeekPosts')} value={loading ? '…' : weekPosts} icon="send" delay={0.15}
                   grad="linear-gradient(135deg,#10B981,#059669)" glow="rgba(16,185,129,0.5)"  accentColor="#fff" />
          <KpiCard label={t('hubKpiCredits')}   value={credLoading ? '…' : balance.toLocaleString(locale)} icon="sparkles" delay={0.20}
                   grad="linear-gradient(135deg,#F59E0B,#EF4444)" glow="rgba(245,158,11,0.5)"  accentColor="#FBBF24" />
        </div>

        {/* ── Quick actions ──────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap',
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
          <div className="sf-card" style={{
            padding: 0, borderRadius: 12, overflow: 'hidden',
            animation: 'hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.30s both',
          }}>
            <SectionHead title={t('hubUpcoming')} action={t('hubSeeAll')} onAction={() => { playNav(); onNavigate('scheduler') }} />
            {loading ? (
              <div style={{ padding: '24px 20px', color: FAINT, fontSize: 13, fontFamily: SANS }}>{t('hubLoading')}</div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <span style={{ color: 'rgba(233,234,240,0.18)' }}>
                  <SvgIcon d={ICONS.calendar} size={26} color="currentColor" strokeWidth={1.4} />
                </span>
                <p style={{ color: FAINT, fontSize: 12.5, margin: 0, fontFamily: SANS }}>{t('hubNoUpcoming')}</p>
                <button
                  onClick={() => { playNav(); onNavigate('scheduler') }}
                  className="sf-btn sf-btn-secondary sf-btn-sm"
                >{t('hubSchedulePost')}</button>
              </div>
            ) : (
              upcoming.map((post, i) => {
                const phones = Array.isArray(post.phones) ? post.phones : []
                return (
                  <div key={post.id} style={{
                    padding: '12px 20px',
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
                        fontFamily: SANS, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {phones.length} {t('hubAccounts')}
                        {post.caption ? ` · ${post.caption.slice(0, 38)}${post.caption.length > 38 ? '…' : ''}` : ''}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: FAINT, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtScheduledTime(post.scheduled_at)} · {timeUntil(post.scheduled_at)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Recent activity */}
          <div className="sf-card" style={{
            padding: 0, borderRadius: 12, overflow: 'hidden',
            animation: 'hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.35s both',
          }}>
            <SectionHead title={t('hubActivity')} action={t('hubHistory')} onAction={() => { playNav(); onNavigate('history') }} />
            {loading ? (
              <div style={{ padding: '24px 20px', color: FAINT, fontSize: 13, fontFamily: SANS }}>{t('hubLoading')}</div>
            ) : recent.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <span style={{ color: 'rgba(233,234,240,0.18)' }}>
                  <SvgIcon d={ICONS.layers} size={26} color="currentColor" strokeWidth={1.4} />
                </span>
                <p style={{ color: FAINT, fontSize: 12.5, margin: 0, fontFamily: SANS }}>{t('hubNoActivity')}</p>
              </div>
            ) : (
              recent.map((item, i) => {
                const ok = item.kind === 'scheduled' ? item.data.status === 'done' : item.data.err_count === 0
                const label = item.kind === 'scheduled'
                  ? (() => {
                      const phones = Array.isArray(item.data.phones) ? item.data.phones : []
                      return `${phones.length} ${t('hubAccounts')}${item.data.caption ? ` · ${item.data.caption.slice(0, 34)}${item.data.caption.length > 34 ? '…' : ''}` : ''}`
                    })()
                  : `${item.data.ok_count}/${item.data.total} compte${item.data.total > 1 ? 's' : ''} · Direct`
                const date = item.kind === 'scheduled'
                  ? fmtScheduledTime(item.data.executed_at ?? item.data.created_at)
                  : fmtScheduledTime(item.data.created_at)
                const status = item.kind === 'scheduled' ? item.data.status : (ok ? 'done' : 'failed')
                const key = item.kind === 'scheduled' ? `sp-${item.data.id}` : `pr-${item.data.id}`
                return (
                  <div key={key} style={{
                    padding: '12px 20px',
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
                        fontFamily: SANS, fontVariantNumeric: 'tabular-nums',
                      }}>{label}</p>
                      <p style={{ margin: 0, fontSize: 12, color: FAINT, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{date}</p>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                )
              })
            )}
          </div>

          {/* Filet bas de hero */}
          <div style={{ height: 1, background: HAIR, margin: '52px 0 0', transformOrigin: 'left', animation: 'hub-line-grow 1s cubic-bezier(0.16,1,0.3,1) 0.3s both' }} />
        </div>

        {/* ── Tool shortcuts ─────────────────────────────────────────────── */}
        <div style={{ animation: 'hub-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.4s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', color: MUTED, fontFamily: SANS,
            }}>{t('hubAllTools')}</span>
            <div style={{ flex: 1, height: 1, background: HAIR }} />
          </div>
          <div className="anim-stagger" style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
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
