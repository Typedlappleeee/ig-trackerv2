// Server-side video + caption overlay.
// Primary: render caption PNG via sharp's Pango text mode, composite with ffmpeg overlay.
// Fallback: if sharp/Pango fails, burn text via ffmpeg's subtitles (ASS) filter.
// Accepts: POST { videoUrl|storagePath, caption, userId, bucket?, position?, fontSize?, fontColor? }
// Returns: { ok, url, storagePath }

const ffmpegPath = require('ffmpeg-static')
const sharp      = require('sharp')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { createClient } = require('@supabase/supabase-js')
const { assertAllowedMediaUrl, fetchMediaFollow, isOwnStoragePath } = require('./_ssrf')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const execFileAsync = promisify(execFile)

const VW = 1080, VH = 1920
const TEXT_MAX_W = 960

function getSupabaseAdmin({ supabaseToken, supabaseAnonKey } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) {
    return createClient(url, serviceKey, { auth: { persistSession: false } })
  }
  if (supabaseToken && supabaseAnonKey) {
    return createClient(url, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${supabaseToken}` } },
      auth: { persistSession: false },
    })
  }
  throw new Error('Supabase non authentifié — définir SUPABASE_SERVICE_ROLE_KEY dans Vercel')
}

function escapePango(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fontFamilyName(buf) {
  try {
    const numTables = buf.readUInt16BE(4)
    let nameOff = 0
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16
      if (buf.toString('ascii', o, o + 4) === 'name') { nameOff = buf.readUInt32BE(o + 8); break }
    }
    if (!nameOff) return null
    const count = buf.readUInt16BE(nameOff + 2)
    const strOff = nameOff + buf.readUInt16BE(nameOff + 4)
    for (let i = 0; i < count; i++) {
      const r = nameOff + 6 + i * 12
      const platformID = buf.readUInt16BE(r)
      const nameID = buf.readUInt16BE(r + 6)
      const len = buf.readUInt16BE(r + 8)
      const off = buf.readUInt16BE(r + 10)
      if (nameID === 1) {
        const slice = buf.slice(strOff + off, strOff + off + len)
        if (platformID === 1) return slice.toString('latin1')
        const swapped = Buffer.from(slice)
        for (let j = 0; j + 1 < swapped.length; j += 2) { const t = swapped[j]; swapped[j] = swapped[j + 1]; swapped[j + 1] = t }
        return swapped.toString('utf16le')
      }
    }
  } catch { /* ignore */ }
  return null
}

function luminance(hex) {
  let h = String(hex).replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return (0.2126 * r + 0.7152 * g + 0.4152 * b)
}

async function renderTextLayer(caption, family, fontPath, fontSize, color) {
  const fontDesc = family ? `${family} ${fontSize}` : `Sans Bold ${fontSize}`
  return sharp({
    text: {
      text: `<span weight="bold" foreground="${color}">${escapePango(caption)}</span>`,
      font: fontDesc,
      ...(fontPath ? { fontfile: fontPath } : {}),
      rgba: true,
      align: 'centre',
      width: TEXT_MAX_W,
      spacing: Math.round(fontSize * 0.22),
    },
  }).png().toBuffer({ resolveWithObject: true })
}

async function buildCaptionOverlay(caption, fontSize, fontColor, fontPath, family) {
  const outlineColor = luminance(fontColor) > 0.55 ? '#000000' : '#ffffff'
  const fill    = await renderTextLayer(caption, family, fontPath, fontSize, fontColor)
  const outline = await renderTextLayer(caption, family, fontPath, fontSize, outlineColor)

  const W = fill.info.width, H = fill.info.height
  const OFF = Math.max(2, Math.round(fontSize * 0.07))
  const canvasW = W + OFF * 2, canvasH = H + OFF * 2

  const offsets = [
    [0, 0], [OFF, 0], [2 * OFF, 0],
    [0, OFF],          [2 * OFF, OFF],
    [0, 2 * OFF], [OFF, 2 * OFF], [2 * OFF, 2 * OFF],
  ]
  const composites = offsets.map(([x, y]) => ({ input: outline.data, left: x, top: y }))
  composites.push({ input: fill.data, left: OFF, top: OFF })

  const buf = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composites).png().toBuffer()

  return { buf, w: canvasW, h: canvasH }
}

function buildAssFile(caption, fontSize, fontColor, position) {
  const h = String(fontColor).replace('#', '').padEnd(6, '0')
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6)
  const assColor    = `&H00${b}${g}${r}`.toUpperCase()
  const outColor    = luminance(fontColor) > 0.55 ? '&H00000000' : '&H00FFFFFF'
  const alignMap    = { top: 8, center: 5, middle: 5, bottom: 2 }
  const alignment   = alignMap[position] ?? 2
  const marginV     = position === 'top' ? 120 : position === 'center' || position === 'middle' ? 0 : 130
  const safeCaption = String(caption).replace(/[\r\n]+/g, '\\N')

  return (
    '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n' +
    '[V4+ Styles]\n' +
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
    'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
    'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
    `Style: Default,Arial,${fontSize},${assColor},&H000000FF,${outColor},&H80000000,` +
    `-1,0,0,0,100,100,0,0,1,3,1,${alignment},60,60,${marginV},1\n\n` +
    '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
    `Dialogue: 0,0:00:00.00,9:59:59.00,Default,,0,0,0,,${safeCaption}\n`
  )
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const {
    videoUrl, storagePath, caption, userId,
    bucket    = 'content',
    position  = 'bottom',
    fontSize  = 52,
    fontColor = '#ffffff',
    supabaseToken, supabaseAnonKey,
  } = req.body ?? {}

  if ((!videoUrl && !storagePath) || !caption)
    return res.status(400).json({ ok: false, error: 'Missing videoUrl/storagePath or caption' })

  const supabase = getSupabaseAdmin({ supabaseToken, supabaseAnonKey })
  const ts       = Date.now()
  const tmpDir   = os.tmpdir()
  const inputPath   = path.join(tmpDir, `mix_in_${ts}.mp4`)
  const overlayPath = path.join(tmpDir, `mix_ov_${ts}.png`)
  const assPath     = path.join(tmpDir, `mix_as_${ts}.ass`)
  const outPath     = path.join(tmpDir, `mix_out_${ts}.mp4`)

  try {
    // ── Download source video ────────────────────────────────────────────────
    if (videoUrl) {
      // anti-SSRF : uniquement une URL de la banque Supabase ; suit les
      // redirections (Supabase → CDN) en re-validant chaque saut.
      const resp = await fetchMediaFollow(videoUrl)
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch video: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      if (!isOwnStoragePath(storagePath)) return res.status(400).json({ ok: false, error: 'chemin storage non autorisé' })
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    // ── Build caption overlay ─────────────────────────────────────────────────
    // Primary: sharp Pango text → PNG overlay composited via ffmpeg overlay filter.
    // Fallback: if Pango/sharp fails → ASS subtitle file → ffmpeg subtitles filter.
    let ffArgs
    try {
      const fontPath = (() => {
        const p = path.join(__dirname, 'fonts', 'font-bold.ttf')
        return fs.existsSync(p) ? p : null
      })()
      const family = fontPath ? fontFamilyName(fs.readFileSync(fontPath)) : null
      const { buf: overlayBuf, w: ovW, h: ovH } =
        await buildCaptionOverlay(String(caption), Number(fontSize), String(fontColor), fontPath, family)

      if (!overlayBuf || !overlayBuf.length) throw new Error('sharp returned empty buffer')
      fs.writeFileSync(overlayPath, overlayBuf)

      const ox = Math.round((VW - ovW) / 2)
      const oy = position === 'top' ? 120
        : (position === 'center' || position === 'middle') ? Math.round((VH - ovH) / 2)
        : VH - ovH - 130

      const filterComplex =
        `[0:v]scale=${VW}:${VH}:force_original_aspect_ratio=decrease,` +
        `pad=${VW}:${VH}:-1:-1:color=black,setsar=1[bg];` +
        `[bg][1:v]overlay=${ox}:${oy}`

      ffArgs = [
        '-nostdin', '-threads', '0',
        '-i', inputPath, '-i', overlayPath,
        '-filter_complex', filterComplex,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        '-y', outPath,
      ]
    } catch (_sharpErr) {
      // Fallback: burn caption via ASS subtitle — works without Pango system libs
      fs.writeFileSync(assPath, buildAssFile(String(caption), Number(fontSize), String(fontColor), position))

      // ffmpeg subtitles filter path: escape colons/backslashes for the filter option
      const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
      const vf =
        `scale=${VW}:${VH}:force_original_aspect_ratio=decrease,` +
        `pad=${VW}:${VH}:-1:-1:color=black,setsar=1,` +
        `subtitles=${safeAssPath}`

      ffArgs = [
        '-nostdin', '-threads', '0',
        '-i', inputPath,
        '-vf', vf,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        '-y', outPath,
      ]
    }

    try {
      await execFileAsync(ffmpegPath, ffArgs, { maxBuffer: 100 * 1024 * 1024 })
    } catch (ffErr) {
      const stderr = (ffErr.stderr ?? '').slice(-800)
      throw new Error(`FFmpeg: ${stderr || ffErr.message}`)
    }

    // ── Upload result ────────────────────────────────────────────────────────
    const resultPath = userId
      ? `videos/users/${userId}/mix-out-${ts}_${Math.random().toString(36).slice(2)}.mp4`
      : `mix-results/${ts}_${Math.random().toString(36).slice(2)}.mp4`

    const outBuf = fs.readFileSync(outPath)
    const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, {
      contentType: 'video/mp4', upsert: true,
    })
    if (upErr) throw new Error(upErr.message)

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(resultPath)
    res.json({ ok: true, url: publicUrl, storagePath: resultPath })
  } catch (err) {
    res.status(500).json({ ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 1000) })
  } finally {
    fs.rmSync(inputPath,   { force: true })
    fs.rmSync(overlayPath, { force: true })
    fs.rmSync(assPath,     { force: true })
    fs.rmSync(outPath,     { force: true })
  }
}

module.exports.config = { maxDuration: 60 }
