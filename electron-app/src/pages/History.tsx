import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { canManageOrg } from '@/lib/permissions'
import { fmtScheduledTime } from '@/lib/schedulerService'
import type { ScheduledPost } from '@/lib/schedulerService'
import {
  TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR,
  BG_0 as BG, BG_2 as BG2, ACCENT, ACCENT_L, OK, ERR, SANS,
} from '@/lib/theme'

interface PostRun {
  id: string
  type: string
  ok_count: number
  err_count: number
  total: number
  created_at: string
  user_id: string
  org_id: string | null
}

type HistoryItem =
  | { kind: 'scheduled'; data: ScheduledPost }
  | { kind: 'run';       data: PostRun }

function itemDate(it: HistoryItem): string {
  if (it.kind === 'scheduled') return it.data.executed_at ?? it.data.created_at ?? ''
  return it.data.created_at
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
  const pending = status === 'pending' || status === 'running'
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

export function History({ user }: { user: User }) {
  const { currentOrg, role } = useOrg()
  const [items,     setItems]   = useState<HistoryItem[]>([])
  const [loading,   setLoading] = useState(true)
  const [hasMore,   setHasMore] = useState(false)
  const [page,      setPage]    = useState(0)
  const [filter,    setFilter]  = useState<'all' | 'scheduled' | 'direct'>('all')
  const [confirming, setConfirming] = useState(false)
  const [clearing,   setClearing]   = useState(false)
  const [detail,     setDetail]     = useState<ScheduledPost | null>(null)

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

  return (
    <div style={{ minHeight: '100%', background: BG, padding: '24px 28px 80px', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div className="sf-anim-slide-up" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(99,102,241,0.06))',
          border: '1px solid rgba(99,102,241,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {filterBtn('all', 'Tout')}
        {filterBtn('scheduled', 'Programmé')}
        {filterBtn('direct', 'Direct')}
      </div>

      {/* List */}
      <div className="sf-card sf-anim-slide-up" style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 14, overflow: 'hidden', padding: 0 }}>
        {loading && items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: MUTED, fontSize: 13, fontFamily: SANS }}>
            Chargement…
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
          </div>
        ) : (
          items.map((item, i) => {
            if (item.kind === 'scheduled') {
              const post = item.data
              const phones = Array.isArray(post.phones) ? post.phones : []
              const ok = post.status === 'done'
              const typeLabel = TYPE_LABELS[post.type ?? ''] ?? 'Post'
              const prCount = post.result?.phone_results?.length ?? 0
              return (
                <div key={`sp-${post.id}`} onClick={() => setDetail(post)} style={{
                  padding: '14px 20px',
                  borderBottom: i < items.length - 1 ? `1px solid ${HAIR}` : 'none',
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
              return (
                <div key={`pr-${run.id}`} style={{
                  padding: '14px 20px',
                  borderBottom: i < items.length - 1 ? `1px solid ${HAIR}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
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
                    </p>
                  </div>
                  <StatusPill status={ok ? 'done' : 'failed'} />
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
        {items.length} entrée{items.length > 1 ? 's' : ''}
      </p>
      </div>

      {detail && <PostDetailModal post={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ── Détail par compte d'une tâche (téléphones OK / échoués) ────────────────────
function PostDetailModal({ post, onClose }: { post: ScheduledPost; onClose: () => void }) {
  const results = post.result?.phone_results ?? []
  const okList  = results.filter(r => r.ok)
  const koList  = results.filter(r => !r.ok)
  const phones  = Array.isArray(post.phones) ? post.phones : []
  const typeLabel = TYPE_LABELS[post.type ?? ''] ?? 'Post'

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
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED, fontFamily: SANS }}>
          {typeLabel} · {fmtScheduledTime(post.executed_at ?? post.created_at)}
          {results.length > 0 && <> · <span style={{ color: OK }}>{okList.length} réussi{okList.length > 1 ? 's' : ''}</span> · <span style={{ color: ERR }}>{koList.length} échoué{koList.length > 1 ? 's' : ''}</span></>}
        </p>

        {results.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTED, fontFamily: SANS, lineHeight: 1.6 }}>
            Pas de détail par compte pour cette tâche (exécutée avant l'ajout de cette fonctionnalité).
            {phones.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Comptes concernés</div>
                {phones.map((p, i) => (
                  <div key={i} style={{ fontSize: 13, color: IVORY, fontFamily: SANS, padding: '4px 0' }}>
                    {p.ig_username ?? p.phone_name}
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
