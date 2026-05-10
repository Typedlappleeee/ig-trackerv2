// Procedural ambient music — Web Audio API.
// Tracks 0-2: fully procedural. Track 3 "67": real MP3 (public/music/67.mp3).
// Volume (default 0.10) and track choice persisted in localStorage.

let _ctx: AudioContext | null    = null
let _master: GainNode | null     = null
let _running  = false
let _timer: ReturnType<typeof setTimeout> | null = null
let _nextTime = 0
let _chordIdx = 0

// Track-3 file player (HTMLAudioElement — simpler, no fetch/decode)
let _fileAudio: HTMLAudioElement | null = null

const LS_ENABLED = 'ig-music-enabled'
const LS_TRACK   = 'ig-music-track'   // '0'–'3'
const LS_VOLUME  = 'ig-music-volume'  // '0.0'–'1.0'
const DEFAULT_VOL = 0.10              // 10 % par défaut

// ── Track metadata (shown in Settings) ───────────────────────────────────────

export interface TrackMeta { id: number; name: string; emoji: string; desc: string }

export const TRACKS: TrackMeta[] = [
  { id: 0, name: 'Lo-Fi Chill',  emoji: '☕', desc: 'Am7 · Fmaj7 · Cmaj7 · G7 — chaleureux, cozy' },
  { id: 1, name: 'Trap Beat',    emoji: '🥁', desc: 'Am · F · C · G — 100 BPM, 808, instrumental' },
  { id: 2, name: 'Synthwave',    emoji: '🌆', desc: 'Dm7 · Bb · Fmaj7 · C7 — rétro, électronique' },
  { id: 3, name: '67',           emoji: '🔥', desc: 'Gazan — 67 (Six Seven) · en boucle' },
]

const FILE_TRACKS: Record<number, string> = {
  3: '/music/67.mp3',
}

// ── Internal track definition ─────────────────────────────────────────────────

interface ChordDef { root: number; freqs: number[] }
interface TrackDef {
  chordDur:     number
  xfade:        number
  padGain:      number
  bassGain:     number
  melGain:      number
  oscType:      OscillatorType
  filterHz:     number
  filterQ:      number
  detunes:      number[]
  lfoRate:      number
  lfoDepth:     number
  melNotes:     number[]
  chords:       ChordDef[]
  extraEvents?: (c: AudioContext, out: AudioNode, start: number, dur: number, chordIdx: number) => void
}

// ── Web Audio context ─────────────────────────────────────────────────────────

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

function savedVol():   number { return Math.max(0, Math.min(1, parseFloat(localStorage.getItem(LS_VOLUME) ?? String(DEFAULT_VOL)))) }
function savedTrack(): number { const v = parseInt(localStorage.getItem(LS_TRACK) ?? '0', 10); return [0,1,2,3].includes(v) ? v : 0 }

// ── Drum builders ─────────────────────────────────────────────────────────────

function makeKick(c: AudioContext, out: AudioNode, start: number, gain = 0.28) {
  const osc = c.createOscillator(); const env = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(160, start)
  osc.frequency.exponentialRampToValueAtTime(28, start + 0.22)
  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(gain, start + 0.005)
  env.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
  osc.connect(env); env.connect(out)
  osc.start(start); osc.stop(start + 0.4)
}

function makeHihat(c: AudioContext, out: AudioNode, start: number, open = false, gain = 1.0) {
  const dur    = open ? 0.20 : 0.04
  const bufLen = Math.ceil(c.sampleRate * dur)
  const buf    = c.createBuffer(1, bufLen, c.sampleRate)
  const data   = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource(); const filter = c.createBiquadFilter(); const env = c.createGain()
  src.buffer = buf
  filter.type = 'highpass'; filter.frequency.value = open ? 5000 : 9000
  env.gain.setValueAtTime(open ? 0.05 * gain : 0.035 * gain, start)
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(filter); filter.connect(env); env.connect(out)
  src.start(start); src.stop(start + dur + 0.01)
}

function make808(c: AudioContext, out: AudioNode, freq: number, start: number, dur: number, slideDown = true) {
  const osc = c.createOscillator(); const filter = c.createBiquadFilter(); const env = c.createGain()
  osc.type = 'sine'
  if (slideDown) {
    osc.frequency.setValueAtTime(freq * 2.4, start)
    osc.frequency.exponentialRampToValueAtTime(freq, start + 0.20)
  } else {
    osc.frequency.value = freq
  }
  filter.type = 'lowpass'; filter.frequency.value = 300
  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(0.22, start + 0.01)
  env.gain.setValueAtTime(0.22, start + dur - 0.5)
  env.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.connect(filter); filter.connect(env); env.connect(out)
  osc.start(start); osc.stop(start + dur + 0.1)
}

// Trap FR drums — 100 BPM
function scheduleTrapDrums(c: AudioContext, out: AudioNode, start: number, dur: number, chordIdx: number) {
  const s16 = (60 / 100) / 4   // 0.15 s per 16th note
  const kickPat  = [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0]
  const hihatPat = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1]
  const openPat  = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0]
  const steps    = Math.floor(dur / s16)
  for (let i = 0; i < steps; i++) {
    const t = start + i * s16; const step = i % 16
    if (kickPat[step])  makeKick  (c, out, t)
    if (hihatPat[step]) makeHihat (c, out, t, !!(openPat[step]))
  }
  // 808 per chord
  const chord = TRACK_DATA[1].chords[chordIdx % 4]
  make808(c, out, chord.root * 0.5, start, dur - 0.3)
}

// UK Drill "67" drums — 67 BPM, triplet hi-hats, heavy 808
function scheduleDrillDrums(c: AudioContext, out: AudioNode, start: number, dur: number, chordIdx: number) {
  const beat = 60 / 67          // ≈ 0.895 s
  const s16  = beat / 4         // ≈ 0.224 s — 16th note

  // UK drill kick: heavy on 1, ghost hit on 2.5, again on 3
  const kickPat  = [1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0]
  // Rapid hi-hat pattern with signature UK drill offbeats
  const hihatPat = [1,1,0,1, 1,0,1,1, 0,1,1,0, 1,1,0,1]
  const openPat  = [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,1,0,0]

  const steps = Math.floor(dur / s16)
  for (let i = 0; i < steps; i++) {
    const t = start + i * s16; const step = i % 16
    if (kickPat[step])  makeKick  (c, out, t, 0.34)           // heavier kick
    if (hihatPat[step]) makeHihat (c, out, t, !!(openPat[step]), 0.8)
  }
  // Long sliding 808 — signature of UK drill
  const chord = TRACK_DATA[3].chords[chordIdx % 4]
  make808(c, out, chord.root * 0.5, start, dur - 0.2, true)
  // Sub-bass double layer
  make808(c, out, chord.root * 0.25, start + 0.1, dur - 0.5, false)
}

// ── Pad / bass / melody builders ──────────────────────────────────────────────

function makePad(c: AudioContext, out: AudioNode, td: TrackDef, freq: number, start: number, dur: number, gain: number) {
  for (const det of td.detunes) {
    const osc = c.createOscillator(); const filter = c.createBiquadFilter(); const env = c.createGain()
    osc.type = td.oscType; osc.frequency.value = freq; osc.detune.value = det
    filter.type = 'lowpass'; filter.frequency.value = td.filterHz; filter.Q.value = td.filterQ
    if (td.lfoRate > 0) {
      const lfo = c.createOscillator(); const lfog = c.createGain()
      lfo.frequency.value = td.lfoRate + Math.random() * 0.4; lfog.gain.value = td.lfoDepth
      lfo.connect(lfog); lfog.connect(osc.detune); lfo.start(start); lfo.stop(start + dur + 0.2)
    }
    const attack = Math.min(dur * 0.36, 2.5)
    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(gain, start + attack)
    env.gain.setValueAtTime(gain, start + dur - td.xfade)
    env.gain.linearRampToValueAtTime(0, start + dur)
    osc.connect(filter); filter.connect(env); env.connect(out)
    osc.start(start); osc.stop(start + dur + 0.2)
  }
}

function makeBass(c: AudioContext, out: AudioNode, td: TrackDef, freq: number, start: number, dur: number) {
  const osc = c.createOscillator(); const filter = c.createBiquadFilter(); const env = c.createGain()
  osc.type = 'sine'; osc.frequency.value = freq * 0.5
  filter.type = 'lowpass'; filter.frequency.value = 280
  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(td.bassGain, start + 1.2)
  env.gain.setValueAtTime(td.bassGain, start + dur - td.xfade)
  env.gain.linearRampToValueAtTime(0, start + dur)
  osc.connect(filter); filter.connect(env); env.connect(out)
  osc.start(start); osc.stop(start + dur + 0.2)
}

function makeMel(c: AudioContext, out: AudioNode, td: TrackDef, start: number) {
  const freq = td.melNotes[Math.floor(Math.random() * td.melNotes.length)]
  const osc = c.createOscillator(); const env = c.createGain()
  osc.type = 'sine'; osc.frequency.value = freq
  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(td.melGain, start + 0.07)
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.7)
  osc.connect(env); env.connect(out)
  osc.start(start); osc.stop(start + 0.8)
}

// ── Chord scheduler ───────────────────────────────────────────────────────────

function scheduleChord(c: AudioContext, out: AudioNode, td: TrackDef) {
  const ci    = _chordIdx
  const chord = td.chords[ci % td.chords.length]
  _chordIdx++
  const start = _nextTime
  const dur   = td.chordDur + td.xfade

  chord.freqs.forEach((f, i) => {
    makePad(c, out, td, f,     start, dur, td.padGain * (i === 0 ? 1.3 : 1.0))
    makePad(c, out, td, f * 2, start, dur, td.padGain * 0.40)
  })
  if (td.bassGain > 0) makeBass(c, out, td, chord.root, start, dur)

  const melCount = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < melCount; i++) {
    makeMel(c, out, td, start + 0.8 + Math.random() * (td.chordDur - 1.2))
  }

  td.extraEvents?.(c, out, start, td.chordDur, ci)
  _nextTime = start + td.chordDur
}

function loop() {
  if (!_running || !_master) return
  const c  = getCtx()
  const td = TRACK_DATA[savedTrack()]
  while (_nextTime < c.currentTime + 3.5) scheduleChord(c, _master, td)
  _timer = setTimeout(loop, 1000)
}

// ── Track data ────────────────────────────────────────────────────────────────

const TRACK_DATA: TrackDef[] = [
  {
    // 0: Lo-Fi Chill — Am7 → Fmaj7 → Cmaj7 → G7sus4
    chordDur: 6.0, xfade: 2.2,
    padGain: 0.011, bassGain: 0.015, melGain: 0.009,
    oscType: 'triangle', filterHz: 1500, filterQ: 0.35,
    detunes: [-6, 0, 6], lfoRate: 4.5, lfoDepth: 2.5,
    melNotes: [440.00, 523.25, 587.33, 659.25, 783.99],
    chords: [
      { root: 110.00, freqs: [110.00, 130.81, 164.81, 196.00] },
      { root:  87.31, freqs: [ 87.31, 110.00, 130.81, 164.81] },
      { root:  65.41, freqs: [ 65.41,  82.41,  98.00, 130.81] },
      { root:  98.00, freqs: [ 98.00, 130.81, 146.83, 174.61] },
    ],
  },
  {
    // 1: Rap Français — Am → F → C → G (100 BPM trap)
    chordDur: 4.8, xfade: 1.2,
    padGain: 0.009, bassGain: 0.0, melGain: 0.010,
    oscType: 'triangle', filterHz: 1100, filterQ: 0.4,
    detunes: [-5, 0, 5], lfoRate: 2.0, lfoDepth: 2.0,
    melNotes: [440.00, 523.25, 659.25, 783.99, 880.00],
    chords: [
      { root: 110.00, freqs: [110.00, 130.81, 164.81, 196.00] },
      { root:  87.31, freqs: [ 87.31, 110.00, 130.81, 164.81] },
      { root:  65.41, freqs: [ 65.41,  98.00, 130.81, 164.81] },
      { root:  98.00, freqs: [ 98.00, 123.47, 146.83, 196.00] },
    ],
    extraEvents: scheduleTrapDrums,
  },
  {
    // 2: Synthwave — Dm7 → Bbmaj7 → Fmaj7 → C7
    chordDur: 4.5, xfade: 1.5,
    padGain: 0.008, bassGain: 0.012, melGain: 0.008,
    oscType: 'sawtooth', filterHz: 680, filterQ: 0.9,
    detunes: [-3, 0, 3], lfoRate: 0, lfoDepth: 0,
    melNotes: [293.66, 349.23, 392.00, 440.00, 523.25],
    chords: [
      { root: 146.83, freqs: [146.83, 174.61, 220.00, 261.63] },
      { root: 116.54, freqs: [116.54, 146.83, 174.61, 220.00] },
      { root:  87.31, freqs: [ 87.31, 110.00, 130.81, 164.81] },
      { root: 130.81, freqs: [130.81, 164.81, 196.00, 233.08] },
    ],
  },
  {
    // 3: 67 — Gm → Cm → Dm → Eb (UK Drill, 67 BPM)
    chordDur: 5.37, xfade: 2.0,   // 6 beats × (60/67) s
    padGain: 0.010, bassGain: 0.0, melGain: 0.007,
    oscType: 'triangle', filterHz: 820, filterQ: 0.5,
    detunes: [-8, 0, 8], lfoRate: 1.5, lfoDepth: 3.5,
    melNotes: [196.00, 233.08, 261.63, 293.66, 349.23],  // G minor pentatonic
    chords: [
      { root:  98.00, freqs: [ 98.00, 116.54, 146.83, 174.61] },  // Gm7
      { root:  65.41, freqs: [ 65.41,  77.78,  98.00, 116.54] },  // Cm7
      { root: 146.83, freqs: [146.83, 174.61, 220.00, 261.63] },  // Dm7
      { root:  77.78, freqs: [ 77.78,  98.00, 116.54, 155.56] },  // Ebmaj7
    ],
    extraEvents: scheduleDrillDrums,
  },
]

// ── Public API ────────────────────────────────────────────────────────────────

export function startMusic() {
  if (_running) return
  _running = true

  const trackIdx = savedTrack()
  const fileSrc  = FILE_TRACKS[trackIdx]

  if (fileSrc) {
    // File track: use HTMLAudioElement — no fetch/decode, reliable
    try {
      _fileAudio = new Audio(fileSrc)
      _fileAudio.loop   = true
      _fileAudio.volume = savedVol()
      _fileAudio.play().catch(e => console.error('[music] play failed', e))
    } catch (e) {
      console.error('[music] file audio start failed', e)
      _running = false
    }
  } else {
    // Procedural track via Web Audio
    try {
      const c = getCtx()
      if (!_master) { _running = false; return }
      _master.gain.cancelScheduledValues(c.currentTime)
      _master.gain.setValueAtTime(_master.gain.value, c.currentTime)
      _master.gain.linearRampToValueAtTime(savedVol(), c.currentTime + 3.0)
      _nextTime = c.currentTime + 0.5
      _chordIdx = 0
      loop()
    } catch (e) {
      console.error('[music] web audio start failed', e)
      _running = false
    }
  }
}

// Properly fades dyingMaster.gain to 0, then closes the AudioContext —
// killing every pending oscillator. New context created by getCtx() on restart.
function killCtx(fadeSecs: number) {
  // Stop file audio element first
  if (_fileAudio) {
    _fileAudio.pause()
    _fileAudio.src = ''
    _fileAudio = null
  }
  if (!_ctx || !_master) { _ctx = null; _master = null; return }
  const dying       = _ctx
  const dyingMaster = _master   // keep reference — we null the public vars below
  _ctx = null; _master = null
  // Fade the ACTUAL master gain so oscillators smoothly stop
  try {
    dyingMaster.gain.cancelScheduledValues(dying.currentTime)
    dyingMaster.gain.setValueAtTime(dyingMaster.gain.value, dying.currentTime)
    dyingMaster.gain.linearRampToValueAtTime(0, dying.currentTime + Math.max(fadeSecs, 0.02))
  } catch { /* context already closed */ }
  setTimeout(() => dying.close().catch(() => {}), Math.ceil((fadeSecs + 0.15) * 1000))
}

export function stopMusic(instant = false) {
  _running = false
  if (_timer) { clearTimeout(_timer); _timer = null }
  killCtx(instant ? 0.05 : 2.5)
}

/** Change volume instantly (0–1). Persisted. */
export function setVolume(v: number) {
  const clamped = Math.max(0, Math.min(1, v))
  localStorage.setItem(LS_VOLUME, String(clamped))
  if (_master && _ctx) {
    _master.gain.cancelScheduledValues(_ctx.currentTime)
    _master.gain.setValueAtTime(_master.gain.value, _ctx.currentTime)
    _master.gain.linearRampToValueAtTime(clamped, _ctx.currentTime + 0.08)
  }
  if (_fileAudio) _fileAudio.volume = clamped
}

export function getVolume(): number { return savedVol() }

/** Switch track: fade out (400 ms), close old context, restart with new track. */
export function setTrack(idx: number) {
  localStorage.setItem(LS_TRACK, String(idx))
  const wasRunning = _running
  _running = false
  if (_timer) { clearTimeout(_timer); _timer = null }
  killCtx(0.4)
  if (wasRunning) setTimeout(() => startMusic(), 600)
}

export function getTrack(): number { return savedTrack() }

export function isMusicEnabled(): boolean {
  return localStorage.getItem(LS_ENABLED) !== 'false'
}

export function setMusicEnabled(enabled: boolean) {
  localStorage.setItem(LS_ENABLED, enabled ? 'true' : 'false')
  if (enabled) startMusic()
  else stopMusic()
}
