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

// ── Rechargement propre après un déploiement (chunk manquant) ─────────────────
// Vite émet `vite:preloadError` quand un module lazy n'a pas pu être préchargé
// (fichier hashé disparu après un deploy). On recharge pour récupérer la nouvelle
// version, au lieu de laisser une erreur casser la fenêtre en cours d'ouverture.
// Couvre aussi les import() dans des handlers (non attrapés par l'ErrorBoundary).
import { isChunkError, reloadForChunk } from './components/ChunkErrorBoundary'
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadForChunk()
})
window.addEventListener('unhandledrejection', (e) => {
  const msg = e?.reason instanceof Error ? e.reason.message : String(e?.reason ?? '')
  if (isChunkError(msg)) { e.preventDefault(); reloadForChunk() }
})

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
            background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: '#fff',
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

