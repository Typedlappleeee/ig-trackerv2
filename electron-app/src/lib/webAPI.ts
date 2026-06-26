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

// ── GéeLark phone lifecycle safety net (web) ─────────────────────────────────
// On web there is no app-quit hook: if the user closes the tab mid-posting the
// JS just dies and the cloud phones keep running (and billing). We track every
// /phone/start and /phone/stop that flows through geelarkRequest, and on tab
// close we fire a sendBeacon to stop any phone still marked as running.
const _runningPhones = new Set<string>()
let _geelarkBearer = ''
let _unloadGuardInstalled = false

function _ensureUnloadGuard() {
  if (_unloadGuardInstalled || typeof window === 'undefined') return
  _unloadGuardInstalled = true
  const stopOnUnload = () => {
    if (_runningPhones.size === 0 || !_geelarkBearer) return
    const payload = JSON.stringify({
      method: 'POST',
      url: 'https://openapi.geelark.com/open/v1/phone/stop',
      headers: { Authorization: `Bearer ${_geelarkBearer}` },
      body: { ids: [..._runningPhones] },
    })
    try {
      navigator.sendBeacon('/api/gx', new Blob([payload], { type: 'application/json' }))
    } catch { /* best-effort */ }
  }
  // pagehide is the reliable one (fires on tab close + bfcache); keep beforeunload too
  window.addEventListener('pagehide', stopOnUnload)
  window.addEventListener('beforeunload', stopOnUnload)
}

function _trackPhoneCall(url: string, headers: Record<string, string> | undefined, body: unknown) {
  try {
    const isStart = url.includes('/phone/start')
    const isStop  = url.includes('/phone/stop')
    if (!isStart && !isStop) return
    const bearer = (headers?.Authorization ?? headers?.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (bearer) _geelarkBearer = bearer
    const ids: string[] = ((body as { ids?: string[] })?.ids) ?? []
    if (isStart) { ids.forEach(id => _runningPhones.add(id)); _ensureUnloadGuard() }
    else         { ids.forEach(id => _runningPhones.delete(id)) }
  } catch { /* ignore */ }
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
      _trackPhoneCall(opts.url, opts.headers, opts.body)
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
      const V = '[CLIENT-v7]'
      console.log(`${V} uploadVideoGeelark filePath=${opts.filePath.slice(0, 80)}`)
      try {
        // Preferred path: server-side proxy (/api/geelark-upload) does
        // download + getUrl + PUT entirely côté serveur — pas de CORS.
        // Works whenever the source is an https URL (Supabase signed/public URL).
        if (/^https?:\/\//.test(opts.filePath)) {
          try {
            const r = await fetch('/api/geelark-upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signedUrl: opts.filePath, bearer: opts.bearer }),
            })
            const j = await r.json() as { ok: boolean; token?: string; error?: string }
            if (j.ok && j.token) return { ok: true, token: j.token }
            // Server reachable but upload failed — report its error directly
            if (j.error) return { ok: false, error: j.error }
          } catch { /* serveur indisponible — bascule sur le flux client ci-dessous */ }
        }

        // Fallback client-side (blob: URLs, ou proxy serveur indisponible)
        // Step 1: get video bytes — try multiple strategies in order
        let bytes: Uint8Array | null = null
        try {
          const r = await fetch(opts.filePath)
          if (r.ok) {
            bytes = new Uint8Array(await r.arrayBuffer())
            console.log(`${V} [B] fetch ok, ${bytes.length} bytes`)
          } else {
            console.warn(`${V} [B] fetch HTTP ${r.status}`)
          }
        } catch (e) {
          console.warn(`${V} [B] fetch exception: ${e}`)
        }

        if (!bytes) {
          return { ok: false, error: `${V}[E001] Impossible de lire le fichier local` }
        }

        // Step 2: get GéeLark presigned upload URL — reuse geelarkRequest so network
        // errors are caught cleanly instead of bubbling up as uncaught "Failed to fetch"
        const urlData = await this.geelarkRequest({
          method: 'POST',
          url: 'https://openapi.geelark.com/open/v1/upload/getUrl',
          headers: { Authorization: `Bearer ${opts.bearer}` },
          body: { fileType: 'mp4' },
        }) as Record<string, unknown>
        if (!urlData['ok']) return { ok: false, error: String(urlData['error'] ?? 'GéeLark URL error') }
        const apiResp = ((urlData['data'] as Record<string, unknown>)?.['data'] ?? urlData['data']) as Record<string, unknown>
        const uploadUrl   = apiResp?.['uploadUrl']   as string | undefined
        const resourceUrl = apiResp?.['resourceUrl'] as string | undefined
        const token       = resourceUrl ?? apiResp?.['token'] as string | undefined
        if (!uploadUrl || !token) return { ok: false, error: 'Réponse GéeLark invalide (pas de uploadUrl/resourceUrl)' }

        // Step 3: PUT bytes to GéeLark S3 (peut être bloqué par CORS dans le navigateur)
        try {
          let putRes = await fetch(uploadUrl, { method: 'PUT', body: bytes.buffer as ArrayBuffer })
          if (!putRes.ok) {
            putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes.buffer as ArrayBuffer })
          }
          if (!putRes.ok) return { ok: false, error: `S3 PUT échoué: ${putRes.status}` }
        } catch {
          return { ok: false, error: 'Upload S3 bloqué par le navigateur (CORS) — utilisez une vidéo depuis la Banque (Supabase)' }
        }

        console.log(`${V} [OK] upload réussi token=${token.slice(0, 40)}`)
        return { ok: true, token }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
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

    // ── Mixer — burn caption text onto video (web: Vercel /api/mix-overlay) ──────
    async runFfmpegMixOverlay(opts: { sourcePath: string; caption: string; position: 'top' | 'middle' | 'bottom'; fontSize: number; fontColor: string }) {
      try {
        // Pass user's auth token so the server can upload to Supabase as the user
        const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession()
        const r = await fetch('/api/mix-overlay', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            videoUrl:         opts.sourcePath,
            caption:          opts.caption,
            position:         opts.position,
            fontSize:         opts.fontSize,
            fontColor:        opts.fontColor,
            userId:           session?.user?.id,
            supabaseToken:    session?.access_token,
            supabaseAnonKey:  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY,
          }),
        })
        const data = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
        if (!data.ok) return { ok: false as const, error: data.error ?? 'Erreur serveur mix-overlay' }
        return { ok: true as const, outputPath: (data.url ?? data.storagePath) as string, storagePath: data.storagePath as string | undefined }
      } catch (err) {
        return { ok: false as const, error: String(err) }
      }
    },

    // ── Groq Whisper audio transcription (server-side proxy — avoids CORS) ──────
    async groqTranscription(opts: {
      apiKey: string
      audioBytes?: ArrayBuffer  // local file bytes
      videoUrl?:   string       // bank signed URL (fetched server-side, no bytes sent)
      filename: string
      language?: string
    }) {
      try {
        let body: Record<string, unknown>
        if (opts.videoUrl) {
          // URL path: server fetches video directly — no bytes sent from client
          console.log('[webAPI] groqTranscription → videoUrl path:', opts.videoUrl.slice(0, 100))
          body = { apiKey: opts.apiKey, videoUrl: opts.videoUrl, filename: opts.filename, language: opts.language }
        } else if (opts.audioBytes) {
          // Local file: encode as base64 (limited to ~18MB raw / ~25MB base64)
          console.log('[webAPI] groqTranscription → audioBytes path:', (opts.audioBytes.byteLength / 1024 / 1024).toFixed(1), 'MB')
          const u8 = new Uint8Array(opts.audioBytes)
          let bin = ''
          for (let i = 0; i < u8.length; i += 8192)
            bin += String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, u8.length)))
          body = { apiKey: opts.apiKey, audioBase64: btoa(bin), filename: opts.filename, language: opts.language }
        } else {
          return { ok: false, error: 'Aucune source audio' }
        }

        const bodyStr = JSON.stringify(body)
        console.log('[webAPI] groqTranscription → POST /api/groq, body size:', (bodyStr.length / 1024).toFixed(1), 'KB')
        const r = await fetch('/api/groq', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    bodyStr,
        })
        console.log('[webAPI] groqTranscription → réponse HTTP', r.status, r.ok ? 'OK' : 'ERROR')
        if (!r.ok) {
          const txt = await r.text().catch(() => '')
          console.error('[webAPI] groqTranscription → corps réponse erreur:', txt.slice(0, 500))
          return { ok: false, error: `Proxy HTTP ${r.status}` }
        }
        try { return await r.json() } catch { return { ok: false, error: `Proxy HTTP ${r.status}` } }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },

    // ── Subtitle burn via WASM FFmpeg (web fallback) ─────────────────────────
    async runFfmpegSubtitles(opts: {
      sourcePath: string
      segments:   Array<{ text: string; start: number; end: number }>
      fontSize:   number; fontColor: string
      position:   'top' | 'center' | 'bottom'
      style:      'box' | 'outline' | 'shadow'
      preset?:    string
    }) {
      return wasmQueue(async () => {
        const { runFfmpegRemixAIWeb } = await import('./ffmpeg-web')
        const yFrac = opts.position === 'top' ? 0.12 : opts.position === 'center' ? 0.50 : 0.87
        const textOverlays = opts.segments.map(seg => ({
          text:      seg.text,
          x:         '(w-text_w)/2',
          y:         `h*${yFrac}`,
          fontSize:  opts.fontSize,
          fontColor: opts.fontColor,
          startTime: seg.start,
          endTime:   seg.end,
          bold:      true,
          shadow:    opts.style !== 'box',
        }))
        const preset = (opts.preset && opts.preset !== 'keep') ? opts.preset as '9:16' | '1:1' | '16:9' : '9:16'
        return runFfmpegRemixAIWeb({
          newPhase1Path: opts.sourcePath,
          originalPath:  opts.sourcePath,
          splitTime:     0,
          outputPath:    `subs-${Date.now()}.mp4`,
          preset,
          textOverlays,
        })
      })
    },

    // ── Save file (web: browser download) ────────────────────────────────────
    async saveFileAs(opts: { sourcePath: string; defaultName: string }) {
      try {
        const a = document.createElement('a')
        a.href     = opts.sourcePath
        a.download = opts.defaultName
        a.click()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  }
}

export type WebAPI = ReturnType<typeof buildWebAPI>
