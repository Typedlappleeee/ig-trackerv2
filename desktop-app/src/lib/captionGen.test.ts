import { describe, it, expect, vi } from 'vitest'
let calls = 0
vi.mock('./ai', () => ({
  groqText: vi.fn(async (_k: string, msgs: { content: string }[]) => {
    calls++
    if (calls === 2 || calls === 3) throw new Error('relais Groq indisponible (HTTP 504)')
    const ask = Number(msgs[msgs.length - 1].content)
    return Array.from({ length: ask }, (_, i) => `caption ${calls}-${i} #deutsch`).join('\n———\n')
  }),
}))
import { generateMarketCaptions } from './captionMarkets'

describe('descriptions : toutes, même si des lots ratent', () => {
  it('relance après les échecs et renvoie exactement N descriptions', async () => {
    calls = 0
    const waits: number[] = []
    const out = await generateMarketCaptions('k', 'de', 42, undefined, { sleep: async ms => { waits.push(ms) } })
    expect(out).toHaveLength(42)
    expect(new Set(out).size).toBe(42)
    expect(waits).toEqual([10000, 20000])
  })
  it('échec persistant → erreur (rien n’est lancé avec des descriptions réutilisées)', async () => {
    calls = 1 // tous les appels suivants échouent ? non : on force via maxTries
    await expect(generateMarketCaptions('k', 'de', 42, undefined, { sleep: async () => {}, maxTries: 2 })).rejects.toThrow(/seulement/)
  })
})
