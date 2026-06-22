// Server-side video metadata spoofing + visual adjustments using FFmpeg.
// Accepts: POST { sourceUrl, storagePath, userId, bucket?, mode, preset, gpsCity, customDate, adjustments, supabaseToken, supabaseAnonKey }
// Returns: { ok, url, storagePath }

const ffmpegPath = require('ffmpeg-static')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const os = require('os')

const execFileAsync = promisify(execFile)

const PRESETS = {
  iphone17pro:  { make: 'Apple', model: 'iPhone 17 Pro',  software: 'iOS 26.2', encoder: 'com.apple.quicktime' },
  iphone16pro:  { make: 'Apple', model: 'iPhone 16 Pro',  software: 'iOS 17.5', encoder: 'com.apple.quicktime' },
  iphone16:     { make: 'Apple', model: 'iPhone 16',       software: 'iOS 17.4', encoder: 'com.apple.quicktime' },
  iphone15pro:  { make: 'Apple', model: 'iPhone 15 Pro',  software: 'iOS 17.0', encoder: 'com.apple.quicktime' },
  iphone15:     { make: 'Apple', model: 'iPhone 15',       software: 'iOS 16.6', encoder: 'com.apple.quicktime' },
}

const GPS_CITIES = {
  newyork:      { lat: '+40.7128', lon: '-074.0060', city: 'New York, NY' },
  losangeles:   { lat: '+34.0522', lon: '-118.2437', city: 'Los Angeles, CA' },
  chicago:      { lat: '+41.8781', lon: '-087.6298', city: 'Chicago, IL' },
  miami:        { lat: '+25.7617', lon: '-080.1918', city: 'Miami, FL' },
  houston:      { lat: '+29.7604', lon: '-095.3698', city: 'Houston, TX' },
  phoenix:      { lat: '+33.4484', lon: '-112.0740', city: 'Phoenix, AZ' },
  philadelphia: { lat: '+39.9526', lon: '-075.1652', city: 'Philadelphia, PA' },
  sanantonio:   { lat: '+29.4241', lon: '-098.4936', city: 'San Antonio, TX' },
  sandiego:     { lat: '+32.7157', lon: '-117.1611', city: 'San Diego, CA' },
  dallas:       { lat: '+32.7767', lon: '-096.7970', city: 'Dallas, TX' },
  boston:       { lat: '+42.3601', lon: '-071.0589', city: 'Boston, MA' },
  seattle:      { lat: '+47.6062', lon: '-122.3321', city: 'Seattle, WA' },
  denver:       { lat: '+39.7392', lon: '-104.9903', city: 'Denver, CO' },
  nashville:    { lat: '+36.1627', lon: '-086.7816', city: 'Nashville, TN' },
  atlanta:      { lat: '+33.7490', lon: '-084.3880', city: 'Atlanta, GA' },
  portland:     { lat: '+45.5051', lon: '-122.6750', city: 'Portland, OR' },
  lasvegas:     { lat: '+36.1699', lon: '-115.1398', city: 'Las Vegas, NV' },
  austin:       { lat: '+30.2672', lon: '-097.7431', city: 'Austin, TX' },
  minneapolis:  { lat: '+44.9778', lon: '-093.2650', city: 'Minneapolis, MN' },
  sanfrancisco: { lat: '+37.7749', lon: '-122.4194', city: 'San Francisco, CA' },
}

function jitter(coord) {
  const offset = (Math.random() - 0.5) * 0.01
  return (parseFloat(coord) + offset).toFixed(6)
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

function getSupabaseUser(token, anonKey) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = anonKey || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const {
    sourceUrl, storagePath, userId, bucket = 'content',
    preset = 'iphone17pro', gpsCity = 'newyork', customDate,
    adjustments = {}, supabaseToken, supabaseAnonKey,
  } = req.body ?? {}

  if (!sourceUrl && !storagePath) return res.status(400).json({ ok: false, error: 'Missing source' })
  if (!userId) return res.status(400).json({ ok: false, error: 'Missing userId' })

  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch {
    if (supabaseToken) {
      supabase = getSupabaseUser(supabaseToken, supabaseAnonKey)
    } else {
      return res.status(500).json({ ok: false, error: 'Supabase not configured' })
    }
  }

  const tmpDir    = os.tmpdir()
  const ts        = Date.now()
  const rand      = Math.random().toString(36).slice(2)
  const inputPath = path.join(tmpDir, `spoof_in_${ts}.mp4`)
  const outPath   = path.join(tmpDir, `spoof_out_${ts}_${rand}.mp4`)

  try {
    // ── Download source ──────────────────────────────────────────────────────
    if (sourceUrl) {
      const resp = await fetch(sourceUrl)
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch source: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    // ── Metadata ─────────────────────────────────────────────────────────────
    const meta = PRESETS[preset] ?? PRESETS.iphone17pro
    const gps  = GPS_CITIES[gpsCity] ?? GPS_CITIES.newyork
    const lat  = jitter(gps.lat)
    const lon  = jitter(gps.lon)
    const locationStr = `${parseFloat(lat) >= 0 ? '+' : ''}${lat}${parseFloat(lon) >= 0 ? '+' : ''}${lon}/`
    const dateBase = customDate ? customDate.replace(/\//g, ':').slice(0, 10).replace(/-/g, ':') : new Date().toISOString().slice(0, 10).replace(/-/g, ':')
    const hh = String(Math.floor(Math.random() * 14) + 7).padStart(2, '0')
    const mm = String(Math.floor(Math.random() * 60)).padStart(2, '0')
    const ss = String(Math.floor(Math.random() * 60)).padStart(2, '0')
    const ms = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
    const creationTime = `${dateBase.replace(/:/g, '-')}T${hh}:${mm}:${ss}.${ms}`

    // ── Visual filter chain ───────────────────────────────────────────────────
    const {
      brightness = 0, saturation = 0, contrast = 0,
      noise = 0, vignette = false, flipH = false, zoomPct = 0,
    } = adjustments

    const hasVisual = brightness !== 0 || saturation !== 0 || contrast !== 0 ||
      noise > 0 || vignette || flipH || zoomPct > 0

    const ffArgs = ['-nostdin', '-threads', '0', '-i', inputPath]

    // Metadata args
    ffArgs.push(
      '-metadata', `make=${meta.make}`,
      '-metadata', `model=${meta.model}`,
      '-metadata', `software=${meta.software}`,
      '-metadata', `encoder=${meta.encoder}`,
      '-metadata', `location=${locationStr}`,
      '-metadata', `location-eng=${locationStr}`,
      '-metadata', `com.apple.quicktime.location.ISO6709=${locationStr}`,
      '-metadata', `creation_time=${creationTime}`,
      '-metadata', `date=${dateBase.replace(/:/g, '-')}`,
      '-metadata', `comment=${gps.city}`,
    )

    if (hasVisual) {
      const filters = []

      // eq filter (brightness/saturation/contrast) — combine into one eq call
      const eqParts = []
      if (brightness !== 0) eqParts.push(`brightness=${(brightness / 100).toFixed(3)}`)
      if (saturation !== 0) {
        // map -50..+50 → 0..2.0 (50=1.0 neutral)
        const sat = ((saturation + 50) / 50).toFixed(3)
        eqParts.push(`saturation=${sat}`)
      }
      if (contrast !== 0) {
        // map -50..+50 → 0.5..2.0 (0=1.25 neutral in our mapping, but we use 50=1.0 neutral)
        const con = (1.0 + contrast / 100).toFixed(3)
        eqParts.push(`contrast=${con}`)
      }
      if (eqParts.length > 0) filters.push(`eq=${eqParts.join(':')}`)

      if (noise > 0) {
        const strength = Math.round((noise / 100) * 50)
        const seed = Math.floor(Math.random() * 65536)
        filters.push(`noise=all_seed=${seed}:all_strength=${strength}`)
      }

      if (zoomPct > 0) {
        const factor = (zoomPct / 100).toFixed(4)
        filters.push(`crop=in_w*(1-${factor}):in_h*(1-${factor}),scale=in_w/(1-${factor}):in_h/(1-${factor})`)
      }

      if (flipH) filters.push('hflip')
      if (vignette) filters.push('vignette=PI/5')

      ffArgs.push(
        '-vf', filters.join(','),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      )
    } else {
      ffArgs.push('-codec', 'copy')
    }

    ffArgs.push('-movflags', '+faststart', '-y', outPath)

    await execFileAsync(ffmpegPath, ffArgs, { maxBuffer: 100 * 1024 * 1024 })

    // ── Upload to Supabase ────────────────────────────────────────────────────
    const resultPath = `videos/users/${userId}/spoof-${ts}_${rand}.mp4`
    const outBuf = fs.readFileSync(outPath)
    const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, {
      contentType: 'video/mp4', upsert: true,
    })
    if (upErr) throw new Error(upErr.message)

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(resultPath)

    res.json({ ok: true, url: publicUrl, storagePath: resultPath })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  } finally {
    fs.rmSync(inputPath, { force: true })
    fs.rmSync(outPath, { force: true })
  }
}

module.exports.config = { maxDuration: 60 }
