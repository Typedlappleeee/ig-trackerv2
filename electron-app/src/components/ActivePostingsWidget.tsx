import { useEffect, useRef, useState } from 'react'
import { getActiveRuns, subscribeActiveRuns, removeRun, type ActiveRun, type PhaseStatus } from '@/lib/activeRuns'
import { supabase } from '@/lib/supabase'

// Post serveur en cours (scheduled_posts pending/running) — pour les voir dans le
// suivi même quand ça tourne côté serveur (PC éteignable).
interface ServerRun { id: string; type: string; label: string; done: number; total: number }
const SRV_META: Record<string, { emoji: string; label: string }> = {
  mass_posting: { emoji: '🚀', label: 'Mass posting' },
  posting:      { emoji: '🚀', label: 'Posting' },
  story:        { emoji: '📸', label: 'Story' },
  tiktok:       { emoji: '🎵', label: 'TikTok' },
}

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
const POS_KEY = 'sf-widget-pos'

export function ActivePostingsWidget({ onOpen, orgId, userId }: { onOpen?: (page: string) => void; orgId?: string | null; userId?: string }) {
  const [runs, setRuns] = useState<ActiveRun[]>(getActiveRuns())
  const [serverRuns, setServerRuns] = useState<ServerRun[]>([])

  // Poll des posts serveur en cours (pending échu / running) toutes les 15 s.
  useEffect(() => {
    if (!userId) return
    let alive = true
    const fetchServer = async () => {
      try {
        let q = supabase.from('scheduled_posts')
          .select('id, type, status, scheduled_at, phones, result')
          .in('status', ['pending', 'running'])
        q = orgId ? q.eq('org_id', orgId) : q.eq('user_id', userId).is('org_id', null)
        const { data } = await q
        if (!alive) return
        const now = Date.now()
        const rows: ServerRun[] = (data ?? []).flatMap((r: Record<string, unknown>) => {
          // Un post pending PROGRAMMÉ dans le futur n'est pas "en cours".
          const at = r['scheduled_at'] ? new Date(r['scheduled_at'] as string).getTime() : 0
          if (r['status'] === 'pending' && at > now + 30_000) return []
          const phones = typeof r['phones'] === 'string' ? JSON.parse(r['phones'] as string) : (r['phones'] ?? [])
          const total = Array.isArray(phones) ? phones.length : 0
          const res = (typeof r['result'] === 'string' ? JSON.parse(r['result'] as string) : r['result']) as Record<string, any> ?? {}
          const done = (res?.story_progress?.done ?? res?.mass_progress?.done ?? []).length
          const m = SRV_META[r['type'] as string] ?? { emoji: '🖥️', label: String(r['type']) }
          return [{ id: r['id'] as string, type: r['type'] as string, label: `${m.label} · ${total} compte${total > 1 ? 's' : ''}`, done, total }]
        })
        setServerRuns(rows)
      } catch { /* réseau — on réessaie au prochain tick */ }
    }
    fetchServer()
    const t = setInterval(fetchServer, 15_000)
    return () => { alive = false; clearInterval(t) }
  }, [orgId, userId])
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Position libre (déplaçable). null = coin bas-droite par défaut.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try { const r = localStorage.getItem(POS_KEY); return r ? JSON.parse(r) : null } catch { return null }
  })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  function onDragStart(e: React.PointerEvent) {
    e.preventDefault()
    const el = (e.currentTarget as HTMLElement).closest('[data-widget]') as HTMLElement
    const rect = el.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const W = el.offsetWidth, H = el.offsetHeight
      const x = Math.max(6, Math.min(window.innerWidth - W - 6, ev.clientX - dragRef.current.dx))
      const y = Math.max(6, Math.min(window.innerHeight - H - 6, ev.clientY - dragRef.current.dy))
      setPos({ x, y })
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPos(p => { if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch { /* quota */ } } return p })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  function resetPos() { setPos(null); try { localStorage.removeItem(POS_KEY) } catch { /* ignore */ } }

  useEffect(() => subscribeActiveRuns(() => setRuns(getActiveRuns())), [])

  if (runs.length === 0 && serverRuns.length === 0) return null

  // Détection de conflit : un proxy utilisé par ≥ 2 runs actifs en même temps.
  const proxyCount = new Map<string, number>()
  for (const r of runs) {
    if (r.status !== 'running') continue
    for (const k of new Set(r.proxyKeys)) proxyCount.set(k, (proxyCount.get(k) ?? 0) + 1)
  }
  const clashKeys = new Set([...proxyCount.entries()].filter(([, n]) => n >= 2).map(([k]) => k))
  const runClashes = (r: ActiveRun) => r.status === 'running' && r.proxyKeys.some(k => clashKeys.has(k))
  const anyClash = runs.some(runClashes)

  const runningCount = runs.filter(r => r.status === 'running').length + serverRuns.length

  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { bottom: 18, right: 18 }

  return (
    <div data-widget style={{ position: 'fixed', ...posStyle, zIndex: 90, width: open ? 320 : 'auto', maxWidth: 'calc(100vw - 36px)' }}>
      <div className="sf-card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: anyClash ? '1px solid rgba(239,68,68,0.5)' : '1px solid var(--border-md)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', background: anyClash ? 'rgba(239,68,68,0.10)' : 'var(--surface-2)' }}>
          {/* Poignée de déplacement */}
          <span onPointerDown={onDragStart} title="Glisser pour déplacer" className="cursor-pointer"
            style={{ padding: '10px 4px 10px 10px', color: 'var(--text-4)', fontSize: 13, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}>⠿</span>
          <button onClick={() => setOpen(o => !o)} className="cursor-pointer"
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 10px 4px', border: 'none', background: 'transparent', textAlign: 'left' }}>
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
          {pos && <button onClick={resetPos} title="Remettre en bas à droite" className="cursor-pointer" style={{ border: 'none', background: 'transparent', color: 'var(--text-4)', fontSize: 12, padding: '10px 10px 10px 4px' }}>⟲</button>}
        </div>

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

            {/* Posts SERVEUR en cours (PC éteignable) */}
            {serverRuns.map(s => {
              const m = SRV_META[s.type] ?? { emoji: '🖥️', label: s.type }
              const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
              return (
                <div key={`srv-${s.id}`} onClick={() => onOpen?.('history')} className="cursor-pointer"
                  style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span>{m.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: 'rgba(52,211,153,0.14)', color: 'var(--ok)', border: '1px solid rgba(52,211,153,0.3)', flexShrink: 0 }}>SERVEUR</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                      {s.total > 0 ? `${s.done}/${s.total}` : 'en cours'}
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.total > 0 ? pct : 30}%`, background: 'var(--accent)', transition: 'width .3s', ...(s.total === 0 ? { animation: 'sf-pulse 1.6s ease-in-out infinite' } : {}) }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
