// Server-side video + caption overlay using native FFmpeg drawtext.
// Accepts: POST { videoUrl|storagePath, caption, userId, bucket?, position?, fontSize?, fontColor?, bgOpacity? }
// Returns: { ok, url, storagePath }

const ffmpegPath = require('ffmpeg-static')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const os = require('os')

const execFileAsync = promisify(execFile)

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Find a usable font file
function findFont() {
  const candidates = [
    path.join(__dirname, 'fonts', 'font-bold.ttf'),
    path.join(process.cwd(), 'public', 'ffmpeg', 'font-bold.ttf'),
    path.join(__dirname, '..', 'public', 'ffmpeg', 'font-bold.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
  ]
  return candidates.find(p => fs.existsSync(p)) ?? null
}

// Escape special chars for FFmpeg drawtext
function escapeDrawtext(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

// Wrap long text to multiple lines (max ~35 chars per line)
function wrapText(text, maxLen = 35) {
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
  return lines.join('\n')
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const {
    videoUrl, storagePath, caption, userId,
    bucket = 'content',
    position = 'bottom',   // 'top' | 'center' | 'bottom'
    fontSize = 36,
    fontColor = 'white',
    bgOpacity = 0.45,
  } = req.body ?? {}

  if ((!videoUrl && !storagePath) || !caption)
    return res.status(400).json({ ok: false, error: 'Missing videoUrl/storagePath or caption' })

  const supabase = getSupabaseAdmin()
  const fontFile = findFont()
  if (!fontFile) return res.status(500).json({ ok: false, error: 'No font file found on server' })

  const ts = Date.now()
  const tmpDir = os.tmpdir()
  const inputPath = path.join(tmpDir, `mix_in_${ts}.mp4`)
  const outPath   = path.join(tmpDir, `mix_out_${ts}.mp4`)

  try {
    // Download source
    if (videoUrl) {
      const resp = await fetch(videoUrl)
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch video: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    const wrappedText = wrapText(String(caption))
    const escapedText = escapeDrawtext(wrappedText)
    const escapedFont = fontFile.replace(/\\/g, '/').replace(/:/g, '\\:')

    // Y position based on placement
    const yExpr = position === 'top'
      ? `${fontSize * 2}`
      : position === 'center'
        ? '(h-text_h)/2'
        : `h-text_h-${fontSize * 2}`

    // drawtext: semi-transparent bg box + white text
    const drawtextFilter = [
      `drawtext=fontfile='${escapedFont}'`,
      `text='${escapedText}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${fontColor}`,
      `x=(w-text_w)/2`,
      `y=${yExpr}`,
      `line_spacing=8`,
      `box=1`,
      `boxcolor=black@${bgOpacity}`,
      `boxborderw=${Math.round(fontSize * 0.4)}`,
    ].join(':')

    await execFileAsync(ffmpegPath, [
      '-nostdin', '-threads', '0', '-i', inputPath,
      '-vf', drawtextFilter,
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      '-y', outPath,
    ], { maxBuffer: 100 * 1024 * 1024 })

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
    res.status(500).json({ ok: false, error: String(err).slice(0, 400) })
  } finally {
    fs.rmSync(inputPath, { force: true })
    fs.rmSync(outPath, { force: true })
  }
}

module.exports.config = { maxDuration: 60 }
