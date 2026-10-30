// API ScaleFlow — outils Studio côté serveur : /api/v1/tools[/<outil>] (même clé sf_… que /api/v1).
//   GET  /api/v1/tools          → catalogue (outils, intensités, appareils, GPS)
//   POST /api/v1/tools/spoof    → vidéo : zoom/recadrage + métadonnées réécrites ; photo : idem en JPEG
//   POST /api/v1/tools/remix    → vidéo : vraies variations (recadrage, couleurs, teinte, vitesse, miroir…)
// Source : { file_id } (média de la banque) ou { url } (https public). Le résultat est rangé dans la
// banque (dossier `folder`) et renvoyé avec son lien. 1 variante par appel : pour N variantes,
// faire N appels EN PARALLÈLE (chacun tourne sur sa propre instance).
// Même réglages ffmpeg que l'app (copie dans _studio.js, parité testée dans tools.test.js).
import { randomInt } from 'node:crypto'
import piexif from 'piexifjs'
import { db, authCheck, logCall, bodyOf, bytesOfFile, cleanFolder, extOf, fetchPublic, storeBytes, MIME_OF } from './_bank.js'
import { runFfmpeg } from './_ffmpeg.js'
import { GPS_CITIES, INTENSITIES, SPOOF_DEVICES, DEFAULT_TOGGLES, gpsFor, imageSpoofArgs, remixArgs, spoofArgs } from './_studio.js'

const MAX_INPUT = 150 * 1024 * 1024                       // 150 Mo en entrée (temps de traitement serveur)
const IMG = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}
const bad = (code, error) => Object.assign(new Error(error), { status: 422, code })

function pickGps(v) {
  if (v === undefined || v === null || v === '' || v === 'none') return { gps: null, label: 'none' }
  if (typeof v === 'object' && Number.isFinite(+v.lat) && Number.isFinite(+v.lon) && Math.abs(+v.lat) <= 90 && Math.abs(+v.lon) <= 180) return { gps: { lat: +v.lat, lon: +v.lon }, label: 'custom' }
  if (typeof v === 'string' && GPS_CITIES.some(c => c.k === v)) return { gps: gpsFor(v), label: v }
  throw bad('invalid_gps', `gps inconnu : utilise ${GPS_CITIES.map(c => c.k).join(', ')} ou {lat, lon}`)
}
function pickDevice(v) {
  if (v === undefined || v === null || v === '') return 'none'
  if (SPOOF_DEVICES.some(d => d.k === v)) return v
  throw bad('invalid_device', `appareil inconnu : ${SPOOF_DEVICES.map(d => d.k).join(', ')}`)
}
function pickIntensity(v) {
  if (v === undefined || v === null || v === '') return 'normal'
  if (INTENSITIES.includes(v)) return v
  throw bad('invalid_intensity', `intensité : ${INTENSITIES.join(', ')}`)
}

// EXIF d'une photo spoofée (fabricant/modèle + GPS), comme l'app.
function withExif(jpeg, deviceKey, gps) {
  const zeroth = {}
  const d = deviceKey && deviceKey !== 'none' ? SPOOF_DEVICES.find(x => x.k === deviceKey) : null
  if (d && d.make) {
    zeroth[piexif.ImageIFD.Make] = d.make
    zeroth[piexif.ImageIFD.Model] = d.model
    if (d.software) zeroth[piexif.ImageIFD.Software] = d.software
  }
  const gpsIfd = {}
  if (gps) {
    gpsIfd[piexif.GPSIFD.GPSLatitudeRef] = gps.lat >= 0 ? 'N' : 'S'
    gpsIfd[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(gps.lat))
    gpsIfd[piexif.GPSIFD.GPSLongitudeRef] = gps.lon >= 0 ? 'E' : 'W'
    gpsIfd[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(gps.lon))
  }
  if (!Object.keys(zeroth).length && !Object.keys(gpsIfd).length) return jpeg
  try {
    const exif = piexif.dump({ '0th': zeroth, Exif: {}, GPS: gpsIfd, '1st': {}, thumbnail: null })
    return Buffer.from(piexif.insert(exif, jpeg.toString('binary')), 'binary')
  } catch { return jpeg }
}

export const CATALOG = {
  tools: [
    { id: 'spoof', for: ['video', 'image'], desc: 'Rend la vidéo / la photo unique : léger zoom/recadrage, métadonnées d’origine effacées, appareil et GPS réécrits.' },
    { id: 'remix', for: ['video'], desc: 'Vraies variations : recadrage, luminosité/contraste/saturation, teinte, micro-vitesse, micro-coupe, miroir (option).' },
  ],
  intensities: INTENSITIES,
  devices: SPOOF_DEVICES.map(d => ({ id: d.k, label: d.label })),
  gps: GPS_CITIES.map(c => ({ id: c.k, label: c.label })),
  remix_toggles: DEFAULT_TOGGLES,
}

export default async function handler(req, res) {
  const t0 = Date.now()
  const url = new URL(req.url, 'http://x')
  const tool = String(url.searchParams.get('tool') || '').replace(/^\/+|\/+$/g, '').toLowerCase()
  const method = String(req.method || 'GET').toUpperCase()
  let s = null, who = null
  const reply = async (status, body) => {   // noté dans le journal de l'API avant la réponse
    if (s) await logCall(s, req, { who, method, route: `tools${tool ? '/' + tool : ''}`, status, error: body.ok ? null : body.error })
    return send(res, status, body)
  }
  try {
    s = db()
    const auth = await authCheck(s, req.headers.authorization)
    const scope = auth.scope
    who = scope ?? auth.attach ?? null
    if (!scope) return reply(401, { ok: false, code: 'unauthorized', error: `clé API refusée : ${auth.reason}` })
    if (!tool && method === 'GET') return reply(200, { ok: true, ...CATALOG })
    if (!['spoof', 'remix'].includes(tool) || method !== 'POST') return reply(404, { ok: false, code: 'not_found', error: `outil inconnu : ${method} /api/v1/tools/${tool}` })

    const b = bodyOf(req)
    const intensity = pickIntensity(b.intensity)
    const device = pickDevice(b.device)
    const { gps, label: gpsLabel } = pickGps(b.gps)
    const seed = Number.isFinite(+b.seed) && b.seed !== '' && b.seed !== null ? +b.seed : randomInt(1, 2_000_000_000)

    // Source
    let src
    if (b.file_id) src = await bytesOfFile(s, scope, b.file_id, MAX_INPUT)
    else if (b.url) { const got = await fetchPublic(b.url, { maxBytes: MAX_INPUT }); src = { ...got, title: null, folder: null, ext: extOf(new URL(got.finalUrl).pathname) } }
    else return reply(422, { ok: false, code: 'invalid_action', error: 'file_id ou url requis' })
    const isImage = IMG.includes(src.ext) || String(src.contentType).startsWith('image/')
    if (isImage && tool !== 'spoof') return reply(422, { ok: false, code: 'invalid_file', error: 'le remix est réservé aux vidéos (utilise spoof pour une photo)' })
    const inExt = src.ext || (isImage ? 'jpg' : 'mp4')

    const baseTitle = String(b.title || src.title || (isImage ? 'photo' : 'vidéo'))
    const folder = b.folder !== undefined ? cleanFolder(b.folder) : src.folder ?? null
    let file
    if (isImage) {
      const { out } = await runFfmpeg(src.buf, { inExt, outExt: 'jpg', args: imageSpoofArgs({ seed, intensity }), timeoutMs: 20_000 })
      file = await storeBytes(s, scope, { buf: withExif(out, device, gps), ext: 'jpg', contentType: 'image/jpeg', title: b.title ? baseTitle : `${baseTitle} · spoof`, folder })
    } else {
      const args = tool === 'remix'
        ? remixArgs({ seed, intensity, gps, device, toggles: { ...DEFAULT_TOGGLES, ...(b.toggles && typeof b.toggles === 'object' ? b.toggles : {}) } })
        : spoofArgs({ seed, intensity, gps, device })
      const { out, thumb } = await runFfmpeg(src.buf, { inExt, outExt: 'mp4', args, timeoutMs: 48_000, extraOut: true })
      file = await storeBytes(s, scope, { buf: out, ext: 'mp4', contentType: MIME_OF.mp4, title: b.title ? baseTitle : `${baseTitle} · ${tool}`, folder, thumb })
    }
    return reply(200, { ok: true, tool, file, settings: { seed, intensity, device, gps: gpsLabel, ...(gps ? { coords: gps } : {}) }, ms: Date.now() - t0 })
  } catch (e) {
    const status = Number(e?.status) || 500
    return reply(status, { ok: false, code: e?.code || 'server_error', error: status === 500 ? `erreur serveur : ${e?.message || e}` : String(e?.message || e) })
  }
}
