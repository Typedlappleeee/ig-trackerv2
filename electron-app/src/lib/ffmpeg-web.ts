// ── ffmpeg.wasm wrappers ─────────────────────────────────────────────────────
// Mirrors the Electron IPC handlers for FFmpeg operations.
// Uses @ffmpeg/ffmpeg v0.12 which runs entirely in the browser via WebAssembly.
import { supabase } from './supabase'

// @ts-ignore – @ffmpeg/ffmpeg uses a 'node' export condition that hides types on Windows/Electron builds
import { FFmpeg } from '@ffmpeg/ffmpeg'
// @ts-ignore
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let _ffmpeg: FFmpeg | null = null
let _loading: Promise<FFmpeg> | null = null

// Global exec lock — wasm FFmpeg is NOT thread-safe. Serialise all ff.exec()
// calls so concurrent callers don't corrupt the shared wasm memory.
let _execTail: Promise<void> = Promise.resolve()
function withFfmpegLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void
  const prev = _execTail
  _execTail = new Promise<void>(r => { release = r })
  return prev.then(fn).then(
    v  => { release(); return v },
    e  => { release(); throw e  },
  )
}

// Detect WASM-level crashes that corrupt the FFmpeg instance irreversibly
function isWasmCrash(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err)
  return /memory access out of bounds|RuntimeError|Aborted|unreachable|out of memory|OOM/i.test(msg)
}

// Invalidate the singleton so the next getFFmpeg() call creates a fresh WASM instance
function resetFFmpeg(): void {
  _ffmpeg = null
  _loading = null
}

// Singleton FFmpeg instance — loaded once, reused across calls.
async function getFFmpeg(): Promise<FFmpeg> {
  if (_ffmpeg) return _ffmpeg
  if (_loading) return _loading

  _loading = (async () => {
    try {
      const ff = new FFmpeg()
      const base = `${location.origin}/ffmpeg`

      await ff.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      })

      // Write fonts into WASM virtual FS so drawtext can use fontfile=
      // (no system fonts exist in the WASM sandbox; fontname-based lookup always fails)
      // Written to root '/' so fontfile=/font-bold.ttf always resolves regardless of cwd
      const loadFont = async (name: string) => {
        const r = await fetch(`${base}/${name}`)
        if (!r.ok) throw new Error(`Font fetch failed: ${name} (HTTP ${r.status})`)
        await ff.writeFile(`/${name}`, new Uint8Array(await r.arrayBuffer()))
      }
      await loadFont('font-bold.ttf')
      await loadFont('font.ttf')

      _ffmpeg = ff
      return ff
    } catch (err) {
      _loading = null  // allow retry on next call
      throw err
    }
  })()

  return _loading
}

// Global blob registry — keyed by blob URL, holds the original Blob/File.
// Using window ensures a single shared instance regardless of module bundling.
// This lets writeInput() use FileReader (completely COEP/CORS-immune) instead
// of fetch() or XHR which both fail under strict COEP require-corp.
function blobReg(): Map<string, Blob> {
  const w = window as any
  if (!w.__ffmpegBlobReg) w.__ffmpegBlobReg = new Map<string, Blob>()
  return w.__ffmpegBlobReg
}

export function registerBlob(url: string, blob: Blob): void {
  blobReg().set(url, blob)
}

// Write a file into ffmpeg's virtual FS.
// For blob:/data: URLs, use the cached Blob via FileReader (no network call at all).
// FileReader is completely immune to COEP/CORS/security-policy restrictions.
async function writeInput(ff: FFmpeg, name: string, url: string): Promise<void> {
  let data: Uint8Array
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const blob = blobReg().get(url)
    if (blob) {
      data = await fetchFile(blob)  // uses FileReader internally — no fetch/XHR
    } else {
      // Fallback: blob not in registry (shouldn't happen), read via FileReader anyway
      const resp = await fetch(url)
      const ab = await resp.arrayBuffer()
      data = new Uint8Array(ab)
    }
  } else {
    data = await fetchFile(url)
  }
  await ff.writeFile(name, data)
}

// Read output from ffmpeg's virtual FS and return a blob URL for download.
async function readOutput(ff: FFmpeg, name: string, mimeType = 'video/mp4'): Promise<string> {
  const data = await ff.readFile(name) as Uint8Array
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType })
  return URL.createObjectURL(blob)
}

// Trigger a file download in the browser.
export function downloadBlob(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

// ── readVideoMetadata ────────────────────────────────────────────────────────
export async function readVideoMetadataWeb(filePath: string): Promise<{
  ok: boolean; duration?: number; width?: number; height?: number; error?: string
}> {
  const ff = await getFFmpeg()
  await ff.deleteFile('probe.mp4').catch(() => {})
  try {
    await writeInput(ff, 'probe.mp4', filePath)
    const logs: string[] = []
    const logHandler = ({ message }: { message: string }) => logs.push(message)
    ff.on('log', logHandler)
    await ff.exec(['-i', 'probe.mp4', '-f', 'null', '-']).catch(() => {})
    ff.off('log', logHandler)
    const combined = logs.join('\n')
    const durM  = combined.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
    const dimM  = combined.match(/,\s*(\d{2,5})x(\d{2,5})/)
    const duration = durM
      ? parseInt(durM[1]) * 3600 + parseInt(durM[2]) * 60 + parseFloat(durM[3])
      : undefined
    return { ok: true, duration, width: dimM ? parseInt(dimM[1]) : undefined, height: dimM ? parseInt(dimM[2]) : undefined }
  } catch (err) {
    return { ok: false, error: String(err) }
  } finally {
    await ff.deleteFile('probe.mp4').catch(() => {})
  }
}

// ── runFfmpeg (Montage concat) ────────────────────────────────────────────────
export async function runFfmpegWeb(opts: {
  clips:      Array<{ filePath: string; trimStart: number; trimEnd: number }>
  outputPath: string
  preset:     '9:16' | '1:1' | '16:9'
  transition: 'cut' | 'fade'
}): Promise<{ ok: boolean; outputPath?: string; command?: string; error?: string }> {
  const n  = opts.clips.length
  const ff = await getFFmpeg()
  for (let i = 0; i < n; i++) await ff.deleteFile(`in${i}.mp4`).catch(() => {})
  await ff.deleteFile('output.mp4').catch(() => {})
  try {
    const scale = opts.preset === '9:16'  ? 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black'
                : opts.preset === '1:1'   ? 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:-1:-1:color=black'
                :                           'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black'
    for (let i = 0; i < n; i++) await writeInput(ff, `in${i}.mp4`, opts.clips[i].filePath)
    const inputs: string[] = []
    const filterParts: string[] = []
    opts.clips.forEach((c, i) => {
      const end = c.trimEnd > 0 ? c.trimEnd : 999999
      inputs.push('-ss', String(c.trimStart), '-to', String(end), '-i', `in${i}.mp4`)
      filterParts.push(`[${i}:v]${scale},setsar=1[v${i}];[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`)
    })
    const concatIn = opts.clips.map((_, i) => `[v${i}][a${i}]`).join('')
    filterParts.push(`${concatIn}concat=n=${n}:v=1:a=1[vout][aout]`)
    await ff.exec([
      ...inputs,
      '-filter_complex', filterParts.join(';'),
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-r', '30',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', 'output.mp4',
    ])
    const url = await readOutput(ff, 'output.mp4')
    return { ok: true, outputPath: url }
  } catch (err) {
    if (isWasmCrash(err)) resetFFmpeg()
    return { ok: false, error: String(err) }
  } finally {
    for (let i = 0; i < n; i++) await ff.deleteFile(`in${i}.mp4`).catch(() => {})
    await ff.deleteFile('output.mp4').catch(() => {})
  }
}

// ── captureFrameAtTime ────────────────────────────────────────────────────────
// Seeks a <video> element to `t` and draws 64×64 pixels onto a canvas.
// Returns null if the seek times out (3 s) or fails.
function captureFrameAtTime(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  t: number,
): Promise<Uint8ClampedArray | null> {
  return new Promise(res => {
    const tid = setTimeout(() => { video.onseeked = null; res(null) }, 3000)
    video.onseeked = () => {
      clearTimeout(tid)
      video.onseeked = null
      ctx.drawImage(video, 0, 0, 64, 64)
      res(ctx.getImageData(0, 0, 64, 64).data)
    }
    video.currentTime = t
  })
}

// ── detectSceneChange ─────────────────────────────────────────────────────────
// Uses the browser's native video decoder + Canvas API to compare frames.
// No WASM copy needed — avoids loading the whole file into WASM memory.
// Returns {ok:false} when no meaningful scene change is found (no fallback cut).
export async function detectSceneChangeWeb(opts: {
  filePath: string; threshold?: number
}): Promise<{ ok: boolean; splitTime?: number; duration?: number; error?: string }> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'
    video.src = opts.filePath

    const globalTimeout = setTimeout(() => {
      video.src = ''
      resolve({ ok: false, error: 'Timeout chargement vidéo' })
    }, 25_000)

    video.onloadedmetadata = async () => {
      const duration = video.duration
      if (!isFinite(duration) || duration < 1) {
        clearTimeout(globalTimeout)
        video.src = ''
        resolve({ ok: false, error: 'Durée invalide', duration: 0 })
        return
      }

      const W = 64, H = 64
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!

      // Sample up to 10 timestamps spread across the video
      const maxSamples = 10
      const step = duration / maxSamples
      const times = Array.from({ length: maxSamples }, (_, i) => (i + 0.5) * step)

      const frames: Array<{ t: number; data: Uint8ClampedArray }> = []
      for (const t of times) {
        const data = await captureFrameAtTime(video, ctx, t)
        if (data) frames.push({ t, data })
      }

      clearTimeout(globalTimeout)

      if (frames.length < 4) {
        video.src = ''
        resolve({ ok: false, error: 'Pas assez de frames capturées', duration })
        return
      }

      // Compute normalised RGB diff between consecutive frames
      const pixelCount = W * H
      const frameDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
        let diff = 0
        for (let j = 0; j < a.length; j += 4) {
          diff += Math.abs(b[j] - a[j]) + Math.abs(b[j + 1] - a[j + 1]) + Math.abs(b[j + 2] - a[j + 2])
        }
        return diff / (pixelCount * 3 * 255)
      }
      // Require a big background/location change: threshold 0.30 = 30% avg pixel shift.
      // Minor motion or lighting changes stay < 0.15, real scene cuts are 0.30+.
      const threshold = opts.threshold ?? 0.30

      // Find the FIRST consecutive-frame transition above threshold (the first
      // scene change), not the global maximum — the cut must land on the first
      // moment the original video changes scene.
      let firstIdx = -1
      for (let i = 1; i < frames.length; i++) {
        if (frameDiff(frames[i - 1].data, frames[i].data) > threshold) { firstIdx = i; break }
      }

      if (firstIdx === -1) {
        video.src = ''
        resolve({ ok: false, error: 'Aucun changement de scène détecté', duration })
        return
      }

      // Refine: the change happened somewhere in (frames[firstIdx-1].t, frames[firstIdx].t].
      // Binary-search for the earliest time whose frame already differs from the
      // pre-change reference, so the cut is precise (~0.05s) instead of grid-quantised.
      const ref = frames[firstIdx - 1].data
      let lo = frames[firstIdx - 1].t   // still old scene
      let hi = frames[firstIdx].t       // already new scene
      for (let k = 0; k < 6 && hi - lo > 0.05; k++) {
        const mid = (lo + hi) / 2
        const data = await captureFrameAtTime(video, ctx, mid)
        if (data && frameDiff(ref, data) > threshold) hi = mid
        else lo = mid
      }

      const splitTime = Math.round(Math.min(hi, duration - 0.033) * 1000) / 1000
      video.src = ''
      resolve({ ok: true, splitTime, duration })
    }

    video.onerror = () => {
      clearTimeout(globalTimeout)
      resolve({ ok: false, error: 'Impossible de charger la vidéo' })
    }
  })
}

// ── detectBeatDrop ────────────────────────────────────────────────────────────
// Finds the music beat drop by analyzing audio RMS energy in 100ms windows.
// The beat drop = the moment where audio energy increases the most (steepest rise).
// Returns the timestamp of the steepest energy increase, or null if not found.
export async function detectBeatDropWeb(filePath: string): Promise<{
  ok: boolean; splitTime?: number; duration?: number; error?: string
}> {
  const ff = await getFFmpeg()
  await ff.deleteFile('beat_in.mp4').catch(() => {})
  await ff.deleteFile('beat_audio.raw').catch(() => {})

  const logs: string[] = []
  const logHandler = ({ message }: { message: string }) => logs.push(message)

  try {
    await writeInput(ff, 'beat_in.mp4', filePath)

    // Get duration
    ff.on('log', logHandler)
    await ff.exec(['-hide_banner', '-i', 'beat_in.mp4', '-f', 'null', '-']).catch(() => {})
    ff.off('log', logHandler)
    const durM = logs.join('\n').match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
    const duration = durM ? parseInt(durM[1]) * 3600 + parseInt(durM[2]) * 60 + parseFloat(durM[3]) : 0
    if (duration < 1) return { ok: false, error: 'Vidéo trop courte' }

    // Extract mono audio at 4000Hz (lightweight — only need amplitude envelope)
    await ff.exec([
      '-hide_banner', '-i', 'beat_in.mp4',
      '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', '-y', 'beat_audio.raw',
    ])

    const raw = await ff.readFile('beat_audio.raw') as Uint8Array
    const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2))
    const SR = 4000

    // Compute RMS energy in 100ms windows
    const WIN = Math.floor(SR * 0.1)
    const nWin = Math.floor(samples.length / WIN)
    if (nWin < 4) return { ok: true, splitTime: duration / 2, duration }

    const rms: number[] = []
    for (let i = 0; i < nWin; i++) {
      let sum = 0
      for (let j = i * WIN; j < (i + 1) * WIN; j++) sum += (samples[j] / 32768) ** 2
      rms.push(Math.sqrt(sum / WIN))
    }

    // Smooth over 3 windows to reduce noise
    const smoothed = rms.map((v, i) =>
      (rms[Math.max(0, i - 1)] + v + rms[Math.min(nWin - 1, i + 1)]) / 3
    )

    // Find the steepest upward energy rise (beat drop signature)
    // Skip first and last 10% of the video (transitions near edges are usually not the intended split)
    const skip = Math.floor(nWin * 0.10)
    let maxRise = 0, bestWin = Math.floor(nWin / 2)
    for (let i = skip + 1; i < nWin - skip; i++) {
      const rise = smoothed[i] - smoothed[i - 1]
      if (rise > maxRise) { maxRise = rise; bestWin = i }
    }

    // Require a meaningful energy jump — below this it's just background noise, not a beat drop
    if (maxRise < 0.03) return { ok: false, error: 'No beat drop detected', duration }

    const detected = Math.round((bestWin * 0.1) * 1000) / 1000  // 0.1s per window
    const splitTime = Math.round(Math.min(detected + 0.5, duration - 0.033) * 1000) / 1000
    return { ok: true, splitTime, duration }

  } catch (err) {
    if (isWasmCrash(err)) resetFFmpeg()
    return { ok: false, error: String(err) }
  } finally {
    ff.off('log', logHandler)
    await ff.deleteFile('beat_in.mp4').catch(() => {})
    await ff.deleteFile('beat_audio.raw').catch(() => {})
  }
}

// ── runFfmpegRemix ────────────────────────────────────────────────────────────
export async function runFfmpegRemixWeb(opts: {
  originalPath:  string
  newPhase1Path: string
  splitTime:     number
  outputPath:    string
  textBlend:     number
  blendMode:     'screen' | 'multiply'
  preset:        '9:16' | '1:1' | '16:9'
}): Promise<{ ok: boolean; outputPath?: string; command?: string; error?: string }> {
  const FILES = ['orig.mp4', 'new1.mp4', 'remix_out.mp4']
  const ff = await getFFmpeg()
  for (const f of FILES) await ff.deleteFile(f).catch(() => {})
  try {
    await writeInput(ff, 'orig.mp4', opts.originalPath)
    await writeInput(ff, 'new1.mp4', opts.newPhase1Path)
    const W = opts.preset === '16:9' ? 1920 : 1080
    const H = opts.preset === '9:16' ? 1920 : 1080
    const scl  = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1`
    const afmt = 'aformat=sample_rates=44100:channel_layouts=stereo'
    let filterComplex: string
    if (opts.textBlend > 0) {
      const lkTol = Math.min(0.5, Math.max(0.1, opts.textBlend))
      filterComplex = [
        `[1:v]split=2[ov_a][ov_b]`,
        `[1:a]asplit=2[ao1][ao2]`,
        `[0:v]trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_new]`,
        `[ov_a]trim=end=${opts.splitTime},setpts=PTS-STARTPTS,${scl},lumakey=threshold=0:tolerance=${lkTol}:softness=0.05[text_key]`,
        `[v_new][text_key]overlay=format=auto[v_blended]`,
        `[ov_b]trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[ao1]atrim=end=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
        `[ao2]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
        `[v_blended][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
      ].join(';')
    } else {
      filterComplex = [
        `[0:v]trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p1]`,
        `[1:v]trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[1:a]asplit=2[ao1][ao2]`,
        `[ao1]atrim=end=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
        `[ao2]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
        `[v_p1][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
      ].join(';')
    }
    await ff.exec([
      '-i', 'new1.mp4', '-i', 'orig.mp4',
      '-filter_complex', filterComplex,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
      '-r', '30',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', 'remix_out.mp4',
    ])
    const url = await readOutput(ff, 'remix_out.mp4', 'video/mp4')
    return { ok: true, outputPath: url }
  } catch (err) {
    if (isWasmCrash(err)) resetFFmpeg()
    return { ok: false, error: String(err) }
  } finally {
    for (const f of FILES) await ff.deleteFile(f).catch(() => {})
  }
}

// ── Canvas text renderer (replaces drawtext — not available in this WASM build) ──
// Extracts the center fraction from FFmpeg position expressions.
// Expressions always follow the pattern: w*FRAC-text_w/2 or h*FRAC-text_h/2
// Parses FFmpeg drawtext x/y expressions → Canvas draw params.
// FFmpeg x = LEFT edge of text; y = TOP edge of text.
// We convert to the Canvas textAlign/textBaseline='middle' equivalents.

// For x: returns { align, x } where x is the Canvas anchor coordinate.
function getXDrawParams(expr: string, W: number): { align: CanvasTextAlign; x: number } {
  const e = expr.trim()
  // center: (w-text_w)/2 or (w/2)
  if (/^\(w-text_w\)\/2$/.test(e) || /^\(w\s*\/\s*2\)$/.test(e)) return { align: 'center', x: W * 0.5 }
  // right-aligned: w*FRAC-text_w  → Canvas right anchor at W*FRAC
  const rm = e.match(/^w\s*\*\s*([0-9.]+)\s*-\s*text_w$/)
  if (rm) return { align: 'right', x: W * parseFloat(rm[1]) }
  // left-aligned: w*FRAC  → Canvas left anchor at W*FRAC
  const lm = e.match(/^w\s*\*\s*([0-9.]+)/)
  if (lm) return { align: 'left', x: W * parseFloat(lm[1]) }
  return { align: 'center', x: W * 0.5 }
}

// For y: FFmpeg y = h*FRAC - fontSize/2 → center = H*FRAC (middle baseline).
function getYCenter(expr: string, H: number): number {
  const e = expr.trim()
  if (/^\(h-text_h\)\/2$/.test(e) || /^\(h\s*\/\s*2\)$/.test(e)) return H * 0.5
  const m = e.match(/^h\s*\*\s*([0-9.]+)/)
  if (m) return H * parseFloat(m[1])
  return H * 0.5
}

// Word-wrap text to fit within maxWidth pixels, returns array of lines
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      // Single word wider than maxWidth — push as-is (better than infinite loop)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

async function renderTextPNG(
  ff: FFmpeg,
  ov: { text: string; x: string; y: string; fontSize: number; fontColor: string; bold?: boolean; shadow?: boolean },
  W: number, H: number,
  fileName: string,
): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const weight = ov.bold ? 'bold' : 'normal'
  ctx.font = `${weight} ${ov.fontSize}px Arial, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign    = 'center'

  const cx = W / 2
  const cy = getYCenter(ov.y, H)

  const maxWidth  = W * 0.78
  const lineH     = ov.fontSize * 1.35
  const borderPx  = Math.max(3, Math.round(ov.fontSize * 0.09))
  const lines     = wrapText(ctx, ov.text, maxWidth)
  const blockH    = lines.length * lineH
  const startY    = cy - blockH / 2 + lineH / 2

  const drawLine = (line: string, ly: number, stroke: boolean) => {
    if (stroke) ctx.strokeText(line, cx, ly)
    else        ctx.fillText(line, cx, ly)
  }

  ctx.strokeStyle = 'rgba(0,0,0,1)'
  ctx.lineWidth   = borderPx * 2
  ctx.lineJoin    = 'round'
  if (ov.shadow !== false) {
    ctx.shadowColor   = 'rgba(0,0,0,0.8)'
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; ctx.shadowBlur = 6
  }
  lines.forEach((line, i) => drawLine(line, startY + i * lineH, true))

  ctx.shadowColor = 'transparent'
  ctx.fillStyle   = ov.fontColor || 'white'
  lines.forEach((line, i) => drawLine(line, startY + i * lineH, false))

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png'),
  )
  await ff.writeFile(fileName, new Uint8Array(await blob.arrayBuffer()))
}

// ── drawOverlayText ───────────────────────────────────────────────────────────
// Always centers text horizontally. y expression is parsed to get vertical pos.
function drawOverlayText(
  ctx: CanvasRenderingContext2D,
  ov: { text: string; x: string; y: string; fontSize: number; fontColor: string; bold?: boolean; shadow?: boolean },
  W: number, H: number,
): void {
  const weight   = ov.bold ? 'bold' : 'normal'
  ctx.font       = `${weight} ${ov.fontSize}px Arial, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign    = 'center'

  const cx = W / 2
  const cy = getYCenter(ov.y, H)

  const maxWidth = W * 0.78
  const lineH    = ov.fontSize * 1.35
  const borderPx = Math.max(3, Math.round(ov.fontSize * 0.09))
  const lines    = wrapText(ctx, ov.text, maxWidth)
  const blockH   = lines.length * lineH
  const startY   = cy - blockH / 2 + lineH / 2

  ctx.strokeStyle = 'rgba(0,0,0,1)'
  ctx.lineWidth   = borderPx * 2
  ctx.lineJoin    = 'round'
  if (ov.shadow !== false) {
    ctx.shadowColor   = 'rgba(0,0,0,0.8)'
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; ctx.shadowBlur = 6
  }
  lines.forEach((line, i) => ctx.strokeText(line, cx, startY + i * lineH))

  ctx.shadowColor = 'transparent'
  ctx.fillStyle   = ov.fontColor || 'white'
  lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineH))
}

// ── remixViaMediaRecorder ─────────────────────────────────────────────────────
// Records the remix using the browser's hardware video encoder via MediaRecorder.
// Phase 1: secondary clip video + original audio (0 → splitTime)
// Phase 2: original clip video + audio (splitTime → end)
// Text overlays are rendered directly onto the canvas.
// Returns a Blob in the best supported format (MP4 > WebM H264 > WebM VP9).
async function remixViaMediaRecorder(opts: {
  newPhase1Path:  string
  originalPath:   string
  splitTime:      number   // 0 = no split, use secondary for full duration
  targetDuration?: number
  preset:         '9:16' | '1:1' | '16:9'
  textOverlays:   Array<{ text: string; x: string; y: string; fontSize: number; fontColor: string; startTime: number; endTime: number; bold?: boolean; shadow?: boolean }>
}): Promise<{ blob: Blob; mimeType: string }> {
  const W = opts.preset === '16:9' ? 1920 : 1080
  const H = opts.preset === '9:16' ? 1920 : 1080
  const hasSplit = opts.splitTime > 0

  // ── load videos ──────────────────────────────────────────────────────────────
  const loadVid = (src: string): Promise<HTMLVideoElement> => new Promise((res, rej) => {
    const v = document.createElement('video')
    v.muted = true; v.playsInline = true; v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    v.src = src
    // Resolve on canplaythrough (readyState=4) — guarantees frames are available.
    // Falls back after 8s if canplaythrough never fires (large / slow files).
    const tid = setTimeout(() => {
      if (v.readyState >= 2) res(v)
      else rej(new Error('Vidéo non chargée après 8s'))
    }, 8_000)
    const done = (vid: HTMLVideoElement) => { clearTimeout(tid); res(vid) }
    v.oncanplaythrough = () => done(v)
    v.onerror = () => { clearTimeout(tid); rej(new Error('Impossible de charger la vidéo')) }
  })
  // Always load secondary — it's the main visual source regardless of split
  const [secVid, origVid] = await Promise.all([
    loadVid(opts.newPhase1Path),
    loadVid(opts.originalPath),
  ])
  const totalDuration = (opts.targetDuration && opts.targetDuration > 1) ? opts.targetDuration : origVid.duration

  // Chrome suspends video decoding for elements that are not in the DOM, even when
  // play() is called. ctx.drawImage() on a suspended video returns black frames.
  // Fix: attach both videos to the document body with real dimensions (≥ a few px).
  // Elements at top:-9999px or width:1px are treated as off-screen and not decoded.
  const vidStyle = 'position:fixed;top:0;left:0;width:120px;height:120px;visibility:hidden;pointer-events:none;z-index:-9999'
  origVid.style.cssText = vidStyle
  secVid.style.cssText  = vidStyle
  document.body.appendChild(origVid)
  document.body.appendChild(secVid)

  // ── canvas + capture stream ───────────────────────────────────────────────────
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  const canvasStream: MediaStream = (canvas as any).captureStream(30)

  // ── audio routing ─────────────────────────────────────────────────────────────
  // Use AudioContext to route origVid's audio to the recorder without playing through speakers.
  const audioCtx = new AudioContext()
  // Browser may auto-suspend AudioContext if too much time elapsed since user gesture.
  if (audioCtx.state === 'suspended') await audioCtx.resume()
  const audioDest = audioCtx.createMediaStreamDestination()
  const audioSrc  = audioCtx.createMediaElementSource(origVid)
  audioSrc.connect(audioDest)
  // Keep origVid muted=false so AudioContext can capture its audio stream.
  // Note: createMediaElementSource reroutes audio away from speakers, so
  // setting muted=false here does NOT play audio through the speakers.
  origVid.muted = false

  const stream = new MediaStream([
    canvasStream.getVideoTracks()[0],
    audioDest.stream.getAudioTracks()[0],
  ])

  // ── MediaRecorder — pick best codec ──────────────────────────────────────────
  const mimeType = [
    'video/mp4',
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find(m => MediaRecorder.isTypeSupported(m)) ?? 'video/webm'

  // Pre-render each text overlay onto its own full-size canvas once.
  // Compositing a pre-drawn canvas with drawImage() is GPU-accelerated and
  // ~10x faster than re-running stroke/fill/shadow text every frame.
  const overlayImages = opts.textOverlays.map(ov => {
    const oc = document.createElement('canvas')
    oc.width = W; oc.height = H
    drawOverlayText(oc.getContext('2d')!, ov, W, H)
    return { canvas: oc, ov }
  })

  // ── draw helper (used before and after recorder starts) ─────────────────────
  const drawOneFrame = (sw: boolean): boolean => {
    const preferred = sw ? origVid : secVid
    const source    = preferred.readyState >= 2 ? preferred
                    : (origVid.readyState >= 2   ? origVid : null)
    if (!source) return false
    const t  = origVid.currentTime
    const vw = source.videoWidth  || W
    const vh = source.videoHeight || H
    const scale = Math.min(W / vw, H / vh)
    const dw = vw * scale, dh = vh * scale
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh)
    for (const { canvas: oc, ov } of overlayImages) {
      if (t >= ov.startTime && t <= ov.endTime) ctx.drawImage(oc, 0, 0)
    }
    return true
  }

  // ── seek & play FIRST — before recorder starts ───────────────────────────────
  const seekTo = (v: HTMLVideoElement, t: number) => new Promise<void>(r => {
    if (Math.abs(v.currentTime - t) < 0.05) { r(); return }
    v.onseeked = () => { v.onseeked = null; r() }
    v.currentTime = t
  })

  await seekTo(origVid, 0)
  await seekTo(secVid, 0)

  // Catch autoplay rejections — fall back to muted if browser blocks unmuted play.
  await origVid.play().catch(() => { origVid.muted = true; return origVid.play().catch(() => {}) })
  await secVid.play().catch(() => {})

  // Wait for the first real (non-black) frame before starting the recorder so we
  // never capture the black frames the decoder emits while it warms up.
  await new Promise<void>(resolve => {
    let attempts = 0
    const waitFrame = () => {
      if (drawOneFrame(false) || attempts++ > 200) { resolve(); return }
      requestAnimationFrame(waitFrame)
    }
    requestAnimationFrame(waitFrame)
  })

  // ── now start the recorder ────────────────────────────────────────────────────
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 })
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
  recorder.start(100)

  // ── draw loop ────────────────────────────────────────────────────────────────
  let switched = false
  let drawTimerId = 0
  let recordingStopped = false

  const stopRecording = () => {
    if (recordingStopped) return
    recordingStopped = true
    clearInterval(drawTimerId)
    if (recorder?.state !== 'inactive') recorder?.stop()
  }

  const drawFrame = () => {
    if (!switched && hasSplit && origVid.currentTime >= opts.splitTime) {
      switched = true
      secVid.pause()
      try { recorder?.requestData() } catch { /* flush buffer at cut point */ }
    }
    drawOneFrame(switched)
  }

  // ── timing — requestVideoFrameCallback if available, else setInterval ────────
  if (typeof (origVid as any).requestVideoFrameCallback === 'function') {
    const scheduleRVFC = () => {
      if (recordingStopped) return
      ;(origVid as any).requestVideoFrameCallback(() => { drawFrame(); scheduleRVFC() })
    }
    origVid.onended = () => stopRecording()
    scheduleRVFC()
  } else {
    origVid.onended = () => stopRecording()
    drawTimerId = setInterval(drawFrame, 1000 / 30) as unknown as number
  }

  const safetyTimeout = setTimeout(() => stopRecording(), (totalDuration + 10) * 1000)

  // When secVid stalls (buffering), pause origVid so audio stays in sync.
  secVid.onwaiting = () => { if (!switched) origVid.pause() }
  secVid.onplaying = () => { if (!switched && origVid.paused) origVid.play().catch(() => {}) }

  // try/finally ensures AudioContext always closes even if an error is thrown,
  // preventing Chrome's ~6 AudioContext limit from being hit on subsequent videos.
  try {
    await new Promise<void>(res => { recorder.onstop = () => res() })
  } finally {
    clearTimeout(safetyTimeout)
    clearInterval(drawTimerId)
    await audioCtx.close()
    origVid.remove()
    secVid.remove()
  }

  return { blob: new Blob(chunks, { type: recorder.mimeType || mimeType }), mimeType }
}

// ── runFfmpegRemixAIWasm (WASM fallback) ─────────────────────────────────────
async function runFfmpegRemixAIWasm(opts: {
  newPhase1Path: string; originalPath: string; splitTime?: number; targetDuration?: number
  outputPath: string; preset: '9:16' | '1:1' | '16:9'
  copyTextFromOriginal?: boolean
  textOverlays: Array<{ text: string; x: string; y: string; fontSize: number; fontColor: string; startTime: number; endTime: number; bold?: boolean; shadow?: boolean }>
}): Promise<{ ok: boolean; outputPath?: string; error?: string }> {
  const hasPhase2  = opts.splitTime != null && opts.splitTime > 0
  const overlayFiles = opts.textOverlays.map((_, i) => `ai_ov${i}.png`)
  const FILES = ['ai_orig.mp4', 'ai_new1.mp4', 'ai_out.mp4', ...overlayFiles]
  const ff = await getFFmpeg()
  for (const f of FILES) await ff.deleteFile(f).catch(() => {})
  const ffLogs: string[] = []
  const logHandler = ({ message }: { message: string }) => ffLogs.push(message)
  ff.on('log', logHandler)
  try {
    await writeInput(ff, 'ai_new1.mp4', opts.newPhase1Path)
    if (hasPhase2) await writeInput(ff, 'ai_orig.mp4', opts.originalPath)
    const W    = opts.preset === '16:9' ? 1920 : 1080
    const H    = opts.preset === '9:16' ? 1920 : 1080
    const scl  = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1`
    const afmt = 'aformat=sample_rates=44100:channel_layouts=stereo'
    for (let i = 0; i < opts.textOverlays.length; i++) {
      await renderTextPNG(ff, opts.textOverlays[i], W, H, overlayFiles[i])
    }
    let chains: string[], inputArgs: string[]
    if (hasPhase2) {
      const st = opts.splitTime!
      chains = [
        `[0:v]trim=duration=${st},setpts=PTS-STARTPTS,${scl}[v_p1]`,
        `[1:v]trim=start=${st},setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[1:a]asplit=2[ao1][ao2]`,
        `[ao1]atrim=end=${st},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
        `[ao2]atrim=start=${st},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
        `[v_p1][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[v_merged][aout]`,
      ]
      inputArgs = ['-i', 'ai_new1.mp4', '-i', 'ai_orig.mp4']
    } else {
      const trimFilter = opts.targetDuration ? `trim=duration=${opts.targetDuration},setpts=PTS-STARTPTS,` : ''
      chains = [
        `[0:v]${trimFilter}${scl}[v_merged]`,
        opts.targetDuration
          ? `[0:a]atrim=duration=${opts.targetDuration},asetpts=PTS-STARTPTS,${afmt}[aout]`
          : `[0:a]${afmt}[aout]`,
      ]
      inputArgs = ['-i', 'ai_new1.mp4']
    }
    const videoInputCount = hasPhase2 ? 2 : 1
    let lastPad = 'v_merged'
    for (let i = 0; i < opts.textOverlays.length; i++) {
      const ov = opts.textOverlays[i]
      const outPad = i === opts.textOverlays.length - 1 ? 'vout' : `v_ov${i}`
      chains.push(`[${lastPad}][${videoInputCount + i}:v]overlay=0:0:enable=between(t\\,${ov.startTime}\\,${ov.endTime})[${outPad}]`)
      lastPad = outPad
    }
    if (opts.textOverlays.length === 0) {
      chains[chains.length - 1] = chains[chains.length - 1].replace('[v_merged]', '[vout]').replace('[v_merged][aout]', '[vout][aout]')
    }
    for (const f of overlayFiles) inputArgs.push('-i', f)
    await ff.exec([
      ...inputArgs,
      '-filter_complex', chains.join(';'),
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
      '-r', '30',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', 'ai_out.mp4',
    ])
    const url = await readOutput(ff, 'ai_out.mp4', 'video/mp4')
    return { ok: true, outputPath: url }
  } catch (err) {
    if (isWasmCrash(err)) resetFFmpeg()
    const relevant = ffLogs.filter(l => /error|invalid|unknown|cannot|no such/i.test(l)).slice(-3)
    return { ok: false, error: String(err) + (relevant.length ? '\n' + relevant.join('\n') : '') }
  } finally {
    ff.off('log', logHandler)
    for (const f of FILES) await ff.deleteFile(f).catch(() => {})
  }
}

// ── runFfmpegRemixAI (Canvas text → overlay, no drawtext needed) ─────────────
// Fast path: MediaRecorder with browser hardware encoder.
// Fallback: WASM FFmpeg (slower, used when MediaRecorder not supported or fails).
export async function runFfmpegRemixAIWeb(opts: {
  newPhase1Path: string
  originalPath:  string
  splitTime?:    number
  targetDuration?: number
  outputPath:    string
  preset:        '9:16' | '1:1' | '16:9'
  copyTextFromOriginal?: boolean
  manualCut?:    boolean
  textOverlays:  Array<{
    text: string; x: string; y: string; fontSize: number; fontColor: string
    startTime: number; endTime: number; bold?: boolean; shadow?: boolean
  }>
}): Promise<{ ok: boolean; outputPath?: string; error?: string }> {
  // For auto-detected cuts, add 0.5s so the secondary clip plays a bit longer
  // before the original appears — hides the jarring first frame at the cut boundary.
  // Manual cuts (user-specified time) are used as-is.
  const splitTime = (opts.splitTime != null && !isNaN(opts.splitTime) && opts.splitTime > 0)
    ? (opts.manualCut ? opts.splitTime : opts.splitTime + 0.2) : 0

  // ── Fast path: hardware encoding via MediaRecorder ────────────────────────
  if (typeof MediaRecorder !== 'undefined') {
    try {
      const { blob, mimeType } = await remixViaMediaRecorder({ ...opts, splitTime })

      // All MediaRecorder output goes through FFmpeg to fix timestamps, pixel format,
      // and container for maximum Instagram/Android compatibility.
      try {
        return await withFfmpegLock(async () => {
          const ff = await getFFmpeg()
          const inName  = mimeType.startsWith('video/mp4') ? 'mr_in.mp4' : 'mr_in.webm'
          await ff.deleteFile(inName).catch(() => {})
          await ff.deleteFile('mr_out.mp4').catch(() => {})
          await ff.writeFile(inName, new Uint8Array(await blob.arrayBuffer()))

          // Always transcode to H.264 CFR — Instagram requires constant 30fps.
          // Fast remux with -c copy cannot enforce -r 30 (needs re-encode).
          await ff.exec(['-nostdin', '-fflags', '+genpts', '-i', inName,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
            '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
            '-r', '30',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart', '-y', 'mr_out.mp4'])

          const url = await readOutput(ff, 'mr_out.mp4', 'video/mp4')
          await ff.deleteFile(inName).catch(() => {})
          await ff.deleteFile('mr_out.mp4').catch(() => {})
          return { ok: true, outputPath: url }
        })
      } catch {
        return { ok: true, outputPath: URL.createObjectURL(blob) }
      }

    } catch (err) {
      console.warn('[remix] MediaRecorder failed, falling back to WASM:', String(err))
      if (isWasmCrash(err)) resetFFmpeg()
    }
  }

  // ── Fallback: WASM FFmpeg ─────────────────────────────────────────────────
  return withFfmpegLock(() => runFfmpegRemixAIWasm(opts))
}

// ── runFfmpegTextOverlay ──────────────────────────────────────────────────────
// Takes a video and renders a single text overlay on it via Canvas API.
// Used by the TextCopy tool to produce N copies with different text positions.
export async function runFfmpegTextOverlayWeb(opts: {
  inputPath:   string
  outputPath:  string
  preset:      '9:16' | '1:1' | '16:9'
  text:        string
  yFrac:       number   // 0–1 vertical center position (e.g. 0.10 = top, 0.87 = bottom)
  fontSize:    number
  fontColor:   string
  bold:        boolean
  shadow:      boolean
}): Promise<{ ok: boolean; outputPath?: string; error?: string }> {
  const FILES = ['txov_in.mp4', 'txov_ov.png', 'txov_out.mp4']
  const ff = await getFFmpeg()
  for (const f of FILES) await ff.deleteFile(f).catch(() => {})
  const ffLogs: string[] = []
  const logHandler = ({ message }: { message: string }) => ffLogs.push(message)
  ff.on('log', logHandler)
  try {
    await writeInput(ff, 'txov_in.mp4', opts.inputPath)

    const W   = opts.preset === '16:9' ? 1920 : 1080
    const H   = opts.preset === '9:16' ? 1920 : 1080
    const scl = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1`

    await renderTextPNG(ff, {
      text:      opts.text,
      x:         'w*0.500',
      y:         `h*${opts.yFrac.toFixed(3)}`,
      fontSize:  opts.fontSize,
      fontColor: opts.fontColor,
      bold:      opts.bold,
      shadow:    opts.shadow,
    }, W, H, 'txov_ov.png')

    await ff.exec([
      '-i', 'txov_in.mp4', '-i', 'txov_ov.png',
      '-filter_complex', `[0:v]${scl}[base];[base][1:v]overlay=0:0[vout]`,
      '-map', '[vout]', '-map', '0:a',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
      '-r', '30',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', 'txov_out.mp4',
    ])

    const url = await readOutput(ff, 'txov_out.mp4')
    return { ok: true, outputPath: url }
  } catch (err) {
    if (isWasmCrash(err)) resetFFmpeg()
    const relevant = ffLogs.filter(l => /error|invalid|unknown|cannot|no such/i.test(l)).slice(-3)
    const detail   = relevant.length ? '\n' + relevant.join('\n') : ''
    return { ok: false, error: String(err) + detail }
  } finally {
    ff.off('log', logHandler)
    for (const f of FILES) await ff.deleteFile(f).catch(() => {})
  }
}

// ── runFfmpegMetadata (strip/set metadata tags) ──────────────────────────────
export async function runFfmpegMetadataWeb(opts: {
  inputPath:  string
  outputPath: string
  metadata:   Record<string, string>
}): Promise<{ ok: boolean; outputPath?: string; error?: string }> {
  const FILES = ['meta_in.mp4', 'meta_out.mp4']
  const ff = await getFFmpeg()
  for (const f of FILES) await ff.deleteFile(f).catch(() => {})
  try {
    await writeInput(ff, 'meta_in.mp4', opts.inputPath)
    const args = ['-hide_banner', '-i', 'meta_in.mp4', '-map_metadata', '-1']
    for (const [k, v] of Object.entries(opts.metadata)) {
      if (v) args.push('-metadata', `${k}=${v}`)
    }
    args.push('-c', 'copy', '-movflags', '+faststart', '-y', 'meta_out.mp4')
    await ff.exec(args)
    const url = await readOutput(ff, 'meta_out.mp4')
    return { ok: true, outputPath: url }
  } catch (err) {
    if (isWasmCrash(err)) resetFFmpeg()
    return { ok: false, error: String(err) }
  } finally {
    for (const f of FILES) await ff.deleteFile(f).catch(() => {})
  }
}

// ── seekVideo ─────────────────────────────────────────────────────────────────
// Seeks a video element to `t` and resolves when the seek completes (or times out).
function seekVideo(video: HTMLVideoElement, t: number): Promise<boolean> {
  return new Promise(res => {
    const tid = setTimeout(() => { video.onseeked = null; res(false) }, 3000)
    video.onseeked = () => { clearTimeout(tid); video.onseeked = null; res(true) }
    video.currentTime = t
  })
}

// ── extractFrames (for AI vision analysis) ───────────────────────────────────
// Uses Canvas+Video instead of WASM — avoids loading the full video into WASM memory.
// Produces JPEG base64 frames identical to the Electron IPC version.
export async function extractFramesWeb(opts: {
  filePath: string; endTime: number; startTime?: number; fps?: number
}): Promise<{
  ok: boolean
  frames?: Array<{ index: number; timestamp: number; data: string }>
  count?: number
  error?: string
}> {
  const start = opts.startTime ?? 0
  const duration = Math.max(0.1, opts.endTime - start)
  const targetCount = Math.min(8, Math.max(1, Math.ceil(duration)))

  return new Promise(resolve => {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'
    video.src = opts.filePath

    const globalTimeout = setTimeout(() => {
      video.src = ''
      resolve({ ok: false, error: 'Timeout chargement vidéo pour extraction frames' })
    }, 30_000)

    video.onloadedmetadata = async () => {
      const W = 640
      const H = Math.round(W * (video.videoHeight / (video.videoWidth || 1))) || 360
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')!

      const interval = duration / targetCount
      const times = Array.from({ length: targetCount }, (_, i) => start + (i + 0.5) * interval)

      const frames: Array<{ index: number; timestamp: number; data: string }> = []
      for (let i = 0; i < times.length; i++) {
        const ok = await seekVideo(video, times[i])
        if (!ok) continue
        ctx.drawImage(video, 0, 0, W, H)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        const b64 = dataUrl.split(',')[1] ?? ''
        if (b64) frames.push({ index: i, timestamp: Math.round(times[i] * 10) / 10, data: b64 })
      }

      clearTimeout(globalTimeout)
      video.src = ''
      resolve({ ok: true, frames, count: frames.length })
    }

    video.onerror = () => {
      clearTimeout(globalTimeout)
      resolve({ ok: false, error: 'Impossible de charger la vidéo pour extraction frames' })
    }
  })
}

// ── Seeded PRNG (LCG) — deterministic per variant seed ───────────────────────
function seededRng(seed: number) {
  let s = (seed * 1664525 + 1013904223) >>> 0
  return (lo: number, hi: number) => {
    s = (s * 1664525 + 1013904223) >>> 0
    return lo + (s / 4294967296) * (hi - lo)
  }
}

// ── runFfmpegRepurposeWeb — generate one unique variant ───────────────────────
type RepurposeResult = { ok: boolean; outputPath?: string; storagePath?: string; similarityPct?: number; transformSummary?: string[]; error?: string }

// Build per-variant transforms from a seed + intensity settings
export function buildRepurposeVariant(seed: number, intensity: 'subtle' | 'medium' | 'aggressive' | 'vener', format: '9:16' | '1:1' | '16:9' | 'keep') {
  const ranges = {
    //              bri    con    sat    zoomMin zoomMax crop  crf  temp   hue
    subtle:     { bri: 0.12, con: 0.12, sat: 0.40, zoomMin: 0.02, zoomMax: 0.07, crop: 6,  crf: 2, temp: 0.18, hue: 20 },
    medium:     { bri: 0.22, con: 0.20, sat: 0.70, zoomMin: 0.04, zoomMax: 0.14, crop: 11, crf: 4, temp: 0.32, hue: 45 },
    aggressive: { bri: 0.38, con: 0.35, sat: 1.10, zoomMin: 0.08, zoomMax: 0.22, crop: 18, crf: 6, temp: 0.50, hue: 75 },
    vener:      { bri: 0.55, con: 0.50, sat: 1.50, zoomMin: 0.15, zoomMax: 0.32, crop: 25, crf: 9, temp: 0.70, hue: 110 },
  }[intensity]

  const rng  = seededRng(seed)
  const sign = () => rng(0, 1) > 0.5 ? 1 : -1

  const brightness = sign() * rng(0.03, ranges.bri)
  const contrast   = 1 + sign() * rng(0.03, ranges.con)
  const saturation = 1 + sign() * rng(0.08, ranges.sat)
  const zoomPct    = rng(ranges.zoomMin, ranges.zoomMax)
  const panX       = rng(0, 1)
  const panY       = rng(0, 1)
  const cropX      = Math.floor(rng(0, ranges.crop))
  const cropY      = Math.floor(rng(0, ranges.crop))
  const crf        = Math.round(28 + rng(0, ranges.crf))

  // Color temperature — warm (orange/amber) or cool (blue/cyan)
  const tempStrength = rng(0.05, ranges.temp)
  const isWarm       = rng(0, 1) > 0.5
  const rr = (isWarm ? 1 + tempStrength        : 1 - tempStrength * 0.7).toFixed(4)
  const gg = (isWarm ? 1 + tempStrength * 0.2  : 1 - tempStrength * 0.1).toFixed(4)
  const bb = (isWarm ? 1 - tempStrength * 0.8  : 1 + tempStrength      ).toFixed(4)

  // Hue rotation — shifts all colors distinctly per variant
  const hueShift = sign() * rng(5, ranges.hue)

  // Lifted blacks (matte/faded look) — random 0 or applied
  const liftBlacks = rng(0, 1) > 0.5
  const liftAmt    = rng(0.04, 0.12)

  const transformSummary: string[] = []
  transformSummary.push(isWarm ? `🌡 Chaud +${(tempStrength * 100).toFixed(0)}%` : `❄ Froid +${(tempStrength * 100).toFixed(0)}%`)
  transformSummary.push(`Teinte ${hueShift > 0 ? '+' : ''}${hueShift.toFixed(0)}°`)
  transformSummary.push(`Saturation ${saturation > 1 ? '+' : ''}${((saturation - 1) * 100).toFixed(0)}%`)
  if (Math.abs(brightness) > 0.02) transformSummary.push(`Lumière ${brightness > 0 ? '+' : ''}${(brightness * 100).toFixed(0)}%`)
  if (Math.abs(contrast - 1) > 0.02) transformSummary.push(`Contraste ${contrast > 1 ? '+' : ''}${((contrast - 1) * 100).toFixed(0)}%`)
  if (liftBlacks) transformSummary.push(`Matte +${(liftAmt * 100).toFixed(0)}%`)
  if (zoomPct > 0.01) transformSummary.push(`Zoom +${(zoomPct * 100).toFixed(0)}%`)

  const vfParts: string[] = []

  // 720p cap — scale so shortest side ≤ 720, no upscaling (backslash-escapes avoid single-quote issues in WASM)
  vfParts.push('scale=iw*min(1\\,720/min(iw\\,ih)):ih*min(1\\,720/min(iw\\,ih))')

  if (format !== 'keep') {
    const W = format === '16:9' ? 1280 : 720
    const H = format === '9:16' ? 1280 : 720
    vfParts.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`)
    vfParts.push(`crop=${W}:${H}`)
  }
  if (cropX > 0 || cropY > 0) vfParts.push(`crop=iw-${cropX * 2}:ih-${cropY * 2}:${cropX}:${cropY}`)

  if (zoomPct > 0.01) {
    const zf    = (1 + zoomPct).toFixed(4)
    const invZf = (1 / (1 + zoomPct)).toFixed(4)
    const ox    = ((1 - 1 / (1 + zoomPct)) * panX).toFixed(4)
    const oy    = ((1 - 1 / (1 + zoomPct)) * panY).toFixed(4)
    vfParts.push(`scale=iw*${zf}:ih*${zf}`)
    vfParts.push(`crop=iw*${invZf}:ih*${invZf}:iw*${ox}:ih*${oy}`)
  }

  // Color temperature
  vfParts.push(`colorchannelmixer=rr=${rr}:gg=${gg}:bb=${bb}`)
  // Hue + saturation
  vfParts.push(`hue=h=${hueShift.toFixed(1)}:s=${saturation.toFixed(4)}`)
  // Brightness + contrast + optional gamma lift (gamma>1 lifts shadows for matte look)
  const gammaVal = liftBlacks ? (1 + liftAmt * 2).toFixed(3) : '1.000'
  vfParts.push(`eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:gamma=${gammaVal}`)
  // Guarantee even dimensions (libx264 yuv420p requires width & height to be multiples of 2)
  vfParts.push('scale=trunc(iw/2)*2:trunc(ih/2)*2')

  return { vf: vfParts.join(','), crf, transformSummary }
}

// Batch version: writes input ONCE then runs N variants — avoids repeated I/O per variant.
// For 5 variants of one source, saves ~4× writeInput cost (~3-5s each).
export function runFfmpegRepurposeBatch(opts: {
  inputPath:   string
  seeds:       number[]
  intensity:   'subtle' | 'medium' | 'aggressive' | 'vener'
  format:      '9:16' | '1:1' | '16:9' | 'keep'
  onVariantStart:    (idx: number) => void
  onVariantProgress: (idx: number, pct: number) => void
}): Promise<RepurposeResult[]> {
  return withFfmpegLock(async () => {
    const ff = await getFFmpeg()
    await ff.deleteFile('rp_in.mp4').catch(() => {})

    const logs: string[] = []
    const logH = ({ message }: { message: string }) => logs.push(message)
    ff.on('log', logH)

    // Write input once for all variants
    opts.onVariantStart(0)
    opts.onVariantProgress(0, 5)
    await writeInput(ff, 'rp_in.mp4', opts.inputPath)

    const results: RepurposeResult[] = []

    for (let i = 0; i < opts.seeds.length; i++) {
      if (i > 0) opts.onVariantStart(i)
      opts.onVariantProgress(i, 15)

      const { vf, crf, transformSummary } = buildRepurposeVariant(opts.seeds[i], opts.intensity, opts.format)
      await ff.deleteFile('rp_out.mp4').catch(() => {})

      try {
        opts.onVariantProgress(i, 30)
        await ff.exec([
          '-nostdin', '-fflags', '+genpts', '-i', 'rp_in.mp4',
          '-map', '0:v:0', '-map', '0:a?',
          '-vf', vf,
          '-r', '30',   // cap at 30fps — if source is 60fps, halves frames to encode
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode',
          '-crf', String(crf),
          '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
          '-c:a', 'copy',
          '-movflags', '+faststart',
          '-y', 'rp_out.mp4',
        ])
        opts.onVariantProgress(i, 90)
        // Validate output before creating blob — FFmpeg can exit 0 with an empty file
        const rawOut = await ff.readFile('rp_out.mp4') as Uint8Array
        if (rawOut.byteLength < 5000) {
          const errLine = logs.filter(l => /error|invalid/i.test(l)).slice(-1)[0] ?? ''
          throw new Error(`Output vide (${rawOut.byteLength}B)${errLine ? ` — ${errLine}` : ''}`)
        }
        const url = URL.createObjectURL(new Blob([rawOut.buffer as ArrayBuffer], { type: 'video/mp4' }))
        opts.onVariantProgress(i, 100)
        results.push({ ok: true, outputPath: url, transformSummary })
      } catch (err) {
        if (isWasmCrash(err)) { resetFFmpeg(); results.push({ ok: false, error: String(err) }); break }
        const relevant = logs.filter(l => /error|invalid|unknown|cannot/i.test(l)).slice(-2)
        results.push({ ok: false, error: String(err) + (relevant.length ? '\n' + relevant.join('\n') : '') })
      }
    }

    ff.off('log', logH)
    for (const f of ['rp_in.mp4', 'rp_out.mp4']) await ff.deleteFile(f).catch(() => {})
    return results
  })
}

// Single-variant wrapper kept for backwards compat
export function runFfmpegRepurposeWeb(opts: {
  inputPath:   string
  seed:        number
  intensity:   'subtle' | 'medium' | 'aggressive' | 'vener'
  format:      '9:16' | '1:1' | '16:9' | 'keep'
  onProgress?: (pct: number) => void
}): Promise<RepurposeResult> {
  return runFfmpegRepurposeBatch({
    inputPath: opts.inputPath,
    seeds: [opts.seed],
    intensity: opts.intensity,
    format: opts.format,
    onVariantStart: () => {},
    onVariantProgress: (_, pct) => opts.onProgress?.(pct),
  }).then(r => r[0] ?? { ok: false, error: 'No result' })
}

// Server-side repurpose via Vercel function + native FFmpeg.
// Much faster than WASM: parallel encoding, native speed, no browser limits.
export async function runRepurposeViaServer(opts: {
  sourceUrl:   string
  userId:      string
  bucket?:     string
  seeds:       number[]
  intensity:   'subtle' | 'medium' | 'aggressive' | 'vener'
  format:      '9:16' | '1:1' | '16:9' | 'keep'
  onUploadProgress?: (pct: number) => void
  onProcessing?:     () => void
}): Promise<RepurposeResult[]> {
  const bucket = opts.bucket ?? 'content'

  // Build variant params client-side (deterministic from seed)
  const variants = opts.seeds.map(seed => {
    const { vf, crf, transformSummary } = buildRepurposeVariant(seed, opts.intensity, opts.format)
    return { vf, crf, transformSummary }
  })

  // Upload source video using a path that satisfies the storage RLS policy
  // (policy requires videos/users/{uid}/ or videos/orgs/{orgId}/)
  opts.onUploadProgress?.(0)
  const resp = await fetch(opts.sourceUrl)
  const blob = await resp.blob()
  const ts = Date.now()
  const tempPath = `videos/users/${opts.userId}/rp-src-${ts}.mp4`

  const { error: upErr } = await supabase.storage.from(bucket).upload(tempPath, blob, {
    contentType: 'video/mp4',
    upsert: true,
  })
  if (upErr) return [{ ok: false, error: upErr.message }]
  opts.onUploadProgress?.(100)

  // Call the Vercel function — native FFmpeg, all variants in parallel
  // Pass userId so the server stores results under videos/users/{userId}/ (readable by client)
  opts.onProcessing?.()
  const apiResp = await fetch('/api/repurpose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storagePath: tempPath,
      userId: opts.userId,
      bucket,
      variants: variants.map(v => ({ vf: v.vf, crf: v.crf })),
    }),
  })

  if (!apiResp.ok) {
    const txt = await apiResp.text().catch(() => apiResp.statusText)
    return [{ ok: false, error: `Server error: ${txt}` }]
  }

  const data = await apiResp.json()
  if (!data.ok) return [{ ok: false, error: data.error ?? 'Server error' }]

  return (data.results as Array<{ ok: boolean; url?: string; storagePath?: string; error?: string }>).map((r, i) => ({
    ok:              r.ok,
    outputPath:      r.url,
    storagePath:     r.storagePath,
    transformSummary: variants[i]?.transformSummary,
    error:           r.error,
  }))
}
