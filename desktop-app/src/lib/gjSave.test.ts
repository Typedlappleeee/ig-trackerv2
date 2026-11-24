import { describe, it, expect, vi } from 'vitest'
const mem = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } })
vi.mock('./supabase', () => ({ supabase: {} }))
const { saveJobs, mergeJobs } = await import('./genjutsuHF')
type GjJob = import('./genjutsuHF').GjJob

describe('Genjutsu : stockage plein → les rendus récents restent', () => {
  it('allège / raccourcit la liste au lieu de perdre les nouveaux', () => {
    const jobs = Array.from({ length: 500 }, (_, i) => ({ id: 'j' + i, status: 'done', prompt: 'x'.repeat(3000), createdAt: 1000 - i } as unknown as GjJob))
    let saved = ''
    const ok = saveJobs(jobs, (_k, v) => { if (v.length > 200_000) throw new Error('QuotaExceededError'); saved = v })
    expect(ok).toBe(true)
    const back = JSON.parse(saved) as GjJob[]
    expect(back[0].id).toBe('j0')                 // le plus récent est gardé
    expect(back[0].prompt.length).toBe(3000)       // les 40 premiers gardent leur prompt
  })
})

describe('Genjutsu : liste partagée dans l’agence', () => {
  const J = (id: string, by: string, at: number, status = 'done') => ({ id, by, createdAt: at, status } as unknown as GjJob)
  it('mes rendus = version locale, ceux des collègues = serveur, retirés s’ils n’y sont plus', () => {
    const mine = (j: GjJob) => j.by === 'me'
    const local = [{ ...J('a', 'me', 3), status: 'running' } as GjJob, J('b', 'other', 2), J('gone', 'other', 1)]
    const remote = [{ ...J('a', 'me', 3), status: 'waiting' } as GjJob, { ...J('b', 'other', 2), status: 'failed' } as GjJob, J('c', 'other', 4)]
    const out = mergeJobs(local, remote, mine)
    expect(out.map(j => j.id)).toEqual(['c', 'a', 'b'])
    expect(out.find(j => j.id === 'a')!.status).toBe('running')
    expect(out.find(j => j.id === 'b')!.status).toBe('failed')
  })
})
