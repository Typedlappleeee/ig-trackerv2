// Procedural ambient chill music — Web Audio API, zero external files.
// Generates a looping Am7 → Fmaj7 → Cmaj7 → G7sus4 pad progression
// with a subtle bass line and randomised pentatonic melody notes.

let _ctx: AudioContext | null  = null
let _master: GainNode | null   = null
let _running   = false
let _timer: ReturnType<typeof setTimeout> | null = null
let _nextTime  = 0
let _chordIdx  = 0

const LS_KEY = 'ig-music-enabled'

// Am7 → Fmaj7 → Cmaj7 → G7sus4
const CHORDS = [
  { root: 110.00, freqs: [110.00, 130.81, 164.81, 196.00] },  // Am7
  { root:  87.31, freqs: [ 87.31, 110.00, 130.81, 164.81] },  // Fmaj7
  { root:  65.41, freqs: [ 65.41,  82.41,  98.00, 130.81] },  // Cmaj7
  { root:  98.00, freqs: [ 98.00, 130.81, 146.83, 174.61] },  // G7sus4
]
const CHORD_DUR  = 6.0   // seconds per chord
const XFADE      = 2.2   // crossfade overlap
const PAD_GAIN   = 0.020
const BASS_GAIN  = 0.026

// A minor pentatonic (A4–A5)
const MEL_NOTES  = [440.00, 523.25, 587.33, 659.25, 783.99, 880.00]

// ── Context ──────────────────────────────────────────────────────────────────

function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx    = new AudioContext()
    _master = _ctx.createGain()
    _master.gain.value = 0
    _master.connect(_ctx.destination)
  }
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// ── Oscillator helpers ────────────────────────────────────────────────────────

function makePad(
  c: AudioContext, out: AudioNode,
  freq: number, start: number, dur: number, gain: number,
) {
  for (const detune of [-6, 0, 6]) {
    const osc    = c.createOscillator()
    const filter = c.createBiquadFilter()
    const env    = c.createGain()

    osc.type             = 'triangle'
    osc.frequency.value  = freq
    osc.detune.value     = detune

    // Subtle LFO vibrato for organic warmth
    const lfo  = c.createOscillator()
    const lfog = c.createGain()
    lfo.frequency.value = 4.2 + Math.random() * 0.6
    lfog.gain.value     = 2.8
    lfo.connect(lfog); lfog.connect(osc.detune)
    lfo.start(start); lfo.stop(start + dur + 0.2)

    filter.type            = 'lowpass'
    filter.frequency.value = 1600
    filter.Q.value         = 0.35

    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(gain, start + 2.4)         // slow attack
    env.gain.setValueAtTime(gain, start + dur - XFADE)
    env.gain.linearRampToValueAtTime(0, start + dur)            // crossfade out

    osc.connect(filter); filter.connect(env); env.connect(out)
    osc.start(start); osc.stop(start + dur + 0.2)
  }
}

function makeBass(
  c: AudioContext, out: AudioNode,
  freq: number, start: number, dur: number,
) {
  const osc    = c.createOscillator()
  const filter = c.createBiquadFilter()
  const env    = c.createGain()

  osc.type            = 'sine'
  osc.frequency.value = freq * 0.5          // one octave below root
  filter.type            = 'lowpass'
  filter.frequency.value = 320

  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(BASS_GAIN, start + 1.0)
  env.gain.setValueAtTime(BASS_GAIN, start + dur - XFADE)
  env.gain.linearRampToValueAtTime(0, start + dur)

  osc.connect(filter); filter.connect(env); env.connect(out)
  osc.start(start); osc.stop(start + dur + 0.2)
}

function makeMelNote(c: AudioContext, out: AudioNode, start: number) {
  const freq = MEL_NOTES[Math.floor(Math.random() * MEL_NOTES.length)]
  const osc  = c.createOscillator()
  const env  = c.createGain()

  osc.type            = 'sine'
  osc.frequency.value = freq

  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(0.016, start + 0.07)
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.65)

  osc.connect(env); env.connect(out)
  osc.start(start); osc.stop(start + 0.7)
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function scheduleChord(c: AudioContext, out: AudioNode) {
  const chord = CHORDS[_chordIdx % CHORDS.length]
  _chordIdx++
  const start = _nextTime
  const dur   = CHORD_DUR + XFADE

  // Pad layers (main + octave up)
  chord.freqs.forEach((f, i) => {
    makePad(c, out, f,     start, dur, PAD_GAIN * (i === 0 ? 1.3 : 1.0))
    makePad(c, out, f * 2, start, dur, PAD_GAIN * 0.45)
  })

  makeBass(c, out, chord.root, start, dur)

  // 2–4 random melody notes scattered across the chord window
  const count = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < count; i++) {
    const mt = start + 0.8 + Math.random() * (CHORD_DUR - 1.2)
    makeMelNote(c, out, mt)
  }

  _nextTime = start + CHORD_DUR
}

function loop() {
  if (!_running || !_master) return
  const c = getCtx()
  while (_nextTime < c.currentTime + 3.0) {
    scheduleChord(c, _master)
  }
  _timer = setTimeout(loop, 1000)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startMusic() {
  if (_running) return
  _running = true
  const c = getCtx()
  if (!_master) return
  _master.gain.cancelScheduledValues(c.currentTime)
  _master.gain.setValueAtTime(_master.gain.value, c.currentTime)
  _master.gain.linearRampToValueAtTime(1, c.currentTime + 3.0)  // gentle fade-in
  _nextTime = c.currentTime + 0.5
  _chordIdx = 0
  loop()
}

export function stopMusic(instant = false) {
  _running = false
  if (_timer) { clearTimeout(_timer); _timer = null }
  if (!_ctx || !_master) return
  const fade = instant ? 0.15 : 3.0
  _master.gain.cancelScheduledValues(_ctx.currentTime)
  _master.gain.setValueAtTime(_master.gain.value, _ctx.currentTime)
  _master.gain.linearRampToValueAtTime(0, _ctx.currentTime + fade)
}

/** Read preference from localStorage (default: enabled) */
export function isMusicEnabled(): boolean {
  return localStorage.getItem(LS_KEY) !== 'false'
}

/** Persist preference and start/stop immediately */
export function setMusicEnabled(enabled: boolean) {
  localStorage.setItem(LS_KEY, enabled ? 'true' : 'false')
  if (enabled) startMusic()
  else stopMusic()
}
