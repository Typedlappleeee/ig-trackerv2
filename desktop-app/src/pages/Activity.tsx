import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ScheduledPost, type PostRun } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PageHead, Kpi, Empty, Modal } from '@/lib/ui'
import type { OrgState } from '@/lib/data'

// ── Un « run » unifié (post_runs directs + scheduled_posts exécutés) ────────────
interface RunItem {
  id: string
  ok: number
  total: number
  title: string
  meta: string
  ts: number       // pour tri
  when: string     // libellé relatif
}

function asArray(v: unknown): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

// « il y a X min / h », « hier HH:MM », date sinon.
function relLabel(iso: string): string {
  const d = new Date(iso); const ms = Date.now() - d.getTime()
  if (isNaN(d.getTime())) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (h < 48) return `hier ${time}`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + time
}

function runMeta(type: string): string {
  if (type === 'tiktok') return 'Mass Posting · TikTok'
  if (type === 'story') return 'Story · Instagram'
  if (type === 'warmup') return 'Warmup'
  if (type === 'mass_posting') return 'Mass Posting · Instagram'
  return 'Publication · Instagram'
}
function schedMeta(p: ScheduledPost): string {
  const base = p.type === 'story' ? 'Story programmée · Instagram' : p.type === 'tiktok' ? 'Publication programmée · TikTok' : 'Publication programmée · Instagram'
  return p.created_by_name ? `${base} · ${p.created_by_name}` : base
}
// Coût crédits d'un run (estimation : story 1/compte, sinon 2/compte).
function runCost(type: string, total: number): number {
  return (type === 'story' ? 1 : 2) * total
}

type Filter = 'all' | 'ok' | 'ko'

export default function Activity({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg } = org
  const [runs, setRuns] = useState<RunItem[]>([])
  const [kpi, setKpi] = useState({ count7: 0, rate: 0, failed7: 0, credits7: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [detail, setDetail] = useState<RunItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Relancer : un post programmé échoué repasse en 'pending' (le serveur le relance).
  // Un run client (id 'run-…') ne peut pas être relancé côté serveur → message.
  async function relancer(r: RunItem) {
    if (r.id.startsWith('sched-')) {
      const id = r.id.slice('sched-'.length)
      const { error } = await supabase.from('scheduled_posts').update({ status: 'pending' }).eq('id', id)
      setNotice(error ? `Échec : ${error.message}` : 'Post remis en file — le serveur relancera les comptes échoués.')
      if (!error) load()
    } else {
      setNotice('Ce run a été lancé depuis ton PC — relance-le depuis Publication (les runs serveur, eux, sont relançables ici).')
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [prRes, spRes] = await Promise.all([
      scope(supabase.from('post_runs').select('id,type,ok_count,err_count,total,created_at'))
        .order('created_at', { ascending: false }).limit(100),
      scope(supabase.from('scheduled_posts').select('*'))
        .in('status', ['done', 'failed']).order('executed_at', { ascending: false }).limit(100),
    ])
    if (prRes.error && spRes.error) { setError('Impossible de charger ton activité.'); setLoading(false); return }

    const items: (RunItem & { type: string })[] = []
    for (const r of ((prRes.data ?? []) as PostRun[])) {
      const total = r.total ?? 0
      const ok = r.ok_count ?? 0
      items.push({
        id: 'run-' + r.id, type: r.type, ok, total,
        title: `${total} compte${total > 1 ? 's' : ''}`,
        meta: runMeta(r.type), ts: new Date(r.created_at).getTime(), when: relLabel(r.created_at),
      })
    }
    for (const p of ((spRes.data ?? []) as ScheduledPost[])) {
      const total = asArray(p.phones).length
      const ok = p.status === 'done' ? total : 0
      const ref = p.executed_at ?? p.created_at
      const label = p.caption?.trim() || (p.type === 'story' ? 'Story' : 'Publication')
      items.push({
        id: 'sched-' + p.id, type: p.type ?? 'reels', ok, total,
        title: `${total} compte${total > 1 ? 's' : ''} · ${label}`,
        meta: schedMeta(p), ts: new Date(ref).getTime(), when: relLabel(ref),
      })
    }
    items.sort((a, b) => b.ts - a.ts)

    // KPIs sur 7 jours.
    const weekAgo = Date.now() - 7 * 86400000
    const recent = items.filter(i => i.ts >= weekAgo)
    const okSum = recent.reduce((s, i) => s + i.ok, 0)
    const totSum = recent.reduce((s, i) => s + i.total, 0)
    const failed = recent.reduce((s, i) => s + Math.max(0, i.total - i.ok), 0)
    const credits = recent.reduce((s, i) => s + runCost(i.type, i.total), 0)
    setKpi({
      count7: recent.length,
      rate: totSum ? Math.round((okSum / totSum) * 100) : 0,
      failed7: failed,
      credits7: credits,
    })
    setRuns(items.map(({ type, ...rest }) => ({ ...rest })))
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  const filters: { k: Filter; l: string; n: number }[] = useMemo(() => [
    { k: 'all', l: 'Tout', n: runs.length },
    { k: 'ok', l: 'Réussis', n: runs.filter(r => r.total > 0 && r.ok === r.total).length },
    { k: 'ko', l: 'Incomplets', n: runs.filter(r => r.ok < r.total).length },
  ], [runs])

  const shown = useMemo(() => runs.filter(r =>
    filter === 'all' || (filter === 'ok' && r.total > 0 && r.ok === r.total) || (filter === 'ko' && r.ok < r.total)
  ), [runs, filter])

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Activité" sub="L'historique de tous tes runs. Relance les comptes échoués sans reconstruire la diffusion." />

      {notice && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, background: `rgba(${theme.tone},0.08)`, border: `1px solid rgba(${theme.tone},0.22)`, fontSize: 12, color: '#E4E4E7' }}>{notice}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi theme={theme} label="Runs · 7 jours" value={kpi.count7} />
        <Kpi theme={theme} label="Taux de succès" value={kpi.count7 ? `${kpi.rate} %` : '—'} color={kpi.count7 ? '#34D399' : undefined} />
        <Kpi theme={theme} label="Comptes échoués" value={kpi.failed7} color={kpi.failed7 ? '#FBBF24' : undefined} hint={kpi.failed7 ? 'relançables en un clic' : undefined} />
        <Kpi theme={theme} label="Crédits · 7 jours" value={kpi.credits7.toLocaleString('fr-FR')} color="#FBBF24" />
      </div>

      <Panel theme={theme}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {filters.map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
                background: filter === f.k ? `rgba(${theme.tone},0.16)` : 'transparent',
                color: filter === f.k ? theme.accentText : '#71717A', fontSize: 11, fontWeight: 700, transition: 'all .14s ease',
              }}>
                {f.l}
                <span style={{ opacity: 0.55, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{f.n}</span>
              </button>
            ))}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
        ) : error ? (
          <Empty icon="M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" title="Erreur" text={error} />
        ) : shown.length === 0 ? (
          <Empty icon="M22 12h-4l-3 9L9 3l-3 9H2" title="Aucun run" text="Tes publications et tes runs apparaîtront ici avec leur taux de réussite." />
        ) : shown.map((r, i) => {
          const ok = r.total > 0 && r.ok === r.total
          const pct = r.total ? Math.round((r.ok / r.total) * 100) : 0
          return (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px',
              borderBottom: i < shown.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none', transition: 'background .14s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                border: '1px solid ' + (ok ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.22)'),
                color: ok ? '#34D399' : '#FBBF24',
              }}><Icon d={ok ? 'M20 6L9 17l-5-5' : 'M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'} size={13} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#F4F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  {/* Sticker infra : d'où vient le run. (Tous GeeLark aujourd'hui ; ScaleFlow Cloud se taguera quand l'infra sera active.) */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, flexShrink: 0, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.24)', fontSize: 9.5, fontWeight: 800, color: '#C4B5FD' }}>
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: '#A78BFA' }} />GeeLark
                  </span>
                </span>
                <span style={{ fontSize: 11, color: '#52525B' }}>{r.meta}</span>
              </span>
              <span style={{ width: 90, display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <span style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 99, background: ok ? '#10B981' : '#F59E0B' }} />
                </span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 700, color: ok ? '#34D399' : '#FBBF24' }}>{r.ok} / {r.total}</span>
              </span>
              <span style={{ fontSize: 11, color: '#52525B', minWidth: 84, textAlign: 'right', flexShrink: 0 }}>{r.when}</span>
              <span style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                {ok
                  ? <Btn theme={theme} sm tone="quiet" icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6" label="Détails" onClick={() => setDetail(r)} />
                  : <Btn theme={theme} sm icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8" label={`Relancer ${r.total - r.ok}`} onClick={() => relancer(r)} />}
              </span>
            </div>
          )
        })}
      </Panel>

      {detail && (
        <Modal theme={theme} title={detail.title} sub={detail.meta} icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6"
          onClose={() => setDetail(null)} footer={<Btn theme={theme} tone="quiet" label="Fermer" onClick={() => setDetail(null)} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {([['Comptes réussis', `${detail.ok} / ${detail.total}`], ['Taux', `${detail.total ? Math.round((detail.ok / detail.total) * 100) : 0} %`], ['Quand', detail.when], ['Type', detail.meta]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: '#71717A' }}>{k}</span><span style={{ fontWeight: 700, color: '#E4E4E7' }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 4 }}>
              <Chip text={detail.ok === detail.total ? 'Tous publiés' : `${detail.total - detail.ok} échec(s)`} tone={detail.ok === detail.total ? 'ok' : 'warn'} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
