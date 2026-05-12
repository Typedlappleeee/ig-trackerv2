// Vite config for the Vercel/web build — no Electron plugin, no IPC.
import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // ffmpeg.wasm needs SharedArrayBuffer → must set COOP/COEP headers.
  // In dev mode Vite can set them; in production Vercel handles it via vercel.json.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // Don't pre-bundle ffmpeg — it must stay as an ES module
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    rollupOptions: {
      external: [],
    },
  },
})
