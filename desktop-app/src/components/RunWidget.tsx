import { createPortal } from 'react-dom'
import { useRuns, cancelRun, dismissRun, type RunState } from '@/lib/runStore'
import type { Theme } from '@/lib/theme'

// Widget flottant : suit tous les runs en cours, où que tu sois dans l'app.
// Barre de progression + bouton Annuler par run.
const KIND_LABEL: Record<string, string> = { reels: 'Reels', story: 'Story', cross: 'Cross-post', studio: 'Studio', auto: 'Auto-contenu', farm: 'Phone Farm' }

export default function RunWidget({ theme }: { theme: Theme }) {
  const runs = useRuns()
  if (runs.length === 0) return null
  return createPortal(
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 80, display: 'flex', flexDirection: 'column', gap: 8, width: 320, maxWidth: 'calc(100vw - 32px)' }}>
      {runs.map(r => <Row key={r.id} r={r} theme={theme} />)}
    </div>,
    document.body,
  )
}

function Row({ r, theme }: { r: RunState; theme: Theme }) {
  const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0
  const done = r.status !== 'running'
  const color = r.status === 'cancelled' ? '#F59E0B' : r.status === 'error' ? '#EF4444' : r.failed > 0 ? '#FBBF24' : '#34D399'
  return (
    <div style={{ borderRadius: 12, padding: '11px 13px', background: '#16161C', border: `1px solid ${done ? 'rgba(255,255,255,0.1)' : theme.selEdge}`, boxShadow: '0 18px 44px -18px rgba(0,0,0,0.8)', animation: 'aPop .2s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: color, boxShadow: r.status === 'running' ? `0 0 8px ${color}` : 'none' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: '#F4F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: theme.accentText }}>{KIND_LABEL[r.kind] ?? r.kind}</span> · {r.label}
        </span>
        {r.status === 'running'
          ? <button onClick={() => cancelRun(r.id)} style={{ height: 22, padding: '0 9px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#F87171', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Annuler</button>
          : <button onClick={() => dismissRun(r.id)} aria-label="Fermer" style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', color: '#71717A', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>✕</button>}
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width .25s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: '#71717A' }}>
        <span>{r.done}/{r.total}{r.failed > 0 ? ` · ${r.failed} échec${r.failed > 1 ? 's' : ''}` : ''}</span>
        <span style={{ color: done ? color : '#71717A', fontWeight: 700 }}>{r.status === 'running' ? (r.detail ?? `${pct}%`) : r.status === 'cancelled' ? 'Annulé' : r.status === 'error' ? 'Erreur' : 'Terminé'}</span>
      </div>
    </div>
  )
}
