import { describe, it, expect } from 'vitest'
import { fetchFast } from './fastFetch'

// Faux stockage : fichier de `size` octets, requêtes Range « bytes=a-b ».
function server(size: number, opts: { exposeRange?: boolean; ignoreRange?: boolean } = {}) {
  const file = new Uint8Array(size)
  for (let i = 0; i < size; i++) file[i] = i % 251
  let calls = 0
  const f = (async (_url: string, init?: RequestInit) => {
    calls++
    const range = (init?.headers as Record<string, string> | undefined)?.Range
    const headers = new Headers({ 'content-type': 'video/mp4' })
    if (!range || opts.ignoreRange) { headers.set('content-length', String(size)); return new Response(file.slice(), { status: 200, headers }) }
    const [a, b] = range.replace('bytes=', '').split('-').map(Number)
    if (a >= size) return new Response(null, { status: 416 })
    const end = Math.min(b, size - 1)
    if (opts.exposeRange !== false) headers.set('content-range', `bytes ${a}-${end}/${size}`)
    return new Response(file.slice(a, end + 1), { status: 206, headers })
  }) as unknown as typeof fetch
  return { f, file, calls: () => calls }
}
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer())
// Comparaison rapide (toEqual sur 20 Mo est extrêmement lent).
const same = (a: Uint8Array, b: Uint8Array) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true }
const MB = 1024 * 1024

describe('fetchFast', () => {
  it('reconstitue le fichier exact en morceaux parallèles (taille connue)', async () => {
    const s = server(19 * MB + 12345)
    const seen: number[] = []
    const out = await bytes(await fetchFast('u', p => seen.push(p.loaded), undefined, s.f))
    expect(out.length).toBe(s.file.length)
    expect(same(out, s.file)).toBe(true)
    expect(s.calls()).toBe(5)                       // 4 Mo × 5
    expect(seen[seen.length - 1]).toBe(s.file.length)
  })
  it('sans Content-Range exposé : s’arrête au dernier morceau / 416', async () => {
    const s = server(9 * MB + 7, { exposeRange: false })
    const out = await bytes(await fetchFast('u', undefined, undefined, s.f))
    expect(same(out, s.file)).toBe(true)
  })
  it('taille multiple exacte de 4 Mo sans Content-Range', async () => {
    const s = server(8 * MB, { exposeRange: false })
    expect(same(await bytes(await fetchFast('u', undefined, undefined, s.f)), s.file)).toBe(true)
  })
  it('petit fichier : une seule requête', async () => {
    const s = server(300_000)
    expect(same(await bytes(await fetchFast('u', undefined, undefined, s.f)), s.file)).toBe(true)
    expect(s.calls()).toBe(1)
  })
  it('serveur sans Range : téléchargement simple', async () => {
    const s = server(6 * MB, { ignoreRange: true })
    expect(same(await bytes(await fetchFast('u', undefined, undefined, s.f)), s.file)).toBe(true)
  })
})
