import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { isDeviceOn, deviceLabel } from './iremotech'

describe('iRemoTech — état des iPhones', () => {
  it('sans état renvoyé par l’API (format actuel) : joignable', () => {
    expect(isDeviceOn({ public_id: 'dev_1', name: 'EJ-369', labels: [] } as never)).toBe(true)
  })
  it('état fourni : texte ou booléen', () => {
    expect(isDeviceOn({ public_id: 'a', status: 'online' })).toBe(true)
    expect(isDeviceOn({ public_id: 'a', status: 'offline' })).toBe(false)
    expect(isDeviceOn({ public_id: 'a', status: 'disconnected' })).toBe(false)
    expect(isDeviceOn({ public_id: 'a', online: false })).toBe(false)
    expect(isDeviceOn({ public_id: 'a', connected: true })).toBe(true)
  })
  it('nom affiché : nom donné dans iRemoTech en priorité', () => {
    expect(deviceLabel({ public_id: 'dev_1', name: 'EJ-369', custom_name: 'Front desk 03' })).toBe('Front desk 03')
    expect(deviceLabel({ public_id: 'dev_1', name: 'EJ-369', custom_name: null })).toBe('EJ-369')
    expect(deviceLabel({ public_id: 'dev_1' })).toBe('dev_1')
  })
})
