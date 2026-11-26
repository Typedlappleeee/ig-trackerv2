import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { healthOf, deviceAccounts, ago, compactNum, parseCount, parseProfileCounts, isJunkUsername } from './irtAccounts'
import type { IrtJob } from './iremotech'

const job = (p: Partial<IrtJob>): IrtJob => ({ job_id: 'j' + Math.random(), type: 'list_accounts', device: 'd', account: null, status: 'completed', created_at: '2026-11-20T10:00:00Z', dispatched_at: null, finished_at: '2026-11-20T10:01:00Z', duration_ms: 1000, result: null, failure: null, ...p })

describe('iRemoTech — comptes relus depuis les jobs', () => {
  it('santé : tout vert = sain, un warning = à surveiller avec le libellé, rien = non vérifié', () => {
    expect(healthOf({ under_18: 'green', monetization: 'green' })).toEqual({ level: 'ok', issues: [] })
    expect(healthOf({ who_dont_follow_you: 'warning', under_18: 'green' })).toEqual({ level: 'warn', issues: ['Non recommandé aux non-abonnés'] })
    expect(healthOf(null).level).toBe('unknown')
    expect(healthOf({ monetization: 'warning', under_18: 'green' })).toEqual({ level: 'ok', issues: [] }) // non pro ≠ problème
  })
  it('comptes = dernier scan seulement (déconnectés retirés) ; statut, warm-up et job en cours par compte', () => {
    const jobs = [
      job({ type: 'list_accounts', result: { accounts: ['lucielr5c0', 'Ines'] }, finished_at: '2026-11-20T10:01:00Z' }),
      job({ type: 'account_status', account: 'lucielr5c0', result: { account_state: { who_dont_follow_you: 'warning' } }, created_at: '2026-11-20T11:00:00Z', finished_at: '2026-11-20T11:02:00Z' }),
      job({ type: 'warm_up', account: 'ines', result: { session_duration_s: 420, likes: 3, reels_viewed: 20 }, created_at: '2026-11-20T12:00:00Z', finished_at: '2026-11-20T12:08:00Z' }),
      job({ type: 'account_status', account: 'ines', status: 'dispatched', created_at: '2026-11-20T13:00:00Z', finished_at: null }),
    ]
    const r = deviceAccounts(jobs, ['@celia'])
    expect(r.accounts.map(a => a.username)).toEqual(['ines', 'lucielr5c0'])
    expect(deviceAccounts([], ['@celia', '@a', '@b', '@c', '@d', '@e']).accounts.length).toBe(5) // 5 max par iPhone
    expect(r.scannedAt).toBe('2026-11-20T10:01:00Z')
    const l = r.accounts.find(a => a.username === 'lucielr5c0')!
    expect(l.health.level).toBe('warn'); expect(l.checkedAt).toBe('2026-11-20T11:02:00Z')
    const i = r.accounts.find(a => a.username === 'ines')!
    expect(i.warmup).toEqual({ at: '2026-11-20T12:08:00Z', seconds: 420, likes: 3, reels: 20 })
    expect(i.running).toBe('account_status')
    expect(r.scanning).toBe(false)
  })
  it('formats : « il y a » et nombres compacts', () => {
    const now = Date.parse('2026-11-20T12:00:00Z')
    expect(ago('2026-11-20T11:55:00Z', now)).toBe('il y a 5 min')
    expect(ago(null)).toBe('jamais')
    expect(compactNum(12300)).toBe('12 k'); expect(compactNum(1500)).toBe('1,5 k'); expect(compactNum(340)).toBe('340'); expect(compactNum(null)).toBe('—')
  })
})

describe('iRemoTech — chiffres du profil lus à l’écran', () => {
  it('nombres Instagram : 1,234 · 12.3K · 1,2M', () => {
    expect(parseCount('1,234')).toBe(1234); expect(parseCount('12.3K')).toBe(12300); expect(parseCount('1,2M')).toBe(1200000); expect(parseCount('posts')).toBeNull()
  })
  it('nombre juste au-dessus de chaque libellé (relevé réel @lucielr5c0 : 1 · 0 · 0)', () => {
    const w = (text: string, cx: number, cy: number) => ({ text, cx, cy })
    expect(parseProfileCounts([w('1', 138, 139), w('post', 150, 159), w('0', 211, 139), w('followers', 233, 159), w('0', 308, 139), w('following', 333, 159), w('Edit', 99, 236)]))
      .toEqual({ media_count: 1, followers: 0, following: 0 })
    expect(parseProfileCounts([w('Hello', 10, 10)])).toBeNull()
  })
})

describe('iRemoTech — lignes secondaires prises pour des comptes', () => {
  it('« e1notification », « e3likesand4more », « e1followand4more » = faux ; vrais comptes gardés', () => {
    for (const u of ['@e1notification', 'e3likesand4more', 'e1followand4more', 'einotification', '2newmessages']) expect(isJunkUsername(u)).toBe(true)
    for (const u of ['lucielr5c0', 'celiaq58c0', 'pommesrouge7', 'thrideamaz', 'dailypost']) expect(isJunkUsername(u)).toBe(false)
  })
})

import { accountAddedAt, naturalCmp } from './irtAccounts'
describe('comptes : nouveaux (< 24 h) et ordre des iPhones', () => {
  const scan = (at: string, accounts: string[]) => ({ job_id: at, type: 'list_accounts', status: 'completed', created_at: at, finished_at: at, account: null, result: { accounts } }) as never
  it('date d’arrivée = 1re lecture qui le contient, seulement si une lecture plus ancienne ne l’avait pas', () => {
    const jobs = [scan('2026-11-23T10:00:00Z', ['a']), scan('2026-11-24T10:00:00Z', ['a', 'b'])]
    expect(accountAddedAt(jobs, 'b')).toBe(Date.parse('2026-11-24T10:00:00Z'))
    expect(accountAddedAt(jobs, 'a')).toBeNull()
  })
  it('STEVIE2 avant STEVIE10', () => {
    expect(['STEVIE10', 'STEVIE2', 'STEVIE1'].sort(naturalCmp)).toEqual(['STEVIE1', 'STEVIE2', 'STEVIE10'])
  })
})

import { ageTier, newAddedEntries } from './irtAccounts'
describe('âge des comptes (ajoutés < 1 j / 3 j / 7 j)', () => {
  const now = Date.parse('2026-11-26T12:00:00Z'), h = 3600_000
  it('paliers', () => {
    expect(ageTier(now - 5 * h, now)).toBe('1d')
    expect(ageTier(now - 30 * h, now)).toBe('3d')
    expect(ageTier(now - 5 * 24 * h, now)).toBe('7d')
    expect(ageTier(now - 8 * 24 * h, now)).toBeNull()
    expect(ageTier(1, now)).toBeNull()
    expect(ageTier(null, now)).toBeNull()
  })
  it('1er suivi d’un iPhone : comptes déjà là = anciens ; ensuite les nouveaux sont datés maintenant', () => {
    const first = newAddedEntries({}, 'd1', ['@a', '@b'], now, () => null)
    expect(first).toEqual({ 'd1::@a': 1, 'd1::@b': 1 })
    const next = newAddedEntries(first, 'd1', ['@a', '@b', '@C'], now, () => null)
    expect(next).toEqual({ 'd1::@c': now })
    expect(newAddedEntries({}, 'd2', ['@x'], now, u => u === '@x' ? now - h : null)).toEqual({ 'd2::@x': now - h })
  })
})
