import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./platform', () => ({ IS_WEB: true }))
import { APP_BUILD, checkForUpdate, fetchRemoteBuild, fmtBuild, __resetAppVersion } from './appVersion'

const respond = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))

describe('appVersion', () => {
  beforeEach(() => { __resetAppVersion(); vi.unstubAllGlobals() })

  it('formate la date', () => {
    expect(fmtBuild(new Date(2026, 9, 5, 14, 32).toISOString())).toBe('5 oct. · 14:32')
    expect(fmtBuild('nope')).toBe('—')
  })
  it('même version → pas de mise à jour', async () => {
    respond({ id: APP_BUILD.id, builtAt: 'x' })
    expect(await checkForUpdate()).toBeNull()
  })
  it('version différente → disponible', async () => {
    respond({ id: 'abc1234', builtAt: '2026-10-05T12:00:00Z' })
    expect(await checkForUpdate()).toEqual({ id: 'abc1234', builtAt: '2026-10-05T12:00:00Z' })
  })
  it('réseau KO / fichier absent → rien', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await fetchRemoteBuild()).toBeNull()
    respond({}, false)
    expect(await checkForUpdate()).toBeNull()
    respond('<html>')
    expect(await checkForUpdate()).toBeNull()
  })
})
