import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { upsertPreset, cleanPresetName } from './gjPresets'

describe('Genjutsu — presets de l’équipe', () => {
  it('même nom (majuscules ignorées) : le preset est remplacé ; liste triée', () => {
    const l = upsertPreset([{ id: '1', name: 'Plage', prompt: 'a' }, { id: '2', name: 'Duo', prompt: 'b' }], { id: '3', name: 'plage', prompt: 'c' })
    expect(l.map(p => `${p.name}:${p.prompt}`)).toEqual(['Duo:b', 'plage:c'])
  })
  it('nettoie le nom', () => {
    expect(cleanPresetName('  Duo   plage  ')).toBe('Duo plage')
    expect(cleanPresetName('x'.repeat(80))).toHaveLength(60)
  })
})
