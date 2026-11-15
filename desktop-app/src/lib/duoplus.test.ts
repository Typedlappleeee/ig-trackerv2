import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { duoState, canPowerOn, canPowerOff, areaName, type DuoPhone } from './duoplus'
// @ts-expect-error module JS du serveur
import { slimPhone, chunk } from '../../api/duoplus.js'

const ph = (status: number) => ({ id: 'a', name: 'x', status, os: '', area: '', region: '', ip: '', remark: '', adb: false, expires: null, group: [] }) as DuoPhone

describe('DuoPlus', () => {
  it('états des téléphones (codes DuoPlus)', () => {
    expect(duoState(1)).toEqual({ label: 'Allumé', tone: 'on' })
    expect(duoState(2).tone).toBe('off')
    expect(duoState(10).tone).toBe('busy')
    expect(duoState(3).label).toBe('Expiré')
    expect(canPowerOn(ph(2))).toBe(true); expect(canPowerOn(ph(3))).toBe(false)
    expect(canPowerOff(ph(1))).toBe(true); expect(canPowerOff(ph(10))).toBe(true); expect(canPowerOff(ph(2))).toBe(false)
    expect(areaName('France(FR)')).toBe('France')
    expect(areaName('United States of America(US)')).toBe('United States of America')
  })
  it('le serveur ne renvoie jamais l’adresse ni le mot de passe ADB', () => {
    const s = slimPhone({ id: 'R8KtB', name: 'Test 2', status: 2, os: 'Android 15(Pro)', area: 'France(FR)', adb_status: 1, adb: '1.2.3.4:5555', adb_password: 'secret', expired_at: '1797321762', group: [] })
    expect(s).toMatchObject({ id: 'R8KtB', status: 2, adb: true, expires: 1797321762 })
    expect(JSON.stringify(s)).not.toContain('secret')
    expect(JSON.stringify(s)).not.toContain('1.2.3.4')
  })
  it('découpe en lots (20 max pour éteindre, 100 pour allumer)', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
