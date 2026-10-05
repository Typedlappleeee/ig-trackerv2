import { describe, it, expect, vi } from 'vitest'
vi.mock('./geelark', () => ({ geelarkFetch: vi.fn(), ensurePhoneRunning: vi.fn(), sleep: vi.fn() }))
vi.mock('./phoneWatch', () => ({ heartbeatPhone: vi.fn() }))
import { findUsernameRow, isUsernameEditor, isNameEditor, findEditText } from './geelarkAdb'

const node = (attrs: string, b: string) => `<node index="0" ${attrs} bounds="${b}" />`
// Écran Profil du Centre de comptes : Nom au-dessus, Nom d'utilisateur en dessous.
const profileFR = `<hierarchy>${node('text="Nom" content-desc=""', '[0,600][1080,700]')}${node('text="Léa M." content-desc=""', '[0,700][1080,760]')}${node('text="Nom d’utilisateur" content-desc=""', '[0,800][1080,900]')}${node('text="lea_123" content-desc=""', '[0,900][1080,960]')}</hierarchy>`
const profileGrouped = `<hierarchy>${node('text="" content-desc="Name, Lea"', '[0,600][1080,700]')}${node('text="" content-desc="Username, lea_123"', '[0,800][1080,900]')}</hierarchy>`
const onlyValues = `<hierarchy>${node('text="Lea"', '[0,600][1080,700]')}${node('text="lea_123"', '[0,800][1080,900]')}</hierarchy>`
const nameEditor = `<hierarchy>${node('text="Name"', '[0,100][1080,200]')}${node('class="android.widget.EditText" text="Lea"', '[0,300][1080,400]')}</hierarchy>`
const userEditor = `<hierarchy>${node('text="Username"', '[0,100][1080,200]')}${node('class="android.widget.EditText" text="lea_123"', '[0,300][1080,400]')}</hierarchy>`

describe('ligne « nom d\'utilisateur » — jamais le nom affiché', () => {
  it('libellé FR (apostrophe typographique)', () => expect(findUsernameRow(profileFR)).toEqual([540, 850]))
  it('content-desc groupé « Username, … »', () => expect(findUsernameRow(profileGrouped)).toEqual([540, 850]))
  it('sans libellé : repère = pseudo actuel', () => expect(findUsernameRow(onlyValues, '@lea_123')).toEqual([540, 850]))
  it('introuvable → null (pas de tap au hasard)', () => expect(findUsernameRow(onlyValues)).toBeNull())
  it('reconnaît l\'éditeur du nom vs du pseudo', () => {
    expect(isNameEditor(nameEditor)).toBe(true)
    expect(isUsernameEditor(nameEditor)).toBe(false)
    expect(isUsernameEditor(userEditor)).toBe(true)
    expect(isNameEditor(userEditor)).toBe(false)
    expect(findEditText(userEditor)).toEqual([540, 350])
  })
})
