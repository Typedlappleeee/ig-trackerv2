import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { progressRows } from './BlowAutoPilot'

describe('iRemoTech — progression', () => {
  it('une ligne par cible, statut tiré du dernier message', () => {
    const r = progressRows([
      '[iPhone A] 5 container(s), 0 déjà avec un compte créé ici → 5 à remplir',
      '[iPhone A·1] 🛒 achat d’un numéro',
      '[iPhone A·1] ✗ échec avant SMS (étape x) → nouvel essai',
      '[iPhone A·2] ⏭ pas d’écran « Join Instagram » : container déjà connecté → passé (aucun numéro acheté)',
      '[iPhone A·3] ✅ compte créé',
      '[iPhone A·4] ✗ compte non créé après 3 essai(s) → container suivant',
      '\n[iPhone B] 🔥 conteneur « 2 »',
    ])
    expect(r.map(x => `${x.tag}:${x.state}`)).toEqual(['iPhone A:run', 'iPhone A·1:run', 'iPhone A·2:skip', 'iPhone A·3:ok', 'iPhone A·4:fail', 'iPhone B:run'])
    expect(r[3].last).toBe('compte créé')
  })
})
