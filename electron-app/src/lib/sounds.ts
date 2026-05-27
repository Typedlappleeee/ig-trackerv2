// Web Audio API sound synthesizer — no external files, zero dependencies.
// All sounds are generated procedurally via oscillators + gain envelopes.
//
// AudioContext is created lazily on first user gesture to comply with browser
// autoplay policy. Sounds requested before any gesture are silently dropped.

let _ctx: AudioContext | null = null
let _unlocked = false

// Call once from any user gesture (click, keydown) to unlock audio.
export function unlockAudio() {
  if (_unlocked) return
  _unlocked = true
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {})
}

// Returns the AudioContext only if audio has been unlocked by a user gesture.
function ctx(): AudioContext | null {
  return _unlocked ? _ctx : null
}

async function resume(): Promise<AudioContext | null> {
  if (!_unlocked) return null
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') await _ctx.resume()
  return _ctx
}

function note(
  ac: AudioContext,
  freq: number,
  start: number,
  dur: number,
  gain = 0.1,
  type: OscillatorType = 'sine',
  detune = 0,
) {
  const osc = ac.createOscillator()
  const env = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  osc.detune.setValueAtTime(detune, start)
  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(gain, start + 0.007)
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(env)
  env.connect(ac.destination)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

/** Soft click when switching tabs */
export async function playNav() {
  try {
    const ac = await resume(); if (!ac) return
    const t  = ac.currentTime
    note(ac, 1046, t, 0.07, 0.04, 'sine')
  } catch { /* audio not available */ }
}

/** Notification chime, flavored by toast kind */
export async function playToast(kind: 'ok' | 'error' | 'warn' | 'info') {
  try {
    const ac = await resume(); if (!ac) return
    const t  = ac.currentTime
    if (kind === 'ok') {
      note(ac, 523.25, t,        0.22, 0.09, 'sine')
      note(ac, 659.25, t + 0.11, 0.28, 0.10, 'sine')
    } else if (kind === 'error') {
      note(ac, 380, t,        0.18, 0.10, 'sawtooth')
      note(ac, 280, t + 0.12, 0.22, 0.09, 'sawtooth')
    } else if (kind === 'warn') {
      note(ac, 440, t,        0.16, 0.09, 'triangle')
      note(ac, 415, t + 0.09, 0.20, 0.07, 'triangle')
    } else {
      note(ac, 784, t, 0.25, 0.06, 'sine')
      note(ac, 784, t, 0.25, 0.02, 'triangle', 3)
    }
  } catch { /* audio not available */ }
}

/** 4-note C major arpeggio — only plays if audio already unlocked by a gesture */
export async function playSplash() {
  try {
    const ac = await resume(); if (!ac) return
    const t0 = ac.currentTime + 0.05
    const melody = [261.63, 329.63, 392.00, 523.25]
    melody.forEach((freq, i) => {
      const start = t0 + i * 0.19
      note(ac, freq,     start, 0.5, 0.09, 'sine')
      note(ac, freq * 2, start, 0.3, 0.03, 'triangle', 4)
    })
    note(ac, 523.25, t0 + 0.82, 1.1, 0.07, 'sine')
    note(ac, 783.99, t0 + 0.82, 1.0, 0.04, 'sine')
    note(ac, 523.25, t0 + 0.82, 1.3, 0.02, 'triangle', 2)
  } catch { /* audio not available */ }
}

/** Short tick for button toggle / selection */
export async function playTick() {
  try {
    const ac = await resume(); if (!ac) return
    const t  = ac.currentTime
    note(ac, 880, t, 0.055, 0.03, 'sine')
  } catch { /* */ }
}

/** Success chime — task launched / action confirmed */
export async function playSuccess() {
  try {
    const ac = await resume(); if (!ac) return
    const t  = ac.currentTime
    note(ac, 523.25, t,        0.15, 0.07, 'sine')
    note(ac, 783.99, t + 0.10, 0.22, 0.08, 'sine')
    note(ac, 1046.5, t + 0.20, 0.30, 0.06, 'sine')
  } catch { /* */ }
}

/** Subtle whoosh when opening a panel / modal */
export async function playWhoosh() {
  try {
    const ac = await resume(); if (!ac) return
    const t  = ac.currentTime
    const osc = ac.createOscillator()
    const env = ac.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(120, t)
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.18)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.04, t + 0.04)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    osc.connect(env); env.connect(ac.destination)
    osc.start(t); osc.stop(t + 0.25)
  } catch { /* */ }
}

/** Soft error buzz */
export async function playError() {
  try {
    const ac = await resume(); if (!ac) return
    const t  = ac.currentTime
    note(ac, 220, t,        0.12, 0.07, 'sawtooth')
    note(ac, 180, t + 0.08, 0.16, 0.06, 'sawtooth')
  } catch { /* */ }
}
