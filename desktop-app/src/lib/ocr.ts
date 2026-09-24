// OCR local via Tesseract.js — 100 % embarqué (worker + cœur wasm + langue servis
// depuis public/tesseract/, aucun CDN). Sert à LIRE l'écran d'un iPhone iRemoTech
// (ex. le sélecteur de container Crane « Select Container ») pour taper au bon endroit.
//
// Les coordonnées renvoyées sont dans l'espace PIXEL de l'image analysée = le même
// espace que les taps iRemoTech (cf. LiveDevice.toDevice), donc utilisables tels quels.
import { createWorker, type Worker } from 'tesseract.js'

export interface OcrWord { text: string; x: number; y: number; w: number; h: number; cx: number; cy: number; conf: number }

const BASE = import.meta.env.BASE_URL // '/' en web, './' en Electron
let workerP: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (workerP) return workerP
  workerP = (async () => {
    const w = await createWorker('eng', 1, {
      workerPath: `${BASE}tesseract/worker.min.js`,
      corePath: `${BASE}tesseract`,      // dossier → tesseract choisit le bon cœur (simd/relaxedsimd/lstm)
      langPath: `${BASE}tesseract`,      // contient eng.traineddata.gz
      gzip: true,
    })
    return w
  })()
  workerP.catch(() => { workerP = null })
  return workerP
}

// Lit les « mots » d'une image (data URL ou URL) avec leurs positions.
// `whitelist` restreint les caractères reconnus (ex. chiffres) → plus fiable.
export async function ocrWords(image: string, whitelist?: string): Promise<OcrWord[]> {
  const w = await getWorker()
  if (whitelist != null) {
    // PSM 11 = "sparse text" : bien pour des libellés isolés (lignes d'une liste).
    await w.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: '11' } as never)
  }
  // v7 : les mots sont dans la hiérarchie blocks → paragraphs → lines → words.
  const { data } = await w.recognize(image, undefined, { blocks: true })
  const out: OcrWord[] = []
  type AnyWord = { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }
  const blocks = (data as { blocks?: unknown[] }).blocks ?? []
  for (const block of blocks as Array<{ paragraphs?: unknown[] }>) {
    for (const para of (block.paragraphs ?? []) as Array<{ lines?: unknown[] }>) {
      for (const line of (para.lines ?? []) as Array<{ words?: unknown[] }>) {
        for (const word of (line.words ?? []) as AnyWord[]) {
          const b = word.bbox
          if (!b) continue
          const x = b.x0, y = b.y0, ww = b.x1 - b.x0, hh = b.y1 - b.y0
          out.push({ text: (word.text ?? '').trim(), x, y, w: ww, h: hh, cx: Math.round(x + ww / 2), cy: Math.round(y + hh / 2), conf: word.confidence ?? 0 })
        }
      }
    }
  }
  return out
}

export async function terminateOcr(): Promise<void> {
  if (!workerP) return
  try { const w = await workerP; await w.terminate() } catch { /* noop */ }
  workerP = null
}
