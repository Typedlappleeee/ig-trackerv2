// Traitements Studio (ffmpeg.wasm côté client). Chaque outil prend une vidéo
// source (banque ou PC) et produit un mp4 prêt à poster, enregistré dans la banque.
import { supabase } from './supabase'
import { runFfmpeg, fetchInput } from './ffmpeg'
import { transcribeGroq, type Segment } from './subtitles'

export interface SourceRef { id?: string; title: string; storage_path?: string | null; file_url?: string | null }

// Récupère les octets d'une source (URL signée banque OU fichier PC).
export async function resolveSourceBytes(v: SourceRef, file?: File): Promise<Uint8Array> {
  if (file) return fetchInput(file)
  if (v.storage_path) {
    const { data } = await supabase.storage.from('content').createSignedUrl(v.storage_path, 3600)
    if (data?.signedUrl) return fetchInput(data.signedUrl)
  }
  if (v.file_url) return fetchInput(v.file_url)
  throw new Error('Source introuvable')
}

// Enregistre un mp4 de sortie dans la banque (bucket content + content_bank).
export async function saveOutputToBank(userId: string, orgId: string | null, bytes: Uint8Array, title: string, ext = 'mp4', folder: string | null = null): Promise<string | null> {
  const scopeFolder = orgId ? `orgs/${orgId}` : `users/${userId}`
  const id = crypto.randomUUID()
  const storagePath = `videos/${scopeFolder}/${id}.${ext}`
  const blob = new Blob([bytes as BlobPart], { type: ext === 'mp4' ? 'video/mp4' : 'application/octet-stream' })
  const up = await supabase.storage.from('content').upload(storagePath, blob, { contentType: blob.type, upsert: false })
  if (up.error) return null
  await supabase.from('content_bank').insert({
    user_id: userId, org_id: orgId, title, storage_path: storagePath,
    file_url: null, folder: folder || null, duration: null, tags: [], notes: null, used_count: 0,
  })
  return storagePath
}

// Encodage h264/aac rapide (wasm). '-c:a aac' est ignoré s'il n'y a pas d'audio.
const H264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']
// Garantit des dimensions paires (libx264 yuv420p l'exige).
const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'

type Hooks = { onProgress?: (r: number) => void; onLog?: (m: string) => void }

// ── Spoof : micro-variations + nettoyage métadonnées → unique pour l'algo ──────
// Pas de changement de vitesse (éviterait un désync A/V sur vidéos sans piste audio).
export type SpoofIntensity = 'subtle' | 'normal' | 'strong'
export interface SpoofOpts { gps?: { lat: number; lon: number } | null; intensity?: SpoofIntensity }

// Amplitude des micro-variations selon l'intensité choisie.
function intensityRanges(i: SpoofIntensity) {
  if (i === 'subtle') return { b: 0.02, c: [0.99, 1.02], s: [0.99, 1.02], z: [1.01, 1.025] } as const
  if (i === 'strong') return { b: 0.07, c: [0.94, 1.07], s: [0.93, 1.08], z: [1.03, 1.08] } as const
  return { b: 0.04, c: [0.97, 1.04], s: [0.97, 1.05], z: [1.02, 1.05] } as const
}
export function spoofFilter(seed: number, intensity: SpoofIntensity = 'normal'): string {
  const r = intensityRanges(intensity)
  const rnd = (mul: number, min: number, max: number) => min + ((Math.sin(seed * mul) + 1) / 2) * (max - min)
  const b = rnd(999.1, -r.b, r.b).toFixed(3)
  const c = rnd(733.3, r.c[0], r.c[1]).toFixed(3)
  const s = rnd(431.7, r.s[0], r.s[1]).toFixed(3)
  const z = rnd(197.5, r.z[0], r.z[1]).toFixed(3)
  return `eq=brightness=${b}:contrast=${c}:saturation=${s},scale=iw*${z}:ih*${z},crop=iw/${z}:ih/${z},${EVEN}`
}
// Localisations GPS proposées (écrites dans les métadonnées mp4 par le spoof).
// Source unique partagée par Studio et Auto-contenu.
export interface GpsCity { k: string; label: string; lat: number; lon: number }
export const GPS_CITIES: GpsCity[] = [
  { k: 'none', label: 'Aucune (par défaut)', lat: 0, lon: 0 },
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
// Résout une clé de ville en coordonnées GPS pour runSpoof (null si « none »).
export function gpsFor(key: string): { lat: number; lon: number } | null {
  const c = GPS_CITIES.find(x => x.k === key)
  return !c || c.k === 'none' ? null : { lat: c.lat, lon: c.lon }
}

// Localisation GPS au format ISO 6709 (mp4 `location` metadata) — ex. +48.8566+002.3522/
function iso6709(lat: number, lon: number): string {
  const f = (v: number, w: number) => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(4).padStart(w + 5, '0')
  return `${f(lat, 2)}${f(lon, 3)}/`
}
export async function runSpoof(input: Uint8Array, seed: number, h?: Hooks, opts?: SpoofOpts): Promise<Uint8Array> {
  const intensity = opts?.intensity ?? 'normal'
  // -map_metadata -1 : on efface toutes les métadonnées d'origine (anti-empreinte),
  // puis on (ré)écrit une localisation GPS choisie si demandée.
  const meta: string[] = ['-map_metadata', '-1']
  if (opts?.gps) { const loc = iso6709(opts.gps.lat, opts.gps.lon); meta.push('-metadata', `location=${loc}`, '-metadata', `location-eng=${loc}`) }
  return runFfmpeg({
    input, args: ['-vf', spoofFilter(seed, intensity), ...meta, ...H264],
    onProgress: h?.onProgress, onLog: h?.onLog,
  })
}

// ── Remix : plusieurs variantes uniques (spoof plus prononcé, seeds différents) ─
export async function runRemixVariant(input: Uint8Array, seed: number, h?: Hooks, opts?: SpoofOpts): Promise<Uint8Array> {
  return runSpoof(input, seed * 7.3 + 1.1, h, opts)
}

// ── Montage : coupe (début/fin) → mp4 ré-encodé ───────────────────────────────
export async function runMontage(input: Uint8Array, start: number, end: number | null, h?: Hooks): Promise<Uint8Array> {
  const args = ['-ss', String(Math.max(0, start))]
  if (end != null && end > start) args.push('-to', String(end))
  args.push(...H264)
  return runFfmpeg({ input, args, onProgress: h?.onProgress, onLog: h?.onLog })
}

// ── Incrustation photo : overlay d'une image (largeur fixe) centrée sur la vidéo ─
export async function runOverlay(input: Uint8Array, image: Uint8Array, imageExt: string, opts: { widthPx: number; from: number; to: number | null }, h?: Hooks): Promise<Uint8Array> {
  const enable = opts.to != null ? `:enable='between(t,${opts.from},${opts.to})'` : (opts.from > 0 ? `:enable='gte(t,${opts.from})'` : '')
  const filter = `[1:v]scale=${Math.round(opts.widthPx)}:-1[ov];[0:v][ov]overlay=(W-w)/2:(H-h)/2${enable},${EVEN}[v]`
  return runFfmpeg({
    input, inputName: 'in.mp4',
    extra: [{ name: `ov.${imageExt}`, data: image }],
    args: ['-i', `ov.${imageExt}`, '-filter_complex', filter, '-map', '[v]', '-map', '0:a?', ...H264],
    onProgress: h?.onProgress, onLog: h?.onLog,
  })
}

// ── Mixer : incruste une légende (PNG canvas 1080px) sur la vidéo ──────────────
export type CaptionPos = 'top' | 'center' | 'bottom' | { x: number; y: number }
export async function runCaption(input: Uint8Array, text: string, pos: CaptionPos, h?: Hooks): Promise<Uint8Array> {
  const png = await textToPng(text, 1080)
  // Placement : preset (top/center/bottom) OU manuel (x,y en % de l'image, centre du PNG).
  let x = '(W-w)/2', y: string
  if (typeof pos === 'object') {
    x = `(W*${(pos.x / 100).toFixed(4)})-(w/2)`
    y = `(H*${(pos.y / 100).toFixed(4)})-(h/2)`
  } else {
    y = pos === 'top' ? 'H*0.06' : pos === 'center' ? '(H-h)/2' : 'H-h-H*0.06'
  }
  const filter = `[0:v][1:v]overlay=${x}:${y},${EVEN}[v]`
  return runFfmpeg({
    input, inputName: 'in.mp4',
    extra: [{ name: 'cap.png', data: png }],
    args: ['-i', 'cap.png', '-filter_complex', filter, '-map', '[v]', '-map', '0:a?', ...H264],
    onProgress: h?.onProgress, onLog: h?.onLog,
  })
}

// ── Sous-titres : audio → Groq Whisper → PNG par segment → overlay minuté ──────
export async function runSubtitles(input: Uint8Array, groqKey: string, h?: Hooks): Promise<Uint8Array> {
  h?.onLog?.('🎧 Extraction audio…')
  const audio = await runFfmpeg({ input, args: ['-vn', '-ar', '16000', '-ac', '1', '-c:a', 'libmp3lame', '-q:a', '5'], outName: 'a.mp3' })
  h?.onLog?.('📝 Transcription (Groq Whisper)…')
  const segments = await transcribeGroq(groqKey, new Blob([audio as BlobPart], { type: 'audio/mpeg' }))
  if (segments.length === 0) throw new Error('Transcription vide')
  h?.onLog?.(`🖊 ${segments.length} segments — incrustation…`)
  // Un PNG (1080px) par segment, overlay activé entre ses timecodes. Chaîne d'overlays.
  const extra: { name: string; data: Uint8Array }[] = []
  let chain = ''
  let cursor = '[0:v]'
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    extra.push({ name: `s${i}.png`, data: await textToPng(seg.text, 1080, true) })
    const out = i === segments.length - 1 ? '[vv]' : `[v${i}]`
    chain += `${cursor}[${i + 1}:v]overlay=(W-w)/2:H-h-H*0.08:enable='between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)})'${out};`
    cursor = `[v${i}]`
  }
  chain += `[vv]${EVEN}[v]`
  const inputs = extra.flatMap(e => ['-i', e.name])
  return runFfmpeg({
    input, inputName: 'in.mp4', extra,
    args: [...inputs, '-filter_complex', chain, '-map', '[v]', '-map', '0:a?', ...H264],
    onProgress: h?.onProgress, onLog: h?.onLog,
  })
}

// ── Texte → PNG transparent via canvas (pas besoin de police côté ffmpeg) ──────
export async function textToPng(text: string, width: number, subtitle = false): Promise<Uint8Array> {
  const pad = Math.round(width * 0.04)
  const fontSize = subtitle ? Math.round(width * 0.045) : Math.round(width * 0.058)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `800 ${fontSize}px system-ui, Arial, sans-serif`
  // Découpe en lignes.
  const maxW = width - pad * 2
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  const lineH = Math.round(fontSize * 1.3)
  const height = lines.length * lineH + pad * 2
  canvas.width = width; canvas.height = height
  ctx.font = `800 ${fontSize}px system-ui, Arial, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  lines.forEach((ln, i) => {
    const cy = pad + i * lineH + lineH / 2
    // Contour noir + remplissage blanc (lisible sur toute vidéo).
    ctx.lineWidth = Math.round(fontSize * 0.16); ctx.strokeStyle = 'rgba(0,0,0,0.9)'
    ctx.strokeText(ln, width / 2, cy)
    ctx.fillStyle = '#fff'; ctx.fillText(ln, width / 2, cy)
  })
  const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

export type { Segment }
