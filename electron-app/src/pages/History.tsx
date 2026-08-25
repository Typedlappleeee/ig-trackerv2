import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { canManageOrg } from '@/lib/permissions'
import { createScheduledPost } from '@/lib/schedulerService'
import { useToast } from '@/components/Toast'
import { fmtScheduledTime } from '@/lib/schedulerService'
import type { ScheduledPost } from '@/lib/schedulerService'
import type { Page } from '@/components/Layout'
import { getActiveRuns, subscribeActiveRuns, type ActiveRun } from '@/lib/activeRuns'
import { useTr } from '@/lib/i18n'
import {
  TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR,
  BG_0 as BG, BG_2 as BG2, OK, ERR, SANS,
} from '@/lib/theme'

interface PhoneResult { name: string; ok: boolean; error?: string }

interface PostRun {
  id: string
  type: string
  ok_count: number
  err_count: number
  total: number
  created_at: string
  user_id: string
  org_id: string | null
  phone_results?: PhoneResult[]
}

// Détail générique affiché dans la fenêtre (programmé ou direct).
interface DetailView {
  typeLabel: string
  dateIso:   string
  results:   PhoneResult[]
  fallbackNames: string[]
  kind:      'scheduled' | 'run'
  status?:   string
  caption?:  string
  videosCount?: number
  accountsCount?: number
  createdIso?:  string
}

type HistoryItem =
  | { kind: 'scheduled'; data: ScheduledPost }
  | { kind: 'run';       data: PostRun }

function itemDate(it: HistoryItem): string {
  if (it.kind === 'scheduled') return it.data.executed_at ?? it.data.created_at ?? ''
  return it.data.created_at
}

// Statut « réussi » unifié (programmé = done ; direct = aucun échec).
function itemOk(it: HistoryItem): boolean {
  if (it.kind === 'scheduled') return it.data.status === 'done'
  return it.data.err_count === 0
}

// Texte cherchable : type + légende + noms de comptes.
function itemSearchText(it: HistoryItem): string {
  if (it.kind === 'scheduled') {
    const phones = Array.isArray(it.data.phones) ? it.data.phones : []
    return [
      TYPE_LABELS[it.data.type ?? ''] ?? 'Post',
      it.data.caption ?? '',
      ...phones.map(p => `${p.ig_username ?? ''} ${p.phone_name ?? ''}`),
    ].join(' ').toLowerCase()
  }
  return [TYPE_LABELS[it.data.type ?? ''] ?? 'Post', 'direct'].join(' ').toLowerCase()
}

const TYPE_LABELS: Record<string, string> = {
  mass_posting: 'Mass Posting',
  posting:      'Posting',
  story:        'Story',
  mass_story:   'Mass Story',
  tiktok:       'TikTok',
  warmup:       'Warmup',
}

function StatusPill({ status }: { status: string }) {
  const tr = useTr()
  const ok  = status === 'done'
  const err = status === 'failed'
  const partial = status === 'partial'
  const pending = status === 'pending' || status === 'running'
  if (partial) {
    return <span className="sf-badge" style={{ whiteSpace: 'nowrap', background: 'rgba(251,191,36,0.14)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.3)' }}>{tr('PARTIEL', 'PARTIAL')}</span>
  }
  const variant = ok ? 'ok' : err ? 'danger' : pending ? 'accent' : 'muted'
  const label = ok ? tr('PUBLIÉ', 'PUBLISHED') : err ? tr('ÉCHEC', 'FAILED') : pending ? tr('EN COURS', 'IN PROGRESS') : status.toUpperCase()
  return (
    <span className={`sf-badge sf-badge-${variant}`} style={{ whiteSpace: 'nowrap' }}>{label}</span>
  )
}

function IconBox({ ok }: { ok: boolean }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      background: ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
      border: `1px solid ${ok ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {ok
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={OK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ERR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      }
    </div>
  )
}

const PAGE_SIZE = 30

export function History({ user, onNavigate }: { user: User; onNavigate?: (p: Page) => void }) {
  const { currentOrg, role } = useOrg()
  const tr = useTr()
  const toast = useToast()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; post: ScheduledPost } | null>(null)
  const [duplicating, setDuplicating] = useState(false)
  const [items,     setItems]   = useState<HistoryItem[]>([])
  const [loading,   setLoading] = useState(true)
  const [hasMore,   setHasMore] = useState(false)
  const [page,      setPage]    = useState(0)
  const [filter,    setFilter]  = useState<'all' | 'scheduled' | 'direct'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'failed'>('all')
  const [search,    setSearch]  = useState('')
  const [confirming, setConfirming] = useState(false)
  const [clearing,   setClearing]   = useState(false)
  const [detail,     setDetail]     = useState<DetailView | null>(null)

  // Solo users own their personal data; in an org only owner/admin can wipe.
  const canClear = role === null || canManageOrg(role)

  const load = useCallback(async (pageIdx: number, reset: boolean) => {
    setLoading(true)
    const from = pageIdx * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    const baseQ = currentOrg
      ? (table: string) => supabase.from(table).select('*').eq('org_id', currentOrg.id)
      : (table: string) => supabase.from(table).select('*').eq('user_id', user.id).is('org_id', null)

    const results: HistoryItem[] = []

    if (filter !== 'direct') {
      const { data: sp } = await baseQ('scheduled_posts')
        .in('status', ['pending', 'running', 'done', 'failed', 'cancelled'])
        .order('executed_at', { ascending: false })
        .range(from, to)
      for (const row of (sp ?? []) as ScheduledPost[]) {
        results.push({ kind: 'scheduled', data: row })
      }
    }

    if (filter !== 'scheduled') {
      const { data: pr } = await baseQ('post_runs')
        .order('created_at', { ascending: false })
        .range(from, to)
      for (const row of (pr ?? []) as PostRun[]) {
        results.push({ kind: 'run', data: row })
      }
    }

    // Merge and re-sort by date descending
    results.sort((a, b) => itemDate(b).localeCompare(itemDate(a)))
    const page_items = results.slice(0, PAGE_SIZE)

    setItems(prev => reset ? page_items : [...prev, ...page_items])
    setHasMore(results.length > PAGE_SIZE || page_items.length === PAGE_SIZE)
    setLoading(false)
  }, [currentOrg?.id, user.id, filter])

  useEffect(() => {
    setPage(0)
    load(0, true)
  }, [filter, currentOrg?.id])

  // Rafraîchit tant qu'un post serveur est en cours (pending/running) → l'avancement
  // se met à jour tout seul sans recharger la page.
  const hasInProgress = items.some(it => it.kind === 'scheduled' && (it.data.status === 'pending' || it.data.status === 'running'))
  useEffect(() => {
    if (!hasInProgress) return
    const t = setInterval(() => load(0, true), 20_000)
    return () => clearInterval(t)
  }, [hasInProgress, load])

  function loadMore() {
    const next = page + 1
    setPage(next)
    load(next, false)
  }

  // Annule un post en attente / bloqué (le sort du « en cours » et l'empêche de
  // repartir plus tard). Utile pour dégager un post serveur figé.
  async function cancelPost(post: ScheduledPost) {
    setCtxMenu(null)
    await supabase.from('scheduled_posts').update({ status: 'cancelled', error_msg: tr('Annulé manuellement', 'Cancelled manually') }).eq('id', post.id)
    load(0, true)
  }

  // Duplique un post programmé : recrée la même config (téléphones, vidéos,
  // légende) dans un NOUVEAU post en attente, programmé dans ~1h.
  async function duplicatePost(post: ScheduledPost) {
    setDuplicating(true)
    try {
      await createScheduledPost({
        userId:        user.id,
        orgId:         post.org_id,
        createdByName: post.created_by_name || (user.email ?? tr('Moi', 'Me')),
        type:          post.type,
        scheduledAt:   new Date(Date.now() + 60 * 60 * 1000),
        phones:        post.phones,
        videos:        post.videos,
        caption:       post.caption,
        delayMinutes:  post.delay_minutes,
        mode:          post.mode,
        bearerToken:   '',
        reelsTrial:    post.reels_trial,
        platform:      post.platform,
      })
      toast.show({ title: tr('Post dupliqué ✓', 'Post duplicated ✓'), body: tr('Nouveau post programmé dans ~1h — ajuste l\'heure dans Programmation (Calendrier).', 'New post scheduled in ~1h — adjust the time in Scheduling (Calendar).'), kind: 'ok' })
    } catch (e) {
      toast.show({ title: tr('Duplication échouée', 'Duplication failed'), body: e instanceof Error ? e.message : String(e), kind: 'error' })
    } finally {
      setDuplicating(false)
      setCtxMenu(null)
    }
  }

  async function clearHistory() {
    setClearing(true)
    try {
      const scoped = (table: string) => {
        const q = supabase.from(table).delete()
        return currentOrg
          ? q.eq('org_id', currentOrg.id)
          : q.eq('user_id', user.id).is('org_id', null)
      }

      // Only finished scheduled posts — keep pending/running ones intact.
      await scoped('scheduled_posts').in('status', ['done', 'failed', 'cancelled'])
      await scoped('post_runs')

      setItems([])
      setHasMore(false)
      setConfirming(false)
      setPage(0)
      load(0, true)
    } catch (e) {
      console.error('[History] clear failed:', e)
    } finally {
      setClearing(false)
    }
  }

  const filterBtn = (f: typeof filter, label: string) => (
    <button
      className={`sf-segment-item${filter === f ? ' is-active' : ''}`}
      onClick={() => setFilter(f)}
    >{label}</button>
  )

  const statusBtn = (f: typeof statusFilter, label: string, dot?: string) => (
    <button
      className={`sf-segment-item${statusFilter === f ? ' is-active' : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      onClick={() => setStatusFilter(f)}
    >{dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />}{label}</button>
  )

  // Filtres client sur les entrées chargées (recherche + statut).
  const q = search.trim().toLowerCase()
  const visible = items.filter(it => {
    if (statusFilter === 'ok' && !itemOk(it)) return false
    if (statusFilter === 'failed' && itemOk(it)) return false
    if (q && !itemSearchText(it).includes(q)) return false
    return true
  })
  const okCount = items.filter(itemOk).length
  const successRate = items.length ? Math.round((okCount / items.length) * 100) : 0

  return (
    <div style={{ minHeight: '100%', background: BG, padding: '24px 28px 80px', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div className="sf-page-header">
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" style={{ ['--icon-grad' as string]: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
            </svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad">{tr('Historique', 'History')}</h1>
            <p className="sf-page-sub">{tr('Tous vos posts — programmés et directs', 'All your posts — scheduled and direct')}</p>
          </div>
        </div>

        {canClear && items.length > 0 && !confirming && (
          <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
            <button className="sf-btn sf-btn-secondary sf-btn-sm" onClick={() => setConfirming(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              {tr("Vider l'historique", 'Clear history')}
            </button>
          </div>
        )}
      </div>

      {canClear && items.length > 0 && confirming && (
        <div className="sf-banner is-danger sf-anim-slide-up" style={{ marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{tr("Effacer tout l'historique ? Cette action est irréversible.", 'Clear the entire history? This action cannot be undone.')}</span>
          <div className="sf-banner-action" style={{ display: 'flex', gap: 8 }}>
            <button className="sf-btn sf-btn-danger sf-btn-sm" onClick={clearHistory} disabled={clearing}>
              {clearing && <span className="sf-spinner" style={{ width: 12, height: 12 }} />}
              {clearing ? tr('Suppression…', 'Deleting…') : tr('Oui, effacer', 'Yes, clear')}
            </button>
            <button className="sf-btn sf-btn-ghost sf-btn-sm" onClick={() => setConfirming(false)} disabled={clearing}>{tr('Annuler', 'Cancel')}</button>
          </div>
        </div>
      )}

      {/* Postings en cours (live) */}
      <ActiveRunsSection onNavigate={onNavigate} />

      {/* Filters: source tabs + status + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="sf-segment">
          {filterBtn('all', tr('Tout', 'All'))}
          {filterBtn('scheduled', tr('Programmé', 'Scheduled'))}
          {filterBtn('direct', tr('Direct', 'Direct'))}
        </div>
        <div className="sf-segment">
          {statusBtn('all', tr('Tous statuts', 'All statuses'))}
          {statusBtn('ok', tr('Publiés', 'Published'), OK)}
          {statusBtn('failed', tr('Échecs', 'Failures'), ERR)}
        </div>
        <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 220, flex: '1 1 220px', maxWidth: 320 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            className="sf-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tr('Rechercher (compte, légende, type)…', 'Search (account, caption, type)…')}
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 32 }}
          />
        </div>
      </div>

      {/* Résumé santé — sur les entrées chargées */}
      {items.length > 0 && (() => {
        const rateColor = successRate >= 90 ? OK : successRate >= 60 ? '#FBBF24' : ERR
        const failures = items.length - okCount
        const statCard = (value: string | number, label: string, accent: string) => (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 11,
            padding: '10px 16px 10px 12px', borderRadius: 13,
            background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
            border: `1px solid ${HAIR}`,
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
          }}>
            <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: accent, opacity: 0.85 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontFamily: "'Space Grotesk', 'Manrope', sans-serif", fontSize: 21, fontWeight: 700, color: accent, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
            </div>
          </div>
        )
        return (
          <div className="sf-anim-slide-up" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 16px', fontFamily: SANS }}>
            {statCard(items.length, tr(items.length > 1 ? 'entrées' : 'entrée', items.length > 1 ? 'entries' : 'entry'), IVORY)}
            {statCard(`${successRate}%`, tr('réussite', 'success rate'), rateColor)}
            {failures > 0 && statCard(failures, tr(failures > 1 ? 'échecs' : 'échec', failures > 1 ? 'failures' : 'failure'), ERR)}
          </div>
        )
      })()}

      {/* List */}
      <div className="sf-card sf-anim-slide-up" style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 14, overflow: 'hidden', padding: 0 }}>
        {loading && items.length === 0 ? (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ padding: '14px 20px', borderBottom: i < 5 ? `1px solid ${HAIR}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="sf-skeleton" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div className="sf-skeleton sf-skeleton-text" style={{ width: `${55 + (i % 3) * 12}%` }} />
                  <div className="sf-skeleton sf-skeleton-text" style={{ width: `${32 + (i % 4) * 8}%`, height: 10 }} />
                </div>
                <div className="sf-skeleton" style={{ width: 64, height: 20, borderRadius: 7, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        ) : items.length > 0 && visible.length === 0 ? (
          <div className="sf-empty" style={{ padding: '48px 24px' }}>
            <div className="sf-empty-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <p className="sf-empty-title">{tr('Aucun résultat', 'No results')}</p>
            <p className="sf-empty-desc">{tr('Aucune entrée ne correspond à ces filtres.', 'No entry matches these filters.')}</p>
            <button className="sf-btn sf-btn-secondary sf-btn-sm" style={{ marginTop: 6 }} onClick={() => { setSearch(''); setStatusFilter('all') }}>{tr('Réinitialiser les filtres', 'Reset filters')}</button>
          </div>
        ) : items.length === 0 ? (
          <div className="sf-empty" style={{ padding: '56px 24px' }}>
            <div className="sf-empty-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
              </svg>
            </div>
            <p className="sf-empty-title">{tr("Aucun historique pour l'instant", 'No history yet')}</p>
            <p className="sf-empty-desc">{tr('Vos posts programmés et directs apparaîtront ici.', 'Your scheduled and direct posts will appear here.')}</p>
            {onNavigate && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="sf-btn sf-btn-primary sf-btn-sm" onClick={() => onNavigate('publishhub')}>{tr('Publier maintenant', 'Publish now')}</button>
                <button className="sf-btn sf-btn-secondary sf-btn-sm" onClick={() => onNavigate('scheduler')}>{tr('Programmer un post', 'Schedule a post')}</button>
              </div>
            )}
          </div>
        ) : (
          visible.map((item, i) => {
            if (item.kind === 'scheduled') {
              const post = item.data
              const phones = Array.isArray(post.phones) ? post.phones : []
              const ok = post.status === 'done'
              const typeLabel = TYPE_LABELS[post.type ?? ''] ?? 'Post'
              const prCount = post.result?.phone_results?.length ?? 0
              const openScheduled = () => setDetail({
                typeLabel,
                dateIso: post.executed_at ?? post.created_at,
                results: post.result?.phone_results ?? [],
                fallbackNames: phones.map(p => p.ig_username ?? p.phone_name),
                kind: 'scheduled',
                status: post.status,
                caption: post.caption ?? undefined,
                videosCount: Array.isArray(post.videos) ? post.videos.length : undefined,
                accountsCount: phones.length,
                createdIso: post.created_at,
              })
              return (
                <div key={`sp-${post.id}`}
                  onClick={openScheduled}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, post }) }}
                  style={{
                  padding: '14px 20px',
                  borderBottom: i < visible.length - 1 ? `1px solid ${HAIR}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <IconBox ok={ok} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: IVORY,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: SANS,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {phones.length} {tr(phones.length > 1 ? 'comptes' : 'compte', phones.length > 1 ? 'accounts' : 'account')}
                      {post.caption ? ` · ${post.caption.slice(0, 50)}${post.caption.length > 50 ? '…' : ''}` : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 11.5, color: MUTED, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
                      {typeLabel} · {tr('Programmé', 'Scheduled')} · {fmtScheduledTime(post.executed_at ?? post.created_at)}
                      {prCount > 0 ? tr(' · détail par compte ›', ' · per-account detail ›') : ''}
                    </p>
                  </div>
                  <StatusPill status={post.status} />
                </div>
              )
            } else {
              const run = item.data
              const ok = run.err_count === 0
              const typeLabel = TYPE_LABELS[run.type] ?? run.type
              const runResults = run.phone_results ?? []
              const openRun = () => setDetail({
                typeLabel, dateIso: run.created_at, results: runResults, fallbackNames: [],
                kind: 'run', status: run.err_count === 0 ? 'done' : 'failed',
                accountsCount: run.total,
              })
              return (
                <div key={`pr-${run.id}`} onClick={openRun} style={{
                  padding: '14px 20px',
                  borderBottom: i < visible.length - 1 ? `1px solid ${HAIR}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <IconBox ok={ok} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: IVORY, fontFamily: SANS,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {run.ok_count}/{run.total} {tr(run.total > 1 ? 'comptes' : 'compte', run.total > 1 ? 'accounts' : 'account')}
                      {run.err_count > 0 ? tr(` · ${run.err_count} échec${run.err_count > 1 ? 's' : ''}`, ` · ${run.err_count} failure${run.err_count > 1 ? 's' : ''}`) : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 11.5, color: MUTED, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
                      {typeLabel} · {tr('Direct', 'Direct')} · {fmtScheduledTime(run.created_at)}
                      {runResults.length > 0 ? tr(' · détail par compte ›', ' · per-account detail ›') : ''}
                    </p>
                  </div>
                  <StatusPill status={ok ? 'done' : run.ok_count > 0 ? 'partial' : 'failed'} />
                </div>
              )
            }
          })
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div style={{ padding: '14px 20px', borderTop: `1px solid ${HAIR}`, textAlign: 'center' }}>
            <button className="sf-btn sf-btn-ghost sf-btn-sm" onClick={loadMore}>{tr('Charger plus', 'Load more')}</button>
          </div>
        )}

        {loading && items.length > 0 && (
          <div style={{ padding: '14px 20px', textAlign: 'center', color: MUTED, fontSize: 12, fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span className="sf-spinner" style={{ width: 13, height: 13 }} />
            {tr('Chargement…', 'Loading…')}
          </div>
        )}
      </div>

      <p style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: FAINT, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
        {(q || statusFilter !== 'all')
          ? tr(`${visible.length} sur ${items.length} entrée${items.length > 1 ? 's' : ''}`, `${visible.length} of ${items.length} entr${items.length > 1 ? 'ies' : 'y'}`)
          : tr(`${items.length} entrée${items.length > 1 ? 's' : ''}`, `${items.length} entr${items.length > 1 ? 'ies' : 'y'}`)}
      </p>
      </div>

      {detail && <PostDetailModal view={detail} onClose={() => setDetail(null)} />}

      {/* Menu contextuel (clic droit) — dupliquer */}
      {ctxMenu && (
        <>
          <div onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null) }}
            style={{ position: 'fixed', inset: 0, zIndex: 1500 }} />
          <div style={{
            position: 'fixed', top: Math.min(ctxMenu.y, window.innerHeight - 60), left: Math.min(ctxMenu.x, window.innerWidth - 190),
            zIndex: 1501, background: BG2, border: `1px solid ${HAIR}`, borderRadius: 10,
            padding: 4, minWidth: 180, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            <button
              onClick={() => duplicatePost(ctxMenu.post)}
              disabled={duplicating}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '9px 12px', borderRadius: 7, background: 'transparent', border: 'none',
                color: IVORY, fontSize: 13, fontFamily: SANS, cursor: duplicating ? 'default' : 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              {duplicating ? tr('Duplication…', 'Duplicating…') : tr('Dupliquer ce post', 'Duplicate this post')}
            </button>
            {(ctxMenu.post.status === 'pending' || ctxMenu.post.status === 'running') && (
              <button
                onClick={() => cancelPost(ctxMenu.post)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '9px 12px', borderRadius: 7, background: 'transparent', border: 'none',
                  color: ERR, fontSize: 13, fontFamily: SANS, cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                {tr('Annuler ce post', 'Cancel this post')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 600, color: MUTED, fontFamily: SANS,
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}`,
      borderRadius: 20, padding: '3px 10px',
    }}>{label}</span>
  )
}

// ── Détail par compte d'une tâche (téléphones OK / échoués) ────────────────────
function PostDetailModal({ view, onClose }: { view: DetailView; onClose: () => void }) {
  const tr = useTr()
  const results = view.results
  const okList  = results.filter(r => r.ok)
  const koList  = results.filter(r => !r.ok)
  const fallbackNames = view.fallbackNames
  const typeLabel = view.typeLabel

  const Row = ({ name, ok, error }: { name: string; ok: boolean; error?: string }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: `1px solid ${HAIR}` }}>
      <span style={{ marginTop: 1 }}>
        {ok
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={OK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ERR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: IVORY, fontFamily: SANS }}>{name}</div>
        {!ok && error && <div style={{ fontSize: 11.5, color: MUTED, fontFamily: SANS, marginTop: 1 }}>{error}</div>}
      </div>
    </div>
  )

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: BG2, border: `1px solid ${HAIR}`, borderRadius: 16,
        width: 'min(520px, 100%)', maxHeight: '80vh', overflowY: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: IVORY, fontFamily: SANS }}>{tr('Détail par compte', 'Per-account detail')}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: MUTED, fontFamily: SANS }}>
          {typeLabel} · {view.kind === 'scheduled' ? tr('Programmé', 'Scheduled') : tr('Direct', 'Direct')} · {fmtScheduledTime(view.dateIso)}
          {results.length > 0 && <> · <span style={{ color: OK }}>{tr(`${okList.length} réussi${okList.length > 1 ? 's' : ''}`, `${okList.length} succeeded`)}</span> · <span style={{ color: ERR }}>{tr(`${koList.length} échoué${koList.length > 1 ? 's' : ''}`, `${koList.length} failed`)}</span></>}
        </p>

        {/* Infos du post */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {view.accountsCount != null && <Chip label={tr(`${view.accountsCount} compte${view.accountsCount > 1 ? 's' : ''}`, `${view.accountsCount} account${view.accountsCount > 1 ? 's' : ''}`)} />}
          {view.videosCount != null && <Chip label={tr(`${view.videosCount} vidéo${view.videosCount > 1 ? 's' : ''}`, `${view.videosCount} video${view.videosCount > 1 ? 's' : ''}`)} />}
          {view.status && <Chip label={view.status === 'done' ? tr('Publié', 'Published') : view.status === 'failed' ? tr('Échec', 'Failed') : view.status === 'cancelled' ? tr('Annulé', 'Cancelled') : view.status} />}
        </div>
        {view.caption && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{tr('Légende', 'Caption')}</div>
            <div style={{ fontSize: 12.5, color: IVORY, fontFamily: SANS, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '8px 10px' }}>
              {view.caption}
            </div>
          </div>
        )}

        {results.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTED, fontFamily: SANS, lineHeight: 1.6 }}>
            {tr("Pas de détail par compte pour cette tâche (exécutée avant l'ajout de cette fonctionnalité).", 'No per-account detail for this task (run before this feature was added).')}
            {fallbackNames.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{tr('Comptes concernés', 'Accounts involved')}</div>
                {fallbackNames.map((nm, i) => (
                  <div key={i} style={{ fontSize: 13, color: IVORY, fontFamily: SANS, padding: '4px 0' }}>
                    {nm}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {koList.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: ERR, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 700 }}>{tr(`❌ Échoués (${koList.length})`, `❌ Failed (${koList.length})`)}</div>
                {koList.map((r, i) => <Row key={i} {...r} />)}
              </div>
            )}
            {okList.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: OK, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 700 }}>{tr(`✅ Réussis (${okList.length})`, `✅ Succeeded (${okList.length})`)}</div>
                {okList.map((r, i) => <Row key={i} {...r} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Section « postings en cours » (live, alimentée par le registre activeRuns) ──
const RUN_META: Record<ActiveRun['type'], { emoji: string; page: string }> = {
  mass:    { emoji: '🚀', page: 'posting' },
  story:   { emoji: '📸', page: 'storylink' },
  warmup:  { emoji: '🔥', page: 'warmup' },
  threads: { emoji: '🧵', page: 'posting' },
}

const PHASE_ICON: Record<'idle' | 'running' | 'done' | 'error', string> = { idle: '○', running: '◔', done: '✓', error: '✕' }
const PHASE_COLOR: Record<'idle' | 'running' | 'done' | 'error', string> = {
  idle: 'var(--text-4)', running: 'var(--accent)', done: 'var(--ok)', error: 'var(--danger)',
}

function ActiveRunsSection({ onNavigate }: { onNavigate?: (p: Page) => void }) {
  const tr = useTr()
  const [runs, setRuns] = useState<ActiveRun[]>(getActiveRuns())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  useEffect(() => subscribeActiveRuns(() => setRuns(getActiveRuns())), [])

  if (runs.length === 0) return null

  // Conflit : un proxy utilisé par ≥ 2 runs actifs en même temps.
  const cnt = new Map<string, number>()
  for (const r of runs) if (r.status === 'running') for (const k of new Set(r.proxyKeys)) cnt.set(k, (cnt.get(k) ?? 0) + 1)
  const clash = new Set([...cnt.entries()].filter(([, n]) => n >= 2).map(([k]) => k))

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span className="sf-status-chip is-live"><span className="sf-status-dot" />{tr('En cours', 'In progress')}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{tr(`${runs.filter(r => r.status === 'running').length} posting(s)`, `${runs.filter(r => r.status === 'running').length} posting(s)`)}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {runs.map(r => {
          const m = RUN_META[r.type]
          const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0
          const conflicted = r.status === 'running' && r.proxyKeys.some(k => clash.has(k))
          const color = r.status === 'error' ? 'var(--danger)' : r.status === 'done' ? 'var(--ok)' : 'var(--accent)'
          const hasPhases = Boolean(r.phones?.length)
          const isExp = expanded.has(r.id)
          return (
            <div key={r.id}
              onClick={() => hasPhases ? toggleExpand(r.id) : r.page && onNavigate?.(r.page as Page)}
              className={hasPhases || r.page ? 'cursor-pointer' : ''}
              style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--surface-2)', border: `1px solid ${conflicted ? 'rgba(239,68,68,0.5)' : 'var(--border-md)'}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 16 }}>{m.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{r.label}</span>
                {conflicted && <span title={tr("Même proxy qu'un autre posting — risque de ban", 'Same proxy as another posting — ban risk')} style={{ fontSize: 12 }}>{tr('⚠️ même proxy', '⚠️ same proxy')}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                  {r.status === 'running' ? `${r.done}/${r.total} · ${pct}%` : r.status === 'done' ? tr('✓ terminé', '✓ done') : tr('✕ échec', '✕ failed')}
                </span>
                {hasPhases && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{isExp ? '▾' : '▸'}</span>}
              </div>
              <div style={{ height: 5, borderRadius: 5, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${r.status === 'done' ? 100 : pct}%`, background: color, transition: 'width .3s' }} />
              </div>
              {hasPhases && isExp && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                  {r.phones!.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                      <span style={{ color: PHASE_COLOR[p.status], width: 12, textAlign: 'center', ...(p.status === 'running' ? { animation: 'spin 1.2s linear infinite' } : {}) }}>{PHASE_ICON[p.status]}</span>
                      <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
