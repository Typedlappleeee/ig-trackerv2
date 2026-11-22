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
  it('iPhone normal : comptes manquants ajoutés, rien sinon', () => {
    expect(reconcileWithIrt(['@a.b'], ['a.b', 'c_d'])).toEqual(['@a.b', '@c_d'])
    expect(reconcileWithIrt(['@A.b', '@c_d'], ['a.b', 'c_d'])).toBeNull()
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

import { autoChecksFor } from './irtAccounts'
describe('statut iRemoTech automatique', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')
  const j = (type: string, status: string, at: string, account: string | null = null, result: unknown = null) => ({ job_id: at + account, type, status, created_at: at, finished_at: at, account, result }) as never
  it('comptes jamais vérifiés ou vérifiés il y a plus de 24 h ; scan si trop vieux', () => {
    const jobs = [
      j('list_accounts', 'completed', '2026-11-20T10:00:00Z', null, { accounts: ['a1', 'b2', 'c3'] }),
      j('account_status', 'completed', '2026-11-22T08:00:00Z', 'a1', { account_state: { under_18: 'green' } }),
      j('account_status', 'completed', '2026-11-20T08:00:00Z', 'b2', { account_state: { under_18: 'green' } }),
    ]
    expect(autoChecksFor(jobs, [], now, {})).toEqual({ scan: true, accounts: ['b2', 'c3'] })
  })
  it('déjà en cours ou essayé récemment → pas relancé', () => {
    const jobs = [
      j('list_accounts', 'queued', '2026-11-22T11:59:00Z'),
      j('account_status', 'dispatched', '2026-11-22T11:58:00Z', 'a1'),
    ]
    expect(autoChecksFor(jobs, ['@a1', '@b2'], now, { b2: now - 3600_000 })).toEqual({ scan: false, accounts: [] })
  })
})
