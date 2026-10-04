// Transcription audio via Groq Whisper (verbose_json → segments minutés).
// Electron → multipart direct ; WEB → relais /api/groq (audio en base64).
import { IS_WEB } from './platform'
export interface Segment { start: number; end: number; text: string }

function toSegments(j: any): Segment[] {
  const segs = Array.isArray(j?.segments) ? j.segments : []
  return segs
    .map((s: any) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? '').trim() }))
    .filter((s: Segment) => s.text && s.end > s.start)
}

// Timestamps au MOT (verbose_json + timestamp_granularities[]=word). Repli : si l'API
// ne renvoie pas de `words`, on découpe chaque segment en mots à durée égale (approx).
function toWords(j: any): Segment[] {
  const raw = Array.isArray(j?.words) ? j.words : []
  const words: Segment[] = raw
    .map((w: any) => ({ start: Number(w.start) || 0, end: Number(w.end) || 0, text: String(w.word ?? w.text ?? '').trim() }))
    .filter((w: Segment) => w.text && w.end >= w.start)
  if (words.length) return words
  // Repli : reconstruit des mots depuis les segments.
  const out: Segment[] = []
  for (const s of toSegments(j)) {
    const parts = s.text.split(/\s+/).filter(Boolean)
    if (!parts.length) continue
    const dur = (s.end - s.start) / parts.length
    parts.forEach((p, i) => out.push({ start: s.start + i * dur, end: s.start + (i + 1) * dur, text: p }))
  }
  return out
}
async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin)
}

// Renvoie le JSON brut Groq (segments + words). Un seul appel réseau ; l'appelant
// choisit ensuite segments (toSegments) ou mots (toWords).
async function transcribeRaw(groqKey: string, audio: Blob): Promise<any> {
  if (!groqKey) throw new Error('Clé Groq manquante (Réglages)')
  if (IS_WEB) {
    const res = await fetch('/api/groq', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: groqKey, filename: 'audio.mp3', audioBase64: await blobToBase64(audio) }),
    })
    const j = await res.json() as { ok: boolean; data?: any; error?: string }
    if (!j.ok) throw new Error(j.error || 'Groq (relais) : échec')
    return j.data
  }
  const form = new FormData()
  form.append('file', audio, 'audio.mp3')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word') // timestamps au mot
  form.append('temperature', '0')
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${groqKey}` }, body: form,
  })
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`)
  return res.json()
}

export async function transcribeGroq(groqKey: string, audio: Blob): Promise<Segment[]> {
  return toSegments(await transcribeRaw(groqKey, audio))
}

// Transcription au MOT (pour sous-titres qui défilent 2–4 mots à la fois).
export async function transcribeWordsGroq(groqKey: string, audio: Blob): Promise<Segment[]> {
  return toWords(await transcribeRaw(groqKey, audio))
}
