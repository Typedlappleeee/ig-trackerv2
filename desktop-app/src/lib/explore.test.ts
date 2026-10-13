import { describe, it, expect, beforeEach } from 'vitest'
import { TOOLS, visibleTools, searchTools } from './tools'
import { openTool, takeOpenArg, recentTools } from './openTool'
import { parseList, genUsernames, batchPrompt } from './ai'
import { usernameIssue } from './igRules'

// Stockages navigateur simulés (node).
function mem() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() } }
beforeEach(() => { Object.assign(globalThis, { sessionStorage: mem(), localStorage: mem() }) })

const PAGES = ['hub', 'publish', 'scheduled', 'ai', 'studio', 'blowContent', 'warmup', 'flowBuilder', 'phones', 'viral', 'links', 'activity', 'bank']

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
  })
  it('recherche sans accents', () => {
    expect(searchTools(TOOLS, 'legendes').map(t => t.id)).toContain('ai-captions')
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

describe('outils IA', () => {
  it('découpe une liste numérotée proprement', () => {
    expect(parseList('Voici 3 légendes :\n1. POV : ton crush 😳\n2) « Tu restes jusqu’à la fin ? »\n\n- POV : ton crush 😳\n• Dernière chance 🔥')).toEqual(['POV : ton crush 😳', 'Tu restes jusqu’à la fin ?', 'Dernière chance 🔥'])
  })
  it('pseudos valides, uniques, en nombre demandé', () => {
    let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const u = genUsernames('Léa', 30, rnd)
    expect(u.length).toBe(30)
    expect(new Set(u).size).toBe(30)
    for (const h of u) expect(usernameIssue(h)).toBeNull()
    expect(genUsernames('***')).toEqual([])
  })
  it('consigne : langue et hashtags respectés', () => {
    const m = batchPrompt('captions', { niche: 'fitness', tone: 'drôle', lang: 'en', n: 10, hashtags: false })
    expect(m[0].content).toMatch(/ANGLAIS/)
    expect(m[1].content).toMatch(/sans hashtags/)
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
