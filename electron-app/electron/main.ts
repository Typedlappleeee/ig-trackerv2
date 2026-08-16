import { app, BrowserWindow, shell, ipcMain, net, dialog, session, protocol, Tray, Menu, nativeImage } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync, readFileSync, createReadStream, statSync, writeFileSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs'
import os from 'node:os'
import { execFile, spawn } from 'node:child_process'
import https from 'node:https'
import http from 'node:http'
import path from 'node:path'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'

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
let tray: Tray | null = null
let isMassPostingRunning = false

// ── GeeLark phone lifecycle tracking ─────────────────────────────────────────
// Every /phone/start call is intercepted in the geelark-request IPC handler below
// and the phone IDs are registered here. On app quit we stop any that are still
// running so the user is never charged for idle cloud phones.
let geelarkBearer = ''
const geelarkRunningPhones = new Set<string>()

// Resolve tray icon path — falls back gracefully if logo not found
function getTrayIcon() {
  const logoPath = app.isPackaged
    ? path.join(process.resourcesPath, 'logo.png')
    : path.join(process.env.APP_ROOT!, 'public', 'logo.png')
  try {
    const img = nativeImage.createFromPath(logoPath)
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 })
  } catch { /* ignore */ }
  return nativeImage.createEmpty()
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) return
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Mass Posting en cours...')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Afficher l\'application',
      click: () => { win?.show(); win?.focus() },
    },
    { type: 'separator' },
    {
      label: 'Arrêter et quitter',
      click: () => { isMassPostingRunning = false; geelarkQuitInProgress = false; app.quit() },
    },
  ]))
  tray.on('double-click', () => { win?.show(); win?.focus() })
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy()
  tray = null
}

ipcMain.on('mass-posting-running', (_event, running: boolean) => {
  isMassPostingRunning = running
  if (running) {
    ensureTray()
  } else {
    destroyTray()
    // Re-show the window if it was hidden so the user can see the results
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show()
      win.focus()
    }
  }
})

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

  // ── Attempt 3.5: API mobile (i.instagram.com) avec UA d'app Android ───────
  // Souvent accessible sans cookies là où www.instagram.com renvoie 401.
  // net.fetch (et non session.fetch) pour ne PAS attacher les cookies web.
  try {
    const res = await net.fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          'User-Agent':      'Instagram 269.0.0.18.75 Android (33/13; 420dpi; 1080x2400; samsung; SM-S901B; r0s; exynos2200; fr_FR; 314665256)',
          'X-IG-App-ID':     IG_APP_ID,
          'Accept':          '*/*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
      },
    )
    console.log(`[IG] mobile API ${username}: ${res.status}`)
    if (res.ok) {
      const json = await res.json() as Record<string, unknown>
      const user = (json?.['data'] as Record<string, unknown> | undefined)?.['user']
      if (user) return { ok: true, apiJson: json }
    }
  } catch (e) { console.log('[IG] mobile API error:', String(e)) }

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

// ── Scanner de comptes : statut d'un compte IG via le proxy du téléphone ─────
// Détection fiable de ban SANS sessionid et SANS allumer le téléphone :
// on charge instagram.com/<username>/ À TRAVERS le proxy assigné au téléphone
// (même IP que le compte → pas de rate-limit, paraît légitime).
//   • HTTP 404 / "page isn't available"        → banni / supprimé / désactivé (sûr)
//   • HTTP 200 + données de profil             → actif
//   • 429 / login wall / challenge / erreur    → bloqué (à revérifier, jamais un faux ban)
interface GLProxy { type?: string; scheme?: string; server?: string; port?: number; username?: string; password?: string }
function buildProxyAgent(proxy: GLProxy | null | undefined): https.Agent | undefined {
  if (!proxy?.server || !proxy?.port) return undefined
  const scheme = (proxy.type ?? proxy.scheme ?? 'http').toLowerCase()
  const auth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@` : ''
  const url = `${scheme.startsWith('socks') ? 'socks5' : scheme}://${auth}${proxy.server}:${proxy.port}`
  try {
    const agent = scheme.startsWith('socks') ? new SocksProxyAgent(url) : new HttpsProxyAgent(url)
    return agent as unknown as https.Agent
  } catch { return undefined }
}

type IgStatus = 'active' | 'banned' | 'blocked'
function classifyIgResponse(status: number, body: string): IgStatus {
  if (status === 404) return 'banned'
  const low = body.toLowerCase()
  // Pages de compte inexistant/désactivé (même quand IG renvoie 200 avec une page d'erreur)
  if (/sorry, this page isn'?t available|page isn'?t available|cette page n'est pas disponible|page introuvable|user not found|"users":\[\]/.test(low)) {
    // Mais pas si c'est juste un mur de connexion générique
    if (!/log in to see|connecte-toi pour voir|loginform/.test(low)) return 'banned'
  }
  if (status === 200) {
    // Signaux d'un profil bien vivant
    if (/"edge_followed_by"|"follower_count"|og:description|"biography"|profilepage|"edge_owner_to_timeline_media"/.test(low)) return 'active'
    // 200 mais mur de login/consentement sans données exploitables → bloqué (pas un verdict)
    if (/login|challenge|checkpoint|robot|captcha|few minutes|réessayer plus tard|try again later/.test(low)) return 'blocked'
    // 200 vide / inconnu → bloqué prudemment
    return 'blocked'
  }
  if (status === 429 || status === 401 || status === 403) return 'blocked'
  return 'blocked'
}

ipcMain.handle('check-instagram-status', async (_event, opts: { username: string; proxy?: GLProxy | null }) => {
  const username = (opts.username ?? '').replace(/^@/, '').trim()
  if (!username) return { ok: false, status: 'blocked' as IgStatus, error: 'no_username' }
  const agent = buildProxyAgent(opts.proxy)
  const url = `https://www.instagram.com/${encodeURIComponent(username)}/`
  return await new Promise<{ ok: boolean; status: IgStatus; httpStatus?: number; error?: string }>((resolve) => {
    const parsed = new URL(url)
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'GET',
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, (res) => {
      const httpStatus = res.statusCode ?? 0
      // 404 : pas besoin de lire le corps
      if (httpStatus === 404) { res.resume(); resolve({ ok: true, status: 'banned', httpStatus }); return }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => { if (size < 600_000) { chunks.push(c); size += c.length } })
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        resolve({ ok: true, status: classifyIgResponse(httpStatus, body), httpStatus })
      })
      res.on('error', () => resolve({ ok: true, status: 'blocked', httpStatus, error: 'stream_error' }))
    })
    req.on('error', (e) => resolve({ ok: false, status: 'blocked', error: e instanceof Error ? e.message : String(e) }))
    req.setTimeout(20_000, () => { req.destroy(new Error('timeout')); resolve({ ok: false, status: 'blocked', error: 'timeout' }) })
    req.end()
  })
})

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
    // ── Phone lifecycle tracking (stop phones on quit) ──────────────────────
    if (opts.url.includes('/phone/start') || opts.url.includes('/phone/stop')) {
      const bearer = (opts.headers?.Authorization ?? opts.headers?.authorization ?? '')
        .replace(/^Bearer\s+/i, '')
      const ids: string[] = (opts.body as { ids?: string[] })?.ids ?? []
      if (bearer) geelarkBearer = bearer
      if (opts.url.includes('/phone/start')) {
        for (const id of ids) geelarkRunningPhones.add(id)
      } else {
        for (const id of ids) geelarkRunningPhones.delete(id)
      }
    }

    return { ok: true, status: response.status, data }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: AdsPower local API (http://local.adspower.net:50325) ────────────────
// net.fetch blocks plain-HTTP to non-standard hosts; use Node http module instead.
ipcMain.handle('adspower-request', (_event, opts: {
  method: 'GET' | 'POST'
  path: string
  body?: unknown
}) => {
  // Try each hostname in order; return first success or last error
  const hosts = ['local.adspower.net', '127.0.0.1', 'localhost']
  function tryHost(i: number): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    return new Promise((resolve) => {
      const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined
      const req = http.request({
        hostname: hosts[i],
        port: 50325,
        path: opts.path,
        method: opts.method ?? 'GET',
        headers: {
          'Accept': 'application/json',
          ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      }, (res) => {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => {
          try { resolve({ ok: true, data: JSON.parse(raw) }) }
          catch { resolve({ ok: true, data: raw }) }
        })
      })
      req.on('error', (e) => {
        if (i + 1 < hosts.length) {
          tryHost(i + 1).then(resolve)
        } else {
          resolve({ ok: false, error: `AdsPower inaccessible (${e.message}). Vérifiez qu'AdsPower est ouvert.` })
        }
      })
      req.setTimeout(5000, () => { req.destroy() })
      if (bodyStr) req.write(bodyStr)
      req.end()
    })
  }
  return tryHost(0)
})

// ── IPC: rotation d'IP proxy ─────────────────────────────────────────────────
// GET direct sur le "Change IP URL" du fournisseur (Prox'Easy…) via le module
// Node https/http — net.fetch rejette ces hôtes ("Forbidden URL"). Best-effort.
ipcMain.handle('rotate-proxy', async (_event, url: string) => {
  // Beaucoup d'endpoints de rotation sont des boîtiers auto-hébergés (*.ddns.net)
  // avec un certificat SSL auto-signé/expiré → un GET standard échoue alors que le
  // proxy est bon. On tente : (1) TLS vérifié, (2) TLS ignoré si erreur de cert,
  // (3) repli http://. Sûr : simple GET de déclenchement, aucune donnée sensible.
  type RawRes = { ok?: boolean; status?: number; body?: string; error?: string; code?: string }
  const rawGet = (target: string, insecure = false): Promise<RawRes> => new Promise((resolve) => {
    try {
      const u = new URL(target)
      const mod = u.protocol === 'http:' ? http : https
      const opts: https.RequestOptions = {
        method: 'GET', timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScaleFlow/1.0)' },
      }
      if (mod === https && insecure) opts.rejectUnauthorized = false
      const req = mod.request(target, opts, (res) => {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (c) => { raw += c })
        res.on('end', () => {
          const code = res.statusCode ?? 0
          resolve({ ok: code >= 200 && code < 400, status: code, body: raw.slice(0, 300) })
        })
      })
      req.on('error', (e: NodeJS.ErrnoException) => resolve({ error: e.message, code: e.code }))
      req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }) })
      req.end()
    } catch (e) {
      resolve({ error: e instanceof Error ? e.message : String(e) })
    }
  })
  const isCertErr = (c?: string) => typeof c === 'string' && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|TLS|SSL|ALTNAME|DEPTH_ZERO/i.test(c)

  let r = await rawGet(url)
  if (r.error && (isCertErr(r.code) || isCertErr(r.error)) && /^https:/i.test(url)) {
    r = await rawGet(url, true)
  }
  if (r.error && /^https:/i.test(url)) {
    const httpTry = await rawGet(url.replace(/^https:/i, 'http:'))
    if (!httpTry.error) r = httpTry
  }
  return r.error ? { ok: false, error: r.error } : { ok: r.ok, status: r.status, body: r.body }
})

// ── CORS proxy for AdsPower (allows web app to reach local.adspower.net) ────
// The browser blocks HTTPS→HTTP requests (Private Network Access / CORS).
// This proxy runs on localhost:50327, forwards to AdsPower on :50325, and
// adds the required CORS headers so the web app can call it directly.
const ADS_PROXY_PORT = 50327
const adsProxy = http.createServer((req, proxyRes) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
  }
  if (req.method === 'OPTIONS') {
    proxyRes.writeHead(204, cors)
    proxyRes.end()
    return
  }
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    const fwd = http.request({
      hostname: '127.0.0.1', port: 50325,
      path: req.url, method: req.method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (upstream) => {
      let raw = ''
      upstream.on('data', c => { raw += c })
      upstream.on('end', () => {
        proxyRes.writeHead(upstream.statusCode ?? 200, { ...cors, 'Content-Type': 'application/json' })
        proxyRes.end(raw)
      })
    })
    fwd.on('error', () => {
      proxyRes.writeHead(502, cors)
      proxyRes.end(JSON.stringify({ code: -1, msg: 'AdsPower unreachable' }))
    })
    if (body) fwd.write(body)
    fwd.end()
  })
})
adsProxy.listen(ADS_PROXY_PORT, '127.0.0.1', () => {
  console.log(`[adspower-proxy] listening on http://127.0.0.1:${ADS_PROXY_PORT}`)
})
adsProxy.on('error', (e) => console.warn('[adspower-proxy] start error:', e.message))

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
  const TIMEOUT_MS = 240_000 // 4 minutes
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    // Step 1: get presigned upload URL. Une IMAGE garde sa vraie extension (encodée
    // dans la resourceUrl) ; une VIDÉO force 'mp4' — les templates RPA Insta/TikTok/
    // Threads rejettent 'mov'/'webm'. (Doit rester aligné sur webAPI.ts.)
    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heif', 'heic']
    // Cover capturée (data:image/jpeg;base64,…) → pas d'extension : on lit le MIME.
    const dataMime = opts.filePath.startsWith('data:') ? (opts.filePath.match(/^data:([^;,]+)/)?.[1] || '').toLowerCase() : ''
    const realExt = dataMime
      ? (dataMime.split('/')[1] || 'jpg')
      : (opts.filePath.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4').toLowerCase()
    const ext = IMAGE_EXTS.includes(realExt) ? realExt : 'mp4'
    const urlRes = await net.fetch('https://openapi.geelark.com/open/v1/upload/getUrl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.bearer}`,
      },
      body: JSON.stringify({ fileType: ext }),
      signal: abort.signal,
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

    // Step 2: read file bytes — data URL (cover), local path, or signed URL
    let fileBytes: Buffer
    if (opts.filePath.startsWith('data:')) {
      const b64 = opts.filePath.slice(opts.filePath.indexOf(',') + 1)
      fileBytes = Buffer.from(b64, 'base64')
    } else if (opts.filePath.startsWith('https://') || opts.filePath.startsWith('http://')) {
      const dlRes = await net.fetch(opts.filePath, { signal: abort.signal })
      if (!dlRes.ok) return { ok: false, error: `Téléchargement vidéo échoué: ${dlRes.status}` }
      fileBytes = Buffer.from(await dlRes.arrayBuffer())
    } else {
      fileBytes = readFileSync(opts.filePath)
    }
    const uploadRes = await net.fetch(uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(fileBytes),
      signal: abort.signal,
    })
    if (uploadRes.status < 200 || uploadRes.status >= 300) {
      return { ok: false, error: `Upload échoué (HTTP ${uploadRes.status})` }
    }

    // Return resourceUrl as token — Posting/MassPosting will pass it as `video: [token]`
    return { ok: true, token: resourceUrl }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = abort.signal.aborted || msg.includes('abort') || msg.includes('Abort')
    return { ok: false, error: isTimeout ? `Upload timeout (${Math.round(TIMEOUT_MS / 1000)}s dépassé)` : msg }
  } finally {
    clearTimeout(timer)
  }
})

// ── IPC: run FFmpeg montage ──────────────────────────────────────────────────
// Builds a concat + scale filter and runs ffmpeg.
// Returns { ok, outputPath } or { ok: false, error, command }
const FFMPEG_TIMEOUT       = 50 * 1000  // 50s for quick ops (detect, extract, metadata)
const FFMPEG_REMIX_TIMEOUT = 340 * 1000 // 340s for remix re-encode — MUST stay < renderer withTimeout (360s)
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

// ── IPC: run FFmpeg CloneVid repurpose (native, multi-variant) ───────────────
// Uses the bundled native ffmpeg instead of WASM — far faster, handles every
// codec/container, and always produces an Instagram-postable MP4
// (H.264 + AAC, yuv420p, +faststart). One decode per variant.
// `sourcePath` may be a local absolute path OR an http(s) URL (bank signed URL).
ipcMain.handle('run-ffmpeg-repurpose', async (_event, opts: {
  sourcePath: string
  variants:   Array<{ vf: string; crf: number }>
  format?:    '9:16' | '1:1' | '16:9' | 'keep'
}) => {
  const ffmpegBin = getFfmpegBin()
  const dir = path.join(os.tmpdir(), 'ig-tracker-clonevid')
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }

  // Resolve the source to a local file (download it first if it's a remote URL)
  let srcPath = opts.sourcePath
  let tempSrc: string | null = null
  try {
    if (srcPath.startsWith('http://') || srcPath.startsWith('https://')) {
      const res = await net.fetch(srcPath)
      if (!res.ok) return { ok: false, results: [], error: `Téléchargement source échoué: ${res.status}` }
      const buf = Buffer.from(await res.arrayBuffer())
      tempSrc = path.join(dir, `src-${Date.now()}.mp4`)
      writeFileSync(tempSrc, buf)
      srcPath = tempSrc
    } else if (srcPath.startsWith('file://')) {
      srcPath = fileURLToPath(srcPath)
    }
  } catch (err) {
    return { ok: false, results: [], error: err instanceof Error ? err.message : String(err) }
  }

  if (!existsSync(srcPath)) return { ok: false, results: [], error: 'Fichier source introuvable' }

  // Final scale to Instagram-recommended full-HD dimensions (appended to vf chain).
  // The variant vf caps at 720p — the native path always outputs at 1080p so GéeLark
  // and Instagram accept the file without complaints about resolution or bitrate.
  const finalScale = opts.format === '9:16'  ? ',scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black,setsar=1,scale=trunc(iw/2)*2:trunc(ih/2)*2'
                   : opts.format === '1:1'   ? ',scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:-1:-1:color=black,setsar=1,scale=trunc(iw/2)*2:trunc(ih/2)*2'
                   : opts.format === '16:9'  ? ',scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,setsar=1,scale=trunc(iw/2)*2:trunc(ih/2)*2'
                   : ''  // 'keep' — don't force a specific resolution

  const results: Array<{ ok: boolean; outputPath?: string; error?: string }> = []
  for (let i = 0; i < opts.variants.length; i++) {
    const v   = opts.variants[i]
    const out = path.join(dir, `clonevid-${Date.now()}-${i}.mp4`)
    const randomMs = Date.now() - Math.floor(Math.random() * 30 * 24 * 3600 * 1000)
    const creationTime = new Date(randomMs).toISOString()
    const args = [
      '-nostdin', '-fflags', '+genpts', '-i', srcPath,
      '-map', '0:v:0', '-map', '0:a?',
      '-map_metadata', '-1',
      '-map_chapters', '-1',
      '-vf', v.vf + finalScale,
      '-r', '30',
      '-c:v', 'libx264', '-preset', 'fast',   // 'fast' > 'veryfast' — better quality/size
      '-crf', '20',                             // fixed CRF 20 — 1080p Instagram-safe bitrate
      '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
      '-g', '30', '-keyint_min', '15',          // keyframe every 1s — required by Instagram
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-metadata', `creation_time=${creationTime}`,
      '-movflags', '+faststart',
      '-y', out,
    ]
    const r = await new Promise<{ ok: boolean; outputPath?: string; error?: string }>(resolve => {
      execFile(ffmpegBin, args, { maxBuffer: 100 * 1024 * 1024, timeout: FFMPEG_REMIX_TIMEOUT, killSignal: 'SIGKILL' }, (err) => {
        if (err) return resolve({ ok: false, error: err.message.split('\n').slice(-2).join(' ').slice(0, 200) })
        try {
          if (statSync(out).size < 5000) return resolve({ ok: false, error: 'Sortie vide' })
        } catch { return resolve({ ok: false, error: 'Sortie manquante' }) }
        resolve({ ok: true, outputPath: out })
      })
    })
    results.push(r)
  }

  if (tempSrc) { try { rmSync(tempSrc) } catch { /* ignore */ } }
  return { ok: true, results }
})

// ── IPC: copy a generated file to a user-chosen location (native "Save As") ──
ipcMain.handle('save-file-as', async (_event, opts: { sourcePath: string; defaultName: string }) => {
  try {
    let src = opts.sourcePath
    if (src.startsWith('file://')) src = fileURLToPath(src)
    if (!existsSync(src)) return { ok: false, error: 'Fichier introuvable' }
    const res = await dialog.showSaveDialog(win!, {
      title: 'Enregistrer la vidéo',
      defaultPath: opts.defaultName,
      filters: [{ name: 'Vidéo MOV', extensions: ['mov'] }],
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    copyFileSync(src, res.filePath)
    return { ok: true, path: res.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: Mixer — burn caption text onto a video (native ffmpeg) ──────────────
// Replaces the broken /api/mix-overlay Vercel fetch that doesn't work in
// Electron. Source can be an http(s) signed URL or an absolute local path.
ipcMain.handle('run-ffmpeg-mix-overlay', async (_event, opts: {
  sourcePath: string
  caption:    string
  position:   'top' | 'middle' | 'bottom' | 'custom'
  fontSize:   number
  fontColor:  string
  posX?:      number
  posY?:      number
  gpsSpoof?:  boolean
  gpsCity?:   string
  audioPath?: string   // URL signée d'un MP3 (remplace la piste d'origine)
}) => {
  const ffmpegBin = getFfmpegBin()
  const dir = path.join(os.tmpdir(), 'ig-tracker-mixer')
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }

  // Download remote source to a temp file if needed
  let srcPath = opts.sourcePath
  let tempSrc: string | null = null
  try {
    if (srcPath.startsWith('http://') || srcPath.startsWith('https://')) {
      const res = await net.fetch(srcPath)
      if (!res.ok) return { ok: false, error: `Téléchargement source échoué: ${res.status}` }
      const buf = Buffer.from(await res.arrayBuffer())
      tempSrc = path.join(dir, `src-${Date.now()}.mp4`)
      writeFileSync(tempSrc, buf)
      srcPath = tempSrc
    } else if (srcPath.startsWith('file://')) {
      srcPath = fileURLToPath(srcPath)
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (!existsSync(srcPath)) return { ok: false, error: 'Fichier source introuvable' }

  // Resolve a font file cross-platform (bold for the chunky POV style)
  const fontCandidates = process.platform === 'win32'
    ? ['C:\\Windows\\Fonts\\arialbd.ttf', 'C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\segoeui.ttf']
    : process.platform === 'darwin'
      ? ['/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial Bold.ttf', '/Library/Fonts/Arial.ttf']
      : ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
         '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
         '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
         '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf']
  const fontFile = fontCandidates.find(f => existsSync(f)) ?? null

  function escText(t: string): string {
    return t.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')
             .replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/%/g, '%%')
  }

  // Word-wrap the caption into lines ≤ maxChars.
  // Respects existing newlines in the caption.
  function wrapCaption(text: string, maxChars: number): string[] {
    const lines: string[] = []
    for (const segment of text.split(/\r?\n/)) {
      const words = segment.split(' ')
      let current = ''
      for (const word of words) {
        if (!word) continue
        if (current.length + word.length + (current ? 1 : 0) > maxChars && current) {
          lines.push(current)
          current = word
        } else {
          current = current ? `${current} ${word}` : word
        }
      }
      if (current) lines.push(current)
    }
    return lines.length ? lines : ['']
  }

  // After scale+pad the output is always 1080×1920.
  const VW = 1080, VH = 1920
  const fs   = opts.fontSize
  // Average char width for bold sans-serif at this size (rough but consistent).
  const charW  = fs * 0.58
  // Leave 5% margin on each side → usable width = 90% of VW
  const maxChars = Math.max(10, Math.floor(VW * 0.9 / charW))
  const lines  = wrapCaption(opts.caption, maxChars)
  const lineH  = Math.round(fs * 1.5)   // generous line height
  const totalH = lines.length * lineH

  const isCustom = opts.position === 'custom'
    && Number.isFinite(Number(opts.posX)) && Number.isFinite(Number(opts.posY))
  const startY = isCustom
    ? Math.round(Number(opts.posY) * VH - totalH / 2)
    : opts.position === 'bottom'
      ? VH - totalH - 170
      : opts.position === 'top'
        ? 80
        : Math.round((VH - totalH) / 2)
  // Placement libre : centre le texte sur posX (chaque ligne recentrée sur text_w).
  const xExpr = isCustom
    ? `${Math.round(Number(opts.posX) * VW)}-(text_w/2)`
    : `(w-text_w)/2`

  const borderPx = Math.max(3, Math.round(fs * 0.07))

  const dtFilters = lines.map((line, i) => {
    const y = startY + i * lineH
    const dtParts = [`text='${escText(line)}'`]
    if (fontFile) dtParts.push(`fontfile='${fontFile}'`)
    dtParts.push(
      `x=${xExpr}`,
      `y=${y}`,
      `fontsize=${fs}`,
      `fontcolor=${opts.fontColor}`,
      `borderw=${borderPx}`, `bordercolor=black@1.0`,
      `shadowx=2:shadowy=2:shadowcolor=black@0.8`,
    )
    return `drawtext=${dtParts.join(':')}`
  })

  const vf = [
    `scale=${VW}:${VH}:force_original_aspect_ratio=decrease`,
    `pad=${VW}:${VH}:-1:-1:color=black`,
    `setsar=1`,
    ...dtFilters,
  ].join(',')

  // ── GPS/localisation optionnelle (ISO 6709) — spoof intégré au mix ──────────
  const gpsArgs: string[] = []
  if (opts.gpsSpoof) {
    const CITIES: Record<string, { lat: number; lon: number; tz: string; alt: number }> = {
      newyork: { lat: 40.7128, lon: -74.0060, tz: '-0400', alt: 10 },
      losangeles: { lat: 34.0522, lon: -118.2437, tz: '-0700', alt: 89 },
      miami: { lat: 25.7617, lon: -80.1918, tz: '-0400', alt: 2 },
      lasvegas: { lat: 36.1699, lon: -115.1398, tz: '-0700', alt: 610 },
      paris: { lat: 48.8566, lon: 2.3522, tz: '+0200', alt: 35 },
      london: { lat: 51.5074, lon: -0.1278, tz: '+0100', alt: 11 },
      dubai: { lat: 25.2048, lon: 55.2708, tz: '+0400', alt: 5 },
      tokyo: { lat: 35.6762, lon: 139.6503, tz: '+0900', alt: 40 },
    }
    const US = ['newyork', 'losangeles', 'miami', 'lasvegas']
    const keys = Object.keys(CITIES)
    const sel = opts.gpsCity ?? 'random'
    const wide = sel === 'random_usa'
    const key = wide ? US[Math.floor(Math.random() * US.length)]
      : (CITIES[sel] ? sel : keys[Math.floor(Math.random() * keys.length)])
    const c = CITIES[key]
    const amp = wide ? 0.5 : 0.006
    const lat = (c.lat + (Math.random() - 0.5) * amp * 2).toFixed(6)
    const lon = (c.lon + (Math.random() - 0.5) * amp * 2).toFixed(6)
    const alt = (c.alt + (Math.random() - 0.5) * 8).toFixed(3)
    const sLat = `${Number(lat) >= 0 ? '+' : '-'}${Math.abs(Number(lat)).toFixed(6).padStart(9, '0')}`
    const sLon = `${Number(lon) >= 0 ? '+' : '-'}${Math.abs(Number(lon)).toFixed(6).padStart(10, '0')}`
    const sAlt = `${Number(alt) >= 0 ? '+' : '-'}${Math.abs(Number(alt)).toFixed(3).padStart(7, '0')}`
    const iso = `${sLat}${sLon}${sAlt}/`
    gpsArgs.push(
      '-metadata', `location=${iso}`,
      '-metadata', `location-eng=${iso}`,
      '-metadata', `com.apple.quicktime.location.ISO6709=${iso}`,
    )
  }

  // ── Piste audio MP3 optionnelle : télécharge l'URL signée puis remplace l'audio ─
  let audioSrc: string | null = null
  if (opts.audioPath) {
    try {
      if (/^https?:\/\//.test(opts.audioPath)) {
        const ares = await net.fetch(opts.audioPath)
        if (ares.ok) {
          audioSrc = path.join(dir, `mixaudio-${Date.now()}.mp3`)
          writeFileSync(audioSrc, Buffer.from(await ares.arrayBuffer()))
        }
      } else if (existsSync(opts.audioPath)) {
        audioSrc = opts.audioPath
      }
    } catch { audioSrc = null }
  }

  const out = path.join(dir, `mixer-${Date.now()}.mov`)
  const inputArgs = audioSrc
    ? ['-i', srcPath, '-stream_loop', '-1', '-i', audioSrc]
    : ['-i', srcPath]
  const mapArgs = audioSrc
    ? ['-map', '0:v:0', '-map', '1:a:0', '-shortest']
    : ['-map', '0:v:0', '-map', '0:a?']
  const args = [
    '-nostdin', '-fflags', '+genpts', ...inputArgs,
    ...mapArgs,
    '-map_metadata', '-1', '-map_chapters', '-1',
    '-vf', vf,
    '-r', '30', '-fps_mode', 'cfr',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
    '-g', '30', '-keyint_min', '15',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    ...gpsArgs,
    '-movflags', gpsArgs.length ? 'use_metadata_tags+faststart' : '+faststart',
    '-y', out,
  ]

  return new Promise(resolve => {
    execFile(ffmpegBin, args, { maxBuffer: 100 * 1024 * 1024, timeout: FFMPEG_REMIX_TIMEOUT, killSignal: 'SIGKILL' }, (err, _stdout, stderr) => {
      if (tempSrc) { try { rmSync(tempSrc) } catch { /* ignore */ } }
      if (audioSrc && audioSrc.startsWith(dir)) { try { rmSync(audioSrc) } catch { /* ignore */ } }
      if (err) {
        const detail = (stderr ?? '').split('\n').filter((l: string) => /error|invalid/i.test(l)).slice(-2).join(' ')
        return resolve({ ok: false, error: err.message.split('\n')[0] + (detail ? ` — ${detail.slice(0, 160)}` : '') })
      }
      try {
        if (statSync(out).size < 5000) return resolve({ ok: false, error: 'Sortie vide' })
      } catch { return resolve({ ok: false, error: 'Sortie manquante' }) }
      resolve({ ok: true, outputPath: out })
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

      const sorted  = [...valid].sort((a, b) => b.dist - a.dist)
      const maxDist = sorted[0].dist

      // Require a genuine background/location change: avg RGB must jump ≥ 20 units.
      // Minor motion, lighting flicker, or camera pan → dist < 20 → not a real scene cut.
      const SCENE_MIN_DIST = 20
      console.log('[scene-detect] maxDist=', maxDist.toFixed(1), 'threshold=', SCENE_MIN_DIST)

      if (maxDist < SCENE_MIN_DIST) {
        return resolve({ ok: false, times: [], duration, error: `Pas de changement de décor significatif (Δ=${maxDist.toFixed(1)} < ${SCENE_MIN_DIST})` })
      }

      // Cut on the FIRST real scene change: among frames whose diff clears the
      // threshold, pick the earliest in time (not the biggest). The cut must land
      // the moment the original video first changes scene.
      const candidates = valid.filter(d => d.dist >= SCENE_MIN_DIST)
      const times = candidates.map(d => d.time).sort((a, b) => a - b)
      const best  = times[0]

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
      `[0:v]fps=30,trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_new]`,
      `[ov_a]fps=30,trim=end=${opts.splitTime},setpts=PTS-STARTPTS,${scl},lumakey=threshold=0:tolerance=${lkTol}:softness=0.05[text_key]`,
      `[v_new][text_key]overlay=format=auto[v_blended]`,
      `[ov_b]fps=30,trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
      `[ao1]atrim=end=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
      `[ao2]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
      `[v_blended][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
    ].join(';')
  } else {
    // No blend — new video visuals for phase 1, original audio throughout
    filterComplex = [
      `[0:v]fps=30,trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p1]`,
      `[1:v]fps=30,trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
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
    '-r', '30', '-fps_mode', 'cfr',
    '-g', '30', '-keyint_min', '15',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'main', '-level', '4.0',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
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

  function hasEmoji(t: string): boolean {
    // Match emoji Unicode ranges (basic emoji + extended)
    return /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{1F300}-\u{1F9FF}]|\u{FE0F}/u.test(t)
  }

  const EMOJI_FONT = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'

  // Build drawtext chain (comma-separated, applied after scale)
  const drawtextChain = opts.textOverlays.map(ov => {
    // Use NotoColorEmoji when text contains emoji — FFmpeg 6+ with libharfbuzz renders color emoji
    const useEmoji = hasEmoji(ov.text) && existsSync(EMOJI_FONT)
    const fontFile = useEmoji ? EMOJI_FONT : findFont(ov.bold)
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

  // fps=30 BEFORE scale normalises VFR input (GeeLark recordings are often VFR).
  // Without this, timestamp gaps in VFR clips cause frozen frames at concat boundaries.
  const vfPhase1 = opts.textOverlays.length > 0 ? `fps=30,${scl},${drawtextChain}` : `fps=30,${scl}`
  const vfPhase2 = `fps=30,${scl}`

  // Validate splitTime — undefined/NaN/0 means we can't concat, so just re-encode phase1 alone
  const splitTime = (opts.splitTime != null && !isNaN(opts.splitTime) && opts.splitTime > 0)
    ? opts.splitTime
    : null

  // Common output flags (WITHOUT the output path — must be last)
  const commonOutputFlags = [
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-r', '30', '-fps_mode', 'cfr',        // force constant 30 fps output
    '-g', '30', '-keyint_min', '15',        // keyframe every 1s — required by Instagram
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'main', '-level', '4.0', // Instagram-safe H.264 profile
    '-bf', '2',                             // max 2 B-frames — keeps file small, stays compatible
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
    '-max_muxing_queue_size', '9999',
  ]

  let args: string[]

  if (!splitTime) {
    // No valid split point — re-encode secondary clip with original audio
    const origHasAudio0 = await hasAudioStream(ffmpegBin, opts.originalPath)
    if (origHasAudio0) {
      args = [
        '-nostdin',
        '-i', opts.newPhase1Path,
        '-i', opts.originalPath,
        '-filter_complex', `[0:v]setpts=PTS-STARTPTS,${vfPhase1}[vout];[1:a]${afmt}[aout]`,
        '-map', '[vout]', '-map', '[aout]',
        ...commonOutputFlags,
        '-c:a', 'aac', '-b:a', '128k',
        ...(opts.targetDuration != null ? ['-t', String(opts.targetDuration)] : []),
        '-y', opts.outputPath,
      ]
    } else {
      args = [
        '-nostdin',
        '-i', opts.newPhase1Path,
        '-vf', `setpts=PTS-STARTPTS,${vfPhase1}`,
        ...commonOutputFlags,
        '-an',
        ...(opts.targetDuration != null ? ['-t', String(opts.targetDuration)] : []),
        '-y', opts.outputPath,
      ]
    }
  } else {
    // Probe original for audio so we don't hang on a missing audio stream
    const origHasAudio = await hasAudioStream(ffmpegBin, opts.originalPath)

    let filterComplex: string
    let mapArgs: string[]
    let audioEncArgs: string[]

    // Input layout:
    //  [0] secondary  — read up to splitTime via -t
    //  [1] original   — full file; trim filter used for both video phase 2 AND audio
    //
    // We use the trim filter (not fast-seek -ss) for phase 2 video because fast-seek
    // jumps to the nearest keyframe BEFORE splitTime, producing incorrect PTS on the
    // first decoded frames → visible freeze at the cut point.
    // trim= is frame-accurate: it decodes from the start but discards frames before
    // splitTime, so the concat boundary is clean.
    if (origHasAudio) {
      filterComplex = [
        `[0:v]setpts=PTS-STARTPTS,${vfPhase1}[v_p1]`,
        `[1:v]fps=30,trim=start=${splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[1:a]asplit=2[ao1][ao2]`,
        `[ao1]atrim=end=${splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
        `[ao2]atrim=start=${splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
        `[v_p1][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`,
      ].join(';')
      mapArgs      = ['-map', '[vout]', '-map', '[aout]']
      audioEncArgs = ['-c:a', 'aac', '-b:a', '128k']
    } else {
      filterComplex = [
        `[0:v]setpts=PTS-STARTPTS,${vfPhase1}[v_p1]`,
        `[1:v]fps=30,trim=start=${splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[v_p1][v_p2]concat=n=2:v=1:a=0[vout]`,
      ].join(';')
      mapArgs      = ['-map', '[vout]']
      audioEncArgs = ['-an']
    }

    args = [
      '-nostdin',
      '-t', String(splitTime), '-i', opts.newPhase1Path,  // [0] secondary up to splitTime
      '-i', opts.originalPath,                              // [1] full original (video + audio)
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
    filters: [{ name: 'Vidéo MOV', extensions: ['mov'] }],
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
        model:      opts.model ?? 'llama-3.1-8b-instant',
        messages:   opts.messages,
        max_tokens: opts.maxTokens ?? 400,
      }),
    })
    if (!response.ok) {
      let errMsg = `Erreur HTTP ${response.status}`
      try {
        const errData = await response.json() as { error?: { message?: string } }
        if (errData?.error?.message) errMsg = errData.error.message
      } catch {}
      return { ok: false, error: errMsg }
    }
    const data = await response.json()
    return { ok: true, data }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: Groq Whisper audio transcription (multipart, bypasses renderer CORS) ─
ipcMain.handle('groq-transcription', async (_event, opts: {
  apiKey:     string
  audioBytes?: ArrayBuffer
  videoUrl?:  string    // bank URL — main process downloads it (avoids renderer CORS)
  filename:   string
  language?:  string
}) => {
  try {
    let buf: Buffer
    if (opts.videoUrl) {
      const res = await net.fetch(opts.videoUrl)
      if (!res.ok) return { ok: false, error: `Téléchargement vidéo échoué (${res.status})` }
      buf = Buffer.from(await res.arrayBuffer())
    } else if (opts.audioBytes) {
      buf = Buffer.from(opts.audioBytes)
    } else {
      return { ok: false, error: 'Aucune source audio (audioBytes ou videoUrl requis)' }
    }
    const boundary = `----GBoundary${Date.now()}`
    const ext = opts.filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'mp4'
    const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'webm' ? 'audio/webm' : 'video/mp4'

    const parts: Buffer[] = []
    function addField(name: string, value: string) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
    }
    addField('model', 'whisper-large-v3-turbo')
    addField('response_format', 'verbose_json')
    addField('timestamp_granularities[]', 'word')
    if (opts.language) addField('language', opts.language)
    // audio file part
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${opts.filename}"\r\nContent-Type: ${mime}\r\n\r\n`))
    parts.push(buf)
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

    const body = Buffer.concat(parts)
    const response = await net.fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    } as Parameters<typeof net.fetch>[1])

    if (!response.ok) {
      const txt = await response.text().catch(() => '')
      return { ok: false, error: `Groq ${response.status}: ${txt.slice(0, 300)}` }
    }
    const data = await response.json()
    return { ok: true, data }
  } catch (err) {
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

  // While a mass posting run is active: hide to tray instead of closing the app.
  // The renderer process (and its timers/loops) keeps running; phones get stopped
  // normally and results log as usual. The tray icon lets the user come back.
  win.on('close', (event) => {
    if (isMassPostingRunning) {
      event.preventDefault()
      win?.hide()
    }
  })

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

// ── IPC: burn timed subtitles into a video via native FFmpeg ─────────────────
ipcMain.handle('run-ffmpeg-subtitles', async (_event, opts: {
  sourcePath: string
  segments:   Array<{ text: string; start: number; end: number }>
  fontSize:   number
  fontColor:  string
  position:   'top' | 'center' | 'bottom'
  style:      'box' | 'outline' | 'shadow'
  preset?:    '9:16' | '1:1' | '16:9' | 'keep'
}) => {
  const ffmpegBin = getFfmpegBin()
  const dir = path.join(os.tmpdir(), 'ig-tracker-subtitles')
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }

  let srcPath = opts.sourcePath
  let tempSrc: string | null = null
  try {
    if (srcPath.startsWith('http://') || srcPath.startsWith('https://')) {
      const res = await net.fetch(srcPath)
      if (!res.ok) return { ok: false, error: `Téléchargement source: ${res.status}` }
      tempSrc = path.join(dir, `src-${Date.now()}.mp4`)
      writeFileSync(tempSrc, Buffer.from(await res.arrayBuffer()))
      srcPath = tempSrc
    } else if (srcPath.startsWith('file://')) {
      srcPath = fileURLToPath(srcPath)
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (!existsSync(srcPath)) return { ok: false, error: 'Fichier source introuvable' }

  const fontCandidates = process.platform === 'win32'
    ? ['C:\\Windows\\Fonts\\arialbd.ttf', 'C:\\Windows\\Fonts\\arial.ttf']
    : process.platform === 'darwin'
      ? ['/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial Bold.ttf', '/Library/Fonts/Arial.ttf']
      : ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
         '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
         '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
         '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf']
  const fontFile = fontCandidates.find(f => existsSync(f)) ?? null

  function escText(t: string): string {
    return t.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')
             .replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/%/g, '%%')
  }

  const posYExpr = opts.position === 'top'
    ? `(${opts.fontSize * 2})`
    : opts.position === 'center'
      ? `(h/2-text_h/2)`
      : `(h-text_h-${Math.round(opts.fontSize * 1.5)})`

  const borderPx = Math.max(3, Math.round(opts.fontSize * 0.08))

  const drawtextChain = opts.segments.map(seg => {
    const parts = [`text='${escText(seg.text)}'`]
    if (fontFile) parts.push(`fontfile='${fontFile}'`)
    parts.push(`x=(w-text_w)/2`, `y=${posYExpr}`)
    parts.push(`fontsize=${opts.fontSize}`, `fontcolor=${opts.fontColor}`)
    if (opts.style === 'box') {
      parts.push(`box=1:boxcolor=black@0.82:boxborderw=${borderPx * 2}`)
    } else {
      parts.push(`borderw=${borderPx}:bordercolor=black@1.0`)
      if (opts.style === 'shadow') parts.push(`shadowx=4:shadowy=4:shadowcolor=black@0.7`)
    }
    parts.push(`enable='between(t,${seg.start},${seg.end})'`)
    return `drawtext=${parts.join(':')}`
  }).join(',')

  const preset = opts.preset ?? 'keep'
  const scaleFilter = preset === 'keep'
    ? 'setsar=1'
    : preset === '9:16'
      ? 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black,setsar=1'
      : preset === '1:1'
        ? 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:-1:-1:color=black,setsar=1'
        : 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,setsar=1'

  const vf = opts.segments.length > 0
    ? `${scaleFilter},${drawtextChain}`
    : scaleFilter

  const out = path.join(dir, `subs-${Date.now()}.mov`)
  const args = [
    '-nostdin', '-i', srcPath,
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-r', '30', '-fps_mode', 'cfr',
    '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
    '-g', '30', '-keyint_min', '15',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-movflags', '+faststart',
    '-y', out,
  ]

  return new Promise(resolve => {
    execFile(ffmpegBin, args, { maxBuffer: 200 * 1024 * 1024, timeout: FFMPEG_REMIX_TIMEOUT, killSignal: 'SIGKILL' }, (err, _stdout, stderr) => {
      if (tempSrc) { try { rmSync(tempSrc) } catch { /* ignore */ } }
      if (err) {
        const detail = (stderr ?? '').split('\n').filter((l: string) => /error|invalid/i.test(l)).slice(-2).join(' ')
        return resolve({ ok: false, error: err.message.split('\n')[0] + (detail ? ` — ${detail.slice(0, 200)}` : '') })
      }
      try {
        if (statSync(out).size < 5000) return resolve({ ok: false, error: 'Sortie vide' })
      } catch { return resolve({ ok: false, error: 'Sortie manquante' }) }
      resolve({ ok: true, outputPath: out })
    })
  })
})

// Stop any GeeLark phones still running when the app quits (prevents billing for idle phones).
// Uses a sync-like pattern: preventDefault → async stop → re-quit.
let geelarkQuitInProgress = false
app.on('before-quit', async (e) => {
  if (geelarkQuitInProgress || geelarkRunningPhones.size === 0 || !geelarkBearer) return
  e.preventDefault()
  geelarkQuitInProgress = true
  const ids = [...geelarkRunningPhones]
  geelarkRunningPhones.clear()
  try {
    await net.fetch('https://openapi.geelark.com/open/v1/phone/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${geelarkBearer}` },
      body: JSON.stringify({ ids }),
    })
  } catch { /* ignore — best-effort */ }
  app.quit()
})

app.on('window-all-closed', () => {
  // Don't quit while a mass posting run is in progress — the window is just hidden
  if (process.platform !== 'darwin' && !isMassPostingRunning) { app.quit(); win = null }
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
