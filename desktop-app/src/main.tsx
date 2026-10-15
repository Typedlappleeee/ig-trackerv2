import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import App from '@/App'
import { initI18n } from '@/lib/i18n'

// Nettoyage : copies locales de vidéos laissées par une version précédente (15 oct.) — on libère
// l'espace disque qu'elles occupaient. Sans effet si elles n'existent pas.
try { for (const n of ['sf-media', 'sf-media-2', 'sf-prefs']) indexedDB.deleteDatabase(n) } catch { /* ignore */ }

// Langue chargée AVANT le premier rendu (pas de flash de français en mode anglais).
void initI18n().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
