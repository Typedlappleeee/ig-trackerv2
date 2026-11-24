import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { reconcileWithIrt, irtScannedAccounts } from './irtAccounts'

describe('comptes repris d’iRemoTech (list_accounts)', () => {
  it('jailbreak vérifié (« Default ») : jamais touché', () => {
    expect(reconcileWithIrt(['Default', '1', '2'], ['celiaq58c0'])).toBeNull()
  })
  it('liste douteuse (faux Jailbreak) remplacée par les comptes iRemoTech (≥ 2)', () => {
    expect(reconcileWithIrt(['1', '2'], ['a.b', 'c_d'])).toEqual(['@a.b', '@c_d'])
    expect(reconcileWithIrt(['1', '2'], ['seul'])).toBeNull()
  })
  it('iPhone normal : liste iRemoTech (déconnectés retirés, nouveaux ajoutés, 5 max)', () => {
    expect(reconcileWithIrt(['@a.b'], ['a.b', 'c_d'])).toEqual(['@a.b', '@c_d'])
    expect(reconcileWithIrt(['@A.b', '@c_d'], ['a.b', 'c_d'])).toBeNull()
    expect(reconcileWithIrt(['@a.b', '@old'], ['a.b'])).toEqual(['@a.b'])
    expect(reconcileWithIrt(['@a'], ['a', 'b', 'c', 'd', 'e', 'f'])).toHaveLength(5)
  })
  it('liste vide : remplie si au moins 2 comptes', () => {
    expect(reconcileWithIrt([], ['x1', 'y2'])).toEqual(['@x1', '@y2'])
    expect(reconcileWithIrt([], [])).toBeNull()
  })
  it('dernière lecture réussie seulement', () => {
    const jobs = [
      { type: 'list_accounts', status: 'failed', created_at: '2026-11-22T10:00:00Z', result: null },
      { type: 'list_accounts', status: 'completed', created_at: '2026-11-21T10:00:00Z', result: { accounts: ['Thrideamaz', 'kittyisgd'] } },
      { type: 'list_accounts', status: 'completed', created_at: '2026-11-20T10:00:00Z', result: { accounts: ['old'] } },
    ] as never[]
    expect(irtScannedAccounts(jobs)).toEqual(['thrideamaz', 'kittyisgd'])
  })
})

import { cranePickerNames } from './iremotechVision'
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))
describe('sélecteur Crane — jamais sans « Default »', () => {
  it('vrai sélecteur → containers triés', () => {
    expect(cranePickerNames(['3', 'Default', '1'])).toEqual(['Default', '1', '3'])
  })
  it('chiffres d’Instagram sur un iPhone normal (compteurs, « 1 » d’une photo) → rien', () => {
    expect(cranePickerNames(['1', '2'])).toEqual([])
    expect(cranePickerNames(['0'])).toEqual([])
  })
})

import { isJunkUsername } from './irtAccounts'
describe('faux comptes lus sous un compte', () => {
  it('« 3 likes » / « 2 follows » coupés → jamais un compte ; vrais comptes gardés', () => {
    expect(isJunkUsername('@3likes')).toBe(true)
    expect(isJunkUsername('2follows')).toBe(true)
    expect(isJunkUsername('miley34487')).toBe(false)
    expect(isJunkUsername('likesarah')).toBe(false)
  })
})

import { scanDue } from './irtAccounts'
describe('lecture automatique des comptes (2 fois par jour)', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')
  const j = (type: string, status: string, at: string, result: unknown = null) => ({ job_id: at, type, status, created_at: at, finished_at: at, account: null, result }) as never
  it('due si la dernière lecture a plus de 12 h ; pas si elle tourne ou a été tentée récemment', () => {
    expect(scanDue([j('list_accounts', 'completed', '2026-11-21T23:00:00Z', { accounts: ['a1'] })], now, 0)).toBe(true)
    expect(scanDue([j('list_accounts', 'completed', '2026-11-22T06:00:00Z', { accounts: ['a1'] })], now, 0)).toBe(false)
    expect(scanDue([j('list_accounts', 'queued', '2026-11-22T11:59:00Z')], now, 0)).toBe(false)
    expect(scanDue([], now, now - 3600_000)).toBe(false)
  })
})

import { trialEligible } from './irtAccounts'
describe('éligibilité Trial', () => {
  it('monétisation verte = pro = Trial ; warning = non pro ; inconnu = ?', () => {
    expect(trialEligible({ monetization: 'green' })).toBe(true)
    expect(trialEligible({ monetization: 'warning' })).toBe(false)
    expect(trialEligible({ monetization: 'unknown' })).toBeNull()
    expect(trialEligible(null)).toBeNull()
  })
})
