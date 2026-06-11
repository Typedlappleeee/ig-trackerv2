import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import './index.css'

// When running in a browser (Vercel/web), window.electronAPI doesn't exist.
// Inject the polyfill synchronously so it's ready before any component renders.
import { buildWebAPI } from './lib/webAPI'
if (!window.electronAPI) {
  // @ts-expect-error – patching the global
  window.electronAPI = buildWebAPI()
  // @ts-expect-error
  window.__IS_WEB = true
}

// ── Global Error Boundary ─────────────────────────────────────────────────────
interface EBState { error: Error | null }
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error): EBState { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ScaleFlow] Uncaught render error:', error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: '#05030f', color: '#e2e8f0', fontFamily: 'sans-serif', padding: 32,
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>Une erreur inattendue s'est produite</h1>
        <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0, maxWidth: 480, textAlign: 'center' }}>
          {this.state.error.message}
        </p>
        <button
          onClick={() => { this.setState({ error: null }); window.location.reload() }}
          style={{
            marginTop: 8, padding: '10px 24px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg,#C9B584,#B8A070)', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Recharger l'application
        </button>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

