import { describe, it, expect, vi } from 'vitest'

// supabase.ts crée un client avec localStorage au chargement — indisponible en
// environnement node. On le mocke : seules les fonctions pures sont testées ici.
vi.mock('./supabase', () => ({ supabase: {} }))

import { timeUntil, defaultSchedValue } from './schedulerService'

describe('timeUntil', () => {
  it('retourne "maintenant" pour une date passée', () => {
    expect(timeUntil(new Date(Date.now() - 1000).toISOString())).toBe('maintenant')
  })

  it('affiche les minutes sous une heure', () => {
    const iso = new Date(Date.now() + 5.5 * 60_000).toISOString()
    expect(timeUntil(iso)).toBe('dans 5 min')
  })

  it('affiche heures + minutes sous 24 h', () => {
    const iso = new Date(Date.now() + (2 * 60 + 30.5) * 60_000).toISOString()
    expect(timeUntil(iso)).toBe('dans 2h 30min')
  })

  it('affiche une heure pile sans minutes', () => {
    const iso = new Date(Date.now() + 60.5 * 60_000).toISOString()
    expect(timeUntil(iso)).toBe('dans 1h')
  })

  it('affiche jours + heures au-delà de 24 h', () => {
    const iso = new Date(Date.now() + (3 * 24 + 5) * 3_600_000 + 30_000).toISOString()
    expect(timeUntil(iso)).toBe('dans 3j 5h')
  })
})

describe('defaultSchedValue', () => {
  it('produit un format datetime-local valide', () => {
    expect(defaultSchedValue()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('est environ N minutes dans le futur', () => {
    const v = defaultSchedValue(90)
    const parsed = new Date(v).getTime()
    const expected = Date.now() + 90 * 60_000
    expect(Math.abs(parsed - expected)).toBeLessThan(60_000)
  })
})
