// Lecteur ZIP léger, sans dépendance, pour importer un dossier ZIP de vidéos dans la Banque.
// Il lit le ZIP MORCEAU PAR MORCEAU (Blob.slice) : seulement le sommaire, puis un fichier à la
// fois au moment de l'importer. JSZip chargeait tout le ZIP en mémoire (plusieurs Go de vidéos →
// plantage). Gère ZIP64 (> 4 Go), les « data descriptors », les noms UTF-8 et CP437 (Windows).
// Méthodes : 0 (stocké, zéro copie) et 8 (deflate, via DecompressionStream). Testé dans
// zipReader.test.ts.

export interface ZipEntry {
  /** Chemin complet dans le ZIP (« Lot/Modèle A/v1.mp4 »). */
  path: string
  /** Nom du fichier seul (« v1.mp4 »). */
  name: string
  /** Taille décompressée (octets). */
  size: number
  dir: boolean
  encrypted: boolean
  /** Contenu du fichier (une seule entrée en mémoire à la fois). */
  file(): Promise<Blob>
}

const SIG_EOCD = 0x06054b50, SIG_Z64_LOC = 0x07064b50, SIG_Z64_EOCD = 0x06064b50
const SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50
const MAX32 = 0xffffffff, MAX16 = 0xffff

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer())
}
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true))

// CP437 (encodage historique des ZIP Windows) : moitié haute 0x80–0xFF.
const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '
function decodeName(b: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return new TextDecoder('utf-8').decode(b)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b) } catch { /* pas de l'UTF-8 */ }
  let s = ''
  for (const c of b) s += c < 0x80 ? String.fromCharCode(c) : CP437[c - 0x80]
  return s
}

/** Lit le sommaire du ZIP. Lève une erreur si ce n'est pas un ZIP lisible. */
export async function readZip(blob: Blob): Promise<ZipEntry[]> {
  const size = blob.size
  if (size < 22) throw new Error('Fichier ZIP invalide.')
  // Fin du sommaire (EOCD) : dans les 22 + 65 535 derniers octets (commentaire possible).
  const tailStart = Math.max(0, size - 22 - 0xffff)
  const tail = await bytes(blob, tailStart, size)
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === SIG_EOCD) { eocd = i; break }
  if (eocd < 0) throw new Error('Fichier ZIP invalide ou incomplet.')
  let count = tail.getUint16(eocd + 10, true)
  let cdSize = tail.getUint32(eocd + 12, true)
  let cdOffset = tail.getUint32(eocd + 16, true)
  // ZIP64 : le localisateur est juste avant l'EOCD.
  if (count === MAX16 || cdSize === MAX32 || cdOffset === MAX32) {
    const locAbs = tailStart + eocd - 20
    if (locAbs >= 0) {
      const loc = await bytes(blob, locAbs, locAbs + 20)
      if (loc.getUint32(0, true) === SIG_Z64_LOC) {
        const recAbs = u64(loc, 8)
        const rec = await bytes(blob, recAbs, recAbs + 56)
        if (rec.getUint32(0, true) !== SIG_Z64_EOCD) throw new Error('Fichier ZIP64 invalide.')
        count = u64(rec, 32); cdSize = u64(rec, 40); cdOffset = u64(rec, 48)
      }
    }
  }
  if (cdOffset + cdSize > size) throw new Error('Fichier ZIP incomplet (téléchargement interrompu ?).')
  const cd = await bytes(blob, cdOffset, cdOffset + cdSize)
  const entries: ZipEntry[] = []
  let p = 0
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== SIG_CEN) throw new Error('Sommaire du ZIP illisible.')
    const flags = cd.getUint16(p + 8, true)
    const method = cd.getUint16(p + 10, true)
    let compSize = cd.getUint32(p + 20, true)
    let fullSize = cd.getUint32(p + 24, true)
    const nameLen = cd.getUint16(p + 28, true), extraLen = cd.getUint16(p + 30, true), commentLen = cd.getUint16(p + 32, true)
    let localOffset = cd.getUint32(p + 42, true)
    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)
    let path = decodeName(nameBytes, (flags & 0x800) !== 0)
    // Champs extra : ZIP64 (0x0001) et chemin Unicode (0x7075).
    let e = p + 46 + nameLen
    const eEnd = e + extraLen
    while (e + 4 <= eEnd) {
      const id = cd.getUint16(e, true), len = cd.getUint16(e + 2, true)
      let q = e + 4
      if (id === 0x0001) {
        if (fullSize === MAX32 && q + 8 <= e + 4 + len) { fullSize = u64(cd, q); q += 8 }
        if (compSize === MAX32 && q + 8 <= e + 4 + len) { compSize = u64(cd, q); q += 8 }
        if (localOffset === MAX32 && q + 8 <= e + 4 + len) { localOffset = u64(cd, q) }
      } else if (id === 0x7075 && len > 5) {
        path = new TextDecoder('utf-8').decode(new Uint8Array(cd.buffer, cd.byteOffset + e + 9, len - 5))
      }
      e += 4 + len
    }
    p = eEnd + commentLen
    const dir = path.endsWith('/') || path.endsWith('\\')
    const clean = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    const name = clean.split('/').pop() ?? clean
    const encrypted = (flags & 1) !== 0
    const off = localOffset, cs = compSize
    entries.push({
      path: clean, name, size: fullSize, dir, encrypted,
      async file() {
        if (encrypted) throw new Error('fichier protégé par mot de passe')
        const lh = await bytes(blob, off, off + 30)
        if (lh.getUint32(0, true) !== SIG_LOC) throw new Error('fichier illisible dans le ZIP')
        const start = off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true)
        const data = blob.slice(start, start + cs)
        if (method === 0) return data
        if (method === 8) return new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
        throw new Error(`méthode de compression non prise en charge (${method})`)
      },
    })
  }
  return entries
}
