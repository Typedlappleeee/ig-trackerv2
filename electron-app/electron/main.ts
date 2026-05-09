import { app, BrowserWindow, shell, ipcMain, net } from 'electron'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null = null

// ── IPC: proxy HTTP requests from renderer to bypass CORS ───────────────────
// GéeLark API calls must come from the main process (not the browser renderer)
// because the renderer is subject to CORS restrictions.

ipcMain.handle('geelark-request', async (_event, opts: {
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  body?: unknown
}) => {
  try {
    const response = await net.fetch(opts.url, {
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    const data = await response.json()
    return { ok: true, status: response.status, data }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
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

  win.once('ready-to-show', () => {
    win?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
