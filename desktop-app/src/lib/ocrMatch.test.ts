import { describe, it, expect } from 'vitest'
import { isInstagramText, withJoined } from './ocrMatch'

describe('Lecture OCR de « Instagram »', () => {
  it.each(['Instagram', 'instagram', 'INSTAGRAM', 'lnstagram', '|nstagram', '1nstagram', 'Instagrarn', 'Instaqram', 'Lnstagram',
    'Instagram.', '"Instagram', 'Instagran', 'nstagram', 'Instagr', 'Insiagram', 'Join Instagram', 'Instagram\'s'])(
    '%s → reconnu', t => { expect(isInstagramText(t)).toBe(true) })
  it.each(['Instacart', 'Instapaper', 'Telegram', 'Threads', 'Edits', 'Settings', 'Diagram', 'Insta', 'gram', 'App Store', 'Messages', ''])(
    '%s → ignoré', t => { expect(isInstagramText(t)).toBe(false) })
  it('mot coupé en deux (« Insta » « gram ») recollé, centre entre les deux', () => {
    const words = [
      { text: 'Insta', x: 100, w: 50, h: 20, cx: 125, cy: 400 },
      { text: 'gram', x: 152, w: 40, h: 20, cx: 172, cy: 401 },
      { text: 'Edits', x: 300, w: 50, h: 20, cx: 325, cy: 400 },
    ]
    const hit = withJoined(words).find(w => isInstagramText(w.text))
    expect(hit).toMatchObject({ text: 'Instagram', cx: 149 })
    // pas de collage entre mots éloignés ou sur des lignes différentes
    expect(withJoined([{ text: 'Insta', x: 0, w: 50, h: 20, cx: 25, cy: 100 }, { text: 'gram', x: 0, w: 40, h: 20, cx: 30, cy: 300 }]).some(w => isInstagramText(w.text))).toBe(false)
  })
})
