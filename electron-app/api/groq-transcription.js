// Proxy Groq Whisper audio transcription.
// Accepts either a video URL (fetched server-side) or base64 audio bytes.
// Avoids browser CORS restrictions on multipart uploads to api.groq.com.

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { apiKey, videoUrl, audioBase64, filename, language } = req.body
  if (!apiKey || !filename || (!videoUrl && !audioBase64)) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' })
  }

  try {
    let buffer
    if (videoUrl) {
      // Server-side fetch (no CORS) — used for bank signed URLs
      const r = await fetch(videoUrl)
      if (!r.ok) return res.json({ ok: false, error: `Fetch vidéo ${r.status}` })
      buffer = Buffer.from(await r.arrayBuffer())
    } else {
      buffer = Buffer.from(audioBase64, 'base64')
    }

    // Build multipart/form-data body manually
    const boundary = `----GBoundary${Date.now()}`
    const ext  = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'mp4'
    const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'webm' ? 'audio/webm' : 'video/mp4'

    const parts = []
    function addField(name, value) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ))
    }
    addField('model', 'whisper-large-v3-turbo')
    addField('response_format', 'verbose_json')
    addField('timestamp_granularities[]', 'word')
    if (language) addField('language', language)
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ))
    parts.push(buffer)
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

    const body = Buffer.concat(parts)

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    })

    if (!groqRes.ok) {
      const txt = await groqRes.text().catch(() => '')
      return res.json({ ok: false, error: `Groq ${groqRes.status}: ${txt.slice(0, 300)}` })
    }

    const data = await groqRes.json()
    return res.json({ ok: true, data })
  } catch (err) {
    return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
