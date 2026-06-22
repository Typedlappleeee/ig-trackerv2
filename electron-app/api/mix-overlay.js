// Server-side video + caption overlay.
// ffmpeg-static on Vercel has NO drawtext (no libfreetype), so we render the
// caption to a transparent PNG with sharp's native text mode (Pango + the
// bundled font file — reliable, unlike SVG @font-face which silently fails and
// produces an empty box), then composite that PNG onto the video with ffmpeg.
// Style: bold white text + black outline, word-wrapped, centered (POV style).
// Accepts: POST { videoUrl|storagePath, caption, userId, bucket?, position?, fontSize?, fontColor? }
// Returns: { ok, url, storagePath }

const ffmpegPath = require('ffmpeg-static')
const sharp      = require('sharp')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { createClient } = require('@supabase/supabase-js')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const execFileAsync = promisify(execFile)

// Output canvas (video is scaled+padded to this before overlay).
const VW = 1080, VH = 1920
const TEXT_MAX_W = 960  // ~89% of width → comfortable side margins

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

// Escape for Pango markup (sharp text mode).
function escapePango(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Read the font's family name (name table, nameID=1) so Pango selects it.
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
        // Unicode/MS platforms store UTF-16BE → swap to LE for Node decoding
        const swapped = Buffer.from(slice)
        for (let j = 0; j + 1 < swapped.length; j += 2) { const t = swapped[j]; swapped[j] = swapped[j + 1]; swapped[j + 1] = t }
        return swapped.toString('utf16le')
      }
    }
  } catch { /* ignore */ }
  return null
}

// Relative luminance of a #rrggbb / #rgb color (0=dark, 1=light).
function luminance(hex) {
  let h = String(hex).replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return (0.2126 * r + 0.7152 * g + 0.4152 * b)
}

// Render one solid-color text PNG via sharp's Pango text mode.
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

// Build the caption overlay PNG: colored text with a contrasting outline.
async function buildCaptionOverlay(caption, fontSize, fontColor, fontPath, family) {
  const outlineColor = luminance(fontColor) > 0.55 ? '#000000' : '#ffffff'
  const fill    = await renderTextLayer(caption, family, fontPath, fontSize, fontColor)
  const outline = await renderTextLayer(caption, family, fontPath, fontSize, outlineColor)

  const W = fill.info.width, H = fill.info.height
  const OFF = Math.max(2, Math.round(fontSize * 0.07))
  const canvasW = W + OFF * 2, canvasH = H + OFF * 2

  // 8-direction outline, then the colored fill on top.
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
  const outPath     = path.join(tmpDir, `mix_out_${ts}.mp4`)

  try {
    // ── Download source video ────────────────────────────────────────────────
    if (videoUrl) {
      const resp = await fetch(videoUrl)
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch video: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    // ── Build caption overlay PNG (sharp text mode) ──────────────────────────
    const fontPath = (() => {
      const p = path.join(__dirname, 'fonts', 'font-bold.ttf')
      return fs.existsSync(p) ? p : null
    })()
    const family = fontPath ? fontFamilyName(fs.readFileSync(fontPath)) : null
    const { buf: overlayBuf, w: ovW, h: ovH } =
      await buildCaptionOverlay(String(caption), fontSize, fontColor, fontPath, family)
    fs.writeFileSync(overlayPath, overlayBuf)

    // ── Position (exact pixels, video pre-scaled to VW×VH) ───────────────────
    const ox = Math.round((VW - ovW) / 2)
    const oy = position === 'top'
      ? 120
      : position === 'center' || position === 'middle'
        ? Math.round((VH - ovH) / 2)
        : VH - ovH - 130   // bottom

    // ── FFmpeg: scale+pad to VW×VH, then composite overlay ───────────────────
    const filter =
      `[0:v]scale=${VW}:${VH}:force_original_aspect_ratio=decrease,` +
      `pad=${VW}:${VH}:-1:-1:color=black,setsar=1[bg];` +
      `[bg][1:v]overlay=${ox}:${oy}`

    try {
      await execFileAsync(ffmpegPath, [
        '-nostdin', '-threads', '0',
        '-i', inputPath,
        '-i', overlayPath,
        '-filter_complex', filter,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        '-y', outPath,
      ], { maxBuffer: 100 * 1024 * 1024 })
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
    fs.rmSync(outPath,     { force: true })
  }
}

module.exports.config = { maxDuration: 60 }
