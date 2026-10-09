import { createPortal } from 'react-dom'
import { useRuns, cancelRun, dismissRun, type RunState } from '@/lib/runStore'
import type { Theme } from '@/lib/theme'

// Widget flottant : suit tous les runs en cours, où que tu sois dans l'app.
// Barre de progression + bouton Annuler par run.
const KIND_LABEL: Record<string, string> = { reels: 'Reels', story: 'Story', cross: 'Cross-post', studio: 'Studio', auto: 'Auto-contenu', farm: 'Phone Farm', flow: 'Flow' }

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
  const color = r.status === 'cancelled' ? '#FBBF24' : r.status === 'error' ? '#F87171' : r.failed > 0 ? '#FBBF24' : '#4ADE80'
  return (
    <div style={{ borderRadius: 8, padding: '12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)', animation: 'aPop .2s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: color, animation: r.status === 'running' ? 'aPulse 2s ease-in-out infinite' : 'none' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: theme.accentText }}>{KIND_LABEL[r.kind] ?? r.kind}</span> · {r.label}
        </span>
        {r.status === 'running'
          ? <button onClick={() => cancelRun(r.id)} style={{ height: 24, padding: '0 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', color: '#F87171', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>Annuler</button>
          : <button onClick={() => dismissRun(r.id)} aria-label="Fermer" style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', color: '#71717A', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>✕</button>}
      </div>
      <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width .25s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>
        <span>{r.done}/{r.total}{r.failed > 0 ? ` · ${r.failed} échec${r.failed > 1 ? 's' : ''}` : ''}</span>
        <span style={{ color: done ? color : '#71717A', fontWeight: 500 }}>{r.status === 'running' ? (r.detail ?? `${pct}%`) : r.status === 'cancelled' ? 'Annulé' : r.status === 'error' ? 'Erreur' : 'Terminé'}</span>
      </div>
    </div>
  )
}
