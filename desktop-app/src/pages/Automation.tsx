import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ScheduledPost, type RecurringTask } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Panel, PanelHead, PageHead, Empty, Toggle, Segmented, SkeletonRows, useNarrow } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import CreateTaskModal, { type TaskMode } from '@/components/CreateTaskModal'

// ── Helpers ──────────────────────────────────────────────────────────────────
function asArray(v: unknown): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}
function phoneCount(v: unknown): number { return asArray(v).length }

// Libellé « quand » relatif au prototype (Aujourd'hui HH:MM / Demain / Hier / date).
function whenLabel(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((dd.getTime() - day0.getTime()) / 86400000)
  if (diff === 0) return time
  if (diff === 1) return `Demain ${time}`
  if (diff === -1) return `Hier ${time}`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + time
}

// Type de post → libellé lisible.
function typeLabel(t?: string): string {
  if (t === 'story') return 'Story'
  if (t === 'tiktok') return 'TikTok'
  if (t === 'threads') return 'Threads'
  return 'Reels'
}

// Estimation crédits/jour d'une tâche : 50 fixes + 2 × nb téléphones à l'exécution.
function taskCredits(t: RecurringTask): string {
  const n = phoneCount(t.phones)
  return n > 0 ? `50 + ${n * 2}` : '50'
}

// Étapes d'une tâche (steps jsonb) → puces lisibles. Fallback sur le type plat.
function taskSteps(t: RecurringTask): string[] {
  const steps = asArray(t.steps)
  if (steps.length) {
    return steps.map((s: any) => {
      const ty = s?.type as string
      if (ty === 'warmup') return 'Warmup'
      if (ty === 'story') return 'Story + lien'
      return 'Publication Reels'
    })
  }
  const base = t.task_type === 'story' ? 'Story + lien par compte' : 'Publication Reels'
  return [base]
}

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

type Tab = 'sched' | 'rec'

export default function Automation({ theme, infra, user, org, embedded }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; embedded?: boolean
}) {
  const { currentOrg } = org
  const [tab, setTab] = useState<Tab>('sched')
  const [net, setNet] = useState('Tous')
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [tasks, setTasks] = useState<RecurringTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // id de tâche en cours de bascule
  const [createMode, setCreateMode] = useState<TaskMode | null>(null)
  const narrow = useNarrow()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [pRes, tRes] = await Promise.all([
      scope(supabase.from('scheduled_posts').select('*'))
        .order('scheduled_at', { ascending: false }).limit(200),
      scope(supabase.from('recurring_tasks').select('*'))
        .order('created_at', { ascending: false }),
    ])
    if (pRes.error && tRes.error) { setError('Impossible de charger tes automatisations.'); setLoading(false); return }
    setPosts(((pRes.data ?? []) as ScheduledPost[]))
    setTasks(((tRes.data ?? []) as RecurringTask[]))
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  // Bascule active/pause d'une tâche — vraie écriture Supabase.
  async function toggleTask(t: RecurringTask) {
    const next = t.status === 'active' ? 'paused' : 'active'
    setBusy(t.id)
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x)) // optimiste
    const { error: err } = await supabase.from('recurring_tasks').update({ status: next }).eq('id', t.id)
    if (err) setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: t.status } : x)) // rollback
    setBusy(null)
  }

  // File d'attente (à venir d'abord, puis récents), scheduled_posts hors annulés.
  const queue = useMemo(() => {
    const pending = posts.filter(p => p.status === 'pending' || p.status === 'running')
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const recent = posts.filter(p => p.status === 'done' || p.status === 'failed')
      .sort((a, b) => (b.executed_at ?? b.scheduled_at).localeCompare(a.executed_at ?? a.scheduled_at))
    const all = [...pending, ...recent]
    const netOf = (t?: string) => t === 'tiktok' ? 'TikTok' : t === 'threads' ? 'Threads' : 'Instagram'
    return all.filter(p => net === 'Tous' || netOf(p.type) === net).slice(0, 12)
  }, [posts, net])

  const schedCount = posts.filter(p => p.status === 'pending' || p.status === 'running').length
  const activeCount = tasks.filter(t => t.status === 'active').length

  // Calendrier du mois courant : jours porteurs de posts programmés / publiés.
  const cal = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7 // lundi = 0
    const schedDays = new Set<number>()
    const pubDays = new Set<number>()
    for (const p of posts) {
      const ref = p.status === 'done' ? (p.executed_at ?? p.scheduled_at) : p.scheduled_at
      const d = new Date(ref)
      if (isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== m) continue
      if (p.status === 'done') pubDays.add(d.getDate())
      else if (p.status === 'pending' || p.status === 'running') schedDays.add(d.getDate())
    }
    return { y, m, daysInMonth, firstDow, schedDays, pubDays, planned: schedDays.size + pubDays.size }
  }, [posts])

  return (
    <div style={{ animation: embedded ? 'none' : 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {!embedded && (
        <PageHead
          title="Automatisation"
          sub={tab === 'sched'
            ? 'Posts programmés, exécutés côté serveur — ton PC peut être éteint.'
            : '50 crédits/jour par tâche active, plus 2 crédits par téléphone à chaque exécution.'}
          actions={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label={tab === 'sched' ? 'Programmer' : 'Nouvelle tâche'} onClick={() => setCreateMode(tab === 'sched' ? 'schedule' : 'recurring')} />}
        />
      )}

      {/* segmented Programmé / Récurrent */}
      <div style={{ marginBottom: 16 }}>
        <Segmented<Tab> value={tab} onChange={setTab}
          options={([['sched', 'Programmé', schedCount], ['rec', 'Récurrent', tasks.length]] as [Tab, string, number][]).map(([k, l, n]) => ({ v: k, l, n }))} />
      </div>

      {loading ? (
        <Panel theme={theme}><SkeletonRows rows={4} /></Panel>
      ) : error ? (
        <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" title="Erreur" text={error} /></Panel>
      ) : tab === 'sched' ? (
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1.3fr) minmax(0,1fr)', gap: 12 }}>
          {/* File d'attente */}
          <Panel theme={theme}>
            <PanelHead title="File d'attente" sub="Exécutés côté serveur — ton PC peut être éteint"
              right={
                <Segmented sm value={net} onChange={setNet}
                  options={['Tous', 'Instagram', 'TikTok', 'Threads'].map(n => ({ v: n, l: n }))} />
              } />
            {queue.length === 0 ? (
              <Empty icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
                title="Rien de programmé" text="Programme un post pour le voir exécuté côté serveur, même PC éteint." />
            ) : queue.map((r, i) => {
              const done = r.status === 'done'
              const failed = r.status === 'failed'
              const running = r.status === 'running'
              const when = done || failed ? whenLabel(r.executed_at ?? r.scheduled_at) : whenLabel(r.scheduled_at)
              const n = phoneCount(r.phones)
              const title = `${n} compte${n > 1 ? 's' : ''} · ${r.caption?.trim() || typeLabel(r.type)}`
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', minHeight: 48, boxSizing: 'border-box',
                  borderBottom: i < queue.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                    color: done || failed ? '#71717A' : '#EDEDEF', minWidth: 84, flexShrink: 0,
                  }}>{when}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: done || failed ? '#A1A1AA' : '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                    <span style={{ fontSize: 11.5, color: '#71717A' }}>{typeLabel(r.type)}{running ? ' · en cours' : ''}</span>
                  </span>
                  <Chip
                    text={done ? 'publié' : failed ? 'échec' : running ? 'en cours' : 'programmé'}
                    tone={done ? 'ok' : failed ? 'bad' : running ? 'warn' : 'violet'}
                  />
                </div>
              )
            })}
          </Panel>

          {/* Calendrier du mois */}
          <Panel theme={theme}>
            <PanelHead title={`${MONTHS[cal.m]} ${cal.y}`} sub={`${cal.planned} jour${cal.planned > 1 ? 's' : ''} avec activité`} />
            <div style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                  <span key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 500, color: '#71717A' }}>{d}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                {Array.from({ length: cal.firstDow }, (_, i) => <span key={`e${i}`} />)}
                {Array.from({ length: cal.daysInMonth }, (_, i) => {
                  const day = i + 1
                  const sched = cal.schedDays.has(day)
                  const pub = cal.pubDays.has(day) && !sched
                  return (
                    <span key={day} style={{
                      aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 5, fontSize: 11.5, fontWeight: sched || pub ? 600 : 400, fontVariantNumeric: 'tabular-nums',
                      background: sched || pub ? 'rgba(255,255,255,0.06)' : 'transparent',
                      border: '1px solid ' + (sched || pub ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'),
                      color: sched ? theme.accentText : pub ? '#4ADE80' : '#5A5A63',
                    }}>{day}</span>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: theme.accent }} />Programmé
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: '#4ADE80' }} />Publié
                </span>
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        // Onglet Récurrent
        tasks.length === 0 ? (
          <Panel theme={theme}>
            <Empty icon="M4 4h16v16H4z|M9 16h6|M12 8V4H8"
              title="Aucune tâche automatique" text="Crée une tâche récurrente pour publier ou chauffer tes comptes automatiquement, jour après jour."
              action={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Nouvelle tâche" onClick={() => setCreateMode('recurring')} />} />
          </Panel>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map(t => {
              const active = t.status === 'active'
              const n = phoneCount(t.phones)
              const cadence = t.recur_hours ? `${n} téléphone${n > 1 ? 's' : ''} · toutes les ${t.recur_hours}h` : `${n} téléphone${n > 1 ? 's' : ''}`
              return (
                <Panel key={t.id} theme={theme}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    <Toggle on={active} disabled={busy === t.id} onChange={() => { if (busy !== t.id) toggleTask(t) }} label={t.name || 'Tâche automatique'} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#EDEDEF' : '#A1A1AA' }}>{t.name || 'Tâche automatique'}</span>
                      <span style={{ fontSize: 12, color: '#8B8B94' }}>{cadence}</span>
                    </span>
                    <Chip text={active ? 'active' : 'en pause'} tone={active ? 'ok' : 'mute'} />
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
                    borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap',
                  }}>
                    {taskSteps(t).map((sp, k) => (
                      <span key={k} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 8px', borderRadius: 5, boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: 11.5, fontWeight: 500, color: '#A1A1AA',
                      }}>
                        <span style={{ fontSize: 11, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{k + 1}</span>{sp}
                      </span>
                    ))}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
                      <span style={{ color: '#8B8B94' }}>Prochaine : <span style={{ color: '#EDEDEF', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{active ? whenLabel(t.next_run_at) : 'En pause'}</span></span>
                      <span style={{ color: '#8B8B94' }}>Crédits/jour : <span style={{ color: '#FBBF24', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{active ? taskCredits(t) : '—'}</span></span>
                    </span>
                  </div>
                </Panel>
              )
            })}
          </div>
        )
      )}

      {createMode && (
        <CreateTaskModal theme={theme} user={user} org={org} infra={infra} mode={createMode}
          onClose={() => setCreateMode(null)}
          onCreated={() => { setCreateMode(null); setTab(createMode === 'schedule' ? 'sched' : 'rec'); load() }} />
      )}
    </div>
  )
}
