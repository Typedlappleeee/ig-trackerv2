// Réglages ffmpeg des outils Studio (Spoof, Remix, Spoof photo) — COPIE SERVEUR de
// src/lib/studioFilters.ts, src/lib/gps.ts et des parties pures de src/lib/studioTools.ts.
// Les fonctions serverless sont en JS pur (pas de TS) : on garde une copie, et le test
// api/tools.test.js vérifie qu'elle produit EXACTEMENT les mêmes filtres que l'app.
// ⚠ Toute modification des réglages dans src/lib doit être reportée ici.

export const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
export const CAP_1080 = "scale='min(1080,iw)':-2"
export const H264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart+use_metadata_tags']
export const INTENSITIES = ['subtle', 'normal', 'strong']

// ── Spoof (studioTools.ts) ─────────────────────────────────────────────────────
function intensityRanges(i) {
  if (i === 'subtle') return { z: [1.01, 1.025] }
  if (i === 'strong') return { z: [1.03, 1.08] }
  return { z: [1.02, 1.05] }
}
export function spoofZoomFactor(seed, intensity = 'normal') {
  const r = intensityRanges(intensity)
  return r.z[0] + ((Math.sin(seed * 197.5) + 1) / 2) * (r.z[1] - r.z[0])
}
export function spoofFilter(seed, intensity = 'normal') {
  const z = spoofZoomFactor(seed, intensity).toFixed(3)
  return `scale=iw*${z}:ih*${z},crop=iw/${z}:ih/${z},${EVEN}`
}

export const SPOOF_DEVICES = [
  { k: 'none', label: 'Aucun (métadonnées effacées)', apple: false, make: '', model: '', software: '' },
  { k: 'iphone15pro', label: 'iPhone 15 Pro', apple: true, make: 'Apple', model: 'iPhone 15 Pro', software: '17.4.1' },
  { k: 'iphone15', label: 'iPhone 15', apple: true, make: 'Apple', model: 'iPhone 15', software: '17.3' },
  { k: 'iphone14pro', label: 'iPhone 14 Pro', apple: true, make: 'Apple', model: 'iPhone 14 Pro', software: '17.2' },
  { k: 'iphone14', label: 'iPhone 14', apple: true, make: 'Apple', model: 'iPhone 14', software: '16.6' },
  { k: 'iphone13', label: 'iPhone 13', apple: true, make: 'Apple', model: 'iPhone 13', software: '16.5' },
  { k: 'iphone12', label: 'iPhone 12', apple: true, make: 'Apple', model: 'iPhone 12', software: '16.3' },
  { k: 'iphone11', label: 'iPhone 11', apple: true, make: 'Apple', model: 'iPhone 11', software: '15.7' },
  { k: 'iphonese', label: 'iPhone SE', apple: true, make: 'Apple', model: 'iPhone SE', software: '16.5' },
  { k: 's23', label: 'Samsung Galaxy S23', apple: false, make: 'samsung', model: 'SM-S911B', software: '' },
  { k: 's22', label: 'Samsung Galaxy S22', apple: false, make: 'samsung', model: 'SM-S901B', software: '' },
  { k: 'pixel8', label: 'Google Pixel 8', apple: false, make: 'Google', model: 'Pixel 8', software: '' },
]
export function deviceMetaArgs(key) {
  if (!key || key === 'none') return []
  const d = SPOOF_DEVICES.find(x => x.k === key)
  if (!d || !d.make) return []
  const out = ['-metadata', `make=${d.make}`, '-metadata', `model=${d.model}`]
  if (d.apple) {
    out.push('-metadata', `com.apple.quicktime.make=${d.make}`)
    out.push('-metadata', `com.apple.quicktime.model=${d.model}`)
    if (d.software) out.push('-metadata', `com.apple.quicktime.software=${d.software}`)
  }
  return out
}
export function iso6709(lat, lon) {
  const f = (v, w) => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(4).padStart(w + 5, '0')
  return `${f(lat, 2)}${f(lon, 3)}/`
}
export function metaArgs(gps, device) {
  const meta = ['-map_metadata', '-1']
  if (gps) { const loc = iso6709(gps.lat, gps.lon); meta.push('-metadata', `location=${loc}`, '-metadata', `location-eng=${loc}`) }
  meta.push(...deviceMetaArgs(device))
  return meta
}

// ── Remix (studioFilters.ts) ───────────────────────────────────────────────────
const AMP = {
  subtle: { z: [1.01, 1.03], b: 0.025, c: 0.04, s: 0.07, g: 0.03, h: 3, v: 0.015, t: 0.15 },
  normal: { z: [1.02, 1.06], b: 0.05, c: 0.08, s: 0.15, g: 0.06, h: 6, v: 0.03, t: 0.3 },
  strong: { z: [1.04, 1.10], b: 0.08, c: 0.12, s: 0.25, g: 0.1, h: 10, v: 0.05, t: 0.5 },
}
const rnd = (seed, k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }
const sym = (seed, k, a) => (rnd(seed, k) * 2 - 1) * a
const r3 = n => Math.round(n * 1000) / 1000
export const DEFAULT_TOGGLES = { color: true, speed: true, crop: true, mirror: false }
export function remixParams(seed, intensity = 'normal', t = DEFAULT_TOGGLES) {
  const a = AMP[intensity]
  return {
    zoom: t.crop ? r3(a.z[0] + rnd(seed, 1) * (a.z[1] - a.z[0])) : 1,
    brightness: t.color ? r3(sym(seed, 2, a.b)) : 0,
    contrast: t.color ? r3(1 + sym(seed, 3, a.c)) : 1,
    saturation: t.color ? r3(1 + sym(seed, 4, a.s)) : 1,
    gamma: t.color ? r3(1 + sym(seed, 5, a.g)) : 1,
    hue: t.color ? Math.round(sym(seed, 6, a.h) * 10) / 10 : 0,
    speed: t.speed ? r3(1 + sym(seed, 7, a.v)) : 1,
    trim: t.speed ? Math.round(rnd(seed, 8) * a.t * 100) / 100 : 0,
    mirror: t.mirror,
  }
}
export function remixFilter(p) {
  const parts = []
  if (p.zoom > 1.0001) parts.push(`scale=iw*${p.zoom}:ih*${p.zoom}`, `crop=iw/${p.zoom}:ih/${p.zoom}`)
  if (p.brightness !== 0 || p.contrast !== 1 || p.saturation !== 1 || p.gamma !== 1) parts.push(`eq=brightness=${p.brightness}:contrast=${p.contrast}:saturation=${p.saturation}:gamma=${p.gamma}`)
  if (p.hue !== 0) parts.push(`hue=h=${p.hue}`)
  if (p.mirror) parts.push('hflip')
  if (Math.abs(p.speed - 1) > 1e-3) parts.push(`setpts=PTS/${p.speed}`)
  parts.push(EVEN)
  return parts.join(',')
}
export function remixAudioFilter(p) {
  return Math.abs(p.speed - 1) > 1e-3 ? `atempo=${p.speed}` : null
}

// ── GPS (gps.ts) ───────────────────────────────────────────────────────────────
export const GPS_CITIES = [
  { k: 'none', label: 'Aucune (par défaut)', lat: 0, lon: 0 },
  { k: 'france', label: '🇫🇷 France (aléatoire)', lat: 46.6, lon: 2.2 },
  { k: 'usa', label: '🇺🇸 USA (aléatoire)', lat: 39.8, lon: -98.6 },
  { k: 'paris', label: 'Paris', lat: 48.8566, lon: 2.3522 },
  { k: 'lyon', label: 'Lyon', lat: 45.7640, lon: 4.8357 },
  { k: 'marseille', label: 'Marseille', lat: 43.2965, lon: 5.3698 },
  { k: 'bordeaux', label: 'Bordeaux', lat: 44.8378, lon: -0.5792 },
  { k: 'lille', label: 'Lille', lat: 50.6292, lon: 3.0573 },
  { k: 'bruxelles', label: 'Bruxelles', lat: 50.8503, lon: 4.3517 },
  { k: 'geneve', label: 'Genève', lat: 46.2044, lon: 6.1432 },
  { k: 'montreal', label: 'Montréal', lat: 45.5017, lon: -73.5673 },
  { k: 'londres', label: 'Londres', lat: 51.5074, lon: -0.1278 },
  { k: 'newyork', label: 'New York', lat: 40.7128, lon: -74.0060 },
  { k: 'losangeles', label: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { k: 'dubai', label: 'Dubaï', lat: 25.2048, lon: 55.2708 },
]
const FRANCE_CITIES = [
  { lat: 48.8566, lon: 2.3522 }, { lat: 45.7640, lon: 4.8357 }, { lat: 43.2965, lon: 5.3698 }, { lat: 44.8378, lon: -0.5792 },
  { lat: 50.6292, lon: 3.0573 }, { lat: 43.6047, lon: 1.4442 }, { lat: 43.7102, lon: 7.2620 }, { lat: 47.2184, lon: -1.5536 },
  { lat: 48.5734, lon: 7.7521 }, { lat: 43.6108, lon: 3.8767 }, { lat: 47.3220, lon: 5.0415 }, { lat: 48.1173, lon: -1.6778 },
]
const US_CITIES = [
  { lat: 40.7128, lon: -74.0060 }, { lat: 34.0522, lon: -118.2437 }, { lat: 41.8781, lon: -87.6298 }, { lat: 29.7604, lon: -95.3698 },
  { lat: 33.4484, lon: -112.0740 }, { lat: 39.9526, lon: -75.1652 }, { lat: 29.4241, lon: -98.4936 }, { lat: 32.7157, lon: -117.1611 },
  { lat: 32.7767, lon: -96.7970 }, { lat: 30.2672, lon: -97.7431 }, { lat: 25.7617, lon: -80.1918 }, { lat: 33.7490, lon: -84.3880 },
  { lat: 47.6062, lon: -122.3321 }, { lat: 39.7392, lon: -104.9903 }, { lat: 42.3601, lon: -71.0589 }, { lat: 36.1699, lon: -115.1398 },
  { lat: 37.7749, lon: -122.4194 }, { lat: 36.1627, lon: -86.7816 }, { lat: 28.5384, lon: -81.3789 }, { lat: 38.9072, lon: -77.0369 },
]
function randomCityGps(list) {
  const c = list[Math.floor(Math.random() * list.length)]
  const j = () => (Math.random() - 0.5) * 0.06
  return { lat: +(c.lat + j()).toFixed(4), lon: +(c.lon + j()).toFixed(4) }
}
export function gpsFor(key) {
  if (key === 'france') return randomCityGps(FRANCE_CITIES)
  if (key === 'usa') return randomCityGps(US_CITIES)
  const c = GPS_CITIES.find(x => x.k === key)
  return !c || c.k === 'none' ? null : { lat: c.lat, lon: c.lon }
}

// ── Commandes ffmpeg complètes (mêmes que l'app) ───────────────────────────────
export function spoofArgs({ seed, intensity = 'normal', gps = null, device = null }) {
  return ['-vf', `${CAP_1080},${spoofFilter(seed, intensity)}`, ...metaArgs(gps, device), ...H264]
}
export function remixArgs({ seed, intensity = 'normal', gps = null, device = null, toggles = DEFAULT_TOGGLES }) {
  const p = remixParams(seed, intensity, toggles)
  const af = remixAudioFilter(p)
  return [...(p.trim > 0 ? ['-ss', String(p.trim)] : []), '-vf', remixFilter(p), ...(af ? ['-af', af] : []), ...metaArgs(gps, device), ...H264]
}
// Spoof photo : même zoom/recadrage que l'app (fenêtre centrée 1/z remise à la taille d'origine),
// ré-encodage JPEG (EXIF d'origine effacé), qualité légèrement variable → fichier unique.
export function imageSpoofArgs({ seed, intensity = 'normal' }) {
  const z = spoofZoomFactor(seed, intensity).toFixed(4)
  const q = 2 + Math.round(((Math.sin(seed * 13.7) + 1) / 2) * 2)     // qscale 2–4 (≈ qualité 0,90–0,96)
  return ['-vf', `crop=iw/${z}:ih/${z},scale=iw*${z}:ih*${z}`, '-map_metadata', '-1', '-q:v', String(q), '-frames:v', '1']
}
