// iRemoTech › Posting : sessions lancées SUR LE SERVEUR (PC éteint) — état, progression, journal en direct, arrêt.
// Visible par toute l'agence (chacun voit les sessions de l'espace, qui les a lancées et où elles en sont).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { listServerRuns, fetchServerLogs, cancelServerRun, type ServerRun, type ServerLog } from '@/lib/irtServer'
import { confirmDialog } from '@/lib/ui'

const INK = '#EDEDEF', MUTED = '#8B8B94', DIM = '#6E6E78', EDGE = 'rgba(255,255,255,0.07)'
const btn: CSSProperties = { height: 28, padding: '0 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 500, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#E4E4E7' }
const STATUS: Record<ServerRun['status'], { t: string; c: string }> = {
  queued: { t: 'En attente du serveur', c: '#FCD34D' }, running: { t: 'En cours', c: '#60A5FA' }, done: { t: 'Terminée', c: '#4ADE80' },
  failed: { t: 'Interrompue', c: '#F87171' }, cancelled: { t: 'Arrêtée', c: MUTED },
}

export default function IrtServerRuns({ scope, refreshKey }: { scope: { orgId: string | null; userId: string }; refreshKey: number }) {
  const [runs, setRuns] = useState<ServerRun[] | null>([])
  const [open, setOpen] = useState<string | null>(null)
  const [logs, setLogs] = useState<ServerLog[]>([])
  const lastId = useRef(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const tick = () => void listServerRuns(scope).then(r => { if (alive) setRuns(r) })
    tick()
    const t = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [scope.orgId, scope.userId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // journal de la session ouverte, en direct (toutes les 3 s)
  useEffect(() => {
    setLogs([]); lastId.current = 0
    if (!open) return
    let alive = true
    const pull = async () => {
      const rows = await fetchServerLogs(open, lastId.current)
      if (!alive || !rows.length) return
      lastId.current = rows[rows.length - 1].id
      setLogs(l => [...l, ...rows].slice(-1500))
      requestAnimationFrame(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight })
    }
    void pull()
    const t = setInterval(() => void pull(), 3000)
    return () => { alive = false; clearInterval(t) }
  }, [open])

  if (runs === null) return null // tables pas encore créées
  if (!runs.length) return null
  return (
    <div style={{ marginTop: 14, borderRadius: 10, border: `1px solid ${EDGE}`, background: '#0E0E10', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 650, color: INK, borderBottom: `1px solid ${EDGE}` }}>☁ Sessions sur le serveur (PC éteint)</div>
      {runs.map(r => {
        const st = STATUS[r.status], p = r.progress ?? {}
        const live = r.status === 'running' || r.status === 'queued'
        return (
          <div key={r.id} style={{ borderTop: `1px solid ${EDGE}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: st.c, flex: 'none' }} />
              <span style={{ fontSize: 12.5, color: INK, fontWeight: 600 }} data-no-tr>{r.title ?? 'Session'}</span>
              <span style={{ fontSize: 12, color: st.c }}>{r.cancel_requested && r.status === 'running' ? 'Arrêt demandé…' : st.t}</span>
              <span style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{`${p.ok ?? 0} publié(s) · ${p.done ?? 0}/${p.total ?? 0}`}</span>
              <span style={{ fontSize: 11.5, color: DIM }} data-no-tr>{[r.created_by_name, new Date(r.created_at).toLocaleString()].filter(Boolean).join(' · ')}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button type="button" style={btn} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Masquer le journal' : 'Journal'}</button>
                {live && !r.cancel_requested && <button type="button" style={{ ...btn, color: '#F87171' }} onClick={() => void confirmDialog({ title: 'Arrêter cette session ?', text: 'Le post en cours se termine, puis le serveur s’arrête.', confirmLabel: 'Arrêter', danger: true }).then(ok => { if (ok) void cancelServerRun(r) })}>Arrêter</button>}
              </span>
            </div>
            {r.error && <div style={{ padding: '0 12px 8px 30px', fontSize: 12, color: '#F87171' }} data-no-tr>{r.error}</div>}
            {open === r.id && (
              <div ref={box} data-no-tr style={{ maxHeight: 340, overflow: 'auto', margin: '0 12px 12px', padding: 10, borderRadius: 8, background: '#09090A', border: `1px solid ${EDGE}`, fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, lineHeight: 1.55, color: '#C4C4CC', whiteSpace: 'pre-wrap' }}>
                {logs.length ? logs.map(l => <div key={l.id}>{l.line}</div>) : <span style={{ color: DIM }}>{r.status === 'queued' ? 'En attente qu’un serveur prenne la session…' : 'Pas encore de journal.'}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
