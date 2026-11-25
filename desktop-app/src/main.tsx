import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url'
import App from '@/App'
// Windows n'affiche pas les drapeaux emoji (🇫🇷 → « FR ») : police de drapeaux livrée avec l'appli, chargée seulement
// si le système ne sait pas les dessiner (limitée aux caractères de drapeaux, le reste du texte ne change pas).
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFontUrl)
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
