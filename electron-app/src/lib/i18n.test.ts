import { describe, it, expect } from 'vitest'
import { EN, FR } from './i18n'

// Garantit la parité FR/EN : toute clé ajoutée d'un côté doit exister de
// l'autre, sinon le mode anglais affiche la clé brute (ou l'inverse).
describe('parité des traductions', () => {
  it('toutes les clés EN existent en FR', () => {
    const missing = Object.keys(EN).filter(k => !(k in FR))
    expect(missing).toEqual([])
  })

  it('toutes les clés FR existent en EN', () => {
    const extra = Object.keys(FR).filter(k => !(k in EN))
    expect(extra).toEqual([])
  })

  it('aucune valeur vide', () => {
    const emptyEn = Object.entries(EN).filter(([, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k)
    const emptyFr = Object.entries(FR).filter(([, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k)
    expect(emptyEn).toEqual([])
    expect(emptyFr).toEqual([])
  })
})
