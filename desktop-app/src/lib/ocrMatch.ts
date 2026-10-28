// Reconnaissance TOLÉRANTE des mots lus par l'OCR (Tesseract) sur l'écran d'un iPhone.
// Le libellé « Instagram » est souvent mal lu : « lnstagram », « |nstagram », « Instagrarn »,
// « Instaqram », ou coupé en deux mots (« Insta » « gram »). Fonctions pures (testées).

export interface OcrHit { text: string; x?: number; y?: number; w?: number; h?: number; cx: number; cy: number }

// Confusions OCR classiques ramenées à la lettre attendue, puis lettres seules.
export function normOcr(t: string): string {
  return t.toLowerCase()
    .replace(/rn/g, 'm').replace(/[|!1]/g, 'i').replace(/0/g, 'o').replace(/5/g, 's')
    .replace(/[^a-z]/g, '')
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return d[b.length]
}

/** Vrai pour « Instagram » et ses lectures OCR approximatives — pas pour Instacart,
 *  Telegram, Threads, Edits… */
export function isInstagramText(t: string): boolean {
  const n = normOcr(t).replace(/^l/, 'i')
  if (n.length < 5) return false
  if (/nstag|stagr|tagram/.test(n)) return true
  return n.length >= 7 && n.length <= 12 && lev(n, 'instagram') <= 2
}

/** Ajoute aux mots lus les paires de mots VOISINS sur la même ligne, collées
 *  (« Insta » + « gram » → « Instagram »), avec le centre de l'ensemble. */
export function withJoined<T extends OcrHit>(words: T[]): T[] {
  const out = [...words]
  for (const a of words) {
    const ha = a.h ?? 20
    for (const b of words) {
      if (a === b || b.cx <= a.cx) continue
      if (Math.abs(a.cy - b.cy) > ha * 0.6) continue
      const aRight = a.x != null && a.w != null ? a.x + a.w : a.cx + ha
      const bLeft = b.x ?? b.cx - ha
      if (bLeft - aRight > ha * 1.2) continue
      out.push({ ...a, text: a.text + b.text, cx: Math.round((a.cx + b.cx) / 2), cy: Math.round((a.cy + b.cy) / 2) })
    }
  }
  return out
}
