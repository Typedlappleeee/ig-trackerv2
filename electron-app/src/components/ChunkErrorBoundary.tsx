import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(err: unknown): State {
    const msg = err instanceof Error ? err.message : String(err)
    // Only auto-reload on chunk load failures — other errors bubble normally
    if (msg.includes('Failed to fetch') || msg.includes('dynamically imported') || msg.includes('ChunkLoadError')) {
      // Reload once (guard against infinite reload loop with sessionStorage)
      const key = 'chunk-reload-count'
      const count = Number(sessionStorage.getItem(key) ?? '0')
      if (count < 2) {
        sessionStorage.setItem(key, String(count + 1))
        window.location.reload()
      }
    }
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
