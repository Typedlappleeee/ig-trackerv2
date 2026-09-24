// OCR local via Tesseract.js — 100 % embarqué (worker + cœur wasm + langue servis
// depuis public/tesseract/, aucun CDN). Sert à LIRE l'écran d'un iPhone iRemoTech
// (ex. le sélecteur de container Crane « Select Container ») pour taper au bon endroit.
//
// Les coordonnées renvoyées sont dans l'espace PIXEL de l'image d'ORIGINE (les
// prétraitements internes sont re-convertis) = le même espace que les taps iRemoTech.
import { createWorker, type Worker } from 'tesseract.js'

export interface OcrWord { text: string; x: number; y: number; w: number; h: number; cx: number; cy: number; conf: number }
export interface OcrOpts {
  scale?: number       // agrandissement avant OCR (défaut 2.5) — clé pour les petits chiffres
  threshold?: number | null   // binarisation : lum < seuil → noir (défaut 195). null = pas de binarisation
  invert?: boolean     // inverse les tons (texte CLAIR sur fond FONCÉ → lisible par Tesseract)
  cropY?: [number, number]     // recadre verticalement [y0,y1] en fractions (0..1) → OCR focalisé, texte plus gros
  psms?: string[]      // modes de segmentation à fusionner (défaut ['6','11'])
}

const BASE = import.meta.env.BASE_URL // '/' en web, './' en Electron
let workerP: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (workerP) return workerP
  workerP = (async () => {
    return createWorker('eng', 1, {
      workerPath: `${BASE}tesseract/worker.min.js`,
      corePath: `${BASE}tesseract`,
      langPath: `${BASE}tesseract`,
      gzip: true,
    })
  })()
  workerP.catch(() => { workerP = null })
  return workerP
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}

// Agrandit + met en niveaux de gris + binarise (chiffres foncés → noir sur blanc).
// Améliore énormément la lecture de chiffres clairs/peu contrastés (sélecteur Crane).
// Retourne l'image prétraitée + l'offset vertical (px, espace d'origine) dû au recadrage.
async function preprocess(image: string, scale: number, threshold: number | null, invert: boolean, cropY?: [number, number]): Promise<{ url: string; offY: number }> {
  const img = await loadImg(image)
  const oW = img.naturalWidth, oH = img.naturalHeight
  const y0 = cropY ? Math.max(0, Math.round(cropY[0] * oH)) : 0
  const y1 = cropY ? Math.min(oH, Math.round(cropY[1] * oH)) : oH
  const srcH = Math.max(1, y1 - y0)
  const W = Math.max(1, Math.round(oW * scale)), H = Math.max(1, Math.round(srcH * scale))
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, y0, oW, srcH, 0, 0, W, H)
  const d = ctx.getImageData(0, 0, W, H); const p = d.data
  for (let i = 0; i < p.length; i += 4) {
    let g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]
    if (invert) g = 255 - g
    const v = threshold == null ? g : (g < threshold ? 0 : 255)
    p[i] = p[i + 1] = p[i + 2] = v
  }
  ctx.putImageData(d, 0, 0)
  return { url: cv.toDataURL('image/png'), offY: y0 }
}

// Lit les « mots » d'une image avec leurs positions (dans l'espace de l'image d'origine).
// `whitelist` restreint les caractères (ex. chiffres) → plus fiable.
export async function ocrWords(image: string, whitelist?: string, opts?: OcrOpts): Promise<OcrWord[]> {
  const scale = opts?.scale ?? 2.5
  const threshold = opts?.threshold === undefined ? 195 : opts.threshold
  const invert = opts?.invert ?? false
  const psms = opts?.psms ?? ['6', '11']
  const pre = await preprocess(image, scale, threshold, invert, opts?.cropY)
  const src = pre.url, offY = pre.offY
  const w = await getWorker()
  const merged: OcrWord[] = []
  for (const psm of psms) {
    // On (re)définit TOUJOURS la whitelist : sinon un filtre chiffres posé à un appel
    // précédent resterait actif et empêcherait de relire des lettres (ex. « Instagram »).
    await w.setParameters({ tessedit_char_whitelist: whitelist ?? '', tessedit_pageseg_mode: psm } as never)
    const { data } = await w.recognize(src, undefined, { blocks: true })
    type AnyWord = { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }
    const blocks = (data as { blocks?: unknown[] }).blocks ?? []
    for (const block of blocks as Array<{ paragraphs?: unknown[] }>) {
      for (const para of (block.paragraphs ?? []) as Array<{ lines?: unknown[] }>) {
        for (const line of (para.lines ?? []) as Array<{ words?: unknown[] }>) {
          for (const word of (line.words ?? []) as AnyWord[]) {
            const b = word.bbox; const t = (word.text ?? '').trim()
            if (!b || !t) continue
            const x = b.x0 / scale, y = b.y0 / scale + offY, ww = (b.x1 - b.x0) / scale, hh = (b.y1 - b.y0) / scale
            merged.push({ text: t, x, y, w: ww, h: hh, cx: Math.round(x + ww / 2), cy: Math.round(y + hh / 2), conf: word.confidence ?? 0 })
          }
        }
      }
    }
  }
  // Dédoublonnage : même texte à ~même hauteur (les 2 passes PSM se recouvrent).
  const out: OcrWord[] = []
  for (const m of merged) {
    if (out.some(o => o.text === m.text && Math.abs(o.cy - m.cy) < 20 && Math.abs(o.cx - m.cx) < 40)) continue
    out.push(m)
  }
  return out
}

export async function terminateOcr(): Promise<void> {
  if (!workerP) return
  try { const w = await workerP; await w.terminate() } catch { /* noop */ }
  workerP = null
}
