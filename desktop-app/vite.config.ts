import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { CHANGELOG } from './src/lib/changelog'

// Tampon de version : identifiant du build (commit Vercel, sinon horodatage) + date.
// Injecté dans le code (__BUILD_ID__/__BUILD_TIME__) et publié dans dist/version.json :
// un onglet ouvert compare les deux pour proposer de rafraîchir après un déploiement.
const BUILD_TIME = new Date().toISOString()
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || Date.now().toString(36)

function versionFile(): Plugin {
  return {
    name: 'sf-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID, builtAt: BUILD_TIME, changes: CHANGELOG.slice(0, 3) }) })
    },
  }
}

// App desktop ScaleFlow (v10). Base relative pour un chargement via file:// (Electron)
// aussi bien que via un serveur statique.
export default defineConfig({
  base: './',
  plugins: [react(), versionFile()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // @ffmpeg/ffmpeg crée son worker via `new Worker(new URL('./worker.js', import.meta.url))` :
  // exclu de l'optimizer pour que le plugin worker de Vite le résolve correctement (sinon 404 en dev).
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
  server: { port: 5273 },
})
