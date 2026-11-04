// Photos HEIC/HEIF (iPhone) converties en JPEG : la plupart des navigateurs, des outils et
// Instagram via GeeLark ne les lisent pas. Décodeur récent (heic-to, libheif à jour : HEIC des
// iPhone récents) puis l'ancien (heic2any) en secours. Chargés seulement si besoin.
export const isHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type)

// Vrai HEIC d'après le contenu (même mal nommé .jpg) : boîte « ftyp » + marque HEIF.
export function sniffHeic(head: Uint8Array): boolean {
  if (head.length < 12) return false
  const s = String.fromCharCode(...head.slice(4, 12))
  return s.startsWith('ftyp') && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|heif)/.test(s.slice(4))
}

async function decode(blob: Blob): Promise<Blob> {
  try {
    const { heicTo } = await import('heic-to')
    return await heicTo({ blob, type: 'image/jpeg', quality: 0.92 })
  } catch (e1) {
    try {
      const { default: heic2any } = await import('heic2any')
      const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 })
      return Array.isArray(out) ? out[0] : out             // photo « live » / rafale : la première image
    } catch (e2) {
      const m = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message) || String(e)
      throw new Error(`HEIC illisible (${m(e1)} / ${m(e2)})`.slice(0, 200))
    }
  }
}

export async function heicToJpeg(f: File): Promise<File> {
  if (!isHeic(f)) {
    const head = new Uint8Array(await f.slice(0, 16).arrayBuffer())
    if (!sniffHeic(head)) return f
  }
  const blob = await decode(f)
  return new File([blob], f.name.replace(/\.(heic|heif|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: f.lastModified })
}
