import { describe, it, expect, vi } from 'vitest'
let calls = 0
let failAll = false
const deadModels = new Set<string>()
vi.mock('./ai', () => ({
  stripThinking: (t: string) => t,
  isModelUnavailable: (m: string) => /does not exist/.test(m),
  groqReason: (m: string) => m,
  groqModels: async () => null,
  pickChatModels: (p: string[]) => p,
  groqChat: vi.fn(async (_k: string, model: string, msgs: { content: string }[]) => {
    calls++
    if (deadModels.has(model)) throw new Error(`The model \`${model}\` does not exist or you do not have access to it.`)
    if (failAll) throw new Error('Rate limit reached. Please try again in 2.5s')
    if (calls % 4 === 2) throw new Error('Rate limit reached. Please try again in 1.2s')
    const ask = Number(msgs[msgs.length - 1].content)
    return Array.from({ length: ask }, (_, i) => `mot${calls} texte${i} unique #deutsch`).join('\n———\n')
  }),
}))
import { generateMarketCaptions, retryAfterMs } from './captionMarkets'

describe('descriptions illimitées et fiables', () => {
  it('100 descriptions toutes différentes malgré des limites de débit', async () => {
    calls = 0; failAll = false
    const waits: number[] = []
    const out = await generateMarketCaptions('k', 'de', 100, undefined, { sleep: async ms => { waits.push(ms) }, useCache: false })
    expect(out).toHaveLength(100)
    expect(new Set(out).size).toBe(100)
    expect(waits.some(w => w >= 1200 && w < 2500)).toBe(true) // attente du délai donné par Groq
  })
  it('Groq bloqué en continu → erreur claire après le délai sans progrès', async () => {
    calls = 0; failAll = true
    let t = 0
    const realNow = Date.now
    Date.now = () => realNow() + t
    try {
      await expect(generateMarketCaptions('k', 'de', 20, undefined, { sleep: async ms => { t += ms }, stallMs: 30_000, useCache: false })).rejects.toThrow(/seulement/)
    } finally { Date.now = realNow }
  })
  it('modèle retiré par Groq → plus jamais réessayé, les autres font tout', async () => {
    calls = 0; failAll = false; deadModels.clear(); deadModels.add('dead-a')
    const used: string[] = []
    const { groqChat } = await import('./ai')
    const out = await generateMarketCaptions('k', 'de', 60, undefined, { sleep: async () => {}, useCache: false, models: ['dead-a', 'ok-b', 'ok-c'] })
    expect(out).toHaveLength(60)
    for (const c of (groqChat as unknown as { mock: { calls: unknown[][] } }).mock.calls) used.push(String(c[1]))
    expect(used.filter(m => m === 'dead-a').length).toBeLessThanOrEqual(3) // 1 essai par travailleur au plus
    deadModels.clear()
  })
  it('tous les modèles retirés → erreur tout de suite (pas 5 min d’attente)', async () => {
    calls = 0; failAll = false; deadModels.clear(); deadModels.add('x'); deadModels.add('y')
    await expect(generateMarketCaptions('k', 'de', 20, undefined, { sleep: async () => {}, useCache: false, models: ['x', 'y'] })).rejects.toThrow(/aucun modèle/)
    deadModels.clear()
  })
  it('délai « try again in » lu', () => {
    expect(retryAfterMs('Please try again in 7.3s')).toBe(7300)
    expect(retryAfterMs('try again in 1m2.5s')).toBe(62500)
    expect(retryAfterMs('rien')).toBeNull()
  })
})
