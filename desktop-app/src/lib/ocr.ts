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

// Sérialise les appels OCR : le worker Tesseract est unique, donc deux lectures
// concurrentes (ex. 2 iPhones en parallèle) se télescoperaient. Le mutex garde les
// taps/attentes/uploads parallèles et ne sérialise QUE la reconnaissance.
let ocrMutex: Promise<unknown> = Promise.resolve()
export async function ocrWords(image: string, whitelist?: string, opts?: OcrOpts): Promise<OcrWord[]> {
  const run = () => ocrWordsInner(image, whitelist, opts)
  const p = ocrMutex.then(run, run)
  ocrMutex = p.then(() => undefined, () => undefined)
  return p
}

// Lit les « mots » d'une image avec leurs positions (dans l'espace de l'image d'origine).
// `whitelist` restreint les caractères (ex. chiffres) → plus fiable.
async function ocrWordsInner(image: string, whitelist?: string, opts?: OcrOpts): Promise<OcrWord[]> {
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

// Détecte le bouton d'action Instagram par sa COULEUR (bleu vif : Next/Share/Partager),
// dans une bande verticale [yMin,yMax]. Les outils (Overlay, Captions…) sont gris → ignorés.
// Renvoie le centre du plus gros amas bleu, en coordonnées de l'image d'origine. null si absent.
export async function findBlueButton(image: string, yMin = 0.55, yMax = 1, xMin = 0, xMax = 1): Promise<{ cx: number; cy: number } | null> {
  const img = await loadImg(image)
  const W = img.naturalWidth, H = img.naturalHeight
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const y0 = Math.max(0, Math.round(yMin * H)), y1 = Math.min(H, Math.round(yMax * H))
  // Bande horizontale optionnelle : pour un bouton connu à droite (Next/Share), on
  // ignore le reste → évite qu'un amas bleu à gauche décale le centre (ex. « First draft »).
  const x0 = Math.max(0, Math.round(xMin * W)), x1 = Math.min(W, Math.round(xMax * W))
  const rows = Math.max(1, y1 - y0)
  const data = ctx.getImageData(0, y0, W, rows).data
  let sx = 0, sy = 0, n = 0
  let minX = W, maxX = 0, minY = rows, maxY = 0
  for (let yy = 0; yy < rows; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // Bleu Instagram (#0095F6 / #3897F0) : B élevé, R faible, B >> R.
      if (b > 170 && r < 130 && b > r + 70 && g > 70 && g < 205) {
        sx += xx; sy += yy; n++
        if (xx < minX) minX = xx; if (xx > maxX) maxX = xx
        if (yy < minY) minY = yy; if (yy > maxY) maxY = yy
      }
    }
  }
  if (n < 120) return null // pas assez de bleu → pas de bouton
  // Centre de la boîte englobante (plus stable que le centroïde si le bleu est irrégulier).
  return { cx: Math.round((minX + maxX) / 2), cy: y0 + Math.round((minY + maxY) / 2) }
}

// Détecte l'icône Instagram par son DÉGRADÉ (violet↔rose↔orange) plutôt que par le libellé
// (texte blanc peu lisible sur fond d'écran). On repère la zone de taille « icône » qui contient
// le plus de pixels « chauds » IG ET à la fois du violet (b élevé) ET de l'orange (b faible) —
// signature du dégradé, ce qui écarte un aplat rouge (YouTube) ou jaune (Snapchat).
export async function findInstagramIcon(image: string, yMin = 0, yMax = 1, xMin = 0, xMax = 1): Promise<{ cx: number; cy: number } | null> {
  const img = await loadImg(image)
  const W = img.naturalWidth, H = img.naturalHeight
  if (!W || !H) return null
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, W, H).data
  const x0 = Math.max(0, Math.round(xMin * W)), x1 = Math.min(W, Math.round(xMax * W))
  const y0 = Math.max(0, Math.round(yMin * H)), y1 = Math.min(H, Math.round(yMax * H))
  const cell = Math.max(24, Math.round(W * 0.12)) // ~ taille d'une icône
  const cols = Math.ceil(W / cell) + 1
  const warm = new Float64Array(cols * (Math.ceil(H / cell) + 1))
  const sx = new Float64Array(warm.length), sy = new Float64Array(warm.length)
  const purp = new Float64Array(warm.length), orng = new Float64Array(warm.length)
  const step = 2 // sous-échantillonnage (perf)
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * W + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // Couleur « chaude » du dégradé IG : R élevé, G faible, pas franchement bleu.
      if (r > 180 && g < 125 && r > g + 70 && b < 210) {
        const ci = Math.floor(x / cell) + Math.floor(y / cell) * cols
        warm[ci]++; sx[ci] += x; sy[ci] += y
        if (b > 115) purp[ci]++   // partie violette / rose (bas-gauche du dégradé)
        if (b < 90) orng[ci]++    // partie orange / rouge (haut-droite)
      }
    }
  }
  const minWarm = ((cell * cell) / (step * step)) * 0.16 // densité mini dans la cellule
  let best = -1, bestScore = 0
  for (let c = 0; c < warm.length; c++) {
    if (warm[c] < minWarm) continue
    if (purp[c] < 3 || orng[c] < 3) continue // exiger le DÉGRADÉ (violet + orange) → écarte un aplat
    if (warm[c] > bestScore) { bestScore = warm[c]; best = c }
  }
  if (best < 0) return null
  return { cx: Math.round(sx[best] / warm[best]), cy: Math.round(sy[best] / warm[best]) }
}

export async function terminateOcr(): Promise<void> {
  if (!workerP) return
  try { const w = await workerP; await w.terminate() } catch { /* noop */ }
  workerP = null
}
