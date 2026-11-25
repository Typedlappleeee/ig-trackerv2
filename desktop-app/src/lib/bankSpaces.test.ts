import { describe, it, expect } from 'vitest'
import { baseTitle, stackCopies, proposeModelMoves, parseTemplate, templatePaths, groupModelsByMarket, marketsOfTags } from './bankSpaces'

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

describe('template et marchés des modèles', () => {
  it('template : lignes propres, sans doublon ; vide = rubriques par défaut', () => {
    expect(parseTemplate(' Reels / Originaux \nReels/Originaux\n\nStories/CTA')).toEqual(['Reels/Originaux', 'Stories/CTA'])
    expect(templatePaths('Kenza', [])).toEqual(['Kenza/Reels', 'Kenza/Feed', 'Kenza/Stories', 'Kenza/Genjutsu'])
    expect(templatePaths('Zoé', ['Reels/Spoof'])).toEqual(['Zoé/Reels/Spoof'])
  })
  it('modèles groupées par marché (une modèle sur 2 marchés dans les 2), Commun à part', () => {
    const mk: Record<string, ('fr' | 'us' | 'de')[]> = { Kenza: ['fr', 'us'], Zoe: ['de'], Lia: [] }
    expect(groupModelsByMarket(['Kenza', 'Zoe', 'Lia', 'Commun'], m => mk[m] ?? [])).toEqual([
      { label: '🇫🇷 France', models: ['Kenza'] }, { label: '🇺🇸 USA', models: ['Kenza'] }, { label: '🇩🇪 Allemagne', models: ['Zoe'] }, { label: 'Sans marché', models: ['Lia'] },
    ])
    expect(marketsOfTags(['model', 'market:us'])).toEqual(['us'])
  })
})
