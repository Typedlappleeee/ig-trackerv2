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
import {
  TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR,
  BG_0 as BG, BG_2 as BG2, ACCENT, ACCENT_L, OK, ERR, SANS,
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
  const ok  = status === 'done'
  const err = status === 'failed'
  const partial = status === 'partial'
  const pending = status === 'pending' || status === 'running'
  if (partial) {
    return <span className="sf-badge" style={{ whiteSpace: 'nowrap', background: 'rgba(251,191,36,0.14)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.3)' }}>PARTIEL</span>
  }
  const variant = ok ? 'ok' : err ? 'danger' : pending ? 'accent' : 'muted'
  const label = ok ? 'PUBLIÉ' : err ? 'ÉCHEC' : pending ? 'EN COURS' : status.toUpperCase()
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
        .in('status', ['done', 'failed', 'cancelled'])
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

  function loadMore() {
    const next = page + 1
    setPage(next)
    load(next, false)
  }

  // Duplique un post programmé : recrée la même config (téléphones, vidéos,
  // légende) dans un NOUVEAU post en attente, programmé dans ~1h.
  async function duplicatePost(post: ScheduledPost) {
    setDuplicating(true)
    try {
      await createScheduledPost({
        userId:        user.id,
        orgId:         post.org_id,
        createdByName: post.created_by_name || (user.email ?? 'Moi'),
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
      toast.show({ title: 'Post dupliqué ✓', body: 'Nouveau post programmé dans ~1h — ajuste l\'heure dans Programmation (Calendrier).', kind: 'ok' })
    } catch (e) {
      toast.show({ title: 'Duplication échouée', body: e instanceof Error ? e.message : String(e), kind: 'error' })
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
      onClick={() => setFilter(f)}
      style={{
        padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: SANS,
        cursor: 'pointer', transition: 'all 0.15s',
        background: filter === f ? 'rgba(99,102,241,0.18)' : 'transparent',
        color: filter === f ? ACCENT_L : MUTED,
        border: filter === f ? '1px solid rgba(99,102,241,0.35)' : `1px solid ${HAIR}`,
      }}
    >{label}</button>
  )

  const statusBtn = (f: typeof statusFilter, label: string, dot?: string) => (
    <button
      onClick={() => setStatusFilter(f)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: SANS,
        cursor: 'pointer', transition: 'all 0.15s',
        background: statusFilter === f ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: statusFilter === f ? IVORY : MUTED,
        border: statusFilter === f ? '1px solid rgba(255,255,255,0.16)' : `1px solid ${HAIR}`,
      }}
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
      <div className="sf-anim-slide-up" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          background: 'linear-gradient(135deg,#64748B,#475569)',
          boxShadow: '0 10px 24px -8px rgba(100,116,139,0.5), inset 0 1px 0 0 rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
          </svg>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: IVORY, fontFamily: SANS, letterSpacing: '-0.01em' }}>Historique</h1>
          <p style={{ margin: 0, fontSize: 13, color: MUTED, fontFamily: SANS, marginTop: 2 }}>Tous vos posts — programmés et directs</p>
        </div>

        {canClear && items.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {confirming ? (
              <>
                <span style={{ fontSize: 12, color: MUTED, fontFamily: SANS }}>Effacer tout l'historique ?</span>
                <button
                  onClick={clearHistory}
                  disabled={clearing}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: SANS,
                    cursor: clearing ? 'default' : 'pointer', opacity: clearing ? 0.6 : 1,
                    background: 'rgba(248,113,113,0.16)', color: ERR,
                    border: '1px solid rgba(248,113,113,0.4)',
                  }}
                >{clearing ? 'Suppression…' : 'Oui, effacer'}</button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={clearing}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: SANS,
                    cursor: 'pointer', background: 'transparent', color: MUTED, border: `1px solid ${HAIR}`,
                  }}
                >Annuler</button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: SANS,
                  cursor: 'pointer', background: 'transparent', color: MUTED, border: `1px solid ${HAIR}`,
                  transition: 'all 0.15s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Vider l'historique
              </button>
            )}
          </div>
        )}
      </div>

      {/* Postings en cours (live) */}
      <ActiveRunsSection onNavigate={onNavigate} />

      {/* Filters: source tabs + status + search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {filterBtn('all', 'Tout')}
        {filterBtn('scheduled', 'Programmé')}
        {filterBtn('direct', 'Direct')}
        <div style={{ width: 1, height: 22, background: HAIR, margin: '0 2px' }} />
        {statusBtn('all', 'Tous statuts')}
        {statusBtn('ok', 'Publiés', OK)}
        {statusBtn('failed', 'Échecs', ERR)}
        <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (compte, légende, type)…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 32px', borderRadius: 8, fontSize: 12.5, fontFamily: SANS, color: IVORY, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, outline: 'none' }}
          />
        </div>
      </div>

      {/* Résumé santé — sur les entrées chargées */}
      {items.length > 0 && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: IVORY, fontWeight: 700 }}>{items.length}</span> entrée{items.length > 1 ? 's' : ''} chargée{items.length > 1 ? 's' : ''}
          {' · '}<span style={{ color: successRate >= 90 ? OK : successRate >= 60 ? '#FBBF24' : ERR, fontWeight: 700 }}>{successRate}%</span> de réussite
          {(items.length - okCount) > 0 && <> · <span style={{ color: ERR, fontWeight: 600 }}>{items.length - okCount} échec{(items.length - okCount) > 1 ? 's' : ''}</span></>}
        </p>
      )}

      {/* List */}
      <div className="sf-card sf-anim-slide-up" style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 14, overflow: 'hidden', padding: 0 }}>
        {loading && items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: MUTED, fontSize: 13, fontFamily: SANS }}>
            Chargement…
          </div>
        ) : items.length > 0 && visible.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: IVORY, fontFamily: SANS }}>Aucun résultat</p>
            <p style={{ margin: 0, fontSize: 12.5, color: FAINT, fontFamily: SANS }}>Aucune entrée ne correspond à ces filtres.</p>
            <button className="sf-btn sf-btn-ghost sf-btn-sm" style={{ marginTop: 4 }} onClick={() => { setSearch(''); setStatusFilter('all') }}>Réinitialiser les filtres</button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(99,102,241,0.06)', border: `1px solid ${HAIR}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: IVORY, fontFamily: SANS }}>Aucun historique pour l'instant</p>
            <p style={{ margin: 0, fontSize: 12.5, color: FAINT, fontFamily: SANS }}>Vos posts programmés et directs apparaîtront ici.</p>
            {onNavigate && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="sf-btn sf-btn-primary sf-btn-sm" onClick={() => onNavigate('publishhub')}>Publier maintenant</button>
                <button className="sf-btn sf-btn-secondary sf-btn-sm" onClick={() => onNavigate('scheduler')}>Programmer un post</button>
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
                      {phones.length} compte{phones.length > 1 ? 's' : ''}
                      {post.caption ? ` · ${post.caption.slice(0, 50)}${post.caption.length > 50 ? '…' : ''}` : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 11.5, color: MUTED, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
                      {typeLabel} · Programmé · {fmtScheduledTime(post.executed_at ?? post.created_at)}
                      {prCount > 0 ? ' · détail par compte ›' : ''}
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
                      {run.ok_count}/{run.total} compte{run.total > 1 ? 's' : ''}
                      {run.err_count > 0 ? ` · ${run.err_count} échec${run.err_count > 1 ? 's' : ''}` : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 11.5, color: MUTED, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
                      {typeLabel} · Direct · {fmtScheduledTime(run.created_at)}
                      {runResults.length > 0 ? ' · détail par compte ›' : ''}
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
            <button className="sf-btn sf-btn-ghost sf-btn-sm" onClick={loadMore}>Charger plus</button>
          </div>
        )}

        {loading && items.length > 0 && (
          <div style={{ padding: '14px 20px', textAlign: 'center', color: MUTED, fontSize: 12, fontFamily: SANS }}>
            Chargement…
          </div>
        )}
      </div>

      <p style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: FAINT, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
        {(q || statusFilter !== 'all')
          ? `${visible.length} sur ${items.length} entrée${items.length > 1 ? 's' : ''}`
          : `${items.length} entrée${items.length > 1 ? 's' : ''}`}
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
              {duplicating ? 'Duplication…' : 'Dupliquer ce post'}
            </button>
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
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: IVORY, fontFamily: SANS }}>Détail par compte</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: MUTED, fontFamily: SANS }}>
          {typeLabel} · {view.kind === 'scheduled' ? 'Programmé' : 'Direct'} · {fmtScheduledTime(view.dateIso)}
          {results.length > 0 && <> · <span style={{ color: OK }}>{okList.length} réussi{okList.length > 1 ? 's' : ''}</span> · <span style={{ color: ERR }}>{koList.length} échoué{koList.length > 1 ? 's' : ''}</span></>}
        </p>

        {/* Infos du post */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {view.accountsCount != null && <Chip label={`${view.accountsCount} compte${view.accountsCount > 1 ? 's' : ''}`} />}
          {view.videosCount != null && <Chip label={`${view.videosCount} vidéo${view.videosCount > 1 ? 's' : ''}`} />}
          {view.status && <Chip label={view.status === 'done' ? 'Publié' : view.status === 'failed' ? 'Échec' : view.status === 'cancelled' ? 'Annulé' : view.status} />}
        </div>
        {view.caption && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Légende</div>
            <div style={{ fontSize: 12.5, color: IVORY, fontFamily: SANS, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, borderRadius: 8, padding: '8px 10px' }}>
              {view.caption}
            </div>
          </div>
        )}

        {results.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTED, fontFamily: SANS, lineHeight: 1.6 }}>
            Pas de détail par compte pour cette tâche (exécutée avant l'ajout de cette fonctionnalité).
            {fallbackNames.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Comptes concernés</div>
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
                <div style={{ fontSize: 11, color: ERR, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 700 }}>❌ Échoués ({koList.length})</div>
                {koList.map((r, i) => <Row key={i} {...r} />)}
              </div>
            )}
            {okList.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: OK, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 700 }}>✅ Réussis ({okList.length})</div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>En cours</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{runs.filter(r => r.status === 'running').length} posting(s)</span>
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
                {conflicted && <span title="Même proxy qu'un autre posting — risque de ban" style={{ fontSize: 12 }}>⚠️ même proxy</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                  {r.status === 'running' ? `${r.done}/${r.total} · ${pct}%` : r.status === 'done' ? '✓ terminé' : '✕ échec'}
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
