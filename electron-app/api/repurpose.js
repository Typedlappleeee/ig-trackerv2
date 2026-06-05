// Server-side video repurpose using native FFmpeg.
// Accepts: POST { sourceUrl|storagePath, userId, bucket?, variants: [{vf, crf}] }
// Returns: { ok, results: [{ok, url, storagePath?}] }

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { sourceUrl, storagePath, userId, bucket = 'content', variants } = req.body ?? {}
  if ((!sourceUrl && !storagePath) || !Array.isArray(variants) || variants.length === 0)
    return res.status(400).json({ ok: false, error: 'Missing source or variants' })

  const supabase = getSupabaseAdmin()
  const tmpDir   = os.tmpdir()
  const ts       = Date.now()
  const inputPath = path.join(tmpDir, `rp_in_${ts}.mp4`)

  try {
    // ── Download source video ──────────────────────────────────────────────
    if (sourceUrl) {
      const resp = await fetch(sourceUrl)
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch source: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    // ── Build one FFmpeg call for all variants (single decode pass) ────────
    const outPaths = variants.map((_, i) => path.join(tmpDir, `rp_out_${ts}_${i}.mp4`))

    // filter_complex: each variant gets its own named output [v0], [v1], …
    const filterComplex = variants.map((v, i) => `[0:v:0]${v.vf}[v${i}]`).join(';')

    const ffArgs = [
      '-nostdin', '-threads', '0', '-i', inputPath,
      '-filter_complex', filterComplex,
    ]
    variants.forEach((v, i) => {
      ffArgs.push(
        '-map', `[v${i}]`, '-map', '0:a?',
        '-r', '30',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode',
        '-crf', String(v.crf ?? 30),
        '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-movflags', '+faststart',
        outPaths[i],
      )
    })
    ffArgs.push('-y')

    await execFileAsync(ffmpegPath, ffArgs, { maxBuffer: 100 * 1024 * 1024 })

    // ── Upload all outputs to Supabase in parallel ─────────────────────────
    const thumbPaths = variants.map((_, i) => path.join(tmpDir, `rp_thumb_${ts}_${i}.jpg`))

    const results = await Promise.all(variants.map(async (variant, i) => {
      try {
        const rand = Math.random().toString(36).slice(2)
        const resultPath = userId
          ? `videos/users/${userId}/rp-out-${ts}_${i}_${rand}.mp4`
          : `repurpose-results/${ts}_${i}_${rand}.mp4`

        const outBuf = fs.readFileSync(outPaths[i])
        const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, {
          contentType: 'video/mp4', upsert: true,
        })
        if (upErr) throw new Error(upErr.message)

        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(resultPath)

        // Extract thumbnail JPEG
        let thumbnailPath = null
        try {
          await execFileAsync(ffmpegPath, [
            '-nostdin', '-ss', '0.5', '-i', outPaths[i],
            '-vframes', '1', '-q:v', '2', '-y', thumbPaths[i],
          ], { maxBuffer: 10 * 1024 * 1024, timeout: 8000 })

          const thumbBuf = fs.readFileSync(thumbPaths[i])
          const thumbStoragePath = userId
            ? `videos/users/${userId}/rp-thumb-${ts}_${i}_${rand}.jpg`
            : `repurpose-results/${ts}_${i}_${rand}_thumb.jpg`

          const { error: tUpErr } = await supabase.storage.from(bucket).upload(thumbStoragePath, thumbBuf, {
            contentType: 'image/jpeg', upsert: true,
          })
          if (!tUpErr) thumbnailPath = thumbStoragePath
        } catch (_) { /* thumbnail extraction is best-effort */ }

        return { ok: true, url: publicUrl, storagePath: resultPath, thumbnailPath }
      } catch (err) {
        return { ok: false, error: String(err).slice(0, 300) }
      } finally {
        fs.rmSync(outPaths[i], { force: true })
        fs.rmSync(thumbPaths[i], { force: true })
      }
    }))

    res.json({ ok: true, results })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  } finally {
    fs.rmSync(inputPath, { force: true })
    if (storagePath) supabase.storage.from(bucket).remove([storagePath]).catch(() => {})
  }
}

module.exports.config = { maxDuration: 60 }
