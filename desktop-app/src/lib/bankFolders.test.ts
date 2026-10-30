import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { folderTree, isWithin, renamedPath, joinPath, parentOf, leafOf, normPath, cleanSeg } from './bankFolders'

describe('Banque — sous-dossiers', () => {
  it('arborescence : parents implicites, frères triés, profondeur', () => {
    const t = folderTree(['Genjutsu/Zoe', 'Genjutsu/Lina', 'Montages', null, 'Genjutsu / Zoe / Semaine 2', 'Archives'])
    expect(t.map(n => `${'  '.repeat(n.depth)}${n.name}${n.hasChildren ? '/' : ''}`)).toEqual([
      'Archives', 'Genjutsu/', '  Lina', '  Zoe/', '    Semaine 2', 'Montages',
    ])
    expect(t.find(n => n.name === 'Semaine 2')!.path).toBe('Genjutsu/Zoe/Semaine 2')
  })
  it('appartenance, parent, nom, chemins', () => {
    expect(isWithin('Genjutsu/Zoe', 'Genjutsu')).toBe(true)
    expect(isWithin('Genjutsu', 'Genjutsu')).toBe(true)
    expect(isWithin('Genjutsu 2', 'Genjutsu')).toBe(false)
    expect(isWithin(' Genjutsu / Zoe ', 'Genjutsu/Zoe')).toBe(true)
    expect(isWithin(null, 'Genjutsu')).toBe(false)
    expect(parentOf('A/B/C')).toBe('A/B')
    expect(parentOf('A')).toBe(null)
    expect(leafOf('A/B/C')).toBe('C')
    expect(normPath(' A //B/ ')).toBe('A/B')
    expect(joinPath('Genjutsu', 'Zoe / Lina')).toBe('Genjutsu/Zoe - Lina')
    expect(joinPath(null, 'Racine')).toBe('Racine')
    expect(cleanSeg('  a/b  ')).toBe('a-b')
  })
  it('renommer un dossier renomme ses sous-dossiers', () => {
    expect(renamedPath('Genjutsu', 'Genjutsu', 'IA')).toBe('IA')
    expect(renamedPath('Genjutsu/Zoe/S2', 'Genjutsu', 'IA')).toBe('IA/Zoe/S2')
    expect(renamedPath('Genjutsu/Zoe', 'Genjutsu/Zoe', 'Genjutsu/Zoé')).toBe('Genjutsu/Zoé')
  })
})
