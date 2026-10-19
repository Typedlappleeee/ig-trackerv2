import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { downloadZip } from 'client-zip'
import { readZip } from './zipReader'

const rnd = (n: number, seed = 1) => { const a = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; a[i] = x >>> 24 } return a }
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer())
const part = (u: Uint8Array) => u as unknown as BlobPart

// ZIP fabriqué à la main (une entrée stockée) : ZIP64, noms non UTF-8, drapeaux, méthode.
function craft({ name, flags = 0, method = 0, data, zip64 = false }: { name: Uint8Array; flags?: number; method?: number; data: Uint8Array; zip64?: boolean }): Blob {
  const F = 0xffffffff
  const lh = new DataView(new ArrayBuffer(30))
  lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, flags, true); lh.setUint16(8, method, true)
  lh.setUint32(18, zip64 ? F : data.length, true); lh.setUint32(22, zip64 ? F : data.length, true); lh.setUint16(26, name.length, true)
  const cdOffset = 30 + name.length + data.length
  const extra = zip64 ? 28 : 0
  const ce = new DataView(new ArrayBuffer(46 + name.length + extra))
  ce.setUint32(0, 0x02014b50, true); ce.setUint16(4, 45, true); ce.setUint16(6, 45, true); ce.setUint16(8, flags, true); ce.setUint16(10, method, true)
  ce.setUint32(20, zip64 ? F : data.length, true); ce.setUint32(24, zip64 ? F : data.length, true)
  ce.setUint16(28, name.length, true); ce.setUint16(30, extra, true); ce.setUint32(42, zip64 ? F : 0, true)
  new Uint8Array(ce.buffer).set(name, 46)
  if (zip64) {
    const x = 46 + name.length
    ce.setUint16(x, 1, true); ce.setUint16(x + 2, 24, true)
    ce.setBigUint64(x + 4, BigInt(data.length), true); ce.setBigUint64(x + 12, BigInt(data.length), true); ce.setBigUint64(x + 20, 0n, true)
  }
  const parts: BlobPart[] = [lh.buffer, part(name), part(data), ce.buffer]
  if (zip64) {
    const rec = new DataView(new ArrayBuffer(56))
    rec.setUint32(0, 0x06064b50, true); rec.setBigUint64(4, 44n, true); rec.setUint16(12, 45, true); rec.setUint16(14, 45, true)
    rec.setBigUint64(24, 1n, true); rec.setBigUint64(32, 1n, true); rec.setBigUint64(40, BigInt(ce.byteLength), true); rec.setBigUint64(48, BigInt(cdOffset), true)
    const loc = new DataView(new ArrayBuffer(20))
    loc.setUint32(0, 0x07064b50, true); loc.setBigUint64(8, BigInt(cdOffset + ce.byteLength), true); loc.setUint32(16, 1, true)
    parts.push(rec.buffer, loc.buffer)
  }
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, zip64 ? 0xffff : 1, true); eocd.setUint16(10, zip64 ? 0xffff : 1, true)
  eocd.setUint32(12, zip64 ? F : ce.byteLength, true); eocd.setUint32(16, zip64 ? F : cdOffset, true)
  parts.push(eocd.buffer)
  return new Blob(parts)
}

describe('readZip', () => {
  const video = rnd(3 * 1024 * 1024 + 17, 7)        // ~3 Mo « vidéo » (aléatoire : incompressible)
  const text = new TextEncoder().encode('bonjour '.repeat(50_000))  // très compressible

  for (const compression of ['STORE', 'DEFLATE'] as const) {
    it(`JSZip ${compression} : contenu identique, dossiers, accents, commentaire`, async () => {
      const z = new JSZip()
      z.file('Lot/Modèle A/vidéo 1.mp4', video)
      z.file('Lot/notes.txt', text)
      z.folder('Lot/Vide')
      z.file('__MACOSX/Lot/._vidéo 1.mp4', new Uint8Array([1, 2, 3]))
      const blob = new Blob([part(await z.generateAsync({ type: 'uint8array', compression, comment: 'commentaire du zip' }))])
      const entries = await readZip(blob)
      const v = entries.find(e => e.path === 'Lot/Modèle A/vidéo 1.mp4')!
      expect(v.name).toBe('vidéo 1.mp4')
      expect(v.size).toBe(video.length)
      expect(same(await bytesOf(await v.file()), video)).toBe(true)
      const t = entries.find(e => e.name === 'notes.txt')!
      expect(same(await bytesOf(await t.file()), text)).toBe(true)
      expect(entries.find(e => e.path === 'Lot/Vide')?.dir).toBe(true)
      expect(entries.some(e => e.path.startsWith('__MACOSX/'))).toBe(true)
    })
  }

  it('client-zip (data descriptors : tailles à 0 dans l’en-tête local)', async () => {
    const blob = await downloadZip([
      { name: 'clips/a.mp4', input: video },
      { name: 'b.mov', input: text },
    ]).blob()
    const entries = await readZip(blob)
    expect(entries.map(e => e.path)).toEqual(['clips/a.mp4', 'b.mov'])
    expect(same(await bytesOf(await entries[0].file()), video)).toBe(true)
    expect(same(await bytesOf(await entries[1].file()), text)).toBe(true)
  })

  it('ZIP64 (tailles et positions à 0xFFFFFFFF)', async () => {
    const data = rnd(5000, 3)
    const entries = await readZip(craft({ name: new TextEncoder().encode('gros/v.mp4'), data, zip64: true }))
    expect(entries).toHaveLength(1)
    expect(entries[0].size).toBe(5000)
    expect(same(await bytesOf(await entries[0].file()), data)).toBe(true)
  })

  it('nom Windows en CP437 (« é » = 0x82) et nom UTF-8 sans drapeau', async () => {
    const cp = await readZip(craft({ name: new Uint8Array([...new TextEncoder().encode('vid'), 0x82, 0x6f, 0x2e, 0x6d, 0x70, 0x34]), data: rnd(10) }))
    expect(cp[0].name).toBe('vidéo.mp4')
    const u = await readZip(craft({ name: new TextEncoder().encode('été.mp4'), data: rnd(10) }))
    expect(u[0].name).toBe('été.mp4')
  })

  it('fichier chiffré signalé, méthode inconnue refusée, faux ZIP refusé', async () => {
    const enc = await readZip(craft({ name: new TextEncoder().encode('a.mp4'), flags: 1, data: rnd(10) }))
    expect(enc[0].encrypted).toBe(true)
    await expect(enc[0].file()).rejects.toThrow(/mot de passe/)
    const bz = await readZip(craft({ name: new TextEncoder().encode('a.mp4'), method: 12, data: rnd(10) }))
    await expect(bz[0].file()).rejects.toThrow(/non prise en charge/)
    await expect(readZip(new Blob([rnd(5000)]))).rejects.toThrow(/invalide/)
  })
})
