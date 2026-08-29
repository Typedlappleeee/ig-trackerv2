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
async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin)
}

export async function transcribeGroq(groqKey: string, audio: Blob): Promise<Segment[]> {
  if (!groqKey) throw new Error('Clé Groq manquante (Réglages)')
  if (IS_WEB) {
    const res = await fetch('/api/groq', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: groqKey, filename: 'audio.mp3', audioBase64: await blobToBase64(audio) }),
    })
    const j = await res.json() as { ok: boolean; data?: any; error?: string }
    if (!j.ok) throw new Error(j.error || 'Groq (relais) : échec')
    return toSegments(j.data)
  }
  const form = new FormData()
  form.append('file', audio, 'audio.mp3')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('response_format', 'verbose_json')
  form.append('temperature', '0')
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${groqKey}` }, body: form,
  })
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`)
  return toSegments(await res.json())
}
