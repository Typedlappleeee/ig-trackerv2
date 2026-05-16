// ── ffmpeg.wasm wrappers ─────────────────────────────────────────────────────
// Mirrors the Electron IPC handlers for FFmpeg operations.
// Uses @ffmpeg/ffmpeg v0.12 which runs entirely in the browser via WebAssembly.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let _ffmpeg: FFmpeg | null = null
let _loading: Promise<FFmpeg> | null = null

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

// ── detectSceneChange ─────────────────────────────────────────────────────────
// Uses FFmpeg's native scene-change metric (select=gt(scene,...)) for frame-accurate
// detection of real transitions, instead of manual frame-diff at 2fps.
export async function detectSceneChangeWeb(opts: {
  filePath: string; threshold?: number
}): Promise<{ ok: boolean; splitTime?: number; duration?: number; error?: string }> {
  const ff = await getFFmpeg()
  await ff.deleteFile('detect.mp4').catch(() => {})

  const logs: string[] = []
  const logHandler = ({ message }: { message: string }) => logs.push(message)

  try {
    await writeInput(ff, 'detect.mp4', opts.filePath)

    // Step 1: get duration
    ff.on('log', logHandler)
    await ff.exec(['-hide_banner', '-i', 'detect.mp4', '-f', 'null', '-']).catch(() => {})
    ff.off('log', logHandler)
    const combined = logs.join('\n')
    const durM = combined.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
    const duration = durM ? parseInt(durM[1]) * 3600 + parseInt(durM[2]) * 60 + parseFloat(durM[3]) : 0

    // Step 2: FFmpeg native scene detection via select + showinfo
    // scene value ranges 0–1; values ≥ 0.25 reliably indicate a hard cut
    const sceneLogs: string[] = []
    const sceneHandler = ({ message }: { message: string }) => sceneLogs.push(message)
    ff.on('log', sceneHandler)
    const threshold = opts.threshold ?? 0.25
    await ff.exec([
      '-hide_banner', '-i', 'detect.mp4',
      '-vf', `select=gt(scene\\,${threshold}),showinfo`,
      '-vsync', 'vfr', '-an', '-f', 'null', '-',
    ]).catch(() => {})
    ff.off('log', sceneHandler)

    // Parse showinfo output: "pts_time:8.541" lines → collect all timestamps
    const timestamps: number[] = []
    for (const line of sceneLogs) {
      const m = line.match(/pts_time:([\d.]+)/)
      if (m) timestamps.push(parseFloat(m[1]))
    }

    if (timestamps.length === 0) {
      // No FFmpeg scene change found — try manual frame-diff as last resort
      const fb = await detectSceneChangeFallback(ff, duration)
      // If fallback also finds nothing meaningful, propagate the failure
      return fb
    }

    // Pick the scene change closest to the middle of the video (most likely the intended split)
    const mid = duration / 2
    const best = timestamps.reduce((a, b) => Math.abs(a - mid) < Math.abs(b - mid) ? a : b)
    const splitTime = Math.round(Math.min(best + 0.5, duration - 0.033) * 1000) / 1000
    return { ok: true, splitTime, duration }

  } catch (err) {
    if (isWasmCrash(err)) resetFFmpeg()
    return { ok: false, error: String(err) }
  } finally {
    ff.off('log', logHandler)
    await ff.deleteFile('detect.mp4').catch(() => {})
  }
}

// Fallback: manual frame-diff at 10fps with 64×64 frames (more accurate than 2fps/32px)
async function detectSceneChangeFallback(
  ff: FFmpeg,
  duration: number,
): Promise<{ ok: boolean; splitTime?: number; duration?: number; error?: string }> {
  await ff.deleteFile('frames.rgb').catch(() => {})
  try {
    const FPS = 10, W = 64, H = 64
    const frameSize = W * H * 3
    await ff.exec([
      '-hide_banner', '-i', 'detect.mp4',
      '-vf', `fps=${FPS},scale=${W}:${H}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', 'frames.rgb',
    ])
    const raw = await ff.readFile('frames.rgb') as Uint8Array
    const nFrames = Math.floor(raw.length / frameSize)
    if (nFrames < 2) return { ok: true, splitTime: duration / 2, duration }

    let maxDiff = 0, maxIdx = 0
    for (let i = 1; i < nFrames; i++) {
      const a = raw.subarray((i - 1) * frameSize, i * frameSize)
      const b = raw.subarray(i * frameSize, (i + 1) * frameSize)
      let diff = 0
      for (let j = 0; j < frameSize; j++) diff += Math.abs(a[j] - b[j])
      diff /= frameSize * 255
      if (diff > maxDiff) { maxDiff = diff; maxIdx = i }
    }
    // Require a meaningful visual change — below this it's just camera movement/grain, not a scene cut
    if (maxDiff < 0.10) return { ok: false, error: 'No scene change detected', duration }
    const splitTime = Math.round((maxIdx / FPS) * 1000) / 1000
    return { ok: true, splitTime, duration }
  } catch (err) {
    return { ok: false, splitTime: duration / 2, duration, error: String(err) }
  } finally {
    await ff.deleteFile('frames.rgb').catch(() => {})
  }
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
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', 'remix_out.mp4',
    ])
    const url = await readOutput(ff, 'remix_out.mp4')
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
// or (w-text_w)/2. We use textAlign='center'/textBaseline='middle' so we
// only need the center coords — no eval() needed (avoids CSP unsafe-eval blocks).
function extractCenterFrac(expr: string, dim: 'w' | 'h'): number {
  const e = expr.trim()
  // (w-text_w)/2  or  (h-text_h)/2  → center = 0.5
  if (/^\(w-text_w\)\/2$/.test(e) || /^\(w\s*\/\s*2\)$/.test(e)) return 0.5
  if (/^\(h-text_h\)\/2$/.test(e) || /^\(h\s*\/\s*2\)$/.test(e)) return 0.5
  // w*FRAC… or h*FRAC…
  if (dim === 'w') { const m = e.match(/^w\s*\*\s*([0-9.]+)/); if (m) return parseFloat(m[1]) }
  if (dim === 'h') { const m = e.match(/^h\s*\*\s*([0-9.]+)/); if (m) return parseFloat(m[1]) }
  return 0.5
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
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  const maxWidth  = W * 0.88          // 88% of frame width, 6% padding each side
  const lineH     = ov.fontSize * 1.25
  const borderPx  = Math.max(3, Math.round(ov.fontSize * 0.09))
  const lines     = wrapText(ctx, ov.text, maxWidth)

  // Center block vertically around cy; shift up so the block is centered
  const cx       = W * extractCenterFrac(ov.x, 'w')
  const cy       = H * extractCenterFrac(ov.y, 'h')
  const blockH   = lines.length * lineH
  const startY   = cy - blockH / 2 + lineH / 2

  const drawLine = (line: string, ly: number, stroke: boolean) => {
    if (stroke) {
      ctx.strokeText(line, cx, ly)
    } else {
      ctx.fillText(line, cx, ly)
    }
  }

  // Draw stroke pass (border + shadow)
  ctx.strokeStyle = 'rgba(0,0,0,1)'
  ctx.lineWidth   = borderPx * 2
  ctx.lineJoin    = 'round'
  if (ov.shadow !== false) {
    ctx.shadowColor   = 'rgba(0,0,0,0.8)'
    ctx.shadowOffsetX = 3
    ctx.shadowOffsetY = 3
    ctx.shadowBlur    = 6
  }
  lines.forEach((line, i) => drawLine(line, startY + i * lineH, true))

  // Draw fill pass (no shadow — prevent double shadow)
  ctx.shadowColor = 'transparent'
  ctx.fillStyle   = ov.fontColor || 'white'
  lines.forEach((line, i) => drawLine(line, startY + i * lineH, false))

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png'),
  )
  await ff.writeFile(fileName, new Uint8Array(await blob.arrayBuffer()))
}

// ── runFfmpegRemixAI (Canvas text → overlay, no drawtext needed) ─────────────
// splitTime is optional: if omitted (no scene change detected), phase 2 is skipped
// and the output is just newPhase1Path scaled to the preset with text overlays.
export async function runFfmpegRemixAIWeb(opts: {
  newPhase1Path: string
  originalPath:  string
  splitTime?:    number   // undefined = no scene change → no phase 2
  outputPath:    string
  preset:        '9:16' | '1:1' | '16:9'
  textOverlays:  Array<{
    text: string; x: string; y: string; fontSize: number; fontColor: string
    startTime: number; endTime: number; bold?: boolean; shadow?: boolean
  }>
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

    // Render each text overlay as a transparent PNG via Canvas API
    for (let i = 0; i < opts.textOverlays.length; i++) {
      await renderTextPNG(ff, opts.textOverlays[i], W, H, overlayFiles[i])
    }

    let chains: string[]
    let inputArgs: string[]

    if (hasPhase2) {
      // Phase 1 (new clip) + Phase 2 (original from splitTime)
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
      // No scene change → use new clip only, no phase 2
      chains = [
        `[0:v]${scl}[v_merged]`,
        `[0:a]${afmt}[aout]`,
      ]
      inputArgs = ['-i', 'ai_new1.mp4']
    }

    // Chain overlay PNGs: [v_merged] → … → [vout]
    // Each PNG input comes after the video inputs
    const videoInputCount = hasPhase2 ? 2 : 1
    let lastPad = 'v_merged'
    for (let i = 0; i < opts.textOverlays.length; i++) {
      const ov     = opts.textOverlays[i]
      const outPad = i === opts.textOverlays.length - 1 ? 'vout' : `v_ov${i}`
      chains.push(`[${lastPad}][${videoInputCount + i}:v]overlay=0:0:enable=between(t\\,${ov.startTime}\\,${ov.endTime})[${outPad}]`)
      lastPad = outPad
    }
    // No overlays → v_merged becomes vout
    if (opts.textOverlays.length === 0) {
      chains[chains.length - 1] = chains[chains.length - 1].replace('[v_merged]', '[vout]').replace('[v_merged][aout]', '[vout][aout]')
    }

    for (const f of overlayFiles) inputArgs.push('-i', f)

    await ff.exec([
      ...inputArgs,
      '-filter_complex', chains.join(';'),
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', 'ai_out.mp4',
    ])

    const url = await readOutput(ff, 'ai_out.mp4')
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

// ── extractFrames (for AI vision analysis) ───────────────────────────────────
export async function extractFramesWeb(opts: {
  filePath: string; endTime: number; fps?: number
}): Promise<{
  ok: boolean
  frames?: Array<{ index: number; timestamp: number; data: string }>
  count?: number
  error?: string
}> {
  const targetCount = Math.min(8, Math.max(1, Math.ceil(opts.endTime)))
  const frameFiles  = Array.from({ length: targetCount }, (_, i) => `frame_${String(i + 1).padStart(4, '0')}.jpg`)
  const ff = await getFFmpeg()
  await ff.deleteFile('frames_in.mp4').catch(() => {})
  for (const f of frameFiles) await ff.deleteFile(f).catch(() => {})
  try {
    await writeInput(ff, 'frames_in.mp4', opts.filePath)
    const fps = targetCount / opts.endTime
    await ff.exec([
      '-i', 'frames_in.mp4',
      '-t', String(opts.endTime),
      '-vf', `fps=${fps.toFixed(4)},scale=640:-2`,
      '-q:v', '5',
      '-y', 'frame_%04d.jpg',
    ])
    const frames: Array<{ index: number; timestamp: number; data: string }> = []
    const interval = opts.endTime / targetCount
    for (let i = 1; i <= targetCount; i++) {
      const name = `frame_${String(i).padStart(4, '0')}.jpg`
      try {
        const data = await ff.readFile(name) as Uint8Array
        let binary = ''
        data.forEach(b => { binary += String.fromCharCode(b) })
        frames.push({
          index:     i - 1,
          timestamp: Math.round((i - 1) * interval * 10) / 10,
          data:      btoa(binary),
        })
      } catch { break }
    }
    return { ok: true, frames, count: frames.length }
  } catch (err) {
    if (isWasmCrash(err)) resetFFmpeg()
    return { ok: false, error: String(err) }
  } finally {
    await ff.deleteFile('frames_in.mp4').catch(() => {})
    for (const f of frameFiles) await ff.deleteFile(f).catch(() => {})
  }
}
