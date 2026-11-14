import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { mergeLayout, rowsToLayout } from './gjLayout'

describe('Genjutsu — rangement partagé', () => {
  it('lit les lignes de l’espace', () => {
    expect(rowsToLayout([{ model_id: 'a', grp: 'Kenza', hidden: false }, { model_id: 'b', grp: null, hidden: true }]))
      .toEqual({ groups: { a: 'Kenza' }, hidden: ['b'] })
  })
  it('l’espace a raison ; le rangement fait seulement sur ce navigateur est ajouté et envoyé', () => {
    const r = mergeLayout({ groups: { a: 'Kenza', b: 'Zoe' }, hidden: ['x'] }, { groups: { a: 'Autre', c: 'Zoe' }, hidden: ['x', 'y', 'c'] })
    expect(r.merged.groups).toEqual({ a: 'Kenza', b: 'Zoe', c: 'Zoe' })
    expect(r.merged.hidden.sort()).toEqual(['c', 'x', 'y'])
    expect(r.push).toEqual([{ model_id: 'c', grp: 'Zoe', hidden: true }, { model_id: 'y', hidden: true }])
  })
  it('rien à envoyer quand tout est déjà dans l’espace', () => {
    expect(mergeLayout({ groups: { a: 'K' }, hidden: [] }, { groups: { a: 'K' }, hidden: [] }).push).toEqual([])
  })
})
