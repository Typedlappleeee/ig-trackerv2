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
// Cœur téléchargé UNE fois (~30 Mo) : un moteur relancé après un plantage le réutilise.
let coreBlobs: Promise<{ coreURL: string; wasmURL: string }> | null = null

export async function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return instance
  if (loading) return loading
  loading = (async () => {
    coreBlobs ??= (async () => ({
      coreURL: await toBlobURL(coreURL, 'text/javascript'),
      wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
    }))()
    try {
      const ff = new FFmpeg()
      ff.on('progress', ({ progress }) => { if (progressCb) progressCb(Math.max(0, Math.min(1, progress))) })
      await ff.load(await coreBlobs)
      instance = ff
      return ff
    } catch (e) { coreBlobs = null; loading = null; throw e }
  })()
  return loading
}

export function isFfmpegReady(): boolean { return !!instance }

// Un plantage du moteur wasm (« RuntimeError: memory access out of bounds », abort, mémoire…)
// le laisse CASSÉ : toutes les commandes suivantes échouaient pareil jusqu'au rechargement de la
// page (Auto-contenu : « 0 variantes générées »). On le jette et le prochain appel en recharge un
// neuf (cœur déjà en cache).
const CRASH = /RuntimeError|memory access out of bounds|Aborted\(|\bOOM\b|out of memory|unreachable|FFmpeg\.terminate/i
export function isEngineCrash(e: unknown): boolean {
  if ((e as { crashed?: boolean } | null)?.crashed) return true
  return CRASH.test(e instanceof Error ? `${e.name} ${e.message}` : String(e))
}
export function resetFFmpeg(): void {
  const old = instance
  instance = null; loading = null
  try { old?.terminate() } catch { /* déjà mort */ }
}
function crashed(e: unknown): Error {
  resetFFmpeg()
  const err = new Error(`moteur vidéo planté (${e instanceof Error ? e.message : String(e)})`) as Error & { crashed: boolean }
  err.crashed = true
  return err
}

// Durée d'une vidéo (secondes) lue par ffmpeg — fiable même en HEVC/.mov où le
// lecteur <video> du navigateur échoue. `ffmpeg -i` sort en erreur (pas de fichier
// de sortie) mais imprime « Duration: HH:MM:SS.ss » qu'on parse depuis les logs.
export async function probeDuration(input: Blob | ArrayBuffer | Uint8Array): Promise<number> {
  const ff = await getFFmpeg()
  const name = `probe_${Math.random().toString(36).slice(2)}.mp4`
  let dur = 0
  const onLog = ({ message }: { message: string }) => {
    const m = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])
  }
  ff.on('log', onLog)
  let broken = false
  try {
    await ff.writeFile(name, (await toU8(input)).slice())
    try { await ff.exec(['-i', name]) } catch (e) { if (isEngineCrash(e)) broken = true /* sinon : pas de sortie, normal */ }
  } catch (e) { if (isEngineCrash(e)) broken = true } finally {
    ff.off('log', onLog)
    if (broken) resetFFmpeg()
    else try { await ff.deleteFile(name) } catch { /* noop */ }
  }
  return dur
}

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
// exec() renvoie le code de sortie (0 = ok) — on lève une erreur avec les derniers
// logs ffmpeg si ça échoue, pour un diagnostic clair à l'écran.
export async function runFfmpeg(o: RunOpts): Promise<Uint8Array> {
  const ff = await getFFmpeg()
  const inName = o.inputName ?? 'input.mp4'
  // Sortie vidéo en .mov (QuickTime) par défaut — demandé pour la ferme iPhone/iRemoTech.
  // Les appels qui produisent autre chose (ex. audio .mp3) fournissent leur propre outName.
  const outName = o.outName ?? 'output.mp4'
  progressCb = o.onProgress ?? null
  const ring: string[] = []
  const logHandler = ({ message }: { message: string }) => { ring.push(message); if (ring.length > 60) ring.shift(); o.onLog?.(message) }
  ff.on('log', logHandler)
  let broken = false
  try {
    let code: number
    let data: Awaited<ReturnType<FFmpeg['readFile']>>
    try {
      // .slice() = copie : writeFile TRANSFERE (détache) le buffer passé. Sans copie,
      // réutiliser la même source (ex. N variantes de spoof) planterait sur "ArrayBuffer detached".
      await ff.writeFile(inName, (await toU8(o.input)).slice())
      for (const ex of o.extra ?? []) await ff.writeFile(ex.name, (await toU8(ex.data)).slice())
      code = await ff.exec(['-i', inName, ...o.args, outName])
      data = code === 0 ? await ff.readFile(outName) : new Uint8Array()
    } catch (e) {
      if (isEngineCrash(e)) { broken = true; throw crashed(e) }
      throw e
    }
    if (code !== 0) throw new Error(`ffmpeg (code ${code})\n${ring.slice(-10).join('\n')}`)
    return data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
  } finally {
    progressCb = null
    ff.off('log', logHandler)
    // Toujours libérer la mémoire du moteur (avant : rien n'était supprimé après un échec).
    if (!broken) for (const n of [inName, outName, ...(o.extra ?? []).map(x => x.name)]) { try { await ff.deleteFile(n) } catch { /* absent */ } }
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
