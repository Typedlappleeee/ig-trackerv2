// Server-side video repurpose / metadata spoofing using native FFmpeg.
// Accepts:
//   - CloneVid:  POST { sourceUrl|storagePath, userId, bucket?, variants: [{vf, crf}] }
//   - Spoofing:  POST { mode: 'spoof', sourceUrl|storagePath, userId, bucket?, preset, gpsCity, customDate, adjustments }
// Returns: { ok, results } (CloneVid) | { ok, url, storagePath } (Spoofing)

const ffmpegPath = require('ffmpeg-static')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const os = require('os')

const execFileAsync = promisify(execFile)

// ── Spoofing presets / cities ──────────────────────────────────────────────────
const PRESETS = {
  iphone17pro:  { make: 'Apple', model: 'iPhone 17 Pro',  software: 'iOS 26.2', encoder: 'com.apple.quicktime', lens: 'iPhone 17 Pro back triple camera 6.9mm f/1.78' },
  iphone16pro:  { make: 'Apple', model: 'iPhone 16 Pro',  software: 'iOS 18.5', encoder: 'com.apple.quicktime', lens: 'iPhone 16 Pro back triple camera 6.765mm f/1.78' },
  iphone16:     { make: 'Apple', model: 'iPhone 16',       software: 'iOS 18.4', encoder: 'com.apple.quicktime', lens: 'iPhone 16 back dual camera 5.96mm f/1.6' },
  iphone15pro:  { make: 'Apple', model: 'iPhone 15 Pro',  software: 'iOS 17.5', encoder: 'com.apple.quicktime', lens: 'iPhone 15 Pro back triple camera 6.765mm f/1.78' },
  iphone15:     { make: 'Apple', model: 'iPhone 15',       software: 'iOS 17.4', encoder: 'com.apple.quicktime', lens: 'iPhone 15 back dual camera 5.7mm f/1.6' },
}

// International locations across many countries. tz = UTC offset for authentic
// com.apple.quicktime.creationdate. alt = base altitude (m) for the GPS fix.
const GPS_CITIES = {
  // France
  paris:        { lat: '+48.8566', lon: '+002.3522', city: 'Paris, France',        tz: '+0200', alt: 35 },
  marseille:    { lat: '+43.2965', lon: '+005.3698', city: 'Marseille, France',    tz: '+0200', alt: 12 },
  lyon:         { lat: '+45.7640', lon: '+004.8357', city: 'Lyon, France',         tz: '+0200', alt: 170 },
  toulouse:     { lat: '+43.6047', lon: '+001.4442', city: 'Toulouse, France',     tz: '+0200', alt: 146 },
  nice:         { lat: '+43.7102', lon: '+007.2620', city: 'Nice, France',         tz: '+0200', alt: 10 },
  bordeaux:     { lat: '+44.8378', lon: '-000.5792', city: 'Bordeaux, France',     tz: '+0200', alt: 8 },
  // UK / Ireland
  london:       { lat: '+51.5074', lon: '-000.1278', city: 'London, UK',           tz: '+0100', alt: 11 },
  manchester:   { lat: '+53.4808', lon: '-002.2426', city: 'Manchester, UK',       tz: '+0100', alt: 38 },
  dublin:       { lat: '+53.3498', lon: '-006.2603', city: 'Dublin, Ireland',      tz: '+0100', alt: 20 },
  // Spain / Portugal
  madrid:       { lat: '+40.4168', lon: '-003.7038', city: 'Madrid, Spain',        tz: '+0200', alt: 667 },
  barcelona:    { lat: '+41.3851', lon: '+002.1734', city: 'Barcelona, Spain',     tz: '+0200', alt: 12 },
  lisbon:       { lat: '+38.7223', lon: '-009.1393', city: 'Lisbon, Portugal',     tz: '+0100', alt: 2 },
  // Italy
  rome:         { lat: '+41.9028', lon: '+012.4964', city: 'Rome, Italy',          tz: '+0200', alt: 21 },
  milan:        { lat: '+45.4642', lon: '+009.1900', city: 'Milan, Italy',         tz: '+0200', alt: 120 },
  // Germany / Benelux / Switzerland
  berlin:       { lat: '+52.5200', lon: '+013.4050', city: 'Berlin, Germany',      tz: '+0200', alt: 34 },
  munich:       { lat: '+48.1351', lon: '+011.5820', city: 'Munich, Germany',      tz: '+0200', alt: 520 },
  amsterdam:    { lat: '+52.3676', lon: '+004.9041', city: 'Amsterdam, NL',        tz: '+0200', alt: 2 },
  brussels:     { lat: '+50.8503', lon: '+004.3517', city: 'Brussels, Belgium',    tz: '+0200', alt: 28 },
  zurich:       { lat: '+47.3769', lon: '+008.5417', city: 'Zurich, Switzerland',  tz: '+0200', alt: 408 },
  geneva:       { lat: '+46.2044', lon: '+006.1432', city: 'Geneva, Switzerland',  tz: '+0200', alt: 375 },
  // North America
  newyork:      { lat: '+40.7128', lon: '-074.0060', city: 'New York, USA',        tz: '-0400', alt: 10 },
  losangeles:   { lat: '+34.0522', lon: '-118.2437', city: 'Los Angeles, USA',     tz: '-0700', alt: 89 },
  miami:        { lat: '+25.7617', lon: '-080.1918', city: 'Miami, USA',           tz: '-0400', alt: 2 },
  toronto:      { lat: '+43.6532', lon: '-079.3832', city: 'Toronto, Canada',      tz: '-0400', alt: 76 },
  montreal:     { lat: '+45.5017', lon: '-073.5673', city: 'Montreal, Canada',     tz: '-0400', alt: 36 },
  mexico:       { lat: '+19.4326', lon: '-099.1332', city: 'Mexico City, Mexico',  tz: '-0600', alt: 2240 },
  // Middle East / Asia / Oceania / South America
  dubai:        { lat: '+25.2048', lon: '+055.2708', city: 'Dubai, UAE',           tz: '+0400', alt: 5 },
  istanbul:     { lat: '+41.0082', lon: '+028.9784', city: 'Istanbul, Turkey',     tz: '+0300', alt: 39 },
  tokyo:        { lat: '+35.6762', lon: '+139.6503', city: 'Tokyo, Japan',         tz: '+0900', alt: 40 },
  singapore:    { lat: '+01.3521', lon: '+103.8198', city: 'Singapore',            tz: '+0800', alt: 15 },
  sydney:       { lat: '-33.8688', lon: '+151.2093', city: 'Sydney, Australia',    tz: '+1000', alt: 58 },
  saopaulo:     { lat: '-23.5505', lon: '-046.6333', city: 'Sao Paulo, Brazil',    tz: '-0300', alt: 760 },
}

function jitter(coord) {
  const offset = (Math.random() - 0.5) * 0.01
  return (parseFloat(coord) + offset).toFixed(6)
}

function randId(len) {
  const hex = '0123456789ABCDEF'
  let s = ''
  for (let i = 0; i < len; i++) s += hex[Math.floor(Math.random() * 16)]
  return s
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

// ── Spoofing handler (metadata injection + optional visual adjustments) ─────────
async function handleSpoof(req, res) {
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
    if (supabaseToken) supabase = getSupabaseUser(supabaseToken, supabaseAnonKey)
    else return res.status(500).json({ ok: false, error: 'Supabase not configured' })
  }

  const tmpDir    = os.tmpdir()
  const ts        = Date.now()
  const rand      = Math.random().toString(36).slice(2)
  const inputPath = path.join(tmpDir, `spoof_in_${ts}.mp4`)
  const outPath   = path.join(tmpDir, `spoof_out_${ts}_${rand}.mp4`)

  try {
    if (sourceUrl) {
      const resp = await fetch(sourceUrl)
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch source: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    const meta = PRESETS[preset] ?? PRESETS.iphone17pro
    const gps  = GPS_CITIES[gpsCity] ?? GPS_CITIES.paris
    const lat  = jitter(gps.lat)
    const lon  = jitter(gps.lon)
    // GPS fix with random altitude → ISO 6709 (e.g. +48.8571+002.3490+035.123/)
    const altVal = ((gps.alt ?? 10) + (Math.random() - 0.5) * 8).toFixed(3)
    const altStr = `${parseFloat(altVal) >= 0 ? '+' : '-'}${Math.abs(parseFloat(altVal)).toFixed(3).padStart(7, '0')}`
    const locationStr    = `${parseFloat(lat) >= 0 ? '+' : ''}${lat}${parseFloat(lon) >= 0 ? '+' : ''}${lon}/`
    const locationAltStr = `${parseFloat(lat) >= 0 ? '+' : ''}${lat}${parseFloat(lon) >= 0 ? '+' : ''}${lon}${altStr}/`
    const dateBase = customDate ? customDate.replace(/\//g, ':').slice(0, 10).replace(/-/g, ':') : new Date().toISOString().slice(0, 10).replace(/-/g, ':')
    const dateDash = dateBase.replace(/:/g, '-')
    const hh = String(Math.floor(Math.random() * 14) + 7).padStart(2, '0')
    const mm = String(Math.floor(Math.random() * 60)).padStart(2, '0')
    const ss = String(Math.floor(Math.random() * 60)).padStart(2, '0')
    const ms = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
    // creation_time: ISO 8601 UTC (Z). quicktime.creationdate: local time + city tz offset.
    const creationTime  = `${dateDash}T${hh}:${mm}:${ss}.${ms}Z`
    const tzOffset      = gps.tz ?? '+0000'
    const creationLocal = `${dateDash}T${hh}:${mm}:${ss}${tzOffset}`
    // Per-export random identifiers (every file gets unique camera/track metadata).
    const cameraId   = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`
    const focalLen   = (meta.lens.match(/([\d.]+)mm/) || [])[1] || '6.9'
    const apertureF  = (meta.lens.match(/f\/([\d.]+)/) || [])[1] || '1.78'
    const iso        = [32, 40, 50, 64, 80, 100, 125, 160, 200, 250][Math.floor(Math.random() * 10)]
    const exposureMs = ['1/30', '1/40', '1/60', '1/80', '1/120', '1/250', '1/500'][Math.floor(Math.random() * 7)]

    const {
      brightness = 0, saturation = 0, contrast = 0,
      noise = 0, vignette = false, flipH = false, zoomPct = 0,
    } = adjustments

    const hasVisual = brightness !== 0 || saturation !== 0 || contrast !== 0 ||
      noise > 0 || vignette || flipH || zoomPct > 0

    const ffArgs = ['-nostdin', '-threads', '0', '-i', inputPath]

    ffArgs.push(
      '-metadata', `make=${meta.make}`,
      '-metadata', `model=${meta.model}`,
      '-metadata', `software=${meta.software}`,
      '-metadata', `encoder=${meta.encoder}`,
      '-metadata', `location=${locationAltStr}`,
      '-metadata', `location-eng=${locationAltStr}`,
      '-metadata', `com.apple.quicktime.location.ISO6709=${locationAltStr}`,
      '-metadata', `com.apple.quicktime.location.accuracy.horizontal=${(Math.random() * 8 + 2).toFixed(6)}`,
      '-metadata', `com.apple.quicktime.make=${meta.make}`,
      '-metadata', `com.apple.quicktime.model=${meta.model}`,
      '-metadata', `com.apple.quicktime.software=${meta.software}`,
      '-metadata', `com.apple.quicktime.creationdate=${creationLocal}`,
      '-metadata', `com.apple.quicktime.camera.identifier=${cameraId}`,
      '-metadata', `com.apple.quicktime.camera.lens_model=${meta.lens}`,
      '-metadata', `com.apple.quicktime.camera.focal_length.35mm_equivalent=${focalLen}`,
      '-metadata', `creation_time=${creationTime}`,
      '-metadata', `date=${dateDash}`,
      '-metadata', `comment=${gps.city}`,
    )

    if (hasVisual) {
      const filters = []
      const eqParts = []
      if (brightness !== 0) eqParts.push(`brightness=${(brightness / 100).toFixed(3)}`)
      if (saturation !== 0) eqParts.push(`saturation=${((saturation + 50) / 50).toFixed(3)}`)
      if (contrast !== 0) eqParts.push(`contrast=${(1.0 + contrast / 100).toFixed(3)}`)
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

      // Force even dimensions — libx264 + yuv420p reject odd width/height
      // (the zoom crop/scale can produce an odd value).
      filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2')

      ffArgs.push(
        '-vf', filters.join(','),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      )
    } else {
      ffArgs.push('-codec', 'copy')
    }

    // use_metadata_tags forces the MP4 muxer to write arbitrary keys
    // (make/model/software + com.apple.quicktime.*) instead of dropping them.
    ffArgs.push('-movflags', 'use_metadata_tags+faststart', '-y', outPath)

    await execFileAsync(ffmpegPath, ffArgs, { maxBuffer: 100 * 1024 * 1024 })

    const resultPath = `videos/users/${userId}/spoof-${ts}_${rand}.mp4`
    const outBuf = fs.readFileSync(outPath)
    const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, {
      contentType: 'video/mp4', upsert: true,
    })
    if (upErr) throw new Error(upErr.message)

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(resultPath)

    // Return the exact metadata written so the UI can display / compare it.
    const appliedMeta = {
      make:         meta.make,
      model:        meta.model,
      software:     meta.software,
      city:         gps.city,
      gps:          `${lat}, ${lon}`,
      altitude:     `${altVal} m`,
      creationDate: creationLocal,
      timezone:     tzOffset,
      cameraId,
      lens:         meta.lens,
      iso,
      exposure:     exposureMs,
      aperture:     `f/${apertureF}`,
      focal:        `${focalLen}mm`,
    }
    res.json({ ok: true, url: publicUrl, storagePath: resultPath, appliedMeta })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  } finally {
    fs.rmSync(inputPath, { force: true })
    fs.rmSync(outPath, { force: true })
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  // Route metadata-spoofing requests to the dedicated handler.
  if ((req.body ?? {}).mode === 'spoof') return handleSpoof(req, res)

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
    const outPaths = variants.map((_, i) => path.join(tmpDir, `rp_out_${ts}_${i}.mov`))

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
          ? `videos/users/${userId}/rp-out-${ts}_${i}_${rand}.mov`
          : `repurpose-results/${ts}_${i}_${rand}.mov`

        const outBuf = fs.readFileSync(outPaths[i])
        const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, {
          contentType: 'video/quicktime', upsert: true,
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
