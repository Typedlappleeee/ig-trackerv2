import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Chemins importants
process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#080b14',  // Fond sombre dès l'ouverture
    show: false,                  // On attend que la page soit chargée
    webPreferences: {
      preload: (() => {
        const p = path.join(__dirname, 'preload.mjs')
        return existsSync(p) ? p : undefined
      })(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    // Style de la fenêtre
    titleBarStyle: 'default',
    frame: true,
  })

  // Ouvre les liens externes dans le navigateur système (pas dans Electron)
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Affiche la fenêtre quand la page est prête (évite le flash blanc)
  win.once('ready-to-show', () => {
    win?.show()
  })

  // En développement : charge le serveur Vite local
  // En production : charge le fichier HTML buildé
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools() // Ouvre les DevTools en dev
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quand toutes les fenêtres sont fermées → quitter l'app (sauf macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

// macOS : rouvrir la fenêtre si on clique sur l'icône du dock
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Démarrer l'app
app.whenReady().then(createWindow)
