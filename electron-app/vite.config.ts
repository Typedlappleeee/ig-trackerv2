import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // @ffmpeg/ffmpeg and @ffmpeg/util use wasm which only runs in a real browser.
      // In the Electron renderer build, swap them for lightweight stubs so the
      // bundle doesn't break — the real FFmpeg work goes through IPC anyway.
      '@ffmpeg/ffmpeg': path.resolve(__dirname, './src/lib/stubs/ffmpeg-stub.ts'),
      '@ffmpeg/util':   path.resolve(__dirname, './src/lib/stubs/ffmpeg-util-stub.ts'),
    },
  },
})
