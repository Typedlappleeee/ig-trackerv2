// Proxy Groq API — chat completions ET audio transcription.
// Distingué par la présence de `filename` dans le body (transcription) vs `messages` (chat).

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } }

// Garde-fou SSRF : n'autorise qu'une URL http(s) publique (bloque localhost,
// IP privées et link-local, dont les métadonnées cloud 169.254.169.254).
function isSafePublicUrl(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname
    if (/^(localhost|0\.0\.0\.0|127\.|10\.|169\.254\.|192\.168\.|::1|\[::1\])/i.test(host)) return false
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false  // 172.16.0.0/12
    return true
  } catch { return false }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { apiKey } = req.body
  if (!apiKey) return res.status(400).json({ ok: false, error: 'Missing apiKey' })

  // ── Audio transcription (Whisper) ────────────────────────────────────────────
  if (req.body.filename) {
    const { videoUrl, audioBase64, filename, language } = req.body
    if (!filename || (!videoUrl && !audioBase64)) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' })
    }
    try {
      let buffer
      if (videoUrl) {
        if (!isSafePublicUrl(videoUrl)) return res.status(400).json({ ok: false, error: 'URL vidéo non autorisée' })
        const r = await fetch(videoUrl)
        if (!r.ok) return res.json({ ok: false, error: `Fetch vidéo ${r.status}` })
        buffer = Buffer.from(await r.arrayBuffer())
      } else {
        buffer = Buffer.from(audioBase64, 'base64')
      }

      const boundary = `----GBoundary${Date.now()}`
      // Strip query-string/fragment; ensure the filename has a Groq-recognised extension
      const GROQ_EXTS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'opus', 'wav', 'webm'])
      const cleanFilename = (filename || 'video.mp4').split('?')[0].split('#')[0]
      const extMatch = cleanFilename.match(/\.([a-z0-9]+)$/i)
      const ext = extMatch?.[1]?.toLowerCase()
      const finalFilename = (ext && GROQ_EXTS.has(ext)) ? cleanFilename : `${cleanFilename}.mp4`
      const resolvedExt  = (ext && GROQ_EXTS.has(ext)) ? ext : 'mp4'
      const mime = resolvedExt === 'mp3' ? 'audio/mpeg' : resolvedExt === 'webm' ? 'audio/webm' : 'video/mp4'

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
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${finalFilename}"\r\nContent-Type: ${mime}\r\n\r\n`,
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
      return res.json({ ok: true, data: await groqRes.json() })
    } catch (err) {
      return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Chat completions ─────────────────────────────────────────────────────────
  const { model, messages, temperature, maxTokens } = req.body
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       model ?? 'llama-3.3-70b-versatile',
        messages,
        temperature: temperature ?? 0.7,
        max_tokens:  maxTokens ?? 2048,
      }),
    })
    const data = await response.json()
    if (!response.ok) return res.json({ ok: false, error: JSON.stringify(data) })
    return res.json({ ok: true, data })
  } catch (err) {
    return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
