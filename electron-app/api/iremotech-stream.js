// Flux "live" iRemoTech relayé côté serveur (streaming NDJSON sur une seule
// requête POST) — bien plus fluide qu'un polling snapshot depuis le navigateur,
// et SANS saturer le tel : la boucle tourne côté serveur, STRICTEMENT une
// capture à la fois (jamais deux en vol), avec backoff sur 503 device_offline.
//
// Le client fait `fetch('/api/iremotech-stream', { method:'POST', body })` puis
// lit `res.body.getReader()`. Chaque ligne = un JSON :
//   {"t":"frame","d":"<base64 jpeg>"}   une image
//   {"t":"offline"}                     503 device_offline (le tel ne répond pas)
//   {"t":"err","s":<status>}            autre erreur amont
//   {"t":"end"}                         fin de la fenêtre serverless (le client reconnecte)
//
// La clé API reste côté serveur (envoyée dans le corps POST, jamais dans l'URL).

module.exports.config = { maxDuration: 60 }

const BASE = (process.env.IREMOTECH_API_BASE || 'https://api.iremotech.com/v1').replace(/\/$/, '')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const { deviceId, apiKey, minIntervalMs } = req.body ?? {}
  const KEY = (typeof apiKey === 'string' && apiKey.trim()) ? apiKey.trim() : process.env.IREMOTECH_API_KEY
  if (!KEY) return res.status(200).json({ ok: false, error: 'Clé iRemoTech absente.' })
  if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId requis' })

  const auth = { Authorization: `Bearer ${KEY}` }
  const dev = encodeURIComponent(String(deviceId))
  const url = `${BASE}/devices/${dev}/snapshot`
  // Intervalle plancher entre deux DÉBUTS de capture (garde le tel respirable).
  const gap = Math.max(120, Number(minIntervalMs) || 250)

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // désactive le buffering proxy

  let closed = false
  req.on('close', () => { closed = true })
  const send = (obj) => { try { res.write(JSON.stringify(obj) + '\n') } catch { closed = true } }

  const started = Date.now()
  const WINDOW = 52000 // on ferme avant la limite serverless (client reconnecte)
  let offlineStreak = 0

  try {
    while (!closed && Date.now() - started < WINDOW) {
      const t0 = Date.now()
      try {
        const r = await fetch(url, { headers: auth, signal: AbortSignal.timeout(20000) })
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer())
          send({ t: 'frame', d: buf.toString('base64') })
          offlineStreak = 0
        } else if (r.status === 503) {
          send({ t: 'offline' })
          offlineStreak++
          // Le tel est injoignable : on ralentit fort au lieu de marteler.
          await sleep(1500)
          if (offlineStreak >= 4) break // 4 échecs d'affilée → on rend la main
        } else {
          send({ t: 'err', s: r.status })
          await sleep(800)
        }
      } catch (e) {
        send({ t: 'err', s: 0, m: (e && e.message) ? e.message : String(e) })
        await sleep(800)
      }
      const elapsed = Date.now() - t0
      if (elapsed < gap) await sleep(gap - elapsed)
    }
  } finally {
    if (!closed) { send({ t: 'end' }); try { res.end() } catch { /* ignore */ } }
  }
}
