import { describe, it, expect, beforeEach } from 'vitest'
import { TOOLS, visibleTools, searchTools } from './tools'
import { openTool, takeOpenArg, recentTools } from './openTool'

// Stockages navigateur simulés (node).
function mem() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() } }
beforeEach(() => { Object.assign(globalThis, { sessionStorage: mem(), localStorage: mem() }) })

const PAGES = ['hub', 'publish', 'scheduled', 'studio', 'blowContent', 'warmup', 'flowBuilder', 'phones', 'viral', 'links', 'activity', 'bank', 'genjutsu']

describe('catalogue d’outils', () => {
  it('ids uniques, pages connues', () => {
    expect(new Set(TOOLS.map(t => t.id)).size).toBe(TOOLS.length)
    for (const t of TOOLS) expect(PAGES).toContain(t.page)
  })
  it('outils admin cachés aux clients, visibles pour l’admin', () => {
    const now = new Date('2026-10-13T12:00:00')
    expect(visibleTools('geelark', false, now).some(t => t.id === 'cross')).toBe(false)
    expect(visibleTools('geelark', true, now).some(t => t.id === 'cross')).toBe(true)
    expect(visibleTools('geelark', false, new Date('2026-10-01')).some(t => t.id === 'mass-edit')).toBe(false)
    expect(visibleTools('cloud', false, now).some(t => t.id === 'reels')).toBe(false)
    expect(visibleTools('geelark', false, now).some(t => t.id === 'genjutsu')).toBe(true)
    expect(visibleTools('geelark', true, now).some(t => t.id === 'genjutsu')).toBe(true)
  })
  it('recherche sans accents', () => {
    expect(searchTools(TOOLS, 'legendes').map(t => t.id)).toContain('bank-captions')
  })
})

describe('ouverture d’un outil précis', () => {
  it('lu une seule fois, pour la bonne page, récents limités à 8', () => {
    const pages: string[] = []
    openTool((p: string) => pages.push(p), 'studio', { tool: 'remix' }, 'remix')
    expect(pages).toEqual(['studio'])
    expect(takeOpenArg('publish')).toBeNull()
    expect(takeOpenArg('studio')).toEqual({ tool: 'remix' })
    expect(takeOpenArg('studio')).toBeNull()
    for (let i = 0; i < 12; i++) openTool(() => {}, 'hub', undefined, `t${i}`)
    expect(recentTools()).toHaveLength(8)
    expect(recentTools()[0]).toBe('t11')
  })
  it('expire après 10 s', () => {
    openTool(() => {}, 'bank', { tab: 'image' })
    expect(takeOpenArg('bank', Date.now() + 11_000)).toBeNull()
  })
})

describe('connexion', () => {
  it('erreurs Supabase traduites en messages clairs', async () => {
    const { authErrorMessage, passwordScore } = await import('@/pages/Auth')
    expect(authErrorMessage('Invalid login credentials')).toMatch(/incorrect/)
    expect(authErrorMessage('Email not confirmed')).toMatch(/Confirme/)
    expect(authErrorMessage('User already registered')).toMatch(/existe déjà/)
    expect(authErrorMessage('Unsupported provider: provider is not enabled')).toMatch(/Google/)
    expect(authErrorMessage('autre chose')).toBe('autre chose')
    expect(passwordScore('abc')).toBe(0)
    expect(passwordScore('Abcdefgh12!x')).toBe(4)
  })
})

describe('banque — pagination et quota', () => {
  it('lit toutes les pages au-delà de 1000 lignes', async () => {
    const { fetchAllRows } = await import('./bankStorage')
    const all = Array.from({ length: 2345 }, (_, i) => ({ id: i }))
    const make = () => ({ range: async (a: number, b: number) => ({ data: all.slice(a, b + 1), error: null }) })
    const r = await fetchAllRows<{ id: number }>(make)
    expect(r.data).toHaveLength(2345)
    expect(r.error).toBeNull()
  })
  it('bloque au-delà de la limite, jamais en illimité', async () => {
    const { quotaIssue } = await import('./bankStorage')
    const G = 1024 ** 3
    expect(quotaIssue({ used: 4 * G, quota: 5 * G, plan: 'standard' }, 0.5 * G)).toBeNull()
    expect(quotaIssue({ used: 4.8 * G, quota: 5 * G, plan: 'standard' }, 0.5 * G)).toMatch(/Pas assez/)
    expect(quotaIssue({ used: 5 * G, quota: 5 * G, plan: 'standard' }, 1)).toMatch(/Espace plein/)
    expect(quotaIssue({ used: 999 * G, quota: null, plan: 'organisation' }, G)).toBeNull()
  })
})
