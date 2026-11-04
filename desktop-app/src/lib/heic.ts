// Photos HEIC/HEIF (iPhone) converties en JPEG à l'import : la plupart des navigateurs, des outils
// et Instagram via GeeLark ne les lisent pas. Convertisseur (libheif) chargé seulement si besoin.
export const isHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type)

export async function heicToJpeg(f: File): Promise<File> {
  if (!isHeic(f)) return f
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: f, toType: 'image/jpeg', quality: 0.92 })
  const blob = Array.isArray(out) ? out[0] : out          // photo « live » / rafale : la première image
  return new File([blob], f.name.replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: f.lastModified })
}
