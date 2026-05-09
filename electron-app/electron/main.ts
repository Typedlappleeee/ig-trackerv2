import { app, BrowserWindow, shell, ipcMain, net, dialog, session } from 'electron'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null = null

// ── Instagram persistent hidden browser ───────────────────────────────────────
// Reused across calls so session cookies accumulate (GDPR consent accepted once,
// rate-limit cookies carried over). A new browser is created only if the old one
// is destroyed.
let _igBrowser: BrowserWindow | null = null

function getIgBrowser(): BrowserWindow {
  if (!_igBrowser || _igBrowser.isDestroyed()) {
    _igBrowser = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        webSecurity: true,
        sandbox: false,
      },
    })
    _igBrowser.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )
    _igBrowser.on('closed', () => { _igBrowser = null })
  }
  return _igBrowser
}

// Fetch Instagram profile HTML via the persistent hidden browser.
// Handles the GDPR cookie-consent page that Instagram shows to fresh sessions:
//   1. did-stop-loading fires → check for consent modal → click "Allow all"
//   2. Instagram reloads → did-stop-loading fires again → extract profile HTML
// Using `on` (not `once`) so we see all navigation events from a single loadURL call.
ipcMain.handle('fetch-instagram-html', async (_event, username: string) => {
  const browser = getIgBrowser()
  const url = `https://www.instagram.com/${encodeURIComponent(username)}/`

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

    const globalTimer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 32000)

    const extractHtml = async () => {
      if (settled || browser.isDestroyed()) return
      try {
        const data = await browser.webContents.executeJavaScript(`({
          url: location.href,
          html: document.documentElement.innerHTML.slice(0, 200000)
        })`)
        finish({ ok: true, ...(data as object) })
      } catch (e) {
        finish({ ok: false, error: String(e) })
      }
    }

    const onLoad = async () => {
      if (settled || browser.isDestroyed()) return
      loadCount++
      if (loadCount > 5) { finish({ ok: false, error: 'too many navigations' }); return }

      // Wait for SPA/React render (shorter on subsequent loads which already have cookies)
      await new Promise(r => setTimeout(r, loadCount === 1 ? 2500 : 3500))
      if (settled || browser.isDestroyed()) return

      // Detect and click GDPR cookie-consent button (Instagram in Europe)
      const accepted = await browser.webContents.executeJavaScript(`
        (() => {
          // Try known data-attribute selectors first
          const byAttr = document.querySelector('[data-cookiebanner="accept_button"]')
            || document.querySelector('[data-testid="cookie-policy-manage-dialog-accept-button"]')
          if (byAttr) { byAttr.click(); return true }

          // Text-based fallback: find any visible button whose text matches "accept all" variants
          const btn = [...document.querySelectorAll('button')].find(b => {
            const t = (b.textContent || '').trim().toLowerCase()
            return t === 'allow all cookies'
              || t === 'allow all'
              || t === 'accept all'
              || t === 'autoriser tout'
              || t === 'tout accepter'
              || t === 'autoriser tous les cookies'
              || t === 'allow essential and optional cookies'
          })
          if (btn) { btn.click(); return true }
          return false
        })()
      `).catch(() => false)

      if (accepted && !settled) {
        // Consent was clicked. Instagram will either:
        //   A) Reload the same URL (new did-stop-loading will fire → onLoad handles it)
        //   B) Update the page in-place (no reload → we extract after waiting)
        // Wait to see which case applies; if a new navigation fires first, it will
        // call extractHtml via onLoad, making settled=true, and the timeout below is a no-op.
        await new Promise(r => setTimeout(r, 5000))
        if (!settled) await extractHtml()
      } else if (!settled) {
        // No consent button → this is the actual profile page
        await extractHtml()
      }
    }

    browser.webContents.on('did-stop-loading', onLoad)

    browser.loadURL(url, {
      extraHeaders: [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8',
      ].join('\r\n'),
    }).catch(err => finish({ ok: false, error: String(err) }))
  })
})

// ── IPC: proxy HTTP requests from renderer (bypass CORS) ───────────────────
ipcMain.handle('geelark-request', async (_event, opts: {
  method: 'GET' | 'POST' | 'PUT'
  url: string
  headers?: Record<string, string>
  body?: unknown
  isText?: boolean
}) => {
  try {
    // Strip any Referer the caller set — Electron's network delegate rejects
    // cross-origin referrers (e.g. www.instagram.com → i.instagram.com) before
    // the request even leaves the process. Let the network layer omit it.
    const { Referer: _r, referer: _r2, Origin: _o, origin: _o2, ...safeHeaders } = opts.headers ?? {}
    const response = await net.fetch(opts.url, {
      method: opts.method,
      headers: { 'Content-Type': 'application/json', ...safeHeaders },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      referrerPolicy: 'no-referrer',
    } as RequestInit)
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
      body: JSON.stringify({ fileType: 'video' }),
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
// Uses session.defaultSession.fetch so Instagram session cookies are included,
// allowing CDN thumbnails to load after the hidden browser has visited a profile.
ipcMain.handle('fetch-image', async (_event, opts: { url: string; headers?: Record<string, string> }) => {
  try {
    const response = await session.defaultSession.fetch(opts.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...(opts.headers ?? {}),
      },
    })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const b64 = Buffer.from(buffer).toString('base64')
    return { ok: true, dataUrl: `data:${contentType};base64,${b64}` }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
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
    },
    titleBarStyle: 'default',
    frame: true,
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => { win?.show() })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { app.quit(); win = null }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(createWindow)
