import { app, BrowserWindow, shell, ipcMain, net, dialog, session, protocol } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync, readFileSync, createReadStream, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import https from 'node:https'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Custom protocol `localvideo://` for serving local video files to <video> tags.
// MUST be registered as privileged BEFORE app.ready, with stream:true so that
// byte-range requests (video seeking/preview) work correctly.
// Without this, video elements would fire onError when trying to load files.
// ─────────────────────────────────────────────────────────────────────────────
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'localvideo',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
])

// ── Instagram persistent hidden browser ───────────────────────────────────────
let _igBrowser: BrowserWindow | null = null

function getIgBrowser(): BrowserWindow {
  if (!_igBrowser || _igBrowser.isDestroyed()) {
    _igBrowser = new BrowserWindow({
      show: false, width: 1280, height: 900,
      webPreferences: { nodeIntegration: false, contextIsolation: false, webSecurity: true, sandbox: false },
    })
    _igBrowser.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )
    _igBrowser.on('closed', () => { _igBrowser = null })
  }
  return _igBrowser
}

// Fetch Instagram profile HTML.
// Strategy: try the web_profile_info JSON API first (fast, uses session cookies from the
// hidden browser so it works after the first browser visit). Fall back to loading the
// full profile page in the hidden browser (slower, handles GDPR consent automatically).
ipcMain.handle('fetch-instagram-html', async (_event, username: string) => {
  const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`

  // ── Fast path: API call with session cookies ──────────────────────────────
  // session.defaultSession.fetch() automatically sends all instagram.com cookies
  // (csrftoken, ig_did, etc.) set by the hidden browser. net.fetch does NOT do this.
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: '.instagram.com' })
    const csrftoken = cookies.find(c => c.name === 'csrftoken')?.value

    if (csrftoken) {
      console.log('[IG] Trying API with session cookies...')
      const apiRes = await session.defaultSession.fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'X-IG-App-ID': '936619743392459',
            'X-CSRFToken': csrftoken,
            'Accept': '*/*',
          },
        }
      )
      console.log(`[IG] API status: ${apiRes.status}`)
      if (apiRes.ok) {
        const json = await apiRes.json() as Record<string, unknown>
        return { ok: true, apiJson: json }
      }
      if (apiRes.status === 401) {
        // Session expired/rate-limited — clear cookies so browser slow-path starts fresh
        console.log('[IG] 401 — clearing session, falling back to browser')
        const all = await session.defaultSession.cookies.get({ domain: '.instagram.com' })
        await Promise.all(all.flatMap(c => [
          session.defaultSession.cookies.remove('https://www.instagram.com', c.name),
          session.defaultSession.cookies.remove('https://instagram.com', c.name),
        ]))
        if (_igBrowser && !_igBrowser.isDestroyed()) { _igBrowser.destroy(); _igBrowser = null }
        // Fall through to browser slow-path below (do NOT return here)
      }
    }
  } catch (e) {
    console.log('[IG] API fast-path failed:', String(e))
  }

  // ── Slow path: full browser page load ────────────────────────────────────
  // Handles GDPR cookie consent automatically, then extracts HTML.
  const browser = getIgBrowser()

  return new Promise<unknown>(resolve => {
    let settled = false
    let loadCount = 0

    const finish = (result: unknown) => {
      if (settled) return
      settled = true
      browser.webContents.removeListener('did-stop-loading', onLoad)
      clearTimeout(globalTimer)
      resolve(result)
    }

    const globalTimer = setTimeout(() => {
      console.log('[IG] Browser timeout')
      finish({ ok: false, error: 'timeout' })
    }, 35000)

    const extractHtml = async () => {
      if (settled || browser.isDestroyed()) return
      try {
        const data = await browser.webContents.executeJavaScript(`({
          url: location.href,
          html: document.documentElement.innerHTML.slice(0, 200000)
        })`)
        const d = data as { url: string; html: string }
        console.log(`[IG] Extracted from ${d.url} (${d.html.length} chars)`)
        finish({ ok: true, ...d })
      } catch (e) {
        finish({ ok: false, error: String(e) })
      }
    }

    const onLoad = async () => {
      if (settled || browser.isDestroyed()) return
      loadCount++
      if (loadCount > 6) { finish({ ok: false, error: 'too many navigations' }); return }

      await new Promise(r => setTimeout(r, 2500))
      if (settled || browser.isDestroyed()) return

      const currentUrl = browser.webContents.getURL()
      console.log(`[IG] Browser load ${loadCount}: ${currentUrl}`)

      if (currentUrl.includes('/accounts/login') || currentUrl.includes('/challenge/')) {
        console.log('[IG] Login/challenge page — giving up')
        finish({ ok: false, error: 'login required' })
        return
      }

      // Accept GDPR cookie consent if shown
      const accepted = await browser.webContents.executeJavaScript(`
        (() => {
          const byAttr = document.querySelector('[data-cookiebanner="accept_button"]')
            || document.querySelector('[data-testid="cookie-policy-manage-dialog-accept-button"]')
          if (byAttr) { byAttr.click(); return true }
          const btn = [...document.querySelectorAll('button')].find(b => {
            const t = (b.textContent || '').trim().toLowerCase()
            return t === 'allow all cookies' || t === 'allow all' || t === 'accept all'
              || t === 'autoriser tout' || t === 'tout accepter'
              || t === 'autoriser tous les cookies'
              || t === 'allow essential and optional cookies'
          })
          if (btn) { btn.click(); return true }
          return false
        })()
      `).catch(() => false)

      if (accepted) {
        console.log('[IG] Consent clicked — waiting for page update')
        // Give Instagram time to reload (or update in-place). The next did-stop-loading
        // will call onLoad again if a full navigation happens.
        await new Promise(r => setTimeout(r, 5000))
        if (settled) return

        // Check where we ended up
        const afterUrl = browser.webContents.getURL()
        console.log(`[IG] After consent: ${afterUrl}`)

        if (!afterUrl.includes(`/${username}`)) {
          // Consent redirected us to homepage — navigate back to the profile
          console.log('[IG] Redirected away, navigating back to profile')
          browser.loadURL(profileUrl)
          return
        }
        // Page updated in-place — extract now
        await extractHtml()
      } else {
        // No consent button — check we're on the right page
        if (!currentUrl.includes(`/${username}`)) {
          console.log('[IG] Wrong page, navigating to profile')
          browser.loadURL(profileUrl)
          return
        }
        await extractHtml()
      }
    }

    browser.webContents.on('did-stop-loading', onLoad)
    browser.loadURL(profileUrl, {
      extraHeaders: [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8',
      ].join('\r\n'),
    }).catch(err => finish({ ok: false, error: String(err) }))
  })
})


// ── Helper for session-authenticated IG requests via Node.js https ───────────
function igSessionFetch(url: string, sessionid: string, method = 'GET', body?: string): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const reqOpts: import('node:https').RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'User-Agent': 'Instagram 269.0.0.18.75 Android (28/9; 240dpi; 1080x1920; samsung; SM-G960F; starlte; qcom; en_US; 314665256)',
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '198387',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Cookie': `sessionid=${sessionid}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(Buffer.byteLength(body)) } : {}),
      },
    }
    const req = https.request(reqOpts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8')
          // Preserve large integers (Instagram IDs are 19 digits) as strings before JSON.parse
          const safe = raw.replace(/:(\s*)(\d{16,})/g, ':$1"$2"')
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(safe) })
        } catch { resolve({ status: res.statusCode ?? 0, data: null }) }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')) })
    if (body) req.write(body)
    req.end()
  })
}

ipcMain.handle('fetch-instagram-by-session', async (_event, opts: { username: string; sessionid: string }) => {
  try {
    // 1. Get current user ID — try multiple endpoints for reliability
    let userId: string | number | null = null

    // Attempt A: /accounts/current_user/ (no ?edit=true avoids 403 on restricted accounts)
    const curR = await igSessionFetch('https://i.instagram.com/api/v1/accounts/current_user/', opts.sessionid)
    if (curR.status === 401) return { ok: false, error: 'session_expired' }
    if (curR.status === 200 && curR.data) {
      userId = (((curR.data as Record<string, unknown>)['user']) as Record<string, unknown> | undefined)?.['pk'] as string | number | null ?? null
    }

    // Attempt B: web_profile_info by username (public-ish, works when current_user 403s)
    if (!userId) {
      const profR = await igSessionFetch(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(opts.username)}`,
        opts.sessionid
      )
      if (profR.status === 200 && profR.data) {
        const pUser = ((((profR.data as Record<string, unknown>)['data'] as Record<string, unknown>)?.['user']) as Record<string, unknown> | undefined)
        userId = pUser?.['id'] as string | number | null ?? null
      }
    }

    if (!userId) return { ok: false, error: 'could_not_get_user_id' }

    // 2. Get user details (followers, etc.)
    const infoR = await igSessionFetch(`https://i.instagram.com/api/v1/users/${userId}/info/`, opts.sessionid)
    let followers = 0, following = 0, posts = 0, bio = ''
    if (infoR.status === 200 && infoR.data) {
      const u = ((infoR.data as Record<string, unknown>)['user']) as Record<string, unknown> | undefined
      if (u) {
        followers = (u['follower_count'] as number) ?? 0
        following = (u['following_count'] as number) ?? 0
        posts     = (u['media_count'] as number) ?? 0
        bio       = (u['biography'] as string) ?? ''
      }
    }

    // 3. Get reels/clips with thumbnails and view counts
    const clipsR = await igSessionFetch(
      'https://i.instagram.com/api/v1/clips/user/',
      opts.sessionid,
      'POST',
      `target_user_id=${userId}&page_size=20&include_feed_video=true`
    )
    const videos: Array<{ id: string; shortcode: string; views: number; likes: number; comments: number; thumbnail: string; timestamp: string }> = []
    if (clipsR.status === 200 && clipsR.data) {
      const items = ((clipsR.data as Record<string, unknown>)['items'] as unknown[]) ?? []
      for (const item of items) {
        const media = ((item as Record<string, unknown>)['media']) as Record<string, unknown> | undefined
        if (!media) continue
        const candidates = (((media['image_versions2'] as Record<string, unknown>)?.['candidates']) as Array<Record<string, unknown>>) ?? []
        videos.push({
          id:        String(media['pk'] ?? ''),
          shortcode: (media['code'] as string) ?? '',
          views:     (media['play_count'] as number) ?? (media['view_count'] as number) ?? 0,
          likes:     (media['like_count'] as number) ?? 0,
          comments:  (media['comment_count'] as number) ?? 0,
          thumbnail: (candidates[0]?.['url'] as string) ?? '',
          timestamp: media['taken_at'] ? new Date((media['taken_at'] as number) * 1000).toISOString() : '',
        })
      }
    }

    // Pre-fetch thumbnails as base64 in the main process so renderer never
    // needs a separate cross-origin request (CDN URLs are fresh right now).
    await Promise.all(videos.map(v => new Promise<void>(resolve => {
      if (!v.thumbnail) { resolve(); return }
      const url = v.thumbnail
      const fetchThumb = (thumbUrl: string, depth: number) => {
        https.get(thumbUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': 'https://www.instagram.com/',
            'Cookie': `sessionid=${opts.sessionid}`,
          },
        }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 3) {
            res.destroy()
            fetchThumb(res.headers.location, depth + 1)
            return
          }
          const chunks2: Buffer[] = []
          res.on('data', (c: Buffer) => chunks2.push(c))
          res.on('end', () => {
            if (res.statusCode === 200) {
              const ct = res.headers['content-type'] ?? 'image/jpeg'
              v.thumbnail = `data:${ct};base64,${Buffer.concat(chunks2).toString('base64')}`
            }
            resolve()
          })
          res.on('error', () => resolve())
        }).on('error', () => resolve())
      }
      fetchThumb(url, 0)
    })))

    return {
      ok: true,
      username: opts.username,
      followers,
      following,
      posts,
      bio,
      total_views: videos.reduce((s, v) => s + v.views, 0),
      videos,
    }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: proxy HTTP requests from renderer (bypass CORS) ───────────────────
// For instagram.com: use session.defaultSession.fetch() which automatically sends
// session cookies (set by the hidden browser). net.fetch does NOT forward session
// cookies, causing Instagram API calls to get 401 responses.
// For other domains (GéeLark, Groq): use net.fetch with no-referrer policy.
ipcMain.handle('geelark-request', async (_event, opts: {
  method: 'GET' | 'POST' | 'PUT'
  url: string
  headers?: Record<string, string>
  body?: unknown
  isText?: boolean
}) => {
  try {
    const { Referer: _r, referer: _r2, Origin: _o, origin: _o2, ...safeHeaders } = opts.headers ?? {}
    const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...safeHeaders }
    const reqBody = opts.body ? JSON.stringify(opts.body) : undefined

    let response: Response
    if (opts.url.includes('instagram.com')) {
      // session.fetch always sends cookies → works with Instagram's auth requirements
      response = await session.defaultSession.fetch(opts.url, {
        method: opts.method,
        headers: reqHeaders,
        body: reqBody,
      })
    } else {
      response = await net.fetch(opts.url, {
        method: opts.method,
        headers: reqHeaders,
        body: reqBody,
        referrerPolicy: 'no-referrer',
      } as RequestInit)
    }

    const data = opts.isText ? await response.text() : await response.json()
    return { ok: true, status: response.status, data }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: open native file picker ────────────────────────────────────────────
ipcMain.handle('pick-video-file', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: 'Sélectionner une vidéo',
    filters: [{ name: 'Vidéos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// ── IPC: upload local video file to GéeLark ─────────────────────────────────
// Steps: 1) get upload URL from GéeLark, 2) PUT file bytes to URL, 3) return token
ipcMain.handle('upload-video-geelark', async (_event, opts: {
  bearer: string
  filePath: string
}) => {
  try {
    // Step 1: get presigned upload URL
    const urlRes = await net.fetch('https://openapi.geelark.com/open/v1/upload/getUrl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.bearer}`,
      },
      body: JSON.stringify({ fileType: 1 }),
    })
    const urlData = await urlRes.json() as Record<string, unknown>
    if (urlData['code'] !== 0) {
      const msg = urlData['msg'] ?? urlData['message'] ?? `code ${urlData['code']}`
      return { ok: false, error: `GéeLark upload URL: ${msg}` }
    }
    const uploadUrl = (urlData['data'] as Record<string, unknown>)?.['url'] as string
    const token     = (urlData['data'] as Record<string, unknown>)?.['token'] as string
    if (!uploadUrl || !token) return { ok: false, error: 'Réponse upload GéeLark invalide' }

    // Step 2: read file and PUT to presigned URL
    const fileBytes = readFileSync(opts.filePath)
    const uploadRes = await net.fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: fileBytes,
    })
    if (uploadRes.status < 200 || uploadRes.status >= 300) {
      return { ok: false, error: `Upload échoué (HTTP ${uploadRes.status})` }
    }

    return { ok: true, token }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: run FFmpeg montage ──────────────────────────────────────────────────
// Builds a concat + scale filter and runs ffmpeg.
// Returns { ok, outputPath } or { ok: false, error, command }
ipcMain.handle('run-ffmpeg', async (_event, opts: {
  clips:      Array<{ filePath: string; trimStart: number; trimEnd: number }>
  outputPath: string
  preset:     '9:16' | '1:1' | '16:9'
  transition: 'cut' | 'fade'
}) => {
  // Detect ffmpeg binary
  const ffmpegBin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

  const scale = opts.preset === '9:16'  ? 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black'
              : opts.preset === '1:1'   ? 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:-1:-1:color=black'
              :                           'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black'

  // Build input args + filtergraph
  const inputs: string[] = []
  const filterParts: string[] = []
  const n = opts.clips.length

  opts.clips.forEach((c, i) => {
    const end = c.trimEnd > 0 ? c.trimEnd : 999999
    inputs.push('-ss', String(c.trimStart), '-to', String(end), '-i', c.filePath)
    filterParts.push(`[${i}:v]${scale},setsar=1[v${i}];[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`)
  })

  const concatIn = opts.clips.map((_, i) => `[v${i}][a${i}]`).join('')
  filterParts.push(`${concatIn}concat=n=${n}:v=1:a=1[vout][aout]`)

  const args = [
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', opts.outputPath,
  ]

  const command = `ffmpeg ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`

  return new Promise(resolve => {
    execFile(ffmpegBin, args, { maxBuffer: 100 * 1024 * 1024 }, (err) => {
      if (err) {
        // If ffmpeg not found, return the command so user can run it manually
        resolve({ ok: false, error: err.message, command })
      } else {
        resolve({ ok: true, outputPath: opts.outputPath, command })
      }
    })
  })
})

// ── IPC: pick output file path ───────────────────────────────────────────────
ipcMain.handle('pick-output-file', async (_event, opts: { defaultName: string }) => {
  if (!win) return null
  const result = await dialog.showSaveDialog(win, {
    title: 'Enregistrer le montage',
    defaultPath: opts.defaultName,
    filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }],
  })
  return result.canceled ? null : result.filePath
})

// ── IPC: fetch image as base64 data URL ──────────────────────────────────────
// Uses Node.js https.get directly — bypasses Electron's network service entirely,
// avoiding the cross-origin Referer restriction that blocked CDN thumbnail loading.
function collectImage(
  res: import('node:http').IncomingMessage,
  resolve: (v: { ok: boolean; dataUrl?: string; error?: string }) => void
) {
  if (res.statusCode !== 200) { resolve({ ok: false, error: `HTTP ${res.statusCode}` }); res.destroy(); return }
  const ct = String(res.headers['content-type'] ?? 'image/jpeg')
  if (!ct.startsWith('image/') && !ct.includes('octet-stream')) {
    resolve({ ok: false, error: `Not an image: ${ct}` }); res.destroy(); return
  }
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => {
    const b64 = Buffer.concat(chunks).toString('base64')
    resolve({ ok: true, dataUrl: `data:${ct};base64,${b64}` })
  })
  res.on('error', (e: Error) => resolve({ ok: false, error: e.message }))
}

ipcMain.handle('fetch-image', async (_event, opts: { url: string; headers?: Record<string, string> }) => {
  // Use Node.js https.get for all image fetches — it sends exactly the headers we
  // provide with no interference from Electron's session cookie store, and it follows
  // redirects properly. Instagram CDN URLs (fbcdn.net / cdninstagram.com) are
  // pre-signed so they don't need session cookies; the sessionid header is only
  // needed for API calls, not for CDN image downloads.
  return new Promise<{ ok: boolean; dataUrl?: string; error?: string }>(resolve => {
    const baseHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': 'https://www.instagram.com/',
      ...(opts.headers ?? {}),
    }
    const fetchUrl = (url: string, hdrs: Record<string, string>, depth = 0) => {
      const req = https.get(url, { headers: hdrs }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 3) {
          res.destroy()
          fetchUrl(res.headers.location, hdrs, depth + 1)
          return
        }
        collectImage(res, resolve)
      })
      req.on('error', (e) => resolve({ ok: false, error: e.message }))
      req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }) })
    }
    fetchUrl(opts.url, baseHeaders)
  })
})

// ── IPC: Groq API call (proxy to avoid CORS) ────────────────────────────────
ipcMain.handle('groq-request', async (_event, opts: {
  apiKey: string
  messages: Array<{ role: string; content: string }>
  model?: string
  maxTokens?: number
}) => {
  try {
    const response = await net.fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model:      opts.model ?? 'llama-3.3-70b-versatile',
        messages:   opts.messages,
        max_tokens: opts.maxTokens ?? 400,
      }),
    })
    const data = await response.json()
    return { ok: true, data }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: fetch Instagram comments for a media ID ─────────────────────────────
ipcMain.handle('fetch-ig-comments', async (_event, opts: { mediaId: string; sessionid: string; maxId?: string }) => {
  try {
    let url = `https://i.instagram.com/api/v1/media/${opts.mediaId}/comments/?can_support_threading=true&permalink_enabled=false`
    if (opts.maxId) url += `&max_id=${opts.maxId}`
    const res = await igSessionFetch(url, opts.sessionid)
    if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` }
    const data = res.data as Record<string, unknown>
    const rawComments = (data['comments'] as Array<Record<string, unknown>>) ?? []
    const comments = rawComments.map(c => ({
      pk:        String(c['pk'] ?? ''),
      text:      String(c['text'] ?? ''),
      username:  String((c['user'] as Record<string, unknown>)?.['username'] ?? ''),
      timestamp: c['created_at'] ? new Date((c['created_at'] as number) * 1000).toISOString() : '',
      likeCount: (c['comment_like_count'] as number) ?? 0,
    }))
    return { ok: true, comments, hasMore: !!(data['next_max_id']) }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: post a comment on an Instagram media ─────────────────────────────────
ipcMain.handle('post-ig-comment', async (_event, opts: { mediaId: string; text: string; sessionid: string }) => {
  try {
    const res = await igSessionFetch(
      `https://i.instagram.com/api/v1/media/${opts.mediaId}/comment/`,
      opts.sessionid,
      'POST',
      `comment_text=${encodeURIComponent(opts.text)}`
    )
    if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#080b14',
    show: false,
    webPreferences: {
      preload: (() => {
        const p = path.join(__dirname, 'preload.mjs')
        if (existsSync(p)) return p
        const p2 = path.join(__dirname, 'preload.js')
        return existsSync(p2) ? p2 : undefined
      })(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Allow file:// URLs in <video>/<img> regardless of renderer origin (dev = localhost).
      // Safe for a local desktop app — the renderer never loads untrusted external content.
      webSecurity: false,
    },
    titleBarStyle: 'default',
    frame: true,
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => { win?.show(); win?.maximize() })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ── IPC: read a local file and return as a data URL (fallback for previews) ──
// Used when the <video> element fails to load via localvideo:// protocol.
// Limited to first 25 MB (enough for the first frames to render a thumbnail).
ipcMain.handle('read-local-video', async (_event, filePath: string) => {
  try {
    if (!existsSync(filePath)) return { ok: false, error: 'not found' }
    const stat = statSync(filePath)
    const MAX = 25 * 1024 * 1024
    const ext = path.extname(filePath).toLowerCase()
    const mime =
      ext === '.mp4'  ? 'video/mp4'  :
      ext === '.mov'  ? 'video/quicktime' :
      ext === '.webm' ? 'video/webm' :
      ext === '.mkv'  ? 'video/x-matroska' :
      ext === '.avi'  ? 'video/x-msvideo' :
      'video/mp4'
    if (stat.size > MAX) {
      // Read only first MAX bytes — enough for the first frame thumbnail
      return new Promise<{ ok: boolean; dataUrl?: string; error?: string }>(resolve => {
        const chunks: Buffer[] = []
        const stream = createReadStream(filePath, { start: 0, end: MAX - 1 })
        stream.on('data', c => chunks.push(c as Buffer))
        stream.on('end', () => {
          const b64 = Buffer.concat(chunks).toString('base64')
          resolve({ ok: true, dataUrl: `data:${mime};base64,${b64}` })
        })
        stream.on('error', e => resolve({ ok: false, error: e.message }))
      })
    }
    const buf = readFileSync(filePath)
    return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { app.quit(); win = null }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  // Register the localvideo:// protocol handler.
  // Renderer uses URLs like: localvideo:///C:/path/to/video.mp4 (Windows)
  //                          localvideo:///home/user/video.mp4  (Unix)
  // The handler converts to file:// and forwards via net.fetch which preserves
  // byte-range support (stream privilege ensures the browser can seek).
  protocol.handle('localvideo', async (request) => {
    try {
      // request.url = 'localvideo:///C:/path/to/video.mp4'
      const u = new URL(request.url)
      // u.pathname = '/C:/path/to/video.mp4' or '/home/user/...'
      let filePath = decodeURIComponent(u.pathname)
      // On Windows, strip the leading slash so path is C:/...
      if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1)
      }
      if (!existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      const fileUrl = pathToFileURL(filePath).toString()
      // Forward Range header so video seeking works (essential for preview)
      const fwdHeaders = new Headers()
      const range = request.headers.get('range')
      if (range) fwdHeaders.set('range', range)
      return await net.fetch(fileUrl, { headers: fwdHeaders, bypassCustomProtocolHandlers: true })
    } catch (err) {
      console.error('[localvideo]', err)
      return new Response(`Error: ${err}`, { status: 500 })
    }
  })

  createWindow()
})
