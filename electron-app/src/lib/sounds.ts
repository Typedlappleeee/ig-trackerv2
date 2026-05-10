// Web Audio API sound synthesizer — no external files, zero dependencies.
// All sounds are generated procedurally via oscillators + gain envelopes.

let _ctx: AudioContext | null = null

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') _ctx.resume()
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
export function playNav() {
  try {
    const ac = ctx()
    const t  = ac.currentTime
    note(ac, 1046, t, 0.07, 0.04, 'sine')  // C6 — crisp tap
  } catch { /* audio not available */ }
}

/** Notification chime, flavored by toast kind */
export function playToast(kind: 'ok' | 'error' | 'warn' | 'info') {
  try {
    const ac = ctx()
    const t  = ac.currentTime
    if (kind === 'ok') {
      // C5 → E5 — pleasant ascending double chime
      note(ac, 523.25, t,        0.22, 0.09, 'sine')
      note(ac, 659.25, t + 0.11, 0.28, 0.10, 'sine')
    } else if (kind === 'error') {
      // Buzzy two-tone descending
      note(ac, 380, t,        0.18, 0.10, 'sawtooth')
      note(ac, 280, t + 0.12, 0.22, 0.09, 'sawtooth')
    } else if (kind === 'warn') {
      // A4 minor wobble
      note(ac, 440, t,        0.16, 0.09, 'triangle')
      note(ac, 415, t + 0.09, 0.20, 0.07, 'triangle')
    } else {
      // Single airy high chime
      note(ac, 784, t, 0.25, 0.06, 'sine')
      note(ac, 784, t, 0.25, 0.02, 'triangle', 3)
    }
  } catch { /* audio not available */ }
}

/** 4-note C major arpeggio jingle played at app startup */
export function playSplash() {
  try {
    const ac = ctx()
    const t0 = ac.currentTime + 0.35  // slight delay after render

    // Melody: C4 → E4 → G4 → C5
    const melody = [261.63, 329.63, 392.00, 523.25]
    melody.forEach((freq, i) => {
      const start = t0 + i * 0.19
      note(ac, freq,     start, 0.5, 0.09, 'sine')
      note(ac, freq * 2, start, 0.3, 0.03, 'triangle', 4)  // octave shimmer
    })

    // Final resolved chord (C5 + G5) with slow decay
    note(ac, 523.25, t0 + 0.82, 1.1, 0.07, 'sine')
    note(ac, 783.99, t0 + 0.82, 1.0, 0.04, 'sine')
    note(ac, 523.25, t0 + 0.82, 1.3, 0.02, 'triangle', 2)
  } catch { /* audio not available */ }
}
