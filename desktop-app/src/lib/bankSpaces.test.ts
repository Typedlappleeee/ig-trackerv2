import { describe, it, expect } from 'vitest'
import { baseTitle, stackCopies, proposeModelMoves } from './bankSpaces'

describe('Banque par modèle', () => {
  it('titre d’origine', () => {
    expect(baseTitle('kenz 122 · v1 · copie 3')).toBe('kenz 122')
    expect(baseTitle('Kenza-6 083')).toBe('kenza-6 083')
  })
  it('copies empilées sous l’original (même dossier), pile dépliable', () => {
    const l = [
      { id: 'c1', title: 'kenz 122 · copie 1', folder: 'K' }, { id: 'o', title: 'kenz 122', folder: 'K' },
      { id: 'c2', title: 'kenz 122 · v1 · copie 2', folder: 'K' }, { id: 'x', title: 'kenz 130', folder: 'K' },
      { id: 'y', title: 'kenz 122', folder: 'Autre' },
    ]
    const s = stackCopies(l, new Set())
    expect(s.list.map(i => i.id)).toEqual(['o', 'x', 'y'])
    expect(s.size.get('o')).toBe(3)
    const open = stackCopies(l, new Set([s.keyOf.get('o')!]))
    expect(open.list.map(i => i.id)).toEqual(['c1', 'o', 'c2', 'x', 'y'])
  })
  it('rangement proposé par le nom du dossier', () => {
    const moves = proposeModelMoves(['kenz 122', 'Kenza-6', 'zoe reels', 'Divers', 'Kenza', 'Commun'], ['Kenza', 'Zoé'], f => f.startsWith('zoe') ? 0.2 : 0.9)
    expect(moves).toEqual([
      { src: 'kenz 122', model: 'Kenza', dest: 'Kenza/Reels' },
      { src: 'Kenza-6', model: 'Kenza', dest: 'Kenza/Reels' },
      { src: 'zoe reels', model: 'Zoé', dest: 'Zoé/Feed' },
    ])
  })
})
