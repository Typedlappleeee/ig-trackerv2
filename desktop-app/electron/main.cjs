// Process principal Electron — ouvre l'app sur la page de connexion.
// webSecurity:false : le runtime du prototype (support.js) charge le contenu .dc.html
// via fetch ; en file:// il faut lever la restriction CORS locale.
const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#07060B',
    title: 'ScaleFlow',
    icon: path.join(__dirname, '..', 'dist', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      webSecurity: false,
      contextIsolation: true,
    },
  })
  // On démarre sur la page de connexion.
  win.loadFile(path.join(__dirname, '..', 'dist', 'login.dc.html'))

  // Les liens externes (Telegram, docs…) s'ouvrent dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
