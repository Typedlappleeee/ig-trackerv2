import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./iremotech', () => ({ snapshot: vi.fn(), sendAction: vi.fn(), deviceIp: vi.fn() }))
import { logoutStage } from './iremotechVision'

// Relevés réels (iPhone 406×720, 21/11/2026) : réglages « Settings and activity » et alerte de déconnexion.
const H = 720
const w = (text: string, cx: number, cy: number) => ({ text, cx, cy })

describe('boucle de création — déconnexion', () => {
  it('haut des réglages (pas encore de « Log out ») → défiler', () => {
    expect(logoutStage([w('Settings', 160, 45), w('and', 210, 45), w('activity', 255, 45), w('Your', 30, 168), w('account', 75, 168)], H)).toEqual({ kind: 'settings' })
  })
  it('bas des réglages → « Log out » rouge (pas « Add profile »)', () => {
    const words = [w('Settings', 160, 45), w('and', 210, 45), w('activity', 255, 45), w('Login', 35, 540), w('Add', 30, 588), w('profile', 70, 588), w('Log', 28, 640), w('out', 58, 640)]
    expect(logoutStage(words, H)).toEqual({ kind: 'settings_logout', tap: { x: 43, y: 640 } })
  })
  it('alerte « Log out of your account? » → bouton « Log out », jamais Cancel', () => {
    const words = [w('Log', 150, 285), w('out', 178, 285), w('of', 200, 285), w('your', 225, 285), w('account?', 270, 285), w('Log', 188, 398), w('out', 218, 398), w('Cancel', 203, 453), w('Log', 28, 640), w('out', 58, 640)]
    expect(logoutStage(words, H)).toEqual({ kind: 'dialog', tap: { x: 203, y: 398 } })
  })
  it('déconnecté → « Create new account »', () => {
    const words = [w('Log', 190, 420), w('in', 215, 420), w('Create', 150, 650), w('new', 200, 650), w('account', 250, 650)]
    expect(logoutStage(words, H)).toEqual({ kind: 'logged_out', tap: { x: 200, y: 650 } })
  })
  it('profil normal → rien (le moteur ouvre le menu ☰)', () => {
    expect(logoutStage([w('Edit', 90, 287), w('profile', 130, 287), w('posts', 70, 162)], H)).toBeNull()
  })
})

import { isAppLibrary } from './iremotechVision'
describe('accueil iOS — Bibliothèque d’apps', () => {
  it('reconnue à ses dossiers, pas une page d’accueil', () => {
    expect(isAppLibrary([{ text: 'Q' }, { text: 'Apr' }, { text: 'Suggestions' }, { text: 'Recently' }, { text: 'Added' }, { text: 'Social' }])).toBe(true)
    expect(isAppLibrary([{ text: 'Weather' }, { text: 'Stocks' }, { text: 'Instagram' }, { text: 'Utilities' }])).toBe(false)
  })
})
