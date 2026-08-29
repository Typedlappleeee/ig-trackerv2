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
export async function saveOutputToBank(userId: string, orgId: string | null, bytes: Uint8Array, title: string, ext = 'mp4'): Promise<string | null> {
  const scopeFolder = orgId ? `orgs/${orgId}` : `users/${userId}`
  const id = crypto.randomUUID()
  const storagePath = `videos/${scopeFolder}/${id}.${ext}`
  const blob = new Blob([bytes as BlobPart], { type: ext === 'mp4' ? 'video/mp4' : 'application/octet-stream' })
  const up = await supabase.storage.from('content').upload(storagePath, blob, { contentType: blob.type, upsert: false })
  if (up.error) return null
  await supabase.from('content_bank').insert({
    user_id: userId, org_id: orgId, title, storage_path: storagePath,
    file_url: null, folder: null, duration: null, tags: [], notes: null, used_count: 0,
  })
  return storagePath
}

const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']

type Hooks = { onProgress?: (r: number) => void; onLog?: (m: string) => void }

// ── Spoof : micro-variations + nettoyage métadonnées → unique pour l'algo ──────
export function spoofFilter(seed: number): string {
  const rnd = (min: number, max: number) => min + ((Math.sin(seed * 999.1) + 1) / 2) * (max - min)
  const b = (rnd(-0.04, 0.04)).toFixed(3)
  const c = (rnd(0.97, 1.04)).toFixed(3)
  const s = (rnd(0.97, 1.05)).toFixed(3)
  const z = (rnd(1.02, 1.05)).toFixed(3)
  return `eq=brightness=${b}:contrast=${c}:saturation=${s},scale=iw*${z}:ih*${z},crop=iw/${z}:ih/${z}`
}
export async function runSpoof(input: Uint8Array, seed: number, h?: Hooks): Promise<Uint8Array> {
  const speed = (0.97 + ((Math.sin(seed * 13.7) + 1) / 2) * 0.06).toFixed(3)
  return runFfmpeg({
    input, args: [
      '-vf', `${spoofFilter(seed)},setpts=${(1 / Number(speed)).toFixed(4)}*PTS`,
      '-filter:a', `atempo=${speed}`,
      '-map_metadata', '-1', ...H264,
    ], onProgress: h?.onProgress, onLog: h?.onLog,
  })
}

// ── Remix : plusieurs variantes uniques (spoof plus prononcé, seeds différents) ─
export async function runRemixVariant(input: Uint8Array, seed: number, h?: Hooks): Promise<Uint8Array> {
  return runSpoof(input, seed * 7.3 + 1.1, h)
}

// ── Montage : coupe (début/fin) → mp4 ré-encodé ───────────────────────────────
export async function runMontage(input: Uint8Array, start: number, end: number | null, h?: Hooks): Promise<Uint8Array> {
  const args = ['-ss', String(Math.max(0, start))]
  if (end != null && end > start) args.push('-to', String(end))
  args.push(...H264)
  return runFfmpeg({ input, args, onProgress: h?.onProgress, onLog: h?.onLog })
}

// ── Incrustation photo : overlay d'une image sur la vidéo (position/taille/durée) ─
export async function runOverlay(input: Uint8Array, image: Uint8Array, imageExt: string, opts: { x: string; y: string; scale: number; from: number; to: number | null }, h?: Hooks): Promise<Uint8Array> {
  const enable = opts.to != null ? `:enable='between(t,${opts.from},${opts.to})'` : (opts.from > 0 ? `:enable='gte(t,${opts.from})'` : '')
  const filter = `[1:v]scale=iw*${opts.scale}:-1[ov];[0:v][ov]overlay=${opts.x}:${opts.y}${enable}[v]`
  return runFfmpeg({
    input, inputName: 'in.mp4',
    extra: [{ name: `ov.${imageExt}`, data: image }],
    args: ['-i', `ov.${imageExt}`, '-filter_complex', filter, '-map', '[v]', '-map', '0:a?', ...H264],
    onProgress: h?.onProgress, onLog: h?.onLog,
  })
}

// ── Mixer : incruste une légende (texte) rendue en PNG (canvas) sur la vidéo ───
export async function runCaption(input: Uint8Array, text: string, pos: 'top' | 'center' | 'bottom', h?: Hooks): Promise<Uint8Array> {
  const png = await textToPng(text, 1080)
  const y = pos === 'top' ? 'H*0.08' : pos === 'center' ? '(H-h)/2' : 'H*0.82'
  const filter = `[1:v]scale=W*0.9:-1[t];[0:v][t]overlay=(W-w)/2:${y}[v]`.replace(/W/g, 'main_w').replace(/H/g, 'main_h')
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
  // Un PNG par segment, overlay activé entre ses timecodes.
  const extra: { name: string; data: Uint8Array }[] = []
  const overlays: string[] = []
  let chain = '[0:v]'
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const png = await textToPng(seg.text, 1080, true)
    const name = `s${i}.png`
    extra.push({ name, data: png })
    overlays.push(`[${i + 1}:v]scale=main_w*0.9:-1[t${i}]`)
    chain += `[t${i}]overlay=(main_w-overlay_w)/2:main_h*0.8:enable='between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)})'`
    chain += (i < segments.length - 1) ? `[v${i}];[v${i}]` : '[v]'
  }
  const inputs = extra.flatMap(e => ['-i', e.name])
  const filter = overlays.join(';') + ';' + chain
  return runFfmpeg({
    input, inputName: 'in.mp4', extra,
    args: [...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '0:a?', ...H264],
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
