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

// ── Wasm FFmpeg mutex ────────────────────────────────────────────────────────
// ffmpeg.wasm uses a single shared wasm instance — running two ff.exec() calls
// concurrently corrupts memory. All wasm FFmpeg operations are serialised here.
let _wasmTail: Promise<void> = Promise.resolve()
function wasmQueue<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void
  const prev = _wasmTail
  _wasmTail = new Promise<void>(r => { release = r })
  return prev.then(fn).then(
    v => { release(); return v },
    e => { release(); throw e },
  )
}

// ── Build the web electronAPI object ────────────────────────────────────────
export function buildWebAPI() {
  console.log('[webAPI] v4f213a5 — upload via SDK Supabase, pas de proxy serveur')
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
        // Step 1: get video bytes — try multiple strategies in order
        let bytes: Uint8Array | null = null

        // Strategy A: direct fetch (works for blob: URLs and signed Supabase URLs)
        try {
          const r = await fetch(opts.filePath)
          if (r.ok) bytes = new Uint8Array(await r.arrayBuffer())
        } catch { /* fall through */ }

        // Strategy B: Supabase SDK download (works when strategy A is blocked by CORS)
        if (!bytes) {
          const m = opts.filePath.match(/\/object\/(?:sign|public)\/([^/?]+)\/(.+?)(?:\?|$)/)
          if (m) {
            try {
              const { supabase } = await import('./supabase')
              const { data, error } = await supabase.storage.from(m[1]).download(decodeURIComponent(m[2]))
              if (!error && data) bytes = new Uint8Array(await data.arrayBuffer())
            } catch { /* fall through */ }
          }
        }

        if (!bytes) return { ok: false, error: 'Impossible de lire la vidéo (CORS ou source introuvable)' }

        // Step 2: get GéeLark presigned upload URL
        const urlRes = await fetch('/api/gx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'POST',
            url: 'https://openapi.geelark.com/open/v1/upload/getUrl',
            headers: { Authorization: `Bearer ${opts.bearer}` },
            body: { fileType: 'mp4' },
          }),
        })
        const urlData = await urlRes.json() as Record<string, unknown>
        if (!urlData.ok) return { ok: false, error: String((urlData as any).error ?? 'GéeLark URL error') }
        const apiResp = ((urlData.data as Record<string, unknown>)?.['data'] ?? urlData.data) as Record<string, unknown>
        const uploadUrl   = apiResp?.['uploadUrl']   as string | undefined
        const resourceUrl = apiResp?.['resourceUrl'] as string | undefined
        const token       = resourceUrl ?? apiResp?.['token'] as string | undefined
        if (!uploadUrl || !token) return { ok: false, error: 'Réponse GéeLark invalide (pas de uploadUrl/resourceUrl)' }

        // Step 3: PUT bytes to GéeLark S3
        let putRes = await fetch(uploadUrl, { method: 'PUT', body: bytes.buffer as ArrayBuffer })
        if (!putRes.ok) {
          putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes.buffer as ArrayBuffer })
        }
        if (!putRes.ok) return { ok: false, error: `S3 PUT échoué: ${putRes.status}` }

        return { ok: true, token }
      } catch (err) {
        return { ok: false, error: `[E000] ${err instanceof Error ? err.message : String(err)}` }
      }
    },

    // ── FFmpeg operations (delegate to ffmpeg.wasm, serialised via wasmQueue) ──
    async runFfmpeg(opts: unknown) {
      return wasmQueue(async () => {
        const { runFfmpegWeb } = await import('./ffmpeg-web')
        return runFfmpegWeb(opts as Parameters<typeof runFfmpegWeb>[0])
      })
    },

    async detectSceneChange(opts: unknown) {
      // Canvas-based — no WASM, no wasmQueue needed
      const { detectSceneChangeWeb } = await import('./ffmpeg-web')
      return detectSceneChangeWeb(opts as Parameters<typeof detectSceneChangeWeb>[0])
    },

    async runFfmpegRemix(opts: unknown) {
      return wasmQueue(async () => {
        const { runFfmpegRemixWeb } = await import('./ffmpeg-web')
        return runFfmpegRemixWeb(opts as Parameters<typeof runFfmpegRemixWeb>[0])
      })
    },

    async runFfmpegRemixAI(opts: unknown) {
      // MediaRecorder fast path doesn't use WASM — no wasmQueue needed.
      // The internal WASM fallback uses withFfmpegLock directly.
      const { runFfmpegRemixAIWeb } = await import('./ffmpeg-web')
      return runFfmpegRemixAIWeb(opts as Parameters<typeof runFfmpegRemixAIWeb>[0])
    },

    async runFfmpegMetadata(opts: unknown) {
      return wasmQueue(async () => {
        const { runFfmpegMetadataWeb } = await import('./ffmpeg-web')
        return runFfmpegMetadataWeb(opts as Parameters<typeof runFfmpegMetadataWeb>[0])
      })
    },

    async extractFrames(opts: unknown) {
      // Canvas-based — no WASM, no wasmQueue needed
      const { extractFramesWeb } = await import('./ffmpeg-web')
      return extractFramesWeb(opts as Parameters<typeof extractFramesWeb>[0])
    },

    async runFfmpegTextOverlay(opts: unknown) {
      return wasmQueue(async () => {
        const { runFfmpegTextOverlayWeb } = await import('./ffmpeg-web')
        return runFfmpegTextOverlayWeb(opts as Parameters<typeof runFfmpegTextOverlayWeb>[0])
      })
    },
  }
}

export type WebAPI = ReturnType<typeof buildWebAPI>
