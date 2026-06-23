import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { fmtScheduledTime } from '@/lib/schedulerService'
import type { ScheduledPost } from '@/lib/schedulerService'
import {
  TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR,
  BG_0 as BG, BG_1 as BG2, SANS,
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
}

function StatusPill({ status }: { status: string }) {
  const ok  = status === 'done'
  const err = status === 'failed'
  const pending = status === 'pending' || status === 'running'
  const color = ok ? '#34D399' : err ? '#F87171' : '#94A3B8'
  const bg    = ok ? 'rgba(52,211,153,0.08)' : err ? 'rgba(248,113,113,0.08)' : 'rgba(148,163,184,0.08)'
  const border= ok ? 'rgba(52,211,153,0.25)' : err ? 'rgba(248,113,113,0.25)' : 'rgba(148,163,184,0.2)'
  const label = ok ? 'PUBLIÉ' : err ? 'ÉCHEC' : pending ? 'EN COURS' : status.toUpperCase()
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      color, background: bg, border: `1px solid ${border}`,
      borderRadius: 5, padding: '2px 7px', fontFamily: SANS, whiteSpace: 'nowrap',
    }}>{label}</span>
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
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      }
    </div>
  )
}

const PAGE_SIZE = 30

export function History({ user }: { user: User }) {
  const { currentOrg } = useOrg()
  const [items,     setItems]   = useState<HistoryItem[]>([])
  const [loading,   setLoading] = useState(true)
  const [hasMore,   setHasMore] = useState(false)
  const [page,      setPage]    = useState(0)
  const [filter,    setFilter]  = useState<'all' | 'scheduled' | 'direct'>('all')

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

  const filterBtn = (f: typeof filter, label: string) => (
    <button
      onClick={() => setFilter(f)}
      style={{
        padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: SANS,
        cursor: 'pointer', transition: 'all 0.15s',
        background: filter === f ? 'rgba(99,102,241,0.18)' : 'transparent',
        color: filter === f ? '#818CF8' : FAINT,
        border: filter === f ? '1px solid rgba(99,102,241,0.35)' : `1px solid transparent`,
      }}
    >{label}</button>
  )

  return (
    <div style={{ minHeight: '100%', background: BG, padding: '32px 40px 80px', boxSizing: 'border-box', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(99,102,241,0.06))',
          border: '1px solid rgba(99,102,241,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
          </svg>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: IVORY, fontFamily: SANS }}>Historique</h1>
          <p style={{ margin: 0, fontSize: 12, color: FAINT, fontFamily: SANS, marginTop: 2 }}>Tous vos posts — programmés et directs</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {filterBtn('all', 'Tout')}
        {filterBtn('scheduled', 'Programmé')}
        {filterBtn('direct', 'Direct')}
      </div>

      {/* List */}
      <div style={{ background: BG2, border: `1px solid ${HAIR}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading && items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: FAINT, fontSize: 13, fontFamily: SANS }}>
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: FAINT, fontFamily: SANS }}>Aucun historique pour l'instant</p>
          </div>
        ) : (
          items.map((item, i) => {
            if (item.kind === 'scheduled') {
              const post = item.data
              const phones = Array.isArray(post.phones) ? post.phones : []
              const ok = post.status === 'done'
              const typeLabel = TYPE_LABELS[post.type ?? ''] ?? 'Post'
              return (
                <div key={`sp-${post.id}`} style={{
                  padding: '13px 20px',
                  borderBottom: i < items.length - 1 ? `1px solid ${HAIR}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <IconBox ok={ok} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: IVORY,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: SANS,
                    }}>
                      {phones.length} compte{phones.length > 1 ? 's' : ''}
                      {post.caption ? ` · ${post.caption.slice(0, 50)}${post.caption.length > 50 ? '…' : ''}` : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: FAINT, fontFamily: SANS }}>
                      {typeLabel} · Programmé · {fmtScheduledTime(post.executed_at ?? post.created_at)}
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
                  padding: '13px 20px',
                  borderBottom: i < items.length - 1 ? `1px solid ${HAIR}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <IconBox ok={ok} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: IVORY, fontFamily: SANS,
                    }}>
                      {run.ok_count}/{run.total} compte{run.total > 1 ? 's' : ''}
                      {run.err_count > 0 ? ` · ${run.err_count} échec${run.err_count > 1 ? 's' : ''}` : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: FAINT, fontFamily: SANS }}>
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
            <button
              onClick={loadMore}
              style={{
                fontSize: 12, fontWeight: 600, color: '#818CF8', background: 'transparent',
                border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '6px 20px',
                cursor: 'pointer', fontFamily: SANS,
              }}
            >Charger plus</button>
          </div>
        )}

        {loading && items.length > 0 && (
          <div style={{ padding: '14px 20px', textAlign: 'center', color: FAINT, fontSize: 12, fontFamily: SANS }}>
            Chargement…
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, textAlign: 'center', fontSize: 11, color: FAINT, fontFamily: SANS }}>
        {items.length} entrée{items.length > 1 ? 's' : ''}
      </p>
    </div>
  )
}
