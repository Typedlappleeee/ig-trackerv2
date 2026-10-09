import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'
import { setDict, setLang, tr, getLang } from './i18n'
import { EN } from './i18n.en'
import { CHANGELOG } from './changelog'

const require = createRequire(import.meta.url)
const APP = path.resolve(__dirname, '../..')

describe('i18n — moteur', () => {
  beforeAll(async () => { setDict(EN); await setLang('en') })

  it('correspondance exacte, espaces de bord conservés', () => {
    expect(getLang()).toBe('en')
    expect(tr('Annuler')).toBe('Cancel')
    expect(tr('  Banque ')).toBe('  Library ')
  })
  it('gabarits avec valeurs dynamiques', () => {
    expect(tr('il y a 12 min')).toBe('12 min ago')
    expect(tr('3 échec(s)')).toBe('3 failed')
  })
  it('pluriel français retiré en anglais', () => {
    expect(tr('2 photos choisies')).toBe('2 photos selected')
    expect(tr('1 photo choisie')).toBe('1 photo selected')
  })
  it('dates françaises', () => {
    expect(tr('8 oct. · 14:32')).toBe('Oct 8 · 14:32')
    expect(tr('Vendredi 9 oct. · infra GeeLark')).toBe('Friday Oct 9 · infra GeeLark')
    expect(tr('Le 12 janvier 2026')).toBe('Le Jan 12 2026')
  })
  it('texte inconnu (contenu utilisateur) inchangé', () => {
    expect(tr('@lea.officiel')).toBe('@lea.officiel')
    expect(tr('Ma super légende du jour')).toBe('Ma super légende du jour')
  })
  it('en français : rien ne change', async () => {
    await setLang('fr')
    expect(tr('Annuler')).toBe('Annuler')
    await setLang('en')
  })
})

describe('i18n — dictionnaire', () => {
  it('toutes les chaînes de l’interface sont traduites ou relues', () => {
    const { extract } = require(path.join(APP, 'scripts/i18n-extract.cjs'))
    const reviewed = new Set<string>(require(path.join(APP, 'scripts/i18n-reviewed.json')))
    const tpl = new Set(EN.templates.map(t => t[0]))
    const missing = (extract(APP) as { kind: string; fr: string; files: string }[])
      .filter(e => !(e.fr in EN.exact) && !tpl.has(e.fr) && !reviewed.has(e.fr))
    expect(missing.map(m => `${m.files}: ${m.fr}`)).toEqual([])
  })
  it('gabarits : l’anglais n’invente pas de valeur', () => {
    for (const [fr, en] of EN.templates) {
      const frPh = new Set(fr.match(/\{\d+\}/g) ?? [])
      for (const p of en.match(/\{\d+\}/g) ?? []) expect(frPh.has(p), `${fr} → ${en}`).toBe(true)
    }
  })
})

describe('notes de mise à jour', () => {
  it('au moins 3 entrées, plus récente d’abord, FR et EN complets', () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(3)
    expect(new Set(CHANGELOG.map(e => e.id)).size).toBe(CHANGELOG.length)
    for (let i = 1; i < CHANGELOG.length; i++) expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true)
    for (const e of CHANGELOG) {
      expect(e.title.fr && e.title.en).toBeTruthy()
      expect(e.items.fr.length).toBeGreaterThan(0)
      expect(e.items.en.length).toBe(e.items.fr.length)
    }
  })
})
