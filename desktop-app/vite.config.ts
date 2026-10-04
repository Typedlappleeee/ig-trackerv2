import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// App desktop ScaleFlow (v10). Base relative pour un chargement via file:// (Electron)
// aussi bien que via un serveur statique.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // @ffmpeg/ffmpeg crée son worker via `new Worker(new URL('./worker.js', import.meta.url))` :
  // exclu de l'optimizer pour que le plugin worker de Vite le résolve correctement (sinon 404 en dev).
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
  server: { port: 5273 },
})
