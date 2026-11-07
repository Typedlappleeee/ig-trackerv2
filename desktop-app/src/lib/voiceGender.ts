// Qui parle EN PREMIER dans la vidéo : un homme ou une femme ? Estimé par la hauteur de la voix
// (fréquence fondamentale F0, méthode YIN) sur les premières secondes parlées : ~85–155 Hz pour une
// voix d'homme, ~165–255 Hz pour une voix de femme. Entre les deux (ou musique forte, cri, rire) →
// « incertain » : l'appelant retombe alors sur son pool par défaut. Rien n'est envoyé à un serveur.
import { runFfmpeg } from './ffmpeg'

export type Voice = 'homme' | 'femme' | 'incertain'
export interface VoiceResult { voice: Voice; hz: number | null; frames: number }

export const SR = 16000
const WIN = 1024, HOP = 256
const MIN_HZ = 70, MAX_HZ = 400
export const MALE_MAX = 155, FEMALE_MIN = 180   // entre les deux : incertain

// F0 d'une fenêtre (YIN). null si la fenêtre n'est pas voisée.
function yin(x: Float32Array, off: number): number | null {
  const tMin = Math.floor(SR / MAX_HZ), tMax = Math.ceil(SR / MIN_HZ), W = WIN - tMax
  const d = new Float32Array(tMax + 1)
  for (let t = 1; t <= tMax; t++) {
    let s = 0
    for (let i = 0; i < W; i++) { const v = x[off + i] - x[off + i + t]; s += v * v }
    d[t] = s
  }
  // différence cumulée normalisée
  let run = 0
  const c = new Float32Array(tMax + 1); c[0] = 1
  for (let t = 1; t <= tMax; t++) { run += d[t]; c[t] = run > 0 ? d[t] * t / run : 1 }
  for (let t = tMin; t < tMax; t++) {
    if (c[t] < 0.15) {
      while (t + 1 < tMax && c[t + 1] < c[t]) t++
      // interpolation parabolique
      const a = c[t - 1], b = c[t], e = c[t + 1], den = a - 2 * b + e
      const tt = den !== 0 ? t + (a - e) / (2 * den) : t
      return SR / tt
    }
  }
  return null
}

const median = (l: number[]) => { const s = [...l].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

// Analyse d'un signal mono 16 kHz (valeurs -1…1).
export function analyzeVoice(x: Float32Array): VoiceResult {
  const n = Math.max(0, Math.floor((x.length - WIN) / HOP) + 1)
  if (!n) return { voice: 'incertain', hz: null, frames: 0 }
  const rms = new Float32Array(n)
  let peak = 0
  for (let f = 0; f < n; f++) {
    let s = 0
    for (let i = 0; i < WIN; i++) { const v = x[f * HOP + i]; s += v * v }
    rms[f] = Math.sqrt(s / WIN); if (rms[f] > peak) peak = rms[f]
  }
  const floor = median([...rms].sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(n * 0.2))))
  const thr = Math.max(0.004, peak * 0.12, Math.min(floor * 2.5, peak * 0.4))   // sans silence : le « bruit de fond » est la voix elle-même
  // premier passage parlé : les ~60 premières fenêtres voisées (≈ 1 s de voix), dans les 4 s qui suivent
  const pitches: number[] = []
  let first = -1
  for (let f = 0; f < n && pitches.length < 60; f++) {
    if (rms[f] < thr) continue
    const hz = yin(x, f * HOP)
    if (hz == null || hz < MIN_HZ || hz > MAX_HZ) continue
    if (first < 0) first = f
    if ((f - first) * HOP / SR > 4) break
    pitches.push(hz)
  }
  if (pitches.length < 8) return { voice: 'incertain', hz: null, frames: pitches.length }
  const hz = Math.round(median(pitches))
  return { voice: hz <= MALE_MAX ? 'homme' : hz >= FEMALE_MIN ? 'femme' : 'incertain', hz, frames: pitches.length }
}

// Vidéo (octets) → piste son mono 16 kHz des 20 premières secondes → analyse.
export async function detectVoice(video: Uint8Array): Promise<VoiceResult> {
  const pcm = await runFfmpeg({ input: video, inputName: 'voice.mp4', args: ['-t', '20', '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le'], outName: 'voice.pcm' })
  const i16 = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const x = new Float32Array(i16.length)
  for (let i = 0; i < i16.length; i++) x[i] = i16[i] / 32768
  return analyzeVoice(x)
}

export const voiceLabel = (r: VoiceResult) =>
  r.voice === 'homme' ? `voix d’homme (${r.hz} Hz)` : r.voice === 'femme' ? `voix de femme (${r.hz} Hz)` : r.hz ? `voix incertaine (${r.hz} Hz)` : 'aucune voix nette'
