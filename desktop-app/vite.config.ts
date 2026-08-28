import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// App desktop ScaleFlow (v10). Base relative pour un chargement via file:// (Electron)
// aussi bien que via un serveur statique.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5273 },
})
