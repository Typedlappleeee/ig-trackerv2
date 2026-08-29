// Copie le cœur ffmpeg.wasm (UMD) vers public/ffmpeg/ avant le build.
// Évite de committer le binaire de 32 Mo : il est régénéré depuis node_modules.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules/@ffmpeg/core/dist/umd')
const dst = resolve(root, 'public/ffmpeg')
mkdirSync(dst, { recursive: true })
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const s = resolve(src, f)
  if (!existsSync(s)) { console.error('[copy-ffmpeg] introuvable:', s); process.exit(1) }
  copyFileSync(s, resolve(dst, f))
}
console.log('[copy-ffmpeg] cœur ffmpeg.wasm copié dans public/ffmpeg/')
