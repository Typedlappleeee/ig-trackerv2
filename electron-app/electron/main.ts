import { app, BrowserWindow, shell, ipcMain, net, dialog, session, protocol } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync, readFileSync, createReadStream, statSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import { execFile, spawn } from 'node:child_process'
import https from 'node:https'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// ── FFmpeg binary resolution ──────────────────────────────────────────────────
// Prod (packaged): binary copied to resources/ via extraResources in electron-builder.yml
// Dev: resolve from node_modules/ffmpeg-static using APP_ROOT (set below)
// Falls back to system PATH only if nothing else is found.
function getFfmpegBin(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  const bin = `ffmpeg${ext}`

  if (app.isPackaged) {
    return path.join(process.resourcesPath, bin)
  }

  // Dev: APP_ROOT = electron-app/ directory (set right after this function)
  // node_modules lives there, and ffmpeg-static puts its binary inside it.
  const appRoot = process.env.APP_ROOT ?? path.join(__dirname, '..')
  const candidates = [
    path.join(appRoot, 'node_modules', 'ffmpeg-static', bin),
    path.join(appRoot, '..', 'node_modules', 'ffmpeg-static', bin),
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', bin),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      console.log('[ffmpeg] using:', p)
      return p
    }
  }
  console.warn('[ffmpeg] binary not found in node_modules, falling back to PATH')
  return bin
}
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

// Fetch Instagram profile data via the web_profile_info JSON API.
// Strategy:
//   1. Try the API directly — works if instagram.com cookies already exist in the session.
//   2. If no cookies yet, fetch instagram.com/username/ to get cookies (Set-Cookie),
//      then immediately retry the API. No hidden browser needed for this.
//   3. Hidden browser fallback only if the fetch-based approach gets blocked (rare).
ipcMain.handle('fetch-instagram-html', async (_event, username: string) => {
  const IG_UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  const IG_APP_ID  = '936619743392459'
  const apiUrl     = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
  const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`

  async function getCsrf(): Promise<string | undefined> {
    const cookies = await session.defaultSession.cookies.get({ domain: '.instagram.com' })
    return cookies.find(c => c.name === 'csrftoken')?.value
        ?? cookies.find(c => c.name === 'csrftoken')?.value
  }

  async function callApi(csrftoken: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await session.defaultSession.fetch(apiUrl, {
        headers: {
          'User-Agent':    IG_UA,
          'X-IG-App-ID':  IG_APP_ID,
          'X-CSRFToken':  csrftoken,
          'Referer':      profileUrl,
          'Origin':       'https://www.instagram.com',
          'Accept':       '*/*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
      })
      console.log(`[IG] API ${username}: ${res.status}`)
      if (res.ok) return await res.json() as Record<string, unknown>
      if (res.status === 401 || res.status === 403) {
        // Clear stale cookies so next attempt starts fresh
        const all = await session.defaultSession.cookies.get({ domain: '.instagram.com' })
        await Promise.all(all.flatMap(c => [
          session.defaultSession.cookies.remove('https://www.instagram.com', c.name),
          session.defaultSession.cookies.remove('https://instagram.com', c.name),
        ]))
      }
    } catch (e) { console.log('[IG] callApi error:', String(e)) }
    return null
  }

  // ── Attempt 1: cookies already exist ─────────────────────────────────────
  let csrf = await getCsrf()
  if (csrf) {
    const json = await callApi(csrf)
    if (json) return { ok: true, apiJson: json }
  }

  // ── Attempt 2: seed cookies via a plain fetch of the profile page ─────────
  // session.defaultSession.fetch stores Set-Cookie automatically, no browser needed.
  console.log('[IG] No cookies — seeding via profile page fetch...')
  try {
    await session.defaultSession.fetch(profileUrl, {
      headers: {
        'User-Agent':      IG_UA,
        'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      redirect: 'follow',
    })
  } catch (e) { console.log('[IG] Seed fetch error:', String(e)) }

  csrf = await getCsrf()
  if (csrf) {
    const json = await callApi(csrf)
    if (json) return { ok: true, apiJson: json }
  }

  // ── Attempt 3: seed via homepage (different cookie set) ──────────────────
  console.log('[IG] Trying homepage seed...')
  try {
    await session.defaultSession.fetch('https://www.instagram.com/', {
      headers: {
        'User-Agent':      IG_UA,
        'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    })
  } catch (e) { console.log('[IG] Homepage seed error:', String(e)) }

  csrf = await getCsrf()
  if (csrf) {
    const json = await callApi(csrf)
    if (json) return { ok: true, apiJson: json }
  }

  // ── Attempt 4: hidden browser fallback (handles consent walls) ────────────
  console.log('[IG] All fetch attempts failed — falling back to hidden browser')
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

    const globalTimer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 40000)

    const tryApiThenHtml = async () => {
      if (settled || browser.isDestroyed()) return
      const c = await getCsrf()
      if (c) {
        const json = await callApi(c)
        if (json) { finish({ ok: true, apiJson: json }); return }
      }
      try {
        const data = await browser.webContents.executeJavaScript(
          `({ url: location.href, html: document.documentElement.innerHTML.slice(0, 200000) })`
        )
        finish({ ok: true, ...(data as { url: string; html: string }) })
      } catch (e) { finish({ ok: false, error: String(e) }) }
    }

    const onLoad = async () => {
      if (settled || browser.isDestroyed()) return
      loadCount++
      if (loadCount > 8) { finish({ ok: false, error: 'too many navigations' }); return }
      await new Promise(r => setTimeout(r, 2000))
      if (settled || browser.isDestroyed()) return

      const currentUrl = browser.webContents.getURL()
      if (currentUrl.includes('/accounts/login') || currentUrl.includes('/challenge/')) {
        finish({ ok: false, error: 'login required' }); return
      }

      // Accept GDPR consent if shown
      const accepted = await browser.webContents.executeJavaScript(`
        (() => {
          const byAttr = document.querySelector('[data-cookiebanner="accept_button"]')
            || document.querySelector('[data-testid="cookie-policy-manage-dialog-accept-button"]')
          if (byAttr) { byAttr.click(); return true }
          const btn = [...document.querySelectorAll('button')].find(b => {
            const t = (b.textContent || '').trim().toLowerCase()
            return ['allow all cookies','allow all','accept all','autoriser tout',
                    'tout accepter','autoriser tous les cookies',
                    'allow essential and optional cookies'].includes(t)
          })
          if (btn) { btn.click(); return true }
          return false
        })()
      `).catch(() => false)

      if (accepted) {
        await new Promise(r => setTimeout(r, 4000))
        if (settled) return
        const afterUrl = browser.webContents.getURL()
        if (!afterUrl.includes(`/${username}`)) { browser.loadURL(profileUrl); return }
      } else if (!currentUrl.includes(`/${username}`)) {
        browser.loadURL(profileUrl); return
      }
      await tryApiThenHtml()
    }

    browser.webContents.on('did-stop-loading', onLoad)
    browser.loadURL(profileUrl, {
      extraHeaders: 'Accept: text/html,application/xhtml+xml,*/*;q=0.8\r\nAccept-Language: fr-FR,fr;q=0.9\r\n',
    }).catch(err => finish({ ok: false, error: String(err) }))
  })
})


// ── Helper for session-authenticated IG requests via Node.js https ───────────
// Cache csrftoken per session — Instagram requires it on POST/write actions
const _csrfCache = new Map<string, string>()

function igSessionFetch(
  url: string,
  sessionid: string,
  method = 'GET',
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const csrf = _csrfCache.get(sessionid)
    const cookie = csrf ? `sessionid=${sessionid}; csrftoken=${csrf}` : `sessionid=${sessionid}`
    const reqOpts: import('node:https').RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'User-Agent': 'Instagram 269.0.0.18.75 Android (28/9; 240dpi; 1080x1920; samsung; SM-G960F; starlte; qcom; en_US; 314665256)',
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '198387',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Cookie': cookie,
        ...(csrf ? { 'X-CSRFToken': csrf } : {}),
        ...(extraHeaders ?? {}),
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(Buffer.byteLength(body)) } : {}),
      },
    }
    const req = https.request(reqOpts, (res) => {
      const chunks: Buffer[] = []
      // Auto-extract csrftoken from set-cookie so subsequent writes are authorized
      const setCookieHeader = res.headers['set-cookie'] ?? []
      for (const c of setCookieHeader) {
        const m = c.match(/csrftoken=([^;]+)/)
        if (m && m[1] && m[1] !== 'missing') _csrfCache.set(sessionid, m[1])
      }
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8')
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

// Detect IG "session is dead" responses (login_required, logout_reason, checkpoint)
function isSessionDead(status: number, data: unknown): boolean {
  if (status === 401) return true
  const d = data as Record<string, unknown> | null
  if (!d) return false
  const msg = String(d['message'] ?? '').toLowerCase()
  if (msg === 'login_required') return true
  if (msg === 'checkpoint_required') return true
  if (d['logout_reason']) return true
  return false
}

ipcMain.handle('fetch-instagram-by-session', async (_event, opts: { username: string; sessionid: string }) => {
  try {
    // 1. Get current user ID — try multiple endpoints for reliability
    let userId: string | number | null = null

    // Attempt A: /accounts/current_user/ (no ?edit=true avoids 403 on restricted accounts)
    const curR = await igSessionFetch('https://i.instagram.com/api/v1/accounts/current_user/', opts.sessionid)
    if (isSessionDead(curR.status, curR.data)) return { ok: false, error: 'session_expired' }
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
    const videos: Array<{ id: string; shortcode: string; views: number; likes: number; comments: number; thumbnail: string; video_url: string; timestamp: string }> = []
    if (clipsR.status === 200 && clipsR.data) {
      const items = ((clipsR.data as Record<string, unknown>)['items'] as unknown[]) ?? []
      for (const item of items) {
        const media = ((item as Record<string, unknown>)['media']) as Record<string, unknown> | undefined
        if (!media) continue
        const candidates = (((media['image_versions2'] as Record<string, unknown>)?.['candidates']) as Array<Record<string, unknown>>) ?? []
        // video_versions is sorted high → low quality. Take the first (best).
        const vVersions = (media['video_versions'] as Array<Record<string, unknown>> | undefined) ?? []
        videos.push({
          id:        String(media['pk'] ?? ''),
          shortcode: (media['code'] as string) ?? '',
          views:     (media['play_count'] as number) ?? (media['view_count'] as number) ?? 0,
          likes:     (media['like_count'] as number) ?? 0,
          comments:  (media['comment_count'] as number) ?? 0,
          thumbnail: (candidates[0]?.['url'] as string) ?? '',
          video_url: (vVersions[0]?.['url'] as string) ?? '',
          timestamp: media['taken_at'] ? new Date((media['taken_at'] as number) * 1000).toISOString() : '',
        })
      }
    }

    // Pre-fetch thumbnails as base64 via Electron's net.fetch (Chromium stack)
    // — handles IG CDN TLS, redirects, and pre-signed URLs more reliably than node https.
    let thumbOk = 0, thumbFail = 0
    await Promise.all(videos.map(async v => {
      if (!v.thumbnail) { thumbFail++; return }
      const url = v.thumbnail
      // Strategy: try multiple header sets — CDN sometimes 403s on missing/wrong Referer,
      // sometimes on missing Origin. Walk through fallbacks until one returns 200.
      const headerSets: Array<Record<string, string>> = [
        // 1. Browser-like, with Referer = instagram.com
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.instagram.com/',
          'sec-fetch-dest': 'image',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'cross-site',
        },
        // 2. No Referer (CDN sometimes wants none)
        {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': 'image/*,*/*;q=0.8',
        },
        // 3. Mobile IG app UA
        {
          'User-Agent': 'Instagram 312.0.0.32.116 Android (33/13; 420dpi; 1080x2206; samsung; SM-S911B; dm3q; qcom; en_US; 558678421)',
          'Accept': 'image/*',
        },
      ]
      for (const headers of headerSets) {
        try {
          const res = await net.fetch(url, { method: 'GET', headers, redirect: 'follow' })
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            if (buf.length > 0) {
              const ct = res.headers.get('content-type') ?? 'image/jpeg'
              v.thumbnail = `data:${ct};base64,${buf.toString('base64')}`
              thumbOk++
              return
            }
          }
        } catch (e) { /* try next header set */ }
      }
      console.log('[thumb] all retries failed:', url.slice(0, 100))
      thumbFail++
    }))
    console.log(`[fetch-instagram-by-session] thumbnails: ${thumbOk} ok, ${thumbFail} failed of ${videos.length}`)

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
    const reqBody = opts.body ? JSON.stringify(opts.body) : undefined

    let response: Response
    if (opts.url.includes('instagram.com')) {
      // Keep all headers (including Referer/Origin) for Instagram — they help avoid 403s.
      // Use session.defaultSession.fetch so Instagram cookies are automatically attached.
      const igHeaders: Record<string, string> = { ...opts.headers }
      if (opts.body) igHeaders['Content-Type'] = 'application/json'
      response = await session.defaultSession.fetch(opts.url, {
        method: opts.method,
        headers: igHeaders,
        body: reqBody,
      })
    } else {
      const { Referer: _r, referer: _r2, Origin: _o, origin: _o2, ...safeHeaders } = opts.headers ?? {}
      const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...safeHeaders }
      response = await net.fetch(opts.url, {
        method: opts.method,
        headers: reqHeaders,
        body: reqBody,
        referrerPolicy: 'no-referrer',
      } as RequestInit)
    }

    let data: unknown
    if (opts.isText) {
      data = await response.text()
    } else {
      // Parse manually with large-int protection — GéeLark task IDs are 19-digit
      // numbers that lose precision via JSON.parse, breaking task polling.
      const raw = await response.text()
      try {
        const safe = raw.replace(/:(\s*)(\d{16,})/g, ':$1"$2"')
        data = JSON.parse(safe)
      } catch {
        data = null
      }
    }
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
      body: JSON.stringify({ fileType: 'mp4' }),
    })
    const urlData = await urlRes.json() as Record<string, unknown>
    if (urlData['code'] !== 0) {
      const msg = urlData['msg'] ?? urlData['message'] ?? `code ${urlData['code']}`
      return { ok: false, error: `GéeLark upload URL: ${msg}` }
    }
    const data = (urlData['data'] as Record<string, unknown>) ?? {}
    const uploadUrl   = data['uploadUrl'] as string | undefined
    const resourceUrl = data['resourceUrl'] as string | undefined
    if (!uploadUrl || !resourceUrl) return { ok: false, error: 'Réponse upload GéeLark invalide' }

    // Step 2: read file and PUT to presigned URL — no extra headers (GéeLark doc requires this)
    const fileBytes = readFileSync(opts.filePath)
    const uploadRes = await net.fetch(uploadUrl, {
      method: 'PUT',
      body: fileBytes,
    })
    if (uploadRes.status < 200 || uploadRes.status >= 300) {
      return { ok: false, error: `Upload échoué (HTTP ${uploadRes.status})` }
    }

    // Return resourceUrl as token — Posting/MassPosting will pass it as `video: [token]`
    return { ok: true, token: resourceUrl }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: run FFmpeg montage ──────────────────────────────────────────────────
// Builds a concat + scale filter and runs ffmpeg.
// Returns { ok, outputPath } or { ok: false, error, command }
const FFMPEG_TIMEOUT       = 50 * 1000  // 50s for quick ops (detect, extract, metadata)
const FFMPEG_REMIX_TIMEOUT = 110 * 1000 // 110s for remix re-encode — MUST stay < renderer withTimeout (120s)
ipcMain.handle('run-ffmpeg', async (_event, opts: {
  clips:      Array<{ filePath: string; trimStart: number; trimEnd: number }>
  outputPath: string
  preset:     '9:16' | '1:1' | '16:9'
  transition: 'cut' | 'fade'
}) => {
  // Detect ffmpeg binary
  const ffmpegBin = getFfmpegBin()

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
    '-nostdin',
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
    execFile(ffmpegBin, args, { maxBuffer: 100 * 1024 * 1024, timeout: FFMPEG_TIMEOUT, killSignal: 'SIGKILL' }, (err) => {
      if (err) resolve({ ok: false, error: err.message, command })
      else     resolve({ ok: true, outputPath: opts.outputPath, command })
    })
  })
})

// ── IPC: detect scene change via raw RGB pixel comparison ────────────────────
// FFmpeg outputs a single rawvideo file (rgb24, 32×32, 2fps) — no codec,
// no header, pure pixels. Node.js reads it back, computes Euclidean RGB
// distance between consecutive frames, picks the biggest jump.
ipcMain.handle('detect-scene-change', async (_event, opts: {
  filePath: string; threshold?: number
}) => {
  const ffmpegBin = getFfmpegBin()
  const FPS = 2, W = 32, H = 32
  const frameSize = W * H * 3   // rgb24 = 3 bytes per pixel = 3072 bytes/frame
  const tmpDir  = path.join(os.tmpdir(), `sf-det-${Date.now()}`)
  const rawFile = path.join(tmpDir, 'frames.rgb')

  try { mkdirSync(tmpDir, { recursive: true }) } catch { /* ignore */ }

  return new Promise(resolve => {
    execFile(ffmpegBin, [
      '-nostdin', '-hide_banner', '-i', opts.filePath,
      '-vf', `fps=${FPS},scale=${W}:${H}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24',
      '-y', rawFile,
    ], { maxBuffer: 5 * 1024 * 1024, timeout: FFMPEG_TIMEOUT, killSignal: 'SIGKILL' }, (err, _stdout, stderr) => {

      if (err) console.log('[scene-detect] ffmpeg error:', err.message.split('\n')[0])

      const durM = (stderr ?? '').match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
      const duration = durM
        ? parseInt(durM[1]) * 3600 + parseInt(durM[2]) * 60 + parseFloat(durM[3])
        : 0

      let rawBuf: Buffer | null = null
      try { rawBuf = readFileSync(rawFile) } catch { /* ignore */ }
      try { rmSync(tmpDir, { recursive: true }) } catch { /* ignore */ }

      if (!rawBuf || rawBuf.length < frameSize * 2) {
        const msg = err ? err.message.split('\n')[0] : 'fichier vide'
        return resolve({ ok: false, times: [], duration, error: `FFmpeg n'a pas pu lire la vidéo : ${msg}` })
      }

      const totalFrames = Math.floor(rawBuf.length / frameSize)
      console.log('[scene-detect] frames read:', totalFrames, 'duration:', duration)

      // Average RGB per frame
      const avgs: [number, number, number][] = []
      for (let i = 0; i < totalFrames; i++) {
        const off = i * frameSize
        let r = 0, g = 0, b = 0
        for (let p = 0; p < W * H; p++) {
          r += rawBuf[off + p * 3]
          g += rawBuf[off + p * 3 + 1]
          b += rawBuf[off + p * 3 + 2]
        }
        avgs.push([r / (W * H), g / (W * H), b / (W * H)])
      }

      // Euclidean RGB distance between consecutive frames
      const diffs = avgs.slice(1).map(([r2, g2, b2], i) => {
        const [r1, g1, b1] = avgs[i]
        return {
          time: Math.round((i + 1) / FPS * 10) / 10,
          dist: Math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2),
        }
      })

      console.log('[scene-detect] diffs:', diffs.map(d => `t=${d.time}s Δ=${d.dist.toFixed(1)}`).join(' | '))

      const valid = diffs.filter(d => d.time > 0.4)
      if (!valid.length) {
        return resolve({ ok: false, times: [], duration, error: 'Vidéo trop courte — positionne le curseur manuellement.' })
      }

      // Adaptive cutoff = 35% of max jump; always pick at least the biggest
      const sorted  = [...valid].sort((a, b) => b.dist - a.dist)
      const maxDist = sorted[0].dist
      const cutoff  = Math.max(3, maxDist * 0.35)
      const picked  = sorted.filter(d => d.dist >= cutoff).length > 0
        ? sorted.filter(d => d.dist >= cutoff)
        : [sorted[0]]
      const times = picked.map(d => d.time)

      // Pick the LAST scene change so phase 2 = final scene of the original
      const best = Math.max(...times)

      console.log('[scene-detect] best=', best, 'times=', times, 'maxDist=', maxDist.toFixed(1))
      resolve({ ok: true, times, splitTime: best, duration })
    })
  })
})

// ── IPC: run FFmpeg remix (split + blend + concat) ───────────────────────────
// Phase 1 = new video (+ optional text overlay from original)
// Phase 2 = original video from splitTime onwards
ipcMain.handle('run-ffmpeg-remix', async (_event, opts: {
  originalPath:  string
  newPhase1Path: string
  splitTime:     number   // seconds — where phase 1 ends in original
  outputPath:    string
  textBlend:     number   // 0 = no overlay; 0.1–1.0 = screen blend opacity
  blendMode:     'screen' | 'multiply'
  preset:        '9:16' | '1:1' | '16:9'
}) => {
  const ffmpegBin = getFfmpegBin()
  const W = opts.preset === '16:9' ? 1920 : 1080
  const H = opts.preset === '9:16' ? 1920 : 1080
  const scl = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1`
  const afmt = 'aformat=sample_rates=44100:channel_layouts=stereo'

  let filterComplex: string
  if (opts.textBlend > 0) {
    // lumakey: make dark/background pixels transparent, keep only bright text pixels.
    // threshold=0 = key out black; tolerance = how much darkness to remove (user-adjustable).
    // overlay then pastes only those text pixels onto the new video — no background bleed.
    const lkTol = Math.min(0.5, Math.max(0.1, opts.textBlend))
    filterComplex = [
      `[1:v]split=2[ov_a][ov_b]`,
      `[1:a]asplit=2[ao1][ao2]`,
      `[0:v]trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_new]`,
      `[ov_a]trim=end=${opts.splitTime},setpts=PTS-STARTPTS,${scl},lumakey=threshold=0:tolerance=${lkTol}:softness=0.05[text_key]`,
      `[v_new][text_key]overlay=format=auto[v_blended]`,
      `[ov_b]trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
      `[ao1]atrim=end=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
      `[ao2]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
      `[v_blended][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
    ].join(';')
  } else {
    // No blend — new video visuals for phase 1, original audio throughout
    filterComplex = [
      `[0:v]trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p1]`,
      `[1:v]trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
      `[1:a]asplit=2[ao1][ao2]`,
      `[ao1]atrim=end=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
      `[ao2]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
      `[v_p1][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
    ].join(';')
  }

  const args = [
    '-nostdin',
    '-i', opts.newPhase1Path,
    '-i', opts.originalPath,
    '-filter_complex', filterComplex,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', opts.outputPath,
  ]
  const command = `ffmpeg ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`
  return new Promise(resolve => {
    execFile(ffmpegBin, args, { maxBuffer: 200 * 1024 * 1024, timeout: FFMPEG_TIMEOUT, killSignal: 'SIGKILL' }, (err) => {
      if (err) resolve({ ok: false, error: err.message, command })
      else     resolve({ ok: true,  outputPath: opts.outputPath, command })
    })
  })
})

// ── IPC: extract video frames as base64 JPEGs (for AI text analysis) ────────
ipcMain.handle('extract-frames', async (_event, opts: {
  filePath:   string
  startTime?: number
  endTime:    number
  fps?:       number
}) => {
  const ffmpegBin = getFfmpegBin()
  const tmpDir    = path.join(os.tmpdir(), `sf-frames-${Date.now()}`)
  const startTime = Math.max(0, opts.startTime ?? 0)
  const duration  = Math.max(0.1, opts.endTime - startTime)

  try {
    mkdirSync(tmpDir, { recursive: true })

    // Target max 8 frames over the requested duration
    const targetCount  = Math.min(8, Math.max(1, Math.ceil(duration)))
    const fps          = targetCount / duration
    const framePattern = path.join(tmpDir, 'frame_%04d.jpg')

    await new Promise<void>((resolve, reject) => {
      execFile(ffmpegBin, [
        '-nostdin',
        '-ss', String(startTime),   // fast seek BEFORE -i → jump directly to keyframe
        '-i', opts.filePath,
        '-t', String(duration),     // duration from startTime, not absolute endTime
        '-vf', `fps=${fps.toFixed(4)},scale=640:-2`,
        '-q:v', '5',
        '-y', framePattern,
      ], { maxBuffer: 200 * 1024 * 1024, timeout: FFMPEG_TIMEOUT, killSignal: 'SIGKILL' }, err => { if (err) reject(err); else resolve() })
    })

    const files    = readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort()
    const interval = duration / (files.length || 1)
    const frames   = files.map((f, i) => ({
      index:     i,
      timestamp: Math.round((startTime + i * interval) * 10) / 10,
      data:      readFileSync(path.join(tmpDir, f)).toString('base64'),
    }))

    try { rmSync(tmpDir, { recursive: true }) } catch { /* ignore */ }
    return { ok: true, frames, count: frames.length }
  } catch (err: unknown) {
    try { rmSync(tmpDir, { recursive: true }) } catch { /* ignore */ }
    return { ok: false, frames: [], error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: Anthropic API with vision support ───────────────────────────────────
ipcMain.handle('anthropic-vision-request', async (_event, opts: {
  apiKey:     string
  model?:     string
  messages:   unknown[]
  maxTokens?: number
}) => {
  try {
    const response = await net.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      opts.model ?? 'claude-haiku-4-5-20251001',
        max_tokens: opts.maxTokens ?? 2000,
        messages:   opts.messages,
      }),
    })
    const data = await response.json()
    if (!response.ok) return { ok: false, error: JSON.stringify(data) }
    return { ok: true, data }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── Helper: probe whether a video file has at least one audio stream ─────────
function hasAudioStream(ffmpegBin: string, filePath: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile(ffmpegBin, ['-nostdin', '-hide_banner', '-i', filePath],
      { timeout: 8000, killSignal: 'SIGKILL' },
      (_err, _stdout, stderr) => resolve(/Audio:/.test(stderr ?? ''))
    )
  })
}

// ── IPC: FFmpeg remix with AI-detected drawtext overlays ─────────────────────
ipcMain.handle('run-ffmpeg-remix-ai', async (_event, opts: {
  newPhase1Path:   string
  originalPath:    string
  splitTime:       number
  outputPath:      string
  preset:          '9:16' | '1:1' | '16:9'
  targetDuration?: number   // trim output to original video duration
  textOverlays:  Array<{
    text:      string
    x:         string
    y:         string
    fontSize:  number
    fontColor: string
    startTime: number
    endTime:   number
    bold?:     boolean
    shadow?:   boolean
  }>
}) => {
  const ffmpegBin = getFfmpegBin()
  const W = opts.preset === '16:9' ? 1920 : 1080
  const H = opts.preset === '9:16' ? 1920 : 1080
  const scl  = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1`
  const afmt = 'aformat=sample_rates=44100:channel_layouts=stereo'

  // Find a font file so drawtext works cross-platform
  function findFont(bold = false): string | null {
    const candidates = process.platform === 'win32'
      ? bold
        ? ['C:\\Windows\\Fonts\\arialbd.ttf', 'C:\\Windows\\Fonts\\Arial Bold.ttf', 'C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\segoeui.ttf']
        : ['C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\segoeui.ttf']
      : process.platform === 'darwin'
        ? bold
          ? ['/Library/Fonts/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf']
          : ['/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']
        : bold
          ? ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf']
          : ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']
    return candidates.find(f => existsSync(f)) ?? null
  }

  // Escape text for FFmpeg drawtext filter
  // % is a format-string specifier in drawtext and must be doubled
  function escText(t: string): string {
    return t
      .replace(/\\/g, '\\\\')
      .replace(/'/g,  "\\'")
      .replace(/:/g,  '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/%/g,  '%%')
  }

  // Build drawtext chain (comma-separated, applied after scale)
  const drawtextChain = opts.textOverlays.map(ov => {
    const fontFile = findFont(ov.bold)
    const borderPx = Math.max(3, Math.round(ov.fontSize * 0.07))
    const parts: string[] = [`text='${escText(ov.text)}'`]
    if (fontFile) parts.push(`fontfile='${fontFile}'`)
    // Clamp y so text stays fully on-screen. text_h = rendered height of this line.
    // Add a small bottom margin (text_h * 0.2) so descenders don't clip.
    const ySafe = `'max(4,min(h-text_h-8,${ov.y}))'`
    parts.push(
      `x=${ov.x}`, `y=${ySafe}`,
      `fontsize=${ov.fontSize}`,
      `fontcolor=${ov.fontColor}`,
      `borderw=${borderPx}`, `bordercolor=black@1.0`,
      `enable='between(t,${ov.startTime},${ov.endTime})'`,
    )
    if (ov.shadow !== false) parts.push(`shadowx=4:shadowy=4:shadowcolor=black@0.7`)
    return `drawtext=${parts.join(':')}`
  }).join(',')

  const vfPhase1 = opts.textOverlays.length > 0 ? `${scl},${drawtextChain}` : scl

  // Validate splitTime — undefined/NaN/0 means we can't concat, so just re-encode phase1 alone
  const splitTime = (opts.splitTime != null && !isNaN(opts.splitTime) && opts.splitTime > 0)
    ? opts.splitTime
    : null

  // Common output flags (WITHOUT the output path — must be last)
  const commonOutputFlags = [
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-r', '30', '-fps_mode', 'cfr',   // force constant 30 fps output
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
    '-max_muxing_queue_size', '9999',
  ]

  let args: string[]

  if (!splitTime) {
    // No valid split point — re-encode secondary clip, trimmed to original duration
    args = [
      '-nostdin',
      '-i', opts.newPhase1Path,
      '-vf', `fps=30,setpts=PTS-STARTPTS,${vfPhase1}`,
      ...commonOutputFlags,
      '-an',
      // Trim to original video duration so secondary doesn't run longer than original
      ...(opts.targetDuration != null ? ['-t', String(opts.targetDuration)] : []),
      '-y', opts.outputPath,
    ]
  } else {
    // Probe original for audio so we don't hang on a missing audio stream
    const origHasAudio = await hasAudioStream(ffmpegBin, opts.originalPath)

    let filterComplex: string
    let mapArgs: string[]
    let audioEncArgs: string[]

    // Use -t splitTime on the secondary INPUT (not trim= filter) so that if the
    // secondary video is shorter than splitTime, FFmpeg stops cleanly instead of
    // freezing on the last frame until the trim duration is reached.
    // Phase 2 = original from splitTime → end (no upper trim → always complete).
    if (origHasAudio) {
      filterComplex = [
        `[0:v]fps=30,setpts=PTS-STARTPTS,${vfPhase1}[v_p1]`,
        `[1:v]trim=start=${splitTime},fps=30,setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[1:a]asplit=2[ao1][ao2]`,
        `[ao1]atrim=end=${splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
        `[ao2]atrim=start=${splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
        `[v_p1][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
      ].join(';')
      mapArgs      = ['-map', '[vout]', '-map', '[aout]']
      audioEncArgs = ['-c:a', 'aac', '-b:a', '128k']
    } else {
      filterComplex = [
        `[0:v]fps=30,setpts=PTS-STARTPTS,${vfPhase1}[v_p1]`,
        `[1:v]trim=start=${splitTime},fps=30,setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[v_p1][v_p2]concat=n=2:v=1:a=0[vout]`,
      ].join(';')
      mapArgs      = ['-map', '[vout]']
      audioEncArgs = ['-an']
    }

    args = [
      '-nostdin',
      '-t', String(splitTime), '-i', opts.newPhase1Path,  // stop reading secondary at splitTime
      '-i', opts.originalPath,                              // full original (phase 2 = splitTime→end)
      '-filter_complex', filterComplex,
      ...mapArgs,
      ...commonOutputFlags,
      ...audioEncArgs,
      '-y', opts.outputPath,
    ]
  }

  const command = `ffmpeg ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`

  return new Promise(resolve => {
    execFile(ffmpegBin, args, { maxBuffer: 200 * 1024 * 1024, timeout: FFMPEG_REMIX_TIMEOUT, killSignal: 'SIGKILL' }, err => {
      if (err) resolve({ ok: false, error: err.message, command })
      else     resolve({ ok: true, outputPath: opts.outputPath, command })
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

// ── IPC: pick any file (image/video/any) ─────────────────────────────────────
ipcMain.handle('pick-any-file', async (_event, opts: { filters?: Array<{ name: string; extensions: string[] }> }) => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: 'Choisir un fichier',
    properties: ['openFile'],
    filters: opts?.filters ?? [{ name: 'Tous les fichiers', extensions: ['*'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── IPC: pick output folder ───────────────────────────────────────────────────
ipcMain.handle('pick-output-folder', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: 'Choisir le dossier de sortie',
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── IPC: read video metadata ─────────────────────────────────────────────────
ipcMain.handle('read-video-metadata', async (_event, opts: { filePath: string }) => {
  const ffmpegBin = getFfmpegBin()
  return new Promise<{ ok: boolean; metadata?: Record<string, string>; duration?: number; error?: string }>(resolve => {
    // Run ffmpeg -i to get metadata from stderr (ffmpeg exits with error code 1 when no output is specified)
    execFile(ffmpegBin, ['-hide_banner', '-i', opts.filePath], { encoding: 'utf8' }, (_err, _stdout, stderr) => {
      // stderr contains the metadata even on error exit
      const combined = stderr || ''
      const meta: Record<string, string> = {}
      // Parse the Metadata block
      const metaBlock = combined.match(/Metadata:\s*([\s\S]*?)(?=\n\s*(Duration|Stream|Input|$))/m)
      if (metaBlock) {
        for (const line of metaBlock[1].split('\n')) {
          const m = line.match(/^\s+(\w[\w\s]*?)\s*:\s*(.+)$/)
          if (m) meta[m[1].trim()] = m[2].trim()
        }
      }
      // Parse duration
      const durMatch = combined.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
      const duration = durMatch
        ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
        : undefined
      resolve({ ok: true, metadata: meta, duration })
    })
  })
})

// ── IPC: rewrite video metadata via FFmpeg ────────────────────────────────────
ipcMain.handle('run-ffmpeg-metadata', async (_event, opts: {
  inputPath:  string
  outputPath: string
  metadata:   Record<string, string>  // key/value pairs to set; empty value = remove
}) => {
  const ffmpegBin = getFfmpegBin()
  const args: string[] = ['-nostdin', '-hide_banner', '-i', opts.inputPath, '-map_metadata', '-1']
  for (const [k, v] of Object.entries(opts.metadata)) {
    if (v) { args.push('-metadata', `${k}=${v}`) }
  }
  // Copy all streams without re-encoding
  args.push('-c', 'copy', '-movflags', '+faststart', '-y', opts.outputPath)
  return new Promise<{ ok: boolean; outputPath?: string; command?: string; error?: string }>(resolve => {
    const command = [ffmpegBin, ...args].join(' ')
    execFile(ffmpegBin, args, { encoding: 'utf8', timeout: FFMPEG_TIMEOUT, killSignal: 'SIGKILL' }, (err, _stdout, stderr) => {
      if (err) resolve({ ok: false, command, error: stderr.split('\n').filter(Boolean).pop() ?? err.message })
      else     resolve({ ok: true, outputPath: opts.outputPath, command })
    })
  })
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
  // Multi-strategy image fetch via Electron's net.fetch (Chromium TLS + redirect handling).
  // IG CDN can 403 randomly based on Referer/UA — we walk through fallbacks until one works.
  const headerSets: Array<Record<string, string>> = [
    {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.instagram.com/',
      'sec-fetch-dest': 'image',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'cross-site',
    },
    {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'image/*,*/*;q=0.8',
    },
    {
      'User-Agent': 'Instagram 312.0.0.32.116 Android (33/13; 420dpi; 1080x2206; samsung; SM-S911B; dm3q; qcom; en_US; 558678421)',
      'Accept': 'image/*',
    },
  ]
  for (const headers of headerSets) {
    try {
      const merged = { ...headers, ...(opts.headers ?? {}) }
      const res = await net.fetch(opts.url, { method: 'GET', headers: merged, redirect: 'follow' })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 0) {
          const ct = res.headers.get('content-type') ?? 'image/jpeg'
          return { ok: true, dataUrl: `data:${ct};base64,${buf.toString('base64')}` }
        }
      }
    } catch { /* try next */ }
  }
  return { ok: false, error: 'all_strategies_failed' }
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
  const extractComments = (data: Record<string, unknown>): Array<Record<string, unknown>> => {
    const candidates: unknown[] = [data['comments'], data['preview_comments']]
    // Threading: data.comments may have { node: {...} } structure
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) {
        // Unwrap edge.node if present
        return c.map((item) => {
          const obj = item as Record<string, unknown>
          if (obj['node'] && typeof obj['node'] === 'object') return obj['node'] as Record<string, unknown>
          return obj
        })
      }
    }
    return []
  }
  const mapComments = (raw: Array<Record<string, unknown>>) => raw.map(c => ({
    pk:        String(c['pk'] ?? c['id'] ?? ''),
    text:      String(c['text'] ?? ''),
    username:  String((c['user'] as Record<string, unknown>)?.['username'] ?? (c['owner'] as Record<string, unknown>)?.['username'] ?? ''),
    timestamp: c['created_at'] ? new Date((c['created_at'] as number) * 1000).toISOString() : '',
    likeCount: (c['comment_like_count'] as number) ?? 0,
  }))

  try {
    // ── Attempt 1: i.instagram private API, threading mode ────────────────────
    let url = `https://i.instagram.com/api/v1/media/${opts.mediaId}/comments/?can_support_threading=true&permalink_enabled=false`
    if (opts.maxId) url += `&max_id=${opts.maxId}`
    let res = await igSessionFetch(url, opts.sessionid)
    console.log('[fetch-ig-comments] A i.instagram threading status=', res.status, 'mediaId=', opts.mediaId)
    let raw = res.status === 200 && res.data ? extractComments(res.data as Record<string, unknown>) : []

    // ── Attempt 2: i.instagram private API, simple variant ────────────────────
    if (raw.length === 0) {
      const url2 = `https://i.instagram.com/api/v1/media/${opts.mediaId}/comments/${opts.maxId ? `?max_id=${opts.maxId}` : ''}`
      const res2 = await igSessionFetch(url2, opts.sessionid)
      console.log('[fetch-ig-comments] B i.instagram simple status=', res2.status, 'keys=', res2.data ? Object.keys(res2.data as object).slice(0, 12) : null)
      if (res2.status === 200 && res2.data) raw = extractComments(res2.data as Record<string, unknown>)
      if (res2.status === 200) res = res2
    }

    // ── Attempt 3: www.instagram private API ──────────────────────────────────
    if (raw.length === 0) {
      const url3 = `https://www.instagram.com/api/v1/media/${opts.mediaId}/comments/${opts.maxId ? `?max_id=${opts.maxId}` : ''}`
      const res3 = await igSessionFetch(url3, opts.sessionid)
      console.log('[fetch-ig-comments] C www.instagram status=', res3.status, 'keys=', res3.data ? Object.keys(res3.data as object).slice(0, 12) : null)
      if (res3.status === 200 && res3.data) raw = extractComments(res3.data as Record<string, unknown>)
      if (res3.status === 200) res = res3
    }

    if (raw.length === 0 && res.status === 200) {
      // Log a preview of the response so we can see what IG is actually returning
      const preview = JSON.stringify(res.data).slice(0, 400)
      console.log('[fetch-ig-comments] no comments extracted. preview=', preview)
    }

    return { ok: true, comments: mapComments(raw), hasMore: !!(((res.data ?? {}) as Record<string, unknown>)['next_max_id']) }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: post a comment on an Instagram media ─────────────────────────────────
ipcMain.handle('post-ig-comment', async (_event, opts: { mediaId: string; text: string; sessionid: string }) => {
  try {
    // Ensure we have a csrftoken cached — IG requires it on POST
    if (!_csrfCache.get(opts.sessionid)) {
      await igSessionFetch('https://i.instagram.com/api/v1/accounts/current_user/', opts.sessionid)
    }
    // Extract user_id from sessionid for _uid (sessionid format: "{userid}%3A...")
    const decoded = decodeURIComponent(opts.sessionid)
    const uidMatch = decoded.match(/^(\d+)/)
    const uid = uidMatch ? uidMatch[1] : ''

    const body = [
      `comment_text=${encodeURIComponent(opts.text)}`,
      `containermodule=self_comments_v2_feed_contextual_self_profile`,
      uid ? `_uid=${uid}` : '',
      uid ? `_uuid=${uid}` : '',
    ].filter(Boolean).join('&')

    const tryPost = () => igSessionFetch(
      `https://i.instagram.com/api/v1/media/${opts.mediaId}/comment/`,
      opts.sessionid,
      'POST',
      body,
    )

    let res = await tryPost()
    console.log('[post-ig-comment] status=', res.status, 'mediaId=', opts.mediaId)

    // If 403, drop cached csrftoken, refetch a fresh one, and retry once
    if (res.status === 403) {
      _csrfCache.delete(opts.sessionid)
      await igSessionFetch('https://i.instagram.com/api/v1/accounts/current_user/', opts.sessionid)
      // Also try the www. host which sometimes works when i. blocks
      const res2 = await igSessionFetch(
        `https://www.instagram.com/api/v1/web/comments/${opts.mediaId}/add/`,
        opts.sessionid,
        'POST',
        `comment_text=${encodeURIComponent(opts.text)}`,
        { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.instagram.com/' },
      )
      console.log('[post-ig-comment] retry www. status=', res2.status)
      if (res2.status === 200) return { ok: true }
      res = await tryPost()
      console.log('[post-ig-comment] retry i. status=', res.status)
    }

    if (res.status !== 200) {
      const dead = isSessionDead(res.status, res.data)
      const detail = res.data ? JSON.stringify(res.data).slice(0, 200) : ''
      return { ok: false, sessionExpired: dead, error: `HTTP ${res.status}${detail ? ' — ' + detail : ''}` }
    }
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

// ── IPC: download an Instagram video to temp and return its local path ──────
// IG CDN URLs need browser-like headers (Referer, UA) and may need fallbacks,
// same pattern as the thumbnail pre-fetch above.
ipcMain.handle('fetch-ig-video', async (_event, opts: { url: string }) => {
  if (!opts.url) return { ok: false, error: 'no url' }
  const headerSets: Array<Record<string, string>> = [
    {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.instagram.com/',
    },
    { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'Accept': 'video/*' },
    { 'User-Agent': 'Instagram 312.0.0.32.116 Android', 'Accept': 'video/*' },
  ]
  for (const headers of headerSets) {
    try {
      const res = await net.fetch(opts.url, { method: 'GET', headers, redirect: 'follow' })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) continue
      const dir = path.join(os.tmpdir(), 'ig-tracker-cache')
      mkdirSync(dir, { recursive: true })
      const out = path.join(dir, `ig-${Date.now()}.mp4`)
      writeFileSync(out, buf)
      return { ok: true, path: out, size: buf.length }
    } catch { /* try next */ }
  }
  return { ok: false, error: 'all retries failed' }
})

// ── IPC: read full file bytes (for cloud upload) ─────────────────────────────
ipcMain.handle('read-file-bytes', async (_event, filePath: string) => {
  try {
    if (!existsSync(filePath)) return { ok: false, error: 'not found' }
    const buf = readFileSync(filePath)
    // Return a transferable ArrayBuffer (fast — no base64)
    return { ok: true, bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), size: buf.byteLength }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: write bytes to temp dir, return absolute path ──────────────────────
// Used to materialise a cloud-stored video to disk so GéeLark / ffmpeg can read it.
ipcMain.handle('write-temp-file', async (_event, opts: { name: string; bytes: ArrayBuffer }) => {
  try {
    const dir = path.join(os.tmpdir(), 'ig-tracker-cache')
    mkdirSync(dir, { recursive: true })
    // Sanitise the name: strip directory separators, keep extension
    const safeName = opts.name.replace(/[\\/]/g, '_').slice(-200)
    const out = path.join(dir, `${Date.now()}-${safeName}`)
    writeFileSync(out, Buffer.from(opts.bytes))
    return { ok: true, path: out }
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
