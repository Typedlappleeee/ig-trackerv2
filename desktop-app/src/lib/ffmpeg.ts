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

// PLUSIEURS moteurs (un par traitement en cours, jusqu'à MAX_ENGINES) : deux Auto-contenu, ou
// Auto-contenu + Studio, tournent EN MÊME TEMPS sans se marcher dessus (avant : un seul moteur
// et des noms de fichiers fixes → les traitements simultanés s'écrasaient et échouaient).
const MAX_ENGINES = 3
interface Engine { ff: FFmpeg; busy: boolean; progress: ((r: number) => void) | null }
const engines: Engine[] = []
const waiters: ((e: Engine) => void)[] = []
// Cœur téléchargé UNE fois (~30 Mo) : réutilisé par chaque moteur et après un plantage.
let coreBlobs: Promise<{ coreURL: string; wasmURL: string }> | null = null

async function newEngine(): Promise<Engine> {
  coreBlobs ??= (async () => ({
    coreURL: await toBlobURL(coreURL, 'text/javascript'),
    wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
  }))()
  const ff = new FFmpeg()
  const eng: Engine = { ff, busy: true, progress: null }
  ff.on('progress', ({ progress }) => { eng.progress?.(Math.max(0, Math.min(1, progress))) })
  try { await ff.load(await coreBlobs) } catch (e) { coreBlobs = null; throw e }
  return eng
}
// Un moteur libre (ou un nouveau, ou on attend qu'un se libère).
async function acquire(): Promise<Engine> {
  const free = engines.find(e => !e.busy)
  if (free) { free.busy = true; return free }
  if (engines.length < MAX_ENGINES) {
    const placeholder = { busy: true } as Engine
    engines.push(placeholder)
    try { const e = await newEngine(); engines[engines.indexOf(placeholder)] = e; return e }
    catch (err) { engines.splice(engines.indexOf(placeholder), 1); throw err }
  }
  return new Promise(res => waiters.push(res))
}
function release(e: Engine) {
  e.progress = null
  const w = waiters.shift()
  if (w) w(e); else e.busy = false
}
function drop(e: Engine) {                       // moteur planté : jeté, remplacé à la demande
  const k = engines.indexOf(e); if (k >= 0) engines.splice(k, 1)
  try { e.ff.terminate() } catch { /* déjà mort */ }
  const w = waiters.shift()
  if (w) acquire().then(w, () => undefined)
}

// Précharge un moteur (affiche « moteur prêt »).
export async function getFFmpeg(): Promise<FFmpeg> {
  if (engines.some(e => e.ff)) return engines.find(e => e.ff)!.ff
  const e = await acquire(); release(e); return e.ff
}
export function isFfmpegReady(): boolean { return engines.some(e => !!e.ff) }

// Un plantage du moteur wasm (« RuntimeError: memory access out of bounds », abort, mémoire…)
// le laisse CASSÉ : on le jette, le suivant en recharge un neuf (cœur déjà en cache).
const CRASH = /RuntimeError|memory access out of bounds|Aborted\(|\bOOM\b|out of memory|unreachable|FFmpeg\.terminate/i
export function isEngineCrash(e: unknown): boolean {
  if ((e as { crashed?: boolean } | null)?.crashed) return true
  return CRASH.test(e instanceof Error ? `${e.name} ${e.message}` : String(e))
}
export function resetFFmpeg(): void {
  for (const e of engines.filter(x => x.ff && !x.busy)) drop(e)
}
function crashed(e: unknown): Error {
  const err = new Error(`moteur vidéo planté (${e instanceof Error ? e.message : String(e)})`) as Error & { crashed: boolean }
  err.crashed = true
  return err
}
const uid = () => Math.random().toString(36).slice(2, 10)

// Durée d'une vidéo (secondes) lue par ffmpeg — fiable même en HEVC/.mov où le
// lecteur <video> du navigateur échoue. `ffmpeg -i` sort en erreur (pas de fichier
// de sortie) mais imprime « Duration: HH:MM:SS.ss » qu'on parse depuis les logs.
export async function probeDuration(input: Blob | ArrayBuffer | Uint8Array): Promise<number> {
  const eng = await acquire(), ff = eng.ff
  const name = `probe_${uid()}.mp4`
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
    if (broken) drop(eng)
    else { try { await ff.deleteFile(name) } catch { /* noop */ } release(eng) }
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
  const eng = await acquire(), ff = eng.ff
  // noms propres à CE traitement (les fichiers auxiliaires gardent leur nom, utilisé dans les filtres)
  const tag = uid()
  const inName = `${tag}_${o.inputName ?? 'input.mp4'}`
  const outName = `${tag}_${o.outName ?? 'output.mp4'}`
  eng.progress = o.onProgress ?? null
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
    ff.off('log', logHandler)
    if (broken) drop(eng)
    else {
      for (const n of [inName, outName, ...(o.extra ?? []).map(x => x.name)]) { try { await ff.deleteFile(n) } catch { /* absent */ } }
      release(eng)
    }
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
