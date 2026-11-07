// Qui parle EN PREMIER dans la vidéo : un homme ou une femme ? Estimé par la hauteur de la voix
// (fréquence fondamentale F0, méthode YIN) sur les premières secondes parlées : ~85–155 Hz pour une
// voix d'homme, ~165–255 Hz pour une voix de femme. Il y a TOUJOURS une réponse homme/femme dès
// qu'une voix est entendue : entre les deux (cri, rire, musique), le côté le plus proche est pris et
// marqué « à vérifier » (sure = false). « incertain » = aucune voix du tout dans la vidéo.
// Avec une clé Groq, Whisper repère d'abord OÙ sont les vraies paroles (mots minutés) : la hauteur
// n'est mesurée que sur les premiers mots prononcés — la musique et les bruits sont ignorés.
// Sans clé : tout se fait sur le PC (détection de voix par le volume et la périodicité).
import { runFfmpeg, probeDuration } from './ffmpeg'
import { groqChat } from './ai'
import { transcribeWordsGroq } from './subtitles'

export type Voice = 'homme' | 'femme' | 'incertain'
export interface VoiceResult { voice: Voice; hz: number | null; frames: number; sure: boolean; words?: string; by?: 'voix' | 'écran' }
export interface Span { start: number; end: number }

export const SR = 16000
const WIN = 1024, HOP = 256
const MIN_HZ = 70, MAX_HZ = 400
export const MALE_MAX = 155, FEMALE_MIN = 180, SPLIT = 165   // entre MALE_MAX et FEMALE_MIN : à vérifier

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
// `speech` (facultatif) : passages de vraie parole (secondes) — seules ces fenêtres sont mesurées.
export function analyzeVoice(x: Float32Array, speech?: Span[]): VoiceResult {
  const n = Math.max(0, Math.floor((x.length - WIN) / HOP) + 1)
  if (!n) return { voice: 'incertain', hz: null, frames: 0, sure: false }
  const rms = new Float32Array(n)
  let peak = 0
  for (let f = 0; f < n; f++) {
    let s = 0
    for (let i = 0; i < WIN; i++) { const v = x[f * HOP + i]; s += v * v }
    rms[f] = Math.sqrt(s / WIN); if (rms[f] > peak) peak = rms[f]
  }
  const floor = median([...rms].sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(n * 0.2))))
  const thr = Math.max(0.004, peak * 0.12, Math.min(floor * 2.5, peak * 0.4))   // sans silence : le « bruit de fond » est la voix elle-même
  // premier passage parlé : les ~60 premières fenêtres voisées (≈ 1 s de voix), dans les 4 s qui
  // suivent ; trop peu de voix là-dedans → toute la piste (20 s), seuil de volume abaissé si besoin.
  const inSpeech = (f: number) => {
    if (!speech?.length) return true
    const t = (f * HOP + WIN / 2) / SR
    return speech.some(w => t >= w.start - 0.05 && t <= w.end + 0.05)
  }
  const collect = (window: number, t: number, max: number) => {
    const out: number[] = []
    let first = -1
    for (let f = 0; f < n && out.length < max; f++) {
      if (rms[f] < t || !inSpeech(f)) continue
      const hz = yin(x, f * HOP)
      if (hz == null || hz < MIN_HZ || hz > MAX_HZ) continue
      if (first < 0) first = f
      if ((f - first) * HOP / SR > window) break
      out.push(hz)
    }
    return out
  }
  let pitches = collect(4, thr, 60)
  if (pitches.length < 8) pitches = collect(Infinity, thr, 200)
  if (pitches.length < 8) pitches = collect(Infinity, Math.max(0.002, peak * 0.05), 200)
  if (pitches.length < 3) return { voice: 'incertain', hz: null, frames: pitches.length, sure: false }
  const hz = Math.round(median(pitches))
  const sure = pitches.length >= 8 && (hz <= MALE_MAX || hz >= FEMALE_MIN)
  return { voice: hz < SPLIT ? 'homme' : 'femme', hz, frames: pitches.length, sure }
}

// PCM 16 bits mono → fichier WAV (pour Whisper, sans 2e passage ffmpeg).
export function pcmToWav(pcm: Uint8Array, sr = SR): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength), v = new DataView(out.buffer)
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i) }
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.byteLength, true)
  out.set(pcm, 44)
  return out
}

// Premiers mots du premier qui parle : ceux des ~3 s qui suivent le premier mot.
export function firstSpeech(words: { start: number; end: number; text: string }[]): { spans: Span[]; text: string } {
  const w = words.filter(x => x.end > x.start && /[\p{L}\p{N}]/u.test(x.text)).sort((a, b) => a.start - b.start)
  if (!w.length) return { spans: [], text: '' }
  const l = w.filter(x => x.start < w[0].start + 3)
  return { spans: l.map(x => ({ start: x.start, end: x.end })), text: l.map(x => x.text).join(' ').trim() }
}

// Vidéo (octets) → piste son mono 16 kHz des 20 premières secondes → (paroles Whisper) → analyse.
export async function detectVoice(video: Uint8Array, groqKey?: string | null, log?: (m: string) => void): Promise<VoiceResult> {
  const pcm = await runFfmpeg({ input: video, inputName: 'voice.mp4', args: ['-t', '20', '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le'], outName: 'voice.pcm' })
  const i16 = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const x = new Float32Array(i16.length)
  for (let i = 0; i < i16.length; i++) x[i] = i16[i] / 32768
  if (groqKey && pcm.byteLength > 8000) {
    try {
      const words = await transcribeWordsGroq(groqKey, new Blob([pcmToWav(pcm) as BlobPart], { type: 'audio/wav' }))
      const sp = firstSpeech(words)
      if (sp.spans.length) {
        const r = analyzeVoice(x, sp.spans)
        if (r.voice !== 'incertain') return { ...r, words: sp.text.slice(0, 60) }
      } else log?.('    (Whisper : aucune parole repérée → mesure sur toute la piste)')
    } catch (e) { log?.(`    (Whisper indisponible : ${e instanceof Error ? e.message : String(e)} → mesure locale)`) }
  }
  return analyzeVoice(x)
}

export const voiceLabel = (r: VoiceResult) =>
  r.by === 'écran' ? `${r.voice === 'homme' ? 'un homme' : 'une femme'} à l’écran (voix pas assez nette)`
  : r.voice === 'incertain' ? 'aucune voix entendue'
    : `${r.voice === 'homme' ? 'voix d’homme' : 'voix de femme'} (${r.hz} Hz${r.sure ? '' : ', à vérifier'})${r.words ? ` — « ${r.words} »` : ''}`

/* ── Repli VISUEL : qui apparaît le plus à l'écran (homme / femme) ──
   Utilisé quand la voix n'est pas nette (« à vérifier » ou aucune voix). 6 images de la vidéo,
   assemblées en une planche, envoyées au modèle vision de Groq (clé de l'espace). */
const VISION_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct']   // le 2e si le 1er est retiré
export function parseOnScreen(t: string | null): 'homme' | 'femme' | null {
  if (!t) return null
  const m = t.match(/"main"\s*:\s*"([^"]+)"/i)?.[1] ?? t
  const n = m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(femme|woman|female|fille)\b/.test(n)) return 'femme'
  if (/\b(homme|man|male|garcon)\b/.test(n)) return 'homme'
  return null
}
export async function detectOnScreen(video: Uint8Array, groqKey: string): Promise<'homme' | 'femme' | null> {
  const dur = await probeDuration(video).catch(() => 0)
  const fps = (6 / Math.max(1, dur || 10)).toFixed(4)
  const jpg = await runFfmpeg({ input: video, inputName: 'look.mp4', args: ['-vf', `fps=${fps},scale=240:-2,tile=3x2`, '-frames:v', '1', '-q:v', '5'], outName: 'look.jpg' })
  let bin = ''
  for (let i = 0; i < jpg.length; i += 0x8000) bin += String.fromCharCode(...jpg.subarray(i, i + 0x8000))
  const messages = [{ role: 'user', content: [
    { type: 'text', text: 'These 6 images are frames from the same short video. Which person appears the most on screen: a man or a woman? Answer ONLY with JSON: {"main":"homme"} or {"main":"femme"} (or {"main":"aucun"} if nobody is visible).' },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${btoa(bin)}` } },
  ] }]
  let err: unknown = null
  for (const m of VISION_MODELS) {
    try { return parseOnScreen(await groqChat(groqKey, m, messages, 30)) } catch (e) { err = e }
  }
  throw err
}

// Voix d'abord ; si elle n'est pas nette (ou absente) et qu'une clé Groq est là → qui est à l'écran.
export async function detectSpeaker(video: Uint8Array, groqKey?: string | null, log?: (m: string) => void): Promise<VoiceResult> {
  const r = await detectVoice(video, groqKey, log)
  if (r.sure || !groqKey) return r
  try {
    const who = await detectOnScreen(video, groqKey)
    if (who) return { ...r, voice: who, sure: true, by: 'écran' }
  } catch (e) { log?.(`    (vision indisponible : ${e instanceof Error ? e.message.slice(0, 120) : String(e)})`) }
  return r
}
