import { app, BrowserWindow, shell, ipcMain, net, dialog, session, protocol } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync, readFileSync, createReadStream, statSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
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
  const ffmpegBin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const W = opts.preset === '16:9' ? 1920 : 1080
  const H = opts.preset === '9:16' ? 1920 : 1080
  const scl = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1`
  const afmt = 'aformat=sample_rates=44100:channel_layouts=stereo'

  let filterComplex: string
  if (opts.textBlend > 0) {
    // With text overlay — split original video, blend phase 1 text on new video
    filterComplex = [
      `[1:v]split=2[ov_a][ov_b]`,
      `[0:v]trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_new]`,
      `[0:a]atrim=duration=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
      `[ov_a]trim=end=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_orig_p1]`,
      `[ov_b]trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
      `[1:a]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
      `[v_new][v_orig_p1]blend=all_mode=${opts.blendMode}:all_opacity=${opts.textBlend}[v_blended]`,
      `[v_blended][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
    ].join(';')
  } else {
    // No text overlay — simple swap phase 1 then concat phase 2
    filterComplex = [
      `[0:v]trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p1]`,
      `[0:a]atrim=duration=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
      `[1:v]trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
      `[1:a]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
      `[v_p1][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
    ].join(';')
  }

  const args = [
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
    execFile(ffmpegBin, args, { maxBuffer: 200 * 1024 * 1024 }, (err) => {
      if (err) resolve({ ok: false, error: err.message, command })
      else     resolve({ ok: true,  outputPath: opts.outputPath, command })
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
