import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; chunk: boolean; error?: string }

// Messages d'échec de chargement d'un chunk dynamique, tous navigateurs confondus.
// Survient surtout après un déploiement : l'app ouverte référence d'anciens fichiers
// hashés qui n'existent plus → l'import() d'une page/fenêtre lazy échoue.
const CHUNK_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'dynamically imported module',
  'ChunkLoadError',
  'Loading chunk',
  'Loading CSS chunk',
  'Failed to fetch',
  'Load failed',
  'Unable to preload',
]

export function isChunkError(msg: string): boolean {
  return CHUNK_PATTERNS.some(p => msg.includes(p))
}

// Recharge l'app sur un échec de chunk, avec garde anti-boucle à fenêtre glissante :
// on tolère quelques reloads rapprochés (plusieurs déploiements d'affilée), mais on
// stoppe une vraie boucle infinie. Le compteur se réinitialise si le dernier reload
// date de plus de 30 s (donc un 2e déploiement plus tard dans la session marche encore).
export function reloadForChunk(): boolean {
  const now  = Date.now()
  const last = Number(sessionStorage.getItem('chunk-reload-ts') ?? '0')
  let count  = Number(sessionStorage.getItem('chunk-reload-count') ?? '0')
  if (now - last > 30_000) count = 0
  if (count < 3) {
    sessionStorage.setItem('chunk-reload-count', String(count + 1))
    sessionStorage.setItem('chunk-reload-ts', String(now))
    window.location.reload()
    return true
  }
  return false
}

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, chunk: false }

  static getDerivedStateFromError(err: unknown): State {
    const msg = err instanceof Error ? err.message : String(err)
    const chunk = isChunkError(msg)
    if (chunk) reloadForChunk()
    return { hasError: true, chunk, error: msg }
  }

  render() {
    if (this.state.hasError) {
      // Échec de chunk → écran de mise à jour discret (pas une erreur rouge).
      // Affiché brièvement pendant le reload, ou avec un bouton si la garde a stoppé.
      if (this.state.chunk) {
        return (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100vh', gap: 18, background: '#0A0B0E', color: '#E9EAF0',
            fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '3px solid rgba(233,234,240,0.15)', borderTopColor: '#6366F1',
              animation: 'sf-cb-spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>Mise à jour de l'application…</div>
            <button
              onClick={() => { sessionStorage.removeItem('chunk-reload-count'); window.location.reload() }}
              style={{
                padding: '9px 20px', borderRadius: 8, background: '#6366F1', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >Recharger maintenant</button>
            <style>{'@keyframes sf-cb-spin{to{transform:rotate(360deg)}}'}</style>
          </div>
        )
      }
      return (
        <div style={{ padding: 32, color: '#f87171', fontFamily: 'monospace', fontSize: 13 }}>
          <strong>Erreur de rendu</strong>
          {this.state.error && (
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.8 }}>
              {this.state.error}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
