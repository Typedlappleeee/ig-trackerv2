import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { progressRows, phoneKind, targetsSummary, parseAccountLines } from './BlowAutoPilot'

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

describe('iRemoTech — type d’iPhone et cibles', () => {
  it('comptes « @nom » = iPhone normal, containers = jailbreak, rien = pas encore détecté', () => {
    expect(phoneKind(['@lucielr5c0', '@celiaq58c0'])).toBe('normal')
    expect(phoneKind(['Default', '1', '2'])).toBe('jb')
    expect(phoneKind([])).toBeNull()
    expect(phoneKind(undefined)).toBeNull()
  })
  it('résumé des cibles cochées dans la bonne unité', () => {
    expect(targetsSummary(['1', '2', '@a'])).toBe('2 containers · 1 compte')
    expect(targetsSummary(['@a', '@b'])).toBe('2 comptes')
    expect(targetsSummary(['Default'])).toBe('1 container')
  })
})

describe('Comptes créés — import', () => {
  it('identifiant:motdepasse[:2fa] par ligne, lignes invalides ignorées', () => {
    expect(parseAccountLines('@LucieLR5c0:gQm4Df4mxSmTyk2\nmauvaise ligne\ninesfzdz2o:zhQQ:abcd efgh ijkl mnop\n\n')).toEqual([
      { username: 'lucielr5c0', password: 'gQm4Df4mxSmTyk2' },
      { username: 'inesfzdz2o', password: 'zhQQ', twofa: 'ABCDEFGHIJKLMNOP' },
    ])
  })
})
