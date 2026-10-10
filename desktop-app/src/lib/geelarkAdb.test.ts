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

// ── Nouvelles protections (édition en masse) ─────────────────────────────────
import { USERNAME_REFUSED, PASSWORD_PROMPT, findAccountRow, findDialogDismiss, findFirstGalleryThumb, screenShowsHandle, isValidDump } from './geelarkAdb'
import { usernameIssue, usernameTemplateIssue, usernameListIssues } from './igRules'

describe('édition en masse — lecture d’écran', () => {
  it('refus Instagram avec apostrophe typographique (FR) ou droite', () => {
    expect(USERNAME_REFUSED.test('Ce nom d’utilisateur n’est pas disponible.')).toBe(true)
    expect(USERNAME_REFUSED.test("This username isn't available.")).toBe(true)
    expect(USERNAME_REFUSED.test('This username isn’t available.')).toBe(true)
  })
  it('demande de mot de passe détectée', () => {
    expect(PASSWORD_PROMPT.test('Saisissez à nouveau votre mot de passe')).toBe(true)
    expect(PASSWORD_PROMPT.test('Confirm it’s you')).toBe(true)
  })
  it('choisit le BON compte dans « Profils » (pas le premier venu)', () => {
    const xml = `<hierarchy>${node('text="Instagram" content-desc=""', '[0,300][1080,400]')}${node('text="other_acc" content-desc=""', '[0,300][1080,340]')}${node('text="lea_123" content-desc=""', '[0,500][1080,560]')}${node('text="Instagram" content-desc=""', '[0,560][1080,600]')}</hierarchy>`
    expect(findAccountRow(xml, '@lea_123')).toEqual([540, 530])
    expect(findAccountRow(xml)).toEqual([540, 350])
  })
  it('ferme les fenêtres parasites, jamais un « OK » générique', () => {
    expect(findDialogDismiss(`<hierarchy>${node('text="Plus tard"', '[100,1000][500,1100]')}</hierarchy>`)).toEqual([300, 1050])
    expect(findDialogDismiss(`<hierarchy>${node('text="Tout autoriser"', '[100,1000][500,1100]')}</hierarchy>`)).toEqual([300, 1050])
    expect(findDialogDismiss(`<hierarchy>${node('text="OK"', '[100,1000][500,1100]')}</hierarchy>`)).toBeNull()
  })
  it('galerie : 1re vraie vignette, jamais la tuile appareil photo', () => {
    const cell = (x: number, y: number, extra = '') => node(`class="android.widget.ImageView" clickable="true" ${extra}`, `[${x},${y}][${x + 360},${y + 360}]`)
    const xml = `<hierarchy>${cell(0, 600, 'content-desc="Appareil photo"')}${cell(360, 600, 'content-desc="Photo prise le 10 oct."')}${cell(720, 600)}${cell(0, 960)}</hierarchy>`
    expect(findFirstGalleryThumb(xml, 1080)).toEqual([540, 780])
    expect(findFirstGalleryThumb('<hierarchy></hierarchy>', 1080)).toBeNull()
  })
  it('vérification du nouveau @ (valeur seule ou content-desc groupé)', () => {
    expect(screenShowsHandle(`<hierarchy>${node('text="nova.lea"', '[0,0][10,10]')}</hierarchy>`, 'nova.lea')).toBe(true)
    expect(screenShowsHandle(`<hierarchy>${node('content-desc="Nom d’utilisateur, nova.lea"', '[0,0][10,10]')}</hierarchy>`, '@nova.lea')).toBe(true)
    expect(screenShowsHandle(`<hierarchy>${node('text="nova.lea2"', '[0,0][10,10]')}</hierarchy>`, 'nova.lea')).toBe(false)
  })
  it('XML tronqué = invalide', () => { expect(isValidDump('<?xml?><hierarchy><node')).toBe(false) })
})

describe('règles Instagram des pseudos', () => {
  it('points, longueur, caractères', () => {
    expect(usernameIssue('lea.m_12')).toBeNull()
    expect(usernameIssue('.lea')).toMatch(/point/)
    expect(usernameIssue('lea.')).toMatch(/point/)
    expect(usernameIssue('le..a')).toMatch(/deux points/)
    expect(usernameIssue('léa')).toMatch(/invalide/)
  })
  it('gabarit trop long APRÈS expansion des {N}', () => {
    expect(usernameTemplateIssue('nova.lea{4}')).toBeNull()
    expect(usernameTemplateIssue('abcdefghijklmnopqrstuvwxyz{6}')).toMatch(/trop long/)
  })
  it('pseudos fixes en double refusés', () => {
    expect(usernameListIssues(['a.b', 'A.B'], 2).join(' ')).toMatch(/unique/)
    expect(usernameListIssues(['a{4}'], 5)).toEqual([])
  })
})
