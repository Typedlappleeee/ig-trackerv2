// Server-side video + caption overlay using sharp (SVG→PNG) + FFmpeg overlay filter.
// Avoids drawtext/libfreetype dependency that isn't compiled in ffmpeg-static on Vercel.
// Accepts: POST { videoUrl|storagePath, caption, userId, bucket?, position?, fontSize?, fontColor?, bgOpacity? }
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

function getSupabaseAdmin({ supabaseToken, supabaseAnonKey } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  // Prefer service role key (bypasses RLS); fall back to user JWT passed from client
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

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Wrap text to lines of at most maxLen chars
function wrapText(text, maxLen = 32) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    if (current.length + word.length + 1 > maxLen && current) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)
  return lines
}

// Build a text overlay PNG via SVG → sharp
async function buildOverlayPng(lines, fontSize, fontColor, bgOpacity) {
  const lineH   = Math.round(fontSize * 1.45)
  const padH    = Math.round(fontSize * 0.55)
  const padW    = Math.round(fontSize * 0.7)
  const svgW    = 720
  const svgH    = lines.length * lineH + padH * 2
  const radius  = Math.round(fontSize * 0.3)

  const textEls = lines.map((line, i) => {
    const y = padH + lineH * 0.72 + i * lineH
    return `<text x="${svgW / 2}" y="${y}"
      text-anchor="middle" dominant-baseline="auto"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${fontSize}"
      font-weight="bold"
      fill="${escapeXml(fontColor)}">${escapeXml(line)}</text>`
  }).join('\n')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
  <rect x="${padW / 2}" y="0" width="${svgW - padW}" height="${svgH}"
    rx="${radius}" ry="${radius}"
    fill="rgba(0,0,0,${bgOpacity})"/>
  ${textEls}
</svg>`

  const buf = await sharp(Buffer.from(svg)).png().toBuffer()
  return { buf, w: svgW, h: svgH }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const {
    videoUrl, storagePath, caption, userId,
    bucket         = 'content',
    position       = 'bottom',
    fontSize       = 36,
    fontColor      = '#ffffff',
    bgOpacity      = 0.45,
    supabaseToken, supabaseAnonKey,
  } = req.body ?? {}

  if ((!videoUrl && !storagePath) || !caption)
    return res.status(400).json({ ok: false, error: 'Missing videoUrl/storagePath or caption' })

  const supabase = getSupabaseAdmin({ supabaseToken, supabaseAnonKey })
  const ts       = Date.now()
  const tmpDir   = os.tmpdir()
  const inputPath  = path.join(tmpDir, `mix_in_${ts}.mp4`)
  const overlayPath = path.join(tmpDir, `mix_ov_${ts}.png`)
  const outPath    = path.join(tmpDir, `mix_out_${ts}.mp4`)

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

    // ── Build text overlay PNG ───────────────────────────────────────────────
    const lines = wrapText(String(caption))
    const { buf: overlayBuf } = await buildOverlayPng(lines, fontSize, fontColor, bgOpacity)
    fs.writeFileSync(overlayPath, overlayBuf)

    // ── Y position expression for FFmpeg overlay filter ─────────────────────
    const pad = fontSize * 2
    const yExpr = position === 'top'
      ? `${pad}`
      : position === 'center'
        ? '(main_h-overlay_h)/2'
        : `main_h-overlay_h-${pad}`

    // ── FFmpeg: composite overlay onto video ─────────────────────────────────
    try {
      await execFileAsync(ffmpegPath, [
        '-nostdin', '-threads', '0',
        '-i', inputPath,
        '-i', overlayPath,
        '-filter_complex', `[0:v][1:v]overlay=(main_w-overlay_w)/2:${yExpr}`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
        '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
        '-c:a', 'copy',
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
