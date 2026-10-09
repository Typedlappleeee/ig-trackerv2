import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { initI18n } from '@/lib/i18n'

// Langue chargée AVANT le premier rendu (pas de flash de français en mode anglais).
void initI18n().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
