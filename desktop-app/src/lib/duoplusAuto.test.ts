import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { parseUi, findNode, shq, screenSummary, intlPhone } from './duoplusAuto'
import { planDuoJobs } from '@/components/DuoPosting'
import { randomBirth, randomPassword } from '@/components/DuoAccounts'

const XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node text="" resource-id="com.instagram.android:id/caption_input_text_view" class="android.widget.EditText" content-desc="Write a caption" clickable="true" bounds="[48,240][1032,384]" />
<node text="Test é &#128293;" resource-id="" class="android.view.View" content-desc="" clickable="false" bounds="[0,0][0,0]" />
<node text="Share" resource-id="com.instagram.android:id/share_button" class="android.widget.Button" content-desc="Share" clickable="true" bounds="[564,1584][1032,1716]"></node></hierarchy>`

describe('DuoPlus — automatisation', () => {
  it('lit un dump uiautomator (id sans paquet, centre, emojis)', () => {
    const ui = parseUi(XML)
    expect(ui).toHaveLength(3)
    expect(ui[0]).toMatchObject({ id: 'caption_input_text_view', desc: 'Write a caption', clickable: true, x: 540, y: 312 })
    expect(ui[1].text).toBe('Test é 🔥')
    expect(findNode(ui, { id: 'share_button' })?.y).toBe(1650)
    expect(findNode(ui, { text: /^Test/ })).toBeUndefined()           // élément invisible (0×0) ignoré
    expect(screenSummary(ui)).toContain('Share')
  })
  it('numéro US au format international (SMSPool l’envoie sans le 1)', () => {
    expect(intlPhone('9472998384')).toBe('19472998384')
    expect(intlPhone('19472998384')).toBe('19472998384')
    expect(intlPhone('+1 (947) 299-8384')).toBe('19472998384')
  })
  it('échappe le texte pour le shell', () => {
    expect(shq("l'été")).toBe(`'l'\\''été'`)
  })
  it('répartit une vidéo par téléphone, à tour de rôle', () => {
    expect(planDuoJobs(['a', 'b', 'c'], [1, 2])).toEqual([{ phone: 'a', video: 1 }, { phone: 'b', video: 2 }, { phone: 'c', video: 1 }])
    expect(planDuoJobs(['a'], [])).toEqual([])
  })
  it('profil : 21 à 29 ans, mot de passe solide', () => {
    for (let i = 0; i < 50; i++) { const b = randomBirth(new Date('2026-11-15')); expect(b.y).toBeGreaterThanOrEqual(1997); expect(b.y).toBeLessThanOrEqual(2005); expect(b.d).toBeLessThanOrEqual(28) }
    const p = randomPassword(); expect(p).toHaveLength(14); expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/[a-z]/); expect(p).toMatch(/\d/)
  })
})
