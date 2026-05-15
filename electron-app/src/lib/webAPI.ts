// ── Web API polyfill ─────────────────────────────────────────────────────────
// Replaces window.electronAPI when the app runs in a browser (Vercel/web).
// Each method mirrors its Electron IPC counterpart exactly.

// In-memory store for File objects picked by the user (keyed by blob URL)
const fileStore = new Map<string, File>()

function storeFile(file: File): string {
  const url = URL.createObjectURL(file)
  fileStore.set(url, file)
  // Register in the global blob registry so ffmpeg-web writeInput() can use
  // FileReader (COEP-immune) instead of fetch/XHR which fail under require-corp.
  const w = window as any
  if (!w.__ffmpegBlobReg) w.__ffmpegBlobReg = new Map()
  w.__ffmpegBlobReg.set(url, file)
  return url
}

export function getStoredFile(url: string): File | undefined {
  return fileStore.get(url)
}

// Trigger a native file picker and resolve with a blob URL (or null if cancelled)
function pickFile(accept: string, multiple = false): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      resolve(storeFile(file))
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

async function fetchFileBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const r = await fetch(url)
    return new Uint8Array(await r.arrayBuffer())
  }
  const r = await fetch(url)
  return new Uint8Array(await r.arrayBuffer())
}

// ── Build the web electronAPI object ────────────────────────────────────────
export function buildWebAPI() {
  return {

    // ── GéeLark proxy ──────────────────────────────────────────────────────
    async geelarkRequest(opts: {
      method: string; url: string; headers?: Record<string, string>
      body?: unknown; isText?: boolean
    }) {
      let r: Response
      try {
        r = await fetch('/api/gx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts),
        })
      } catch (fetchErr) {
        return { ok: false, error: `Réseau : ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}` }
      }
      const text = await r.text().catch(() => '')
      if (!text) return { ok: false, error: `Erreur serveur (HTTP ${r.status}) — réponse vide` }
      try {
        return JSON.parse(text)
      } catch {
        // Vercel returned an HTML error page — show status + first 120 chars
        return { ok: false, error: `Erreur serveur (HTTP ${r.status}) : ${text.replace(/<[^>]+>/g, '').trim().slice(0, 120)}` }
      }
    },

    // ── Instagram session check ────────────────────────────────────────────
    async fetchInstagramBySession(opts: { username: string; sessionid: string }) {
      const r = await fetch('/api/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      try { return await r.json() } catch { return { ok: false, error: `Erreur serveur (HTTP ${r.status})` } }
    },

    // ── Instagram HTML profile (web fallback) ──────────────────────────────
    async fetchInstagramHtml(username: string) {
      const r = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.instagram.com/${username}/`, isText: true }),
      })
      try { return await r.json() } catch { return { ok: false, error: `Erreur serveur (HTTP ${r.status})` } }
    },

    // ── IG comments ────────────────────────────────────────────────────────
    async fetchIgComments(opts: { mediaId: string; sessionid: string; maxId?: string }) {
      const params = new URLSearchParams({ sessionid: opts.sessionid, media_id: opts.mediaId })
      if (opts.maxId) params.set('max_id', opts.maxId)
      const r = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://i.instagram.com/api/v1/media/${opts.mediaId}/comments/?${params}`,
          headers: {
            Cookie: `sessionid=${opts.sessionid}`,
            'X-IG-App-ID': '936619743392459',
          },
        }),
      })
      try { return await r.json() } catch { return { ok: false, error: `Erreur serveur (HTTP ${r.status})` } }
    },

    // ── Post IG comment ────────────────────────────────────────────────────
    async postIgComment(opts: { mediaId: string; text: string; sessionid: string }) {
      const r = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url:    `https://i.instagram.com/api/v1/media/${opts.mediaId}/comment/`,
          method: 'POST',
          headers: {
            Cookie: `sessionid=${opts.sessionid}`,
            'X-IG-App-ID': '936619743392459',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `comment_text=${encodeURIComponent(opts.text)}`,
        }),
      })
      try { return await r.json() } catch { return { ok: false, error: `Erreur serveur (HTTP ${r.status})` } }
    },

    // ── Groq ───────────────────────────────────────────────────────────────
    async groqRequest(opts: {
      apiKey: string; model?: string; messages: unknown[]
      temperature?: number; maxTokens?: number
    }) {
      const r = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      try { return await r.json() } catch { return { ok: false, error: `Erreur serveur (HTTP ${r.status})` } }
    },

    // ── Anthropic Vision ───────────────────────────────────────────────────
    async anthropicVisionRequest(opts: {
      apiKey: string; model?: string; messages: unknown[]; maxTokens?: number
    }) {
      const r = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      try { return await r.json() } catch { return { ok: false, error: `Erreur serveur (HTTP ${r.status})` } }
    },

    // ── Fetch image as base64 data URL ──────────────────────────────────────
    async fetchImage(opts: { url: string; headers?: Record<string, string> }) {
      const r = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: opts.url, headers: opts.headers }),
      })
      try { return await r.json() } catch { return { ok: false, error: `Erreur serveur (HTTP ${r.status})` } }
    },

    // ── Fetch IG video URL ─────────────────────────────────────────────────
    async fetchIgVideo(opts: { url: string }) {
      const r = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: opts.url }),
      })
      try { return await r.json() } catch { return { ok: false, error: `Erreur serveur (HTTP ${r.status})` } }
    },

    // ── File pickers ───────────────────────────────────────────────────────
    async pickVideoFile() {
      return pickFile('video/mp4,video/mov,video/avi,video/mkv,video/webm,.mp4,.mov,.avi,.mkv,.webm')
    },

    async pickOutputFile(opts?: { defaultName?: string }) {
      // In the browser we can't pick a save location — return a virtual path.
      // The calling code should use the blob URL returned by FFmpeg instead.
      void opts
      return `web-output-${Date.now()}.mp4`
    },

    async pickOutputFolder() {
      return 'web-downloads'
    },

    async pickAnyFile(opts?: { filters?: Array<{ name: string; extensions: string[] }> }) {
      const accept = opts?.filters
        ?.flatMap(f => f.extensions.map(e => `.${e}`))
        .join(',') ?? '*'
      return pickFile(accept)
    },

    // ── File I/O ───────────────────────────────────────────────────────────
    async readFileBytes(filePath: string) {
      try {
        const bytes = await fetchFileBytes(filePath)
        return { ok: true, bytes: Array.from(bytes) }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },

    async readLocalVideo(filePath: string) {
      // filePath is already a blob URL in web mode
      return { ok: true, url: filePath }
    },

    async writeTempFile(opts: { name: string; bytes: ArrayBuffer }) {
      const blob = new Blob([opts.bytes])
      const url = URL.createObjectURL(blob)
      return { ok: true, path: url }
    },

    // ── Video metadata ─────────────────────────────────────────────────────
    async readVideoMetadata(opts: { filePath: string }) {
      const { readVideoMetadataWeb } = await import('./ffmpeg-web')
      return readVideoMetadataWeb(opts.filePath)
    },

    // ── Upload video to GéeLark ─────────────────────────────────────────────
    async uploadVideoGeelark(opts: { bearer: string; filePath: string }) {
      try {
        // Extract storage path from Supabase signed URL or use as-is
        const supabaseMatch = opts.filePath.match(/\/object\/sign\/([^/?]+)\/(.+?)(?:\?|$)/)
        if (supabaseMatch) {
          // Route through server-side proxy (avoids browser CORS + memory issues)
          const r = await fetch('/api/geelark-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storagePath: decodeURIComponent(supabaseMatch[2]),
              bucket: supabaseMatch[1],
              bearer: opts.bearer,
            }),
          })
          return await r.json() as { ok: boolean; token?: string; error?: string }
        }

        // Fallback: blob/data URL — load in browser and upload directly
        const bytes = await fetchFileBytes(opts.filePath)
        const ext = opts.filePath.split('.').pop()?.toLowerCase() ?? 'mp4'

        const urlRes = await fetch('/api/gx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'POST',
            url: 'https://openapi.geelark.com/open/v1/upload/getUrl',
            headers: { Authorization: `Bearer ${opts.bearer}` },
            body: { fileType: ext },
          }),
        })
        const urlData = await urlRes.json() as Record<string, unknown>
        if (!urlData.ok) return { ok: false, error: 'Upload URL failed' }
        const payload = (urlData.data as Record<string, unknown>)
        const apiResp = payload?.['data'] as Record<string, unknown>
        if (!apiResp) return { ok: false, error: 'No upload data from GéeLark' }
        const uploadUrl = apiResp['uploadUrl'] as string
        const token     = apiResp['token'] as string
        if (!uploadUrl || !token) return { ok: false, error: 'Missing uploadUrl or token' }

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/mp4' },
          body: bytes.buffer as ArrayBuffer,
        })
        if (!putRes.ok) return { ok: false, error: `S3 PUT failed: ${putRes.status}` }

        return { ok: true, token }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },

    // ── FFmpeg operations (delegate to ffmpeg.wasm) ─────────────────────────
    async runFfmpeg(opts: unknown) {
      const { runFfmpegWeb } = await import('./ffmpeg-web')
      return runFfmpegWeb(opts as Parameters<typeof runFfmpegWeb>[0])
    },

    async detectSceneChange(opts: unknown) {
      const { detectSceneChangeWeb } = await import('./ffmpeg-web')
      return detectSceneChangeWeb(opts as Parameters<typeof detectSceneChangeWeb>[0])
    },

    async runFfmpegRemix(opts: unknown) {
      const { runFfmpegRemixWeb } = await import('./ffmpeg-web')
      return runFfmpegRemixWeb(opts as Parameters<typeof runFfmpegRemixWeb>[0])
    },

    async runFfmpegRemixAI(opts: unknown) {
      const { runFfmpegRemixAIWeb } = await import('./ffmpeg-web')
      return runFfmpegRemixAIWeb(opts as Parameters<typeof runFfmpegRemixAIWeb>[0])
    },

    async runFfmpegMetadata(opts: unknown) {
      const { runFfmpegMetadataWeb } = await import('./ffmpeg-web')
      return runFfmpegMetadataWeb(opts as Parameters<typeof runFfmpegMetadataWeb>[0])
    },

    async extractFrames(opts: unknown) {
      const { extractFramesWeb } = await import('./ffmpeg-web')
      return extractFramesWeb(opts as Parameters<typeof extractFramesWeb>[0])
    },
  }
}

export type WebAPI = ReturnType<typeof buildWebAPI>
