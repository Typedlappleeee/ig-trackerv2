// Moteur ffmpeg.wasm (traitement vidéo côté client — Electron renderer ET web).
// Cœur mono-thread (@ffmpeg/core) → pas besoin de SharedArrayBuffer / COOP-COEP.
// Chargé une seule fois, réutilisé pour tous les outils du Studio.
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL, fetchFile } from '@ffmpeg/util'

// Cœur copié dans public/ffmpeg/ par scripts/copy-ffmpeg.mjs (build & dev).
// BASE_URL gère le préfixe (./ en prod Electron, / en dev).
const CORE_BASE = `${import.meta.env.BASE_URL}ffmpeg`
const coreURL = `${CORE_BASE}/ffmpeg-core.js`
const wasmURL = `${CORE_BASE}/ffmpeg-core.wasm`

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let progressCb: ((ratio: number) => void) | null = null

export async function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return instance
  if (loading) return loading
  loading = (async () => {
    const ff = new FFmpeg()
    ff.on('progress', ({ progress }) => { if (progressCb) progressCb(Math.max(0, Math.min(1, progress))) })
    await ff.load({
      coreURL: await toBlobURL(coreURL, 'text/javascript'),
      wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
    })
    instance = ff
    return ff
  })()
  return loading
}

export function isFfmpegReady(): boolean { return !!instance }

export interface RunOpts {
  input: Blob | ArrayBuffer | Uint8Array   // vidéo/image source
  inputName?: string                        // ex. 'in.mp4'
  extra?: { name: string; data: Blob | ArrayBuffer | Uint8Array }[]  // fichiers auxiliaires (photo, 2e vidéo…)
  args: string[]                            // arguments ffmpeg (sans -i input, ajouté auto en tête)
  outName?: string                          // ex. 'out.mp4'
  onProgress?: (ratio: number) => void
  onLog?: (line: string) => void
}

// Exécute une commande ffmpeg sur l'entrée et renvoie le fichier de sortie (Uint8Array).
export async function runFfmpeg(o: RunOpts): Promise<Uint8Array> {
  const ff = await getFFmpeg()
  const inName = o.inputName ?? 'input.mp4'
  const outName = o.outName ?? 'output.mp4'
  progressCb = o.onProgress ?? null
  const logHandler = o.onLog ? ({ message }: { message: string }) => o.onLog!(message) : null
  if (logHandler) ff.on('log', logHandler)
  try {
    await ff.writeFile(inName, await toU8(o.input))
    for (const ex of o.extra ?? []) await ff.writeFile(ex.name, await toU8(ex.data))
    await ff.exec(['-i', inName, ...o.args, outName])
    const data = await ff.readFile(outName)
    const u8 = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
    // Nettoyage FS (best-effort).
    try { await ff.deleteFile(inName); await ff.deleteFile(outName); for (const ex of o.extra ?? []) await ff.deleteFile(ex.name) } catch { /* noop */ }
    return u8
  } finally {
    progressCb = null
    if (logHandler) ff.off('log', logHandler)
  }
}

async function toU8(x: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (x instanceof Uint8Array) return x
  if (x instanceof ArrayBuffer) return new Uint8Array(x)
  return new Uint8Array(await x.arrayBuffer())
}

// Récupère une entrée (URL signée Supabase ou fichier PC) en Uint8Array pour ffmpeg.
export async function fetchInput(urlOrFile: string | File): Promise<Uint8Array> {
  return fetchFile(urlOrFile as any)
}
