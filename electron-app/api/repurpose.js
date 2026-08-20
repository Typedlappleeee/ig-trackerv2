// Server-side video repurpose / metadata spoofing using native FFmpeg.
// Accepts:
//   - CloneVid:  POST { sourceUrl|storagePath, userId, bucket?, variants: [{vf, crf}] }
//   - Spoofing:  POST { mode: 'spoof', sourceUrl|storagePath, userId, bucket?, preset, gpsCity, customDate, adjustments }
// Returns: { ok, results } (CloneVid) | { ok, url, storagePath } (Spoofing)

const ffmpegPath = require('ffmpeg-static')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { createClient } = require('@supabase/supabase-js')
const { assertAllowedMediaUrl, fetchMediaFollow, isOwnStoragePath } = require('./_ssrf')
const fs = require('fs')
const path = require('path')
const os = require('os')

const execFileAsync = promisify(execFile)

// ── Spoofing presets / cities ──────────────────────────────────────────────────
// `platform` détermine QUELLES métadonnées on écrit : les vidéos iPhone portent des
// clés com.apple.quicktime.* ; les vidéos Android portent des clés com.android.* —
// mélanger les deux (ex. tags Apple sur une vidéo "Samsung") serait un red flag.
// Pour Android, `androidModel` = code interne réel (ex. SM-S928B) attendu dans les tags.
const PRESETS = {
  iphone17pro:  { platform: 'apple', make: 'Apple', model: 'iPhone 17 Pro',  software: 'iOS 26.2', encoder: 'com.apple.quicktime', lens: 'iPhone 17 Pro back triple camera 6.9mm f/1.78' },
  iphone16pro:  { platform: 'apple', make: 'Apple', model: 'iPhone 16 Pro',  software: 'iOS 18.5', encoder: 'com.apple.quicktime', lens: 'iPhone 16 Pro back triple camera 6.765mm f/1.78' },
  iphone16:     { platform: 'apple', make: 'Apple', model: 'iPhone 16',       software: 'iOS 18.4', encoder: 'com.apple.quicktime', lens: 'iPhone 16 back dual camera 5.96mm f/1.6' },
  iphone15pro:  { platform: 'apple', make: 'Apple', model: 'iPhone 15 Pro',  software: 'iOS 17.5', encoder: 'com.apple.quicktime', lens: 'iPhone 15 Pro back triple camera 6.765mm f/1.78' },
  iphone15:     { platform: 'apple', make: 'Apple', model: 'iPhone 15',       software: 'iOS 17.4', encoder: 'com.apple.quicktime', lens: 'iPhone 15 back dual camera 5.7mm f/1.6' },
  // Android — métadonnées com.android.*, pas de tags Apple.
  s24ultra:     { platform: 'android', make: 'samsung', model: 'Galaxy S24 Ultra', androidModel: 'SM-S928B', software: 'Android 14', encoder: 'Lavf' },
  s23ultra:     { platform: 'android', make: 'samsung', model: 'Galaxy S23 Ultra', androidModel: 'SM-S918B', software: 'Android 14', encoder: 'Lavf' },
  pixel8pro:    { platform: 'android', make: 'Google',  model: 'Pixel 8 Pro',      androidModel: 'Pixel 8 Pro', software: 'Android 14', encoder: 'Lavf' },
  pixel9pro:    { platform: 'android', make: 'Google',  model: 'Pixel 9 Pro',      androidModel: 'Pixel 9 Pro', software: 'Android 15', encoder: 'Lavf' },
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
  // USA
  newyork:      { lat: '+40.7128', lon: '-074.0060', city: 'New York, USA',        tz: '-0400', alt: 10 },
  losangeles:   { lat: '+34.0522', lon: '-118.2437', city: 'Los Angeles, USA',     tz: '-0700', alt: 89 },
  chicago:      { lat: '+41.8781', lon: '-087.6298', city: 'Chicago, USA',         tz: '-0500', alt: 182 },
  miami:        { lat: '+25.7617', lon: '-080.1918', city: 'Miami, USA',           tz: '-0400', alt: 2 },
  houston:      { lat: '+29.7604', lon: '-095.3698', city: 'Houston, USA',         tz: '-0500', alt: 24 },
  phoenix:      { lat: '+33.4484', lon: '-112.0740', city: 'Phoenix, USA',         tz: '-0700', alt: 331 },
  dallas:       { lat: '+32.7767', lon: '-096.7970', city: 'Dallas, USA',          tz: '-0500', alt: 131 },
  atlanta:      { lat: '+33.7490', lon: '-084.3880', city: 'Atlanta, USA',         tz: '-0400', alt: 320 },
  lasvegas:     { lat: '+36.1699', lon: '-115.1398', city: 'Las Vegas, USA',       tz: '-0700', alt: 610 },
  seattle:      { lat: '+47.6062', lon: '-122.3321', city: 'Seattle, USA',         tz: '-0700', alt: 53 },
  denver:       { lat: '+39.7392', lon: '-104.9903', city: 'Denver, USA',          tz: '-0600', alt: 1609 },
  boston:       { lat: '+42.3601', lon: '-071.0589', city: 'Boston, USA',          tz: '-0400', alt: 43 },
  sanfrancisco: { lat: '+37.7749', lon: '-122.4194', city: 'San Francisco, USA',   tz: '-0700', alt: 16 },
  sandiego:     { lat: '+32.7157', lon: '-117.1611', city: 'San Diego, USA',       tz: '-0700', alt: 19 },
  austin:       { lat: '+30.2672', lon: '-097.7431', city: 'Austin, USA',          tz: '-0500', alt: 149 },
  washington:   { lat: '+38.9072', lon: '-077.0369', city: 'Washington DC, USA',   tz: '-0400', alt: 7 },
  // Canada / Mexico / South America
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

// Toutes les villes US → aléatoire « full US ».
const US_KEYS = [
  'newyork', 'losangeles', 'chicago', 'miami', 'houston', 'phoenix', 'dallas',
  'atlanta', 'lasvegas', 'seattle', 'denver', 'boston', 'sanfrancisco',
  'sandiego', 'austin', 'washington',
]

function jitter(coord, amp = 0.01) {
  const offset = (Math.random() - 0.5) * amp
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
  const outPath   = path.join(tmpDir, `spoof_out_${ts}_${rand}.mov`)

  try {
    if (sourceUrl) {
      // anti-SSRF : uniquement une URL de la banque Supabase ; suit les
      // redirections (Supabase → CDN) en re-validant chaque saut.
      const resp = await fetchMediaFollow(sourceUrl, { timeoutMs: 120000 })  // gros fichiers (banque 100 Mo)
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch source: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      if (!isOwnStoragePath(storagePath)) return res.status(400).json({ ok: false, error: 'chemin storage non autorisé' })
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    // Filet de sécurité : si le client envoie 'random' (ou une clé inconnue), on
    // choisit ici pour ne jamais retomber bêtement sur un preset/ville fixe.
    const presetKeys = Object.keys(PRESETS)
    const cityKeys   = Object.keys(GPS_CITIES)
    const presetKey  = PRESETS[preset] ? preset : presetKeys[Math.floor(Math.random() * presetKeys.length)]
    // 'random_usa' → n'importe quelle ville US, avec un jitter large (points répartis
    // sur tout le pays). Sinon ville demandée, ou aléatoire mondial en filet.
    const wideJitter = gpsCity === 'random_usa'
    const cityKey    = wideJitter
      ? US_KEYS[Math.floor(Math.random() * US_KEYS.length)]
      : (GPS_CITIES[gpsCity] ? gpsCity : cityKeys[Math.floor(Math.random() * cityKeys.length)])
    const meta = PRESETS[presetKey]
    const gps  = GPS_CITIES[cityKey]
    console.log(`[SPOOF] start user=${String(userId).slice(0, 8)} preset=${presetKey} city=${cityKey} src=${sourceUrl ? 'url' : 'path'}`)
    const lat  = jitter(gps.lat, wideJitter ? 1.0 : 0.01)
    const lon  = jitter(gps.lon, wideJitter ? 1.0 : 0.01)
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
    const isAndroid  = meta.platform === 'android'
    const focalLen   = (meta.lens?.match(/([\d.]+)mm/) || [])[1] || '6.9'
    const apertureF  = (meta.lens?.match(/f\/([\d.]+)/) || [])[1] || '1.78'
    const iso        = [32, 40, 50, 64, 80, 100, 125, 160, 200, 250][Math.floor(Math.random() * 10)]
    const exposureMs = ['1/30', '1/40', '1/60', '1/80', '1/120', '1/250', '1/500'][Math.floor(Math.random() * 7)]

    const {
      brightness = 0, saturation = 0, contrast = 0,
      noise = 0, vignette = false, flipH = false, zoomPct = 0,
      gamma = 1, hue = 0, sharpen = 0, panX = 0, panY = 0, speed = 1,
    } = adjustments
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

    // Per-export encoding variation — every file has a different CRF, audio bitrate,
    // GOP size, and a tiny sub-pixel noise so the compressed bitstream differs.
    const crf         = 18 + Math.floor(Math.random() * 5)           // 18–22
    const audioBitrate = [128, 160, 192][Math.floor(Math.random() * 3)]
    const gopSize     = 30 + Math.floor(Math.random() * 30)          // 30–59
    const bframes     = [0, 1, 2][Math.floor(Math.random() * 3)]
    const encoderNoise = (Math.random() * 0.002).toFixed(4)          // imperceptible

    const ffArgs = ['-nostdin', '-threads', '0', '-i', inputPath]

    // Container-level (moov-level) metadata — branché selon la plateforme.
    if (isAndroid) {
      // Vidéo Android : clés com.android.* (comme un vrai enregistrement Samsung/
      // Pixel). Pas de tags Apple. Le GPS ISO6709 reste standard (les deux OS l'écrivent).
      ffArgs.push(
        '-metadata', `make=${meta.make}`,
        '-metadata', `model=${meta.androidModel ?? meta.model}`,
        '-metadata', `com.android.manufacturer=${meta.make}`,
        '-metadata', `com.android.model=${meta.androidModel ?? meta.model}`,
        '-metadata', `com.android.version=${(meta.software.match(/(\d+)/) || [])[1] || '14'}`,
        '-metadata', `location=${locationAltStr}`,
        '-metadata', `location-eng=${locationAltStr}`,
        '-metadata', `com.apple.quicktime.location.ISO6709=${locationAltStr}`, // clé ISO6709 générique, écrite aussi par Android
        '-metadata', `creation_time=${creationTime}`,
        '-metadata', `date=${dateDash}`,
        '-metadata', `comment=${gps.city}`,
      )
    } else {
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
        '-metadata', `com.apple.quicktime.camera.aperture=${apertureF}`,
        '-metadata', `com.apple.quicktime.camera.exposure_time=1/${exposureMs.split('/')[1] || 60}`,
        '-metadata', `com.apple.quicktime.camera.iso=${iso}`,
        '-metadata', `creation_time=${creationTime}`,
        '-metadata', `date=${dateDash}`,
        '-metadata', `comment=${gps.city}`,
        '-metadata', `description=Shot on ${meta.model}`,
        '-metadata', `copyright=© ${dateDash.slice(0, 4)} ${meta.make}`,
      )
    }

    // Build video filter chain — always re-encode for true binary uniqueness.
    // NB : aucun filtre n'altère le texte à l'écran (pas de flip/miroir par défaut,
    // pas d'overlay/drawtext) — uniquement des micro-variations imperceptibles.
    const filters = []
    const eqParts = []
    if (brightness !== 0) eqParts.push(`brightness=${(brightness / 100).toFixed(3)}`)
    if (saturation !== 0) eqParts.push(`saturation=${((saturation + 50) / 50).toFixed(3)}`)
    if (contrast !== 0) eqParts.push(`contrast=${(1.0 + contrast / 100).toFixed(3)}`)
    if (gamma && gamma !== 1) eqParts.push(`gamma=${clamp(gamma, 0.5, 1.5).toFixed(3)}`)
    if (eqParts.length > 0) filters.push(`eq=${eqParts.join(':')}`)

    // Teinte (hue) — micro décalage colorimétrique, invisible mais binairement unique
    if (hue && hue !== 0) filters.push(`hue=h=${clamp(hue, -20, 20)}`)

    if (noise > 0) {
      const strength = Math.round((noise / 100) * 50)
      const seed = Math.floor(Math.random() * 65536)
      filters.push(`noise=all_seed=${seed}:all_strength=${strength}`)
    } else {
      // Imperceptible noise to make every export binary-unique even without adjustments
      const seed = Math.floor(Math.random() * 65536)
      filters.push(`noise=all_seed=${seed}:all_strength=1`)
    }

    // Netteté subtile (unsharp) — modifie chaque pixel sans toucher la lisibilité
    if (sharpen && sharpen > 0) filters.push(`unsharp=5:5:${clamp(sharpen, 0, 1.5).toFixed(2)}:5:5:0`)

    if (zoomPct > 0) {
      const factor = (zoomPct / 100).toFixed(4)
      // Recadrage avec léger décalage (pan) dans la marge disponible — la position
      // panX/panY est une fraction (0.5 = centré) de la marge de crop, bornée pour
      // rester dans l'image.
      const fx = clamp(0.5 + panX / 100, 0, 1).toFixed(4)
      const fy = clamp(0.5 + panY / 100, 0, 1).toFixed(4)
      filters.push(
        `crop=in_w*(1-${factor}):in_h*(1-${factor}):in_w*${factor}*${fx}:in_h*${factor}*${fy},` +
        `scale=in_w/(1-${factor}):in_h/(1-${factor})`,
      )
    }
    if (flipH) filters.push('hflip')
    if (vignette) filters.push('vignette=PI/5')

    // Vitesse — change la durée + le rythme audio (signal d'unicité FORT pour l'anti-
    // duplication IG, qui matche sur l'empreinte audio/visuelle, pas les métadonnées).
    // Plage élargie jusqu'à x1.35 (atempo accepte 0.5–2.0). L'audio reste synchro via atempo.
    const spd = clamp(Number(speed) || 1, 0.9, 1.35)
    if (spd !== 1) filters.push(`setpts=PTS/${spd.toFixed(4)}`)

    // Plafonne la résolution à 1920px sur le grand côté (aspect conservé). IG/TikTok
    // recompressent de toute façon en 1080p : encoder du 4K côté serveur = attente
    // inutile qui fait dépasser le budget. Gros gain de vitesse, aucune perte visible.
    filters.push("scale='min(iw,1920)':'min(ih,1920)':force_original_aspect_ratio=decrease")
    // Force even dimensions — libx264 + yuv420p reject odd width/height
    filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2')

    // Audio : atempo accordé à la micro-vitesse pour garder le son synchro.
    if (spd !== 1) ffArgs.push('-af', `atempo=${spd.toFixed(4)}`)

    ffArgs.push(
      '-vf', filters.join(','),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-g', String(gopSize), '-bf', String(bframes),
      // profil high (meilleure qualité, universellement lu par les tels/IG/TikTok) ;
      // PAS de -level codé en dur → x264 calcule le bon niveau selon résolution/fps
      // (le level 4.0 fixe cassait l'encodage des sources 1080p60/4K).
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-max_muxing_queue_size', '9999',
      // Stream-level metadata (video track) — noms de handler réalistes par OS :
      // iPhone écrit "Core Media Video/Audio", Android "VideoHandle/SoundHandle".
      '-metadata:s:v:0', `handler_name=${isAndroid ? 'VideoHandle' : 'Core Media Video'}`,
      '-metadata:s:v:0', `encoder=${meta.encoder}`,
      '-c:a', 'aac', `-b:a`, `${audioBitrate}k`, '-ar', '44100',
      // Stream-level metadata (audio track)
      '-metadata:s:a:0', `handler_name=${isAndroid ? 'SoundHandle' : 'Core Media Audio'}`,
    )

    // use_metadata_tags forces the MP4 muxer to write arbitrary keys
    // (make/model/software + com.apple.quicktime.*) instead of dropping them.
    ffArgs.push('-movflags', 'use_metadata_tags+faststart', '-y', outPath)

    // Pas de limite "vidéo trop longue" : on encode jusqu'au budget max de la
    // fonction (maxDuration 300s). Le seul plafond restant est celui de Vercel
    // (5 min en Pro / 60s en Hobby) — c'est une contrainte plateforme, pas la nôtre.
    // Filet de sécurité contre un ffmpeg réellement bloqué (input corrompu).
    try {
      await execFileAsync(ffmpegPath, ffArgs, { maxBuffer: 200 * 1024 * 1024, timeout: 290000, killSignal: 'SIGKILL' })
    } catch (e) {
      if (e && (e.killed || e.signal)) {
        return res.status(200).json({ ok: false, error: 'Encodage interrompu (fichier trop lourd ou illisible). Réessaie ; si ça persiste, la vidéo dépasse le budget serveur.' })
      }
      throw e
    }

    const resultPath = `videos/users/${userId}/spoof-${ts}_${rand}.mov`
    const outBuf = fs.readFileSync(outPath)
    const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, {
      // .mov servi en video/mp4 → lecture fiable dans le <video> du navigateur.
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
      lens:         meta.lens ?? (isAndroid ? `${meta.model} camera` : ''),
      iso,
      exposure:     exposureMs,
      aperture:     `f/${apertureF}`,
      focal:        `${focalLen}mm`,
      encoder:      meta.encoder,
      crf,
      audioBitrate: `${audioBitrate}k`,
      gopSize,
      colorSpace:   'yuv420p',
    }
    console.log(`[SPOOF] ok user=${String(userId).slice(0, 8)} model=${meta.model} city=${gps.city} out=${resultPath}`)
    res.json({ ok: true, url: publicUrl, storagePath: resultPath, appliedMeta })
  } catch (err) {
    console.error(`[SPOOF] error user=${String(userId).slice(0, 8)} : ${String(err).slice(0, 300)}`)
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
      // anti-SSRF : uniquement une URL de la banque Supabase ; suit les
      // redirections (Supabase → CDN) en re-validant chaque saut.
      const resp = await fetchMediaFollow(sourceUrl, { timeoutMs: 120000 })  // gros fichiers (banque 100 Mo)
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch source: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      if (!isOwnStoragePath(storagePath)) return res.status(400).json({ ok: false, error: 'chemin storage non autorisé' })
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    // ── Build one FFmpeg call for all variants (single decode pass) ────────
    const outPaths = variants.map((_, i) => path.join(tmpDir, `rp_out_${ts}_${i}.mov`))

    // Anti-lecture-de-fichiers : les filtres source `movie=`/`amovie=` de FFmpeg
    // permettraient de lire un fichier arbitraire du serveur (ex. movie=/etc/passwd)
    // et de l'exfiltrer dans la vidéo de sortie. Aucun preset légitime n'en contient.
    for (const v of variants) {
      if (typeof v.vf !== 'string' || /a?movie\b/i.test(v.vf)) {
        return res.status(400).json({ ok: false, error: 'filtre vidéo non autorisé' })
      }
    }
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
        '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-max_muxing_queue_size', '9999',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-movflags', '+faststart',
        outPaths[i],
      )
    })
    ffArgs.push('-y')

    // Pas de limite : on encode jusqu'au budget max de la fonction (300s). Filet
    // de sécurité contre un ffmpeg bloqué uniquement.
    try {
      await execFileAsync(ffmpegPath, ffArgs, { maxBuffer: 200 * 1024 * 1024, timeout: 290000, killSignal: 'SIGKILL' })
    } catch (e) {
      if (e && (e.killed || e.signal)) {
        return res.status(200).json({ ok: false, error: `Encodage interrompu pour ${variants.length} variante(s) (trop lourd/illisible). Réessaie.` })
      }
      throw e
    }

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
          // .mov servi en video/mp4 → lecture fiable dans le <video> du navigateur.
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
    // Ne supprime QUE dans l'arborescence de l'app (videos/users/…) et jamais un
    // chemin avec traversée : sinon un `storagePath` arbitraire ferait supprimer
    // le fichier d'un autre utilisateur via la clé service-role.
    if (storagePath && isOwnStoragePath(storagePath)) {
      supabase.storage.from(bucket).remove([storagePath]).catch(() => {})
    }
  }
}

// Budget max fonction : temps (300s = 5 min en Pro) + mémoire (3008MB en Pro) pour
// encaisser les grosses/longues vidéos. Sur Vercel Hobby, plafonné à 60s / 1024MB.
module.exports.config = { maxDuration: 300, memory: 3008 }
