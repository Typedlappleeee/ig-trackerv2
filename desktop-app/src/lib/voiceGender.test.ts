import { describe, it, expect, vi } from 'vitest'
vi.mock('./ffmpeg', () => ({ runFfmpeg: vi.fn() }))
vi.mock('./subtitles', () => ({ transcribeWordsGroq: vi.fn() }))
vi.mock('./ai', () => ({ groqChat: vi.fn() }))
import { analyzeVoice, firstSpeech, pcmToWav, parseOnScreen, SR } from './voiceGender'

// voix synthétique : silence puis son voisé (fondamentale + harmoniques, légère modulation)
function voice(f0: number, silence = 1, dur = 2, noise = 0.002): Float32Array {
  const x = new Float32Array(Math.round((silence + dur) * SR))
  let ph = 0
  for (let i = 0; i < x.length; i++) {
    const t = i / SR
    let v = (Math.random() - 0.5) * noise
    if (t >= silence) {
      const f = f0 * (1 + 0.03 * Math.sin(2 * Math.PI * 4 * t))
      ph += 2 * Math.PI * f / SR
      v += 0.3 * Math.sin(ph) + 0.15 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)
    }
    x[i] = v
  }
  return x
}

describe('voix du premier qui parle', () => {
  it('voix grave → homme', () => {
    const r = analyzeVoice(voice(115)); expect(r.voice).toBe('homme'); expect(r.hz).toBeGreaterThan(105); expect(r.hz).toBeLessThan(125)
  })
  it('voix aiguë → femme', () => {
    const r = analyzeVoice(voice(215)); expect(r.voice).toBe('femme'); expect(r.hz).toBeGreaterThan(200); expect(r.hz).toBeLessThan(230)
  })
  it('entre les deux → toujours une réponse, à vérifier', () => {
    const a = analyzeVoice(voice(160)), b = analyzeVoice(voice(172))
    expect(a.voice).toBe('homme'); expect(b.voice).toBe('femme'); expect(a.sure).toBe(false); expect(b.sure).toBe(false)
    expect(analyzeVoice(voice(115)).sure).toBe(true)
  })
  it('voix faible ou tardive → quand même trouvée', () => {
    const x = voice(210, 8, 1.5); for (let i = 0; i < x.length; i++) x[i] *= 0.05
    expect(analyzeVoice(x).voice).toBe('femme')
  })
  it('silence → aucune voix', () => { const r = analyzeVoice(voice(120, 3, 0)); expect(r.voice).toBe('incertain'); expect(r.hz).toBeNull() })
  it('prend le PREMIER qui parle', () => {
    const a = voice(110, 0.5, 2), b = voice(220, 0, 3)
    const x = new Float32Array(a.length + b.length); x.set(a); x.set(b, a.length)
    expect(analyzeVoice(x).voice).toBe('homme')
  })
  it('ne mesure QUE les paroles (musique ignorée)', () => {
    // 0–2 s : « musique » aiguë forte, 2–4 s : voix d'homme ; Whisper dit que la parole est à 2–4 s
    const a = voice(260, 0, 2), b = voice(110, 0, 2)
    const x = new Float32Array(a.length + b.length); x.set(a); x.set(b, a.length)
    expect(analyzeVoice(x).voice).toBe('femme')
    expect(analyzeVoice(x, [{ start: 2.1, end: 3.9 }]).voice).toBe('homme')
  })
  it('premiers mots du premier qui parle', () => {
    const r = firstSpeech([{ start: 5, end: 5.4, text: 'après' }, { start: 1, end: 1.3, text: 'mais' }, { start: 1.4, end: 1.8, text: 'pourquoi' }, { start: 0.2, end: 0.5, text: '♪' }])
    expect(r.text).toBe('mais pourquoi'); expect(r.spans).toHaveLength(2)
  })
  it('WAV valide', () => { const w = pcmToWav(new Uint8Array(100)); expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF'); expect(w.length).toBe(144) })
  it('réponse vision lue', () => {
    expect(parseOnScreen('{"main":"femme"}')).toBe('femme'); expect(parseOnScreen('```json\n{"main": "homme"}\n```')).toBe('homme')
    expect(parseOnScreen('A woman')).toBe('femme'); expect(parseOnScreen('{"main":"aucun"}')).toBeNull(); expect(parseOnScreen(null)).toBeNull()
  })
})
