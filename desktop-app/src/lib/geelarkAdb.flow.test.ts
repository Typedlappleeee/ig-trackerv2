// Parcours complet « changer le @ » sur un Instagram SIMULÉ (écrans uiautomator FR,
// taps par coordonnées, saisie, enregistrement) : vérifie que la modif est relue à
// l'écran, qu'aucun RETOUR ne fait quitter l'éditeur sans clavier, et qu'un échec
// n'est jamais rapporté comme un succès.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Btn = { text: string; to?: string; field?: boolean }
const H = vi.hoisted(() => ({
  screen: 'home', typed: '', saved: '', cmds: [] as string[], keyboard: false,
  refuse: false, saveIgnored: false,
}))
const node = (t: string, y: number, extra = '') => `<node text="${t}" content-desc="" ${extra} bounds="[0,${y}][1080,${y + 80}]" />`
function screens(): Record<string, Btn[]> {
  const handle = H.saved || 'old_handle'
  return {
    home: [{ text: 'Profil', to: 'profile' }],
    profile: [{ text: handle }, { text: 'Options', to: 'menu' }],
    menu: [{ text: 'Paramètres et activité', to: 'settings' }],
    settings: [{ text: 'Espace Comptes', to: 'ac' }],
    ac: [{ text: 'Profils', to: 'profiles' }],
    profiles: [{ text: 'other_acc', to: 'wrong' }, { text: 'Instagram', to: 'wrong' }, { text: handle, to: 'detail' }, { text: 'Instagram', to: 'detail' }],
    wrong: [{ text: 'Nom' }, { text: 'Nom d’utilisateur', to: 'wrong-editor' }],
    detail: [{ text: 'Nom' }, { text: 'Léa' }, { text: 'Nom d’utilisateur', to: 'editor' }, { text: handle }],
    editor: [{ text: 'Nom d’utilisateur' }, { text: H.typed, field: true }, ...(H.refuse ? [{ text: 'Ce nom d’utilisateur n’est pas disponible.' }] : []), { text: 'Terminé', to: 'saved' }],
  }
}
function xmlOf(name: string): string {
  const list = screens()[name] ?? []
  return `<hierarchy>${list.map((b, i) => node(b.text, 200 + i * 100, b.field ? 'class="android.widget.EditText"' : '')).join('')}</hierarchy>`
}
vi.mock('./geelark', () => ({
  sleep: () => Promise.resolve(),
  throwIfAborted: () => {},
  ensurePhoneRunning: async () => ({ ok: true }),
  geelarkFetch: async (path: string, body: { cmd: string }) => {
    if (path !== '/shell/execute') return { code: 0, data: {} }
    const cmd = body.cmd
    H.cmds.push(cmd)
    let out = ''
    if (cmd.includes('uiautomator dump')) out = xmlOf(H.screen)
    else if (cmd.startsWith('wm size')) out = 'Physical size: 1080x2340'
    else if (cmd.includes('mInputShown')) out = `mInputShown=${H.keyboard}`
    else if (cmd.includes('monkey') || cmd.includes('am start')) H.screen = 'home'
    else if (cmd.startsWith('input keyevent 4')) H.screen = H.screen === 'editor' ? 'detail' : H.screen   // RETOUR quitte l'éditeur (modif perdue)
    else if (cmd.startsWith('input text')) { H.typed = cmd.match(/"(.*)"/)?.[1] ?? ''; H.keyboard = true }
    else if (cmd.startsWith('input keyevent 111')) H.keyboard = false
    else if (cmd.startsWith('input tap')) {
      const y = Number(cmd.split(' ')[3])
      const list = screens()[H.screen] ?? []
      const btn = list[Math.round((y - 240) / 100)]
      if (btn?.to === 'saved') { if (!H.refuse && !H.saveIgnored) H.saved = H.typed; H.screen = 'detail' }
      else if (btn?.to) H.screen = btn.to
    }
    return { code: 0, data: { output: out } }
  },
}))
vi.mock('./phoneWatch', () => ({ heartbeatPhone: () => {} }))
import { changeUsernameOnPhone } from './geelarkAdb'

beforeEach(() => { Object.assign(H, { screen: 'home', typed: '', saved: '', cmds: [], keyboard: false, refuse: false, saveIgnored: false }) })
const log = () => {}

describe('changer le @ sur un Instagram simulé (FR, « Espace Comptes »)', () => {
  it('réussit, sur le BON compte, et le nouveau @ est relu à l’écran', async () => {
    const r = await changeUsernameOnPhone('b', 'g', 'nova.lea', log, 'old_handle')
    expect(r).toEqual({ ok: true })
    expect(H.saved).toBe('nova.lea')
    expect(H.cmds.some(c => c === 'input keyevent 4')).toBe(false)   // jamais de RETOUR qui annulerait la saisie
  })
  it('pseudo refusé par Instagram → échec, rien d’écrit', async () => {
    H.refuse = true
    const r = await changeUsernameOnPhone('b', 'g', 'nova.lea', log, 'old_handle')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/refuse/)
    expect(H.saved).toBe('')
  })
  it('enregistrement sans effet → « non confirmé », jamais un faux succès', async () => {
    H.saveIgnored = true
    let t = Date.now(); const spy = vi.spyOn(Date, 'now').mockImplementation(() => (t += 1500))   // horloge accélérée
    const r = await changeUsernameOnPhone('b', 'g', 'nova.lea', log, 'old_handle')
    spy.mockRestore()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/non confirmé/)
  })
  it('pseudo invalide → refusé avant de toucher au téléphone', async () => {
    const r = await changeUsernameOnPhone('b', 'g', 'nova..lea', log)
    expect(r.ok).toBe(false)
    expect(H.cmds.length).toBe(0)
  })
})
