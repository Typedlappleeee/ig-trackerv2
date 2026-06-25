import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: string }

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(err: unknown): State {
    const msg = err instanceof Error ? err.message : String(err)
    // Auto-reload on chunk load failures
    if (msg.includes('Failed to fetch') || msg.includes('dynamically imported') || msg.includes('ChunkLoadError')) {
      const key = 'chunk-reload-count'
      const count = Number(sessionStorage.getItem(key) ?? '0')
      if (count < 2) {
        sessionStorage.setItem(key, String(count + 1))
        window.location.reload()
      }
    }
    return { hasError: true, error: msg }
  }

  render() {
    if (this.state.hasError) {
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
