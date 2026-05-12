import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import './index.css'

// When running in a browser (Vercel/web), window.electronAPI doesn't exist.
// Inject a polyfill that routes all calls through Vercel API routes + ffmpeg.wasm.
if (!window.electronAPI) {
  import('./lib/webAPI').then(({ buildWebAPI }) => {
    // @ts-expect-error – patching the global
    window.electronAPI = buildWebAPI()
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
)

