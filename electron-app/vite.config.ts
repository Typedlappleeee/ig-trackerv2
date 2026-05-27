import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Point d'entrée du processus principal Electron
        entry: 'electron/main.ts',
      },
      preload: {
        // Script de sécurité entre Electron et React
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Permet d'utiliser les modules Node.js dans le renderer si besoin
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // @ffmpeg packages use a 'node' export condition that maps to empty.mjs
      // in Electron context — tell Rollup not to try to bundle them
      external: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
    },
  },
})
