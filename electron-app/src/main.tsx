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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
)

