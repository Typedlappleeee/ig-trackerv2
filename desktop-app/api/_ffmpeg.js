// ffmpeg natif côté serveur (Vercel) : binaire de `ffmpeg-static` (inclus via vercel.json
// includeFiles), ou FFMPEG_PATH (tests / autre hébergement). Fichiers de travail dans /tmp.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let binP = null
async function ffmpegBin() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  if (!binP) binP = import('ffmpeg-static').then(m => m.default || m).catch(() => null)
  const p = await binP
  if (!p) throw Object.assign(new Error('moteur vidéo indisponible sur le serveur'), { status: 503, code: 'engine_unavailable' })
  return p
}

// Lance ffmpeg sur `input` (octets) → octets de sortie. `before` = options avant -i (rare).
export async function runFfmpeg(input, { inExt = 'mp4', outExt = 'mp4', args = [], timeoutMs = 50_000, extraOut = null } = {}) {
  const bin = await ffmpegBin()
  const dir = await mkdtemp(join(tmpdir(), 'sf-'))
  const inPath = join(dir, `in.${inExt}`), outPath = join(dir, `out.${outExt}`)
  try {
    await writeFile(inPath, input)
    const log = []
    const code = await new Promise((resolve, reject) => {
      const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', inPath, ...args, outPath], { stdio: ['ignore', 'ignore', 'pipe'] })
      const t = setTimeout(() => { p.kill('SIGKILL'); reject(Object.assign(new Error('traitement trop long pour le serveur (vidéo trop longue ?)'), { status: 504, code: 'timeout' })) }, timeoutMs)
      p.stderr.on('data', d => { if (log.length < 50) log.push(String(d)) })
      p.on('error', e => { clearTimeout(t); reject(e) })
      p.on('close', c => { clearTimeout(t); resolve(c) })
    })
    if (code !== 0) throw Object.assign(new Error(`ffmpeg a échoué : ${log.join('').trim().split('\n').slice(-2).join(' ').slice(0, 300) || `code ${code}`}`), { status: 422, code: 'process_failed' })
    const out = await readFile(outPath)
    let extra = null
    if (extraOut) {                         // ex. miniature tirée de la sortie (2e passe rapide)
      const thumb = join(dir, 'thumb.jpg')
      await new Promise(resolve => {
        const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.3', '-i', outPath, '-frames:v', '1', '-vf', "scale='min(480,iw)':-2", '-q:v', '5', thumb], { stdio: 'ignore' })
        const t = setTimeout(() => { p.kill('SIGKILL'); resolve() }, 8000)
        p.on('close', () => { clearTimeout(t); resolve() })
        p.on('error', () => { clearTimeout(t); resolve() })
      })
      extra = await readFile(thumb).catch(() => null)
    }
    return { out, thumb: extra }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
