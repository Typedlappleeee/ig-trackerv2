// Vite config for the Vercel/web build — no Electron plugin, no IPC.
import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // @ffmpeg/core (single-threaded) does NOT use SharedArrayBuffer and therefore
  // does NOT need COOP/COEP. Setting COEP require-corp blocks Supabase storage
  // fetches (net::ERR_FAILED 200 OK) because Supabase doesn't return CORP headers.
  server: {},
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
