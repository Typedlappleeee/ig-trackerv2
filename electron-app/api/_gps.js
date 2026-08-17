// Shared GPS/location helpers for server-side ffmpeg metadata injection.
// Used by mix-overlay.js (Mixer "spoof on mix") and available to repurpose.js.
// Keeping the city table here avoids duplicating coordinates across proxies.

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

// Toutes les villes US (pour l'aléatoire « full US »).
const US_KEYS = [
  'newyork', 'losangeles', 'chicago', 'miami', 'houston', 'phoenix', 'dallas',
  'atlanta', 'lasvegas', 'seattle', 'denver', 'boston', 'sanfrancisco',
  'sandiego', 'austin', 'washington',
]

// Résout une clé de sélection (éventuellement aléatoire) en clé de ville concrète.
// - 'random'      → n'importe quelle ville du monde
// - 'random_usa'  → n'importe quelle ville US (full US)
// - clé inconnue  → ville au hasard (filet de sécurité)
function resolveCityKey(sel) {
  const keys = Object.keys(GPS_CITIES)
  if (sel === 'random_usa') return US_KEYS[Math.floor(Math.random() * US_KEYS.length)]
  if (sel === 'random' || !GPS_CITIES[sel]) return keys[Math.floor(Math.random() * keys.length)]
  return sel
}

// Léger bruit sur une coordonnée. `amp` large (~0.25°) pour « full US » afin que
// deux vidéos de la même ville n'aient jamais exactement le même point.
function jitter(coord, amp = 0.006) {
  const offset = (Math.random() - 0.5) * amp * 2
  return (parseFloat(coord) + offset).toFixed(6)
}

// Construit les arguments ffmpeg `-metadata` pour injecter une localisation GPS
// (ISO 6709) + date de prise de vue cohérente avec le fuseau de la ville.
// `wide` élargit le jitter (utilisé pour random_usa).
function buildGpsMetadataArgs(cityKey, { wide = false } = {}) {
  const gps = GPS_CITIES[cityKey] || GPS_CITIES.newyork
  const lat = jitter(gps.lat, wide ? 0.5 : 0.006)
  const lon = jitter(gps.lon, wide ? 0.5 : 0.006)
  const altVal = ((gps.alt ?? 10) + (Math.random() - 0.5) * 8).toFixed(3)
  const altStr = `${parseFloat(altVal) >= 0 ? '+' : '-'}${Math.abs(parseFloat(altVal)).toFixed(3).padStart(7, '0')}`
  const locationAltStr = `${parseFloat(lat) >= 0 ? '+' : ''}${lat}${parseFloat(lon) >= 0 ? '+' : ''}${lon}${altStr}/`

  const now = new Date()
  const dateDash = now.toISOString().slice(0, 10)
  const hh = String(Math.floor(Math.random() * 14) + 7).padStart(2, '0')
  const mm = String(Math.floor(Math.random() * 60)).padStart(2, '0')
  const ss = String(Math.floor(Math.random() * 60)).padStart(2, '0')
  const ms = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  const creationTime  = `${dateDash}T${hh}:${mm}:${ss}.${ms}Z`
  const creationLocal = `${dateDash}T${hh}:${mm}:${ss}${gps.tz ?? '+0000'}`

  return {
    city: gps.city,
    gps: `${lat}, ${lon}`,
    args: [
      '-metadata', `location=${locationAltStr}`,
      '-metadata', `location-eng=${locationAltStr}`,
      '-metadata', `com.apple.quicktime.location.ISO6709=${locationAltStr}`,
      '-metadata', `com.apple.quicktime.location.accuracy.horizontal=${(Math.random() * 8 + 2).toFixed(6)}`,
      '-metadata', `com.apple.quicktime.creationdate=${creationLocal}`,
      '-metadata', `creation_time=${creationTime}`,
      '-metadata', `date=${dateDash}`,
      '-metadata', `comment=${gps.city}`,
    ],
  }
}

// ── Appareils (device spoof) ─────────────────────────────────────────────────
// Mêmes presets que le Spoof : iPhone → tags com.apple.quicktime.*, Android →
// tags com.android.*. Mélanger les deux serait un red flag.
const PRESETS = {
  iphone17pro: { platform: 'apple', make: 'Apple', model: 'iPhone 17 Pro', software: 'iOS 26.2', encoder: 'com.apple.quicktime', lens: 'iPhone 17 Pro back triple camera 6.9mm f/1.78' },
  iphone16pro: { platform: 'apple', make: 'Apple', model: 'iPhone 16 Pro', software: 'iOS 18.5', encoder: 'com.apple.quicktime', lens: 'iPhone 16 Pro back triple camera 6.765mm f/1.78' },
  iphone16:    { platform: 'apple', make: 'Apple', model: 'iPhone 16',      software: 'iOS 18.4', encoder: 'com.apple.quicktime', lens: 'iPhone 16 back dual camera 5.96mm f/1.6' },
  iphone15pro: { platform: 'apple', make: 'Apple', model: 'iPhone 15 Pro', software: 'iOS 17.5', encoder: 'com.apple.quicktime', lens: 'iPhone 15 Pro back triple camera 6.765mm f/1.78' },
  iphone15:    { platform: 'apple', make: 'Apple', model: 'iPhone 15',      software: 'iOS 17.4', encoder: 'com.apple.quicktime', lens: 'iPhone 15 back dual camera 5.7mm f/1.6' },
  s24ultra:    { platform: 'android', make: 'samsung', model: 'Galaxy S24 Ultra', androidModel: 'SM-S928B', software: 'Android 14', encoder: 'Lavf' },
  s23ultra:    { platform: 'android', make: 'samsung', model: 'Galaxy S23 Ultra', androidModel: 'SM-S918B', software: 'Android 14', encoder: 'Lavf' },
  pixel8pro:   { platform: 'android', make: 'Google',  model: 'Pixel 8 Pro',      androidModel: 'Pixel 8 Pro', software: 'Android 14', encoder: 'Lavf' },
  pixel9pro:   { platform: 'android', make: 'Google',  model: 'Pixel 9 Pro',      androidModel: 'Pixel 9 Pro', software: 'Android 15', encoder: 'Lavf' },
}

function randId(len) {
  const hex = '0123456789ABCDEF'
  let s = ''
  for (let i = 0; i < len; i++) s += hex[Math.floor(Math.random() * 16)]
  return s
}

// Construit TOUS les tags -metadata d'un spoof (appareil + GPS + date), pour un
// mix « déjà spoofé ». `dateDays > 0` → date de prise de vue aléatoire dans les N
// derniers jours ; sinon aujourd'hui. Renvoie { args, info }.
function buildSpoofMetadataArgs({ preset = 'random', gpsCity = 'random', dateDays = 0 } = {}) {
  const presetKeys = Object.keys(PRESETS)
  const presetKey  = PRESETS[preset] ? preset : presetKeys[Math.floor(Math.random() * presetKeys.length)]
  const meta       = PRESETS[presetKey]
  const isAndroid  = meta.platform === 'android'

  const cityKey = resolveCityKey(gpsCity)
  const gps     = GPS_CITIES[cityKey] || GPS_CITIES.newyork
  const wide    = gpsCity === 'random_usa'
  const lat = jitter(gps.lat, wide ? 0.5 : 0.006)
  const lon = jitter(gps.lon, wide ? 0.5 : 0.006)
  const altVal = ((gps.alt ?? 10) + (Math.random() - 0.5) * 8).toFixed(3)
  const altStr = `${parseFloat(altVal) >= 0 ? '+' : '-'}${Math.abs(parseFloat(altVal)).toFixed(3).padStart(7, '0')}`
  const locationAltStr = `${parseFloat(lat) >= 0 ? '+' : ''}${lat}${parseFloat(lon) >= 0 ? '+' : ''}${lon}${altStr}/`

  // Date : aujourd'hui, ou un jour au hasard dans les `dateDays` derniers jours.
  const days = Math.max(0, Number(dateDays) || 0)
  const base = new Date(Date.now() - Math.floor(Math.random() * (days > 0 ? days : 1)) * 86400000)
  const dateDash = base.toISOString().slice(0, 10)
  const hh = String(Math.floor(Math.random() * 14) + 7).padStart(2, '0')
  const mm = String(Math.floor(Math.random() * 60)).padStart(2, '0')
  const ss = String(Math.floor(Math.random() * 60)).padStart(2, '0')
  const ms = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  const creationTime  = `${dateDash}T${hh}:${mm}:${ss}.${ms}Z`
  const creationLocal = `${dateDash}T${hh}:${mm}:${ss}${gps.tz ?? '+0000'}`

  const cameraId  = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`
  const focalLen  = (meta.lens?.match(/([\d.]+)mm/) || [])[1] || '6.9'
  const apertureF = (meta.lens?.match(/f\/([\d.]+)/) || [])[1] || '1.78'
  const iso       = [32, 40, 50, 64, 80, 100, 125, 160, 200, 250][Math.floor(Math.random() * 10)]
  const exposure  = ['1/30', '1/40', '1/60', '1/80', '1/120', '1/250', '1/500'][Math.floor(Math.random() * 7)]

  let args
  if (isAndroid) {
    args = [
      '-metadata', `make=${meta.make}`,
      '-metadata', `model=${meta.androidModel ?? meta.model}`,
      '-metadata', `com.android.manufacturer=${meta.make}`,
      '-metadata', `com.android.model=${meta.androidModel ?? meta.model}`,
      '-metadata', `com.android.version=${(meta.software.match(/(\d+)/) || [])[1] || '14'}`,
      '-metadata', `location=${locationAltStr}`,
      '-metadata', `location-eng=${locationAltStr}`,
      '-metadata', `com.apple.quicktime.location.ISO6709=${locationAltStr}`,
      '-metadata', `creation_time=${creationTime}`,
      '-metadata', `date=${dateDash}`,
      '-metadata', `comment=${gps.city}`,
    ]
  } else {
    args = [
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
      '-metadata', `com.apple.quicktime.camera.exposure_time=1/${exposure.split('/')[1] || 60}`,
      '-metadata', `com.apple.quicktime.camera.iso=${iso}`,
      '-metadata', `creation_time=${creationTime}`,
      '-metadata', `date=${dateDash}`,
      '-metadata', `comment=${gps.city}`,
      '-metadata', `description=Shot on ${meta.model}`,
      '-metadata', `copyright=© ${dateDash.slice(0, 4)} ${meta.make}`,
    ]
  }

  return { args, info: { model: meta.model, city: gps.city, date: dateDash } }
}

module.exports = { GPS_CITIES, US_KEYS, PRESETS, resolveCityKey, jitter, buildGpsMetadataArgs, buildSpoofMetadataArgs }
