// Server-side video repurpose using native FFmpeg.
// Flow: client uploads source to Supabase temp → calls this → FFmpeg processes
//       all variants in parallel → uploads results → returns public URLs.
// Accepts: POST { storagePath, bucket, variants: [{vf, crf}] }
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

  const { storagePath, userId, bucket = 'content', variants } = req.body ?? {}
  if (!storagePath || !Array.isArray(variants) || variants.length === 0)
    return res.status(400).json({ ok: false, error: 'Missing storagePath or variants' })

  const supabase = getSupabaseAdmin()
  const tmpDir   = os.tmpdir()
  const inputPath = path.join(tmpDir, `rp_in_${Date.now()}.mp4`)

  try {
    // Download source from Supabase
    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
    if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
    fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))

    // Process all variants in parallel — native FFmpeg is fast enough to run concurrently
    const results = await Promise.all(variants.map(async (variant, i) => {
      const outPath = path.join(tmpDir, `rp_out_${Date.now()}_${i}.mp4`)
      try {
        await execFileAsync(ffmpegPath, [
          '-nostdin', '-i', inputPath,
          '-map', '0:v:0', '-map', '0:a?',
          '-vf', variant.vf,
          '-r', '30',
          '-c:v', 'libx264', '-preset', 'fast',
          '-crf', String(variant.crf ?? 26),
          '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
          '-c:a', 'copy',
          '-movflags', '+faststart',
          '-y', outPath,
        ], { maxBuffer: 100 * 1024 * 1024 })

        // Store under videos/users/{userId}/ so the client's storage SELECT policy allows reading it
        const resultPath = userId
          ? `videos/users/${userId}/rp-out-${Date.now()}_${i}_${Math.random().toString(36).slice(2)}.mp4`
          : `repurpose-results/${Date.now()}_${i}_${Math.random().toString(36).slice(2)}.mp4`
        const outBuf = fs.readFileSync(outPath)
        const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, {
          contentType: 'video/mp4',
          upsert: true,
        })
        if (upErr) throw new Error(upErr.message)

        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(resultPath)
        return { ok: true, url: publicUrl, storagePath: resultPath }
      } catch (err) {
        return { ok: false, error: String(err).slice(0, 300) }
      } finally {
        fs.rmSync(outPath, { force: true })
      }
    }))

    res.json({ ok: true, results })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  } finally {
    fs.rmSync(inputPath, { force: true })
    // Clean up temp source from Supabase (best-effort)
    supabase.storage.from(bucket).remove([storagePath]).catch(() => {})
  }
}

module.exports.config = { maxDuration: 60 }
