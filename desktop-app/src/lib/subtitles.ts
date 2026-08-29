// Transcription audio via Groq Whisper (verbose_json → segments minutés).
// Desktop (webSecurity:false) → appel multipart direct, pas de proxy.
export interface Segment { start: number; end: number; text: string }

export async function transcribeGroq(groqKey: string, audio: Blob): Promise<Segment[]> {
  if (!groqKey) throw new Error('Clé Groq manquante (Réglages)')
  const form = new FormData()
  form.append('file', audio, 'audio.mp3')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('response_format', 'verbose_json')
  form.append('temperature', '0')
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${groqKey}` }, body: form,
  })
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`)
  const j = await res.json()
  const segs = Array.isArray(j?.segments) ? j.segments : []
  return segs
    .map((s: any) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? '').trim() }))
    .filter((s: Segment) => s.text && s.end > s.start)
}
