// Copie le moteur OCR Tesseract.js (worker + cœurs wasm LSTM) vers public/tesseract/
// avant le build. Évite de committer ~8 Mo de binaires : régénérés depuis node_modules.
// Les données de langue (eng.traineddata.gz, ~2 Mo) sont committées dans public/tesseract/.
import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dst = resolve(root, 'public/tesseract')
mkdirSync(dst, { recursive: true })

// 1. Worker
const worker = resolve(root, 'node_modules/tesseract.js/dist/worker.min.js')
if (!existsSync(worker)) { console.error('[copy-tesseract] worker introuvable:', worker); process.exit(1) }
copyFileSync(worker, resolve(dst, 'worker.min.js'))

// 2. Cœurs wasm LSTM (lstm / simd-lstm / relaxedsimd-lstm) + leurs loaders JS.
const coreDir = resolve(root, 'node_modules/tesseract.js-core')
const cores = readdirSync(coreDir).filter(f => /-lstm\.(wasm|js|wasm\.js)$/.test(f))
if (cores.length === 0) { console.error('[copy-tesseract] aucun cœur -lstm trouvé dans', coreDir); process.exit(1) }
for (const f of cores) copyFileSync(resolve(coreDir, f), resolve(dst, f))

console.log(`[copy-tesseract] worker + ${cores.length} fichiers cœur copiés dans public/tesseract/`)
