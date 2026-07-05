import { useEffect, useState } from 'react'
import { getActiveRuns, subscribeActiveRuns, removeRun, type ActiveRun, type PhaseStatus } from '@/lib/activeRuns'

const PHASE_ICON: Record<PhaseStatus, string> = { idle: '○', running: '◔', done: '✓', error: '✕' }
const PHASE_COLOR: Record<PhaseStatus, string> = {
  idle: 'var(--text-4)', running: 'var(--accent)', done: 'var(--ok)', error: 'var(--danger)',
}

// Liste dépliable « quel téléphone a fini / est en cours » d'un run.
function PhaseList({ run }: { run: ActiveRun }) {
  if (!run.phones?.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, maxHeight: 160, overflow: 'auto' }}>
      {run.phones.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ color: PHASE_COLOR[p.status], width: 12, textAlign: 'center', ...(p.status === 'running' ? { animation: 'spin 1.2s linear infinite' } : {}) }}>{PHASE_ICON[p.status]}</span>
          <span style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
        </div>
      ))}
    </div>
  )
}

const TYPE_META: Record<ActiveRun['type'], { emoji: string; label: string }> = {
  mass:    { emoji: '🚀', label: 'Mass posting' },
  story:   { emoji: '📸', label: 'Story' },
  warmup:  { emoji: '🔥', label: 'Warmup' },
  threads: { emoji: '🧵', label: 'Threads' },
}

// Widget flottant (bas-droite) listant les postings en cours — visible sur toutes
// les pages, survit à la navigation et au refresh. Alerte si 2 runs partagent un proxy.
export function ActivePostingsWidget({ onOpen }: { onOpen?: (page: string) => void }) {
  const [runs, setRuns] = useState<ActiveRun[]>(getActiveRuns())
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => subscribeActiveRuns(() => setRuns(getActiveRuns())), [])

  if (runs.length === 0) return null

  // Détection de conflit : un proxy utilisé par ≥ 2 runs actifs en même temps.
  const proxyCount = new Map<string, number>()
  for (const r of runs) {
    if (r.status !== 'running') continue
    for (const k of new Set(r.proxyKeys)) proxyCount.set(k, (proxyCount.get(k) ?? 0) + 1)
  }
  const clashKeys = new Set([...proxyCount.entries()].filter(([, n]) => n >= 2).map(([k]) => k))
  const runClashes = (r: ActiveRun) => r.status === 'running' && r.proxyKeys.some(k => clashKeys.has(k))
  const anyClash = runs.some(runClashes)

  const runningCount = runs.filter(r => r.status === 'running').length

  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 90, width: open ? 320 : 'auto', maxWidth: 'calc(100vw - 36px)' }}>
      <div className="sf-card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: anyClash ? '1px solid rgba(239,68,68,0.5)' : '1px solid var(--border-md)' }}>
        {/* Header */}
        <button onClick={() => setOpen(o => !o)} className="cursor-pointer"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: 'none', background: anyClash ? 'rgba(239,68,68,0.10)' : 'var(--surface-2)', textAlign: 'left' }}>
          <span style={{ position: 'relative', display: 'flex' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: runningCount ? 'var(--ok)' : 'var(--text-4)' }} />
            {runningCount > 0 && <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: '2px solid var(--ok)', opacity: 0.5, animation: 'sf-pulse 1.6s ease-out infinite' }} />}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>
            {runningCount > 0 ? `${runningCount} posting${runningCount > 1 ? 's' : ''} en cours` : 'Postings'}
          </span>
          {anyClash && <span title="Deux postings sur le même proxy — risque de ban" style={{ fontSize: 11 }}>⚠️</span>}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{open ? '▾' : '▸'}</span>
        </button>

        {open && (
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            {anyClash && (
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--danger)', background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid var(--border)' }}>
                ⚠️ Deux postings tournent sur le <b>même proxy</b> → mêmes IP en parallèle, <b>risque de ban</b>. Attends la fin de l'un ou utilise un autre proxy.
              </div>
            )}
            {runs.map(r => {
              const m = TYPE_META[r.type]
              const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0
              const clash = runClashes(r)
              const color = r.status === 'error' ? 'var(--danger)' : r.status === 'done' ? 'var(--ok)' : 'var(--accent)'
              const hasPhases = Boolean(r.phones?.length)
              const isExp = expanded.has(r.id)
              return (
                <div key={r.id}
                  onClick={() => hasPhases ? toggleExpand(r.id) : r.page && onOpen?.(r.page)}
                  className={hasPhases || r.page ? 'cursor-pointer' : ''}
                  style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span>{m.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                    {clash && <span title="Même proxy qu'un autre run" style={{ fontSize: 10 }}>⚠️</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                      {r.status === 'running' ? `${r.done}/${r.total}` : r.status === 'done' ? '✓ terminé' : '✕ échec'}
                    </span>
                    {hasPhases && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{isExp ? '▾' : '▸'}</span>}
                    {r.status !== 'running' && (
                      <button onClick={e => { e.stopPropagation(); removeRun(r.id) }} className="cursor-pointer" style={{ border: 'none', background: 'transparent', color: 'var(--text-4)', fontSize: 12 }}>✕</button>
                    )}
                  </div>
                  <div style={{ height: 4, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${r.status === 'done' ? 100 : pct}%`, background: color, transition: 'width .3s' }} />
                  </div>
                  {hasPhases && isExp && <PhaseList run={r} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
