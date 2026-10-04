// Proxy Groq API — chat completions ET audio transcription.
// Distingué par la présence de `filename` dans le body (transcription) vs `messages` (chat).

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } }

// Garde-fou SSRF : la vidéo à transcrire vient TOUJOURS de la banque (URL signée
// Supabase de CETTE app). On restreint donc à l'hôte SUPABASE_URL du projet — ça
// bloque metadata cloud, IP privées, et les projets Supabase tiers (redirecteurs).
function isSafePublicUrl(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    const envUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    let allowedHost = ''
    try { if (envUrl) allowedHost = new URL(envUrl).hostname.toLowerCase() } catch { /* ignore */ }
    return !!allowedHost && host === allowedHost
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
        const r = await fetch(videoUrl, { redirect: 'manual', signal: AbortSignal.timeout(30000) })
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
