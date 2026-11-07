import { describe, it, expect, vi } from 'vitest'
vi.mock('./ffmpeg', () => ({ runFfmpeg: vi.fn() }))
import { analyzeVoice, SR } from './voiceGender'

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
  it('entre les deux → incertain', () => { expect(analyzeVoice(voice(167)).voice).toBe('incertain') })
  it('silence → incertain', () => { const r = analyzeVoice(voice(120, 3, 0)); expect(r.voice).toBe('incertain'); expect(r.hz).toBeNull() })
  it('prend le PREMIER qui parle', () => {
    const a = voice(110, 0.5, 2), b = voice(220, 0, 3)
    const x = new Float32Array(a.length + b.length); x.set(a); x.set(b, a.length)
    expect(analyzeVoice(x).voice).toBe('homme')
  })
})
